import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PersonalErrorProfile, profileSchema } from "@/lib/domain";

type UnknownRecord = Record<string, unknown>;

const profileCandidates = () => {
  const configured = process.env.PERSONAL_ERROR_PROFILE_PATH;
  return [
    configured,
    path.resolve(process.cwd(), "../research/personal_error_profile.json"),
    path.resolve(process.cwd(), "data/personal_error_profile.json"),
  ].filter((candidate): candidate is string => Boolean(candidate));
};

const timelineCandidates = () => {
  const configured = process.env.PERSONAL_ERROR_TIMELINE_PATH;
  return [
    configured,
    path.resolve(process.cwd(), "../research/error_timeline.csv"),
    path.resolve(process.cwd(), "data/error_timeline.csv"),
  ].filter((candidate): candidate is string => Boolean(candidate));
};

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Profile must be a JSON object.");
  }
  return value as UnknownRecord;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Normalizes the research artifact in memory. The original JSON is never changed.
 * The first mapping matches the current canonical profile supplied with the study.
 */
export function normalizeProfile(raw: unknown): PersonalErrorProfile {
  const source = asRecord(raw);
  const rawPatterns = source.patterns ?? source.recurring_patterns ?? source.recurringPatterns ?? source.error_patterns;
  if (!Array.isArray(rawPatterns)) {
    throw new Error("Profile does not contain a patterns array.");
  }

  const normalized = rawPatterns.map((entry) => {
    const pattern = asRecord(entry);
    return {
      id: asString(pattern.pattern_id ?? pattern.patternId ?? pattern.id),
      category: asString(pattern.category, "Uncategorized"),
      title: asString(pattern.specific_pattern ?? pattern.title ?? pattern.name),
      rule: asString(pattern.rule ?? pattern.description),
      hint: asString(pattern.hint ?? pattern.preventive_hint ?? pattern.preventiveHint),
      taskScope: asString(pattern.task_scope ?? pattern.taskScope, "General"),
      confidence: asString(pattern.confidence) || undefined,
      examples: asStringArray(pattern.examples),
    };
  });

  const ids = normalized.map((pattern) => pattern.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Profile contains duplicate pattern IDs.");
  }

  const result = profileSchema.safeParse({
    studentId: asString(source.student_id ?? source.studentId, "unknown_student"),
    version: asString(source.profile_version ?? source.version, "unversioned"),
    patterns: normalized.map((pattern) => ({
      id: pattern.id,
      category: pattern.category,
      title: pattern.title,
      rule: pattern.rule,
      hint: pattern.hint,
      taskScope: pattern.taskScope,
      confidence: pattern.confidence,
      examples: pattern.examples,
    })),
  });

  if (!result.success) {
    throw new Error(`Invalid Personal Error Profile: ${result.error.issues[0]?.message ?? "unknown schema error"}`);
  }
  return result.data;
}

export function findExistingPath(candidates: string[]): string | null {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function loadPersonalErrorProfile(): PersonalErrorProfile {
  const profilePath = findExistingPath(profileCandidates());
  if (!profilePath) {
    throw new Error("Personal Error Profile was not found. Add research/personal_error_profile.json or set PERSONAL_ERROR_PROFILE_PATH.");
  }
  return normalizeProfile(JSON.parse(readFileSync(/* turbopackIgnore: true */ profilePath, "utf8")));
}

export function getTimelinePath(): string | null {
  return findExistingPath(timelineCandidates());
}
