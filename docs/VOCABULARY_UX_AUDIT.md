# Vocabulary — Audit trải nghiệm học & đề xuất thiết kế

Ngày soát: 03/11/2026 · Bản soát: `main` @ `ce4d11d` · Dữ liệu: Supabase production, tài khoản học viên thật
Phạm vi: mọi màn hình dưới `/app/vocabulary/*` và `/app/reading/vocabulary`, desktop 1440px và mobile 375px.

---

## 1. Tóm tắt

Kho nội dung đã rất lớn: 6.046 từ IELTS, 9.937 từ A1–C2, 988 collocations, 300 họ từ, 1.200 từ Listening, 607 từ Reading, có FSRS. **Vấn đề không nằm ở nội dung mà ở vòng học.** Người học vào học nhưng không có một con đường rõ ràng để *nhớ lâu*.

Năm vấn đề ảnh hưởng hiệu quả học nhiều nhất:

| # | Vấn đề | Hệ quả với người học |
|---|---|---|
| P0-1 | "Học 10 từ IELTS" **luôn mở lại Buổi 1**, 10 từ đầu theo **bảng chữ cái** (`3D printing`, `a baby boomer`, `a baptism of fire`…) | Học xong quay lại vẫn gặp đúng 10 từ cũ. Từ đầu tiên là thành ngữ hiếm, không phải từ cốt lõi |
| P0-2 | Từ học trong Thẻ lật / Trắc nghiệm / Gõ từ / Ghép cặp **không vào lịch ôn FSRS** | Học hôm nay, 1 tuần sau quên. FSRS chỉ áp dụng cho "Từ đã lưu" |
| P0-3 | Thẻ lật **không có tự đánh giá** (Biết / Chưa biết); "Từ tiếp theo →" bấm được ngay mà không cần lật | Không có retrieval practice; hệ thống không biết từ nào người học còn yếu |
| P0-4 | Ôn tập dồn **67 thẻ một lúc**: mọi từ đã lưu chưa ôn đều "đến hạn", không giới hạn thẻ mới/ngày | Lần đầu mở là thấy 67 thẻ, nản và bỏ |
| P0-5 | **17 lối vào chồng chéo** (Landing, Overview, Learn, Library, Study, Notebook, Decks, Review, Practice, Explore, Progress, Collocations, Word Formation, Translation, Listening, Reading Vocab, Notebook chung) | Người học không biết "hôm nay nên làm gì" |

**Mục tiêu thiết kế:** một vòng học duy nhất theo khoa học ghi nhớ.

> **Mỗi ngày mở app → 1 nút "Học hôm nay" → ôn từ đến hạn trước, rồi học N từ mới theo vòng Learn (nhận diện → nhớ lại → viết ra) → mọi từ đã gặp tự vào FSRS → thấy tiến độ "đã thuộc" tăng.**

Về **giao diện** (§9, số liệu đo trực tiếp): có 5 kiểu đầu trang khác nhau, 450 mã màu với hơn 20 sắc teal gần trùng nhau, 15 giá trị bo góc, và tới 874 đoạn chữ dưới 12px trên một màn. Trên mobile, Word Formation tràn ngang 365px, và màn Learn cũ dài 80.658px vì in cả 810 từ trên một trang.

Module **IELTS Reading Vocabulary** (`/app/reading/vocabulary`) đã có gần đủ các mảnh: học theo câu, thẻ hai chiều, tự nhớ từ, ôn đúng hạn, sổ lỗi, lộ trình 84 ngày. Nên lấy nó làm **engine chung** thay vì xây lại.

---

## 2. Bản đồ màn hình hiện tại

| Route | Thành phần | Trạng thái | Ghi chú |
|---|---|---|---|
| `/app/vocabulary` | `VocabularyLanding` | Lối vào chính | 8 bộ từ, 4 khối gợi ý bên phải. Không có "việc hôm nay" |
| `/app/vocabulary/study?collection=…&mode=…` | `VocabularyStudy` | Màn học chính | 4 chế độ tách rời, batch 10 từ, không resume |
| `/app/vocabulary/library` | `Library` | Tra cứu | Thẻ to, nhãn "chưa duyệt nghĩa" |
| `/app/vocabulary/review` | `Review` | FSRS cho từ đã lưu | Again/Hard/Good/Easy |
| `/app/vocabulary/notebook` | `SavedWords` | Danh sách | Trùng với Sổ tay chung |
| `/app/vocabulary/decks` | `VocabularyDecks` | Rỗng | Không thêm được từ từ màn học |
| `/app/vocabulary/practice` | `Practice` | Mini quiz 5 câu | Chỉ trắc nghiệm, chỉ từ đã lưu |
| `/app/vocabulary/explore` | `Explore` | Tra từ | Tốt, nhưng tách biệt |
| `/app/vocabulary/progress` | `Progress` | Thống kê | 3 định nghĩa "đã thuộc" khác nhau |
| `/app/vocabulary/learn` | `Learn` (cũ) | **Di sản** | Chip chủ đề trùng lặp ("Education", "Education & Employment · …", "Education and Employment · …") |
| `/app/vocabulary/overview` | `Overview` (cũ) | **Di sản** | 9 ô tính năng, trùng Landing |
| `/app/vocabulary/collocations` | `CollocationsPage` | Tốt | Có hàng ôn đến hạn, có buổi học |
| `/app/vocabulary/word-formation` | `WordFormationPage` | Tốt | 7 dạng luyện, danh sách 300 họ từ |
| `/app/vocabulary/translation` | `ViEnTranslationPage` | Tốt | Viết câu + tự đánh giá |
| `/app/vocabulary/listening` | `ListeningVocabularyPage` | Tốt | 35 chủ đề, "Học đề xuất" |
| `/app/reading/vocabulary` | Reading Vocab | **Tốt nhất** | 9 chế độ, SRS, lộ trình 84 ngày |

**Nhận xét:** các module "lab" mới (Collocations, Word Formation, Listening, Reading) đã có SRS và buổi học đề xuất. Riêng **luồng chính IELTS/A1–C2** (bộ lớn nhất, 16.000 từ) lại là luồng yếu nhất về hành vi học.

---

## 3. Hành vi học: vòng hiện tại và vòng nên có

### 3.1 Vòng hiện tại của luồng chính

