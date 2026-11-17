# Grammar Garden: editorial A1–C2 dataset

The production Grammar route uses the bundled canonical `LEVELS/*/ALL_LEARN.json`
and `LEVELS/*/ALL_QUESTIONS.json` from
`English_Skill_Lab_Grammar_A1_C2_180_Lessons_14455_ALL_EDITORIAL_DRAFT.zip`.
The source ZIP SHA-256 is
`CF82D1A11FB54C144D9F902CB458F15246E991AC3A89E29935FD20EE78598737`.
Run `python scripts/import-grammar-editorial.py <zip>` to regenerate the six
server-side level files and the client catalog in `src/data/grammar-editorial/`.
The `BY_LESSON` and source archive copies are not imported. No production
Supabase curriculum rows are reset or seeded.

The package contains 180 lessons and 14,455 unique questions. All questions
retain `publishable: false`; the learner UI labels them as an editorial draft.
The 330 missing C2 Vietnamese translations were filled by the M14B fixes below; no
question has completed teacher review yet. Correct answers stay in
the server bundle and are returned only after a learner submits a response.
This dataset supports guided, independent, mastery and spaced review practice,
but its practice results do not award XP or certify proficiency.

## Level unlock

A1 is open. A2 through C2 require a 20-question choice test drawn from the
preceding level; 16 correct answers (80%) open the next level. Learners can
retry with a new set. A signed, 30-minute test ticket binds the question IDs
to the learner. The server grades the complete submission and saves a pass in
`public.grammar_level_unlocks`; lesson API requests for locked levels return
403, including direct URLs. Chapter tests remain separate and do not open
levels. A score only controls the learning roadmap, not CEFR certification.

Apply `supabase/migrations/202611040001_grammar_level_unlocks.sql` before
deploying the code. Production needs its existing server-only
`SUPABASE_SERVICE_ROLE_KEY` and a dedicated `GRAMMAR_ASSESSMENT_SECRET`
(32+ bytes, server-only) that signs placement-test tickets. The ticket key no
longer falls back to the database key: without it, starting or submitting a
placement test fails, so set it in Vercel before deploying. Rotating it only
invalidates tickets issued in the last 30 minutes. The service role is the only writer for unlocks.

Live learner progress continues in `public.grammar_study_progress` with its
existing account-scoped RLS. Existing V5 response IDs remain in storage so the
old work is not overwritten, while new counts and review links use only the
editorial question IDs. The learner's local cache remains account scoped.

Before shipping, run `npm run typecheck`, `npm run lint`, `npm run test` and
`npm run build`; inspect an authenticated lesson API response for answer-key
leakage and submit representative choice, fill and ordering questions. The
import count check verifies structure, not educational correctness.

## Answer and content fixes (Grammar A1–C2 upgrade, 2026-11-14)

`python -I scripts/apply-grammar-editorial-fixes.py` applies the fixes shipped in
`Grammar_A1_C2_Full.zip` (sources in `qa/grammar-fixes/`, result in
`APPLIED_REPORT.json`). It checks each current value, skips drifted items and is
safe to re-run after a fresh import:

- M04: 7 C1-12 choice questions whose key matched no option, and em-dash spacing
  that singled out the right option.
- M14B: 331 Vietnamese translations, 103 wrong-answer feedbacks, B1-16-Q050
  ("baker" → "director").
- M14C/M14D: 198 C2 and 718 A1–C2 explanation and option-rationale rewrites.
- M14E: 20 B2 "-inging" nonsense distractors and the A1-15-Q15 "a fruit" option.
- M26AF: A1-09-Q32/Q34 article fixes, A2-20-Q040 "keeped" → "kept".
- M26AG: 200 equivalent forms (contractions, "do not need to", "shouldn't be")
  added to `accepted_answers`.

The 13 M26E patches to M25D passages are not applied: each needs its questions
rewritten first. Every question keeps `publishable: false`.

## Upgrade content inside the lessons

The Grammar A1–C2 upgrade is merged into the regular lessons rather than a separate page:

- **Lý thuyết → Học từng bước** (M19, `grammar-guided/`): a short step-by-step lesson with quick
  checks, answered by `/api/grammar/guided-check`. The full theory stays one click away.
- **Lý thuyết → Học sâu** (M08–M13, `grammar-<level>-m0x/lessons.json`): patterns, worked
  examples, contrasts and self-correction, appended after the original rules
  (`src/lib/grammar/teaching/`, added to the guide by `publicEditorialLesson`).
- **Luyện tập → Luyện sâu** (optional stage after the four regular stages): the lesson's M22
  clinic, M23 contrast, M24 transformation, M25 context and M26 writing/speaking items, plus
  the M20 concept map, via `/api/grammar/labs?lesson=…`. Lesson completion still means the
  four regular stages; Luyện sâu never changes progress, XP, mastery or unlocks.
- **Chẩn đoán nhanh** (`/app/grammar/diagnostic?level=A1`, roadmap card, sidebar, Grammar
  menu): 12 M21 questions; each flagged lesson links to its Luyện sâu stage.

Folders ending in `-private` hold answer keys: only `server-only` modules import them, and
`src/lib/grammar/labs-server.ts` projects items to the key-free shapes in `labs-types.ts`.
Feedback and reference answers are returned only after a submission.

None of this has passed teacher review. The owner approved showing the labelled drafts in
`src/data/grammar/labs-release-approval.json`, read by `src/lib/grammar/preview.ts`. Set
`owner_approved` to `false`, or `GRAMMAR_DRAFT_PREVIEW=false` on a deployment, to hide all of it.
