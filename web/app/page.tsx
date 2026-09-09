"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { PREDICTED_RISK_COUNT } from "@/lib/domain";
import type { Detection, GeneralFinding, PredictedRisk, TaskAnalysis } from "@/lib/domain";
import type { VerifiedMoreHelp } from "@/lib/ai/types";
import { hintKey, reconcileDetections } from "@/lib/hints";

type AnalysisResponse = {
  task: TaskAnalysis;
  highPriority: Array<PredictedRisk & { name: string }>;
  profileSummary: { patternCount: number; historyEssayCount: number | null };
};
type FinalReviewOccurrence = { textSpan: string; hint: string };
type FinalReviewItem = {
  patternId: string;
  name: string;
  rule: string;
  occurrences: FinalReviewOccurrence[];
};
type FinalReview = {
  appeared: FinalReviewItem[];
  avoided: FinalReviewItem[];
  unpredicted: FinalReviewItem[];
  reviewNext: FinalReviewItem[];
  generalFindings: GeneralFinding[];
};
type Drawer = "profile" | "review" | null;

async function postEvent(sessionId: string, type: "hint_dismissed" | "pattern_resolved", payload: Record<string, unknown> = {}) {
  if (!sessionId) return;
  await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, type, payload }),
  }).catch(() => undefined);
}

function occurrenceLabel(count: number) {
  return `${count} ${count === 1 ? "occurrence" : "occurrences"}`;
}

function ExpandedHelp({ help }: { help: VerifiedMoreHelp }) {
  if (help.verification === "unconfirmed") {
    return <div className="expanded-help is-unconfirmed"><p><span>Detailed check</span>{help.explanation}</p></div>;
  }
  return <div className="expanded-help"><p><span>Why this was flagged</span>{help.explanation}</p><p><span>One corrected version</span>“{help.correction}”</p></div>;
}

function generalFindingKey(finding: GeneralFinding) {
  return `${finding.category}:${finding.textSpan}`;
}

function GeneralFindingList({
  items,
  revealed,
  onReveal,
}: {
  items: GeneralFinding[];
  revealed: Record<string, true>;
  onReveal: (finding: GeneralFinding) => void;
}) {
  if (items.length === 0) return <p className="quiet">No additional high-confidence issues were found.</p>;
  return <ol className="review-occurrences general-findings">{items.map((finding, index) => {
    const key = generalFindingKey(finding);
    const isRevealed = Boolean(revealed[key]);
    return <li key={`${key}-${index}`}>
      <div className="review-pattern-heading"><strong>{finding.category}</strong><span>New finding</span></div>
      <p className="span">“{finding.textSpan}”</p>
      <p>{finding.hint}</p>
      {isRevealed && <div className="expanded-help"><p><span>Why this was flagged</span>{finding.explanation}</p><p><span>One corrected version</span>“{finding.correction}”</p></div>}
      <button type="button" className="text-button more-help-button" onClick={() => onReveal(finding)}>{isRevealed ? "Explanation shown" : "Show explanation & correction"}</button>
    </li>;
  })}</ol>;
}

function ReviewList({
  items,
  empty,
  moreHelp,
  moreHelpLoading,
  onRequestMoreHelp,
}: {
  items: FinalReviewItem[];
  empty: string;
  moreHelp: Record<string, VerifiedMoreHelp>;
  moreHelpLoading: string | null;
  onRequestMoreHelp: (detection: Detection) => void;
}) {
  if (items.length === 0) return <p className="quiet">{empty}</p>;
  return <ol className="review-list">{items.map((item) => <li key={item.patternId}>
    <div className="review-pattern-heading"><strong>{item.name} <small>{item.patternId}</small></strong>{item.occurrences.length > 0 && <span>{occurrenceLabel(item.occurrences.length)}</span>}</div>
    <p className="review-rule">{item.rule}</p>
    {item.occurrences.length > 0 && <ol className="review-occurrences">{item.occurrences.map((occurrence, index) => {
      const detection = { patternId: item.patternId, detected: true as const, textSpan: occurrence.textSpan, hint: occurrence.hint };
      const key = hintKey(detection);
      const help = moreHelp[key];
      return <li key={`${item.patternId}-${index}-${occurrence.textSpan}`}>
        <p className="span">“{occurrence.textSpan}”</p>
        <p>{occurrence.hint}</p>
        {help && <ExpandedHelp help={help} />}
        <button type="button" className="text-button more-help-button" disabled={moreHelpLoading === key} onClick={() => onRequestMoreHelp(detection)}>{moreHelpLoading === key ? "Loading…" : help ? "Explanation shown" : "Show explanation & correction"}</button>
      </li>;
    })}</ol>}
  </li>)}</ol>;
}

