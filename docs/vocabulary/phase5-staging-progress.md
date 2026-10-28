# Vocabulary V2 — Phase 5, tiến độ vùng nháp

## Trạng thái ngày 28/10/2026

Dev có catalog **40 chủ đề học** riêng với 36 nhãn kho nguồn CEFR: 25 tên topic từ nguồn IELTS và 15 topic mở rộng. 15 topic mở rộng có tổng mục tiêu 2.650 mục từ mới duy nhất sau duyệt. Catalog là kế hoạch biên tập; việc tạo topic không tự gắn từ hiện có vào topic học và không làm tăng số từ đã xuất bản.

Ma trận phạm vi cho cả 15 topic nằm ở `content/vocabulary/phase5/coverage-matrix.json`. Các trường subtopic, mục tiêu CEFR và mức ưu tiên là hướng dẫn soạn nội dung, chưa phải dữ liệu đã duyệt của người học.

Hai batch đầu `Everyday Routines & Habits` đã được đưa vào **vùng nháp Dev**:

| Chỉ số | Kết quả |
| --- | ---: |
| Đề xuất term ban đầu | 80 |
| Trùng chính xác với IELTS/CEFR/bài học | 6, đã loại khỏi batch |
| Mục nháp có nghĩa Việt, pattern, POS, CEFR/stage/priority đề xuất | 50 |
| Ví dụ tiếng Anh trong hai batch | 100 |
| Trùng chính xác/biến thể gần trong batch | 0 |
| Mục có tín hiệu QA | 6 |
| Mục được biên tập viên duyệt | 0 |
| Mục mới được xuất bản | 0 |
| Còn thiếu so với mục tiêu 2.650 đã duyệt | 2.650 |

Sáu mục có tín hiệu rà soát gồm `brush one's teeth`, `change one's routine`, `run late`, `check one's messages`, `start the day` và `cross something off a list`. Phần lớn do biến cách động từ/đại từ trong ví dụ; một ví dụ ngắn. Đây là tín hiệu rà soát, chưa phải lỗi. Kiểm tra trùng theo chữ và biến thể gần không phát hiện trùng; kiểm tra **trùng nghĩa hoặc chỉ là collocation của entry cũ** vẫn cần biên tập. CEFR, stage và priority trên bản nháp chỉ là đề xuất, chưa được xác nhận.

## Kiểm soát dữ liệu

- Migration `202610280005` mới được áp dụng lên **Development**. Production chưa có catalog hoặc batch Phase 5 này.
- Bảng nháp không cấp quyền đọc cho `anon` hoặc `authenticated`; không có route học viên dùng bảng này. Hàng nháp không nằm trong `ielts_vocabulary_entries` và không thay đổi 5.000 từ IELTS hiện có.
- `scripts/stage-ielts-vocabulary-batch.py` mặc định dry run, chỉ chấp nhận project Dev, kiểm tra 25–50 dòng/batch, đối chiếu ba kho hiện có, rồi ghi cả batch trong một RPC transaction. Chạy lại cùng file thêm **0** bản nháp.
- Báo cáo chi tiết về trùng và QA đặt ngoài repo tại `C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private\phase5\`. Không đưa tài liệu nguồn hoặc các báo cáo có ID nguồn vào `public/`.

`scripts/verify-vocabulary-phase5-staging.py` xác nhận 40 topic, quota 2.650, 50 bản nháp, 100 ví dụ, quyền đọc ẩn, và ba kho cũ giữ nguyên 9.941/1.237/5.000 dòng. Phase 5 **chưa qua cổng GO**: còn cần biên tập và duyệt nội dung theo các batch 25–50 cho tới khi có đủ 2.650 mục mới thực sự đạt chất lượng.
