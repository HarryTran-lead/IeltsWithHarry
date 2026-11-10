# Existing Writing system audit — 2026-11-10

Baseline: `8c4b848e` on `main`; implementation branch `codex/writing-auto-grading`. The attached ZIP is a product specification, not executable model weights or a license grant.

| Concern | Existing location | Finding |
| --- | --- | --- |
| Student Writing route | `src/features/portal.tsx`, `src/features/ielts/ielts-skill-dashboard.tsx` | Academic Task 1/2 live editor and published question bank are reachable in production. |
| Bank essay editor | `src/features/ielts/bank-writing.tsx` | Structured paragraphs or free text; writes `answers.__response`. |
| Submit/autosave | `src/features/ielts/bank-student.tsx`, `src/app/api/ielts/bank/attempt/route.ts` | Existing save and submit route; on submit `submitAttempt` persists answers once. |
| Stored attempt | `public.ielts_attempts` in `202610270001_ielts_question_bank.sql` | `id`, `user_id`, `exam_id`, immutable `version_id`, `answers`, state, timestamps. RLS permits owner select. Server writes via service role after authenticated ownership check. |
| Prompt/visual | `public.ielts_exam_versions.content` | Pinned per attempt. `prompt`, `visual`, `imageUrl`, `figureDescription`; no verified chart-fact table before this change. |
| Old grading | `src/app/api/ielts/bank/writing-feedback/route.ts` | Synchronous Gemini call stored `notes.__ai_feedback`; no evidence offsets, calibration or model version. Existing feedback remains readable. |
| Result/history | `src/features/ielts/bank-student.tsx`, `bank-catalog.tsx`, `bank-library.tsx` | Result page and past attempts already exist; no teacher-reviewed grading history. |
| Admin authorization | `src/lib/ielts-bank/server.ts`, `public.is_admin()` | Admin role is verified through server-side Supabase RPC; no distinct teacher role. |
| Deployment | `docs/ENVIRONMENTS.md` | `develop` Preview uses separate Supabase; `main` deploys Vercel production. No private Writing inference worker exists. |

Data path: `ielts_exam_versions` → `ielts_attempts` → `writing_grading_jobs` (immutable prompt/visual/essay snapshot) → `writing_grading_results` → student result UI. `writing_grading_source_facts` attaches verified Task 1 facts to an exam version. `writing_teacher_reviews` stores admin labels separately from model output.

Migration `202611100004_writing_grading_foundation.sql` creates new tables and policies only. It does not alter old attempt IDs, answers, `writing_drafts`, or legacy feedback. Before applying to development, take a Supabase database backup and verify the project ref is `bhactqaxcvusmpeooxwi`. Production ref is `vpkhriywprepuhrbarye`; do not apply there until staging review. Rollback code by disabling `WRITING_AUTOGRADING_ENABLED`; retain additive tables/results for audit and avoid dropping learner data.

Status at audit: submission/history implemented; evidence-based local grading, verified Task 1 facts, calibration, teacher QA and inference infrastructure missing. This branch implements a disabled foundation and contract. Live scoring remains blocked by model, rights and evaluation gates.
