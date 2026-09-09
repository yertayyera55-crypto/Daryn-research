import { describe, expect, it } from "vitest";
import { parseDetections, parseFinalAudit, parseMoreHelp, parseRiskRanking, parseTaskAnalysis } from "@/lib/ai/response-parser";
import { createCodexCliProvider, createStructuredTutorProvider, runServerProcess } from "@/lib/ai/codex-cli-provider";
import { createGeminiRunner, getGeminiFastModel, getGeminiFinalModel, getGeminiSmartModel, toGeminiStructuredOutputSchema } from "@/lib/ai/gemini-provider";
import { normalizeProfile } from "@/lib/profile";

const profile = normalizeProfile({
  student_id: "student_001", profile_version: "1.0", patterns: [
    { pattern_id: "P01", category: "Punctuation", specific_pattern: "Missing introductory comma", rule: "Rule", hint: "Hint", task_scope: "General" },
    { pattern_id: "P02", category: "Articles", specific_pattern: "Missing determiner", rule: "Rule", hint: "Hint", task_scope: "General" },
    { pattern_id: "P03", category: "Agreement", specific_pattern: "Agreement", rule: "Rule", hint: "Hint", task_scope: "General" },
    { pattern_id: "P14", category: "Tense", specific_pattern: "Past data tense", rule: "Rule", hint: "Hint", task_scope: "Task 1" },
  ],
});

