# Vocabulary V2 — Phase 1: mốc an toàn và đối soát thử

Ngày: 28/10/2026. Đã đọc hai Supabase project bằng CLI/REST, không chạy SQL ghi, migration, seed, import hay deploy. Script tái lập: `scripts/vocabulary-v2-phase1-audit.py`; kiểm tra snapshot: `scripts/verify-vocabulary-v2-snapshot.mjs`; full PostgreSQL dump: `scripts/vocabulary-v2-pg-backup.py`.

## 1. Inventory DB thực tế

CLI xác nhận **66 migration** khớp file local ở cả Development (`bhactqaxcvusmpeooxwi`) và Production (`vpkhriywprepuhrbarye`), migration cuối `202610280002`; không có migration lệch trong kết quả CLI. REST xác nhận các bảng liên quan tồn tại và đọc được.

| Chỉ số | Development | Production |
| --- | ---: | ---: |
| `vocabulary_bank_entries` | 9.941 | 9.941 |
| Headword chuẩn hóa duy nhất trong bank | 8.654 | 8.654 |
| Bank `published` | 4 | 4 |
| Bank `student_visible` | 9.937 | 9.937 |
| Nhãn topic trong bank | 36 | 36 |
| `vocabulary_entries` gắn bài học | 1.237 | 1.237 |
| `notebook_entries` / từ đã lưu | 0 / 0 | 20 / 20 |
| `user_word_reviews` | 0 | 0 |
| `vocabulary_review_events` | 0 | 0 |
| `vocabulary_practice_attempts` | 0 | 0 |
| `vocabulary_decks` / `vocabulary_deck_cards` | 0 / 0 | 0 / 0 |
| Study tasks có skill Vocabulary/Review | 0 | 0 |

Nguồn bank ở mỗi project: 7.801 CEFR-J, 2.136 Octanove, 4 bản biên tập. Fingerprint của các cột bank/lesson được chọn trong báo cáo đọc chỉ đọc trùng nhau giữa hai project. Điều này **không** chứng minh toàn bộ DB giống nhau; production có 20 từ đã lưu, Development không có. Mỗi project có bản hash riêng cho danh tính từ đã lưu và lịch ôn trong báo cáo private; không đưa user ID hoặc từ cá nhân vào repo.

Kiểm tra RLS chỉ đọc bằng khóa `anon`: ở cả hai project, truy vấn trực tiếp `vocabulary_bank_entries` trả 0 hàng, còn `vocabulary_entries` trả hàng public như schema hiện tại. Chưa kiểm thử quyền của learner/admin đăng nhập vì không dùng tài khoản người dùng trong lượt audit này.

## 2. Dry-run đối soát exact headword

Nguồn RAR giữ nguyên SHA-256 `9add911cefcecf45cc6d1fbe4f947f0f38387ba0f3399ab07d2e55a1df738674`: 25 CSV, 5.000 hàng/term chuẩn hóa duy nhất, 10.002 ví dụ. Đối soát dùng NFKC, casefold và gộp khoảng trắng; không xóa dấu nối, tự stem hay tự gộp nghĩa. Hai project cho cùng phân bố:

| Nhóm ứng viên | Số hàng | Ý nghĩa |
| --- | ---: | --- |
| Khớp một bank và lesson | 114 | Cần so sense/topic và liên kết ID cũ. |
| Khớp một bank | 835 | Cần so nghĩa nguồn/biên tập. |
| Chỉ khớp lesson | 144 | Không tạo mục mới trước khi đối soát bài học. |
| Khớp nhiều bank records | 213 | Review thủ công; 34 hàng trong nhóm này cũng khớp lesson. |
| Không khớp exact với bank/lesson | 3.694 | Ứng viên draft mới, **chưa** kết luận canonical mới. |
| **Tổng** | **5.000** | 1.306 hàng khớp ít nhất một nguồn hiện có. |

