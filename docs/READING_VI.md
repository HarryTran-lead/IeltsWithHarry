# Bản dịch tiếng Việt cho Reading

`src/data/reading-vi/passages.json` chứa bản dịch tiếng Việt do biên tập viên viết cho 42 bài đọc của English Skill Lab · Reading Test 01–14, lấy từ gói `IELTS_Reading_14_De_560_Loi_Giai_FULL_IMPORT_VI.zip` (`TRANSLATIONS_VI/TESTxx.json`).

- Mỗi bản dịch được lưu theo SHA-256 của bài đọc tiếng Anh (gộp khoảng trắng). Bài đọc bị sửa thì bản dịch cũ tự không hiện nữa, nên không bao giờ hiện lệch.
- `GET /api/ielts/passage-vi?key=<sha256>` trả bản dịch. Chỉ dùng ở chế độ luyện tập, không dùng trong giao diện thi thật.
- Dựng lại: giải nén gói rồi chạy `python scripts/build-reading-vi.py <thư mục đã giải nén>`. Script dừng lại nếu tên bài hoặc số đoạn không khớp.

Gói còn có đáp án và lời giải (`SERVER_ONLY_*`), nhưng chưa được nạp; phần đó phải lưu ở server, không đưa vào mã phía trình duyệt.

Tra từ trong bài đọc không dùng dịch máy: nghĩa tiếng Việt lấy từ `vocabulary_bank_entries` (nghĩa đã duyệt, rồi đến từ điển Thichhoc/Skypedia, CC BY-SA 4.0) qua `GET /api/vocabulary/meaning`, còn câu dịch lấy từ bản dịch đề ở trên.
