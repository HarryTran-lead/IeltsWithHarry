# Kho từ vựng tiếng Anh: nhập và biên tập

## Nguồn và giới hạn

ZIP tại `deliverables/IeltsWithHarry_Vocabulary_Topics_Level_1-7plus.zip` có 9.937 bản ghi tiếng Anh. CEFR-J là wordlist **tiếng Anh** được biên soạn ở Nhật; đây không phải dữ liệu tiếng Nhật hay danh sách từ IELTS chính thức. Gói chia thành **36 topic** và **Level 1–7+**. Level là lộ trình học nội bộ, không phải band IELTS. Topic tự gắn và nghĩa đầu tiên từ WordNet có thể sai ngữ cảnh.

Quy tắc Level: A1 → 1, A2 → 2, B1 có tần suất tiếng Anh Zipf ≥ 4,2 → 3, B1 còn lại → 4, B2 → 5, C1 → 6, C2 → 7+. Tần suất lấy từ [wordfreq](https://github.com/rspeer/wordfreq); chỉ dùng để chia nhóm B1, không suy ra điểm thi. CEFR gốc vẫn nằm trong ZIP và database để đối chiếu.

Nguồn: [CEFR-J](https://www.cefr-j.org/download.html), [Octanove C1/C2 (CC BY-SA 4.0)](https://github.com/openlanguageprofiles/olp-en-cefrj), [Open English WordNet (CC BY 4.0)](https://en-word.net/downloads).

## Trạng thái kho trực tuyến

Đã nhập đủ **9.937 bản ghi nguồn** vào Supabase. Học viên mở `/app/vocabulary/library` và chọn **Kho nguồn** để tìm theo từ, topic hoặc Level 1–7+. Đây là dữ liệu tham khảo chưa duyệt; chọn **Tra và lưu từ** để xem nghĩa trước khi thêm vào sổ. Chế độ **Từ đã duyệt** hiện có 4 từ được biên tập riêng.

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
5. Học viên xem từ đã duyệt ở tab **Từ đã duyệt** tại `/app/vocabulary/library`, lọc topic/Level và lưu từ vào sổ.

Nhập lại ZIP chỉ cập nhật **trường nguồn** (headword, CEFR, topic gợi ý, định nghĩa/ví dụ gợi ý, nguồn trích dẫn). Nghĩa Việt, định nghĩa/ví dụ đã duyệt, topic đã duyệt và trạng thái xuất bản được giữ nguyên. Chỉ bản ghi có nghĩa Việt, định nghĩa đã duyệt và topic đã duyệt mới được xuất bản.

Toàn bộ 9.937 dòng đã được gán topic. Những dòng thiếu nhãn nguồn được phân theo nhóm nghĩa WordNet, từ khóa trong headword/định nghĩa và từ loại; một số headword thiếu định nghĩa được sửa topic riêng. Không còn nhóm **General & Cross-topic**. Các topic rộng như **Actions & Processes**, **Descriptions & Attributes** và **Grammar & Usage** dùng cho từ liên chủ đề. `topic_basis` trong CSV ghi rõ căn cứ; việc gán topic tự động vẫn cần kiểm tra khi dùng để tạo bài IELTS. File `catalog/topical_candidates_for_ielts_review.csv` ưu tiên các dòng có nhãn nguồn hoặc nhóm nghĩa cụ thể. Gói còn có `indexes/study_levels.csv`, `by_study_lane/` và `by_topic/` để kiểm tra từng nhóm trước khi nhập lại.
