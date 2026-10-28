# Quy tắc duyệt đề IELTS Reading & Listening

Bộ quy tắc này rút ra từ 37 đề tham chiếu của chủ sở hữu (VOL8: 12 Reading + 8 Listening; VOL10: 9 Reading + 8 Listening, kèm transcript) và 2 đề VOL7 Listening, quét ngày 2026-10-28. Chỉ lấy **cấu trúc** (số câu, dạng câu, rubric, giới hạn từ, độ dài); không chép nội dung đề.

Code kiểm tra: `src/lib/ielts-bank/format-rules.ts` (`checkFormat`). Mỗi quy tắc có mã, mức độ và phạm vi:

- **error** – sai format thi thật; đề không được publish cho tới khi sửa.
- **warning** – lệch so với đề thật nhưng có thể chấp nhận; người duyệt phải xem lại.
- Phạm vi: `full` = bộ đề đầy đủ (Listening 4 part / Reading 3 passage); `any` = cả bài lẻ (1 part, 1 passage).

## 1. Quy tắc chung (mọi đề)

| Mã | Mức | Quy tắc |
|---|---|---|
| G1 | error | Mỗi câu có số thứ tự, đề bài (prompt) và ít nhất một đáp án. |
| G2 | error | Mỗi câu có rubric (instructions) như trên đề giấy: "Complete the notes below…", "Choose the correct letter, A, B or C"… |
| G3 | error | Câu điền từ (completion/short answer) phải ghi giới hạn từ (ONE WORD ONLY, ONE WORD AND/OR A NUMBER, NO MORE THAN TWO/THREE WORDS…) và **mọi đáp án phải nằm trong giới hạn đó**. |
| G4 | error | Câu điền từ phải có chỗ trống trong prompt (`____`), trừ dạng short answer (câu hỏi trực tiếp). |
| G5 | error | Câu chọn chữ cái: đáp án phải là một trong các phương án. |
| G6 | error | Số câu đánh liên tục, không trùng, không nhảy số. |
| G7 | warning | Prompt không được chứa sẵn đáp án (lộ đáp án). |
| G8 | warning | Không có hai câu trong cùng một đề có prompt giống hệt nhau (trừ cặp "Choose TWO"). |

## 2. Listening

| Mã | Mức | Phạm vi | Quy tắc |
|---|---|---|---|
| L1 | error | full | 4 part, mỗi part đúng 10 câu: 1–10, 11–20, 21–30, 31–40. |
| L2 | error | any | Mỗi part có audio. |
| L3 | error | any | MCQ một đáp án có **đúng 3 phương án A–C**. |
| L4 | error | any | "Choose TWO" là **2 câu chung một nhóm, 5 phương án A–E**, hai đáp án khác nhau. "Choose THREE": 3 câu, 7 phương án A–G. |
| L5 | error | any | Map/plan/diagram labelling có hình (mediaUrl) và số chữ cái nhiều hơn số câu. |
| L6 | error | any | Matching/classification có ít nhất 3 phương án. |
| L7 | warning | full | Part 1: ít nhất 6/10 câu là form/notes/table/sentence completion (đề thật thường cả 10 câu là một form). |
| L8 | warning | full | Part 4: ít nhất 7/10 câu là notes/table/summary/flow-chart completion. |
| L9 | warning | full | Part 2 và Part 3: không quá 6/10 câu điền từ; phải có câu chọn chữ cái (MCQ, Choose TWO, matching, map). |
| L10 | warning | any | Giới hạn từ thường gặp: Part 1 ONE WORD AND/OR A NUMBER; Part 4 ONE WORD ONLY. Giới hạn từ trên hai từ là bất thường. |
| L11 | warning | any | Transcript mỗi part: Part 1 600–1.000 từ, Part 2 600–950, Part 3 700–1.100, Part 4 600–950 (đề thật: 640–1.030). |
| L12 | warning | full | Tổng transcript 4 part từ 2.800 từ trở lên (đề thật khoảng 3.000–3.300). |
| L13 | warning | full | Đề có ít nhất 4 dạng câu khác nhau. |

## 3. Reading

| Mã | Mức | Phạm vi | Quy tắc |
|---|---|---|---|
| R1 | error | full | 3 passage; tổng 40 câu; mỗi passage 12–14 câu (đề thật: 13 / 13 / 14). |
| R2 | error | any | Mỗi passage có bài đọc; độ dài 650–1.300 từ (đề thật: 730–1.270, thường 750–1.050). Bài lẻ dưới 650 từ là error. |
| R3 | error | any | MCQ một đáp án có **đúng 4 phương án A–D**. |
| R4 | error | any | TRUE/FALSE/NOT GIVEN và YES/NO/NOT GIVEN chỉ nhận đúng ba đáp án tương ứng. |
| R5 | error | any | List of Headings: số heading nhiều hơn số câu; Which paragraph / headings cần bài đọc có đoạn đánh chữ A, B, C… |
| R6 | error | any | "Choose TWO/THREE" giống Listening: 2 (hoặc 3) câu chung nhóm, đáp án khác nhau, 5 (hoặc 7) phương án. |
| R7 | warning | full | Mỗi passage có ít nhất 2 dạng câu. |
| R8 | warning | full | Passage 1 có TRUE/FALSE/NOT GIVEN hoặc completion; Passage 3 có MCQ A–D hoặc YES/NO/NOT GIVEN (đúng khuôn đề thật). |
| R9 | warning | any | Giới hạn từ trong Reading: ONE WORD ONLY hoặc NO MORE THAN TWO/THREE WORDS (AND/OR A NUMBER). |

## 4. Mẫu format quan sát được (để viết đề mới)

**Listening**
- Part 1: 10 câu form/notes/table (thường một khung có tiêu đề, mục con, dòng Example), đôi khi 6–7 câu completion + 3–4 MCQ/map/Choose THREE.
- Part 2: MCQ A–C, hai cặp Choose TWO (A–E), map/plan labelling (A–H…J), matching từ bảng, flow chart chọn chữ.
- Part 3: MCQ A–C (4–6 câu), matching ý kiến (A–F/G/H), Choose TWO, flow chart/diagram chọn chữ; đôi khi notes/table/sentence completion.
- Part 4: ghi chú bài giảng có tiêu đề, ONE WORD ONLY, nghe liền 31–40; hiếm khi table hoặc MCQ.

**Reading**
- Passage 1 (1–13): TRUE/FALSE/NOT GIVEN + notes/table/sentence completion (ONE WORD ONLY).
- Passage 2 (14–26): Which paragraph contains…, List of Headings, matching features, Choose TWO, summary/sentence completion.
- Passage 3 (27–40): MCQ A–D + YES/NO/NOT GIVEN + summary chọn từ bảng / sentence endings / matching.