```
Landing → "Học 10 từ IELTS" → Buổi 1 (luôn từ đầu, A→Z)
   → Thẻ lật: đọc từ → (tuỳ) lật → "Từ tiếp theo" (không đánh giá)
   → Hết 10 từ → "Học 10 từ tiếp theo" (chỉ trong phiên này)
   → Đóng tab → lần sau lại Buổi 1
Từ đã học: chỉ được đếm vào "từ đã xem/luyện" (vocabulary_studied_words), không có lịch ôn
```

Dẫn chứng trong code:
- Thứ tự A→Z và luôn bắt đầu trang 0: `vocabulary-study.tsx:41` (`batchPage` khởi tạo 0) và `:77` (`.order("term")`).
- Chỉ đánh dấu "đã xem", không lên lịch: `use-studied-words.ts` (`markStudied` chỉ insert `vocabulary_studied_words`).
- Thẻ lật qua từ mà không cần lật hay đánh giá: `vocabulary-study.tsx:182`.
- Trắc nghiệm cần 2 lần bấm (chọn → "Kiểm tra"): `vocabulary-study.tsx:184-188`.
- Gõ từ so khớp tuyệt đối, sai một chữ là sai: `vocabulary-study.tsx:123`.
- Từ sai chỉ được liệt kê ở cuối ("Gợi ý ôn lại"), không quay lại trong phiên: `vocabulary-study.tsx:173`.
- Ôn tập coi mọi từ đã lưu chưa ôn là "đến hạn", không giới hạn: `vocabulary-hub.tsx:125`.
- "Đã thuộc" = lần chấm gần nhất là Easy *hoặc* ≥3 lượt: `vocabulary-hub.tsx:126-129`. Landing lại hiện "từ đã xem hoặc luyện". Ba con số không khớp nhau.

### 3.2 Vòng nên có (theo khoa học ghi nhớ)

Năm nguyên tắc đã được nghiên cứu kỹ, áp dụng trực tiếp vào thiết kế:

1. **Retrieval practice:** tự nhớ lại hiệu quả hơn đọc lại. → Thẻ phải ẩn nghĩa và người học phải tự đánh giá hoặc trả lời.
2. **Spaced repetition:** ôn ngay trước lúc sắp quên. → Mọi từ đã gặp đều vào FSRS (đã có sẵn `ts-fsrs`).
3. **Từ nhận diện → nhớ lại → viết ra (desirable difficulty):** trắc nghiệm dễ, gõ từ khó. → Một từ đi qua các bậc này trong cùng một phiên.
4. **Feedback ngay và sửa lỗi trong phiên:** từ sai quay lại sau 2–3 thẻ, cho tới khi đúng.
5. **Ngữ cảnh + âm thanh (dual coding):** câu ví dụ, phát âm, hình. → Câu ví dụ phải luôn hiện; phát âm tự động khi lật (có công tắc tắt).

```
"Học hôm nay"
  ├─ 1. Ôn đến hạn (FSRS)            ← luôn làm trước, giới hạn ~50 thẻ/ngày
  ├─ 2. Học từ mới (mặc định 10/ngày) ← tiếp từ chỗ dừng, theo band thấp → cao
  │     Vòng Learn cho mỗi nhóm 5–7 từ:
  │       a) Giới thiệu: thẻ có nghĩa Việt + ví dụ + audio
  │       b) Nhận diện: trắc nghiệm (bấm là chấm ngay)
  │       c) Nhớ lại: gõ từ từ nghĩa (chấp nhận lỗi gõ nhỏ)
  │       Sai → quay lại sau 2–3 thẻ. Đúng 2 lần → "Đã nắm trong phiên"
  └─ 3. Kết thúc: tóm tắt, từ yếu, lịch ôn tiếp theo ("ngày mai: 18 từ")
Mọi từ ở bước 2 → user_word_reviews (FSRS) với trạng thái khởi đầu theo kết quả phiên
```

---

## 4. So sánh với các ứng dụng hàng đầu

| Mẫu thiết kế | Quizlet | Anki | Memrise | Duolingo | IeltsWithHarry hiện tại | Đề xuất |
|---|---|---|---|---|---|---|
| Thẻ lật có tự phân loại | Có: "Still learning / Know", vòng sau chỉ còn thẻ chưa biết | Có (4 mức) | — | — | **Không** (Study) · Có (Review) | Thêm 2 nút **Chưa nhớ / Đã nhớ** + phím ←/→ |
| Chế độ học thích ứng | **Learn**: nhiều vòng, trắc nghiệm → viết, từ sai quay lại | — | Có, nhiều lần gặp mỗi từ | Có | **Không**: 4 chế độ rời rạc | Gộp thành **một phiên Learn** |
| Lặp lại ngắt quãng | Có (bản trả phí) | Cốt lõi (FSRS) | Có | Có | Chỉ cho từ đã lưu | **Mọi từ đã gặp** |
| Xem trước khoảng ôn trên nút | — | **Có** ("10m · 1d · 4d") | — | — | Không | Hiện khoảng ôn dưới mỗi nút |
| Giới hạn thẻ mới/ngày | — | Có | Có (mục tiêu ngày) | Có (XP) | Không | 10 từ mới + tối đa 50 thẻ ôn/ngày, chỉnh được |
| Tiếp tục từ chỗ dừng | Có | Có | Có | Có | **Không** | Lưu vị trí theo bộ + chủ đề + band |
| Phím tắt | Space lật, ←/→, 1–4 | Space, 1–4 | Enter | Enter | Không (Study) | Space, 1–4, Enter, ←/→ |
| Chấp nhận lỗi gõ nhỏ | Có ("Tôi đã đúng" để ghi đè) | — | Có | Có | Không | Khoảng cách Levenshtein ≤1 → "Gần đúng" + nút ghi đè |
| Mục tiêu ngày + chuỗi ngày | Có | — | Có | **Cốt lõi** | Có streak toàn app | Vòng tròn "10/10 từ hôm nay" ở Landing |
| Gắn sao / bộ thẻ riêng | Có | Có | — | — | Decks rỗng, không thêm được | Nút ☆ trên mọi thẻ → bộ "Đã gắn sao" |
| Ghép cặp tính giờ | Có (Match) | — | — | — | Có (không tính giờ) | Thêm đồng hồ + kỷ lục cá nhân |

---

## 5. Audit từng màn hình

Mức ưu tiên: **P0** = chặn việc học hiệu quả · **P1** = giảm hiệu quả rõ rệt · **P2** = trau chuốt.

### 5.1 Landing `/app/vocabulary`
- **P0** Không có khối "Hôm nay" (đến hạn ôn + từ mới còn lại + mục tiêu). Nút chính "Học 10 từ IELTS" luôn mở Buổi 1.
  → Thay hero bằng **thẻ Hôm nay**: `18 từ cần ôn · 10 từ mới · ~12 phút` + 1 nút **Bắt đầu**. Có vòng tiến độ ngày.
