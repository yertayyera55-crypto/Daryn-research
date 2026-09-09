import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPersonalErrorProfile, normalizeProfile } from "@/lib/profile";
import { attachObservedHistory, summarizeTimeline } from "@/lib/history";

const canonicalResearchProfile = {
  student_id: "student_001",
  profile_version: "1.0",
  patterns: [
    {
      pattern_id: "P14",
      category: "Verb form / tense",
      specific_pattern: "Present or base verb form used for completed past data",
      rule: "Completed past data needs a past-tense main verb.",
      hint: "Check the time period and the tense of the main verb.",
      task_scope: "Task 1",
      confidence: "High",
      examples: ["the figure increase"],
    },
    {
      pattern_id: "P02",
      category: "Articles",
      specific_pattern: "Missing determiner",
      rule: "A singular countable noun needs a determiner.",
      hint: "Check singular countable nouns.",
      task_scope: "General",
    },
  ],
};

describe("research profile adapter", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("loads the canonical research field names without changing them", () => {
    const profile = normalizeProfile(canonicalResearchProfile);
    expect(profile.studentId).toBe("student_001");
    expect(profile.patterns[0]).toMatchObject({ id: "P14", title: "Present or base verb form used for completed past data" });
  });

  it("rejects invalid or duplicate pattern IDs", () => {
    expect(() => normalizeProfile({ ...canonicalResearchProfile, patterns: [{ ...canonicalResearchProfile.patterns[0], pattern_id: "P14" }, { ...canonicalResearchProfile.patterns[1], pattern_id: "P14" }] })).toThrow("duplicate");
    expect(() => normalizeProfile({ ...canonicalResearchProfile, patterns: [{ ...canonicalResearchProfile.patterns[0], pattern_id: "not-a-pattern" }] })).toThrow("Invalid Personal Error Profile");
  });

  it("uses the server-only JSON environment profile when it is configured", () => {
    vi.stubEnv("PERSONAL_ERROR_PROFILE_JSON", JSON.stringify(canonicalResearchProfile));
    const profile = loadPersonalErrorProfile();
    expect(profile.studentId).toBe("student_001");
    expect(profile.patterns[0]?.id).toBe("P14");
  });

  it("rejects malformed server-only JSON profiles", () => {
    vi.stubEnv("PERSONAL_ERROR_PROFILE_JSON", "not-json");
    expect(() => loadPersonalErrorProfile()).toThrow("PERSONAL_ERROR_PROFILE_JSON");
  });

  it("computes only observable occurrence history from complete essays", () => {
    const profile = normalizeProfile(canonicalResearchProfile);
    const summary = summarizeTimeline("corpus_order,essay_id,task,is_complete,P14,P02\n1,T1_01,Task1,1,1,0\n2,T1_02,Task1,0,1,1\n3,T2_01,Task2,1,0,1", profile);
    expect(summary.completeEssayCount).toBe(2);
    expect(summary.byPattern.P14).toEqual({
      essayCount: 1,
      taskOccurrenceCounts: { Task1: 1, Task2: 0 },
      lastSeenCorpusOrder: 1,
      occurrenceSequence: [{ corpusOrder: 1, essayId: "T1_01", taskType: "Task1" }],
    });
    expect(summary.byPattern.P02).toMatchObject({ essayCount: 1, taskOccurrenceCounts: { Task1: 0, Task2: 1 }, lastSeenCorpusOrder: 3 });
    const applicationProfile = attachObservedHistory(profile, summary);
    expect(applicationProfile.patterns[0].history).toEqual(summary.byPattern.P14);
    expect(applicationProfile.patterns[0].history).not.toHaveProperty("lastSeenDate");
  });
});
