# IELTS Starter 4.0–5.0 · U01–U08 supplementary materials

The source is the user supplied `English_Skill_Lab_U01-U08_FULL (2).zip`. Import it again with:

```powershell
python scripts/import-starter-supplement.py "C:/path/to/English_Skill_Lab_U01-U08_FULL.zip"
```

The importer verifies the source manifest and unit counts, then saves the eight `unit.json` files and `catalog.json` here. These JSON files contain all 392 authored activity groups and 1,462 items. Learner PDFs, 52 audio tracks and 14 visual assets are saved under `public/starter-supplement/`.

The source has a different schema from `scripts/import-course-packages.mjs`. It is linked by unit number to the published course slug `mindsetstarter-topic-practice-4-5`, so existing lessons and progress are preserved. The coursebook shows a unit summary and opens the learner PDF with its audio on a dedicated page.

Teacher keys, teacher notes, offline HTML and instruction files from the ZIP are not published. The included recordings use synthetic voices for practice. Writing and Speaking still require human review.
