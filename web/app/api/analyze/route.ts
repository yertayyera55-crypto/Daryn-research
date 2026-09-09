import { redactSecrets } from "@/lib/secrets";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { attachObservedHistory, loadHistorySummary } from "@/lib/history";
import { getTimelinePath, loadPersonalErrorProfile } from "@/lib/profile";
import { logResearchEvent } from "@/lib/session-logger";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  taskPrompt: z.string().trim().min(20).max(12_000),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const sourceProfile = loadPersonalErrorProfile();
    const history = loadHistorySummary(getTimelinePath(), sourceProfile);
    const profile = attachObservedHistory(sourceProfile, history);
    const provider = getAIProvider();
    const task = await provider.analyzeTask({ taskPrompt: body.taskPrompt });
    const ranking = await provider.rankRisks({ task, profile });
    await logResearchEvent({
      sessionId: body.sessionId,
      type: "session_started",
      payload: {
        taskPrompt: body.taskPrompt,
        taskAnalysis: task,
        highPriorityPatterns: ranking.highPriority,
        profilePatternCount: profile.patterns.length,
        completeEssayCount: history?.completeEssayCount ?? null,
      },
    });
    const highPriority = ranking.highPriority.map((risk) => ({
      ...risk,
      name: profile.patterns.find((pattern) => pattern.id === risk.patternId)?.title ?? risk.patternId,
    }));
    return NextResponse.json({ task, highPriority, profileSummary: { patternCount: profile.patterns.length, historyEssayCount: history?.completeEssayCount ?? null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not analyze this task.";
    const status = error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: redactSecrets(message) }, { status });
  }
}
