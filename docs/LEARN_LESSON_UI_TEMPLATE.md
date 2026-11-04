# Khuôn giao diện bài học Learn (Book 2)

Ngày 04/11/2026. Dựng và thử trên Unit 1, áp dụng cho cả 8 unit vì mọi bài dùng chung `Book2LessonPage` (`src/features/learning/book2-lesson.tsx`) và `book2-lesson.css`. Nội dung (JSON) không đổi; bên biên tập sửa nội dung không cần đụng giao diện.

## Vì sao giao diện cũ gây ngán

- Một màu teal–trắng cho mọi kỹ năng, không hình ảnh, không nhân vật.
- Luyện tập là danh sách 6 câu dài, mỗi câu một nút Kiểm tra: giống phiếu bài tập, không có nhịp trả lời → phản hồi → câu tiếp.
- Điểm “0/12 câu đúng” hiện ngay khi chưa làm; không có khoảnh khắc thưởng khi xong bài.
- Đường học: mọi nút bài cùng màu xám, không có dấu “bắt đầu từ đây”.

## Bộ token theo kỹ năng

Lớp `b2-skill-<reading|listening|writing|speaking>` trên `.book2-page` đặt `--b2`, `--b2-dark`, `--b2-soft`, `--b2-ink`. Mọi bề mặt đọc các token này. Màu phản hồi cố định, không trùng màu kỹ năng: đúng `--b2-ok` (xanh lá), sai `--b2-bad` (san hô đỏ).

| Kỹ năng | Màu chính | Sticker |
| --- | --- | --- |
| Đọc | #ff6f5e san hô | book |
| Nghe | #14a7b3 xanh ngọc | headphones |
| Viết | #f5b31a vàng (chữ tối trên nút) | pencil |
| Nói | #8b6cf0 tím | mic |

Đường học ở trang chặng (`study-course.css`, lớp `skill-*` trên `.journey-stop`) dùng cùng bảng màu.

## Ba màn hình

1. **Tìm hiểu**: hero có sticker kỹ năng và vòng % đã làm; Harry nói mục tiêu trong bong bóng; thẻ kiến thức đánh số, ví dụ có nút nghe; công thức ngữ pháp dạng khối; mẹo làm bài; lỗi thường gặp Sai ↔ Đúng; từ vựng là thẻ lật có nút nghe; thanh “Bắt đầu luyện tập” dính dưới màn hình.
2. **Luyện tập (chế độ tập trung)**: ẩn hero; nút thoát, thanh tiến độ dày màu xanh lá, chuỗi đúng 🔥; dãy chấm câu để nhảy câu (xanh đúng, đỏ sai). Mỗi màn một câu: phương án là ô lớn có số (phím 1–9), câu điền nhấn Enter. Thanh dưới: Để sau / Kiểm tra → phản hồi xanh “Chính xác!” hoặc đỏ “Chưa đúng” kèm đáp án, lời giải, bằng chứng, Xem tư liệu, Làm lại, Tiếp tục (Enter). Câu mở: đếm từ có vạch đủ độ dài, đồng hồ Part, ghi âm, Xem bài mẫu → tự đánh giá 1–4 → Tiếp tục. Tư liệu vẫn cạnh câu hỏi trên desktop, thu gọn trên điện thoại.
3. **Kết quả**: sticker theo kết quả, tiêu đề khích lệ, thẻ số liệu (độ chính xác, câu đúng, câu tự đánh giá, cần làm tiếp), pháo giấy khi đạt hết; nút chính là Làm tiếp/Sửa câu hoặc Bài tiếp theo; danh sách câu cần sửa dẫn thẳng về câu đó.

## Interactive Learning Coach (`book2-coach.tsx`)

Harry là Coach theo kịch bản, không phải AI. Coach nằm ngay trong trang, không phủ lên nội dung. Người học có thể bấm ✕ để ẩn (trình duyệt ghi nhớ lựa chọn này) và bấm "Nói cách khác" để nghe một câu gợi ý khác. Chuyển động tắt theo `prefers-reduced-motion`.

- **Bài có kịch bản** (`content.coach`, lấy từ `m05_writing_speaking.coach_script` hoặc `m06_learning_coach`): phase đổi theo việc người học đang làm.
  - Writing: welcome → plan (chưa gõ) → draft (đang viết) → review (đã mở bài mẫu).
  - Speaking: welcome → plan (đang chuẩn bị 60 giây) → record (đang nói hoặc ghi âm) → reflect.
  - Nút hành động của kịch bản gắn với thao tác thật: xem gợi ý hoặc checklist, bấm giờ chuẩn bị, nói và ghi âm, làm lại, tự đánh giá. Nút xem mẫu chỉ mở bài mẫu sau khi người học đã viết hoặc nói đủ.