- **P1** "Việc học của bạn: 30 từ đã xem" kèm câu giải thích "chưa phải số từ đã thuộc". Con số không có ý nghĩa với người học.
  → Dùng 4 trạng thái chuẩn: **Mới · Đang học · Đang ôn · Đã thuộc** (theo FSRS: stability > 21 ngày = đã thuộc). Cùng định nghĩa ở mọi màn.
- **P1** 8 bộ từ hiện ngang hàng, người mới không biết chọn gì.
  → Thêm "Bộ gợi ý cho bạn" dựa vào band mục tiêu (lấy từ hồ sơ); các bộ còn lại ở "Thư viện".
- **P2** Thẻ bộ từ chưa có tiến độ riêng (vd. `120/6.046 đã học`). → Thêm thanh tiến độ mảnh.

### 5.2 Màn học `/app/vocabulary/study`
- **P0** Không resume, thứ tự A→Z (đã nêu). → Lấy từ chưa học theo `band_level` tăng dần rồi đến tần suất; lưu `last_batch` theo bộ/chủ đề/band.
- **P0** Thẻ lật không chấm. → Hai nút lớn **Chưa nhớ (←)** / **Đã nhớ (→)**. "Từ tiếp theo" chỉ hiện sau khi chấm. Thẻ "Chưa nhớ" quay lại cuối phiên (giống vòng thứ 2 của Quizlet).
- **P0** 4 chế độ tách rời. → Mặc định là **Learn** (gộp, xem §3.2). Bốn chế độ cũ giữ làm "Luyện riêng" trong menu phụ.
- **P1** Trắc nghiệm phải bấm 2 lần. → Bấm đáp án là chấm ngay; phím 1–4; đúng thì tự sang câu sau 0,8s; sai thì hiện đáp án đúng và chờ Enter.
- **P1** Gõ từ so khớp tuyệt đối. → Bỏ dấu câu và khoảng trắng thừa; lệch 1 ký tự → "Gần đúng" (tính đúng, gạch chân chữ sai) + nút "Tôi đã đúng".
- **P1** Bộ IELTS không có IPA (`source_ipa: ""` tại `vocabulary-study.tsx:92`), phát âm dùng giọng trình duyệt. → Tận dụng audio engine đã có (Gemini TTS / Kokoro) để tạo sẵn audio cho từ + câu ví dụ; tự phát khi lật thẻ.
- **P1** Nút "Chép từ và viết câu với …" nằm **trên** thẻ, kéo sự chú ý trước khi học. → Chuyển xuống màn kết thúc phiên ("Viết câu với 3 từ bạn vừa học").
- **P2** Ghép cặp chưa tính giờ. → Thêm đồng hồ + kỷ lục cá nhân.
- **P2** Thẻ trống phía dưới trên desktop (thẻ ~300px trong màn 900px). → Thẻ cao tối thiểu 55vh, chữ từ 56–64px, nút chấm cố định ở đáy vùng học.

### 5.3 Ôn tập `/app/vocabulary/review`
- **P0** 67 thẻ một lúc, không giới hạn. → Tối đa 20 thẻ mới/ngày; thẻ đến hạn trước, thẻ mới sau; hiện "Còn 12 thẻ · ~4 phút".
- **P1** Nút Again/Hard/Good/Easy tiếng Anh, nhỏ, không hiện khoảng ôn. → Nhãn Việt **Quên · Khó · Nhớ · Dễ**, kèm khoảng ôn (`ts-fsrs` tính sẵn `scheduler.repeat()`), phím 1–4, nút cao 52px.
- **P1** Mặt sau chỉ có nghĩa ("Lan tràn"), không ví dụ, không audio, hình minh hoạ chung chung (quyển sách).
  → Mặt sau đủ 4 lớp: nghĩa Việt · định nghĩa Anh ngắn · câu ví dụ (từ được tô đậm) · nút nghe. Bỏ hình nếu không gắn với từ.
- **P2** Không có thanh tiến độ phiên. → Thanh mảnh ở đầu thẻ.
- **P2** Chưa có chiều ngược (nghĩa → từ). → Từ khi thẻ đạt "Đang ôn", xen kẽ 30% thẻ ngược.

### 5.4 Thư viện `/app/vocabulary/library`
- **P1** Mỗi từ là một thẻ to có hình chung theo chủ đề. 20 từ/trang phải cuộn rất dài.
  → Dạng danh sách dày: `từ · loại từ · nghĩa · trạng thái (Mới/Đang học/Đã thuộc) · ☆ · 🔊`; bấm vào mở drawer chi tiết.
- **P1** Nhãn "Nội dung nguồn · chưa duyệt nghĩa" lặp trên mọi thẻ, làm giảm niềm tin. → Gom thành một dòng thông báo đầu danh sách; trên thẻ chỉ hiện nhãn khi *đã* biên tập (dấu ✓).
- **P2** Thêm "Học các từ đang lọc" để biến kết quả lọc thành một phiên Learn.

### 5.5 Từ đã lưu / Bộ thẻ / Sổ tay
- **P1** Ba nơi lưu chồng chéo: `notebook`, `decks`, Sổ tay chung `/app/notebook`. → Một **Sổ từ** duy nhất, có bộ lọc: Tất cả · Đã gắn sao · Theo nguồn (News, Reading, Lesson) · Theo bộ.
- **P1** Decks rỗng, không có cách thêm từ khi đang học. → Nút ☆ trên mọi thẻ học/ôn, thêm vào "Đã gắn sao" hoặc bộ tự tạo.

### 5.6 Luyện tập `/app/vocabulary/practice`
- **P2** Mini quiz 5 câu, chỉ trắc nghiệm, chỉ từ đã lưu. Trùng với Learn. → Đổi thành **Kiểm tra (Test)** kiểu Quizlet: chọn số câu, trộn dạng (trắc nghiệm / gõ / đúng-sai / ghép), chấm cuối bài, xuất "từ yếu" sang hàng ôn.

### 5.7 Tiến độ `/app/vocabulary/progress`
- **P1** Ba định nghĩa "đã thuộc" khác nhau (§3.1). → Thống nhất 4 trạng thái FSRS. Thêm biểu đồ "dự báo ôn 7 ngày tới" (Anki có) và "số từ đã thuộc theo tuần".

