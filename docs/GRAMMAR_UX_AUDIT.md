# Grammar: đánh giá trải nghiệm học và đề xuất thiết kế

- **Ngày soát:** 03/11/2026.
- **Bản soát:** `main` @ `afa8e1a`, tức bộ đề biên tập A1–C2 (14.455 câu), cùng mã với production.
- **Cách soát:** chạy chế độ demo trên máy với vai học viên, nên không ghi gì vào tài khoản thật. Kích thước màn: desktop 1366px và mobile 375px. Mình tự học như một học viên: đọc lý thuyết, làm câu đúng và câu sai, thử sắp xếp câu, mở Sổ ôn, Tiến độ và Bài kiểm tra. Số liệu dữ liệu đếm trực tiếp trên `src/data/grammar-editorial/`.

---

## 1. Tóm tắt

Bộ đề mới rất tốt so với bản tự đối chiếu cũ:
- Câu hỏi có đáp án xác định.
- Có giải thích cho từng phương án sai.
- Có bốn giai đoạn: Có hướng dẫn → Tự luyện → Vận dụng → Ôn cách quãng.

**Nội dung đã đủ để học thật. Thứ đang cản người học là cách màn hình phản hồi và ghi nhận kết quả.**

Sáu vấn đề ảnh hưởng hiệu quả học nhiều nhất:

| # | Vấn đề | Hệ quả với người học |
|---|---|---|
| P0-1 | Chọn sai, nộp, rồi bấm sang đáp án khác thì **bản ghi sai bị xoá**. Câu đó thành "Đã hiểu" và biến khỏi Sổ ôn | Sổ ôn luôn gần như trống. Tiến độ "làm đủ" bị thổi phồng. Hệ thống không biết người học yếu ở đâu |
| P0-2 | **42/180 bài mất nội dung lý thuyết**. Ví dụ: 21 bài A1 (A1-10 → A1-30) chỉ còn Mục tiêu và Lỗi thường gặp; bảng đại từ A1-01 là một thẻ trống | Người học bấm "Luyện tập" mà chưa được dạy quy tắc |
| P0-3 | Câu sai **không đỏ**, đáp án đúng **không xanh**. Nhãn là "KHÁC ĐÁP ÁN MẪU". Khung phản hồi nằm dưới mép màn hình | Người học không nhận ra mình sai, nhất là trên điện thoại |
| P0-4 | **Bản dịch tiếng Việt lộ đáp án**: "_____ is my mother." đi kèm "Cô ấy là mẹ tôi." Bản dịch luôn hiện, kể cả ở Vận dụng và Ôn cách quãng | Câu ngữ pháp thành câu dịch. Người học đúng mà không cần hiểu quy tắc |
| P0-5 | **Dữ liệu thô lộ ra ngoài**: `{student_answer}` trong 240 câu, `{team}` trong 27 câu, mã lỗi `PRESENT_PERFECT_EXPERIENCE` / `A1-01-RULE-01`, loại câu `mcq` / `fill blank`, lỗi chấm câu `mine..`, và 21 lỗi thường gặp không có câu đúng (`This books are new. → .`) | Mất tin tưởng vào nội dung |
| P0-6 | **Một bài dài 51–110 câu**, không có điểm dừng hay tổng kết. "Ôn cách quãng" làm được ngay, không cách quãng. Câu cuối chỉ có nút "Về lộ trình" | Học viên bỏ giữa chừng. Không có cảm giác hoàn thành. Không ôn lại theo thời gian |

**Mục tiêu thiết kế:**

> Mỗi buổi khoảng 10–12 phút, gồm một quy tắc, khoảng 12 câu và một màn tổng kết. Câu sai lần đầu được ghi lại, vào hàng ôn, rồi quay lại sau 1, 3 và 7 ngày. Màn hình luôn trả lời ngay ba câu hỏi: *Mình đúng hay sai? Vì sao? Bây giờ làm gì?*

---

## 2. Bản đồ màn hình