- **Bài không có kịch bản:** Coach chào theo kỹ năng ở bước Tìm hiểu. Trước mỗi câu, Coach đưa mẹo theo dạng câu (TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN, tiêu đề đoạn, điền từ, trắc nghiệm, ngữ pháp, câu mở). Khi trả lời sai, Coach đưa gợi ý sửa và khung chuyển sang tông vàng cam. Khi xong bài, Coach đọc câu tự kiểm tra đầu tiên của bài.

## Nhập dữ liệu Book 2

`python scripts/build-book-2.py <BOOK2_ALL_8_UNITS.zip>`, rồi chạy `python scripts/fix-book2-u01-items.py` và `node scripts/verify-book2-data.mjs`.

- Unit có `is_published=false` không vào lộ trình, và file cũ của unit đó bị xoá. Hiện Unit 7 đang ở trạng thái này.
- `m05_writing_speaking` thành hai bài "Luyện thêm" ở cuối unit. Bài làm được tự đánh giá, không chấm tự động.
- `u06_speaking_refactor` tách bài Unit 6 Speaking L04 thành L04A–C, giữ nguyên mã câu. Bài mới đọc bài làm cũ của L04 qua `legacy_slug`.
- Câu có `options` là chuỗi được đổi thành danh sách rỗng.

## Lớp dạy học C09 (`book2-teaching.tsx`)

`build-book-2.py` đọc `units/Uxx/self_study_v3/<kỹ năng>-Lnn.json` và rút gọn thành `content.teaching`. Bước này bỏ metadata biên tập, các trạng thái và tài liệu dành riêng cho giáo viên. Mỗi kỹ năng dùng một định dạng nguồn khác nhau (c02 Đọc, c03 Nghe, c04 Viết Task 1, c06 và Part 2/3 Nói), nhưng sau bước này đều thành chung các trường sau: các bước làm, hiểu sâu, lưu ý, biểu đồ, ví dụ mẫu, mẹo, lỗi thường gặp, từ vựng, luyện có hướng dẫn, ghi chú Part 2, tiêu chí tự chấm, Coach và lịch ôn.

- **Bước Tìm hiểu:** khi một bài có lớp dạy học, các khối mới thay cho các khối cũ có nội dung tương ứng. Ví dụ mẫu luôn bắt người học tự nghĩ trước, rồi mới mở đáp án kèm bằng chứng, lý do và bẫy cần tránh. Các bước luyện có hướng dẫn đánh dấu được và được lưu như checklist.
- **Coach C08:** mặc định thu gọn thành nút "Hỏi Coach Harry" và chỉ tự mở khi người học trả lời sai. Các trigger trong gói được gom thành 5 nhóm: trợ giúp, từ vựng, gợi ý, khi sai, khi ôn.
- **Màn kết quả:** có thêm lịch ôn gợi ý (sau 1, 3, 7 ngày) và tiêu chí tự chấm.

Dữ liệu C09 còn mâu thuẫn, cần bên nội dung xử lý. Ví dụ ở U01 W-L03: câu hỏi dùng `W-HOUSING-01` (Eastbank, 2011–2023), phần dạy học dùng biểu đồ `C04-U01-W03-LINE` (Northvale, 2006–2026), còn `writing_model` lại tham chiếu `W-HOUSING-04` (2000–2025). Vì vậy bài mẫu của câu hỏi vẫn lấy từ `items.jsonl`, không lấy từ `writing_model`.

## Quy tắc khi thêm bài hoặc unit mới

- Chỉ cần `lesson.skill` đúng một trong bốn kỹ năng; không thêm màu riêng cho từng unit trong bài học.
- Mỗi màn hình có đúng một nút chính (khối màu, viền dưới đậm). Nút phụ là nền trắng.
- Phản hồi luôn đi cùng chữ và biểu tượng (✓/✗), không chỉ dựa vào màu.
- Tôn trọng `prefers-reduced-motion`: mọi hiệu ứng tắt khi người dùng yêu cầu.
- Không hiện điểm trước khi người học làm câu nào; dùng % đã làm.

## Đã kiểm tra

Desktop 1440px và điện thoại 375px: bài Đọc có bài đọc bên cạnh, Viết điền từ, Nghe có audio, Nói tự đánh giá, màn kết quả, đường học. Bàn phím: 1–9 chọn, Enter kiểm tra và đi tiếp, Enter trên ô đã chọn cũng kiểm tra. Không tràn ngang ở 375px.