### 5.8 Các màn di sản `learn`, `overview`
- **P1** Chip chủ đề trùng lặp và rối; trùng chức năng với Landing/Library. → Redirect `learn` → `library`, `overview` → `/app/vocabulary`. Giữ `learn/[id]` làm trang chi tiết từ.

### 5.9 Module lab (Collocations, Word Formation, Translation, Listening, Reading)
- Đây là những màn **tốt nhất** về hành vi học. Chỉ cần:
  - **P1** Cho các từ đến hạn của các module này hiện chung trong "Học hôm nay" (một hàng ôn hợp nhất).
  - **P2** Đồng bộ thành phần: cùng component thẻ, cùng nút chấm, cùng phím tắt.

### 5.10 Mobile
- **P1** Thanh chế độ (Thẻ lật/Trắc nghiệm/Gõ từ/Ghép cặp) chiếm hàng đầu; nút chính ở giữa màn. → Nút chấm cố định ở đáy (vùng ngón cái), vuốt trái/phải = Chưa nhớ/Đã nhớ, chạm thẻ = lật.
- **P2** Nút chat nổi che nút chấm và nút "Từ tiếp theo" trong khi học. → Ẩn nút chat trong màn học/ôn.

---

## 6. Thiết kế chi tiết đề xuất

### 6.1 Cấu trúc thông tin (thay 17 lối vào bằng 3 tab)

```
Từ vựng
├─ Hôm nay      → thẻ "Học hôm nay", hàng ôn hợp nhất, mục tiêu ngày, chuỗi ngày
├─ Thư viện     → các bộ (IELTS, A1–C2, Collocations, Word Families, Listening, Reading, Dịch câu)
│                 mỗi bộ: tiến độ + "Học tiếp" + danh sách từ dày
└─ Sổ từ        → từ đã lưu/gắn sao (mọi nguồn) + Tiến độ + Kiểm tra
```

Sidebar chỉ còn 3 mục con thay cho 9 mục hiện tại.

### 6.2 Cấu tạo thẻ học (dùng chung cho Study, Review, mọi module)

```
┌────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓░░░░░░  7/20          ☆   ⚙         │  tiến độ phiên · gắn sao · cài đặt
│                                            │
│              sustainable                    │  56–64px, đậm
│        /səˈsteɪnəbəl/ · adj  🔊             │  IPA + loại từ + nghe (tự phát)
│                                            │
│ ── mặt sau ─────────────────────────────── │
│  bền vững                                   │  nghĩa Việt 24px
│  able to continue without harming the …     │  định nghĩa Anh 15px, màu phụ
│  “We need a **sustainable** energy plan.”   │  ví dụ 17px, tô đậm từ, 🔊 câu
│  Band 6 · Environment                       │
├────────────────────────────────────────────┤
│  [ Quên ]   [ Khó ]   [ Nhớ ]   [ Dễ ]      │  52px, phím 1–4
│   <1 phút    6 phút    1 ngày    4 ngày     │  khoảng ôn FSRS
└────────────────────────────────────────────┘
Phím: Space = lật · 1–4 = chấm · S = gắn sao · P = phát âm
Mobile: chạm = lật · vuốt ← = Quên · vuốt → = Nhớ
```

### 6.3 Phiên Learn (thay cho 4 chế độ rời)

- Chia 10 từ mới thành 2 nhóm × 5 từ.
- Mỗi từ có điểm thành thạo trong phiên: `0 → 1 (nhận diện đúng) → 2 (nhớ lại/gõ đúng)`.
- Hàng đợi: giới thiệu 5 từ → trắc nghiệm 5 từ → gõ 5 từ; từ sai chèn lại sau 2–3 thẻ, điểm giữ nguyên.
- Từ đạt 2 → rời hàng đợi. Phiên kết thúc khi cả 10 từ đạt 2.
- Ghi FSRS khi kết thúc: từ đúng ngay lần đầu → `Good`; từ phải làm lại ≥2 lần → `Hard`; từ bỏ qua → `Again`.
- Màn kết thúc: "10/10 từ đã nắm · 3 từ khó: … · Ngày mai ôn 10 từ (~4 phút)" + "Viết câu với 3 từ khó" (dẫn sang Dịch câu).

### 6.4 Trạng thái từ (dùng ở mọi nơi)

| Trạng thái | Điều kiện | Màu |
|---|---|---|
| Mới | chưa từng gặp | xám |
| Đang học | có trong FSRS, `state` = Learning/Relearning | cam |
| Đang ôn | `state` = Review, stability < 21 ngày | xanh dương |
| Đã thuộc | `state` = Review, stability ≥ 21 ngày | xanh lá |

### 6.5 Thông số giao diện
- Chữ: từ chính 56–64px (mobile 40px) · nghĩa 22–24px · ví dụ 17px · phụ 13–14px. **Không dùng chữ < 12px** trong màn học.
- Vùng bấm tối thiểu 44×44px; nút chấm 52px.
- Hiệu ứng: lật thẻ 250ms; đúng → viền xanh + rung nhẹ trên mobile; sai → lắc 200ms. Tôn trọng `prefers-reduced-motion`.
- Âm thanh phản hồi đúng/sai: mặc định tắt, bật trong ⚙.

---

## 7. Lộ trình triển khai

### Giai đoạn 1: sửa vòng học (P0, ~2–3 ngày)
1. Resume + thứ tự học theo band/tần suất, bỏ qua từ đã học: `vocabulary-study.tsx` (truy vấn + lưu vị trí).
2. Thẻ lật có **Chưa nhớ / Đã nhớ**, thẻ chưa nhớ quay lại cuối phiên; ẩn "Từ tiếp theo" trước khi chấm.
3. Ghi từ đã học vào FSRS (`user_word_reviews`). Hiện bảng này gắn với `notebook_entry_id`, nên cần thêm khoá `(collection, source_id)` hoặc tự tạo entry ẩn. **Cần migration**.
4. Giới hạn ôn: 20 thẻ mới + 50 thẻ ôn/ngày; nhãn Việt + khoảng ôn + phím 1–4 trên Review.
5. Trắc nghiệm chấm ngay khi bấm; gõ từ chấp nhận lệch 1 ký tự.

### Giai đoạn 2: một lối vào (P1, ~3–4 ngày)
6. Thẻ **Học hôm nay** ở Landing + hàng ôn hợp nhất (Study + Collocations + Listening + Reading).
7. Phiên **Learn** gộp (§6.3) làm chế độ mặc định.
8. Thống nhất 4 trạng thái từ; sửa Progress.
9. Redirect `learn` / `overview`; gộp Notebook/Decks thành Sổ từ + nút ☆.
10. Audio TTS sẵn cho từ + ví dụ (dùng audio engine đã có).

