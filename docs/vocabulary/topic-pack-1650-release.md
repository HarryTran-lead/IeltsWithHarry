# Owner-supplied 15-topic pack

Source archive: `ENGLISH_SKILL_LAB_VOCABULARY_15_TOPICS_110_EACH.zip` (SHA-256 `744fad1cc015def43b8000827cdd5a315cc2a4ba87fd38cb3f3094e12594f8ab`). The archive remains outside the public repository. Its `ALL_15_TOPICS_1650.csv` is a topic placement inventory, not 1,650 unique new words.

| Placement type | Count |
| --- | ---: |
| Already published editorial entries | 75 |
| Earlier authored drafts supplied in the ZIP | 725 |
| Newly authored proposals supplied in the ZIP | 255 |
| Links to the original IELTS source collection | 595 |
| Total topic placements | 1,650 |

The 980 authored placements contain 976 distinct normalized terms. Five terms already exist in the source IELTS collection and are linked rather than duplicated. The package therefore adds **971 distinct entries**, taking the IELTS collection from 5,075 to **6,046** entries. Fifteen expansion topics each have exactly 110 published placements. The original 5,000 IELTS source rows, 9,941 CEFR rows and 1,237 lesson words remain unchanged.

The owner authorized bulk publication. Review provenance is `owner_authorized_codex`, not a human editor identity. The 232 entries with heuristic QA signals retain those signals in private `ielts_vocabulary_pack_review_events`; publication does not claim that a human has checked every sense or example. Suggested bands remain frequency-based estimates. The original source crosslinks retain their source content and original status; their new topic placement is approved without duplicating the term.

Migration `202610280007` adds the many-to-many topic links and private review events. `scripts/import-ielts-topic-pack.py` is dry run by default, validates the archive and live collisions, inserts only absent entries, and can resume. `scripts/verify-ielts-topic-pack.py` gates the 15 × 110 distribution and unaffected collections on Dev and Production. Learner library and study filters use the topic links for all 15 expansion topics.

The long-term editorial target remains 2,650 new unique entries. After this pack, 75 + 971 = **1,046** have been published and **1,604** remain toward that separate target.