export default function MentorWorkspace() {
  const sessionId = useRef("");
  const previousWriting = useRef("");
  const detectionsRef = useRef<Detection[]>([]);
  const dismissedHintKeys = useRef(new Set<string>());
  const validationAbortController = useRef<AbortController | null>(null);
  const validationRequest = useRef(0);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [writing, setWriting] = useState("");
  const [task, setTask] = useState<TaskAnalysis | null>(null);
  const [risks, setRisks] = useState<AnalysisResponse["highPriority"]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [moreHelp, setMoreHelp] = useState<Record<string, VerifiedMoreHelp>>({});
  const [moreHelpLoading, setMoreHelpLoading] = useState<string | null>(null);
  const [revealedGeneralFindings, setRevealedGeneralFindings] = useState<Record<string, true>>({});
  const [openDrawer, setOpenDrawer] = useState<Drawer>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [finalReview, setFinalReview] = useState<FinalReview | null>(null);
  const [error, setError] = useState("");
  const [profileSummary, setProfileSummary] = useState<AnalysisResponse["profileSummary"] | null>(null);

  useEffect(() => { sessionId.current = crypto.randomUUID(); }, []);

  useEffect(() => {
    if (!task || risks.length !== PREDICTED_RISK_COUNT || writing.trim().length < 40) return;
    const timeout = window.setTimeout(async () => {
      if (writing === previousWriting.current) return;
      previousWriting.current = writing;
      validationAbortController.current?.abort();
      const controller = new AbortController();
      validationAbortController.current = controller;
      const requestId = ++validationRequest.current;
      setIsValidating(true);
      try {
        const response = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current, writing, task, risks }),
          signal: controller.signal,
        });
        const data = await response.json() as { detections?: Detection[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Validation could not be completed.");
        const reconciliation = reconcileDetections(detectionsRef.current, data.detections ?? [], dismissedHintKeys.current);
        detectionsRef.current = reconciliation.active;
        setDetections(reconciliation.active);
        reconciliation.resolved.forEach((detection) => {
          void postEvent(sessionId.current, "pattern_resolved", { patternId: detection.patternId, textSpan: detection.textSpan });
        });
      } catch (validationError) {
        if (validationError instanceof DOMException && validationError.name === "AbortError") return;
        setError(validationError instanceof Error ? validationError.message : "Validation could not be completed.");
      } finally {
        if (validationRequest.current === requestId) setIsValidating(false);
      }
    }, 2_500);
    return () => {
      window.clearTimeout(timeout);
      validationAbortController.current?.abort();
    };
  }, [writing, task, risks]);

  async function analyzeTask(event: FormEvent) {
    event.preventDefault();
    setError("");
    detectionsRef.current = [];
    dismissedHintKeys.current.clear();
    setDetections([]);
    setMoreHelp({});
    setRevealedGeneralFindings({});
    setFinalReview(null);
    setOpenDrawer(null);
    validationAbortController.current?.abort();
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, taskPrompt }),
      });
      const data = await response.json() as AnalysisResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Task analysis could not be completed.");
      setTask(data.task);
      setRisks(data.highPriority);
      setProfileSummary(data.profileSummary);
      previousWriting.current = "";
    } catch (analysisError) {
      setTask(null);
      setRisks([]);
      setError(analysisError instanceof Error ? analysisError.message : "Task analysis could not be completed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function onWritingChange(value: string) {
    setWriting(value);
    if (finalReview) {
      setFinalReview(null);
      setRevealedGeneralFindings({});
      if (openDrawer === "review") setOpenDrawer(null);
    }
  }

  function dismissHint(detection: Detection) {
    dismissedHintKeys.current.add(hintKey(detection));
    const next = detectionsRef.current.filter((item) => hintKey(item) !== hintKey(detection));
    detectionsRef.current = next;
    setDetections(next);
    void postEvent(sessionId.current, "hint_dismissed", { patternId: detection.patternId, textSpan: detection.textSpan });
  }

  async function requestMoreHelp(detection: Detection) {
    if (!task) return;
    const key = hintKey(detection);
    if (moreHelp[key]) return;
    setMoreHelpLoading(key);
    try {
      const response = await fetch("/api/more-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, task, detection, writing }),
      });
      const data = await response.json() as { moreHelp?: VerifiedMoreHelp; error?: string };
      if (!response.ok || !data.moreHelp) throw new Error(data.error ?? "More help could not be completed.");
      setMoreHelp((current) => ({ ...current, [key]: data.moreHelp! }));
    } catch (moreHelpError) {
      setError(moreHelpError instanceof Error ? moreHelpError.message : "More help could not be completed.");
    } finally {
      setMoreHelpLoading(null);
    }
  }

  async function completeEssay() {
    if (!task || risks.length !== PREDICTED_RISK_COUNT || writing.trim().length < 40) return;
    if (finalReview) {
      setOpenDrawer("review");
      return;
    }
    setError("");
    validationAbortController.current?.abort();
    setIsReviewing(true);
    try {
      const response = await fetch("/api/final-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, writing, task, risks }),
      });
      const data = await response.json() as FinalReview & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Final review could not be completed.");
      setFinalReview(data);
      setRevealedGeneralFindings({});
      setOpenDrawer(null);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Final review could not be completed.");
    } finally {
      setIsReviewing(false);
    }
  }

  const activeDetection = detections[0];
  const wordCount = writing.trim() ? writing.trim().split(/\s+/).length : 0;
  const finalOccurrenceCount = finalReview
    ? finalReview.reviewNext.reduce((count, item) => count + item.occurrences.length, 0) + finalReview.generalFindings.length
    : 0;

  return (
    <main className="workspace">
      <header className="masthead">
        <div>
          <p className="eyebrow">ErrorEcho · Personal writing workspace · Milestone 1</p>
          <h1>ErrorEcho</h1>
        </div>
        <p className="method-note">Selective tutoring, not autocomplete.<br />Your writing is never edited automatically.</p>
      </header>

      <section className="task-zone" aria-labelledby="task-heading">
        <div className="section-label"><span>01</span><h2 id="task-heading">Current IELTS task</h2></div>
        <form onSubmit={analyzeTask}>
          <label className="sr-only" htmlFor="task-prompt">Paste an IELTS task prompt</label>
          <textarea id="task-prompt" value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="Paste the Task 1 or Task 2 prompt here…" rows={5} />
          <div className="task-actions">
            <p>{task ? task.taskType + " · " + task.subtype.replaceAll("_", " ") + " · " + task.timeOrientation + " orientation" : "Analyze the task before you begin writing."}</p>
            <button type="submit" disabled={isAnalyzing || taskPrompt.trim().length < 20}>{isAnalyzing ? "Analyzing…" : "Analyze task"}</button>
          </div>
        </form>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="studio-grid">
        <section className="editor-zone" aria-labelledby="editor-heading">
          <div className="section-label"><span>02</span><h2 id="editor-heading">Writing editor</h2>{task && <em>{isValidating ? "Checking your selected patterns…" : "Monitoring recurring patterns"}</em>}</div>
          <label className="sr-only" htmlFor="writing">Write your response</label>
          <textarea id="writing" className="writing-editor" value={writing} onChange={(event) => onWritingChange(event.target.value)} disabled={!task} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder={task ? "Start writing. After a short pause, the mentor checks only your four selected personal patterns." : "Analyze an IELTS task first to begin writing."} />
          <div className="editor-footer">
            <span>{wordCount} words</span>
            <div className="finish-actions"><span>{finalReview ? "Review ready in the side tab" : task ? "Debounce: 2.5 seconds" : ""}</span><button type="button" className="finish-button" onClick={completeEssay} disabled={!task || risks.length !== PREDICTED_RISK_COUNT || wordCount < 40 || isReviewing}>{isReviewing ? "Reviewing…" : "Finish & review"}</button></div>
          </div>
        </section>
      </div>

      <div className="workspace-tabs" aria-label="Writing tools">
        <button type="button" className="workspace-tab" onClick={() => setOpenDrawer("profile")} aria-expanded={openDrawer === "profile"} aria-controls="workspace-drawer"><span>Predictive errors</span><b>{risks.length || "—"}</b></button>
        {finalReview && <button type="button" className="workspace-tab review-tab" onClick={() => setOpenDrawer("review")} aria-expanded={openDrawer === "review"} aria-controls="workspace-drawer"><span>Final review</span><b>{finalOccurrenceCount}</b></button>}
      </div>

      {openDrawer && <button type="button" className="drawer-scrim" aria-label="Close side panel" onClick={() => setOpenDrawer(null)} />}
      <aside id="workspace-drawer" className={`workspace-drawer ${openDrawer ? "is-open" : ""}`} aria-label={openDrawer === "review" ? "Final pattern review" : "Your predictive errors"} aria-hidden={!openDrawer}>
        {openDrawer === "profile" && <>
          <div className="drawer-heading"><div><p className="eyebrow">Your current profile</p><h2>Predictive errors</h2></div><button type="button" className="close-drawer" onClick={() => setOpenDrawer(null)} aria-label="Close predictive errors">×</button></div>
          <p className="drawer-intro">These are four patterns to notice yourself while writing — not automatic corrections.</p>
          {risks.length === PREDICTED_RISK_COUNT ? <ol className="risk-list">{risks.map((risk, index) => <li key={risk.patternId}><span>0{index + 1}</span><div><strong>{risk.name} <small>{risk.patternId}</small></strong><p>{risk.preventiveHint}</p></div></li>)}</ol> : <p className="quiet">Analyze an IELTS task to prepare your four current patterns.</p>}
          {profileSummary && <p className="profile-note">Profile: {profileSummary.patternCount} recurring patterns{profileSummary.historyEssayCount ? " · " + profileSummary.historyEssayCount + " complete essays" : ""}</p>}
        </>}
        {openDrawer === "review" && finalReview && <>
          <div className="drawer-heading"><div><p className="eyebrow">03 · After writing</p><h2>Final pattern review</h2></div><button type="button" className="close-drawer" onClick={() => setOpenDrawer(null)} aria-label="Close final pattern review">×</button></div>
          <p className="drawer-intro">The full essay was checked once by the final quality gate. It separates known recurring patterns from new, high-confidence findings.</p>
          <div className="review-sections">
            <section><h3>Predicted patterns found</h3><ReviewList items={finalReview.appeared} empty="None of the four predicted patterns were detected." moreHelp={moreHelp} moreHelpLoading={moreHelpLoading} onRequestMoreHelp={requestMoreHelp} /></section>
            <section><h3>Predicted patterns avoided</h3><ReviewList items={finalReview.avoided} empty="Every predicted pattern was detected at least once." moreHelp={moreHelp} moreHelpLoading={moreHelpLoading} onRequestMoreHelp={requestMoreHelp} /><p className="review-note">Not detected in this review is not a guarantee that no error exists.</p></section>
            <section><h3>Other recurring patterns noticed</h3><ReviewList items={finalReview.unpredicted} empty="No other known recurring pattern was detected." moreHelp={moreHelp} moreHelpLoading={moreHelpLoading} onRequestMoreHelp={requestMoreHelp} /></section>
            <section><h3>Other high-confidence issues</h3><GeneralFindingList items={finalReview.generalFindings} revealed={revealedGeneralFindings} onReveal={(finding) => setRevealedGeneralFindings((current) => ({ ...current, [generalFindingKey(finding)]: true }))} /><p className="review-note">These are findings from this essay only; they do not change your predictive profile.</p></section>
            <section><h3>Repeat next time</h3><ReviewList items={finalReview.reviewNext} empty="Use the four predicted patterns as your checklist again next time." moreHelp={moreHelp} moreHelpLoading={moreHelpLoading} onRequestMoreHelp={requestMoreHelp} /></section>
          </div>
        </>}
      </aside>

      {activeDetection && <aside className="live-hint" key={hintKey(activeDetection)} role="status" aria-live="polite">
        <div className="live-hint-title"><p className="hint-kicker">A quiet prompt</p><span>{activeDetection.patternId}</span></div>
        <p className="live-hint-copy">{activeDetection.hint}</p><p className="span">“{activeDetection.textSpan}”</p>
        {moreHelp[hintKey(activeDetection)] && <ExpandedHelp help={moreHelp[hintKey(activeDetection)]} />}
        <div className="hint-actions"><button type="button" className="text-button" onClick={() => dismissHint(activeDetection)}>Got it</button><button type="button" className="text-button" disabled={moreHelpLoading === hintKey(activeDetection)} onClick={() => requestMoreHelp(activeDetection)}>{moreHelpLoading === hintKey(activeDetection) ? "Loading…" : moreHelp[hintKey(activeDetection)] ? "Explanation shown" : "Show explanation & correction"}</button></div>
      </aside>}
    </main>
  );
}
