# IELTS question bank architecture

## Existing application audit (2026-10-27)

- Frontend/backend: Next.js 16.4.3 App Router. `/app/[[...slug]]` and `/admin/[[...slug]]` render the existing learner and admin shells; route handlers live under `src/app/api`.
- Data/auth: one Supabase Postgres database and Supabase Auth. `public.is_admin()` checks `admin_users`; `src/lib/viewer-role.ts` applies this to pages. Existing curriculum content uses courses, units, lessons, exercise questions and attempts. Study Planner uses `study_tasks`.
- Existing IELTS skill dashboards and live practice remain in place. The bank adds a separate collection without changing existing lessons, `exercise_attempts`, or Study Planner rows.
- Media: existing listening uses external public sources and TTS; no general object storage upload service existed. This migration creates `ielts-audio` and `ielts-images` Supabase Storage buckets for licensed source media.
- Jobs: existing Daily News uses `pg_cron` + `pg_net` and a bearer-protected route. IELTS sync follows that pattern, processing 20 source rows per call and resuming from stored file/row offsets.
- UI: reuses `AdminShell`, `AppShell`, existing buttons/cards/colors and responsive layouts.

## Data flow

`Approved source → licensed commit → JSON/JSONL → normalized content → validation → atomic upsert → review → published version → pinned attempt → result`

The new migration creates `ielts_sources`, `ielts_import_jobs`, `ielts_import_items`, `ielts_exams`, `ielts_exam_versions`, `ielts_attempts`, and `ielts_review_log`. `ielts_upsert_import` atomically creates revisions and skips identical normalized content and metadata. `current_version_id` is the draft under review; `published_version_id` stays on the last approved revision until the new one is published. Learner attempts pin `version_id`, so synchronization cannot rewrite a past answer key or result.

Source JSON is normalized into sections with passages/transcripts, typed questions, options, answer variants and explanations. The original URL, license, attribution, commit and content hash remain in the database. Learner APIs strip answers and explanations until submission. The server calculates raw scores against the pinned version. Writing and Speaking are saved without an invented automatic score.

Admin APIs authorize every request through Supabase Auth and `is_admin`; student APIs require a verified user. Only server code has the service role key. Content tables have RLS and no student direct reads. Student API responses reveal only approved versions. Manual JSON import requires a recorded rights confirmation. External fetches are restricted to two fixed GitHub domains and repository paths.

## Scope and limits

This release supports licensed GitHub JSON/JSONL, admin normalized JSON, review/publish, published practice, persisted attempts, Reading/Listening grading, scheduler and planner tasks. It does not yet parse arbitrary PDF/DOCX/CSV/ZIP, generate BandReady audio, record Speaking audio, grade essays, offer a full multi-skill mock builder, or convert raw scores to band estimates. Incomplete or media-less records stay unpublished until an admin resolves warnings.
