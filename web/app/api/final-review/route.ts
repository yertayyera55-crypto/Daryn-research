import { redactSecrets } from "@/lib/secrets";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { taskAnalysisSchema, predictedRisksSchema } from "@/lib/domain";
import { buildFinalReview, filterFinalAuditEvidence } from "@/lib/final-review";
import { attachObservedHistory, loadHistorySummary } from "@/lib/history";
import { getTimelinePath, loadPersonalErrorProfile } from "@/lib/profile";
import { logResearchEvent } from "@/lib/session-logger";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  writing: z.string().trim().min(40).max(30_000),
  task: taskAnalysisSchema,
  risks: predictedRisksSchema,
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const sourceProfile = loadPersonalErrorProfile();
    const profile = attachObservedHistory(sourceProfile, loadHistorySummary(getTimelinePath(), sourceProfile));
    const audit = await getAIProvider().finalAudit({
      writing: body.writing,
      task: body.task,
      risks: body.risks,
      profile,
    });
    const evidence = filterFinalAuditEvidence(body.writing, audit.personalDetections, audit.otherFindings);
    const review = buildFinalReview(profile, body.risks, evidence.personalDetections, evidence.generalFindings);
    await logResearchEvent({
      sessionId: body.sessionId,
      type: "final_reviewed",
      payload: {
        wordCount: body.writing.trim().split(/\s+/).length,
        appearedPatternIds: review.appeared.map((item) => item.patternId),
        notDetectedPatternIds: review.avoided.map((item) => item.patternId),
        unpredictedPatternIds: review.unpredicted.map((item) => item.patternId),
        generalFindingCategories: review.generalFindings.map((item) => item.category),
      },
    });
    return NextResponse.json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete the final review.";
    const status = error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: redactSecrets(message) }, { status });
  }
}
