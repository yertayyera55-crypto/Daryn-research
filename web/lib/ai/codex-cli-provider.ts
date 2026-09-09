import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { PREDICTED_RISK_COUNT, Detection, RiskRanking, validateKnownPatternIds } from "@/lib/domain";
import { parseDetections, parseFinalAudit, parseMoreHelp, parseRiskRanking, parseTaskAnalysis } from "@/lib/ai/response-parser";
import { AIProvider, FinalAuditRequest, MoreHelpRequest, RiskPredictionRequest, TaskAnalysisRequest, ValidationRequest } from "@/lib/ai/types";

const REQUEST_TIMEOUT_MS = 45_000;
let requestInFlight = false;

export class AIBackendError extends Error {}

export type RunCommand = (prompt: string, schemaName: string) => Promise<string>;
export type TutorRunners = { fast: RunCommand; smart: RunCommand; final: RunCommand };
type ProcessInput = { command: string; args: string[]; input: string; timeoutMs: number };

function structuredPatterns(profile: RiskPredictionRequest["profile"]) {
  return profile.patterns.map((pattern) => ({
    id: pattern.id,
    name: pattern.title,
    category: pattern.category,
    rule: pattern.rule,
    examples: pattern.examples,
    taskScope: pattern.taskScope,
    confidence: pattern.confidence ?? null,
    observedHistory: pattern.history ?? null,
  }));
}

function recentExcerpt(writing: string) {
  const paragraphs = writing.trim().split(/\n\s*\n/).filter(Boolean);
  return paragraphs.slice(-2).join("\n\n").slice(-3_500);
}

function writingForValidation(writing: string, scope: ValidationRequest["scope"]) {
  return scope === "fullEssay" ? writing.trim() : recentExcerpt(writing);
}

/** Shared tutoring workflow used by every structured-output provider. */
export function createStructuredTutorProvider({ fast, smart, final }: TutorRunners): AIProvider {
  return {
    async analyzeTask({ taskPrompt }: TaskAnalysisRequest) {
      const output = await fast(`You are an IELTS Writing task analyzer. Analyze the task before the student writes. Return only the schema-constrained JSON.

Infer Task1 or Task2, a concise subtype (for Task 1: process, life_cycle, map, chart_past, chart_present, chart_mixed_time, projection, or other_task1; for Task 2 use a concise essay-type label), time orientation, and 1–6 language demands. Do not predict errors and do not write any essay content.

IELTS task prompt:
---
${taskPrompt}
---`, "task-analysis.schema.json");
      return parseTaskAnalysis(output);
    },

    async rankRisks(request: RiskPredictionRequest): Promise<RiskRanking> {
      const output = await fast(`You are a personalized IELTS Writing risk prioritizer. The future essay has not been written. Select exactly ${PREDICTED_RISK_COUNT} distinct recurring personal patterns that are most relevant to this exact task.

Use the full pattern definition, historical examples, and observed occurrence records with the current task context. Occurrence counts are evidence of history only; they are not semantic task relevance. Infer semantic relevance dynamically from the pattern definition and exact task. Do not claim certainty, invent patterns, generate essay content, or correct writing. Preventive hints must be short and indirect: invite the student to inspect a choice rather than naming the grammar rule or giving away the answer.

Task analysis:
${JSON.stringify(request.task)}

Canonical personal patterns and observed history:
${JSON.stringify(structuredPatterns(request.profile))}

Return only schema-constrained JSON.`, "risk-prediction.schema.json");
      const ranking = parseRiskRanking(output);
      validateKnownPatternIds(ranking.highPriority, request.profile);
      return ranking;
    },

    async validateWriting(request: ValidationRequest): Promise<Detection[]> {
      const selectedIds = new Set(request.risks.map((risk) => risk.patternId));
      const patternsToCheck = request.checkAllProfilePatterns
        ? request.profile.patterns
        : request.profile.patterns.filter((pattern) => selectedIds.has(pattern.id));
      const allowedIds = new Set(patternsToCheck.map((pattern) => pattern.id));
      const selectedPatterns = patternsToCheck
        .map((pattern) => ({
          id: pattern.id,
          name: pattern.title,
          rule: pattern.rule,
          examples: pattern.examples,
          hint: pattern.hint,
          observedHistory: pattern.history ?? null,
        }));
      const reviewInstruction = request.checkAllProfilePatterns
        ? "This is a final full-essay review. Check every supplied known recurring pattern. Return a separate detection for every clear occurrence, including multiple occurrences of the same pattern. Do not invent patterns outside the supplied profile."
        : "Check ONLY the selected personal patterns in the submitted writing. Return a detection only when the specified pattern actually appears. Do not find unrelated errors.";
      const runner = request.checkAllProfilePatterns ? final : fast;
      const output = await runner(`You are a selective writing tutor. ${reviewInstruction} Do not rewrite sentences or provide a corrected sentence.

Each hint must be Level 1: short, subtle, and self-corrective. Phrase it as a focused question or inspection direction, rather than naming the grammar rule or giving the answer. Never provide an exact correction. If uncertain, do not return a detection.

Task context:
${JSON.stringify(request.task)}

Personal patterns to check:
${JSON.stringify(selectedPatterns)}

Writing to check:
---
${writingForValidation(request.writing, request.scope)}
---

Return only schema-constrained JSON.`, "validation.schema.json");
      const detections = validateKnownPatternIds(parseDetections(output), request.profile);
      const unrelated = detections.filter((detection) => !allowedIds.has(detection.patternId));
      if (unrelated.length > 0) throw new AIBackendError("The AI backend returned an unselected pattern.");
      return detections;
    },

    async getMoreHelp(request: MoreHelpRequest) {
      const pattern = request.profile.patterns.find((item) => item.id === request.detection.patternId);
      if (!pattern) throw new AIBackendError("The selected pattern is not available in the profile.");
      const output = await smart(`You are a personalized writing tutor. Give Level 2 help for one already-detected recurring pattern. Explain plainly why this exact text was flagged according to the pattern rule, then give ONE corrected version of the complete sentence containing it. The correction must apply only to the detected issue; do not add unrelated feedback or rewrite the whole essay.

Task context:
${JSON.stringify(request.task)}

Pattern knowledge:
${JSON.stringify({ id: pattern.id, name: pattern.title, rule: pattern.rule, examples: pattern.examples, observedHistory: pattern.history ?? null })}

Detected text span:
---
${request.detection.textSpan}
---

Current student essay:
---
${request.writing.trim()}
---

Return only schema-constrained JSON.`, "more-help.schema.json");
      return parseMoreHelp(output);
    },

    async finalAudit(request: FinalAuditRequest) {
      const output = await final(`You are the final quality gate for a personalized IELTS Writing mentor. Audit the complete student essay once, conservatively, and return only schema-constrained JSON.

First perform an INDEPENDENT discovery pass over the essay. Identify clear, high-confidence language errors from the essay itself. Do not let future Top-4 predictions or the Personal Error Profile limit this discovery pass.

Only after that discovery pass, classify each discovered error against the supplied canonical personal patterns and the four predicted patterns. A broad category alone is never enough to merge findings: one tense, preposition, article, or word-choice pattern does not cover every error in that category. Treat a finding as an existing personal pattern only when it matches the same specific underlying rule.

Return TWO separate lists.

1. personalDetections: discovered errors that match a supplied canonical personal pattern's specific rule. Include one item for every clear occurrence. Each textSpan must be copied exactly from the current essay. The hint must remain short and self-corrective. Do not invent pattern IDs.

2. otherFindings: at most FIVE clear, high-confidence discovered language errors that do not match the same specific underlying rule of a personalDetection. Do not list stylistic preferences, optional rewrites, or uncertain cases. Each textSpan must be copied exactly from the current essay. The correction must be the complete sentence containing that span and must make a real, minimal correction. Keep the hint short; reserve the fuller reason for explanation.

False positives are worse than omissions. Do not claim the essay is error-free, do not score IELTS bands, and do not add any personal pattern based on this one essay.

Current student essay:
---
${request.writing.trim()}
---

Task context for classification:
${JSON.stringify(request.task)}

Four patterns predicted before writing (classification only):
${JSON.stringify(request.risks)}

Canonical personal patterns and observed history (classification only):
${JSON.stringify(structuredPatterns(request.profile))}

Return only schema-constrained JSON.`, "final-audit.schema.json");
      const audit = parseFinalAudit(output);
      validateKnownPatternIds(audit.personalDetections, request.profile);
      return audit;
    },
  };
}