### Giai đoạn 3: trau chuốt (P2)
11. Thư viện dạng danh sách dày + drawer chi tiết.
12. Kiểm tra (Test) trộn dạng; Ghép cặp tính giờ.
13. Cử chỉ vuốt trên mobile, ẩn nút chat khi học, biểu đồ dự báo ôn.

---

## 8. Đo hiệu quả

| Chỉ số | Định nghĩa | Mục tiêu sau GĐ2 |
|---|---|---|
| Tỉ lệ quay lại ngày 2 / ngày 7 | học viên có phiên Vocabulary ở ngày D+1 / D+7 | +30% |
| Tỉ lệ hoàn thành phiên | phiên kết thúc / phiên bắt đầu | ≥ 70% |
| Retention khi ôn | % thẻ đến hạn được chấm Nhớ/Dễ | 80–90% (vùng tối ưu của FSRS) |
| Từ "Đã thuộc"/tuần | số từ chuyển sang stability ≥ 21 ngày | tăng đều theo tuần |
| Thời gian tới thẻ đầu tiên | từ khi mở Vocabulary tới thẻ đầu | < 5 giây, 1 cú bấm |

---

## 9. Phân tích giao diện (UI)

Phần này đo trực tiếp trên DOM của từng màn (1440×900 và 375×812, dữ liệu thật), không chỉ nhìn ảnh chụp. Bảng số liệu ở §9.8.

### 9.1 Bố cục & phân cấp thị giác

| Màn | Điểm nhìn đầu tiên nên là | Thực tế | Vấn đề |
|---|---|---|---|
| Landing | Việc cần làm hôm nay | Hero dải ngang dài, nửa phải trống | Hình minh hoạ hero bị ẩn bởi `globals.css` (`.vocabulary-layout .vocabulary-landing-hero-art{display:none}`), để lại khoảng trắng lớn. 8 thẻ bộ từ có trọng lượng thị giác ngang nhau, không có lựa chọn "mặc định" |
| Study (thẻ lật) | Từ đang học | Thanh 4 chế độ to ngang hàng nhau ở trên cùng, cạnh tranh với thẻ | Thẻ chiếm ~1/3 chiều cao, phần dưới trống. Nút chính "Từ tiếp theo" nằm ngoài thẻ, sát mép phải, xa mắt |
| Review | Thẻ ôn | Thẻ rộng ~600px giữa canvas 1180px | Nút chấm cao ~28px, chữ 12px, là nút nhỏ nhất màn, trong khi đây là hành động bấm nhiều nhất |
| Library | Danh sách từ | Thẻ cao, hình minh hoạ lặp theo chủ đề | 20 từ chiếm 4.451px (desktop) / 11.204px (mobile). Nhãn "Nội dung nguồn · chưa duyệt nghĩa" màu vàng nổi hơn cả nghĩa của từ |
| Từ đã lưu | Danh sách để ôn | 67 hàng cao | Trang dài 6.870px; nút "Bỏ lưu" màu đỏ lặp 67 lần, là thứ nổi nhất trang |
| Learn (cũ) | — | Render **toàn bộ 810 từ trong một trang** | Trang dài **80.658px**, 875 nút, không phân trang |
| Collocations / Listening / Word Formation | Thẻ học / chủ đề | Đúng | Nhóm màn này có bố cục tốt nhất. Có thể dùng làm chuẩn |

### 9.2 Năm kiểu đầu trang khác nhau

| Kiểu | Màn | Cấu trúc |
|---|---|---|
| A | Landing | Eyebrow + H1 28.8px/900 + 2 nút trong hero |
| B | Library, Review, Notebook, Decks, Practice, Explore, Progress, Learn | Breadcrumb "IELTSWITHHARRY / VOCABULARY" + H1 28px/900 + mô tả chung giống hệt nhau ("Học theo chủ đề, lưu từ trong bài đọc…") + link "← Chọn cách học" + chip "67 từ đã lưu" |
| C | Collocations, Word Formation, Listening | "← Từ vựng" bên trái + nhãn bộ bên phải + H1 30px/800 có chữ nhấn màu |
| D | Translation | Như C nhưng H1 34px |
| E | Study | **Không có H1**, chỉ thanh công cụ |
| (F) | Reading Vocab | "← Reading" + hero gradient + H1 30.4px/800 |

→ **Đề xuất:** một component `VocabPageHeader` duy nhất theo kiểu C (đẹp và gọn nhất): `← Từ vựng` · tên bộ · H1 28–30px/800 có chữ nhấn · 1 dòng mô tả **riêng cho từng màn** · hàng số liệu. Bỏ breadcrumb chữ in hoa và câu mô tả chung lặp ở 8 màn.

### 9.3 Hệ chữ (typography)

- **5 cỡ H1 khác nhau** (28 · 28.8 · 30 · 30.4 · 34px) và 2 độ đậm (800, 900).
- Số cỡ chữ khác nhau mỗi màn: 5–10. Một hệ tốt chỉ cần 6 bậc.
- **Chữ < 12px** (đếm phần tử có chữ):

| Màn | Desktop | Mobile |
|---|---|---|
| Learn (cũ) | **874** | — |
| Word Formation | **87** | **87** |
| Từ đã lưu | 69 | — |
| Library | 61 | 62 |
| Reading Vocab | 60 | 30 |
| Study | 2 | 7 |
| Collocations, Listening | 0 | 0 |

Chữ 9–11px chủ yếu là: nghĩa tiếng Việt trong danh sách (Word Formation "Thành công", Reading "n · bằng chứng"), nhãn band/topic, số thứ tự. **Nghĩa tiếng Việt là nội dung học, không phải chú thích**, nên tối thiểu phải 13px.

→ **Thang chữ đề xuất** (dùng biến CSS):
```
--vt-display: 56px/1.05 800   (từ trên thẻ học; mobile 40px)
--vt-h1:      30px/1.15 800   (đầu trang)
--vt-h2:      20px/1.25 800   (tiêu đề khối)
--vt-body:    15px/1.55 500   (mô tả, nghĩa trong danh sách)
--vt-small:   13px/1.45 600   (meta: band, topic, đếm)
--vt-eyebrow: 12px/1.2 800, letter-spacing .1em, IN HOA (tối đa 1 lần mỗi khối)
```

### 9.4 Màu sắc

