# Bàn giao: AI Content Factory – mỗi ngày tạo đúng 1 đề IELTS tiêu chuẩn

> Dán toàn bộ file này cho AI tiếp theo. Đọc hết trước khi sửa code.

## 0. Bối cảnh và luật làm việc

- Repo: `C:\Users\RAZER\Documents\ChatGPT\Ielts-learning website` (GitHub `HarryTran-lead/IeltsWithHarry`). Stack: Next.js 16 (đọc `AGENTS.md` và `node_modules/next/dist/docs/` trước khi đụng API Next), React 19, Supabase, Vercel tự deploy khi push lên `main`.
- **Thư mục chính được nhiều AI dùng chung** (Codex đang làm ở nhánh `codex/release-readiness` ngay trong thư mục này). Không `git checkout`/`reset`/`stash` code của người khác. Chỉ `git add` đúng file của mình. Cách push an toàn đã dùng: nếu `HEAD` trùng `origin/main` thì `git push origin HEAD:main`; nếu không, tạo worktree tạm từ `origin/main`, cherry-pick commit của mình rồi push.
- Trước khi commit, phải xanh cả bốn: `npx vitest run`, `npx tsc --noEmit -p .`, `npx eslint <file đã sửa>`. Commit message kết thúc bằng dòng `Co-Authored-By` theo quy ước của repo.
- **Không chép nội dung** từ tài liệu tham chiếu của IELTS Advanced (VOL7/8/10, Forecast Speaking, Focus Writing). Chỉ được dùng **cấu trúc**, đã tóm tắt trong `docs/IELTS_FORMAT_RULES.md`.
- **Không tự publish**: mọi thứ AI tạo ra chỉ được vào hàng chờ duyệt (`awaiting_review` / `needs_review`). Admin duyệt rồi mới publish.
- **Không đụng** tác vụ hẹn giờ `pilot-listening-full-audio` (tạo audio Gemini cho đề ESL-OL) và thư mục `content/listening-tests/`. Đó là quy trình riêng.
- **Không chạy `npx supabase db push`** nếu chưa kiểm tra đủ danh sách migration đang chờ: repo có migration của phiên khác chưa áp dụng. Không dùng `npx supabase db query --linked` (chủ repo đã từ chối). Muốn đọc/ghi DB thì dùng script Node với service key (xem các script trong `scripts/`).

## 1. Hiện trạng (đã làm, **đã commit `f26be00` trên `main`**, 2026-10-28)

AI Factory đã được nâng cấp từ 4 dạng bài lẻ lên **10 loại bài**, có cổng chặn format. Các file đã sửa hoặc thêm:

