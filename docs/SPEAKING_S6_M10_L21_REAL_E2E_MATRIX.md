# M10-L21 — Speaking S6 Real Staging E2E Matrix (38 cases)

**Branch:** `codex/speaking-s6-m10-l14-staging`
**Baseline:** M10-L20 final commit `34d6edd`
**Scope:** disposable Supabase staging project only. Production, S7 and all legacy courses stay unchanged.
**Current state:** 38 NOT_RUN. A green CI pipeline is **not** a staging PASS.

## Preconditions
- A disposable Supabase project, isolated deployment, and a reviewed staging-only setup.
- Apply migrations L14 → L15 → L17 in order; verify that all five S6 release gates remain **false** before and after testing.
- Three controlled accounts: admin, learner A with signed S5 evidence, learner B without signed S5 evidence. Never use real learner accounts or production JWTs.
- Use **only** a validated private S6-001 R11 import payload. Never commit any private answers, transcripts, passwords, JWTs, or recordings to public GitHub.
- Browsers/devices: iOS Safari and Android Chrome. Document OS and browser versions when actually tested.
- Prefer real Supabase anon/authenticated REST calls, not service-role simulations, for learner-boundary/RLS tests.
- Enable QA gates and publish content only **inside the disposable staging project** for the explicit access-control test window; restore all gates to false afterward.

## The 38 required scenarios

| ID | Area | Test and expected assertion | Result |
|---|---|---|---|
| S6-E2E-01 | Release & access | Five S6 release gates default to false after clean migrations | NOT_RUN |
| S6-E2E-02 | Release & access | Anon cannot retrieve learner S6 lesson while gates false | NOT_RUN |
| S6-E2E-03 | Release & access | Learner A cannot retrieve learner S6 lesson while gates false | NOT_RUN |
| S6-E2E-04 | Release & access | Learner B cannot retrieve learner S6 lesson while gates false | NOT_RUN |
| S6-E2E-05 | Release & access | Admin can preview isolated staging lesson without publishing | NOT_RUN |
| S6-E2E-06 | Release & access | With staging gates true and verified S5, learner A reads published student content | NOT_RUN |
| S6-E2E-07 | Release & access | Learner B without S5 evidence cannot read published student content | NOT_RUN |
| S6-E2E-08 | Release & access | Withhold S5 proof from learner A; published content becomes inaccessible | NOT_RUN |
| S6-E2E-09 | Release & access | Learner A direct PostgREST cannot read private revision bank | NOT_RUN |
| S6-E2E-10 | Release & access | Learner B direct PostgREST cannot read private revision bank | NOT_RUN |
| S6-E2E-11 | Release & access | Anon direct PostgREST cannot read private revision bank | NOT_RUN |
| S6-E2E-12 | Release & access | Non-admin cannot invoke administrative preview pathway | NOT_RUN |
| S6-E2E-13 | ADD-ONLY import | Admin imports private S6-001 R11 once: HTTP 201 | NOT_RUN |
| S6-E2E-14 | ADD-ONLY import | Admin reimports byte-identical revision: HTTP 409 | NOT_RUN |
| S6-E2E-15 | ADD-ONLY import | Admin submits altered or invalid canonical hash: HTTP 422 | NOT_RUN |
| S6-E2E-16 | ADD-ONLY import | Non-admin cannot import: authorization denied | NOT_RUN |
| S6-E2E-17 | ADD-ONLY import | Revision or lesson identifier mismatch cannot overwrite an existing revision | NOT_RUN |
| S6-E2E-18 | Lesson/session | Guided ten-step navigation persists only the owner’s progress | NOT_RUN |
| S6-E2E-19 | Lesson/session | Guided hint sequence is progressive; model answer is withheld before submission | NOT_RUN |
| S6-E2E-20 | Lesson/session | Independent starts with only its unseen initial prompt | NOT_RUN |
| S6-E2E-21 | Lesson/session | Mastery follow-up is blocked before submit and shown only after submit | NOT_RUN |
| S6-E2E-22 | Lesson/session | Cross-lesson activity ID is rejected without new attempt | NOT_RUN |
| S6-E2E-23 | Lesson/session | Owner status recovery returns initial question only; no private follow-up | NOT_RUN |
| S6-E2E-24 | Lesson/session | Learner B cannot recover learner A attempt by ID | NOT_RUN |
| S6-E2E-25 | Lesson/session | Identical submit retry returns alreadySubmitted and does not add another answer | NOT_RUN |
| S6-E2E-26 | Lesson/session | Conflicting changed retry receives 409 and preserves original answer | NOT_RUN |
| S6-E2E-27 | Lesson/session | Two concurrent identical submits yield one stored response and safe idempotent outcome | NOT_RUN |
| S6-E2E-28 | Real recording & consent | iOS Safari start-stop playback/upload works for device-supported MIME | NOT_RUN |
| S6-E2E-29 | Real recording & consent | Android Chrome start-stop playback/upload works for device-supported MIME | NOT_RUN |
| S6-E2E-30 | Real recording & consent | Denied microphone permission shows recoverable error and no phantom recording | NOT_RUN |
| S6-E2E-31 | Real recording & consent | Cancel/reset/navigation prevents stale MediaRecorder callback from replacing current take | NOT_RUN |
| S6-E2E-32 | Real recording & consent | Refresh recovery never pretends previous local Blob still exists | NOT_RUN |
| S6-E2E-33 | Real recording & consent | Consent-enabled optional upload stores file only at owner/attempt UUID path | NOT_RUN |
| S6-E2E-34 | Real recording & consent | Consent-disabled session does not upload audio to Storage | NOT_RUN |
| S6-E2E-35 | Deletion, privacy, cleanup | Owner DELETE removes owned attempt and its audio variants | NOT_RUN |
| S6-E2E-36 | Deletion, privacy, cleanup | Learner B DELETE of learner A attempt returns 404 without Storage removal | NOT_RUN |
| S6-E2E-37 | Deletion, privacy, cleanup | Storage deletion error leaves attempt recoverable for owner retry | NOT_RUN |
| S6-E2E-38 | Deletion, privacy, cleanup | Restore five gates to false and verify seeded attempts/audio/test users cleaned | NOT_RUN |

