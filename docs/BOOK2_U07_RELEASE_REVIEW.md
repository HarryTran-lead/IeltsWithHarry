# Book 2 Unit 7: duyệt phát hành

Ngày 04/11/2026. Chủ sản phẩm yêu cầu duyệt và mở Unit 7 trong chat ("duyệt luôn đi"), dù gói M06/M09 ghi `is_published=false` và `BLOCKED_PENDING_AUDIO_AND_ACADEMIC_QA`. Script dựng mở unit này bằng `--publish U07`.

## Đã kiểm tra

- **Đáp án:** đối chiếu cả 72 câu (64 câu chấm tự động, 8 câu Viết/Nói tự đánh giá) với 4 bài đọc và 4 transcript. Không có đáp án sai nghĩa. 33 câu điền có đáp án xuất hiện nguyên văn trong tư liệu. Câu TRUE/FALSE/NOT GIVEN và câu trắc nghiệm được đọc kỹ từng câu.
- **Audio:** 4 file MP3 có thật. Độ dài ước tính 147, 158, 184 và 206 giây, tương ứng 114–141 từ mỗi phút so với transcript, nên không có file bị cắt. Đây là giọng máy tổng hợp ở 56 kbps, 22 kHz; chưa có ai nghe lại thủ công.
- **Giao diện:** bài Đọc có tư liệu tách đúng 6 đoạn A–F; bài Writing có bảng số liệu; Coach theo kịch bản `m06_learning_coach` chỉ gắn với bài Đọc và Nghe.

## Đã sửa (`scripts/fix-book2-u07-items.py`)

- Lời giải tiếng Việt cụ thể cho 64 câu, thay cho hai câu mẫu lặp lại. Câu mẫu bài Nghe trước đây ghi "chú ý thông tin được sửa" cả khi người nói không sửa gì.
- Bỏ "bằng chứng" ở 4 câu NOT GIVEN. Gói trích câu đầu của một đoạn không liên quan.
- Chấp nhận thêm các đáp án tương đương: "Thursday", "14th September", "10 pm", "degree".
- Gắn bảng số liệu cho 2 bài Writing Task 1. Trong gói, đề nói "The table/bar chart shows…" nhưng không tham chiếu tới dữ liệu.

## Rủi ro còn lại

- Unit 7 mới thay hoàn toàn bộ câu hỏi cũ. Bài làm cũ không chuyển được, và lộ trình ẩn mọi kết quả cũ có tổng số câu không khớp.
- Audio chưa được nghe thủ công; chất lượng giọng ở mức file tạm.
- Nội dung bài còn mỏng: mỗi bài 1 mục lý thuyết, 3 từ vựng, mục tiêu chung chung. Phần này để bên nội dung bổ sung.
- Chưa có kiểm duyệt học thuật độc lập ngoài lượt đối chiếu này.
