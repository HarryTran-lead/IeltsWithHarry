# IELTS Starter 4.0–5.0 · U01–U08 supplementary materials

The source is the user supplied `English_Skill_Lab_U01-U08_FULL (2).zip`. Import it again with:

```powershell
python scripts/import-starter-supplement.py "C:/path/to/English_Skill_Lab_U01-U08_FULL.zip"
```

The importer verifies the source manifest and unit counts, then saves the eight `unit.json` files and `catalog.json` here. These JSON files contain all 392 authored activity groups and 1,462 items. Learner PDFs, 52 audio tracks and 14 visual assets are saved under `public/starter-supplement/`.

The source has a different schema from `scripts/import-course-packages.mjs`. The Learn page uses the existing page-turning coursebook UI with these eight units, four skill spreads per unit, short activity previews, and links to each learner PDF and audio page. The previous database lessons and learner progress remain stored.

Teacher keys, teacher notes, offline HTML and instruction files from the ZIP are not published. The included recordings use synthetic voices for practice. Writing and Speaking still require human review.