| Route | Thành phần | Tình trạng |
|---|---|---|
| `/app/grammar`, `/app/grammar/level/:L?chapter=n` | `Roadmap` + `SidebarProgress` | Bản đồ 5 bài trên tranh vườn. Thanh bên có Tiến độ, Tiếp tục học, Sổ ôn |
| `/app/grammar/lesson/:code` | `LessonWorkspace` (tab Lý thuyết) | Mục tiêu, các thẻ quy tắc 2 cột, lỗi thường gặp |
| `/app/grammar/lesson/:code?tab=practice&stage=…&item=…` | `LessonWorkspace` (tab Luyện tập) | 4 tab giai đoạn, mỗi lần một câu, nút Nộp và Để sau |
| `/app/grammar/review` | `ReviewPage` | Danh sách câu sai, mỗi dòng hiện mã lỗi thô |
| `/app/grammar/progress` | `ProgressPage` | 3 ô số và 6 thanh cấp độ |
| `/app/grammar/tests` | `TestsPage` | Icon khoá và một đoạn chữ. Không có gì để làm |
| `/app/grammar/live` | `IeltsLivePage` | Điền từ nối trong bài Daily News. Thiết kế khác hẳn Grammar Garden. *Chưa soát được vì cần tài khoản thật* |

Menu trái có 5 mục con cho Grammar. "Bài kiểm tra" xếp thứ hai nhưng dẫn vào trang cụt.

---

## 3. Hành trình thực tế của một học viên A1

Mình học như một học viên mới, bắt đầu từ A1-01 Subject Pronouns.

1. **Vào `/app/grammar`.** Chương ghi "Chương 1: Subject Pronouns". Đây là tên bài đầu, không phải tên chương, vì catalog mới có `group` trùng `title`. Dòng phụ ghi "180 bài học · 14.455 câu thuộc bốn giai đoạn luyện tập", một con số làm người mới choáng hơn là có động lực.
2. **Bấm A1-01 → Lý thuyết.** Mục tiêu hiện 3 dòng chữ đậm 18px, trông như 3 tiêu đề. Thẻ 01 có quy tắc và ví dụ, nhưng ví dụ cùng màu xám 13px với lời giải thích. Thẻ 02 **"Bảng đại từ" trống**, vì dữ liệu bảng (`items`) bị bỏ khi map. Nút "Đã đọc lý thuyết · Luyện tập" đánh dấu đã đọc chỉ bằng một cú bấm.
3. **Luyện tập, câu 1** `_____ is my mother.` Bản dịch "Cô ấy là mẹ tôi." ngay bên dưới cho luôn đáp án.
   - Mình cố tình chọn **Her** rồi bấm Nộp. Ô "Her" vẫn màu xanh ngọc như lúc được chọn, ô "She" không đổi màu.
   - Khung phản hồi ở đáy màn. Nhãn: "KHÁC ĐÁP ÁN MẪU".
   - Lời giải: "“Her” không khớp dạng từ hoặc ý nghĩa đã giới hạn trong đề…" là câu mẫu chung, không nói Her là tân ngữ.
4. **Bấm sang "She"** để thử lại. Kết quả cũ biến mất, nút Nộp sáng lại. Nộp xong được "KHỚP ĐÁP ÁN MẪU". Trong localStorage, trạng thái đổi `NEED_REVIEW → undefined → UNDERSTOOD`. **Lần sai đầu tiên không còn dấu vết.**
5. **Câu 3, điền từ.** Ô nhập là textarea 3 dòng cho một từ. Gõ "he" rồi Enter thì **xuống dòng chứ không nộp**. Phải bấm chuột vào nút Nộp, rồi kéo xuống bấm "Câu tiếp". Sau khi chuyển câu, con trỏ không nằm sẵn trong ô nhập.
6. **B1-01, câu sắp xếp.**
   - Bấm cụm "eaten" hai lần thì ô trả lời thành "I have eaten eaten". Cụm đã dùng không mờ đi, và không có cách bỏ một cụm, chỉ có "Làm lại" toàn bộ.
   - Nộp sai thì thấy: "**“{student_answer}” sai vì:** Sau have/has cần quá khứ phân từ V3…". Câu này vừa lộ biến mẫu, vừa giải thích sai lỗi: mình đã dùng V3, chỉ sai trật tự.
7. **Sổ ôn.** Một dòng: `B1-01 · Present Perfect vs Past Simple · PRESENT_PERFECT_EXPERIENCE`. Không có câu hỏi, câu mình trả lời hay đáp án đúng. Không có nút "Ôn các câu này".
8. **Tiến độ.** Có số bài đã đọc lý thuyết, số câu đã làm và số ngày có hoạt động. Không có tỉ lệ đúng, không có lỗi hay gặp, không có gợi ý làm gì tiếp.
9. **Bài kiểm tra.** Icon khoá và dòng "Vận dụng theo từng bài", kèm một nút về lộ trình.

