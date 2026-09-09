import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { POST as validate } from "@/app/api/validate/route";
import { POST as review } from "@/app/api/final-review/route";
import { PREDICTED_RISK_COUNT } from "@/lib/domain";

const fixtures = vi.hoisted(() => {
  const patterns = ["P01", "P02", "P03", "P04"].map((id) => ({
    id, title: id, category: "Grammar", rule: "Rule", hint: "Inspect this phrase.", taskScope: "General", examples: [],
  }));
  const detection = { patternId: "P04", detected: true, textSpan: "the figures was", hint: "Inspect the subject." };
  return {
    profile: { studentId: "test", version: "1", patterns },
    detection,
    validateWriting: vi.fn(async () => [detection]),
    finalAudit: vi.fn(async () => ({ personalDetections: [detection], otherFindings: [] })),
  };
});

vi.mock("@/lib/profile", () => ({ loadPersonalErrorProfile: () => fixtures.profile, getTimelinePath: () => undefined }));
vi.mock("@/lib/history", () => ({ loadHistorySummary: () => null, attachObservedHistory: () => fixtures.profile }));
vi.mock("@/lib/session-logger", () => ({ logResearchEvent: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => fixtures }));

function request(count: number) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "12345678-1234-4234-8234-123456789012",
      writing: "In the historical chart, the figures was higher than in the previous year.",
      task: { taskType: "Task1", subtype: "chart_past", timeOrientation: "past", languageDemands: ["past tense"], rationale: "Historical dates." },
      risks: Array.from({ length: count }, (_, index) => ({ patternId: `P0${index + 1}`, reason: "Relevant", preventiveHint: "Inspect this phrase." })),
    }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("four predicted risks through the API", () => {
  it("keeps the model JSON contract aligned with application validation", () => {
    const schema = JSON.parse(readFileSync("contracts/risk-prediction.schema.json", "utf8"));
    expect(schema.properties.highPriority.minItems).toBe(PREDICTED_RISK_COUNT);
    expect(schema.properties.highPriority.maxItems).toBe(PREDICTED_RISK_COUNT);
  });

  it("accepts four risks and returns live feedback for the fourth pattern", async () => {
    const response = await validate(request(4));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ detections: [fixtures.detection] });
    expect(fixtures.validateWriting.mock.calls).toHaveLength(1);
  });

  it("includes the fourth predicted pattern in the final review", async () => {
    const response = await review(request(4));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.appeared.map((item: { patternId: string }) => item.patternId)).toEqual(["P04"]);
    expect(body.avoided).toHaveLength(3);
    expect(body.unpredicted).toEqual([]);
  });

  it.each([3, 5])("rejects %i risks before calling the model", async (count) => {
    expect((await validate(request(count))).status).toBe(400);
    expect((await review(request(count))).status).toBe(400);
    expect(fixtures.validateWriting).not.toHaveBeenCalled();
    expect(fixtures.finalAudit).not.toHaveBeenCalled();
  });
});
