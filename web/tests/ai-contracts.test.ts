import { describe, expect, it } from "vitest";
import { parseDetections, parseRiskRanking, parseTaskAnalysis } from "@/lib/ai/response-parser";
import { createCodexCliProvider, runServerProcess } from "@/lib/ai/codex-cli-provider";
import { normalizeProfile } from "@/lib/profile";

const profile = normalizeProfile({
  student_id: "student_001", profile_version: "1.0", patterns: [
    { pattern_id: "P01", category: "Punctuation", specific_pattern: "Missing introductory comma", rule: "Rule", hint: "Hint", task_scope: "General" },
    { pattern_id: "P02", category: "Articles", specific_pattern: "Missing determiner", rule: "Rule", hint: "Hint", task_scope: "General" },
    { pattern_id: "P14", category: "Tense", specific_pattern: "Past data tense", rule: "Rule", hint: "Hint", task_scope: "Task 1" },
  ],
});

describe("AI output contracts", () => {
  it("parses a valid task analysis", () => {
    expect(parseTaskAnalysis(JSON.stringify({ taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past simple"], rationale: "Historical dates." }))).toMatchObject({ subtype: "chart_past" });
  });

  it("requires exactly three unique risks", () => {
    const ranking = parseRiskRanking(JSON.stringify({ highPriority: [
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P02", reason: "r", preventiveHint: "h" },
      { patternId: "P14", reason: "r", preventiveHint: "h" },
    ] }));
    expect(ranking.highPriority).toHaveLength(3);
    expect(() => parseRiskRanking(JSON.stringify({ highPriority: [{ patternId: "P01", reason: "r", preventiveHint: "h" }] }))).toThrow();
    expect(() => parseRiskRanking(JSON.stringify({ highPriority: [
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P14", reason: "r", preventiveHint: "h" },
    ] }))).toThrow("unique");
  });

  it("rejects malformed validator output", () => {
    expect(parseDetections(JSON.stringify({ detections: [{ patternId: "P14", detected: true, textSpan: "increase", hint: "Check tense." }] }))).toHaveLength(1);
    expect(() => parseDetections("not json")).toThrow("invalid JSON");
  });

  it("rejects an invalid provider pattern ID", async () => {
    const provider = createCodexCliProvider(async () => JSON.stringify({ highPriority: [
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P02", reason: "r", preventiveHint: "h" },
      { patternId: "P99", reason: "r", preventiveHint: "h" },
    ] }));
    await expect(provider.rankRisks({ task: { taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past simple"], rationale: "dates" }, profile })).rejects.toThrow("unknown pattern IDs");
  });

  it("surfaces local subprocess failures cleanly", async () => {
    const provider = createCodexCliProvider(async () => { throw new Error("Codex CLI could not be started."); });
    await expect(provider.analyzeTask({ taskPrompt: "The graph shows data between 1960 and 2020." })).rejects.toThrow("could not be started");
  });

  it("times out a hanging server-side subprocess", async () => {
    await expect(runServerProcess({ command: process.execPath, args: ["-e", "setTimeout(() => {}, 1000)"], input: "", timeoutMs: 10 })).rejects.toThrow("timed out");
  });
});