**Cảm nhận của một học viên:** "Câu hỏi hay, nhưng mình không biết mình sai, sai thì bấm lại là xong, và mình phải làm 51 câu mới hết một bài."

---

## 4. Lỗi chặn (P0), kèm bằng chứng

### P0-1. Thử lại xoá bản ghi sai
- `grammar-garden.tsx:191`: mọi `onClick` của phương án, cụm từ, và cả `onChange` của textarea đều gọi `editResponse({ status: undefined, correct: undefined, referenceAnswer: undefined })`.
- `submit()` ghi đè `status` bằng kết quả lần nộp mới nhất.
- Hệ quả:
  - `NEED_REVIEW` chỉ tồn tại nếu người học bỏ đi ngay sau khi sai.
  - `reviewedCount` đếm cả câu sai, nên "Đã làm 51/51" không có nghĩa là đã nắm bài.
  - Không đo được độ chính xác lần đầu, là chỉ số quan trọng nhất của luyện ngữ pháp.
- **Sửa:**
  - Lưu `firstAttempt: { answer, correct, at }` một lần duy nhất. Thêm `attempts` (số lần) và `lastCorrect`.
  - Câu sai lần đầu luôn vào hàng ôn, đến khi đúng ở lượt ôn sau đó (không phải lượt thử lại ngay).
  - Sau khi nộp, khoá các phương án và hiện nút "Thử lại" riêng nếu cho phép.

### P0-2. Lý thuyết bị mất nội dung (42 bài)
`publicEditorialLesson` (`src/lib/grammar/editorial.ts`) chỉ đọc `sections`/`learn.rules` với các khoá `heading`, `formula`, `formula_or_pattern`, `explanation_vi`, `examples`, `common_mistake`, `exception_note_vi`, `note_vi`. Dữ liệu thực tế dùng thêm nhiều dạng khác:

| Dạng dữ liệu | Bài ảnh hưởng | Đang hiển thị |
|---|---|---|
| Không có `sections`; dùng `overview_vi`, `formula`, `example`, `micro_rules[] {rule_vi, example_en, example_vi}`, `exception_note` ở cấp bài | **A1-10 → A1-30 (21 bài)** | 0 thẻ quy tắc |
| Lời giải thích nằm ở khoá `vi` thay vì `explanation_vi` | A2-01→03, B1-01→15 (18 bài) | Thẻ chỉ có tiêu đề và ví dụ |
| `pattern` và `example_en` thay vì `formula` và `examples` | C2-04→06 (3 bài) | Mất công thức và ví dụ |
| `items[]` (bảng: pronoun, meaning, example, translation) | A1-01 "Bảng đại từ" | Thẻ trống |

**Sửa:** chuẩn hoá trong `publicEditorialLesson` cho đủ năm dạng trên, rồi thêm test "mỗi bài có ít nhất một quy tắc có nội dung" cho toàn bộ 180 bài.

### P0-3. Phản hồi đúng/sai không nhìn thấy được
- Sau khi nộp, `.gg-options button.selected` vẫn nền `#eaf8f4`, viền `#168e83`, giống hệt lúc chưa nộp.
- Không có class đúng/sai, không có icon ✓/✗.
- Khung `.gg-reference` không có `aria-live`, nên trình đọc màn hình không thông báo kết quả.
- Vị trí khung so với màn hình:
  - Desktop 1366×860: bắt đầu ở khoảng y = 850, tức đúng mép dưới.
  - Mobile 375×812: phương án nằm ở y = 736–948 và nút Nộp ở y = 959, trong khi thanh điều hướng đáy cao 60px. Phải cuộn trước khi trả lời, và cuộn tiếp mới thấy kết quả.
- **Sửa:**
  - Phương án sai chuyển đỏ kèm ✗, đáp án đúng chuyển xanh kèm ✓.
  - Nhãn rõ ràng: **"Chính xác!"** / **"Chưa đúng"**.
  - Phản hồi hiện trong một **thanh hành động dính đáy** (bottom sheet trên mobile), luôn nhìn thấy, chứa nút "Tiếp tục".

