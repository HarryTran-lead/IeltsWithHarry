# VI → EN translation integration

## Source audit

- Archive SHA-256: `e65755b317a8c3532fbcef82cdfc0df3f985af181b8b028f1c7d8d61ed6bccb6`.
- Package verifier: 40 topics, 6,650 topic placements, 13,300 Speaking/Writing tasks, unique import IDs and complete bilingual sentence fields.
- There are 6,046 distinct normalized terms. The source reports 50 missing Vietnamese meanings. All 6,650 items carry `draft_needs_editor_review`; structural QA is not editorial approval. Some prompts discuss an expression instead of using it in context, and some pairs reuse context across topics.
- Import IDs are source identifiers, not canonical vocabulary primary keys. The importer maps by normalized term to `ielts_vocabulary_entries.source_key` and reports unmatched items. It never creates duplicate canonical terms.

## Existing app and additions

| Area | Existing | Added |
| --- | --- | --- |
| Vocabulary navigation | Landing and sidebar for IELTS, CEFR, Listening, Reading, Collocations, Word Formation | VI → EN practice card and sidebar link |
| Canonical words | `ielts_vocabulary_entries`, topic links | Nullable FK from translation exercise to canonical source key; source topic retained |
| Study progress | Separate per-course SRS tables | Per-user, per-exercise rating, due date, attempts and source revision |
| Admin | Vocabulary import/editor | Filterable translation review, bilingual editing, preview, approval and publication |
| Content safety | RLS on vocabulary tables | Draft gate, admin-only review, user-owned attempt RLS, audit events |

## Import and release

`python scripts/import-vi-en-translation.py --zip <archive>` runs a read-only validation. To import, supply `--apply --expected-ref <project-ref> --env-file <local-env-file>`. The script refuses a mismatched URL and writes only new draft rows, 25 source items at a time. Reruns preserve edited rows and learner data; source hash conflicts are reported for manual reconciliation. The archive stays local.

Migration `202610290013_vi_en_translation.sql` is additive. It does not modify existing vocabulary or progress tables. Published rows alone are visible to learners. Each Speaking and Writing variant has its own review status, so editors can publish them independently. A translated sentence is an open answer: the learner sees a reference and rates their own recall; no string matching or band score is used.

## Owner-authorized bulk release

On the owner's explicit instruction, migration `202610290014_vi_en_owner_authorized_release.sql` publishes the exact imported archive of 13,300 exercises across 40 source topics. It fills the 100 exercise meanings missing from the package (50 source items, two modes each) using their matched canonical IELTS vocabulary meanings. The migration checks the archive hash, row count, topic count, canonical links, source sentences, and number of missing meanings before changing status; any mismatch aborts the transaction.

Published rows have `review_origin = 'owner_authorized_bulk'`, `reviewed_by = null`, and a bulk release record. This records owner authorization without attributing individual editorial review to an admin. The source's `draft_needs_editor_review` and other QA flags remain available for later correction. Individual sentence quality, repeated contexts, and `target_term_usage` concerns have not been resolved by this bulk release. Future exercises still follow the normal per-exercise approval path.
