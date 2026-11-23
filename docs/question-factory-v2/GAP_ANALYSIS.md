# Daily News Question Factory V2: repository audit

Source baseline: `origin/main` at `44d095d0406d419f0ee709bb9e1acdabf645881c`. The handoff ZIP is a specification and offline prototype; existing repository code and SQL are the compatibility source of truth.

| Area | Before V2 | V2 implementation |
| --- | --- | --- |
| Generation | `enrichQuiz` calls `generateAdaptiveNewsQuiz`; selection is 2–4 forms and 6/9/11/13 items by passage evidence capacity. | Retains selection and counts; alternate V2 branch behind `NEWS_QUESTION_FACTORY_V2_PUBLISH_ENABLED=true`. |
| Provider budget | Existing `geminiJson` can retry 503, change models and make an optional top-up request. | V2 wrapper reserves before each network attempt, has one fixed model, no retry/fallback/top-up, maximum two attempts per invocation. |
| Passage reasoning | Generation prompt asks for evidence but does not require a passage map. | One response includes paragraph map, writer stance, comparisons, qualifications, causality, process, vertical structure and evidence opportunities. Both requests see the full article. |
| QA | Focused review sees author key and evidence and skips unflagged items. | Independent second request sees answer-stripped items and full article; every structurally eligible item gets one verdict. |
| Publishing | DB RPC accepts 6–13 legacy question objects. | V2 maps approved questions to the unchanged RPC payload; groups remain atomic. |
| Retry safety | Existing attempt row retries transient failure soon. | V2 pre-arms a 365-day retry hold before provider calls; failures remain on hold for manual review. No migration. |
| Learner payload | Client selected `supporting_sentence` before submission though it did not use it. | Client query omits this column; grading API still returns evidence after submission. DB column policy remains a release blocker. |
| Validation | Shape, exact quote, word limits, selective risk checks. | Per-form checks for 14 types, exact quote offsets, passage-map checks, group checks, duplicate checks and blind semantic answer agreement. |

Production remains HOLD. No production data, API call, migration or deployment was performed.
