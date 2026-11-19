# Writing Task 2 skills course (R01–R16): private data

The course content (82 JSON files: teaching, practice, reference answers, locked final prompts) is private and the
repository is public, so **the data is never committed**. The code reads it at runtime from one of two places:

| Where | Variable | Used for |
| --- | --- | --- |
| A folder outside the checkout | `TASK2_COURSE_DIR` | Local development and previews |
| A private Supabase Storage bucket | `TASK2_COURSE_BUCKET` (default `task2-course`; needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | Production and the develop Preview |

The private bucket `task2-course` exists (no policies, not public) in both the production and the development project, filled
on 2026-11-19 with the 83 files below. When neither source can be read, the "Khoá kỹ năng" tab says the course is being updated and points learners to "Luyện đề".

## Layout (same in the folder and the bucket)

```
DATASET_INDEX.json                 ← from feeds/DATASET_INDEX.json in the handoff zip
R01/learner_guided/R01_PRACTICE_28.json
R01/server_only/R01_ANSWERS_28.json
…
R16/server_only/R16_WORKED_FULL_ESSAYS_7.json
```

That is `02_PRIVATE_DATA_R01_R16/canonical_flat_data/*` plus `feeds/DATASET_INDEX.json` at the root.
Files listed in the index with visibility `docs` or `shared` are not read.

## Setting up the bucket

1. Supabase dashboard → Storage → **New bucket**, name e.g. `task2-course`, **Public bucket: off**. Add no policies:
   only the server's service role key reads it.
2. Upload the layout above (drag the `R01` … `R16` folders and `DATASET_INDEX.json` into the bucket root).
3. Only if the bucket has another name: set `TASK2_COURSE_BUCKET` on Vercel and redeploy.

## What reaches the browser

- `learner_guided` files are normalised (`src/lib/writing-task2/course-normalize.ts`) into teaching units, reference cards,
  worked examples and practice items. Unknown fields are kept as labelled rows; record metadata is dropped.
- `server_only` files only feed the reveal route (`/api/self-study/writing-task-2/course/[module]/reveal`), one item at a time,
  for signed-in learners. R01–R15 allow opening a reference before writing (the page marks it); R16 requires a saved attempt.
- R16's `FINAL_LOCKED_PROMPTS_7` and `WORKED_FULL_ESSAYS_7` are not served at all yet.
- Learner attempts are stored one row per item in `writing_drafts` (`t2-course:<module>:<practiceId>`); no migration.

## Updating the content

Replace the files in the bucket (same paths). The server keeps each milestone in memory for 10 minutes, so changes
show up within that window. `tests/writing-task2-course.test.ts` checks every milestone against the local copy when
`TASK2_COURSE_DIR` is set (`TASK2_COURSE_DIR=… npx vitest run tests/writing-task2-course.test.ts`); CI, which has no data, runs only the shape checks.
