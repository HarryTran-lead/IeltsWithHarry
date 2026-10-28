# Vocabulary V2 — kiểm kê Phase 0 và đề xuất Phase 1

Ngày kiểm kê: 28/10/2026. Phạm vi: mã nguồn và migrations trong checkout hiện tại, hai archive do chủ dự án cung cấp. Đây là kiểm kê chỉ đọc; không có migration, import, seed hay triển khai nào được thực hiện.

## 1. Bằng chứng dữ liệu đầu vào

| Kiểm tra độc lập | Kết quả |
| --- | --- |
| SHA-256 của `vocabulary for ielts.rar` | `9add911cefcecf45cc6d1fbe4f947f0f38387ba0f3399ab07d2e55a1df738674` |
| SHA-256 của `ENGLISH_SKILL_LAB_VOCAB_V2_CODEX_PACKAGE.zip` | `3bc56c1c1e45fa314495f6178112760c8bed9eee3f175be61d4e758ee9dcbb98` |
| RAR nằm trong ZIP so với RAR tải riêng | Trùng SHA-256 |
| CSV / topic nguồn / hàng dữ liệu | 25 / 25 / 5.000; mỗi CSV có 200 hàng |
| Cột | `Term`, `Definition`, `Part of speech`, `Pattern`, `Examples`, `Topic` |
| Ô trống trong sáu cột bắt buộc | 0 |
| `Term` duy nhất sau NFKC, casefold và gộp khoảng trắng | 5.000; không có khóa trùng theo phép kiểm này |
| Số ví dụ sau khi tách đúng chuỗi ` | ` | 4.998 hàng có 2; 2 hàng có 3; tổng 10.002 ví dụ |
| Hàng có từ `nine` trong ví dụ | 775; đây là tín hiệu cần QA, chưa phải kết luận sai |

Hai hàng có ba ví dụ là `curriculum` (dòng dữ liệu 11) và `access to` (dòng dữ liệu 51) trong `forumflash-education-learning.csv`; số dòng CSV tính cả header lần lượt là 12 và 52. Parser của lần nhập sau phải giữ cả ba. Mã nguồn archive không kèm thông tin license hay provenance riêng cho từng hàng. Nội dung gói ZIP có `CODEX_MASTER_PROMPT.md` và baseline do bên cung cấp; các số trên đã được tính lại từ RAR gốc bằng CSV parser, không lấy baseline làm kết quả kiểm chứng.

Phân loại POS nguồn: 1.846 cụm danh từ, 1.233 danh từ, 611 động từ, 537 tính từ, 427 cụm động từ, 336 thành ngữ, 9 cụm tính từ, 1 cụm giới từ. Chưa có CEFR, stage, priority, IPA, collocation có cấu trúc hay trạng thái duyệt trong CSV. Không thể lấy 5.000 khóa khác nhau làm bằng chứng 5.000 nghĩa khác nhau hoặc 5.000 mục mới so với kho đang hoạt động.

## 2. Kiến trúc hiện hữu cần tái sử dụng

