# ENGLISH SKILL LAB — M49L ADD-ONLY PRE-IMPORT QA (08/11/2026)

## Kết quả hiện có (đã chạy kiểm thử trực tiếp trên nội dung của ZIP)
- **Legacy tham chiếu:** 300 ID (từ ZIP M16.2), dùng **chỉ để so trùng ID**, không phải bản xuất DB live; không được đưa vào import.
- **Dữ liệu bổ sung:** 280 bài Dictation = 120 Foundation + 80 Section Practice + 80 Section Simulation; **3.550 câu hỏi Dictation**. 10 Foundation Mastery (FND2-111…120) ban đầu rỗng đã được viết nội dung luyện nghe mới: 100 lượt thoại + 100 câu, chờ duyệt.
- **20 Listening Mock Tests** = 80 Parts × 10 câu = 800 câu; đặt trong **module Listening độc lập**, không lẫn với Dictation. 80 bìa WebP khác nhau và 8 map SVG.
- **400 hoạt động tái sử dụng** = 120 Foundation + 120 Section Skill + 160 Post-Test; nguồn M34 lấy phiên bản đã rebase theo bản 20 Map v2 mới nhất.
- **28 SVG Dictation** = 20 bản đồ Section 2 Practice và 8 bản đồ Section 2 Simulation.
- **Level:** L1:31, L2:61, L3:28, L4:47, L5:27, L6:46, L7:40. Đây là *nhãn biên tập*, chưa hiệu chuẩn bằng IELTS thật.
- **Kiểm tra cấu trúc:** 0 lỗi hard trong lần quét hiện tại; tất cả 280 bài có lời thoại, câu hỏi, đáp án/correct_option và tham chiếu evidence đúng ID; 20/20 đề đúng 4×10; 80 cover có hash khác nhau; SVG parse được; 700 ID mới duy nhất; 0 trùng với 300 ID từ ZIP tham chiếu.

## Những gì CHƯA đạt và không được coi là QA pass
1. **Audio**: không có MP3/WAV mới trong gói. 280 bài Dictation, 20 Mock Tests (80 Parts) và 400 reuse activities chưa được duyệt media. 800/800 câu Listening chưa có timestamps audio thực; 400 activity chưa có clip start/end thực.
2. **100 lượt thoại ở S2-EXP-001…020 còn thiếu `translation_vi`** (mỗi bài 5 lượt). Phải biên tập/dịch, đối chiếu với câu Anh, duyệt trước khi bật nội dung có hiển thị dịch Việt.
3. **40 cặp bài** có độ chồng trùng 3-gram >0,32, chủ yếu ở Section 2; đây là *tín hiệu cần review* chứ chưa kết luận trùng đề. Danh sách ở `qa/NEAR_DUPLICATE_CANDIDATES.csv`.
4. **304 cờ nội dung trong báo cáo M36 cũ** trải rộng cả các giai đoạn cũ và mới. Không thể gộp các cờ đó thành 'đã sửa' hay '304 lỗi trong 280 bài mới'. Cần giáo viên phân xử trên nguồn phiên bản hiện tại.
5. **Chưa kiểm duyệt hình theo từng transcript / tuyến Map / đánh giá DA90 / phản biện đáp án** bằng người thật. 10 bài Mastery mới viết trong mốc này cũng chưa qua vòng duyệt độc lập.
6. **Chưa truy cập DB production**, chưa có xuất danh sách live IDs/trạng thái và chưa chạy E2E Next.js/NestJS/PostgreSQL. Dữ liệu 300 bài cũ trên live không bị sửa trong phiên này.

## QUYẾT ĐỊNH
- **STAGING DRAFT PACKAGE PREPARED**, không phải '20 đề đã đạt chuẩn IELTS' hoặc 'đã import thành công'.
- **PRODUCTION IMPORT BLOCKED** trước khi Codex lấy DB export thật và thực hiện dry-run. Mọi record mới bắt buộc INSERT-ONLY, không UPDATE, DELETE, UPSERT hay ghi đè lịch sử.
- **STUDENT RELEASE BLOCKED** cho đến khi nội dung, tiếng Việt, audio, timestamp, maps, covers, bảo mật và giáo viên duyệt đủ.
