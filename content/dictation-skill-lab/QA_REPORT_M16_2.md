# KẾT QUẢ QA M16.2

## Đã sửa/kiểm thử được

- **300/300** JSON hợp lệ với schema 1.1; giữ nguyên 300 ID, 2.702 transcript turns, 2.776 question IDs.
- **25 câu hỏi/đáp án/đề** thay đổi có căn cứ; **4 câu** sửa tham chiếu bằng chứng.
- **9 prompt** được rút gọn để không lộ lại từ đích; **2 prompt khác** thay hoàn toàn vì lộ đáp án.
- **1.156** câu Completion/Short Answer có giới hạn từ theo định dạng bài luyện IELTS (ít hơn 1.158 trước sửa vì hai câu được chuyển sang MCQ).
- **45** câu `main_idea` được hiển thị dưới dạng MCQ, không phải dạng câu mới của IELTS.
- **36/36** câu map có sơ đồ SVG được liên kết đúng mã bài.
- **Bốn Section** có vị trí đáp án A/B/C phân bố xấp xỉ đồng đều.
- **5 trường hợp số bằng chữ nhiều từ** được đưa sang `practice_aliases`; trong bài kiểu IELTS chỉ nhận đúng định dạng giới hạn từ.
- **30 bài kiểm thử tự động** chạy đạt.

## Hàng chờ giáo viên / không được gọi là lỗi đã xác minh

- EDITORIAL_PATCH_REVIEW: 25 trường hợp
- LEAK_PATCH_REVIEW: 9 trường hợp
- NON_VERBATIM_EVIDENCE_CANDIDATE: 53 trường hợp
- NUMERAL_VARIANT_REVIEW: 5 trường hợp
- QA_CANDIDATE: 172 trường hợp

Hàng chờ có thể chứa trùng cùng một câu với nhiều lý do. Nhiều cảnh báo chỉ do cách viết số (`seventy` / `70`) hoặc địa chỉ, không phải lỗi chắc chắn. Giáo viên phải xét lại lời thoại và dạng câu hỏi thực tế.

## Không thể xác nhận trong môi trường hiện tại

- Không có audio thực tế; **không thể** chứng nhận accent, cách đọc tên, con số, ngắt nghỉ hoặc timestamp.
- Không thể kiểm tra TTS với Gemini API / upload lên R2 khi thiếu quyền và credential.
- Chưa có kiểm định toàn bộ bằng giáo viên IELTS; QA máy không chứng nhận 0 lỗi ngữ pháp hoặc tương đương đề thi thật.
- Chưa có quyền viết trực tiếp vào website của người dùng.
- Không có bài Mock Listening hoàn chỉnh 40 câu được tạo từ 300 bài này.

## Mức độ hoàn thành từng bước người dùng yêu cầu

| Bước | Đã thực hiện | Chưa thể hoàn thành |
|---|---|---|
| 1. Sửa đáp án/dẫn chứng | Áp dụng bản vá, giữ nguyên ID, có log/checksum | Giáo viên rà những câu mơ hồ còn lại |
| 2. Chuẩn IELTS | Word limit, MCQ, nhãn Practice, checker | Không có đề chuẩn hóa 4 × 10/40 câu hoặc chứng nhận band |
| 3. Sư phạm | Sửa các lỗi ngữ nghĩa xác minh, QA dạng bài và test | Giáo viên duyệt toàn bộ nội dung |
| 4. Audio | 1.227 job manifest, script dry-run/worker/ghép WAV | API keys, rights, audio thật, alignment, voice QC |
| 5. Phát hành | Gating fail-closed, chấm bài, adaptive engine, kiểm thử | Tích hợp thật với website và kiểm thử người dùng |

**Không mở khóa bài học ở giai đoạn này.**
