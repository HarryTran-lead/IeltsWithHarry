# Hệ thống học bằng nội dung soạn sẵn

Đích thiết kế: người biên soạn nhập tài liệu một lần; ứng dụng đọc cấu trúc, dựng hoạt động, kiểm tra đáp án xác định và hiện giải thích. Không cần AI. Bản thử ở `/app/content-lab` dùng [gói JSON mẫu](../src/content/demo-pack.json); nút **Tải JSON mẫu** cho phép sửa và nạp lại ngay trong trình duyệt.

| Kỹ năng | Dữ liệu người soạn nạp | Chức năng có thể sinh từ dữ liệu | Cách đánh giá |
| --- | --- | --- | --- |
| Từ vựng | Từ/cụm từ, nghĩa, định nghĩa, ví dụ, yêu cầu đặt câu, các câu được chấp nhận | Thẻ từ, lật nghĩa, đặt câu, xem mẫu, ôn từ sai | Khớp các câu đã soạn sau khi chuẩn hóa chữ hoa/dấu câu; hiển thị độ trùng từ tham khảo. Câu khác mẫu cần người học tự đối chiếu. |
| Ngữ pháp | Quy tắc, ví dụ, câu hỏi, lựa chọn, đáp án, giải thích | Đọc quy tắc, làm nhiều câu hỏi, xem lỗi, làm lại | So đúng/sai với đáp án đã soạn. |
| Reading | Bài đọc, nhiều câu hỏi, lựa chọn, đáp án, vị trí bằng chứng, giải thích | Đọc bài, trả lời, xem bằng chứng và giải thích | So đúng/sai với đáp án đã soạn. |
| Listening | Kịch bản hoặc tệp âm thanh, nhiều câu hỏi, đáp án, giải thích, transcript | Nghe, làm câu hỏi, mở transcript khi ôn | So đúng/sai với đáp án đã soạn. Bản thử dùng giọng đọc của trình duyệt từ kịch bản. |
| Writing | Đề bài, số từ tối thiểu, bài mẫu, checklist | Viết, đếm từ, so bài mẫu, tự đánh giá | Máy chỉ kiểm số từ; không tự chấm ngữ pháp, ý tưởng hay band IELTS. |
| Speaking | Câu hỏi, thời gian chuẩn bị, câu mẫu, checklist | Đếm giờ, ghi âm, nghe lại, so câu mẫu, tự đánh giá | Không tự chấm phát âm hay band IELTS. Bản ghi chỉ ở tab trình duyệt. |

## Ranh giới của bản thử

- Một gói JSON phiên bản 1 có nhiều từ và nhiều câu hỏi Grammar/Reading/Listening, cùng một đề Writing và Speaking. Có thể đổi nội dung và số mục rồi áp dụng lại, không sửa mã giao diện.
- Nạp JSON ở Content Lab chỉ đổi dữ liệu trong tab hiện tại; không ghi vào Supabase, không xuất bản, không lưu tiến độ. Màn học mẫu hiện có vẫn là luồng riêng.
- Nội dung được kiểm tra bằng Zod trước khi hiển thị. Đáp án trắc nghiệm chỉ lộ sau khi nộp từng câu. Đây là **chế độ luyện tập**; chế độ thi cần nộp cả bộ câu hỏi trước khi mở đáp án/transcript.
- Đối với câu mở, trùng câu mẫu chỉ có nghĩa khớp chuỗi đã soạn. Câu diễn đạt khác vẫn có thể đúng. Muốn chấm công bằng hơn mà không dùng AI, cần bài tập dạng điền từ/sắp xếp từ, tập đáp án chấp nhận nhiều biến thể, hoặc người chấm thật.

## Khi chuyển từ demo sang nội dung thật

1. Lưu nhiều gói theo khóa học/bài học trong Supabase; thêm phiên bản nội dung, trạng thái nháp/xuất bản và quyền admin.
2. Nhập JSON/CSV theo lô, xem lỗi từng dòng và preview trước khi xuất bản. CSV phù hợp nhất cho bảng từ vựng; câu hỏi nhiều cấu trúc nên dùng JSON.
3. Chấm trên server/database bằng answer key không gửi sớm tới người học; lưu từng câu trả lời và lịch ôn tập. Hiện `submit_exercise` đã chấm câu hỏi trắc nghiệm cho bài học database.
4. Gắn tệp Listening đã được phép sử dụng và lưu bản ghi Speaking ở kho riêng tư khi có storage.
