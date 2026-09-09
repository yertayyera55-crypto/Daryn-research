import { redactSecrets } from "@/lib/secrets";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { verifyMoreHelp } from "@/lib/correction-verification";
import { detectionSchema, taskAnalysisSchema } from "@/lib/domain";
import { attachObservedHistory, loadHistorySummary } from "@/lib/history";
import { getTimelinePath, loadPersonalErrorProfile } from "@/lib/profile";
import { logResearchEvent } from "@/lib/session-logger";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  task: taskAnalysisSchema,
  detection: detectionSchema,
  writing: z.string().trim().min(1).max(30_000),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const sourceProfile = loadPersonalErrorProfile();
    const profile = attachObservedHistory(sourceProfile, loadHistorySummary(getTimelinePath(), sourceProfile));
    const draftMoreHelp = await getAIProvider().getMoreHelp({ task: body.task, detection: body.detection, profile, writing: body.writing });
    const moreHelp = verifyMoreHelp({ writing: body.writing, detection: body.detection, moreHelp: draftMoreHelp });
    await logResearchEvent({
      sessionId: body.sessionId,
      type: "more_help_requested",
      payload: { patternId: body.detection.patternId, textSpan: body.detection.textSpan, hintLevel: 2, correctionVerification: moreHelp.verification },
    });
    return NextResponse.json({ moreHelp });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not provide more help.";
    const status = error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: redactSecrets(message) }, { status });
  }
}