Theo từng nguồn: 1.162/5.000 term khớp bank, 292 khớp lesson, 148 khớp cả hai. Ví dụ `sprawl` và `murder` khớp nhiều bản ghi bank; `litter` có cả bank và lesson; `urban regeneration` chỉ có lesson; `urbanisation` không có exact match. Trong 3.694 hàng chưa khớp exact, **5 hàng** có ứng viên khác chính tả hoặc dấu nối theo phép kiểm hẹp: `vandalise`/`vandalize`, `subsidise`/`subsidize`, `clean up`/`clean-up`, `make up`/`make-up`, `hypothesise`/`hypothesize`. Không tự gộp các cặp này. Các kết quả là **candidate diff**, chưa phải quyết định `created`, `linked` hay `new_sense`. File `import_diff_exact_candidates.csv` trong thư mục private có một dòng cho từng source row, source-row checksum, số ví dụ, ID exact và headword biến thể ứng viên ở hai project; không chứa definition/example.

## 3. Snapshot và kiểm tra khôi phục cục bộ

Đã xuất **logical snapshot riêng tư** của 8 bảng Vocabulary/content/progress liên quan và các study task Vocabulary/Review. ZIP chứa JSON từng bảng cùng manifest số hàng và SHA-256. Snapshot ở ngoài Git và ngoài thư mục dự án: `C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private\`.

| Snapshot | SHA-256 | Kết quả nạp lại |
| --- | --- | --- |
| Development | `a5dfe5c4661a34f3dfd1df0623feeb5cf4e3ebb1defb27ee29e23afc45671710` | PASS: 9.941 bank + 1.237 lesson, khóa duy nhất và liên kết nội bộ hợp lệ. |
| Production | `bac78abd61b4699a53630449ebd2e81d1e93a16233f2144e4d9d30815d1998b5` | PASS: 9.941 bank + 1.237 lesson + 20 notebook words, khóa duy nhất và liên kết nội bộ hợp lệ. |

Trình kiểm tra đã xác minh SHA-256 từng file JSON, số hàng, nạp toàn bộ hàng vào PostgreSQL cục bộ qua PGlite với khóa `(table, source_key)`, đọc lại và so nội dung từng hàng, rồi kiểm tra các tham chiếu notebook/deck trong snapshot. Không có dữ liệu nào được ghi ngược lên Supabase.

Đã tạo thêm **full PostgreSQL custom-format dump** riêng cho mỗi project bằng `pg_dump` cục bộ, sử dụng thông tin đăng nhập tạm thời do Supabase CLI cấp. Hai file đặt trong cùng thư mục private, bên ngoài repo. `pg_restore --list` đọc được toàn bộ archive:

| Full DB dump | Dung lượng | SHA-256 | TOC items |
| --- | ---: | --- | ---: |
| Development | 8.365.449 byte | `2f74a085a5ffc78a0ab24ccabb4d96da64f29b207a8d585a554b9b05e0aa4509` | 1.508 |
| Production | 8.575.352 byte | `ee7214a15ae36ad8de1a9fbe1715afd9185e3c1a3eda095bcb5dd7b546887dd0` | 1.523 |

Đã thử restore Development dump vào PostgreSQL 18 cục bộ cô lập ở `127.0.0.1:55432`. Restore dừng ở lệnh `CREATE EXTENSION pg_cron`: bản PostgreSQL cục bộ không cài extension Supabase này. Server thử nghiệm đã tắt và thư mục cluster tạm đã dọn. Vì vậy archive đã đọc được nhưng **chưa chứng minh full DB restore thành công**; cần môi trường kiểm thử tương thích Supabase hoặc bộ extension phù hợp. Một project Supabase mới cũng có schema do nền tảng quản lý; cần preflight và kế hoạch restore theo hướng dẫn của Supabase, không dùng `pg_restore --clean` tùy tiện lên project đó. File storage không nằm trong `pg_dump` và cần quy trình sao lưu riêng nếu có thay đổi storage ở các phase sau. ZIP logic đã được khôi phục và so từng hàng, nhưng không thay thế thử restore toàn DB.

## 4. Taxonomy, quyền nguồn và QA nội dung

**Quyết định của chủ dự án:** giữ song song hai danh mục. Kho nguồn tiếp tục có 36 nhãn hiện tại; danh mục học đã biên tập dự kiến có 25 topic CSV + 15 topic mới. Hai danh mục có tên và bộ lọc riêng, không tự đổi nhãn trên 9.941 bank rows và không cộng 36 + 40 thành số topic của một danh mục. Đã lập [crosswalk gợi ý cho cả 36 nhãn](topic-taxonomy-crosswalk.md); đây là hướng dẫn review, chưa phải topic link được áp dụng. `Environment & Climate` và `Science & Research` khớp tên; `Health & Well-being` gần `Health & Wellbeing`, nhưng từng bản ghi vẫn cần duyệt nghĩa.

RAR không có license/provenance cho từng hàng. **Chủ dự án đã xác nhận trong cuộc trao đổi ngày 28/10/2026 rằng có quyền đăng toàn bộ 25 CSV**. Ghi nguồn tối thiểu cho mỗi source record là archive do chủ dự án cung cấp, filename, row key, archive SHA-256 và trạng thái `owner_authorized`; chưa được gắn nhãn giấy phép mở hoặc nguồn bên thứ ba khi không có bằng chứng. Snapshot/diff và archive vẫn để private trong Phase 1.

Script `scripts/vocabulary-v2-source-qa.py` đã quét đủ 5.000 hàng/10.002 ví dụ và tạo `source-qa-signals.json` ở thư mục private. **1.645 hàng** có ít nhất một tín hiệu cần xem: 775 hàng có từ nguyên dạng `nine` trong ví dụ, 703 định nghĩa dưới 10 ký tự sau chuẩn hóa, 394 hàng không có nguyên cụm term trong cả hai/ba ví dụ. Không phát hiện ví dụ trùng nguyên văn trong cùng hàng hoặc giữa các hàng. Đây là heuristic, **không phải số hàng sai**: phrasal verb có thể bị tách trong câu, từ có thể biến hình, và định nghĩa ngắn có thể đúng. Ví dụ chứa `nine` tập trung ở một số topic và cần lấy mẫu biên tập để kiểm tra văn phong/tính tự nhiên trước khi xuất bản.

### Baseline truy vấn và quyền đọc

`scripts/vocabulary-v2-query-baseline.py` đã ghi `EXPLAIN (ANALYZE, BUFFERS)` của năm truy vấn SELECT hiện tại tại cả hai project vào file private. Các số dưới đây là **thời gian thực thi trên server ở một lần đo sau khi cache đã ấm**, không phải độ trễ trang web hoặc cam kết hiệu năng. Lần đo đầu tiên của truy vấn trang đầu chậm hơn rõ rệt (824 ms Development, 1.020 ms Production); lặp lại sau đó còn 7,8/7,6 ms, nên chưa dùng lần đầu để kết luận hiệu năng ổn định.

| Truy vấn | Development | Production | Plan chính |
| --- | ---: | ---: | --- |
| Trang đầu 20 mục, lặp lại | 7,8 ms | 7,6 ms | Seq Scan + top-N sort |
| Lọc `study_lane = B1` | 0,13 ms | 0,20 ms | Index Scan + incremental sort |
| Lọc `Environment & Climate` | 6,1 ms | 5,0 ms | Seq Scan + sort |
| Tìm `ILIKE '%climate%'` | 16,1 ms | 14,6 ms | Seq Scan + sort |
| `count(*) over()` + trang đầu | 14,7 ms | 12,4 ms | Seq Scan + WindowAgg + sort |

Mỗi project có 6 policy và 9 index trên hai bảng Vocabulary chính. Probe trong transaction read-only với role `authenticated` và UID giả thấy 4 bank row đã `published` khi đọc trực tiếp, 20 row qua RPC tham khảo vì RPC dùng `student_visible`; đây là hành vi phù hợp policy/SQL hiện có. Probe **không** xác nhận luồng đăng nhập thật, quyền admin, hay RLS của bảng V2 chưa tồn tại. Khi thiết kế V2 cần index theo trạng thái/level/topic và search phù hợp truy vấn mới, rồi đo lại trên dữ liệu thực; không đổi chính sách hiển thị cũ do suy đoán từ các plan này.

## 5. Việc còn lại trước Phase 2

- [x] Đếm DB thực tế và xác minh migrations trên Development/Production.
- [x] Đối soát thử đủ 5.000 hàng với cả bank và lesson; giữ 10.002 ví dụ ở source audit.
- [x] Xuất snapshot logic private và thử nạp lại cục bộ.
- [x] Có **full PostgreSQL dump** riêng cho Development/Production; `pg_restore --list` đọc được archive và SHA-256 được ghi lại.
- [ ] Kiểm thử **full restore** trên DB cô lập tương thích extension Supabase và đối chiếu số hàng/khóa sau restore. Restore cục bộ bị chặn ở `pg_cron`; project thử nghiệm riêng chưa được tạo. Script `scripts/vocabulary-v2-restore-preflight.py` đã sẵn để kiểm tra project trống bằng truy vấn read-only và chặn nhầm hai project IELTS hiện có. Không dùng Development để khôi phục PII production.
- [x] Chủ dự án xác nhận quyền đăng toàn bộ CSV; kế hoạch provenance `owner_authorized` như trên.
- [x] Chọn giữ song song danh mục 36 nhãn nguồn và 40 topic học đã biên tập; đã lập crosswalk gợi ý, chưa áp dụng record-level mapping.
- [x] Quét heuristic QA 5.000 source rows/10.002 ví dụ; lưu danh sách review private.
- [ ] Chạy đối soát sense, QA nội dung và review 213 trường hợp nhiều bank record; đã tìm 5 ứng viên biến thể nhưng exact/variant match chưa đủ để quyết định gộp.
- [x] Lấy baseline năm truy vấn hiện có, index/policy và probe learner với UID giả; `anon` không đọc được bank rows.
- [ ] Kiểm thử session learner/admin thực tế và policy/API V2 khi schema additive sẵn sàng; probe UID giả không thay thế bước này.

**Quyết định:** Phase 1 đã hoàn thành inventory, candidate dry-run, snapshot logic, full DB dump, taxonomy/crosswalk gợi ý, source QA và baseline query/RLS tổng hợp. Chưa triển khai migration/import/UI. Sau khi full restore được thử thành công trên môi trường tương thích, mới mở Phase 2 additive schema trên Development với cờ V2 mặc định tắt và kiểm tra tiến độ trước/sau bằng ID/hash. Review sense/content và quyền learner/admin thực tiếp tục theo batch trước khi publish.

**Cập nhật sau Phase 1:** Chủ dự án sau đó yêu cầu triển khai ngay theo hai bộ độc lập (A1–C2 và IELTS Band 1–7+), chấp nhận band gợi ý ước lượng và không chờ full restore. Migration additive `202610280003` cùng 5.000 từ IELTS đã được áp dụng vào cả hai project. Trạng thái triển khai hiện tại nằm trong `two-collections-release.md`; đoạn quyết định trên chỉ ghi lại kế hoạch tại thời điểm Phase 1.

## 6. Lệnh đã chạy để xác minh

```powershell
python scripts/vocabulary-v2-phase1-audit.py --archive 'C:\Users\RAZER\Downloads\vocabulary for ielts.rar' --out-dir 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private' --private-backup
node scripts/verify-vocabulary-v2-snapshot.mjs 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private\development-vocabulary-logical-snapshot.zip'
node scripts/verify-vocabulary-v2-snapshot.mjs 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private\production-vocabulary-logical-snapshot.zip'
python scripts/vocabulary-v2-pg-backup.py --environment development --out-dir 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private'
python scripts/vocabulary-v2-pg-backup.py --environment production --out-dir 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private'
python -m py_compile scripts/vocabulary-v2-phase1-audit.py
python -m py_compile scripts/vocabulary-v2-pg-backup.py
python scripts/vocabulary-v2-source-qa.py --archive 'C:\Users\RAZER\Downloads\vocabulary for ielts.rar' --out-dir 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private'
python scripts/vocabulary-v2-query-baseline.py --environment development --out-dir 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private'
python scripts/vocabulary-v2-query-baseline.py --environment production --out-dir 'C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private'
node --check scripts/verify-vocabulary-v2-snapshot.mjs
npm run test -- tests/vocabulary.test.ts tests/vocabulary-bank.test.ts tests/top3-migration.test.ts tests/database.test.ts
```

Các lệnh kiểm tra snapshot trả `PASS`. Nhóm test hồi quy trả **7 test files passed, 15 tests passed, 2 skipped** (các test skip sẵn theo fixture/điều kiện của repo). `supabase db dump` cần Docker nên đã dùng `pg_dump` cục bộ; full restore cục bộ dừng ở extension `pg_cron` như ghi trên. Hai lệnh backup ở trên là lệnh tạo file, không chạy lại khi file hiện có vì script chặn ghi đè. `npm` typecheck/lint/build chưa cần chạy vì không sửa mã ứng dụng Next.js.