## Recording every real execution
For each ID, enter: run_at_utc (ISO-8601), environment_id (non-secret alias),
role (anon/admin/A/B), HTTP status (if applicable), expected, actual,
PASS/FAIL/BLOCKED, reviewer, and redacted evidence reference.
Use `tests/speaking-s6/m10-l21-e2e-evidence.json` as the initial
machine-readable manifest; never set PASS without reproducible evidence.

## Failure handling / release barrier
- On any cross-user access, private-bank exposure, overwriting existing answers,
  non-consensual upload or leaked audio: stop; log a security issue; reset all QA gates
  and do not publish.
- If no isolated project, safe test credentials, devices or private test bank are
  available, mark affected cases BLOCKED; never invent outcomes.
- Any of these 38 cases left NOT_RUN, BLOCKED or FAIL means **S6 remains
  STAGING_REVIEW_REQUIRED** and **S7 remains locked**.
- Green CI is necessary but not sufficient for a release decision. Independent
  teacher QA, real mobile audio QA and privacy sign-off are still required.
- Confirm cleanup: false QA gates, no seed sessions, no seed recordings, and
  no test account access. Do not run deletion or cleanup against production.

## Evidence file contract
The JSON manifest contains `cases` with IDs and initial `status: NOT_RUN`.
Allowed status: NOT_RUN, PASS, FAIL, BLOCKED. Run evidence belongs only in a
restricted evidence store; the public JSON file should hold references that
contain no learner personal data, audio, private models or tokens.

## Notes
This milestone creates a **test plan and evidence scaffold**. It does not claim
that staging migrations, browser/phone testing, storage cleanup or the 38
tests have been executed.
