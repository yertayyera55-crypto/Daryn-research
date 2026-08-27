import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Detection, RiskRanking, validateKnownPatternIds } from "@/lib/domain";
import { parseDetections, parseMoreHelp, parseRiskRanking, parseTaskAnalysis } from "@/lib/ai/response-parser";
import { AIProvider, MoreHelpRequest, RiskPredictionRequest, TaskAnalysisRequest, ValidationRequest } from "@/lib/ai/types";

const REQUEST_TIMEOUT_MS = 45_000;
let requestInFlight = false;

export class AIBackendError extends Error {}

type RunCommand = (prompt: string, schemaName: string) => Promise<string>;
type ProcessInput = { command: string; args: string[]; input: string; timeoutMs: number };

function structuredPatterns(request: RiskPredictionRequest) {
  return request.profile.patterns.map((pattern) => ({
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

export function createCodexCliProvider(runCommand: RunCommand = runCodexCommand): AIProvider {
  return {
    async analyzeTask({ taskPrompt }: TaskAnalysisRequest) {
      const output = await runCommand(`You are an IELTS Writing task analyzer. Analyze the task before the student writes. Return only the schema-constrained JSON.

Infer Task1 or Task2, a concise subtype (for Task 1: process, life_cycle, map, chart_past, chart_present, chart_mixed_time, projection, or other_task1; for Task 2 use a concise essay-type label), time orientation, and 1–6 language demands. Do not predict errors and do not write any essay content.

IELTS task prompt:
---
${taskPrompt}
---`, "task-analysis.schema.json");
      return parseTaskAnalysis(output);
    },

    async rankRisks(request: RiskPredictionRequest): Promise<RiskRanking> {
      const output = await runCommand(`You are a personalized IELTS Writing risk prioritizer. The future essay has not been written. Select exactly THREE distinct recurring personal patterns that are most relevant to this exact task.

Use the full pattern definition, historical examples, and observed occurrence records with the current task context. Occurrence counts are evidence of history only; they are not semantic task relevance. Infer semantic relevance dynamically from the pattern definition and exact task. Do not claim certainty, invent patterns, generate essay content, or correct writing. Preventive hints must be short conceptual reminders, not corrections.

Task analysis:
${JSON.stringify(request.task)}

Canonical personal patterns and observed history:
${JSON.stringify(structuredPatterns(request))}

Return only schema-constrained JSON.`, "risk-prediction.schema.json");
      const ranking = parseRiskRanking(output);
      validateKnownPatternIds(ranking.highPriority, request.profile);
      return ranking;
    },

    async validateWriting(request: ValidationRequest): Promise<Detection[]> {
      const selectedIds = new Set(request.risks.map((risk) => risk.patternId));
      const selectedPatterns = request.profile.patterns
        .filter((pattern) => selectedIds.has(pattern.id))
        .map((pattern) => ({
          id: pattern.id,
          name: pattern.title,
          rule: pattern.rule,
          examples: pattern.examples,
          hint: pattern.hint,
          observedHistory: pattern.history ?? null,
        }));
      const output = await runCommand(`You are a selective writing tutor. Check ONLY the selected personal patterns in the recent student writing excerpt. Return a detection only when the specified pattern actually appears. Do not find unrelated errors, rewrite sentences, or provide a corrected sentence.

Each hint must be Level 1: short and conceptual. Never provide an exact correction. If uncertain, do not return a detection.

Task context:
${JSON.stringify(request.task)}

Selected personal patterns:
${JSON.stringify(selectedPatterns)}

Recent writing excerpt:
---
${recentExcerpt(request.writing)}
---

Return only schema-constrained JSON.`, "validation.schema.json");
      const detections = validateKnownPatternIds(parseDetections(output), request.profile);
      const unrelated = detections.filter((detection) => !selectedIds.has(detection.patternId));
      if (unrelated.length > 0) throw new AIBackendError("The AI backend returned an unselected pattern.");
      return detections;
    },

    async getMoreHelp(request: MoreHelpRequest): Promise<string> {
      const pattern = request.profile.patterns.find((item) => item.id === request.detection.patternId);
      if (!pattern) throw new AIBackendError("The selected pattern is not available in the profile.");
      const output = await runCommand(`You are a personalized writing tutor. Give Level 2 help for one already-detected recurring pattern. Point the student toward what to inspect, but do not provide the corrected wording or write a replacement sentence.

Task context:
${JSON.stringify(request.task)}

Pattern knowledge:
${JSON.stringify({ id: pattern.id, name: pattern.title, rule: pattern.rule, examples: pattern.examples, observedHistory: pattern.history ?? null })}

Detected text span:
---
${request.detection.textSpan}
---

Return only schema-constrained JSON.`, "more-help.schema.json");
      return parseMoreHelp(output);
    },
  };
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