- File CSS của Vocabulary chứa **450 mã màu hex khác nhau**.
- Màu chủ đạo teal có **hơn 20 sắc độ gần như trùng nhau** (`#0a9ba3`, `#009da5`, `#009da4`, `#078f99`, `#009ca5`, `#089da5`, `#078f98`, `#008e99`, …), mắt người không phân biệt được. Trong khi app đã có `--teal-strong`, `--teal-soft`, `--navy`, `--muted` trong `globals.css`.
- Màu trạng thái chưa có nghĩa thống nhất: vàng dùng cho "chưa duyệt nghĩa" (Library), "Đang chọn" (Study) và cả "mẹo".
- Thẻ minh hoạ dùng 7 gradient pastel khác nhau theo bộ. Đẹp, nhưng không mang thông tin.

→ **Đề xuất:** chỉ dùng token, gồm 1 teal chính + 1 teal nhạt + navy + 3 xám chữ. Màu **chỉ** dùng để báo trạng thái học: Mới (xám) · Đang học (cam `#f08c2e`) · Đang ôn (xanh dương `#2f7fd8`) · Đã thuộc (xanh lá `#1c9a6c`) · Sai (đỏ `#d9534f`). Pastel giữ cho ô biểu tượng của bộ từ, không dùng cho trạng thái.

### 9.5 Component

- **Bo góc: 15 giá trị** (7 · 8 · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 18 · 20 · 22 · 24 · 99 · 999px). → Rút còn 3: `10px` (nút, ô nhập), `16px` (thẻ), `999px` (chip).
- **Biến thể nút trên một màn:** Word Formation có 10 kiểu nút khác nhau; Study 6; Library 4. → Rút còn 3 biến thể: Primary (teal đặc) · Secondary (viền) · Ghost (chữ). Riêng nút chấm thẻ là biến thể thứ 4 có màu theo mức nhớ.
- **Thẻ học có 4 kiểu khác nhau** ở Study, Review, Collocations, Reading: khác cỡ chữ, khác vị trí nút, khác cách lật. → Một component `StudyCard` dùng chung (đặc tả ở §6.2).
- **Thanh chế độ:** Study dùng 4 nút to bằng nhau; Word Formation dùng chip nhỏ; Reading dùng 9 tab có icon; Listening dùng tab gạch chân. → Một kiểu: segmented control cho ≤4 chế độ, tab cuộn ngang khi >4.
- **Huy hiệu "chưa duyệt":** mỗi màn một kiểu chữ và một màu. → Một huy hiệu duy nhất, chỉ hiện ở chi tiết từ, không lặp trên mọi thẻ.

### 9.6 Mobile (375px)

| Màn | Tràn ngang | Chiều cao trang | Vùng bấm < 40px | Vị trí nút chính |
|---|---|---|---|---|
| Landing | không | 2.517px | 14/27 | 188px (tốt) |
| Study | không | 812px | **7/10** | 523px |
| Review | không | 812px | 1/2 | (thẻ) |
| Library | không | **11.204px** | 1/46 | — |
| Collocations | không | 906px | 2/5 | **706px** (sát đáy) |
| Listening | không | 5.583px | 4/40 | 540px |
| Reading Vocab | không | 3.006px | 12/42 | 330px |
| Word Formation | **tràn 365px** | 1.348px | 11/56 | **715px** |

**Lỗi cần sửa ngay:**
- **Word Formation tràn ngang 365px trên mobile.** Ở `@media(max-width:760px)`, `.word-formation-layout{grid-template-columns:1fr}` cho phép cột giãn theo nội dung tối thiểu (728px). Sửa: `grid-template-columns:minmax(0,1fr)` (`word-formation-page.css`, khối media 760px).
- **Study mobile:** 7/10 nút nhỏ hơn 40px (4 tab chế độ, "Đổi bộ lọc", "← Từ vựng", "Nghe phát âm").
- **Collocations / Word Formation:** nút hành động chính nằm ở 706–715px trên màn 812px, bị thanh điều hướng đáy (~70px) và nút chat nổi che một phần. Phải cuộn hoặc với tay mới bấm được.
- Nút chat nổi (góc phải dưới) đè lên nút "Từ tiếp theo" và nút đánh dấu trong mọi màn học.
- Sidebar Vocabulary có 9 mục con, nhãn dài bị xuống dòng ("607 từ IELTS Reading 2026", "Luyện dịch câu Việt → Anh").

→ **Đề xuất mobile:** thanh hành động cố định ở đáy vùng học (trên bottom nav); trong màn học/ôn thì ẩn nút chat và thu bottom nav; thẻ học chiếm 60–65% chiều cao; mọi vùng bấm ≥ 44px; Library dạng danh sách 1 dòng/từ (~64px), nên 20 từ ≈ 1.300px thay vì 11.204px.

### 9.7 Khả năng tiếp cận (a11y)

- Thẻ lật ở Review là một `<button>` bọc cả nội dung. Trình đọc màn hình đọc "Hiện nghĩa" nhưng không đọc được từ đang hỏi. → `aria-label` gồm từ: "spread, bấm để hiện nghĩa".
- Không có phím tắt trong Study/Review (đã nêu ở §5). Đây vừa là vấn đề tốc độ vừa là vấn đề a11y.
- Chữ xám nhạt (`#8798a8`, `#879ab0`, `#8a9eb0`) trên nền trắng có độ tương phản ~3:1, **dưới chuẩn WCAG AA 4.5:1** cho chữ thường. → Xám chữ phụ tối thiểu `#5f768c` (~4.7:1).
- Trạng thái đúng/sai chỉ dùng màu viền. → Thêm icon ✓/✗ và chữ.

### 9.8 Bảng số liệu đo (desktop 1440px)

| Màn | H1 | Số cỡ chữ | Chữ < 12px | Số nút | Kiểu nút | Bo góc khác nhau | Chiều cao trang |
|---|---|---|---|---|---|---|---|
| Landing | 28.8/900 | 10 | 3 | 9 | 2 | 3 | 1.111 |
| Study | — | 6 | 2 | 8 | 6 | 2 | 900 |
| Library | 28/900 | 9 | 61 | 45 | 4 | 1 | 4.451 |
| Review | 28/900 | 6 | 3 | 1 | 1 | 3 | 900 |
| Từ đã lưu | 28/900 | 8 | 69 | 134 | 2 | 2 | 6.870 |
| Decks | 28/900 | 6 | 1 | 1 | 1 | 1 | 900 |
| Practice | 28/900 | 5 | 1 | 1 | 1 | 1 | 900 |
| Explore | 28/900 | 10 | 2 | 3 | 2 | 1 | 900 |
| Progress | 28/900 | 8 | 1 | 2 | 2 | 1 | 900 |
| Learn (cũ) | 28/900 | 9 | 874 | 875 | 4 | 2 | **80.658** |
| Collocations | 30/800 | 9 | 0 | 4 | 4 | 3 | 900 |
| Word Formation | 30/800 | 10 | 87 | 55 | **10** | 1 | 1.029 |
| Translation | 34/800 | 7 | 6 | 1 | 1 | 2 | 900 |
| Listening | 30/800 | 8 | 0 | 39 | 4 | 2 | 1.777 |
| Reading Vocab | 30.4/800 | 9 | 60 | 41 | 4 | 2 | 1.676 |

