# ErrorEcho (Milestone 1)

This isolated Next.js app is a local prototype for a personalized real-time IELTS writing mentor. It does not edit a student's writing. It uses a student's longitudinal recurring-error profile to analyze the task, prioritize current risks, and give selective hints after a writing pause.

```text
Past essays → Personal Error Profile → task context → risk ranking
          → real-time validation → personalized hint
          → final quality gate: personal patterns + separate new high-confidence issues
```

`P01`, `P14`, and similar labels are stable research IDs: they link the profile, timeline, logs, and experiments. They are not the knowledge itself. The server uses each pattern's rule, examples, scope, confidence, and supported occurrence history.

The displayed Top-4 are only the current **high-priority** risks. The application continues to load the complete profile; a later milestone can introduce medium-priority monitoring without changing the profile format. During writing, the mentor checks the full current draft after a pause, but only against the Top-4. The first hint is intentionally brief. Selecting **Show explanation & correction** sends a separate Level-2 request and reveals why the exact text was flagged plus one corrected version; the editor is never changed automatically. Selecting **Got it** dismisses that exact live finding for the current writing session, so it does not reappear after later checks. When the student selects **Finish & review**, a separate final model audits the entire essay once: it groups occurrences of all known personal patterns and, in a distinct section, may report up to five new high-confidence issues. Those new findings never modify the canonical profile or become predictive errors automatically. This is selective feedback, not a full IELTS score or a guarantee that no other errors exist.

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

The recommended server-side provider is Gemini API. Set `AI_PROVIDER=gemini` and add `GEMINI_API_KEY` in `web/.env.local`; the key is read only by route handlers and is never sent to the browser. `GEMINI_MODEL_FAST` defaults to `gemini-3.5-flash-lite` for task analysis, Top-4 ranking, and live checks. `GEMINI_MODEL_SMART` defaults to `gemini-3.5-flash` for requested Level-2 explanations. `GEMINI_MODEL_FINAL` defaults to `gemini-3.6-flash` and is called only once per changed draft after **Finish & review**. Existing `GEMINI_MODEL` remains a backward-compatible fast-model setting. Gemini receives the same JSON schemas and the application re-validates every response locally.

`AI_PROVIDER=codex` remains a local fallback: it calls `codex exec` with an output JSON schema, no shell interpolation, and a timeout. The provider interface keeps task analysis, risk ranking, validation, and requested Level-2 help separate.

## Local research data

When `RESEARCH_LOGGING` is not `false`, session and intervention events are appended to `web/.local-data/sessions.jsonl`. This directory is ignored by Git. Events cover analyzed sessions, Level-1 hints, Level-2 requests, dismissals, and observed resolution after revalidation. Do not store secrets in the log.

## Scientific scope

This prototype demonstrates an engineering workflow, not a claim that personalized prediction has proven superior to a baseline. Existing research results should be reported separately, including their limited and unstable predictive signal.

API credentials remain in the ignored `web/.env.local` file (owner-only file permissions). Never put real credentials in `.env.example` or `NEXT_PUBLIC_*` variables. API error messages and research log strings mask configured secrets; upstream Gemini error bodies are not forwarded to the browser.
