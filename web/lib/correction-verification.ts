import type { MoreHelp, VerifiedMoreHelp } from "@/lib/ai/types";
import type { Detection, GeneralFinding } from "@/lib/domain";

export type CorrectionComparison = {
  original: string;
  correction: string;
  isIdentical: boolean;
};

function removeWrappingQuotes(value: string) {
  const trimmed = value.trim();
  const pairs: Array<[string, string]> = [["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"]];
  return pairs.some(([start, end]) => trimmed.startsWith(start) && trimmed.endsWith(end))
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

/** Normalizes only display-neutral differences; capitalization and punctuation still matter. */
export function normalizeForCorrectionComparison(value: string) {
  return removeWrappingQuotes(value)
    .normalize("NFKC")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function sentenceContaining(writing: string, textSpan: string) {
  const needle = normalizeForCorrectionComparison(textSpan).toLocaleLowerCase();
  if (!needle) return null;
  const sentences = writing.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [writing];
  return sentences.find((sentence) => normalizeForCorrectionComparison(sentence).toLocaleLowerCase().includes(needle))?.trim() ?? null;
}

/** Rejects a model finding that cannot be tied to the student's current writing. */
export function textSpanExistsInWriting(writing: string, textSpan: string) {
  const needle = normalizeForCorrectionComparison(textSpan).toLocaleLowerCase();
  return Boolean(needle) && normalizeForCorrectionComparison(writing).toLocaleLowerCase().includes(needle);
}

export function compareCorrection({ writing, detection, correction }: { writing: string; detection: Detection; correction: string }): CorrectionComparison {
  const original = sentenceContaining(writing, detection.textSpan) ?? detection.textSpan;
  const normalizedOriginal = normalizeForCorrectionComparison(original);
  const normalizedCorrection = normalizeForCorrectionComparison(correction);
  return { original, correction, isIdentical: normalizedOriginal === normalizedCorrection };
}

/** A verified live correction must remain the correction shown in Level-2 help. */
/** Prevents an unchanged source sentence from being presented as an AI correction. */
export function verifyMoreHelp({ writing, detection, moreHelp }: { writing: string; detection: Detection; moreHelp: MoreHelp }): VerifiedMoreHelp {
  if (!textSpanExistsInWriting(writing, detection.textSpan)) {
    return {
      explanation: "The detailed check could not tie this flag to the current essay, so it is unconfirmed.",
      correction: null,
      verification: "unconfirmed",
    };
  }
  const comparison = compareCorrection({ writing, detection, correction: moreHelp.correction });
  if (comparison.isIdentical) {
    return {
      explanation: "The detailed check did not produce a different corrected version, so this flag is unconfirmed. Treat it as a prompt to review, not as a correction.",
      correction: null,
      verification: "unconfirmed",
    };
  }
  return { ...moreHelp, verification: "confirmed" };
}

/** General final-review findings need both a real source span and a genuine change. */
export function verifyGeneralFinding({ writing, finding }: { writing: string; finding: GeneralFinding }): GeneralFinding | null {
  if (!textSpanExistsInWriting(writing, finding.textSpan)) return null;
  const original = sentenceContaining(writing, finding.textSpan) ?? finding.textSpan;
  if (normalizeForCorrectionComparison(original) === normalizeForCorrectionComparison(finding.correction)) return null;
  return finding;
}