### P0-4. Bản dịch làm lộ đáp án
14.125/14.455 câu có `translation_vi`, và UI luôn in bản dịch dưới đề. Với các bài đại từ, thì, mạo từ, so sánh…, bản dịch thường chứa đúng thông tin cần chọn ("Cô ấy" → She, "đã từng" → have + V3).

**Sửa:**
- Ở **Có hướng dẫn**: hiện bản dịch qua nút "Xem nghĩa" (bấm thì ghi nhận là có dùng gợi ý).
- Ở **Tự luyện**, **Vận dụng** và **Ôn**: ẩn mặc định.
- Câu `error_choice` có prompt kiểu "Choose the grammatically correct sentence." thì bản dịch là câu đúng, nên phải ẩn.

### P0-5. Dữ liệu thô và lỗi trình bày

| Lỗi | Số lượng | Vị trí |
|---|---|---|
| `{student_answer}` chưa thay | 240 câu / 4 bài | phản hồi sai |
| `{team}` chưa thay | 27 câu | phản hồi |
| Lỗi thường gặp có `correct` rỗng → `This books are new. → .` | 21 mục | A1-10 và các bài cùng dạng |
| Nối chuỗi tạo dấu chấm đôi `mine.. These` | 264 mục | `grammar-garden.tsx:188` (`{correct}. {why}`) |
| Mã lỗi thô trong Sổ ôn | toàn bộ | `PRESENT_PERFECT_EXPERIENCE`, `A1-01-RULE-01` |
| Loại câu thô trên eyebrow | toàn bộ | `Có hướng dẫn · mcq`, `fill blank` |
| Mã quy tắc trong mục tiêu và công thức | B2–C2 | "Phân biệt các tiểu quy tắc: SHOULD_HAVE, OUGHT_HAVE…", công thức "SHOULD HAVE" |
| Lời giải chung cho mọi phương án sai | 216 câu | "không khớp dạng từ hoặc ý nghĩa đã giới hạn trong đề" |
| Phản hồi sắp xếp câu nói về dạng động từ, trong khi người học sai trật tự | nhiều câu `sentence_ordering` | B1-01-Q048 |

**Sửa ở UI ngay:**
- Thay `{student_answer}` bằng câu người học vừa nộp.
- Ẩn `{team}` cho đến khi sửa dữ liệu.
- Không in "→ ." khi `correct` rỗng.
- Nối bằng dấu cách thay vì `. `.
- Đổi mã lỗi và loại câu sang nhãn tiếng Việt, ví dụ "Trắc nghiệm", "Điền từ", "Chọn câu đúng", "Sắp xếp câu", "Sửa lỗi".

**Sửa ở dữ liệu:** báo lại cho người biên tập danh sách 240 + 27 + 21 + 216 mục.

### P0-6. Kích thước buổi học và vòng ôn
- Số câu mỗi bài: A1 51, A2 60, B1 80, B2 85, C1 105, C2 110. Ước chừng 20 giây/câu, một bài A1 mất khoảng 17 phút, một bài C2 khoảng 37 phút. Đây là liên tục, chưa tính đọc lý thuyết.
- Hết một giai đoạn thì nút cuối là "Về lộ trình". Không sang giai đoạn tiếp, không tổng kết.
- "Ôn cách quãng" chỉ là tab thứ tư, làm được ngay sau Vận dụng, nên không có khoảng cách thời gian nào.
- "Tiếp tục học" mở tab Lý thuyết, không mở câu đang làm dở.
- "Để sau" đánh dấu `SKIPPED` nhưng **không chuyển câu**.

---

## 5. Hành vi người học: phân tích theo khoa học học tập

