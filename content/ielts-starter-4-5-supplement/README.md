# IELTS Starter 4.0–5.0 · U01–U08 supplementary materials

The source is the user supplied `English_Skill_Lab_U01-U08_FULL (2).zip`. Import it again with:

```powershell
python scripts/import-starter-supplement.py "C:/path/to/English_Skill_Lab_U01-U08_FULL.zip"
```

The importer verifies the source manifest and unit counts, then saves the eight `unit.json` files and `catalog.json` here. These JSON files contain all 392 authored activity groups and 1,462 items. Learner PDFs, 52 audio tracks and 14 visual assets are saved under `public/starter-supplement/`.

The source has a different schema from `scripts/import-course-packages.mjs`. The Learn page for IELTS Starter now opens these eight units directly, with summaries in the book contents and a learner PDF plus audio on each unit page. Existing database lessons and progress remain stored, but are no longer the main book shown for band 4.0–5.0.

Teacher keys, teacher notes, offline HTML and instruction files from the ZIP are not published. The included recordings use synthetic voices for practice. Writing and Speaking still require human review.
