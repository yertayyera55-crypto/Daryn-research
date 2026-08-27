import { readFileSync } from "node:fs";
import { PatternHistory, PersonalErrorProfile } from "@/lib/domain";

export type HistorySummary = {
  completeEssayCount: number;
  byPattern: Record<string, PatternHistory>;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

/** Minimal CSV reader because the research timeline is a small, local artifact. */
export function summarizeTimeline(csv: string, profile: PersonalErrorProfile): HistorySummary {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0] ?? "");
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  const complete = rows.filter((row) => ["1", "true", "yes"].includes((row.is_complete ?? "").toLowerCase()));
  const summary: HistorySummary = {
    completeEssayCount: complete.length,
    byPattern: Object.fromEntries(profile.patterns.map((pattern) => [pattern.id, {
      essayCount: 0,
      taskOccurrenceCounts: { Task1: 0, Task2: 0 },
      lastSeenCorpusOrder: null,
      occurrenceSequence: [],
    }])),
  };
  for (const row of complete) {
    for (const pattern of profile.patterns) {
      if (row[pattern.id] === "1") {
        const item = summary.byPattern[pattern.id];
        item.essayCount += 1;
        const task = row.task === "Task1" || row.task === "Task2" ? row.task : undefined;
        if (task) item.taskOccurrenceCounts[task] += 1;
        const corpusOrder = Number.parseInt(row.corpus_order ?? "", 10);
        const resolvedCorpusOrder = Number.isSafeInteger(corpusOrder) && corpusOrder > 0 ? corpusOrder : undefined;
        if (resolvedCorpusOrder && (!item.lastSeenCorpusOrder || resolvedCorpusOrder > item.lastSeenCorpusOrder)) {
          item.lastSeenCorpusOrder = resolvedCorpusOrder;
        }
        item.occurrenceSequence.push({
          corpusOrder: resolvedCorpusOrder,
          essayId: row.essay_id || undefined,
          taskType: task,
        });
      }
    }
  }
  return summary;
}

export function loadHistorySummary(timelinePath: string | null, profile: PersonalErrorProfile): HistorySummary | null {
  return timelinePath ? summarizeTimeline(readFileSync(timelinePath, "utf8"), profile) : null;
}

/** Creates application data without mutating the canonical profile artifact. */
export function attachObservedHistory(profile: PersonalErrorProfile, history: HistorySummary | null): PersonalErrorProfile {
  if (!history) return profile;
  return {
    ...profile,
    patterns: profile.patterns.map((pattern) => ({
      ...pattern,
      history: history.byPattern[pattern.id],
    })),
  };
}
