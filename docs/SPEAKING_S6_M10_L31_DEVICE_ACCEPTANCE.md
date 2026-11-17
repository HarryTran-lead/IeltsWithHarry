# IELTS Speaking S6 — M10-L31: Device Acceptance & Evidence Reconciliation

**Repository/branch:** IeltsWithHarry / `codex/speaking-s6-m10-l14-staging`
**Release:** S6 STAGING_REVIEW_REQUIRED, S7 LOCKED. Production untouched.
**Verification at start:** M10-L30 Quality run for commit
`43ca193ce2a51abe0681575b9c74df41108047df` PASS:
https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44019008825
**Real staging and physical-device evidence:** 0/50 E2E, of which 0/11
tracked device cases. Do not represent synthetic fixture results as human,
mobile-device, privacy or external database evidence.

## 1. Mobile recorder robustness fix

`src/lib/speaking-s6/recording-policy.ts` introduces `RecordingEpoch.fail(token)`,
which invalidates a failed capture epoch exactly once.

`src/features/speaking-s6/use-local-recording.ts` now invalidates the capture
epoch BEFORE handling MediaRecorder `onerror`, stops tracks, clears Blob/URL,
resets elapsed time and displays a recoverable Vietnamese error.

**Why:** Some browsers can invoke `onstop` or `ondataavailable` after
`onerror`. Without invalidation, a faulty take could be reconstructed from
partial data and presented as a valid recorded answer. The current onstop
callback checks the epoch and ignores late events.

`src/lib/speaking-s6/recording-policy.test.ts` includes an explicit
failed-capture/stale-event regression. This is a code-level guard, not
proof of iOS Safari or Android Chrome runtime compatibility.

## 2. New evidence artifacts (11 cases from the existing 50)

- `tests/speaking-s6/m10-l31-device-evidence.json`
  - 11 cases all `NOT_RUN`, with no private audio, account identifiers,
    raw device logs, IP addresses, URLs, JWTs or transcripts.
- `scripts/speaking-s6-l31-device-evidence.mjs`
  - Offline, reads only three committed JSON manifests, checks the 11 device
    outcomes and cross-reconciles their reference, reviewer, timestamp and
    environment alias with the original E2E manifests.
  - For PASS, demands an exact **mobile OS version**, browser name/version,
    device class, observed expected/actual result and restricted `ev:`
    evidence reference.
  - Checks case-specific booleans; e.g. permission denied and no phantom
    Blob, no storage object without consent, a matching independently
    recomputed SHA256, all four invalid upload variants and cross-user RLS.
  - A PASS recorded in the E2E manifest without matching device evidence,
    or vice versa, is rejected.
  - **NEVER changes** E2E statuses, logs, releases, S7 status, permissions,
    reviewer approvals or production data. It cannot authenticate evidence.
- `tests/speaking-s6-l31-device-evidence.test.mjs`
  - 10 synthetic regression tests covering inconsistent statuses, wrong
    browser/platform, missing required assertions, leaked link/identifier,
    mismatched timestamps, incomplete proof and structural validity.
- `.github/workflows/quality.yml`
  - Checks the manifest safely OFFLINE on every staging-branch commit, with
    no service-role key or device user data.

## 3. Exactly which 11 cases

| Case | Device procedure | Required acceptance observations |
|---|---|---|
| S6-E2E-28 | Physical iOS Safari: start, stop, replay and consented upload | supported MIME, real duration, replay and upload succeed |
| S6-E2E-29 | Physical Android Chrome: same flow | supported MIME, real duration, replay and upload succeed |
| S6-E2E-30 | Deny microphone permission | readable recovery error and no phantom Blob |
| S6-E2E-31 | Cancel / navigate while async MediaRecorder callbacks may arrive | old callbacks ignored, existing take not replaced |
| S6-E2E-32 | Refresh during an unfinished session | no fictitious old local Blob; must record again |
| S6-E2E-33 | Consent ON | private object exists only under owner/attempt path |
| S6-E2E-34 | Consent OFF | zero server-side audio objects |
| S6-E2E-44 | No-consent submission | `audioEvidence=not_stored`, zero stored audio objects |
| S6-E2E-45 | Consented submission | SHA-256 independently recomputed from downloaded bytes matches stored evidence; size and MIME agree |
| S6-E2E-46 | Missing/corrupt/MIME-conflicting/duplicate file | all four submissions fail closed; no changed submitted attempt |
| S6-E2E-47 | Direct UPDATE/DELETE and foreign-user READ of Storage | denied by real authenticated Storage RLS |