| Nguyên lý | Hiện tại | Hành vi thật sẽ xảy ra | Cần thay đổi |
|---|---|---|---|
| **Phản hồi tức thì, rõ ràng** | Có lời giải nhưng không có tín hiệu đúng/sai | Người học đọc lướt và không biết mình sai | Màu, icon, nhãn, và câu "vì sao" ngắn nằm trước câu "giải thích đầy đủ" |
| **Lỗi lần đầu là dữ liệu quý nhất** | Bị xoá khi thử lại | Học viên dò từng phương án đến khi đúng | Ghi lần đầu, cho thử lại nhưng không xoá |
| **Nhớ lại có nỗ lực** | Bản dịch lộ đáp án | Đoán theo tiếng Việt | Ẩn bản dịch sau giai đoạn hướng dẫn |
| **Ôn cách quãng** | Tab cùng phiên | Làm liền 4 giai đoạn rồi quên sau một tuần | Lập lịch ôn theo bài/quy tắc: 1 → 3 → 7 → 21 ngày. Có thể dùng lại FSRS như Vocabulary |
| **Trộn dạng bài (interleaving)** | Mỗi phiên chỉ một bài | Nhận ra quy tắc vì "đang ở bài đó" | Phiên ôn trộn câu của nhiều bài đã học |
| **Buổi học vừa sức** | 51–110 câu liên tục | Bỏ ở khoảng câu 10–15 | Chia thành buổi khoảng 12 câu, có màn tổng kết và nút "Học tiếp buổi 2" |
| **Lý thuyết ngắn, gần bài tập** | Một tab riêng, đánh dấu đọc bằng một cú bấm | Bỏ qua lý thuyết | Mỗi buổi mở bằng một quy tắc (1 màn) + 2 câu kiểm tra nhanh. Trong lúc làm có nút "Xem lại quy tắc" mở dạng ngăn kéo |
| **Bắt đầu đúng trình độ** | Ai cũng bắt đầu ở A1-01 | Học viên B2 thấy chán, bỏ | Bài xếp lớp 10 phút (lấy câu Vận dụng các cấp), chỉ để gợi ý điểm bắt đầu, không cấp chứng nhận |
| **Thấy mình tiến bộ** | Đếm "câu đã làm" | Không có động lực quay lại | Tỉ lệ đúng lần đầu theo tuần, top 5 lỗi đang giảm, số bài "đã vững" (đúng ≥ 80% ở lượt ôn) |
| **Phục vụ mục tiêu IELTS** | Không nối với Writing/Speaking | "Học ngữ pháp để làm gì?" | Mỗi bài B1+ có một câu "Dùng trong IELTS Writing", ví dụ: "Present Perfect → mô tả xu hướng đến nay trong Task 1" |

Hai kiểu học viên chính trên trang này:
- **"Mất gốc, 20 phút/ngày trên điện thoại"** (A1–A2). Cần buổi ngắn, phản hồi to và rõ, ít chữ, nút luôn ở ngón cái.
- **"Đã B1–B2, cần vá lỗi cụ thể"** (mạo từ, câu điều kiện, mệnh đề quan hệ). Cần tìm bài theo *lỗi* hoặc *chủ điểm*, bài xếp lớp, và Sổ ôn có ý nghĩa.

Hiện tại cả hai kiểu đều bị đưa vào cùng một bản đồ 5 bài một trang, bắt đầu từ A1-01.

---

## 6. Giao diện từng màn

### 6.1 Lộ trình (`/app/grammar`)

| Quan sát | Số đo / bằng chứng | Đề xuất |
|---|---|---|
| Bản đồ tranh vườn cao 560px chỉ cho 5 bài | Desktop: hero y = 153, bản đồ y = 376–936. 180 bài cần 36 "chương" để duyệt | Giữ tranh làm **đầu trang** (khoảng 160px). Danh sách bài thành **lộ trình dọc** có đường nối và trạng thái (✓ / đang học / khoá mềm), mỗi chủ điểm một nhóm |
| Thứ tự trên bản đồ không đọc được | Thẻ 1 trái, 2 giữa, 3 phải, 4 trái dưới, 5 phải dưới; đường mòn trong tranh không nối các thẻ | Lộ trình dọc đọc từ trên xuống |
| Tên chương sai | "Chương 1: Subject Pronouns" (là `group` = `title`) | Nhóm theo chủ điểm thật (Đại từ, To be, Danh từ, Thì hiện tại…), hoặc bỏ khái niệm chương |
| Thẻ cấp độ 6 cột, chữ 10px bị bẻ 5 dòng | "Thị trấn bầu trời / 0/30 bài đã làm đủ" | 3 cột, hoặc một thanh chọn cấp độ dạng tab kèm vòng tiến độ |
| Icon thế giới là emoji (🌱☁️⛰️🏔️🔭🏆) | `grammarWorlds` trong `types.ts`, chưa vào bộ sticker | Dùng sticker sẵn có: A1 `tree`, B1 `mountain`, B2 `target`, C1 `compass`, C2 `rocket`. Cần vẽ thêm một sticker cho A2 (ví dụ `cloud`) |
| Thanh bên có nút chính "Tiếp tục học" nhưng trên mobile nằm ở y ≈ 1838 (màn hình thứ 3) | mobile 375px | Đưa **thẻ "Hôm nay"** lên đầu trang ở mọi kích thước: "Tiếp tục A1-02 · câu 7/15", "6 câu cần ôn", "Ôn trộn 10 câu" |
| "Cần ôn" trong thẻ "Tiến độ cấp độ A1" đếm cả mọi cấp | `SidebarProgress` | Đếm theo cấp đang xem, hoặc đổi nhãn thành "Cần ôn (tất cả)" |
| "180 bài học · 14.455 câu…" dưới tiêu đề chương | | Thay bằng "5 bài · khoảng 1 giờ" của chương/chủ điểm |
| Chữ nhỏ | Trên màn này: 26 đoạn 10px, 4 đoạn 11px, 9 đoạn 12px | Sàn chữ 12px cho nhãn, 14px cho nội dung |

