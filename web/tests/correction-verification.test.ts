import { describe, expect, it } from "vitest";
import { compareCorrection, normalizeForCorrectionComparison, textSpanExistsInWriting, verifyGeneralFinding, verifyMoreHelp } from "@/lib/correction-verification";
import type { Detection } from "@/lib/domain";

const detection: Detection = {
  patternId: "P02",
  detected: true,
  textSpan: "after 3 month",
  hint: "Inspect this time expression.",
};

describe("correction verification", () => {
  it("treats quotes and whitespace as display-only differences", () => {
    expect(normalizeForCorrectionComparison('  “After 3 months.”  ')).toBe("After 3 months.");
  });

  it("blocks a suggested correction that is the same as the original source sentence", () => {
    const result = verifyMoreHelp({
      writing: "In the beginning, eggs hatch after 3 months, then fish appear.",
      detection: { ...detection, textSpan: "after 3 months" },
      moreHelp: { explanation: "This is a time expression.", correction: "In the beginning, eggs hatch after 3 months, then fish appear." },
    });
    expect(result).toEqual({
      explanation: "The detailed check did not produce a different corrected version, so this flag is unconfirmed. Treat it as a prompt to review, not as a correction.",
      correction: null,
      verification: "unconfirmed",
    });
  });

  it("keeps a correction that changes punctuation or grammar", () => {
    const result = verifyMoreHelp({
      writing: "Overall there were more visits abroad.",
      detection: { ...detection, patternId: "P01", textSpan: "Overall there" },
      moreHelp: { explanation: "An introductory marker needs a comma.", correction: "Overall, there were more visits abroad." },
    });
    expect(result).toMatchObject({ correction: "Overall, there were more visits abroad.", verification: "confirmed" });
  });

  it("does not confirm Level-2 help when the detected source span is absent", () => {
    const result = verifyMoreHelp({
      writing: "Overall, there were more visits abroad.",
      detection: { ...detection, textSpan: "not in this essay" },
      moreHelp: { explanation: "This would be a problem.", correction: "A changed sentence." },
    });
    expect(result).toMatchObject({ correction: null, verification: "unconfirmed" });
  });

  it("does not dismiss a real capitalization change as identical", () => {
    const comparison = compareCorrection({
      writing: "Following by next fry becomes a parr, which develops finger marking.",
      detection: { ...detection, textSpan: "becomes a parr" },
      correction: "Following by next fry becomes a Parr, which develops finger marking.",
    });
    expect(comparison.isIdentical).toBe(false);
  });

  it("accepts only final findings with a source span and a changed correction", () => {
    const writing = "Overall there were more visits abroad.";
    const valid = {
      category: "Punctuation",
      textSpan: "Overall there",
      hint: "Inspect the opening.",
      explanation: "The introductory marker needs a comma.",
      correction: "Overall, there were more visits abroad.",
    };
    expect(textSpanExistsInWriting(writing, valid.textSpan)).toBe(true);
    expect(verifyGeneralFinding({ writing, finding: valid })).toEqual(valid);
    expect(verifyGeneralFinding({ writing, finding: { ...valid, correction: writing } })).toBeNull();
    expect(verifyGeneralFinding({ writing, finding: { ...valid, textSpan: "not in the essay" } })).toBeNull();
  });
});
