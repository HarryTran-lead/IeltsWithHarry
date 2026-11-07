# Listening interface audit

Checked 2026-11-07 against YouPass pages that are publicly readable. The signed-in `e-learning.youpass.vn` tab could not be controlled because Browser Use was disabled for this session, so current pixel-level layout and account-only interactions remain unverified. This audit describes observed patterns; it does not copy YouPass assets or question content.

## Screens and behavior

| Screen | Public evidence | Local implementation |
| --- | --- | --- |
| Catalog | [YouPass's Listening catalog screenshot](https://youpass.vn/bai-viet/kien-thuc-nen-tang-ielts/cach-tu-hoc-mien-phi-voi-youpass) shows Section 1–4 and full-test filters, search, and test cards. | `SectionedLibrary` offers the same navigation concepts with the IeltsWithHarry visual system. |
| Before the test | YouPass describes [practice and exam-style presentations](https://youpass.vn/bai-viet/kien-thuc-nen-tang-ielts/cach-tu-hoc-mien-phi-voi-youpass). | Two-step launch: full test or a Part, duration, then practice or exam-style view. Exact current YouPass modal could not be verified. |
| Practice view | [YouPass's Listening overview](https://youpass.vn/luyen-thi/ielts/listening?quiz_type=quiz) describes listening, answers, and detailed explanations. | Audio seek, replay, speed and volume; timed questions and Part navigator. |
| Exam-style view | [Moving Office](https://youpass.vn/thi-thu/listening/10493) and [Damaged Fridge Report](https://youpass.vn/thi-thu/listening/10262) expose a Play gate and say the recording cannot be paused or rewound. | Play gate per Part, no pause/seek/skip/speed controls, and no replay after a Part starts. Volume remains adjustable. |
| Results and review | [YouPass's Listening overview](https://youpass.vn/luyen-thi/ielts/listening?quiz_type=quiz) describes answer explanations and locating relevant information. | Score table, per-question answers, replay, transcript and available spoken evidence after submission. |

## Question layouts inspected

| Type | Public example | Local rendering |
| --- | --- | --- |
| Form, notes, table completion | [Arranging a Trip](https://youpass.vn/thi-thu/listening/8862), [Job Details](https://youpass.vn/thi-thu/listening/8600) | Preserve the printed form or table when the imported part includes it; put each numbered input in place. |
| Single-answer multiple choice | [Moving Office](https://youpass.vn/thi-thu/listening/10493) | Radio choices for each question. |
| Choose two or three | [Moving Office](https://youpass.vn/thi-thu/listening/10493), [Assignment Feedback](https://youpass.vn/thi-thu/listening/10204) | One shared checkbox set with a selection limit; selected letters are stored across the numbered answer slots. |
| Matching and flow chart with an option bank | [Bicycle Theft](https://youpass.vn/thi-thu/listening/12591), [Art Investigation](https://youpass.vn/thi-thu/listening/8487) | Click or drag a letter into each answer slot. |
| Map and plan labelling | [Race Map](https://youpass.vn/thi-thu/listening/10238), [Library Facilities](https://youpass.vn/practice/listening/8084) | Show the source diagram and a labelled letter grid. |
| Short answer and sentence completion | [Assignment Feedback](https://youpass.vn/thi-thu/listening/10204) | Numbered text input with the group's instructions and word limit. |

Current YouPass account-only screens, exact spacing, colors, audio progression across a full four-Part test, and result-review controls still require direct browser inspection. The product uses its own branding and exam media; no YouPass imagery or questions were imported.

## Follow-up implementation

- Review transcript is split into speaker turns, with the answer evidence highlighted in its spoken line.
- A Part-only result displays that Part's original number and only the questions included in the attempt.
- For "Choose TWO/THREE", review lists every accepted letter for the shared group, because their order does not affect scoring. Evidence follows the learner's selected letter.
- Flow-chart completion now places answer slots in the printed sequence, followed by the option bank.

The user chose to continue using public YouPass pages. The account-only screens above remain unverified.
