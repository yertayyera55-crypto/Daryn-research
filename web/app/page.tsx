"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Detection, PredictedRisk, TaskAnalysis } from "@/lib/domain";
import { hintKey, reconcileDetections } from "@/lib/hints";

type AnalysisResponse = {
  task: TaskAnalysis;
  highPriority: Array<PredictedRisk & { name: string }>;
  profileSummary: { patternCount: number; historyEssayCount: number | null };
};

async function postEvent(sessionId: string, type: "hint_dismissed" | "pattern_resolved", payload: Record<string, unknown> = {}) {
  if (!sessionId) return;
  await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, type, payload }),
  }).catch(() => undefined);
}

export default function MentorWorkspace() {
  const sessionId = useRef("");
  const previousWriting = useRef("");
  const detectionsRef = useRef<Detection[]>([]);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [writing, setWriting] = useState("");
  const [task, setTask] = useState<TaskAnalysis | null>(null);
  const [risks, setRisks] = useState<AnalysisResponse["highPriority"]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [moreHelp, setMoreHelp] = useState<Record<string, string>>({});
  const [moreHelpLoading, setMoreHelpLoading] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState("");
  const [profileSummary, setProfileSummary] = useState<AnalysisResponse["profileSummary"] | null>(null);

  useEffect(() => {
    sessionId.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    if (!task || risks.length !== 3 || writing.trim().length < 40) return;
    const timeout = window.setTimeout(async () => {
      if (writing === previousWriting.current) return;
      previousWriting.current = writing;
      setIsValidating(true);
      try {
        const response = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current, writing, task, risks }),
        });
        const data = await response.json() as { detections?: Detection[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Validation could not be completed.");
        const reconciliation = reconcileDetections(detectionsRef.current, data.detections ?? []);
        detectionsRef.current = reconciliation.active;
        setDetections(reconciliation.active);
        reconciliation.resolved.forEach((detection) => {
          void postEvent(sessionId.current, "pattern_resolved", { patternId: detection.patternId, textSpan: detection.textSpan });
        });
      } catch (validationError) {
        setError(validationError instanceof Error ? validationError.message : "Validation could not be completed.");
      } finally {
        setIsValidating(false);
      }
    }, 2_500);
    return () => window.clearTimeout(timeout);
  }, [writing, task, risks]);

  async function analyzeTask(event: FormEvent) {
    event.preventDefault();
    setError("");
    detectionsRef.current = [];
    setDetections([]);
    setMoreHelp({});
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

  function onWritingChange(value: string) { setWriting(value); }

  function dismissHint(detection: Detection) {
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
        body: JSON.stringify({ sessionId: sessionId.current, task, detection }),
      });
      const data = await response.json() as { moreHelp?: string; error?: string };
      if (!response.ok || !data.moreHelp) throw new Error(data.error ?? "More help could not be completed.");
      setMoreHelp((current) => ({ ...current, [key]: data.moreHelp! }));
    } catch (moreHelpError) {
      setError(moreHelpError instanceof Error ? moreHelpError.message : "More help could not be completed.");
    } finally {
      setMoreHelpLoading(null);
    }
  }

  return (
    <main className="workspace">
      <header className="masthead">
        <div>
          <p className="eyebrow">Local research prototype · Milestone 1</p>
          <h1>Personalized IELTS<br />Writing Mentor</h1>
        </div>
        <p className="method-note">Selective tutoring, not autocomplete.<br />Your writing is never edited automatically.</p>
      </header>

      <section className="task-zone" aria-labelledby="task-heading">
        <div className="section-label">
          <span>01</span>
          <h2 id="task-heading">Current IELTS task</h2>
        </div>
        <form onSubmit={analyzeTask}>
          <label className="sr-only" htmlFor="task-prompt">Paste an IELTS task prompt</label>
          <textarea id="task-prompt" value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} placeholder="Paste the Task 1 or Task 2 prompt here…" rows={5} />
          <div className="task-actions">
            <p>{task ? `${task.taskType} · ${task.subtype.replaceAll("_", " ")} · ${task.timeOrientation} orientation` : "Analyze the task before you begin writing."}</p>
            <button type="submit" disabled={isAnalyzing || taskPrompt.trim().length < 20}>{isAnalyzing ? "Analyzing…" : "Analyze task"}</button>
          </div>
        </form>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}

      <div className="studio-grid">
        <section className="editor-zone" aria-labelledby="editor-heading">
          <div className="section-label">
            <span>02</span>
            <h2 id="editor-heading">Writing editor</h2>
            {task && <em>{isValidating ? "Checking your selected patterns…" : "Monitoring recurring patterns"}</em>}
          </div>
          <label className="sr-only" htmlFor="writing">Write your response</label>
          <textarea id="writing" className="writing-editor" value={writing} onChange={(event) => onWritingChange(event.target.value)} disabled={!task} placeholder={task ? "Start writing. After a short pause, the mentor checks only your three selected personal patterns." : "Analyze an IELTS task first to begin writing."} />
          <div className="editor-footer"><span>{writing.trim() ? `${writing.trim().split(/\s+/).length} words` : "0 words"}</span><span>{task ? "Debounce: 2.5 seconds" : ""}</span></div>
        </section>

        <aside className="mentor-rail" aria-label="Personalized writing guidance">
          <section className="risk-panel" aria-labelledby="risks-heading">
            <div className="section-label"><span>03</span><h2 id="risks-heading">Personal risks</h2></div>
            {risks.length === 3 ? (
              <ol className="risk-list">
                {risks.map((risk, index) => <li key={risk.patternId}><span>0{index + 1}</span><div><strong>{risk.name} <small>{risk.patternId}</small></strong><p>{risk.preventiveHint}</p></div></li>)}
              </ol>
            ) : <p className="quiet">Your three current personal risks will appear here after task analysis.</p>}
            {profileSummary && <p className="profile-note">Profile: {profileSummary.patternCount} recurring patterns{profileSummary.historyEssayCount ? ` · ${profileSummary.historyEssayCount} complete essays` : ""}</p>}
          </section>

          <section className="hint-panel" aria-labelledby="hints-heading">
            <div className="section-label"><span>04</span><h2 id="hints-heading">Personal hints</h2></div>
            {detections.length === 0 ? <p className="quiet">Hints appear only when a selected pattern is actually detected.</p> : detections.map((detection) => (
              <article className="hint" key={`${detection.patternId}:${detection.textSpan}`}>
                <p className="hint-kicker">Personal hint — {detection.patternId}</p>
                <p>{detection.hint}</p>
                <p className="span">“{detection.textSpan}”</p>
                {moreHelp[hintKey(detection)] && <p className="more-help">{moreHelp[hintKey(detection)]}</p>}
                <div className="hint-actions">
                  <button type="button" className="text-button" onClick={() => dismissHint(detection)}>Got it</button>
                  <button type="button" className="text-button" disabled={moreHelpLoading === hintKey(detection)} onClick={() => requestMoreHelp(detection)}>{moreHelpLoading === hintKey(detection) ? "Loading…" : moreHelp[hintKey(detection)] ? "More help shown" : "More help"}</button>
                </div>
              </article>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
