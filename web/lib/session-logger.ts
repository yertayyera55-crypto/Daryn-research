import { redactSecrets } from "@/lib/secrets";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type LogEvent = {
  sessionId: string;
  type: "session_started" | "intervention_shown" | "more_help_requested" | "hint_dismissed" | "pattern_resolved" | "final_reviewed";
  payload: Record<string, unknown>;
};

export async function logResearchEvent(event: LogEvent) {
  // Vercel Functions have a read-only application filesystem. Production logging
  // needs a hosted sink; until one is configured, it must not block tutoring.
  if (process.env.RESEARCH_LOGGING === "false" || process.env.VERCEL === "1") return;
  const directory = path.join(process.cwd(), ".local-data");
  await mkdir(directory, { recursive: true });
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  await appendFile(path.join(directory, "sessions.jsonl"), `${JSON.stringify(record, (_key, value) => typeof value === "string" ? redactSecrets(value) : value)}\n`, "utf8");
}