| Phần | Bằng chứng trong repo | Hệ quả cho V2 |
| --- | --- | --- |
| Ứng dụng | Next.js 16.4.3 App Router, React 19, TypeScript; `src/app/`, `package.json` | Giữ nguyên route và Vocabulary Hub hiện có. Đã đối chiếu hướng dẫn App Router/Route Handlers trong `node_modules/next/dist/docs/01-app/`. |
| DB và quyền | Supabase PostgreSQL, migrations trong `supabase/migrations/`; `src/lib/supabase/`, `src/lib/viewer-role.ts` | Dùng RLS, `is_admin()` và bảo vệ route `/admin` trên server; không để quyền biên tập phụ thuộc UI. |
| Từ trong bài học | `public.vocabulary_entries` ở `202610240001_foundation.sql`: UUID, `lesson_id`, `word`, nghĩa, một ví dụ; `src/features/admin/vocabulary-editor.tsx`, `src/app/app/lesson/[slug]/page.tsx` | Giữ ID và liên kết lesson; không xóa hay chuyển khóa chính. |
| Kho tham khảo | `public.vocabulary_bank_entries` ở `202610260001_vocabulary_bank.sql` và các migration tiếp theo: `source_id` text PK, `cefr` bắt buộc A1–C2, `study_lane`, `topics[]`, `published`, `student_visible`, nội dung nguồn/đã duyệt tách riêng | Đây là bản ghi theo nguồn, chưa phải bảng canonical headword/sense. Không thể nhập CSV chưa có CEFR trực tiếp mà không gán CEFR giả hoặc đổi constraint. |
| Danh mục topic hiện tại | `src/lib/vocabulary/source-topics.json` có 36 nhãn nguồn; `src/lib/vocabulary/catalog.json` có 16 từ biên soạn thuộc 6 nhãn khác | Không cộng cứng 25 + 15 thành tổng topic sản phẩm: cần quyết định ánh xạ 36 nhãn nguồn với taxonomy 40 topic đề xuất. |
| Học viên | `src/features/vocabulary/vocabulary-hub.tsx`, `vocabulary-study.tsx`, `vocabulary-decks.tsx`; `/app/vocabulary/*` | Giữ các tab học, kho nguồn, từ đã duyệt, thẻ, quiz, ôn tập; chỉ thêm bộ lọc/hiển thị V2 sau khi qua cờ phát hành. |
| Biên tập | `src/features/admin/vocabulary-bank.tsx`, `admin-editor.tsx`; `/admin` kiểm tra role ở `src/app/admin/[[...slug]]/page.tsx` | Import ZIP hiện tại chỉ hiểu gói 9.937 dòng theo schema khác; hiện thao tác trong trình duyệt upsert theo `source_id`, đặt `student_visible: true`. Không tái dùng nguyên luồng đó cho RAR chưa duyệt. |
| Tìm kiếm/API | RPC `list_vocabulary_reference_by_level`, `list_vocabulary_study_by_level` ở migrations `202610260007`–`011`; route `/api/vocabulary/lookup` là tra từ ngoài | Cần adapter/phiên bản truy vấn V2 có phân trang, quyền và trạng thái publish; giữ contract các RPC cũ. |
| Tiến độ và từ đã lưu | `notebook_entries` (`202610240002_notebook.sql`), `user_word_reviews` (`202610240010_news_read_completion.sql`), `vocabulary_review_events`, `vocabulary_practice_attempts`, `vocabulary_decks`, `vocabulary_deck_cards` (`202610250009_vocabulary_hub.sql`, `202610270011_top3_learning_labs.sql`) | Các khóa review/deck trỏ đến UUID của `notebook_entries`, không trỏ đến `vocabulary_bank_entries`. Giữ nguyên UUID và lịch FSRS. Nếu cần nối canonical sau này, dùng FK nullable và backfill riêng. |
| Demo và triển khai | `src/features/demo/`, `docs/ENVIRONMENTS.md`, `.github/workflows/quality.yml`, `scripts/sync-shared-content.mjs` | Demo dùng localStorage; dev Supabase tách production. Script sync hiện chỉ liệt kê hai bảng vocabulary cũ, nên phải xem lại trước khi đẩy nội dung V2 giữa môi trường. |

`docs/VOCABULARY_IMPORT.md` ghi đã nhập 9.937 bản ghi nguồn và có 4 bản ghi biên tập tại thời điểm tài liệu được viết. Đây là mô tả lịch sử, **không phải số đếm DB hiện tại**. Kết nối đọc DB bằng cấu hình local không có khóa service hợp lệ; vì vậy chưa xác minh được số hàng, schema đã áp dụng và tiến độ thật trên dev/production. Không ghi số trước/sau của DB bằng ước lượng từ tài liệu.