export function createCodexCliProvider(runCommand: RunCommand = runCodexCommand): AIProvider {
  return createStructuredTutorProvider({ fast: runCommand, smart: runCommand, final: runCommand });
}

/** Executes a server-side process without a shell; exported to test timeout handling. */
export async function runServerProcess({ command, args, input, timeoutMs }: ProcessInput): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };
    const child = spawn(command, args, { shell: false, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(() => reject(new AIBackendError("The local AI request timed out. Please try again.")));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", () => {
      clearTimeout(timer);
      settle(() => reject(new AIBackendError("Codex CLI could not be started. Check that Codex is installed and signed in.")));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() => reject(new AIBackendError(`The local AI request failed${stderr ? ". Please check the server terminal." : "."}`)));
        return;
      }
      settle(resolve);
    });
    child.stdin.end(input);
  });
}

/** Runs Codex only on the server. User text is written to stdin, never interpolated into a shell command. */
export function createCodexCliRunner(options: { executable?: string; timeoutMs?: number } = {}): RunCommand {
  const executable = options.executable ?? "codex";
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return async (prompt, schemaName) => {
  if (requestInFlight) throw new AIBackendError("The local AI is busy. Please try again in a moment.");
  requestInFlight = true;
  const requestDir = await mkdtemp(path.join(tmpdir(), "ielts-mentor-"));
  const outputPath = path.join(requestDir, "response.json");
  const schemaPath = path.join(process.cwd(), "contracts", schemaName);

  try {
    await runServerProcess({
      command: executable,
      args: [
        "--sandbox", "read-only", "-a", "never", "exec", "--ephemeral",
        "--output-schema", schemaPath, "--output-last-message", outputPath, "--color", "never", "-",
      ],
      input: prompt,
      timeoutMs,
    });
    try {
      return await readFile(outputPath, "utf8");
    } catch {
      throw new AIBackendError("The local AI did not return a final response.");
    }
  } finally {
    requestInFlight = false;
    await rm(requestDir, { recursive: true, force: true });
  }
  };
}

export const runCodexCommand = createCodexCliRunner();
