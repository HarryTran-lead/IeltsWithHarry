# IELTS admin workflow

1. Open `/admin/ielts-bank` as an existing admin. Inspect source license/status and run dry-run or full sync. Source sync is batched and resumable; jobs show inserted/updated/skipped/failed counts.
2. Filter to `needs_review`. Open a record, inspect source, attribution, warnings and JSON content. The JSON editor saves a new immutable revision.
3. Resolve blocking warnings, including missing answers and audio, then select **Duyệt**. Select **Xuất bản** only after the item is ready. Rejected and archived items are not newly published. If an upstream revision arrives later, the last published revision stays available while the new draft awaits review.
4. A learner opens `/app/question-bank`, selects a published exercise and starts a pinned attempt. Answers/flags/notes auto-save to Supabase. Submission or timer expiry saves a result. `/app/question-bank/result/<attempt-id>` restores it after refresh.
5. Learners may schedule a published exercise from its detail page. The existing Study Planner receives a task; submitting the exercise marks matching tasks complete.

No imported content is auto-published. `ielts_review_log` records revision editing, manual rights confirmations and status changes. The JSON editor is for trained admins; avoid inserting HTML or copyrighted third-party material without permission.

## Rollback

Back up the new tables first if real attempts exist. Unschedule `english-skill-lab-ielts-worker` with `cron.unschedule`, then remove the four `/api/ielts/bank` routes and navigation entries. To remove the database module, drop `ielts_claim_job` and `ielts_upsert_import`, then the new tables in dependency order (`ielts_review_log`, `ielts_attempts`, `ielts_exam_versions` after clearing both version foreign keys from `ielts_exams`, `ielts_exams`, `ielts_import_items`, `ielts_import_jobs`, `ielts_sources`). Delete the `ielts-audio` bucket only after reviewing its licensed files. Existing course, lesson, news, vocabulary and planner tables require no rollback.