Không tìm thấy ngân hàng từ vựng Writing Task 1 Academic riêng trong `src/lib/vocabulary/` hoặc các màn Vocabulary; chỉ nên lập backlog riêng sau khi kiểm tra DB và nội dung CMS thật.

## 3. Đối soát mẫu chỉ đọc

Trong 16 từ của `catalog.json`, có 12 headword trùng chính xác với archive sau chuẩn hóa cơ bản. Đây là **ứng viên đối soát**, chưa phải quyết định gộp sense hoặc 12 bản ghi trùng DB. Một số ví dụ:

| Từ | Archive mới | Catalog đang có | Hướng xử lý ở dry-run thực |
| --- | --- | --- | --- |
| `curriculum` | Education & Learning; 3 ví dụ | Education | Kiểm tra sense và giữ đủ 3 ví dụ nguồn; không tạo headword thứ hai nếu cùng từ. |
| `acquire` | Economy & Consumerism | Education | So khớp nghĩa, cân nhắc nhiều topic/sense; không tự ghi đè topic cũ. |
| `reliable` | Transport & Mobility | Technology | Đưa vào review vì topic sử dụng khác nhau. |
| `access to` | Education & Learning; 3 ví dụ | Không thấy trong 16 từ local | Có thể là draft mới; phải so tiếp với DB 9.937 nguồn. |
| `deadline`, `drought` | Work & Employment; Environment & Climate | Business; Environment | Ứng viên liên kết, không tính tăng số canonical. |

Đây là *diff mẫu giữa file*, không phải `import_diff.csv` với DB: chưa có snapshot DB để kết luận `created`, `linked`, `new_sense`, `quarantine`. Archive gốc không chứa `restaurant`; không dùng ví dụ trong master prompt để cộng chỉ tiêu.

## 4. Quyết định kiến trúc đề xuất cho Phase 1–2

1. Giữ `vocabulary_entries`, `vocabulary_bank_entries`, tất cả ID ngoài và các bảng tiến độ. Xây lớp canonical **bên trong module Vocabulary hiện tại** để nối nhiều bản ghi nguồn/lesson với một headword, nhiều sense và nhiều topic. Không dùng `source_id` hoặc `(topic, term)` làm số đếm lexical entries.
2. Lập bảng staging/audit cho import batch, source record nguyên gốc, checksum, quyết định đối soát và review queue; bảng canonical entry/sense/topic link/example/collocation chỉ được tạo bằng migration additive sau khi chốt taxonomy. Có thể thêm FK nullable từ `vocabulary_bank_entries` và `vocabulary_entries` sang canonical entry; không sửa PK hiện tại. Giữ source POS tiếng Việt và raw examples.
3. Để `cefr_level = unassessed` ở sense nháp mới. Không gán CEFR/stage suy diễn để thỏa constraint hiện tại của `vocabulary_bank_entries`; RAR đi qua lớp staging/canonical trước. Chỉ đồng bộ bản đã duyệt sang bề mặt học viên theo chính sách phát hành được phê duyệt.
4. Cần bảng ánh xạ nhãn: 25 topic CSV là editorial source taxonomy, 15 topic mới là mục tiêu nội dung; 36 nhãn trong kho tham khảo là taxonomy khác. Giữ nhãn nguồn nguyên vẹn và xác định alias/mapping trước khi hiển thị con số “40 topic”. Không tự tạo topic trùng nghĩa.
5. Importer mới phải mặc định `--dry-run`, `--apply` tách riêng, kiểm checksum, đọc CSV chuẩn (UTF-8/BOM, quote/newline), tách số ví dụ biến thiên, ghi raw payload, đối soát exact trước, đưa semantic/variant mơ hồ vào review. `--apply` chỉ được phép trên dev/staging đã xác nhận project ref và backup, dùng transaction + advisory lock + idempotent keys; rerun cùng nguồn phải thêm 0 canonical entry/sense/link.
6. Giữ các RPC/UI cũ; V2 đọc qua adapter và cờ `vocab_v2_filters_enabled`, `vocab_new_topics_enabled`, `vocab_v2_admin_enabled` mặc định tắt trên production. Tính số lượng từ DB canonical và status, không cộng source rows, aliases, senses hay topic links. RLS cho draft/admin ở DB; public chỉ đọc bản được phép phát hành.

