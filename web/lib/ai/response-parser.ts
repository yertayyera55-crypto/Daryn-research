import { z } from "zod";
import { detectionSchema, generalFindingSchema, riskRankingSchema, taskAnalysisSchema } from "@/lib/domain";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The local AI backend returned invalid JSON.");
  }
}

export function parseTaskAnalysis(text: string) {
  return taskAnalysisSchema.parse(parseJson(text));
}

export function parseRiskRanking(text: string) {
  return riskRankingSchema.parse(parseJson(text));
}

export function parseDetections(text: string) {
  const data = z.object({ detections: z.array(detectionSchema).max(60) }).parse(parseJson(text));
  return data.detections;
}

export function parseMoreHelp(text: string) {
  return z.object({
    explanation: z.string().min(1).max(600),
    correction: z.string().min(1).max(600),
  }).parse(parseJson(text));
}

export function parseFinalAudit(text: string) {
  return z.object({
    personalDetections: z.array(detectionSchema).max(60),
    otherFindings: z.array(generalFindingSchema).max(5),
  }).parse(parseJson(text));
}
