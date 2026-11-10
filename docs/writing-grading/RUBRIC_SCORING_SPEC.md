# Estimated Writing scoring contract

Reference retrieved 2026-11-10: https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing. IELTS describes four criteria and states Task 2 counts twice as much as Task 1. This implementation's rubric ID is `ielts-writing-public-2026-11`; it is an independent practice estimate, not an official examiner score.

Task 1 requires TA, CC, LR, GRA; Task 2 requires TR, CC, LR, GRA. Each criterion has raw model estimate, displayed half-band, Vietnamese and English rationale, exact essay evidence and a next step. The task raw estimate is the arithmetic mean of four raw criteria. The displayed estimate rounds to the nearest half-band (`Math.round(raw*2)/2`). Word count is diagnostic, never a mechanical band penalty. A combined Writing estimate is calculated only when both valid tasks exist: `(Task1 raw + 2 × Task2 raw)/3`, then half-band rounding. The current UI only reports individual task estimates; no combined estimate is presented without a valid task pair.

All evidence offsets use JavaScript UTF-16 code units against the saved essay snapshot. The worker rejects any quote or correction whose text does not exactly match its span, including repeated phrases, emoji and CRLF. Task 1 data-accuracy errors require an admin-verified source fact ID. No verified source means no Task 1 band. The model must not infer fact certainty from an image URL alone.

No statistical confidence or accuracy percentage is shown: no independent teacher-labeled Gold evaluation or calibration exists. Even with valid JSON, a local model's rubric judgments may be wrong; teacher validation is a release gate.