### 6.2 Lý thuyết

| Quan sát | Đề xuất |
|---|---|
| Lưới 2 cột thẻ đều nhau, chữ 13px xám; ví dụ in nghiêng cùng màu | Một cột, tối đa khoảng 720px. Mỗi quy tắc là một khối: **công thức dạng chip** → giải thích 1–2 câu → ví dụ có **tô đậm cấu trúc đích** (`**She** studies…`) và nghĩa nằm dòng dưới, màu nhạt |
| Mục tiêu 3 dòng đậm 18px trông như 3 tiêu đề | Danh sách nhỏ có dấu ✓, 14px |
| Không có bảng (ví dụ bảng đại từ) | Render `items[]` thành bảng 4 cột; trên mobile chuyển thành thẻ |
| Lỗi thường gặp: chữ liền, dấu chấm đôi | Cặp **✗ sai / ✓ đúng** cạnh nhau, lý do bên dưới |
| Không có âm thanh | Nút loa cho ví dụ (dùng lại `speakText` trong `src/lib/vocabulary/pronounce.ts`) |
| "Đã đọc lý thuyết" bằng một cú bấm | Kết lý thuyết bằng **2 câu kiểm tra nhanh**. Đúng thì sang luyện; sai thì chỉ lại đúng quy tắc liên quan |

### 6.3 Luyện tập (màn quan trọng nhất)

Bố cục hiện tại, từ trên xuống:
1. Breadcrumb.
2. Đầu bài cao khoảng 170px.
3. Tab Lý thuyết/Luyện tập.
4. 4 tab giai đoạn (mobile: 2 hàng, cao 83px).
5. Eyebrow `mcq`.
6. Thanh vị trí.
7. Đề.
8. Phương án.
9. Nộp / Để sau.
10. Kết quả.
11. Điều hướng Câu trước / chọn câu / Câu tiếp.
12. Sổ ôn / Bài tiếp.

Trên mobile, đề bắt đầu ở y = 605. Phải cuộn trước khi đọc đề.

Đề xuất màn **"Buổi học"** toàn tập trung, theo hướng của các app luyện có phản hồi tức thì:

```
┌──────────────────────────────────────────────┐
│ ✕  A1-02 · To be        ▓▓▓▓▓░░░░░  5/12      │  ← thanh mỏng, không còn đầu bài to
├──────────────────────────────────────────────┤
│  CHỌN ĐÁP ÁN ĐÚNG                            │
│                                              │
│      I _____ ready.                          │  ← đề 22–24px
│      [Xem nghĩa]  [Xem quy tắc]              │
│                                              │
│  ┌ 1  am ┐  ┌ 2  is ┐                         │  ← phím 1–4, ô cao ≥ 52px
│  ┌ 3  are┐  ┌ 4  be ┐                         │
├──────────────────────────────────────────────┤
│ ✓ Chính xác!  I đi với am.        [Tiếp tục] │  ← thanh đáy dính, đổi màu xanh/đỏ
└──────────────────────────────────────────────┘
```

