# Lộ trình luyện Việt–Anh theo mức hướng tới IELTS

## Nguyên tắc gắn nhãn

IELTS Writing chấm một bài hoàn chỉnh theo Task Response/Task Achievement, Coherence and Cohesion, Lexical Resource, và Grammatical Range and Accuracy. Một từ, câu hoặc đoạn dịch không cho ra điểm IELTS chính thức. Vì vậy `practiceLevel` trong ứng dụng là **mức luyện nội bộ**, lấy cảm hứng từ độ phức tạp ngôn ngữ và yêu cầu lập luận trong mô tả band, không phải điểm thi dự đoán. Tham chiếu: https://www.ielts.org/take-a-test/your-results/ielts-scoring-in-detail và https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf.

`data/translation-practice/level-rubric.json` xác định đơn vị bài, cấu trúc, từ vựng và yêu cầu lập luận cho từng mức 1.0–9.0. Mức 1.0 bắt đầu bằng từ riêng lẻ; 1.5–2.0 là cụm; 2.5 chuyển từ cụm sang câu ngắn; 3.0–6.5 tăng độ phức tạp của câu; từ 7.0 là đoạn nhiều câu để luyện tổ chức ý và sắc thái. Đây là **quy ước biên tập của sản phẩm**, không phải bảng quy đổi chính thức từ từng câu sang điểm IELTS.

## Dữ liệu đang dùng

- `data/translation-practice/starter-51.json`: 51 bài gốc đã chỉnh bài mức thấp, thêm thẻ ngữ pháp và giải thích riêng.
- `data/translation-practice/advanced-starter-paragraphs.json`: bổ sung lập luận cho 15 bài gốc mức 7.0–9.0, biến chúng thành bài dịch đoạn trong lộ trình xuất bản.
- `data/translation-practice/level-authored-34.json`: 34 bài được soạn riêng theo rubric, hai bài mỗi mức. Từ mức 7.0 trở lên, hai bài mới là đoạn nhiều câu có lập luận hoặc phản biện.
- `data/translation-practice/level-authored-expanded.json`: 865 bài mới được biên soạn có hỗ trợ AI. Các mức 1.0–8.5 qua một lượt rà soát bằng mô hình; 7.0–7.5 qua thêm một lượt kiểm tra và sửa ví dụ. Mức 9.0 được biên tập thủ công từ bản nháp sau khi dịch vụ rà soát hết hạn mức. Toàn bộ bài qua kiểm tra cấu trúc và câu trùng, nhưng vẫn là bản thử nghiệm, chưa được chuyên gia IELTS hiệu chỉnh trên bài làm thực tế.
- `src/data/translation/band-exercises.json`: **950 bài** đang hiển thị trong lộ trình: 40 bài/mức 1.0–2.5, 50 bài/mức 3.0–4.5, 60 bài/mức 5.0–6.5 và 70 bài/mức 7.0–9.0. Mỗi bài có `rationaleVi` giải thích vì sao được đặt ở mức đó và `calibrationStatus: internal_review`. Mỗi lượt học chọn 5, 10 hoặc 15 bài để tránh một phiên quá dài.
- `data/translation-practice/pattern-candidates.json`: **459 biến thể mẫu câu** từ đợt tạo trước. Chúng bị loại khỏi lộ trình band vì cấu trúc lặp lại và chưa được hiệu chỉnh từng câu. Có thể dùng làm nguồn ứng viên cho biên tập viên, chưa được hiển thị như bài đã gắn mức.
- Bài luyện dịch theo chủ đề hiện có ở `/app/vocabulary/translation`; lộ trình mức liên kết sang trang đó. Không suy band cho dữ liệu theo chủ đề nếu chưa duyệt từng bài.

Các nghiên cứu, chính sách và trường hợp nêu trong bài mới là tình huống minh họa để luyện dịch và phân tích, không phải dữ kiện được trích nguồn để sử dụng trong bài thi.

Chạy `python scripts/build-translation-practice.py` để tạo lại hai file JSON xuất bản/ứng viên từ dữ liệu nguồn. `src/lib/translation/schema.ts` định nghĩa dữ liệu lộ trình. Kiểm thử `src/lib/translation/band-practice.test.ts` bắt buộc 17 mức, đúng số bài từng mức, không trùng ID/câu, và toàn bộ bài mức 7.0–9.0 là đoạn ít nhất ba câu. Báo cáo kiểm tra tự động và nhật ký chỉnh sửa của lượt rà soát lưu ở `data/translation-practice/quality-report.json`.

## Kiểm duyệt để mở rộng

1. Biên tập viên song ngữ đọc từng cặp Việt–Anh, kiểm tra ý nghĩa, ngữ pháp, độ tự nhiên và cách dùng từ mục tiêu; thêm ít nhất một cách diễn đạt thay thế khi có thể.
2. Người hiệu chỉnh độ khó độc lập đối chiếu `level-rubric.json`, đánh dấu `practiceLevel`, ghi lý do và mức độ chắc chắn. Câu không rõ mức để ở trạng thái ứng viên.
3. Dùng câu trả lời của học viên ở nhiều trình độ để hiệu chỉnh: tỷ lệ làm đúng, dạng lỗi, thời gian làm và sự bất đồng giữa người duyệt. Không suy band từ độ dài hoặc vài từ nâng cao.
4. Chỉ sau khi qua hai bước duyệt nội dung và độ khó bởi người biên tập mới chuyển `editorialStatus` từ `pilot` sang `approved`. Kho mới vẫn gắn `pilot` và cần được hiệu chỉnh từ dữ liệu học viên trước khi coi độ khó là đáng tin cậy.

Khi duyệt kho theo chủ đề, ưu tiên cặp Việt–Anh có đáp án tự nhiên, câu ngắn vừa sức và từ mục tiêu được dùng đúng nghĩa. Các cờ tự động chỉ hỗ trợ xếp hàng đọc lại, không thay thế duyệt thủ công.

Tiến độ người học vẫn lưu trong `localStorage` theo tài khoản trên từng thiết bị. Khi đồng bộ qua Supabase, dùng `exercise_id` cùng `version` để tránh coi một bài đã sửa là bài đã hoàn thành từ trước.
