# Content generation pipeline

The current implemented increment is an original Listening Part 3 practice draft. The script and answers are authored in `pilot.ts`, validated with the existing bank schema, stored as a draft and linked to a Kokoro audio job. Ten questions have evidence turn references. The worker turns these references into actual segment intervals. The audio remains private pending QA.

Reading, Writing and Speaking generation need a separate text-model provider, strict output schemas, factual answer checks and independent review before they can be considered production features. No remote text model is enabled by default and no unverified generation button is shown to admins. This also prevents the factory from consuming student-facing AI resources during this pilot.

For a complete mock, require 40 Listening and 40 Reading questions, three Reading passages, four Listening parts, valid Writing tasks and Speaking parts, source attribution, complete media and human approval. A single Part 3 exercise is labelled practice, never full mock.