- **Một nút duy nhất ở đáy**: "Kiểm tra" → (kết quả) → "Tiếp tục". Enter làm cả hai bước.
- **Điền từ**: ô một dòng nằm *ngay trong câu* (`I [ am ] ready.`), con trỏ đặt sẵn, Enter để nộp.
- **Sắp xếp câu**:
  - Ngân hàng cụm từ bên dưới, khay câu bên trên.
  - Bấm một cụm để chuyển lên khay, bấm lại để trả về. Cụm đã dùng mờ đi.
  - Câu không có `chunks` (A1-02-Q32…) thì tách từ prompt theo `/`.
- **Sai**:
  - Thanh đáy chuyển đỏ: "Chưa đúng · Đáp án: **She**".
  - Bên dưới là một câu "vì sao" ngắn (ưu tiên `option_rationales_vi[answer]`).
  - Có nút "Giải thích đầy đủ" mở ra, và câu đó tự quay lại cuối buổi (requeue như Vocabulary).
- **Cuối buổi**:
  - Đúng X/12 ngay lần đầu.
  - Nhóm lỗi bằng nhãn tiếng Việt.
  - Nút "Ôn lại câu sai", nút "Buổi tiếp theo", và lịch ôn ("Bài này sẽ ôn lại vào thứ Năm").
- **Giai đoạn** không cần hiện thành 4 tab. Hệ thống tự xếp: buổi 1 = Có hướng dẫn, buổi 2 = Tự luyện, buổi 3 = Vận dụng. "Ôn cách quãng" chỉ mở khi đến hạn.
- **Phím tắt** như Vocabulary Review: 1–4 chọn, Enter kiểm tra/tiếp tục, H xem gợi ý, R xem quy tắc.

### 6.4 Sổ ôn

| Hiện tại | Đề xuất |
|---|---|
| Danh sách mã bài + tiêu đề + mã lỗi thô | Nhóm theo **lỗi** bằng tiếng Việt, ví dụ "Dùng tân ngữ làm chủ ngữ (4 câu)" |
| Không thấy câu hỏi và câu mình đã trả lời | Mỗi dòng: đề · ✗ câu của bạn · ✓ đáp án |
| Bấm vào thì mở cả bài ở đúng câu | Nút **"Ôn 10 câu này"**: một buổi ôn trộn dùng chung màn Buổi học. Đúng ở lượt ôn thì rời sổ |
| Trống thì chỉ có icon cờ | Sticker + "Chưa có câu sai. Làm một buổi để bắt đầu" + nút tới bài đang học |

### 6.5 Tiến độ
- Thêm **tỉ lệ đúng lần đầu** theo tuần (sparkline), **top 5 lỗi** và xu hướng tăng/giảm, **số bài đã vững**, lịch hoạt động 8 tuần.
- Mỗi cấp độ có một hàng: bài đã học / đã vững / đến hạn ôn, kèm nút "Ôn".
- Bỏ "Bài đã học lý thuyết" ra khỏi vị trí chỉ số chính, vì một cú bấm không chứng minh được gì.

### 6.6 Bài kiểm tra
Trang này hiện là ngõ cụt có icon khoá, nhưng lại đứng thứ hai trong menu. Có hai hướng:
- **Ngắn hạn:** gỡ khỏi menu, hoặc đổi thành **"Kiểm tra cuối chủ điểm"**: 15 câu Vận dụng trộn từ 5 bài của chủ điểm, có tổng kết. Vẫn ghi rõ "bản nháp biên tập, không chứng nhận".
- **Thêm:** **"Bài xếp lớp"** 10 phút để gợi ý cấp độ bắt đầu.

### 6.7 Từ nối trong ngữ cảnh (`/app/grammar/live`)
- Dùng hệ thiết kế `ielts-panel` khác hẳn Grammar Garden, và link quay lại ghi "← Tổng quan Grammar".
- Đây là bài điền từ nối *có chấm* duy nhất gắn với tin thật. Nên đưa vào lộ trình như phần **"Áp dụng"** cuối các bài liên từ (B1 Linking words…), dùng chung màn Buổi học.
- Chưa soát giao diện thật vì chế độ demo không có dữ liệu bài báo.

---

## 7. Hệ thống thị giác

