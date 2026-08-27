import { NextResponse } from "next/server";
import { z } from "zod";
import { logResearchEvent } from "@/lib/session-logger";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  type: z.enum(["hint_dismissed", "pattern_resolved"]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    await logResearchEvent(body);
    return NextResponse.json({ ok: true });
  } catch {
    // Logging must never interrupt tutoring. The response intentionally contains no internal detail.
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
