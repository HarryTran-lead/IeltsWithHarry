# Blockers and limits

| Item | Status | Why it matters |
| --- | --- | --- |
| Live Gemini semantic quality and quota | NOT RUN | The task forbids paid or over-budget API use, and no real provider call was authorized. Mocked protocol and budget tests cannot prove model output quality or actual Free Tier model eligibility. |
| Production article corpus and question distribution | NOT RUN | No production data read or write was performed in this checkout. Offline fixtures do not measure the production mix or difficulty. |
| GitHub-hosted CI | NOT RUN | No push or PR was allowed. Local commands exercise the same typecheck/lint/test/build gates but are not a hosted CI run. |
| Evidence column privacy | BLOCKED | `news_auto_questions.supporting_sentence` is stored in a table with authenticated select access. The learner's own query now omits it, but direct table access remains. Moving evidence behind a post-submission API/ACL needs a migration, which the user prohibited. |
| Durable global two-call ledger | BLOCKED | The existing `news_enrichment_attempts.retry_after` can hold automatic retries; it cannot atomically record requests by immutable article fingerprint across manual preview or administrative resets. A true global guarantee needs schema/storage changes. The current guarantee is two attempts per V2 invocation and no automatic reattempt during the long hold. |
| Human psychometric calibration | NOT RUN | P1/P2/P3 in the fixtures and prompt are editorial targets, not measured item difficulty. Real learner response data and expert review are needed before claiming IELTS-equivalent difficulty. |

None of these are labelled PASS. Production release remains HOLD.
