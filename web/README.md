# Personalized IELTS Writing Mentor (Milestone 1)

This isolated Next.js app is a local prototype for a personalized real-time IELTS writing mentor. It does not edit a student's writing. It uses a student's longitudinal recurring-error profile to analyze the task, prioritize current risks, and give selective hints after a writing pause.

```text
Past essays → Personal Error Profile → task context → risk ranking
          → real-time validation → personalized hint
```

`P01`, `P14`, and similar labels are stable research IDs: they link the profile, timeline, logs, and experiments. They are not the knowledge itself. The server uses each pattern's rule, examples, scope, confidence, and supported occurrence history.

The displayed Top-3 are only the current **high-priority** risks. The application continues to load the complete profile; a later milestone can introduce medium-priority monitoring without changing the profile format.

## Add the canonical research profile

No profile was present in the repository when this prototype was created. Add the original, canonical artifact without rewriting it at either:

- `research/personal_error_profile.json` (repository root), or
- a path supplied through `PERSONAL_ERROR_PROFILE_PATH`.

To include longitudinal counts in risk prioritization, also add the original `research/error_timeline.csv` or set `PERSONAL_ERROR_TIMELINE_PATH`. Both paths may point to your existing research directory; the app only reads them.

The loader accepts common research-field names such as `patterns`, `recurring_patterns`, and `error_patterns`, then normalizes them in memory. It rejects entries without valid pattern IDs; it never modifies the source artifact. From the timeline it derives only observed occurrence information: essay count, Task 1/Task 2 counts, `lastSeenCorpusOrder`, and an occurrence sequence. It does not invent dates or semantic task relevance.

## Run locally

```bash
cd web
npm install
npm run dev
```

The default server-side provider calls `codex exec` with an output JSON schema, no shell interpolation, a timeout, and a one-request concurrency limit. `CodexCLIProvider` is a local MVP adapter, not a required production architecture. The provider interface keeps task analysis, risk ranking, validation, and requested Level-2 help separate so a Gemini or OpenAI implementation can be added later.

## Local research data

When `RESEARCH_LOGGING` is not `false`, session and intervention events are appended to `web/.local-data/sessions.jsonl`. This directory is ignored by Git. Events cover analyzed sessions, Level-1 hints, Level-2 requests, dismissals, and observed resolution after revalidation. Do not store secrets in the log.

## Scientific scope

This prototype demonstrates an engineering workflow, not a claim that personalized prediction has proven superior to a baseline. Existing research results should be reported separately, including their limited and unstable predictive signal.
