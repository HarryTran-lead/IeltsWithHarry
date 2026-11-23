# Fourteen IELTS Reading practice forms

All forms require a clear source-supported answer, exact contiguous evidence with checked start/end offsets, English answer logic and a Vietnamese learner explanation, stable question ID, group ID, difficulty (P1/P2/P3), corresponding paraphrase depth (1/2/3), skill, and evidence scope. Deterministic checks filter malformed content; blind QA independently judges meaning. P1 is direct but fair retrieval, P2 is paraphrase/scope, P3 is supported synthesis or inference. These are practice levels, not official IELTS bands.

| Type | Authoring rule | Deterministic gate | Semantic QA emphasis |
| --- | --- | --- | --- |
| Multiple choice | Four parallel plausible options, one answer. | Exactly four distinct choices/key/notes. | One defensible option; distractors differ on meaningful details. |
| True/False/Not Given | Fact statement; NG only if whole article neither confirms nor contradicts it. | Fixed three choices/key. | Entire passage search, especially NG versus False. |
| Yes/No/Not Given | Writer's opinion, only when a stance exists. | Fixed choices and nonempty writer-view map. | Attribute stance to author, not a quoted source. |
| Matching headings | Best main idea for named paragraph, at least one unused heading. | Shared pool, unique keys, extra heading. | Main idea versus an example or detail. |
| Matching information | Locate information in consistently named paragraphs. | Shared paragraph-labelled pool. | Check actual location and paraphrase. |
| Matching features | Match a claim to person, organisation or place. | Shared ordered options. | Avoid unsupported attribution. |
| Matching sentence endings | Finish a stem with a meaningful ending. | Shared pool and unfinished stem. | Grammar and factual relationship. |
| Sentence completion | One gap in a paraphrased sentence. | One gap, ≤3 exact source words. | Fit in context, not isolated keyword. |
| Summary completion | Consecutive sentences of one coherent summary. | One gap each, group ≥2. | Main point and cohesion. |
| Note completion | One named topic, shared explicit W1/W2/W3 limit. | One gap, group limit and answer length. | Appropriate note style and precise words. |
| Table completion | One related row per item in a shared table. | `Label: detail ______`, group ≥2. | Row relationships and factual value. |
| Flow-chart completion | Genuine ordered process; no event timeline. | `Step N:`, contiguous order and process map. | Stage order and causal process. |
| Diagram label completion | Only an explicitly described vertical structure. | Parse legacy `[DIAGRAM:...]`, one gap, known labels. | Spatial relationship and label correctness. |
| Short answer | A question with a concise source answer. | Ends in ?, ≤3 exact source words. | Unambiguous answer and word limit. |

For matching, note, summary, table and flow sets, V2 retains whole groups after QA. A rejected item cannot leave a one-item group. No form is forced into a passage lacking the required structure. The legacy learner schema and grading RPC are unchanged.
