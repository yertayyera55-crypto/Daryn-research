import { redactSecrets } from "@/lib/secrets";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { textSpanExistsInWriting } from "@/lib/correction-verification";
import { taskAnalysisSchema, predictedRisksSchema } from "@/lib/domain";
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
    const detected = await getAIProvider().validateWriting({
      writing: body.writing,
      task: body.task,
      risks: body.risks,
      profile,
      scope: "fullEssay",
    });
    const detections = detected.filter((detection) => textSpanExistsInWriting(body.writing, detection.textSpan));
    await Promise.all(detections.map((detection) => logResearchEvent({
      sessionId: body.sessionId,
      type: "intervention_shown",
      payload: { patternId: detection.patternId, textSpan: detection.textSpan, hint: detection.hint, hintLevel: 1, confidence: detection.confidence },
    })));
    return NextResponse.json({ detections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate the writing.";
    const status = error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: redactSecrets(message) }, { status });
  }
}
