import { z } from "zod";

export const taskTypeSchema = z.enum(["Task1", "Task2"]);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const patternOccurrenceSchema = z.object({
  corpusOrder: z.number().int().positive().optional(),
  essayId: z.string().min(1).optional(),
  taskType: taskTypeSchema.optional(),
});
export type PatternOccurrence = z.infer<typeof patternOccurrenceSchema>;

export const patternHistorySchema = z.object({
  essayCount: z.number().int().nonnegative(),
  taskOccurrenceCounts: z.object({
    Task1: z.number().int().nonnegative(),
    Task2: z.number().int().nonnegative(),
  }),
  lastSeenCorpusOrder: z.number().int().positive().nullable(),
  occurrenceSequence: z.array(patternOccurrenceSchema),
});
export type PatternHistory = z.infer<typeof patternHistorySchema>;

export const taskAnalysisSchema = z.object({
  taskType: taskTypeSchema,
  subtype: z.string().min(1).max(80),
  timeOrientation: z.enum(["past", "present", "future", "mixed", "not_applicable"]),
  languageDemands: z.array(z.string().min(1).max(120)).min(1).max(6),
  rationale: z.string().min(1).max(500),
});
export type TaskAnalysis = z.infer<typeof taskAnalysisSchema>;

export const patternSchema = z.object({
  id: z.string().regex(/^P\d{2}$/),
  category: z.string().min(1),
  title: z.string().min(1),
  rule: z.string().min(1),
  hint: z.string().min(1),
  taskScope: z.string().min(1),
  confidence: z.string().optional(),
  examples: z.array(z.string()).default([]),
  history: patternHistorySchema.optional(),
});
export type PersonalPattern = z.infer<typeof patternSchema>;

export const profileSchema = z.object({
  studentId: z.string().min(1),
  version: z.string().min(1),
  patterns: z.array(patternSchema).min(1),
});
export type PersonalErrorProfile = z.infer<typeof profileSchema>;

export const riskSchema = z.object({
  patternId: z.string().regex(/^P\d{2}$/),
  reason: z.string().min(1).max(420),
  preventiveHint: z.string().min(1).max(280),
});
export type PredictedRisk = z.infer<typeof riskSchema>;

export const detectionSchema = z.object({
  patternId: z.string().regex(/^P\d{2}$/),
  detected: z.literal(true),
  textSpan: z.string().min(1).max(500),
  hint: z.string().min(1).max(280),
  moreHelp: z.string().min(1).max(360).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type Detection = z.infer<typeof detectionSchema>;

/** A clear issue found in the current essay, but not yet a recurring personal pattern. */
export const generalFindingSchema = z.object({
  category: z.string().min(1).max(100),
  textSpan: z.string().min(1).max(500),
  hint: z.string().min(1).max(280),
  explanation: z.string().min(1).max(600),
  correction: z.string().min(1).max(700),
});
export type GeneralFinding = z.infer<typeof generalFindingSchema>;

export const PREDICTED_RISK_COUNT = 4;

export const predictedRisksSchema = z
  .array(riskSchema)
  .length(PREDICTED_RISK_COUNT)
  .superRefine((risks, ctx) => {
    const ids = risks.map((risk) => risk.patternId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Risk IDs must be unique." });
    }
  });

export const riskRankingSchema = z.object({
  highPriority: predictedRisksSchema,
});
export type RiskRanking = z.infer<typeof riskRankingSchema>;

export function validateKnownPatternIds<T extends { patternId: string }>(
  values: T[],
  profile: PersonalErrorProfile,
): T[] {
  const knownIds = new Set(profile.patterns.map((pattern) => pattern.id));
  const unknown = values.filter((value) => !knownIds.has(value.patternId));
  if (unknown.length > 0) {
    throw new Error(`Provider returned unknown pattern IDs: ${unknown.map((item) => item.patternId).join(", ")}`);
  }
  return values;
}
