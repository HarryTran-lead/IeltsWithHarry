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
There are 330 C2 questions without Vietnamese translations, and the source QA
report says no question has completed teacher review. Correct answers stay in
the server bundle and are returned only after a learner submits a response.
This dataset supports guided, independent, mastery and spaced review practice,
but its results do not unlock levels, award XP or certify proficiency.

Live learner progress continues in `public.grammar_study_progress` with its
existing account-scoped RLS. Existing V5 response IDs remain in storage so the
old work is not overwritten, while new counts and review links use only the
editorial question IDs. The learner's local cache remains account scoped.

Before shipping, run `npm run typecheck`, `npm run lint`, `npm run test` and
`npm run build`; inspect an authenticated lesson API response for answer-key
leakage and submit representative choice, fill and ordering questions. The
import count check verifies structure, not educational correctness.