| File | Nội dung |
|---|---|
| `src/lib/ai-factory/kinds.ts` (mới) | 10 kind: `listening_part1..4`, `reading_passage`, `writing_task1_academic`, `writing_task1_general`, `writing_task2`, `speaking_part1`, `speaking_part2`. Có các kiểu phối nhóm câu xoay vòng (`plans`), brief cho model (`briefFor`), JSON schema (`outputSchema`), `buildDraft` dựng bản nháp ngân hàng đề và liệt kê mọi lỗi (đếm câu, giới hạn từ, đáp án có trong bằng chứng, bằng chứng khớp **nguyên văn theo từng chữ**, thứ tự câu theo bản ghi, rồi `checkFormat` từ `src/lib/ielts-bank/format-rules.ts`). Còn có `kindForSlot` (5 slot/ngày) và `topicSeeds` |
| `src/lib/ai-factory/text-generation.ts` | `generateFactoryDraft(kind, topic, {day, avoid})`. Bài dài (Listening/Reading) dùng `gemini-3.8-flash` và thử tối đa 3 lần; bài ngắn dùng `gemini-3.5-flash-lite`, thử tối đa 2 lần. Lý do bị chặn được gửi lại cho model. Đổi model qua biến `AI_FACTORY_LONG_MODEL` / `AI_FACTORY_TEXT_MODEL`. `generateTextPractice(skill, topic)` giữ lại cho tương thích |
| `src/lib/ai-factory/draft-validation.ts` | Còn lại các kiểm tra chung: `validateExam`, chế độ practice, cờ AI |
| `src/lib/ai-factory/produce.ts` | `createTextPracticeJob(client, kind, topic, actor, {day, avoid})`; ghi `payload.factoryKind` |
| `scripts/run-ai-factory-text.ts` | Lịch 5 slot; chống trùng theo `payload.factoryKind`; truyền 30 tiêu đề gần nhất cho model tránh lặp |
| `src/app/api/admin/ai-content-factory/route.ts` | Action `generate` nhận thêm `kind` (tùy chọn) |
| `.github/workflows/ai-factory-text.yml` | 5 cron (08:27/08:37/08:47/08:57/09:07 UTC), input `kind`, biến model, timeout 15 phút |
| `.github/workflows/ai-factory-audio.yml` | Worker xử lý tối đa 3 job mỗi lần chạy |
| `services/audio-worker/worker.py` | Chấp nhận 1–3 người nói (Part 2/4 là độc thoại) |
| `scripts/repair-ai-factory-reading.ts` | Tự kiểm tra bằng chứng (vì `validateFactoryDraft` giờ chỉ nhận 1 tham số) |
| Test: `kinds.test.ts` (mới), `text-generation.test.ts`, `draft-validation.test.ts` | 12 test qua; toàn repo 318 test qua; tsc và eslint sạch |
| `scripts/.factory-dry.mts`, `scripts/.factory-show.mts` (**không nằm trong git**, chỉ có trên máy của chủ repo) | Script chạy thử với model thật, **không ghi DB**: đặt `AI_FACTORY_GEMINI_API_KEY = GEMINI_API_KEY` cùng hai cờ free-tier, rồi gọi `generateFactoryDraft(kind, topicSeeds[kind][day % 8], { day })` cho từng kind và in số từ, số câu, lỗi cổng chặn. Chạy: `npx tsx --env-file=.env.local scripts/.factory-dry.mts "<kind,kind>" <day>`. Nếu không có file thì viết lại theo mô tả này, và đừng commit |

**Chạy thử với model thật (2026-10-28):** cả 10 kind đều qua cổng chặn.
- Listening P1: 827 từ, P2: 669, P3: 1.027, P4: 762.
- Reading: 901 từ với kiểu TFNG/notes/MCQ; 737 từ với kiểu headings/sentence/YNNG.
- Writing và Speaking qua ngay lần đầu.
- Thời gian: bài dài 40–300 giây mỗi bài (có thử lại).

**Việc đầu tiên nên làm:** `git log -1 f26be00` và đọc `src/lib/ai-factory/kinds.ts`, rồi mới làm phần mục 2.

## 2. Mục tiêu: mỗi ngày đúng 1 đề tiêu chuẩn

Mỗi ngày tạo **một bộ** gồm:

1. **Listening full test**: 4 part (P1–P4, câu 1–40), ghép thành **một bản nháp** `practice_type = full_test` (4 section `part-1..part-4`).
2. **Reading full test**: 3 passage ghép thành **một bản nháp** (3 section), đánh số 1–13 / 14–26 / 27–40.
3. **Writing**: 1 Task 1 Academic + 1 Task 2 (ngân hàng đề lưu mỗi task là một exam riêng, giữ nguyên như vậy).
4. **Speaking**: 1 Part 1 + 1 Part 2–3 (lưu riêng như hiện tại).

Tối đa **1 bộ mỗi ngày**. Nếu hết quota giữa chừng thì phần đã tạo được giữ lại, lần chạy sau **làm tiếp bộ dở** chứ không mở bộ mới.

### Quota (project AI Studio "IELTS Content Factory", Free tier, reset lúc nửa đêm Pacific ≈ 14–15h VN)
- `gemini-3.8-flash`: 5 request/phút, **20 request/ngày**, dùng cho 7 bài dài (4 part + 3 passage). Mỗi bài trung bình khoảng 2 request, tối đa 3, nên một bộ cần khoảng 14 (tối đa 21) request. Giữa hai lần gọi phải nghỉ ≥ 13 giây để không vượt 5 request/phút.
- `gemini-3.5-flash-lite`: 15 request/phút, 500 request/ngày, dùng cho Writing và Speaking.
- Khi model trả 429, hoặc lỗi có chữ "per day", thì dừng gọn và lưu tiến độ.