describe("AI output contracts", () => {
  it("parses a valid task analysis", () => {
    expect(parseTaskAnalysis(JSON.stringify({ taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past simple"], rationale: "Historical dates." }))).toMatchObject({ subtype: "chart_past" });
  });

  it("requires exactly four unique risks", () => {
    const ranking = parseRiskRanking(JSON.stringify({ highPriority: [
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P02", reason: "r", preventiveHint: "h" },
      { patternId: "P14", reason: "r", preventiveHint: "h" },
      { patternId: "P03", reason: "r", preventiveHint: "h" },
    ] }));
    expect(ranking.highPriority).toHaveLength(4);
    for (const risks of [ranking.highPriority.slice(0, 3), [...ranking.highPriority, { patternId: "P04", reason: "r", preventiveHint: "h" }]]) {
      expect(() => parseRiskRanking(JSON.stringify({ highPriority: risks }))).toThrow();
    }
    expect(() => parseRiskRanking(JSON.stringify({ highPriority: [{ patternId: "P01", reason: "r", preventiveHint: "h" }] }))).toThrow();
    expect(() => parseRiskRanking(JSON.stringify({ highPriority: [
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P14", reason: "r", preventiveHint: "h" },
      { patternId: "P03", reason: "r", preventiveHint: "h" },
    ] }))).toThrow("unique");
  });

  it("rejects malformed validator output", () => {
    expect(parseDetections(JSON.stringify({ detections: [{ patternId: "P14", detected: true, textSpan: "increase", hint: "Check tense." }] }))).toHaveLength(1);
    expect(() => parseDetections(JSON.stringify({ detections: [{ patternId: "P14", detected: false, textSpan: "increase", hint: "Check tense." }] }))).toThrow();
    expect(() => parseDetections("not json")).toThrow("invalid JSON");
  });

  it("requires an explanation and an opt-in corrected version for Level-2 help", () => {
    expect(parseMoreHelp(JSON.stringify({ explanation: "The sentence describes a finished period.", correction: "The figure rose in 1999." }))).toEqual({
      explanation: "The sentence describes a finished period.",
      correction: "The figure rose in 1999.",
    });
    expect(() => parseMoreHelp(JSON.stringify({ explanation: "Missing correction." }))).toThrow();
  });

  it("requires evidence fields for a final audit's new findings", () => {
    expect(parseFinalAudit(JSON.stringify({
      personalDetections: [],
      otherFindings: [{ category: "Articles", textSpan: "a data", hint: "Inspect this noun phrase.", explanation: "Data is plural here.", correction: "The data are reliable." }],
    }))).toMatchObject({ otherFindings: [{ category: "Articles" }] });
    expect(() => parseFinalAudit(JSON.stringify({ personalDetections: [], otherFindings: [{ category: "Articles", textSpan: "a data" }] }))).toThrow();
  });

  it("rejects an invalid provider pattern ID", async () => {
    const provider = createCodexCliProvider(async () => JSON.stringify({ highPriority: [
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P02", reason: "r", preventiveHint: "h" },
      { patternId: "P99", reason: "r", preventiveHint: "h" },
      { patternId: "P03", reason: "r", preventiveHint: "h" },
    ] }));
    await expect(provider.rankRisks({ task: { taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past simple"], rationale: "dates" }, profile })).rejects.toThrow("unknown pattern IDs");
  });

  it("uses the full submitted essay for a final quality audit", async () => {
    let prompt = "";
    const provider = createCodexCliProvider(async (input) => {
      prompt = input;
      return JSON.stringify({ personalDetections: [], otherFindings: [] });
    });
    const fullEssay = `EARLY_FINAL_REVIEW_MARKER ${"word ".repeat(900)}\n\nFinal paragraph.`;
    await provider.finalAudit({
      writing: fullEssay,
      task: { taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past simple"], rationale: "dates" },
      risks: [
        { patternId: "P01", reason: "r", preventiveHint: "h" },
        { patternId: "P02", reason: "r", preventiveHint: "h" },
        { patternId: "P14", reason: "r", preventiveHint: "h" },
      { patternId: "P03", reason: "r", preventiveHint: "h" },
      ],
      profile,
    });
    expect(prompt).toContain("EARLY_FINAL_REVIEW_MARKER");
    expect(prompt).toContain("Final paragraph.");
    expect(prompt).toContain("INDEPENDENT discovery pass");
    expect(prompt.indexOf("Current student essay:")).toBeLessThan(prompt.indexOf("Four patterns predicted before writing"));
  });

  it("uses the current essay to give an opt-in explanation and correction", async () => {
    let prompt = "";
    const provider = createCodexCliProvider(async (input) => {
      prompt = input;
      return JSON.stringify({ explanation: "This describes finished chart data.", correction: "The figure rose in 1999." });
    });
    await expect(provider.getMoreHelp({
      task: { taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past simple"], rationale: "dates" },
      detection: { patternId: "P14", detected: true, textSpan: "the figure rises", hint: "Inspect the time reference." },
      profile,
      writing: "The figure rises in 1999.",
    })).resolves.toEqual({ explanation: "This describes finished chart data.", correction: "The figure rose in 1999." });
    expect(prompt).toContain("ONE corrected version");
    expect(prompt).toContain("The figure rises in 1999.");
  });

  it("routes task setup and live work to fast, detailed help to smart, and the audit to final", async () => {
    const calls: string[] = [];
    const responses: Record<string, string> = {
      "task-analysis.schema.json": JSON.stringify({ taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past simple"], rationale: "dates" }),
      "risk-prediction.schema.json": JSON.stringify({ highPriority: [
        { patternId: "P01", reason: "r", preventiveHint: "h" },
        { patternId: "P02", reason: "r", preventiveHint: "h" },
        { patternId: "P14", reason: "r", preventiveHint: "h" },
      { patternId: "P03", reason: "r", preventiveHint: "h" },
      ] }),
      "validation.schema.json": JSON.stringify({ detections: [] }),
      "more-help.schema.json": JSON.stringify({ explanation: "The sentence describes finished data.", correction: "The figure rose in 1999." }),
      "final-audit.schema.json": JSON.stringify({ personalDetections: [], otherFindings: [] }),
    };
    const runner = (kind: "fast" | "smart" | "final") => async (_prompt: string, schemaName: string) => {
      calls.push(`${kind}:${schemaName}`);
      return responses[schemaName];
    };
    const provider = createStructuredTutorProvider({ fast: runner("fast"), smart: runner("smart"), final: runner("final") });
    const task = { taskType: "Task1" as const, subtype: "chart_past", timeOrientation: "past" as const, languageDemands: ["past simple"], rationale: "dates" };
    const risks = [
      { patternId: "P01", reason: "r", preventiveHint: "h" },
      { patternId: "P02", reason: "r", preventiveHint: "h" },
      { patternId: "P14", reason: "r", preventiveHint: "h" },
      { patternId: "P03", reason: "r", preventiveHint: "h" },
    ];

    await provider.analyzeTask({ taskPrompt: "The graph shows data between 1960 and 2020." });
    await provider.rankRisks({ task, profile });
    await provider.validateWriting({ writing: "The figure rises in 1999.", task, risks, profile, scope: "fullEssay" });
    await provider.getMoreHelp({ task, profile, writing: "The figure rises in 1999.", detection: { patternId: "P14", detected: true, textSpan: "figure rises", hint: "Inspect the time reference." } });
    await provider.finalAudit({ writing: "The figure rises in 1999.", task, risks, profile });

    expect(calls).toEqual([
      "fast:task-analysis.schema.json",
      "fast:risk-prediction.schema.json",
      "fast:validation.schema.json",
      "smart:more-help.schema.json",
      "final:final-audit.schema.json",
    ]);
  });

  it("uses separate configurable Gemini model roles with a legacy fast-model fallback", () => {
    const originalFast = process.env.GEMINI_MODEL_FAST;
    const originalSmart = process.env.GEMINI_MODEL_SMART;
    const originalFinal = process.env.GEMINI_MODEL_FINAL;
    const originalLegacy = process.env.GEMINI_MODEL;
    try {
      delete process.env.GEMINI_MODEL_FAST;
      delete process.env.GEMINI_MODEL_SMART;
      delete process.env.GEMINI_MODEL_FINAL;
      process.env.GEMINI_MODEL = "legacy-fast";
      expect(getGeminiFastModel()).toBe("legacy-fast");
      expect(getGeminiSmartModel()).toBe("gemini-3.5-flash");
      expect(getGeminiFinalModel()).toBe("gemini-3.6-flash");
      process.env.GEMINI_MODEL_FAST = "fast-model";
      process.env.GEMINI_MODEL_SMART = "smart-model";
      process.env.GEMINI_MODEL_FINAL = "final-model";
      expect(getGeminiFastModel()).toBe("fast-model");
      expect(getGeminiSmartModel()).toBe("smart-model");
      expect(getGeminiFinalModel()).toBe("final-model");
    } finally {
      if (originalFast === undefined) delete process.env.GEMINI_MODEL_FAST;
      else process.env.GEMINI_MODEL_FAST = originalFast;
      if (originalSmart === undefined) delete process.env.GEMINI_MODEL_SMART;
      else process.env.GEMINI_MODEL_SMART = originalSmart;
      if (originalFinal === undefined) delete process.env.GEMINI_MODEL_FINAL;
      else process.env.GEMINI_MODEL_FINAL = originalFinal;
      if (originalLegacy === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = originalLegacy;
    }
  });

  it("surfaces local subprocess failures cleanly", async () => {
    const provider = createCodexCliProvider(async () => { throw new Error("Codex CLI could not be started."); });
    await expect(provider.analyzeTask({ taskPrompt: "The graph shows data between 1960 and 2020." })).rejects.toThrow("could not be started");
  });

  it("times out a hanging server-side subprocess", async () => {
    await expect(runServerProcess({ command: process.execPath, args: ["-e", "setTimeout(() => {}, 1000)"], input: "", timeoutMs: 10 })).rejects.toThrow("timed out");
  });

  it("uses Gemini structured output and returns its JSON text", async () => {
    const originalFetch = global.fetch;
    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.response_format.mime_type).toBe("application/json");
      expect(body.response_format.schema).toMatchObject({ type: "object" });
      return new Response(JSON.stringify({
        steps: [{ type: "model_output", content: [{ type: "text", text: '{"explanation":"Inspect the verb form.","correction":"The verb was in the past."}' }] }],
      }), { status: 200 });
    };
    global.fetch = fetchMock as typeof fetch;
    try {
      await expect(createGeminiRunner({ apiKey: "test-key" })("prompt", "more-help.schema.json"))
        .resolves.toBe('{"explanation":"Inspect the verb form.","correction":"The verb was in the past."}');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("sends Gemini a validation schema without unsupported const constraints", async () => {
    const originalFetch = global.fetch;
    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.response_format.schema.properties.detections.items.properties.detected).toEqual({ type: "boolean" });
      expect(body.response_format.schema.properties.detections.items.properties).not.toHaveProperty("correctedSentence");
      expect(body.response_format.schema.properties.detections.items.required).not.toContain("correctedSentence");
      expect(body.response_format.schema).not.toHaveProperty("$schema");
      expect(body.response_format.schema).not.toHaveProperty("additionalProperties");
      expect(body.response_format.schema.properties.detections).not.toHaveProperty("maxItems");
      return new Response(JSON.stringify({
        steps: [{ type: "model_output", content: [{ type: "text", text: '{"detections":[]}' }] }],
      }), { status: 200 });
    };
    global.fetch = fetchMock as typeof fetch;
    try {
      await expect(createGeminiRunner({ apiKey: "test-key" })("prompt", "validation.schema.json"))
        .resolves.toBe('{"detections":[]}');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("sends Gemini a final-audit schema with the required evidence fields", async () => {
    const originalFetch = global.fetch;
    const fetchMock = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const finding = body.response_format.schema.properties.otherFindings.items;
      expect(finding.properties).toMatchObject({
        category: { type: "string" },
        textSpan: { type: "string" },
        explanation: { type: "string" },
        correction: { type: "string" },
      });
      expect(finding).not.toHaveProperty("additionalProperties");
      return new Response(JSON.stringify({
        steps: [{ type: "model_output", content: [{ type: "text", text: '{"personalDetections":[],"otherFindings":[]}' }] }],
      }), { status: 200 });
    };
    global.fetch = fetchMock as typeof fetch;
    try {
      await expect(createGeminiRunner({ apiKey: "test-key" })("prompt", "final-audit.schema.json"))
        .resolves.toBe('{"personalDetections":[],"otherFindings":[]}');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("keeps supported schema fields while removing Gemini-incompatible constraints", () => {
    expect(toGeminiStructuredOutputSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      properties: { answer: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } } },
    })).toEqual({ type: "object", properties: { answer: { type: "array", items: { type: "string" } } } });
  });

  it("surfaces Gemini API failures without exposing the API key", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => new Response(JSON.stringify({ error: { message: "Invalid key secret-key" } }), { status: 401 })) as typeof fetch;
    try {
      await expect(createGeminiRunner({ apiKey: "secret-key" })("prompt", "more-help.schema.json"))
        .rejects.toThrow("Gemini API request failed (401).");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