### 9.9 Thứ tự sửa giao diện (gộp vào lộ trình §7)

(Xem §10 cho trạng thái triển khai.)

- **Sửa ngay (≤1 giờ):** Word Formation tràn ngang mobile; phân trang hoặc redirect màn Learn cũ (80.658px); ẩn nút chat trong màn học/ôn; nâng nghĩa Việt trong danh sách lên ≥13px; xám chữ phụ đạt 4.5:1.
- **Cùng Giai đoạn 1:** `StudyCard` dùng chung + nút chấm 52px + thanh hành động cố định đáy trên mobile.
- **Cùng Giai đoạn 2:** `VocabPageHeader` dùng chung; token màu/bo góc/thang chữ (§9.3–9.5); Library và Từ đã lưu dạng danh sách dày.

---

## 10. Trạng thái triển khai (03/11/2026, branch `claude/vocab-learning-loop`)

Không cần migration database. Từ học trong phiên được lưu vào Sổ từ (`notebook_entries`) và chấm FSRS qua RPC có sẵn `save_word_fsrs_review`.

| Hạng mục | Trạng thái | Nơi sửa |
|---|---|---|
| Học tiếp từ chỗ dừng (lưu buổi theo bộ/chủ đề/band) | Đã làm | `vocabulary-study.tsx` |
| Thứ tự IELTS theo band thấp → cao | Đã làm | `vocabulary-study.tsx` |
| Phiên **Học** gộp (xem → chọn nghĩa → gõ lại, sai thì quay lại sau 3 thẻ) làm mặc định | Đã làm | `vocabulary-study.tsx`, `lib/vocabulary/study-session.ts` |
| Thẻ lật có Chưa nhớ / Đã nhớ, phím ←/→, vuốt trên mobile | Đã làm | `vocabulary-study.tsx` |
| Mọi từ học trong phiên tự vào Sổ từ + FSRS | Đã làm | `use-word-srs.ts`, `notebook-store.tsx` (`addEntry` trả về entry) |
| Trắc nghiệm chấm ngay, phím 1–4; gõ từ chấp nhận lệch 1 ký tự + nút "Tôi đã đúng" | Đã làm | `vocabulary-study.tsx` |
| Ôn tập: tối đa 20 từ mới / 50 thẻ, Quên/Khó/Nhớ/Dễ kèm khoảng ôn, phím Space/1–4/P, thẻ Quên quay lại cuối phiên | Đã làm | `vocabulary-hub.tsx` (`Review`) |
| Sửa lỗi chấm lần 2 bị từ chối (lệch `last_reviewed_at` client/server) | Đã làm | `vocabulary-hub.tsx`, `use-word-srs.ts` |
| Thẻ **Hôm nay** ở Landing + 4 trạng thái từ | Đã làm | `vocabulary-landing.tsx` |
| 4 trạng thái dùng chung (Mới/Đang học/Đang ôn/Đã thuộc ≥21 ngày) | Đã làm | `study-session.ts` → Landing, Sổ từ, Ôn tập, Tiến độ |
| Tiến độ: ô trạng thái + dự báo ôn 7 ngày | Đã làm | `vocabulary-hub.tsx` (`Progress`) |
| `learn` → Thư viện, `overview` → Landing | Đã làm | `vocabulary-hub.tsx` |
| Đầu trang chung cho các màn trong hub | Đã làm | `vocabulary-hub.tsx`, `vocabulary-learning-loop.css` |
| Sổ từ dạng danh sách dày, lọc theo trạng thái, nút xoá kín đáo | Đã làm | `vocabulary-hub.tsx` (`SavedWords`) |
| Word Formation tràn ngang 365px trên mobile | Đã sửa | `word-formation-page.css` |
| Chữ < 12px trong Word Formation, Reading, Thư viện | Đã sửa (đo lại: 0) | `globals.css` |
| Chữ xám dưới 4.5:1 | Đã sửa 15 chỗ | các file CSS Vocabulary |
| Ẩn bong bóng sổ tay trên mobile khi đang học | Đã làm | `globals.css` |
| Sidebar: nhãn ngắn, thêm "Hôm nay", "Ôn tập", "Sổ từ & tiến độ" | Đã làm | `app-shell.tsx` |
| Phát âm chất lượng cao | Đã làm (04/11): bản ghi giọng người Wiktionary/Wikimedia (CC BY-SA, qua dictionaryapi.dev) cho từ, kèm IPA lấp chỗ thiếu ở bộ IELTS; câu ví dụ đọc bằng giọng Natural/Neural tốt nhất của thiết bị. Không dùng Gemini vì production chưa có `GEMINI_API_KEY` và quota miễn phí không đủ cho học viên | `lib/vocabulary/pronounce.ts` |
| Gộp Bộ thẻ vào Sổ từ, nút ☆ gắn sao | Đã làm (04/11): thanh bộ thẻ trong Sổ từ, tạo/xoá bộ, thêm từ vào bộ, "Ôn bộ này", "Kiểm tra" theo bộ; sao trên Sổ từ, thẻ học và thẻ ôn (phím S). Sao là bộ thẻ đặc biệt "⭐ Đã gắn sao", không cần migration; `/decks` chuyển về Sổ từ | `use-decks.ts`, `vocabulary-hub.tsx` |
| Chế độ Kiểm tra trộn dạng (thay Mini quiz) | Đã làm (04/11): 10/20/30 câu, 4 dạng (chọn nghĩa, chọn từ, gõ từ, đúng/sai), chấm khi nộp, "Ôn từ sai ngay" đưa từ sai vào ôn hôm nay | `study-session.ts` (`buildTest`), `vocabulary-hub.tsx` |
| Thư viện dạng danh sách dày + chi tiết | Đã làm (04/11): mỗi từ một dòng, bấm mở ví dụ/nguồn; trang 4.451px → 1.953px (desktop) | `vocabulary-hub.tsx` (`LibraryRow`) |
| Đầu trang chung cho Collocations/Word Formation/Listening/Translation | Đã làm (04/11). Reading Vocabulary (nằm dưới Reading) giữ đầu trang riêng | `vocab-page-header.tsx` |
| Chuyển 450 mã màu sang token | **Một phần**: token mới cho phần đã viết lại | |

