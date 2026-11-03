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

## Quy tắc khi thêm bài hoặc unit mới

- Chỉ cần `lesson.skill` đúng một trong bốn kỹ năng; không thêm màu riêng cho từng unit trong bài học.
- Mỗi màn hình có đúng một nút chính (khối màu, viền dưới đậm). Nút phụ là nền trắng.
- Phản hồi luôn đi cùng chữ và biểu tượng (✓/✗), không chỉ dựa vào màu.
- Tôn trọng `prefers-reduced-motion`: mọi hiệu ứng tắt khi người dùng yêu cầu.
- Không hiện điểm trước khi người học làm câu nào; dùng % đã làm.

## Đã kiểm tra

Desktop 1440px và điện thoại 375px: bài Đọc có bài đọc bên cạnh, Viết điền từ, Nghe có audio, Nói tự đánh giá, màn kết quả, đường học. Bàn phím: 1–9 chọn, Enter kiểm tra và đi tiếp, Enter trên ô đã chọn cũng kiểm tra. Không tràn ngang ở 375px.