### Các file dự kiến sửa sau Phase 1, chưa sửa trong Phase 0

| Nhóm file | Mục đích |
| --- | --- |
| Migration mới trong `supabase/migrations/` | Bảng staging/audit, canonical, FK nullable, RLS/index; giữ toàn bộ bảng và ID cũ. |
| Import CLI mới trong `scripts/` và thư viện parser/reconciliation trong `src/lib/vocabulary/` | Dry-run mặc định, report JSON/CSV, transaction, retry/idempotency; không đưa archive vào `public/` hoặc deployment. |
| `src/features/admin/vocabulary-bank.tsx`, `src/features/vocabulary/vocabulary-hub.tsx`, `vocabulary-study.tsx` | Review queue và filter V2 sau khi data/API đạt nghiệm thu; giữ luồng cũ. |
| `scripts/sync-shared-content.mjs`, docs triển khai và các test vocabulary/RLS | Đồng bộ nội dung được phép giữa dev/production, xác minh quyền và progress; không sao chép user data sang dev. |

**Rollback ứng dụng:** tắt ba cờ V2 và quay về UI/RPC cũ; giữ schema additive cùng audit records để có thể đối chiếu. Với một batch nội dung chưa phát hành, chuyển batch về trạng thái ẩn thay vì xóa hàng. Restore DB chỉ từ snapshot đã kiểm thử và khi chủ sở hữu quyết định; không dùng `db reset --linked`.

## 5. Phase 1 — việc cần làm và điều kiện GO

- [ ] Xác nhận quyền sử dụng/ghi nguồn cho 25 CSV, phạm vi phát hành định nghĩa/ví dụ, attribution và license. Chưa có metadata này trong RAR.
- [ ] Lấy inventory DB **read-only** ở dev và production: migrations đã áp dụng, row counts theo bảng và status, distinct normalized headword, topic labels, sample source IDs, review/deck FK, chỉ số/index. Không xuất PII.
- [ ] Chốt taxonomy 40 topic so với 36 nhãn kho nguồn và 6 nhãn catalog; lập bảng mapping/alias, xác định nghĩa của “40 topic” trên giao diện.
- [ ] Tạo snapshot/backup DB và kiểm thử restore trên môi trường cô lập; snapshot mẫu progress bằng ID/hash và so sánh sau migration. Không copy hồ sơ hoặc tiến độ thật sang dev.
- [ ] Chạy dry-run đối soát cả 5.000 dòng với DB snapshot: số canonical mới, topic link, sense mới, source changed, duplicate/variant, quarantine; xuất diff theo từng hàng và kiểm 10.002 ví dụ.
- [ ] Đo baseline truy vấn kho hiện tại và kiểm tra RLS của learner/admin; ghi kế hoạch index, transaction, lock, idempotency, flags và rollback.

Chỉ sang Phase 2 khi có restore thành công, bản đồ ID/progress, quyền nguồn, mapping topic, dry-run diff và quyết định của chủ dự án về chính sách hiển thị. Mốc 7.500/7.650 là mục tiêu nội dung đã duyệt về sau, **không phải kết quả của Phase 0**.

## 6. Trạng thái thực hiện

- Đã kiểm tra source bằng `tar` + Python `csv.DictReader` trên RAR gốc, hash cả hai archive và so bản RAR nhúng trong ZIP.
- Đã đọc schema, importer, Vocabulary UI, auth, progress, sync và quy trình môi trường; không thay mã ứng dụng.
- Chưa có số đếm DB trước/sau, migration file mới, import diff toàn DB, backup/restore hoặc test UI vì Phase 0 chưa thực thi DB và thiếu kết nối đọc hợp lệ.
