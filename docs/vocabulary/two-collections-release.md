# Hai bộ từ vựng — triển khai ngày 28/10/2026

## Phạm vi

- **Từ A1–C2:** dùng kho `vocabulary_bank_entries` hiện có, lọc theo CEFR thật. Giữ nguyên toàn bộ `source_id`, từ bài học, sổ tay và lịch ôn. RPC CEFR mới đọc cùng kho `student_visible` hiện có; RPC Level cũ vẫn tồn tại cho caller cũ.
- **Từ IELTS Band 1–7+:** bảng `ielts_vocabulary_entries` riêng, nhập 25 CSV do chủ dự án xác nhận có quyền đăng. 5.000 term chuẩn hóa duy nhất, 25 topic, 10.002 ví dụ; hai hàng có ba ví dụ được giữ đủ. Bộ này có tìm kiếm, lọc topic/band, xem định nghĩa/ví dụ và bốn chế độ luyện tập. Học viên có thể đi từ thẻ từ sang chức năng tra/lưu hiện có.
- **Band gợi ý:** `wordfreq` tiếng Anh 3.1.1, điểm Zipf với ngưỡng 5,5/5,0/4,5/4,0/3,5/3,0 tương ứng band 1/2/3/4/5/6; thấp hơn là 7+. Đây là **ước lượng để sắp lộ trình**, không phải band IELTS chính thức hay đánh giá độ khó đã biên tập. `band_method`, `band_score`, `band_model` lưu riêng để có thể chỉnh từng từ. Nội dung nguồn được gắn `source_unreviewed`.

## Mốc kiểm tra database

| Mục | Development | Production |
| --- | ---: | ---: |
| Migration `202610280003` | Đã áp dụng | Đã áp dụng |
| Kho CEFR cũ | 9.941 | 9.941 |
| Từ gắn bài học cũ | 1.237 | 1.237 |
| Từ IELTS | 5.000 | 5.000 |
| Ví dụ IELTS | 10.002 | 10.002 |
| Topic IELTS | 25 | 25 |
| Nhập lại cùng archive | 0 hàng mới | 0 hàng mới |
| Truy vấn `anon` vào bộ IELTS | 0 hàng | 0 hàng |
| Role `authenticated` với UID giả | 5.000 hàng | 5.000 hàng |

Band gợi ý theo số từ: 1: 89; 2: 356; 3: 912; 4: 1.258; 5: 1.084; 6: 736; 7+: 565. Archive SHA-256 `9add911cefcecf45cc6d1fbe4f947f0f38387ba0f3399ab07d2e55a1df738674`. Hai bản backup PostgreSQL trước migration và snapshot Vocabulary logic đã đặt ngoài repo tại `C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private\`.

## Kiểm tra mã và giới hạn

Trong nhánh phát hành sạch, `npm run typecheck`, ESLint ở hai component Vocabulary và hai helper mới, `npm run test -- tests/vocabulary.test.ts tests/vocabulary-bank.test.ts`, `npm run build` với demo mode và `git diff --check` đều thành công. Cần thử Preview với tài khoản học viên thật, sau đó mới xác nhận giao diện Production. Probe bằng UID giả kiểm tra chính sách truy cập cơ bản, không thay thế đăng nhập thật. Không có restore thử thành công của full backup vì PostgreSQL cục bộ thiếu `pg_cron`; đây là rủi ro còn lại được chủ dự án chấp nhận khi yêu cầu triển khai ngay.

## Quy trình nhập lặp lại

`scripts/import-ielts-vocabulary.py` mặc định dry-run. `--apply` yêu cầu environment và project ref trùng nhau; script kiểm hash archive, số hàng/ví dụ, chặn thay đổi source row đã tồn tại, upsert kiểu ignore-duplicate và đọc lại checksum. Không đặt CSV trong `public/` hay Git.