- **Màu:** `grammar-garden.css` có **147 mã màu riêng, 0 biến màu**. Nên dùng chung bộ token `--vl-*` của Vocabulary (hoặc tách thành token toàn app) cho: nền, chữ chính, chữ phụ, viền, xanh "đúng", đỏ "sai", vàng "gợi ý".
- **Chữ:** sàn 12px cho nhãn, 14–15px cho nội dung, 22–24px cho đề câu hỏi. Đề hiện tại 17px đậm, nhưng hướng dẫn 11px và nghĩa 12px.
- **Sticker:** thế giới, trạng thái trống của Sổ ôn và Tiến độ, màn tổng kết buổi. Đồng bộ với đợt sticker vừa làm.
- **Đầu trang:** dùng `VocabPageHeader` (hoặc tách thành `LabPageHeader`) cho Sổ ôn, Tiến độ, Bài kiểm tra. Hiện mỗi trang con tự dựng `gg-back` + eyebrow + h1.
- **Bấm được:** link "Xem tiến độ" cao 15px, "Sổ ôn"/"Bài tiếp" cao 21px, breadcrumb cao 20px. Nâng lên tối thiểu 36px (44px trên mobile).
- **Mobile:** "Sổ ôn" bị bẻ thành 2 dòng, "Câu tiếp" rơi xuống dòng riêng. Khi có thanh hành động dính đáy, hai vấn đề này tự hết.

---

## 8. Kế hoạch sửa đề xuất

**Đợt 1: sửa lỗi chặn, không đổi bố cục (khoảng 1–2 ngày)**
1. Ghi lỗi lần đầu; thử lại không xoá; khoá phương án sau khi nộp (P0-1).
2. Chuẩn hoá `publicEditorialLesson` cho 5 dạng dữ liệu, kèm test 180 bài (P0-2).
3. Tô màu đúng/sai, nhãn "Chính xác" / "Chưa đúng", `aria-live`, tự cuộn tới kết quả (P0-3).
4. Ẩn bản dịch sau giai đoạn Có hướng dẫn, có nút "Xem nghĩa" (P0-4).
5. Lọc `{student_answer}` / `{team}`, sửa nối chuỗi, đổi mã lỗi và loại câu sang tiếng Việt (P0-5).
6. Enter để nộp/tiếp, tự đặt con trỏ, ô một dòng cho điền từ, cụm từ sắp xếp không dùng lại được, "Để sau" chuyển câu.
7. Sửa tên chương; "Tiếp tục học" mở đúng câu dở.

**Đợt 2: vòng học**
1. Buổi khoảng 12 câu, có màn tổng kết; tự chuyển giai đoạn.
2. Lịch ôn theo bài (1/3/7/21 ngày) dựa trên tỉ lệ đúng lần đầu; "Ôn cách quãng" chỉ mở khi đến hạn.
3. Sổ ôn nhóm theo lỗi, có buổi "Ôn 10 câu".
4. Thẻ "Hôm nay" đầu trang Grammar (và trên Dashboard).

**Đợt 3: giao diện**
1. Màn Buổi học tập trung, có thanh đáy dính.
2. Lý thuyết một cột: chip công thức, tô cấu trúc, bảng, cặp ✗/✓, loa.
3. Lộ trình dọc theo chủ điểm; tranh vườn làm đầu trang; sticker cho thế giới.
4. Tiến độ mới; token màu; sàn cỡ chữ.

**Đợt 4: mở rộng**
1. Bài xếp lớp.
2. Kiểm tra cuối chủ điểm.
3. Câu "Dùng trong IELTS" cho từng bài B1+.
4. Nối "Từ nối trong ngữ cảnh" vào lộ trình.

---

## 9. Phạm vi và giới hạn của lần soát này

- Soát trên chế độ demo, nên tiến độ chỉ lưu trong trình duyệt. Chưa kiểm chuyện đồng bộ `grammar_study_progress` với tài khoản thật.
- `/app/grammar/live` chưa soát được giao diện thật (cần đăng nhập và dữ liệu bài báo).
- Chưa soát độ chính xác ngôn ngữ của từng câu. Dữ liệu tự ghi `publishable: false` và chưa qua giáo viên duyệt. Các lỗi dữ liệu ở §4 là lỗi phát hiện bằng máy (biến mẫu, chuỗi rỗng, khoá lệch), chưa phải đánh giá sư phạm.
