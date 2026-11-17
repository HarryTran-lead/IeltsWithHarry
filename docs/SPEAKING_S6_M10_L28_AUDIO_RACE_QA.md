# M10-L28 — IELTS Speaking S6 Audio QA & Delete/Submit Race Audit

**Scope:** S6 (Band 6.5), branch `codex/speaking-s6-m10-l14-staging`.
**Release:** S6 STAGING_REVIEW_REQUIRED. S7 LOCKED. Real Supabase E2E remains **0/38 evidenced**.
**Production:** no migrations, code deployment, private bank or learner audio modified.

## 1. Resolved L27 migration defect
GitHub CI for L27 exposed a malformed, duplicated SQL fragment in
`supabase/migrations/202611170008_speaking_s6_audio_evidence_l27.sql`.
The migration was rewritten with one complete CHECK constraint and Storage
restrictive policies, rather than adding a follow-up migration on top of
invalid SQL. This repair must pass PGlite/CI before any isolated staging work.

## 2. Delete/submit race design
New migration:
`supabase/migrations/202611170009_speaking_s6_delete_race_l28.sql`.

- Adds `deletion_requested_at` to attempts; the field defaults NULL.
- Storage INSERT policy now requires `deletion_requested_at IS NULL`, in
  addition to prior owner, consent, phase, filename and age rules.
- Owner-only DELETE API first attempts a conditional SQL UPDATE marking
  `deletion_requested_at`, then removes the three owner-derived candidate
  Storage keys, then deletes the marked DB row.
- If Storage deletion fails, the marked DB row remains. The same owner can
  retry DELETE; the attempt cannot be submitted or resumed while marked.
- `submit` now atomically checks `deletion_requested_at IS NULL` in its
  UPDATE predicate; even if file validation was underway when deletion began,
  a late submit cannot persist a completed attempt after the marker commits.
- `status`, `followup` and `guidedFeedback` return HTTP 409 with a stable
  error code for an already-marked attempt.
- The app explains this condition in Vietnamese.

### Race outcomes
| Sequence | Expected |
|---|---|
| Submit commits first | DELETE subsequently marks row, removes audio and row |
| DELETE marks first | Late submit update affects zero rows; no completed evidence saved |
| DELETE starts during file checksum download | Checksum may finish, but post-check submit is blocked by SQL tombstone |
| Storage delete fails | Row remains marked, owner may retry DELETE; no submit allowed |
| Retry DELETE with existing tombstone | Reattempt cleanup; no new tombstone created |
| Attempt belongs to another user | Return 404 without marking/reading/removing audio |

**Non-atomic external side effects:** SQL and Storage are different systems,
so this is a recoverable, fail-closed workflow, not a globally atomic delete.
A crash after marking the row requires an explicit retry or a separately
authorized orphan-cleanup process. We do not enable unsupervised deletion in
this milestone.

## 3. Offline audio technical QA (no token-based AI)
`services/audio-worker/s6_audio_qa.py` is an isolated local-only FFmpeg
inspector. It accepts an authorized, consented local .webm/.mp4/.ogg file, max
10 MiB, decodes it to mono 16 kHz float PCM, then calculates:
- Actual decoded duration and whether it is 1–180 seconds.
- RMS energy, peak, 100ms-frame active-signal fraction and clipping fraction.
- A conservative `PASS_TECHNICAL`, `NO_MEASURABLE_SIGNAL`,
  `POSSIBLE_CLIPPING`, `DURATION_OUT_OF_RANGE` or decoding error verdict.

A pure sine wave can pass signal checks, and real quiet speech can fail them.
The tool explicitly returns `speech_verified=false`. It must NOT assign
a band score, assert identity, claim microphone authenticity, or automatically
discard learner work based on this advisory-only report.

### Offline operation (only with user permission and local copy)
From repository root on a machine with Python, numpy and imageio-ffmpeg:

    python services/audio-worker/s6_audio_qa.py /local/consented/recording.webm

The command prints JSON *metrics only*, never uploads, transcribes or prints
audio content or user identifiers. Do not commit local recordings, file paths,
JWTs, Storage URLs or learner transcripts to GitHub.

### Regression suites
- `services/audio-worker/test_s6_audio_qa.py` tests silence, synthetic tone,
  duration, clipping, unsupported input and a truly decoded synthetic Ogg/Opus
  fixture using FFmpeg. The tone test proves signal detection, NOT speech.
- `tests/speaking-s6-api-boundaries.test.ts` checks tombstone handling,
  conditional submit and a deletion marker arriving between SELECT and UPDATE.
- `tests/speaking-s6-deletion.test.ts` checks owner-only mark/remove/delete,
  retry after Storage failure and already-marked deletion.
- `tests/speaking-s6-postgres-rls.test.ts` applies L14→L28 in disposable
  PGlite and checks storage restrictions and no late submit after tombstone.
- `.github/workflows/quality.yml` discovers all `test_*.py` audio-worker
  Python tests.

## 4. Real staging and physical-device acceptance (NOT RUN)
Use a separate, disposable Supabase project, isolated Vercel preview, and
explicit operator approval. Run migrations L14 → L15 → L17 → L25 → L26 →
L27 (repaired) → L28. **Never apply them to production in this milestone.**

Required manual scenarios and redacted evidence:
1. Android Chrome: start/stop, supported WebM/Opus, replay, consent on/off,
   expired permissions, corrupted upload and failed network retry.
2. iOS Safari: audio/mp4 recording, MIME/container agreement, permission
   refusal, navigation during recording, refresh/recovery and retry.
3. Genuine Supabase two-account Storage: own upload can be read but not
   updated/deleted by browser; other-user storage inaccessible.
4. Begin submit while concurrent DELETE starts: verify no resurrected
   submitted row or orphan audio; test both request orderings.
5. Fail a Storage delete intentionally: ensure pending marker, restore
   Storage connectivity and retry deletion successfully.
6. Check no private Mastery follow-up/answer is exposed early.
7. Clean all isolated staging fixtures. Confirm five QA gates remain false.

Each run needs expected/actual, timestamp, environment alias, device/browser
version, reviewer, and a redacted evidence pointer. Update the existing
M10-L21 38-case matrix only after an independently verified real test. Offline
FFmpeg and mocked/PGlite successes do **not** count toward the 38.

## 5. Remaining blockers
- We have no certified source-of-speech identity, microphone authenticity
  or automated IELTS band estimate. `transcript` and
  `durationSeconds` remain user-supplied self-study fields.
- There is no independent live staging sign-off and no real iOS/Android
  device evidence at the time of authoring.
- Background cleanup of permanently abandoned deletion markers requires
  a reviewed retention/privacy design; it must not silently erase data.
- In production, an FFmpeg check needs an authorized, consent-aware private
  worker; it is deliberately *not* part of the serverless submit path.

**Next: M10-L29 — Final isolated staging execution, true browser/device QA
and signed security + teacher/audio/privacy/import release decision.**
