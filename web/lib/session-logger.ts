import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type LogEvent = {
  sessionId: string;
  type: "session_started" | "intervention_shown" | "more_help_requested" | "hint_dismissed" | "pattern_resolved";
  payload: Record<string, unknown>;
};

export async function logResearchEvent(event: LogEvent) {
  if (process.env.RESEARCH_LOGGING === "false") return;
  const directory = path.join(process.cwd(), ".local-data");
  await mkdir(directory, { recursive: true });
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  await appendFile(path.join(directory, "sessions.jsonl"), `${JSON.stringify(record)}\n`, "utf8");
}
