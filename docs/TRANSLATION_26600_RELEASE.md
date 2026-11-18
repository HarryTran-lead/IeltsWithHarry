# VI → EN translation bank: 26,600 sentence release

The owner-supplied ZIP `English_Skill_Lab_CODEX_FULL_145_MOC_6650_TU_26600_BAI_FINAL.zip` has SHA-256 `39236784c010a73629ba466a05af4f366fd5fe96a32f00a73f3abc91ac97f151`. It contains 145 milestones, 6,650 vocabulary placement IDs and four exercises per ID: Speaking/Writing × easy/hard. The master includes 1,320 repaired exercises. Its QA report explicitly says independent editorial review is pending; the release retains that provenance in `metadata` and `review_origin` rather than claiming individual approval.

Production previously held 13,300 published Speaking/Writing exercises from archive `e65755b317a8c3532fbcef82cdfc0df3f985af181b8b028f1c7d8d61ed6bccb6`. The reimport maps each source `vocab_id` and mode to one existing row. Existing primary keys remain unchanged and become the easy exercises, so learner progress and attempts retain their foreign keys. Hard exercises use the source's `exercise_id` as their new primary keys. The 100 old rows with revision 3 came from the prior bulk meaning fill; no individually reviewed rows were present at preflight.

## Procedure

1. Run `python scripts/reimport-vi-en-translation-26600.py --zip <archive> --expected-ref <project-ref>` for the read-only audit. It must report 13,300 existing published rows and 13,300 each to update/insert.
2. Apply migration `202611050001_vi_en_translation_26600.sql`. It adds `milestone`, `difficulty`, `source_exercise_id`, a private staging table and a service-role-only release function. It does not alter existing exercise content or learner progress.
3. Run the script again with `--stage --backup-dir <empty-private-directory-outside-repo>`. It writes JSONL backups of the exercises, learner progress and attempts before uploading source rows to staging. Keep these files private.
4. Check staging counts: 26,600 rows, 6,650 distinct `source_item_id`, 145 milestones, 40 topics, 13,300 easy and 13,300 hard. Then invoke `select public.release_vi_en_translation_26600('<archive-sha256>')` as the database admin. The function validates the existing and staged banks and applies all changes in one transaction. It records an owner-authorized bulk release.
5. Verify 26,600 published rows and zero content mismatches against staging; compare learner progress and attempt counts with the backup. Deploy the learner UI after the database release so its `milestone` and `difficulty` query has valid columns.

The release function is idempotent: a repeat call checks the recorded release and returns `already_released`. It refuses a different archive, missing stage rows, changed editorial status or mismatched IDs/topics/terms.

## Rollback

The backup contains the prior 13,300 exercise records. Restore their source fields by stable `id` in a controlled transaction. Mark the newly inserted hard exercises as drafts to hide them without deleting learner attempts that may have been made after release. Recheck progress and attempts before and after. Do not drop the new columns or truncate the exercise table while learner activity exists.
