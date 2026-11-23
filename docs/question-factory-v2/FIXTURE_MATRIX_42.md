# Original offline fixture matrix

`tests/fixtures/news-factory-v2.ts` contains one original fictional harbor-water passage and 42 authored question examples. Each type has P1, P2 and P3. The corpus is machine-readable TypeScript and the tests run it without a network call. P-levels are design intentions; tests verify structural validity, not empirical learner difficulty.

| Form | P1 | P2 | P3 | Form-specific negative gate |
| --- | --- | --- | --- | --- |
| mcq | mcq_p1 | mcq_p2 | mcq_p3 | MCQ_FOUR |
| tfng | tfng_p1 | tfng_p2 | tfng_p3 | CHOICE_POOL |
| ynng | ynng_p1 | ynng_p2 | ynng_p3 | NO_WRITER_VIEW |
| matching_headings | matching_headings_p1 | matching_headings_p2 | matching_headings_p3 | HEADING_PARAGRAPH |
| matching_information | matching_information_p1 | matching_information_p2 | matching_information_p3 | INFORMATION_PARAGRAPHS |
| matching_features | matching_features_p1 | matching_features_p2 | matching_features_p3 | OPTION_NOTES |
| matching_sentence_endings | matching_sentence_endings_p1 | matching_sentence_endings_p2 | matching_sentence_endings_p3 | SENTENCE_STEM |
| sentence_completion | sentence_completion_p1 | sentence_completion_p2 | sentence_completion_p3 | ONE_GAP |
| summary_completion | summary_completion_p1 | summary_completion_p2 | summary_completion_p3 | ONE_GAP |
| note_completion | note_completion_p1 | note_completion_p2 | note_completion_p3 | WRITTEN_ANSWER |
| table_completion | table_completion_p1 | table_completion_p2 | table_completion_p3 | TABLE_ROW |
| flow_chart_completion | flow_chart_completion_p1 | flow_chart_completion_p2 | flow_chart_completion_p3 | FLOW_PROCESS |
| diagram_label_completion | diagram_label_completion_p1 | diagram_label_completion_p2 | diagram_label_completion_p3 | DIAGRAM |
| short_answer | short_answer_p1 | short_answer_p2 | short_answer_p3 | SHORT_QUESTION |

Additional negative cases test unsupported evidence for all 14 forms, mismatched matching pools, inconsistent note limits, an invented flow process, missing QA coverage, key disagreement and provider budget exhaustion. Each positive example has an evidence quote, answer or keyed options, Vietnamese rationale and explicit difficulty and skill metadata.
