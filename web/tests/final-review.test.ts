import { describe, expect, it } from "vitest";
import { buildFinalReview, filterFinalAuditEvidence } from "@/lib/final-review";
import { normalizeProfile } from "@/lib/profile";

const profile = normalizeProfile({
  student_id: "student_001",
  profile_version: "1.0",
  patterns: [
    { pattern_id: "P01", category: "Punctuation", specific_pattern: "Missing introductory comma", rule: "Use a comma after an introductory clause.", hint: "Check the opening.", task_scope: "General" },
    { pattern_id: "P02", category: "Articles", specific_pattern: "Missing determiner", rule: "Check the noun phrase.", hint: "Inspect the noun.", task_scope: "General" },
    { pattern_id: "P03", category: "Agreement", specific_pattern: "Subject-verb agreement", rule: "Match the verb to its subject.", hint: "Inspect the subject and verb.", task_scope: "General" },
    { pattern_id: "P14", category: "Tense", specific_pattern: "Past data tense", rule: "Use past tense for finished data.", hint: "Check the time reference.", task_scope: "Task 1" },
  ],
});

const risks = [
  { patternId: "P01", reason: "r", preventiveHint: "h" },
  { patternId: "P02", reason: "r", preventiveHint: "h" },
  { patternId: "P14", reason: "r", preventiveHint: "h" },
];

describe("final review", () => {
  it("groups every occurrence and separates unpredicted profile patterns", () => {
    const review = buildFinalReview(profile, risks, [
      { patternId: "P14", detected: true, textSpan: "the figure rises in 2010", hint: "Check the time reference." },
      { patternId: "P14", detected: true, textSpan: "the data increase in 1999", hint: "Check the time reference." },
      { patternId: "P03", detected: true, textSpan: "the figures was", hint: "Inspect the subject and verb." },
    ]);

    expect(review.appeared.map((item) => item.patternId)).toEqual(["P14"]);
    expect(review.avoided.map((item) => item.patternId)).toEqual(["P01", "P02"]);
    expect(review.appeared[0]?.occurrences).toHaveLength(2);
    expect(review.unpredicted.map((item) => item.patternId)).toEqual(["P03"]);
    expect(review.reviewNext.map((item) => item.patternId)).toEqual(["P14", "P03"]);
    expect(review.generalFindings).toEqual([]);
  });

  it("keeps evidence-backed general findings even when a personal finding uses the same source span", () => {
    const writing = "Overall there were more visits abroad.";
    const finding = {
      category: "Sentence structure",
      textSpan: "Overall there",
      hint: "Inspect the opening structure.",
      explanation: "The opening needs a structural change.",
      correction: "Overall, there were more visits abroad.",
    };
    const evidence = filterFinalAuditEvidence(writing, [
      { patternId: "P01", detected: true, textSpan: "Overall there", hint: "Inspect the opening." },
      { patternId: "P02", detected: true, textSpan: "not present", hint: "This must be filtered." },
    ], [finding, { ...finding }, { ...finding, textSpan: "not present" }]);
    expect(evidence.personalDetections).toHaveLength(1);
    expect(evidence.generalFindings).toEqual([finding]);
  });
});
