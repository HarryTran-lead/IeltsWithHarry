# Speaking S6 — M10-L14 staged integration (DRAFT)

This branch contains isolated **server-side staging infrastructure only**. No S6 learner UI or migration has been deployed; no private question banks or 44 import JSON payloads are committed.

## Reason for separation
The existing course-package importer uses upserts and publishes lesson content. The existing package_lesson_content is broadly readable. Neither is suitable for an unseen S6 Mastery bank.

## What this branch adds
- One consolidated migration for release gates (all false), learner lesson revisions, server-only private banks, attempts and private recording storage.
- Authenticated admin-only, ADD-ONLY import endpoint validating canonical SHA-256 of student and private payloads.
- Learner lesson preview route returning student content only.
- Server-controlled Guided / Independent / Mastery sessions: Mastery follow-up after first submit only.
- Account-scoped attempt deletion; recording MIME/consent restrictions.

## Warning / blockers
1. **Do not apply this migration to production.** First rehearse on a disposable Supabase staging project with two learners and one admin.
2. No new UI has been wired. Browser and phone audio recording has not been tested for S6.
3. No learner-specific S5 prerequisite check is implemented. Keep every global gate **false** and do not publish S6.
4. A submitted text and duration are not evidence of a valid spoken performance and do not award an IELTS band or unlock S7.
5. No retention automation or reviewer-signed editorial QA is in place.
6. Project-wide typecheck/build and database RLS tests must be run in a full repo checkout with dependencies.

## Checklist in staging checkout
Run npm ci, npm run typecheck, npm run lint, npm test, npm run build. Execute migration on a disposable Supabase project; check RLS with anon/learnerA/learnerB/admin; import only S6-001; retry to confirm 409; tamper with hash to confirm 422; ensure unpublished lessons return 404; validate per-user S5 readiness before any release.
