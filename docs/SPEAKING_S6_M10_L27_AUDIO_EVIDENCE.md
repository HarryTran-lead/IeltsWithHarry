# M10-L27 — Speaking S6 Optional Audio Evidence Integrity & Real Staging QA

**Scope:** Speaking S6, Band 6.5; staging branch only.
**Production changes:** NONE. **S6:** STAGING_REVIEW_REQUIRED. **S7:** locked.
**Supabase real staging E2E:** 0/38 verified; no physical iOS/Android test has been executed in this milestone.

## 1. Threat and boundary

Previously, the browser alone supplied `durationSeconds` and `transcript`. Optional retained recordings went directly from browser to a private Supabase Storage bucket. A normal API submission did not check the stored audio. Consent is voluntary and **must remain optional** for self-study. No client-reported transcript, duration, upload MIME or blob size should be treated as verified spoken performance.

The M10-L27 implementation distinguishes only:
- `not_stored`: student did NOT opt in to retain audio (or historical attempt without evidence); session remains a self-report, **no audio provenance**.
- `stored_hash_recorded`: the server retrieved one actual private recording under the owning user's attempt, checked permitted filename and MIME, byte-length (256B to 10MiB) and container *header signature* (WebM EBML, OggS, MP4 ftyp), then recorded a SHA-256 hash of the **downloaded bytes** and the size/type/timestamp on the attempt in the submission update.

Neither state proves genuine spoken voice, correct duration, pronunciation, speaker identity, IELTS band or absence of synthetic speech. A media header check is not a complete file decoder or an anti-spoofing system.

## 2. Files

- `supabase/migrations/202611170008_speaking_s6_audio_evidence_l27.sql`: adds evidence columns and consistency constraints to attempts. Storage RLS gains restrictive DELETE/UPDATE guards so the authenticated browser cannot directly erase or overwrite existing files in the S6 bucket; only the existing owner-authorized session DELETE API, using a service role after owner verification, may remove them.
- `src/lib/speaking-s6/audio-evidence.ts`: validates and fingerprints the private stored Blob using service-role-backed Supabase Storage, with controlled error codes.
- `src/app/api/speaking/s6/session/route.ts`: on submitted consented attempts, checks Storage before committing the submitted attempt; missing/invalid recordings fail closed. For no-consent sessions it never reads Storage and keeps the learning completion self-reported. The API includes `audioEvidence` in successful submit/retry/status responses; no hash or private audio URL is disclosed in the API response.
- `src/features/speaking-s6/lesson.tsx`: learner-facing Vietnamese messages clearly distinguish checksum retention from nonretention and explain retryable failure cases.
- `src/lib/speaking-s6/audio-evidence.test.ts`: mocked Storage tests for allowed formats, invalid MIME/magic, size limits, missing/multiple files and storage failure.
- `tests/speaking-s6-api-boundaries.test.ts`: consent/no-consent mocked API checks for file verification gating and attached checksum.
- `tests/speaking-s6-postgres-rls.test.ts`: uses embedded PGlite for schema and direct Storage DELETE RLS checks.

## 3. Privacy and API behavior

The client-facing workflow remains:
1. Start an authorized attempt. Audio retention consent is optional and immutable for that attempt.
2. Record locally in the browser. Without consent, do not upload audio.
3. With consent, upload the one owner/attempt-scoped audio object privately using the pre-existing Storage policy and `upsert:false`.
4. On Submit, the Next.js server retrieves the stored bytes and checks checksum/metadata. If the upload is missing, ambiguous, oversized, or has an inconsistent header, do NOT mark the attempt submitted; return a safe error and allow recovery.
5. With no consent, the API saves a practice submission as `not_stored`. It does not claim evidence of speech.
6. On explicit owner DELETE, remove the audio object using the service-role-backed API, then delete the owner's attempt. The direct browser Storage DELETE path is now restricted.

### Important release caveats
- Browser-only text and reported duration are **not verified media**. They must NEVER be used for certified band scoring or automatically unlock S7.
- SHA-256 confirms *which bytes were observed by the server at submission time*; it is **not** a cryptographic proof of a microphone-originated recording. The browser can upload prerecorded or synthetic files. A malicious client can still make a consent-free practice submission.
- Container-header checks reject obvious mismatches, but they do not prove a valid playable container, audio duration, human speech, or pronunciation.
- Supabase bucket configuration, Storage RLS and errors must be verified on a DISPOSABLE staging project, not assumed from passing tests.
- There is still a potential edge around an owner-initiated account/session DELETE while a submission is concurrently verifying a recording, because Storage and SQL have no shared transaction; real staging race tests are required.
- Real iOS Safari and Android Chrome recording and permission-denial QA are not part of mock tests.
- Retained audio is personal learner data; privacy policy, data retention and deletion rights require human approval.

## 4. Migration & validation

The required isolated migration order is L14 → L15 → L17 → L25 → L26 → L27, ending with:
`202611170008_speaking_s6_audio_evidence_l27.sql`.

Run on a **disposable Supabase staging project only**. Do not apply the migration to production as part of this task.

Local/CI verification:
    npm ci
    npm run typecheck
    npm run lint
    npm test -- src/lib/speaking-s6/audio-evidence.test.ts tests/speaking-s6-api-boundaries.test.ts tests/speaking-s6-postgres-rls.test.ts
    npm run build

Tests must verify:
- No consent: no Storage access, successful self-study submission marked `not_stored`.
- Consent and no file: HTTP 409, attempt remains started.
- Consent with valid stored file: recorded server SHA-256, size and MIME in the attempted submission.
- Multiple uploads, MIME mismatch, invalid bytes, Storage outage: no submission, no private error leakage.
- Authenticated client cannot directly delete or overwrite S6 Storage audio.
- Owner-authenticated DELETE route still works with service role and removes owned objects.
- Same-identity idempotent retry does not double submit.
- Other-user attempt requests and private-bank requests remain denied.

## 5. Real staging QA (NOT RUN)

Use existing M10-L21 38-case E2E matrix and M10-L23/L26 approved staging playbooks. With disposable admin, learner A and learner B:
- Check start/submit/retry for no consent, with consent, missing audio, corrupted audio, and delete after submit.
- Confirm direct authenticated Storage DELETE/UPDATE are denied, but owner API DELETE works.
- Confirm cross-user attempts/recordings fail; private content remains hidden.
- Confirm cleanup and all five S6 release gates FALSE.
- Verify iOS Safari `audio/mp4`, Android Chrome `audio/webm` and codec-specific behavior on physical devices; record actual versions and evidence.
- Independently assess what kind of authenticity checks are appropriate for optional self-study audio; do not mislabel checksums as anti-cheat.

No action during this milestone can mark the 38 full E2E tests PASS without real signed evidence.

## 6. Next

**M10-L28:** execute real isolated staging audio/ownership tests, investigate storage/submit/delete races, and add optional offline media decoding/voice-activity QA where privacy and consent are supported. Keep S6 and S7 unreleased until release gates are independently signed.
