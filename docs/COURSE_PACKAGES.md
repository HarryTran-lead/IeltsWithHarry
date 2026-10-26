# Foundation 1–2 and Elementary 2–3 course packages

The two user-supplied ZIPs are authored course content. Their “Band 1–2” and “Band 2–3” labels are **internal study milestones**, not official IELTS score equivalences. The ZIP audio files are machine-voice samples and should be replaced with natural recordings before they are presented as finished listening material.

Each package contains 10 units and 60 lessons (Vocabulary, Grammar, Listening, Reading, Writing, Speaking). The importer also publishes 10 unit checks and a final check per course. The existing course/lesson tables drive the Learn map. `package_lesson_content` preserves fill blanks, short answers, writing scaffolds, speaking rubrics and notes; `package_assessments` keeps the unit and final checks. MP3 files are uploaded to the public `lesson-media` bucket.

Dry run and import from a trusted local copy of the ZIPs:

```powershell
node scripts/import-course-packages.mjs "C:/path/to/English_Skill_Lab_Foundation_Band_1-2_Full_Package.zip" "C:/path/to/English_Skill_Lab_Elementary_Band_2-3_Full_Package.zip"
npx supabase db push --linked
node --env-file=.env.production.local scripts/import-course-packages.mjs --apply "C:/path/to/English_Skill_Lab_Foundation_Band_1-2_Full_Package.zip" "C:/path/to/English_Skill_Lab_Elementary_Band_2-3_Full_Package.zip"
```

The import validates unit, lesson and audio counts, uploads audio, upserts records by stable slugs, and publishes the course only after all units finish. Running it again updates authored content. It does not delete stale rows removed from a later ZIP, so review deletions in admin. Use a local service-role key or Supabase CLI login; never commit that key.

Multiple choice answers use the existing server-side exercise grader and save attempts. Fill blanks and short answers in the supplied ZIP are checked in the browser against authored suggestions; equivalent wording may also be valid. The unit/final checks are study review tools and do not issue an IELTS score or certificate. Writing and Speaking provide model answers and rubrics for self or teacher review; no automatic band scoring is claimed.

## IELTS Starter 4–5 completion

The original `ielts-starter` curriculum already contains 10 units, 60 lessons and 84 carefully authored vocabulary entries. Its missing pieces compared with the two course packages were saved Listening audio, vocabulary multiple choice practice, and unit/final review checks. `scripts/enrich-ielts-starter.mjs` derives vocabulary choices and review questions from those authored JSON files, links all 60 lessons to their unit check, and can generate 20 clearly labelled practice WAVs with the installed Windows System.Speech voice. It does not invent extra words or claim the checks are new official IELTS exam items.

```powershell
node scripts/enrich-ielts-starter.mjs --audio
node --env-file=.env.production.local scripts/enrich-ielts-starter.mjs --apply --audio
```

Re-running without `--audio` preserves uploaded audio and refreshes the question/review content. The generated audio is a machine voice suitable for practice; the authored transcript remains the reference and an editor may replace each recording later. The vocabulary count is intentionally lower than in the Foundation and Elementary packs because the 4–5 unit words are collocations with definitions, examples and authored sentence practice rather than simple headword lists.
