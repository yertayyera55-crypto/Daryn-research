import { describe, expect, it } from "vitest";
import { reconcileDetections } from "@/lib/hints";

const tenseDetection = { patternId: "P14", detected: true as const, textSpan: "jobs increase", hint: "Check the time period." };

describe("hint reconciliation", () => {
  it("suppresses duplicate pattern-and-span hints", () => {
    const result = reconcileDetections([], [tenseDetection, { ...tenseDetection }]);
    expect(result.active).toEqual([tenseDetection]);
  });

  it("marks an absent former detection as resolved after revalidation", () => {
    const result = reconcileDetections([tenseDetection], []);
    expect(result.active).toEqual([]);
    expect(result.resolved).toEqual([tenseDetection]);
  });

  it("does not reopen an exact finding dismissed by the student during this session", () => {
    const result = reconcileDetections([], [tenseDetection], new Set(["P14:jobs increase"]));
    expect(result.active).toEqual([]);
  });
});
