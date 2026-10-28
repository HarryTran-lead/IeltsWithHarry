# Vocabulary V2 — Phase 5 release and Phase 6 integration

The owner authorized approval and publication of all 75 current editorial proposals. The three batches contain 150 English examples across `Everyday Routines & Habits` (50) and `Friends & Social Relationships` (25). The original 5,000 IELTS CSV entries and the CEFR bank remain separate. The IELTS collection totals 5,075 entries after release.

The 40-topic curriculum contains 25 source-named topics and 15 editorial expansion topics. The two populated expansion topics are available to learners; the other 13 remain visibly planned in the selector. The separate 36-label CEFR source taxonomy is unchanged. The goal of 2,650 new unique editorial entries remains a target: **75 published, 2,575 outstanding**.

Review is recorded as `owner_authorized_codex`, with no human editor ID. All 13 original heuristic QA leads are preserved in `ielts_vocabulary_review_events` with a disposition; the signals concern pronoun substitution, inflection, a short but clear definition, and a short but complete example. A heuristic signal is not a confirmed content error. The new entries use `owner_authorized_review`, distinct from `editor_reviewed` on human reviewed content. Suggested IELTS bands come from `wordfreq-en-3.1.1-thresholds-v1` and are labeled as estimates. Proposed CEFR levels are learning metadata, separate from the IELTS band estimates.

Migration `202610280005` creates the private draft staging tables and topic catalog. Migration `202610280006` adds provenance and review events, then provides an atomic service-role-only approval and publication RPC. `scripts/release-phase5-vocabulary.py` stages the same source batches on each target, verifies proposal hashes, and publishes 25 rows per transaction. The script is dry run by default. Learners can read only published IELTS entries; the draft and review audit tables have no learner access. Admins have a read-only aggregate progress panel at `/admin/vocabulary/ielts-progress` backed by `/api/admin/vocabulary-phase5`.

Run `python scripts/verify-vocabulary-phase5-staging.py` against Development after deployment. Check Production with `python scripts/release-phase5-vocabulary.py --expected-ref vpkhriywprepuhrbarye` after release. Each run should report 5,075 IELTS entries, 75 approved drafts and 75 review events.

## Pre-release staging record (historical)

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

Batch `friends-001` bổ sung 25 bản nháp và 50 ví dụ cho **Friends & Social Relationships**. Trong 55 đề xuất ban đầu, `keep in touch` đã có ở cả kho IELTS và từ bài học nên bị loại. Batch đã đối chiếu với cả 50 bản nháp của topic đầu, không có trùng chữ hoặc biến thể gần. Bảy cờ `term_not_literal_in_examples` cần người biên tập xác minh dạng chia và cách diễn đạt.

`scripts/verify-vocabulary-phase5-staging.py` xác nhận 40 topic, quota 2.650, **75 bản nháp trong 3 batch**, **150 ví dụ**, quyền đọc ẩn, và ba kho cũ giữ nguyên 9.941/1.237/5.000 dòng. Không mục mới nào được duyệt hay xuất bản; Phase 5 **chưa qua cổng GO**: còn cần biên tập và duyệt nội dung theo các batch 25–50 cho tới khi có đủ 2.650 mục mới thực sự đạt chất lượng.