### 2a. Reading theo vị trí passage (thêm vào `kinds.ts`)
Thay kind `reading_passage` dùng chung bằng 3 vị trí (ví dụ `reading_passage1/2/3`, hoặc giữ một kind và truyền `position`). Số câu bắt đầu ở 1 / 14 / 27, và:
- **Passage 1 (13 câu, khoảng 750–900 từ, dễ nhất):** TFNG 5–7 cộng notes/table/sentence completion 6–8 (ONE WORD ONLY). Ví dụ các kiểu phối: `[tfng 7, note 6]`, `[table 6, tfng 7]`, `[note 8, tfng 5]`.
- **Passage 2 (13 câu, khoảng 800–950 từ):** which paragraph / headings / matching features / Choose TWO / summary. Ví dụ: `[headings 6 (box 8), multiple_answers 2, multiple_answers 2, summary 3]`, `[matching_information 5, matching_features 4 (box 5), sentence 4]`.
- **Passage 3 (14 câu, khoảng 850–1.000 từ, khó nhất, có quan điểm tác giả):** MCQ A–D cộng YNNG cộng sentence endings/summary. Ví dụ: `[multiple_choice 5, yes_no_not_given 5, matching_sentence_endings 4 (box 6)]`, `[yes_no_not_given 4, multiple_choice 5, summary 5]`.

`buildQuestions` đã có tham số `start`. Khi ghép thành full test, chạy `checkFormat("Reading", content, "full")`; mọi lỗi phải bằng 0 (rule R1: 13/13/14 câu, R2: độ dài, R3: MCQ 4 phương án…).

### 2b. Ghép Listening full
4 part tạo riêng (dùng các kind có sẵn), sau đó ghép `sections = [part-1..part-4]`. Số câu đã đúng 1–40 vì `start = (part-1)*10+1`. Chạy `checkFormat("Listening", content, "full")`; chỉ bỏ qua lỗi `L2` (chưa có audio, vì audio tạo sau). Tổng transcript nên ≥ 2.800 từ (rule L12).

### 2c. Điều phối hằng ngày (viết lại `scripts/run-ai-factory-text.ts`, hoặc thêm script mới)
- Workflow `ai-factory-text.yml` chỉ cần **1 cron/ngày** (ví dụ `27 8 * * *`), timeout khoảng 60 phút. Trong một lần chạy, tạo tuần tự các phần còn thiếu của bộ hiện tại.
- **Lưu tiến độ không cần migration:** một dòng giữ chỗ trong `ai_factory_jobs` (kind hợp lệ là `'listening_audio','reading','writing','speaking'`; status chỉ nhận `queued, running, qa_failed, awaiting_review, approved, rejected, failed, cancelled`). Ví dụ `kind='reading', status='failed', error='daily set in progress'`, payload `{ dailySet: true, setId: "set-YYYY-MM-DD", pieces: { listening_part1: <draft>, … } }`. Bộ hoàn tất thì chuyển dòng giữ chỗ sang `cancelled` và ghi `payload.completedAt`. Nếu muốn làm bảng riêng `ai_factory_sets` thì phải viết migration và **hỏi chủ repo** trước khi áp dụng.
- Khi đủ 4 part thì ghép Listening và tạo **1 job** `listening_audio` (`queued`) cho cả đề. Khi đủ 3 passage thì ghép Reading, nhập vào `ielts_upsert_import` với source `ai-factory`, tạo job `reading` ở `awaiting_review` và một dòng `ai_factory_qa`. Writing và Speaking dùng `createTextPracticeJob` như cũ (để ý `daily_job_limit` trong `ai_factory_settings`, hiện là 5: hoặc tính lại cho cả bộ, hoặc tăng lên khoảng 8 qua action `settings` của route admin).
- Chống trùng: ngày nào đã có bộ hoàn tất thì không tạo thêm.