**Every test must use a genuinely isolated, newly provisioned Supabase
staging project** and rights-cleared synthetic recordings. Devices should be
identified only by general model/class and OS/browser versions, not by
advertising identifiers, phone numbers or serial numbers.

## 4. Physical device operator checklist

**Before each run:** Record the exact git SHA, nonsecret staging alias and
evidence reviewer. Ensure the Vercel preview points to the isolated staging
project and there are no production credentials, users or audio. Apply the
reviewed L14→L28 migrations and keep QA gates false except during a separately
authorized staging-only test window.

**iOS Safari**
1. On a real iPhone/iPad, open isolated HTTPS preview, sign into the dedicated
   staging test learner. Record iOS and Safari version.
2. Allow microphone, record 15–30s of synthetic test speech, stop, replay,
   inspect browser-produced MIME, enable consent and submit.
3. Ensure the file is stored only under the test account and can be retrieved
   by the owning user; compare SHA256 against bytes downloaded with an
   approved operator workflow.
4. Deny permission for a fresh attempt; verify clear error and no Blob.
5. Stop recording during navigation/reset, refresh page, recover session and
   ensure the UI does not invent a preserved local recording.

**Android Chrome**
1. Repeat on a physical Android phone/tablet, recording OS/Chrome versions.
2. Check browser MediaRecorder MIME selection (normally WebM/Opus on supported
   devices, but never assume the format).
3. Test intermittent connectivity, denied permissions, replay, upload retry,
   consent-on and consent-off flows.

**Storage and privacy**
1. Check user A cannot retrieve user B's test audio and cannot UPDATE/DELETE
   through the browser Storage API even as an owner.
2. Confirm owner-authenticated application DELETE removes the owner attempt
   and recording without affecting other accounts.
3. Exercise missing/corrupt-header/MIME-mismatch/duplicate upload cases,
   recording status and failure behavior with NO private file or transcript
   printed in evidence artifacts.
4. After verification, remove isolated seed accounts/attempts/audio and prove
   five QA release gates FALSE. Store sensitive original evidence only in a
   restricted human-review system.

## 5. How to fill the redacted device report

The 11 records are placeholders and remain `NOT_RUN` until personally
observed. For a real PASS, fill:
- `platform`: ios or android
- `browser`: Safari on iOS, Chrome on Android
- `os_version` and `browser_version`: actual observed numeric versions
- `device_kind`: phone or tablet
- `expected`, `actual`: concise, non-sensitive observations
- `run_at_utc`, `reviewer`, `evidence` using `ev:restricted-store/id`
- `details`: **all** booleans and MIME/duration required for that case,
  based on real observations, not template defaults.
- Root `environment_id` and `candidate_sha` must match the actually
  tested staging project and exact release candidate.

After actual independent review, update matching original manifest records
28–34 or supplement records 44–47 with the same status, evidence pointer,
reviewer, environment alias and UTC timestamp. Only then can the offline
reconciler show reviewable metadata. It is never a certification.

## 6. Verification commands

```bash
npm run typecheck
npm run lint
npm test -- tests/speaking-s6-l31-device-evidence.test.mjs src/lib/speaking-s6/recording-policy.test.ts
node scripts/speaking-s6-l31-device-evidence.mjs
node scripts/speaking-s6-l29-release-gate.mjs
npm run build
```

Expected initially: 11/11 device cases NOT_RUN, status HOLD; parent 50-case
gate also HOLD. The `--require-device-evidence` flag exits nonzero until
device evidence is fully reconciled; do NOT enable it as a required CI check
before genuine device execution.

## 7. Release decision

CI green means code and QA metadata structurally pass, NOT that iOS/Android
sessions, Supabase RLS or storage deletion actually passed. Real E2E:
0/50, real physical-device subset: 0/11. Human signoff is still required
for S5, teacher content, audio, privacy and import. S6 remains
STAGING_REVIEW_REQUIRED; S7 LOCKED.

**Next M10-L32:** controlled staging evidence intake, blocking defect
triage and independent review of the full 50-case suite; no automatic
production merge or band-score claims.
