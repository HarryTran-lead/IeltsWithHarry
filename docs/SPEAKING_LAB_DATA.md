# Speaking Lab data

Speaking Lab (`/app/self-study/speaking`) is built from the M10-L80 curriculum handoff
(`IELTS_Speaking_M10_L80_Final_Curriculum_Import_Handoff_Pack.zip`). That pack is nested deep inside
`IELTS_Speaking_M11_R05_Evidence_Atomic_Repair_Codex_FULL.zip`. The outer M11 layers are staging and RLS tooling,
not lessons.

## What phase 1 uses

| Source | Used for |
| --- | --- |
| L48 `skill_taxonomy.json` | The 16 skills: 4 criteria × 4 skills |
| L67 `route_catalog.json`, `skill_guides_NEW_L67.json`, `onboarding.json` | One route and one guide per skill, plus the level labels |
| L65 `skill_consolidation_catalog.json`, `two_stage_questions_SERVER_ONLY.json`, `skill_guides_AFTER_ATTEMPT.json` | Each skill's 2 questions (first try and a later transfer) and the weak/better coaching |
| L41 `repair_catalog.json` | Repair card for each route: goal, useful language, self-check |
| L79 `lesson_catalog_METADATA_ONLY.json`, `questions_SERVER_ONLY.json`, `guidance_AFTER_CURRENT_ATTEMPT.json`, `models_AFTER_LESSON_COMPLETION.json` | 24 Part 1/2 topic lessons, each with 6 tasks, per-task tips, a teaching card and a model |

Left for later phases:
- L56–L60: Part 3 discussion, argumentation and repair.
- L37–L40: pronunciation and audio drills.
- L61–L63, L67: mock sets.

Not lessons, so not imported:
- L66, L69–L78: staging matrices, synthetic histories, sync contracts.

## Release rule

The handoff's rule, implemented in `releaseFor` (`src/lib/speaking-lab/types.ts`):
- A task's question opens once every earlier task is done.
- A task's tip opens after the learner has spoken it.
- The coaching card opens after the first task.
- The model opens after the last task.

Progress is stored as one `writing_drafts` row per unit (`spk-lab:<unitId>`). The release route reads that row,
so a learner cannot ask for content they have not reached. Recordings stay in the browser (IndexedDB) and are
never uploaded.

## Rebuilding

Run with `python -I`, because the source is untrusted data:

```
python -I scripts/import-speaking-lab.py <L80 folder> <private folder outside the repo>
```

- `<L80 folder>` contains `manifest/` and `milestones/`.
- Every source file is checked against the SHA-256 in `manifest/import_routing_DRY_RUN_ONLY.csv`.
- The script writes:
  - `content/speaking-lab/catalog.json`, which is committed. It holds titles and task shapes only.
  - `<private folder>/speaking-lab-private.json`, which is never committed.

## Where the private file lives

- **Local and Preview:** `SPEAKING_LAB_DIR=<folder containing speaking-lab-private.json>`.
- **Production:**
  1. Create a **private** Supabase Storage bucket.
  2. Upload `speaking-lab-private.json` to its root.
  3. Set `SPEAKING_LAB_BUCKET=<bucket>`. The server reads it with `SUPABASE_SERVICE_ROLE_KEY`.
- **Neither set:** the map still loads, and lessons say the content is being updated.

## Opening the lab

The lab is locked everywhere unless `NEXT_PUBLIC_ENABLE_SPEAKING_LAB=true`. Keep it locked in production until:
- teachers have reviewed the L79 samples (36 pending in the handoff);
- a live account has been tested end to end.