### 2d. Audio worker: một job, nhiều section
`services/audio-worker/worker.py` hiện dựng **một** MP3 từ `payload.turns` và yêu cầu đúng 10 bằng chứng (`alignment_passed = len(alignment) == 10`).
- Hỗ trợ `payload.sections = [{ sectionId, turns, evidence, answerPhrases }]`: dựng mỗi section thành `"{job_id}/{sectionId}.mp3"`, kiểm tra kỹ thuật và alignment (10 câu) cho từng section, ghi `artifact_path` (ví dụ JSON list hoặc prefix thư mục) và một dòng `ai_factory_qa` gộp. Vẫn giữ tương thích với payload cũ một section.
- Có thể thêm lời dẫn và khoảng lặng giống đề thật (tham khảo `scripts/listening-tests.mts`, hàm `partPlan`), nhưng giọng Kokoro chỉ có `af_heart, am_michael, bf_emma, bm_george`.
- Workflow audio: tăng timeout (4 part có thể mất 20–40 phút trên CPU của GitHub).

### 2e. Duyệt audio trong route admin
`src/app/api/admin/ai-content-factory/route.ts`, nhánh `review`, hiện gắn audio vào **một** section (`job.payload.sectionId`) và yêu cầu `exam.current_version_id === job.exam_version_id`. Cần:
- Với job nhiều section: sao chép từng MP3 sang bucket `ielts-audio` (`ai-factory/{job.id}/{sectionId}.mp3`), gắn `audioUrl` cho đủ 4 section trong **một** lần `saveRevision`.
- Giữ nguyên các yêu cầu admin xác nhận đã nghe (`listened`) và đã kiểm đáp án (`answersChecked`).

### 2f. Test và kiểm tra
- Unit test bằng phản hồi model giả lập: ghép Reading 3 passage → `checkFormat(full)` không còn lỗi; ghép Listening 4 part → chỉ còn L2; logic làm tiếp bộ dở (hết quota ở passage 2 thì lần sau làm tiếp từ đó); không tạo bộ thứ hai trong cùng ngày.
- Test Python cho worker nhiều section (chạy được trong CI có `imageio_ffmpeg`; máy local thiếu gói này).
- Chạy thử thật **không ghi DB** bằng `.factory-dry.mts` cho 3 vị trí passage.
- Sau khi merge: chạy tay workflow `AI Factory text drafts` (workflow_dispatch) một lần và kiểm tra trong admin.

## 3. Tiêu chí hoàn thành
- [x] Phần mục 1 đã commit riêng (`f26be00`); test, tsc, eslint đều xanh.
- [ ] Một lần chạy hằng ngày tạo ra: 1 Listening full (40 câu, `checkFormat full` chỉ còn L2 cho tới khi duyệt audio), 1 Reading full (40 câu, 13/13/14, `checkFormat full` 0 lỗi), 1 Writing Task 1, 1 Writing Task 2, 1 Speaking Part 1, 1 Speaking Part 2–3. Tất cả ở trạng thái chờ duyệt, không tự publish.
- [ ] Hết quota giữa chừng thì lần chạy sau làm tiếp đúng phần còn thiếu; mỗi ngày tối đa 1 bộ.
- [ ] Audio cả 4 part tạo trong một job; admin duyệt một lần là gắn đủ 4 section.
- [ ] Tổng request `gemini-3.8-flash` mỗi bộ ≤ 20 (có log số request đã dùng).
- [ ] Đã push lên `main` mà không kéo theo file của phiên khác.

## 4. Lưu ý khác
- AI Studio báo "Prepay credits depleted" cho billing account của project **Kidzgo** (key `GEMINI_API_KEY` trong `.env.local`, dùng cho TTS Gemini và cho script chạy thử). Nếu chạy thử bị lỗi 4xx thì kiểm tra billing trước. Project "IELTS Content Factory" là Free tier, key nằm trong GitHub Secrets (`AI_FACTORY_GEMINI_API_KEY`), không có trên máy.
- Bộ quy tắc format: `docs/IELTS_FORMAT_RULES.md` và `src/lib/ielts-bank/format-rules.ts`. Kiểm tra toàn ngân hàng đề: `scripts/audit-format.mts`.