Lưu ý vận hành: Sổ từ hiện tải tối đa 1.000 mục (trước là 500). Khi học viên học hơn ~1.000 từ, nên chuyển hàng ôn sang truy vấn phía server (`due_at <= now()`).

---

## 11. Soát lần 2 (04/11/2026, production + demo, 1366px và 375px)

Quét lại từng màn bằng thao tác thật và script đo DOM (tràn ngang, chữ < 12px, vùng bấm < 36px, ảnh lỗi). Đã sửa trên branch `claude/vocab-ux-fixes`:

| Màn | Lỗi | Sửa |
|---|---|---|
| Học | Nút "Nghe" vỡ: icon nằm trên chữ, vùng bấm 34×53px (CSS còn trỏ selector cũ) | Nút viên thuốc 40px cạnh ☆ |
| Học | Bấm chuột rồi nhấn Enter: phím tắt và nút đang focus cùng chạy, nhảy 2 bước (qua thẻ rồi lật luôn thẻ sau) | Phím đã xử lý thì `preventDefault`; bỏ qua Ctrl/Cmd/Alt |
| Học | Buổi A1–C2 chỉ còn 6/10 từ: từ không có định nghĩa Anh bị loại dù có nghĩa Việt | Chỉ loại từ không có nghĩa nào |
| Học | Từ dạng "a.m./A.M./am/AM": tiêu đề rối, Gõ từ bắt gõ cả chuỗi (gợi ý "15 ký tự"), câu ví dụ lộ đáp án "A.M." | Hiện "a.m." + "Cũng viết: …"; chấp nhận mọi dạng; che mọi dạng trong câu ví dụ |
| Học | Thanh tiến độ đứng yên ở 0 suốt 15–20 thao tác đầu (chỉ tăng khi từ qua bước Gõ) | Tăng theo từng bước xong |
| Học | Nhãn "· làm lại" hiện ngay khi vừa trả lời sai, và cả ở lần đầu sang bước Gõ | Chỉ hiện khi thẻ thật sự quay lại |
| Học | Nhãn "Chọn nghĩa đúng" lặp 2 lần (pill + kicker) | Bỏ kicker trong chế độ Học |
| Học | Loại từ A1–C2 tiếng Anh ("ADVERB") trong khi IELTS tiếng Việt; nhãn luôn là "CEFR" thay vì A1/B2… | Dịch loại từ; hiện mức CEFR của từ |
| Học | Định nghĩa trùng nghĩa Việt hiện 2 lần | Ẩn khi trùng |
| Học | Thẻ cao 52vh, chữ giữa thẻ, nút chính bị đẩy xuống mép màn | Thẻ thấp hơn, nội dung bắt đầu từ trên |
| Ghép cặp | Mô tả "tính giờ" nhưng không thấy đồng hồ; ghép sai không biết cặp nào sai; cặp đúng chỉ mờ đi; buổi 6 từ chơi 5 + 1 cặp | Đồng hồ chạy, lắc đỏ 2 thẻ sai, ✓ xanh cho cặp đúng, chia nhóm đều (3 + 3), có hướng dẫn |
| Demo | Màn Học trống trong demo mode | Dùng bộ từ mẫu |
| Hôm nay | Thẻ "Từ đã lưu" ghi "Mở sổ tay" nhưng mở thẳng Ôn tập | Mở Sổ từ |
| Hôm nay | "Sổ từ của bạn" thiếu trạng thái Mới nên 1 + 0 + 0 ≠ 113 từ | Đủ 4 trạng thái |
| Hôm nay | Khối "Bắt đầu nhanh" lặp nút ở hero; không có lối vào Tra từ | Thay bằng ô Tra từ |
| Hôm nay | 2 thẻ bước "Ôn tập / Học từ mới" trông bấm được nhưng không bấm được; `<main>` lồng trong `<main>` | Thành link; đổi sang `<div>` |
| Ôn tập | Space sau khi hiện nghĩa cuộn trang; Ctrl+S / Ctrl+P bị bắt thành gắn sao / phát âm | Chặn cuộn; bỏ qua phím có modifier |
| Ôn tập | Từ IELTS không có IPA | Lấy IPA từ từ điển như màn Học |
| Sổ từ | Mobile: hàng tràn 6px; 113 từ = trang 12.400px | Sửa grid; hiện 40 từ, "Xem thêm" |
| Sổ từ | Bấm thùng rác xoá ngay (mất cả lịch ôn, không hoàn tác); chọn bộ đã có ✓ là lặng lẽ bỏ khỏi bộ | Hỏi xác nhận; nhãn "+ Bộ" / "✓ Bộ · bỏ khỏi bộ" |
| Tra từ | Kết quả từ điển: lưu xong nút vẫn "☆ Lưu vào sổ", bấm lại không có phản hồi | Hiện "✓ Đã lưu" |
| Thư viện | Không có kết quả vẫn ghi "đang xem 0–0 / 0 từ" | Ẩn khi trống |
| Kiểm tra | Đáp án nhiễu có thể trùng chữ nhau | Không lặp nghĩa/từ |
| Chung | Link "← Từ vựng" cao 21px trên mọi màn; "Đổi bộ lọc" 30px | ≥ 36px |

**Còn lại (chưa sửa, cần quyết định hoặc migration):**
- Bộ A1–C2 vẫn học theo bảng chữ cái (`list_vocabulary_study_by_cefr` sắp `order by headword`): buổi 1 là "a.m., abandon, abandoned, aberration…", từ cùng gốc nằm chung một buổi nên đáp án nhiễu dễ nhầm. Cần sửa RPC để sắp theo CEFR rồi tần suất.
- Bộ IELTS: "Band 1" gồm cụm động từ và nghĩa hiếm ("away" = "ở sân đối phương"); ước lượng band cần soát lại nội dung.
- Truy vấn IELTS mất ~2,4 giây (`count: "exact"`), màn chỉ có chữ "Đang lấy bộ từ…".
- Trang chủ ở demo hiện "… từ" mãi vì không có DB.
