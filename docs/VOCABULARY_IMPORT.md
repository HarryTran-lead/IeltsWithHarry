# Kho từ vựng tiếng Anh: nhập và biên tập

## Nguồn và giới hạn

ZIP tại `deliverables/IeltsWithHarry_Vocabulary_Topics_Band_0-7plus.zip` có 9.937 bản ghi tiếng Anh. CEFR-J là wordlist **tiếng Anh** được biên soạn ở Nhật; đây không phải dữ liệu tiếng Nhật hay danh sách từ IELTS chính thức. Các nhóm band là lộ trình học do IeltsWithHarry quy ước từ CEFR. Topic tự gắn và nghĩa đầu tiên từ WordNet có thể sai ngữ cảnh.

Nguồn: [CEFR-J](https://www.cefr-j.org/download.html), [Octanove C1/C2 (CC BY-SA 4.0)](https://github.com/openlanguageprofiles/olp-en-cefrj), [Open English WordNet (CC BY 4.0)](https://en-word.net/downloads).

## Trạng thái kho trực tuyến

Đã nhập đủ **9.937 bản ghi nguồn** vào Supabase. Học viên mở `/app/vocabulary/library` và chọn **Kho nguồn · 9.937 từ** để tìm theo từ, topic hoặc cấp độ CEFR. Đây là dữ liệu tham khảo chưa duyệt; chọn **Tra và lưu từ** để xem nghĩa trước khi thêm vào sổ. Chế độ **Bài học đã duyệt** hiện có 4 từ được biên tập riêng.

Database trước/sau khi nhập: khoảng 19 MB / 25 MB. ZIP nguồn vẫn giữ ở máy, không đưa vào gói triển khai Vercel. Script `scripts/import-vocabulary-bank.mjs` có thể chạy lại để cập nhật các trường nguồn, không ghi đè phần biên tập:

```powershell
node --env-file=.env.production.local scripts/import-vocabulary-bank.mjs
node --env-file=.env.production.local scripts/import-vocabulary-bank.mjs --apply
```

Lệnh đầu chỉ kiểm tra ZIP; lệnh `--apply` mới ghi vào Supabase. Cần đăng nhập Supabase CLI hoặc cấu hình service role key trong biến môi trường tại máy, tuyệt đối không đưa key vào Git.

## Quy trình cập nhật trên web

1. Đăng nhập tài khoản admin, mở **Admin portal → Kho từ & nhập ZIP** tại `/admin/vocabulary/library`.
2. Chọn ZIP hoặc `catalog/vocabulary_all.csv` trong ZIP. Trang sẽ đọc file ngay trong trình duyệt, kiểm tra cột và hiện 3 dòng mẫu.
3. Bấm **Nhập vào kho nháp**. Dữ liệu được gửi theo lô 150 dòng; nếu mạng ngắt, chọn lại cùng file và nhập tiếp. `source_id` giúp cập nhật bản ghi nguồn, tránh tạo bản sao.
4. Dùng tìm kiếm và bộ lọc để mở một từ. Đối chiếu định nghĩa và ví dụ gốc, sửa định nghĩa, thêm nghĩa Việt, chọn topic đúng và lưu nháp hoặc xuất bản.
5. Học viên xem từ đã duyệt ở tab **Bài học đã duyệt** tại `/app/vocabulary/library`, lọc topic/cấp độ và lưu từ vào sổ.

Nhập lại ZIP chỉ cập nhật **trường nguồn** (headword, CEFR, topic gợi ý, định nghĩa/ví dụ gợi ý, nguồn trích dẫn). Nghĩa Việt, định nghĩa/ví dụ đã duyệt, topic đã duyệt và trạng thái xuất bản được giữ nguyên. Chỉ bản ghi có nghĩa Việt, định nghĩa đã duyệt và topic đã duyệt mới được xuất bản.

File `catalog/topical_candidates_for_ielts_review.csv` là danh sách ứng viên đã gắn topic để biên tập ưu tiên; không tự động xuất bản.
