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
`SUPABASE_SERVICE_ROLE_KEY`; `GRAMMAR_ASSESSMENT_SECRET` can be set as a
separate ticket-signing key. The service role is the only writer for unlocks.

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

## Practice labs

`/app/grammar/labs?level=A1`, the **Phòng luyện** tab of each lesson, the roadmap
banner and the sidebar link use `/api/grammar/labs` (signed-in learners, open
levels only):

| Lab | Bank | Items |
|---|---|---|
| M21 diagnostic | `grammar-assessment-private/m21-bank.json` | 72 (12 per level) |
| M22 weakness clinic | `grammar-clinic-private/` | 100 |
| M23 contrast | `grammar-contrast-private/` | 150 |
| M24 sentence transformation | `grammar-transformation-private/` | 900 in 45 sets |
| M25 context detective | `grammar-context-private/` (four banks) | 360 |
| M26 writing/speaking transfer | `grammar-transfer-private/m26-task-bank.json` | 540 |

The lesson tab also shows the M20 concept and its micro-skills
(`grammar-knowledge/m20/`). Folders ending in `-private` hold answer keys: only
`server-only` modules import them, and `src/lib/grammar/labs-server.ts` projects
items to the key-free shapes in `labs-types.ts`. Feedback and reference answers
are returned only after a submission. Labs are formative: they never write
mastery, XP, CEFR claims or level unlocks; attempt badges stay in the browser.

None of the lab content has passed teacher review. Each lab keeps its own fail-closed
gate (`*Live*` in `m22…m26-*-server.ts`). The owner approved showing the
labelled drafts to learners in `src/data/grammar/labs-release-approval.json`;
`src/lib/grammar/preview.ts` reads it. Set `owner_approved` to `false`, or
`GRAMMAR_DRAFT_PREVIEW=false` on a deployment, to hide every lab again.
