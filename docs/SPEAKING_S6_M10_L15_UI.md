# M10-L15 — Speaking S6 10-step learner UI (staging)

The UI is at /app/speaking/s6/S6-001?preview=1 for an admin. Normal learner calls stay LOCKED until global QA gates AND individual S5 eligibility are approved. No stage release is performed by this patch.

## Scope
- Ten-step bilingual navigation, persisted as self-study progress.
- Guided: three progressive hints, speech recording, private model/translation only after submission.
- Independent and Mastery: prompts delivered only on session start; Mastery follow-up only after initial submission.
- Optional private audio upload, with explicit consent at START; audio is uploaded before attempt submission, matching Storage policy (phase='started').
- +2/+7/+21 spaced review due dates; self-reported completion requires local recording >=10s but is not certification.
- Admin preview can exercise staging sessions without enabling global release. Preview attempts and progress are separated.
- No AI scoring, no S7 unlock, no modifications to legacy course package importer or storage.

## Apply to a fresh staging environment
1. Merge L14 code to a disposable branch/project; apply migration 202611170003 before 202611170004.
2. npm ci; npm run typecheck; npm run lint; npm test; npm run build.
3. Import S6-001 through admin API only after reconciling payload hashes; duplicate should return 409.
4. Log in as admin and open /app/speaking/s6/S6-001?preview=1. Test all steps and optional upload.
5. Verify learner accounts return 404 until both release gates and per-user S5 verified evidence exist.
6. Test two learners' private recordings cannot be read cross-account.
7. Check 3-tier hints, Guided feedback only after submit, and Mastery follow-up after submit.
8. Verify review due dates; do not treat progress as speaking score.
9. Perform iOS Safari and Android Chrome micro/mime tests.

## Blockers / known limits
- Existing payloads contain blank learning_content for several theoretical steps; teacher-authored theory needs to be populated.
- S5 eligibility has no official data pipeline yet, so nobody becomes eligible by this patch.
- The app has no automated valid speech verification, so submitted duration is not certified.
- A full repo build, real Supabase RLS test and mobile recording test have NOT been executed in this chat.
- The public GitHub branch contains no private S6 answer banks or staging JSON.
