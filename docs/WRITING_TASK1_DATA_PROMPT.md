# Prompt soạn dữ liệu Writing Task 1 Lab

Cách dùng:
1. Mở một cuộc trò chuyện mới với công cụ soạn (ChatGPT, Claude…). Dán nguyên **PROMPT GỐC** (phần A) một lần.
2. Sau đó dán **từng PROMPT LÔ** (phần B) theo thứ tự. Mỗi lô trả về một khối JSON; lưu mỗi khối thành một file `.json` đặt tên theo `batch` (ví dụ `L2-line-01.json`).
3. Nếu câu trả lời bị cắt giữa chừng, gõ: `Tiếp tục đúng từ chỗ bị cắt, không lặp lại phần đã viết.`
4. Gom các file lại gửi cho Claude Code để kiểm tra tự động và nạp vào web.

---

## A. PROMPT GỐC (dán một lần)

````text
Bạn là giáo viên IELTS Writing giàu kinh nghiệm dạy học sinh Việt Nam (14–25 tuổi, từ mất gốc đến band 7), đồng thời là người biên soạn học liệu tự học. Nhiệm vụ: soạn dữ liệu cho "Writing Task 1 Lab" — một khoá TỰ HỌC Academic Writing Task 1 trên web. Không có giáo viên đi kèm, nên dữ liệu phải tự giảng, tự làm mẫu, tự cho luyện và tự cho chấm.

MỤC TIÊU: học sinh (1) HIỂU Task 1 là gì và cách làm, (2) LÀM ĐƯỢC với khung hỗ trợ, (3) TỰ LUYỆN LÂU DÀI với đề mới, bài luyện ngắn và cách tự đánh giá.

DỮ LIỆU GỒM 5 LỚP:
- Lớp 1 — Kiến thức nền: bài nhập môn, hướng dẫn 7 dạng, sổ tay ngôn ngữ, ghi chú ngữ pháp.
- Lớp 2 — Bài học có hướng dẫn: mỗi dạng 3–4 bài, đi theo "xem mẫu → làm theo khung → tự làm".
- Lớp 3 — Ngân hàng đề luyện: nhiều đề mới, ít khung hơn, có bài mẫu và checklist riêng.
- Lớp 4 — Bài luyện ngắn theo kỹ năng (3–5 phút) và thẻ ôn.
- Lớp 5 — Tự đánh giá: mô tả band bằng tiếng Việt dễ hiểu, bộ 3 bài band 5/6/7 cùng một đề có chú thích.

7 DẠNG (giá trị "group"): line, bar, pie, table, mixed, map, process.
3 CHẶNG (giá trị "stage"):
- foundation (mục tiêu 1.0–4.0): nhiều khung, có bản dịch, chủ yếu điền và chọn; viết Mở bài + Overview (~50–70 từ).
- developing (4.5–6.0): bớt khung, tự viết từng đoạn; bài 120–150 từ.
- advanced (6.5–7.0+): chỉ còn đề, checklist và bài mẫu; bài 150–190 từ.

QUY TẮC NỘI DUNG (bắt buộc):
1. Nội dung GỐC 100%. Không chép, không phỏng theo đề Cambridge, IELTS chính thức, sách hay website nào. Đề, số liệu, bản đồ, quy trình đều tự tạo. Dùng địa danh hư cấu hoặc chung chung ("a town", "Westbridge"), không dùng thương hiệu thật.
2. Số liệu hợp lý, có xu hướng rõ để có Overview. Mỗi biểu đồ có 2–4 đặc điểm chính rõ ràng, có điểm so sánh đáng nói.
3. MỌI con số trong bài mẫu, đặc điểm chính và lời giải phải KHỚP CHÍNH XÁC số liệu của hình. Khi làm tròn, dùng "around/approximately/just over/just under" và vẫn phải đúng.
4. Bài mẫu: giọng học thuật, chính tả Anh–Anh, không nêu nguyên nhân hay ý kiến, không suy diễn ngoài hình, đủ 4 đoạn Intro – Overview – Body 1 – Body 2. Mở bài diễn đạt lại đề, không chép nguyên câu đề. Overview không có số liệu chi tiết.
5. Tiếng Việt: tự nhiên, ngắn, dễ hiểu với học sinh cấp 3. Giải thích LÝ DO chứ không chỉ nói đúng/sai. Không dùng thuật ngữ kỹ thuật (không "node", "edge", "n01", "e01", "mã cạnh").
6. Không tuyên bố đây là đề thi chính thức hay điểm band được chứng nhận.
7. Chủ đề đa dạng: giáo dục, môi trường, giao thông, dân số, việc làm, năng lượng, sức khoẻ, du lịch, công nghệ, tiêu dùng, đô thị, nông nghiệp… Không lặp chủ đề quá 2 lần trong cùng một dạng.
8. Lời giải câu hỏi phải chỉ vào chỗ cụ thể trên hình ("cột 2020 của metro cao nhất: 50").

QUY TẮC ĐỊNH DẠNG (bắt buộc):
- Mỗi câu trả lời chỉ gồm MỘT khối ```json hợp lệ (nháy kép, không comment, không dấu phẩy thừa), sau đó là mục "KIỂM TRA" ngắn ngoài khối JSON (xem cuối prompt).
- id dạng kebab-case, không dấu, có tiền tố theo lớp: "g-" (lớp 1), "l-" (lớp 2), "p-" (lớp 3), "d-" (lớp 4), "c-" (thẻ ôn), "b-" (lớp 5). id phải duy nhất trong toàn bộ dữ liệu.
- Mỗi file có "meta": {"package": "T1-DATA-v1", "batch": "<tên lô>", "layer": <1-5>}.
- Chữ trong đề và bài mẫu là tiếng Anh; mọi trường có hậu tố "_vi" là tiếng Việt; hậu tố "_en" là tiếng Anh.
- Trong khung điền, chỗ trống ghi là "___" (3 dấu gạch dưới), mỗi chỗ trống có đáp án theo đúng thứ tự trong "answers".

CẤU TRÚC HÌNH ("visual") — web tự vẽ từ dữ liệu, KHÔNG dùng ảnh:
- line / bar:
  {"kind":"line"|"bar","title":"...","x_axis":{"label":"Year","categories":["2010","2015"]},"y_axis":{"label":"...","unit":"..."},"series":[{"name":"Bus","values":[40,45]}]}
  Mỗi series có đúng số giá trị bằng số categories. Tối đa 5 series, tối đa 8 categories.
- pie:
  {"kind":"pie","title":"...","x_axis":{"categories":["Coal","Gas","Solar"]},"series":[{"name":"2000","values":[50,30,20]}]}
  Mỗi series là một biểu đồ tròn, tổng đúng 100. Tối đa 3 biểu đồ, tối đa 7 phần.
- table:
  {"kind":"table","title":"...","rows":[["Country","2000","2020"],["A","12","15"]]}
  Dòng đầu là tiêu đề cột. Tối đa 7 dòng dữ liệu, 6 cột. Có dòng "Total" thì phải cộng đúng.
- mixed:
  {"kind":"mixed","title":"...","panels":[<hình line/bar/pie/table>, <hình khác>]}
  Đúng 2 panel, hai hình phải liên quan tới nhau.
- map:
  {"kind":"map","title":"...","panels":[{"label":"1990","features":[{"id":"f1","name":"Car park","type":"building|road|park|water|farmland|car-park|housing|shop|school|path|bridge|trees|other","x":0,"y":0,"w":3,"h":2}]}, {"label":"Present", "features":[...]}],"compass":true}
  Toạ độ trên lưới 12×12 (x,y từ 0–11, góc trên bên trái là 0,0, phía trên là hướng bắc). Feature giữ nguyên qua hai thời điểm thì giữ cùng id; feature mới có id mới. Không chồng hình lên nhau.
- process:
  {"kind":"process","title":"...","process_type":"linear|cycle|branch","stages":[{"id":"s1","label_en":"Harvest the tea leaves","icon_hint":"leaf"}],"edges":[{"from":"s1","to":"s2","label_en":""}]}
  5–12 bước. "label_en" ngắn (2–6 từ, động từ nguyên mẫu hoặc danh từ). Vòng tròn (cycle) có cạnh từ bước cuối về bước đầu. Nhánh (branch) ghi điều kiện vào "label_en" của cạnh.

=== LỚP 1 — KIẾN THỨC NỀN ===
(a) Bài nhập môn:
{"id":"g-intro","title_vi":"...","sections":[{"id":"...","title_vi":"...","body_vi":"đoạn văn ngắn, xuống dòng bằng \n","examples":[{"en":"...","vi":"...","note_vi":"..."}]}],"quiz":[{"id":"...","kind":"mcq","prompt_vi":"...","options":[{"id":"a","text":"..."}],"answer":"a","explanation_vi":"..."}]}
Phải có các section: Task 1 là gì và chấm thế nào (4 tiêu chí, nói dễ hiểu); cấu trúc 4 đoạn (mỗi đoạn làm gì, dài bao nhiêu); Overview là gì và vì sao quan trọng nhất; chọn lọc số liệu (không liệt kê hết); 20 phút làm gì (đọc 2 – lập ý 3 – viết 13 – soát 2); 7 dạng hình nhận biết thế nào. Quiz 6–8 câu.

(b) Hướng dẫn từng dạng (7 mục):
{"id":"g-guide-line","group":"line","title_vi":"...","what_it_shows_vi":"...","look_for_vi":["..."],"overview_frames":[{"frame_en":"Overall, ___ rose significantly, while ___ ...","example_en":"...","when_vi":"..."}],"grouping_vi":["cách chia Body 1/Body 2 phổ biến cho dạng này"],"language":[{"phrase_en":"peak at","meaning_vi":"...","example_en":"...","note_vi":"..."}],"mistakes":[{"wrong_en":"...","right_en":"...","why_vi":"..."}],"tense_vi":"dùng thì nào khi nào"}
"language" 15–25 cụm, "mistakes" 5–8, "overview_frames" 3–4.

(c) Ghi chú ngữ pháp (6–8 mục: thì theo mốc thời gian; so sánh hơn/nhất và so sánh gấp lần; while/whereas/by contrast; câu bị động (cho process); diễn đạt số liệu và phần trăm; danh từ hoá xu hướng ("a sharp rise in"); mạo từ và số ít/số nhiều với số liệu; thể hiện vị trí và thay đổi (cho map)):
{"id":"g-grammar-...","title_vi":"...","rule_vi":"...","examples":[{"en":"...","vi":"..."}],"practice":[{"id":"...","kind":"gap|fix|mcq","prompt_vi":"...","stem_en":"...","options":[],"answer":"...","accept":["..."],"explanation_vi":"..."}]}
Mỗi mục 4–6 ví dụ, 5–8 câu luyện.

=== LỚP 2 — BÀI HỌC CÓ HƯỚNG DẪN ===
{
 "id":"l-line-01","group":"line","stage":"foundation","order":1,"topic":"transport",
 "title":"...","question_en":"The line chart shows ... Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
 "question_vi":"bản dịch tự nhiên của đề","unit":"...","minutes":20,
 "visual":{...},
 "gist_vi":"1–2 câu: hình này nói về gì",
 "keywords":[{"en":"commuter","vi":"người đi làm hằng ngày","example_en":"..."}],
 "reading_checks":[{"id":"q1","kind":"mcq|tf","prompt_en":"...","prompt_vi":"...","options":[{"id":"a","text":"..."}],"answer":"a","explanation_vi":"chỉ rõ chỗ trên hình"}],
 "key_features":[{"en":"...","vi":"...","is_overview":true}],
 "model":{"paragraphs":[{"role":"intro|overview|body1|body2","sentences":[{"en":"...","note_vi":"câu này làm gì / vì sao viết vậy","highlight":["cụm đáng học trong câu"]}]}],"word_count":0},
 "language":[{"phrase_en":"...","meaning_vi":"...","example_en":"câu lấy từ chính hình này"}],
 "mistakes":[{"wrong_en":"...","right_en":"...","why_vi":"..."}],
 "scaffold":{
   "intro":{"frame_en":"The line chart ___ the number of ___ in Westbridge from ___ to ___.","answers":["compares","daily commuter journeys","2010","2025"],"choose":{"a_en":"...","b_en":"...","better":"a","why_vi":"..."},"task_vi":"Giờ tự viết câu mở bài của bạn, không nhìn khung."},
   "overview":{...},"body1":{...},"body2":{...}
 },
 "checklist":[{"criterion":"TA|CC|LR|GRA","item_vi":"câu hỏi tự kiểm tra riêng cho bài này","if_no_vi":"cần xem lại phần nào"}]
}
Số lượng mỗi bài: keywords 5–8; reading_checks 3–4 (hỏi đúng thứ cần để viết: cao nhất/thấp nhất, xu hướng, điểm đổi chiều, so sánh); key_features 3–5 (ít nhất 2 cái is_overview=true); language 6–10; mistakes 2–3; checklist 8 (đủ 4 tiêu chí).
"scaffold" theo chặng:
- foundation: cả 4 đoạn đều có frame_en + choose; frame của body có 2–4 chỗ trống.
- developing: intro và overview có frame; body chỉ có "choose" và "task_vi" gợi ý nội dung.
- advanced: chỉ có "task_vi" cho từng đoạn (không frame, không choose).
Trong bài mẫu: mỗi câu đều có note_vi. "word_count" phải đếm đúng.
Mỗi dạng 3–4 bài: bài 1 (foundation) đơn giản nhất, bài cuối (advanced) phức tạp nhất. Process: bài 1 linear 5–6 bước, có bài cycle, có bài branch (advanced). Map: hai thời điểm, 4–8 thay đổi.

=== LỚP 3 — NGÂN HÀNG ĐỀ LUYỆN ===
{"id":"p-bar-001","group":"bar","difficulty":1,"topic":"...","question_en":"...","question_vi":"(bắt buộc nếu difficulty ≤ 2)","unit":"...","visual":{...},
 "overview_hint_vi":"gợi ý 2 ý chính, không viết sẵn câu","key_features_en":["..."],
 "model":{"paragraphs":["intro","overview","body1","body2"],"word_count":0},
 "checklist":[{"criterion":"TA|CC|LR|GRA","item_vi":"..."}]}
difficulty 1–5 (1 = ít số liệu, xu hướng rõ; 5 = nhiều nhóm, xu hướng đan xen). checklist 6 mục, riêng cho đề. Bài mẫu 160–190 từ.

=== LỚP 4 — BÀI LUYỆN NGẮN VÀ THẺ ÔN ===
Bài luyện:
{"id":"d-overview-001","skill":"paraphrase|overview|trend|comparison|numbers|grammar|passive|sequencing|map-language|grouping","group":"line|...|any","difficulty":1,"kind":"mcq|gap|fix|order|rewrite","prompt_vi":"...","stem_en":"...","context":{"visual":{...}} (không bắt buộc, chỉ khi cần hình),"options":[{"id":"a","text":"..."}],"items":["dùng cho kind=order"],"answer":"...","accept":["các đáp án đúng khác"],"explanation_vi":"..."}
- "fix": stem_en có lỗi, answer là câu đã sửa.
- "order": answer là mảng thứ tự đúng của items.
- "rewrite": answer là một đáp án mẫu, "accept" liệt kê thêm 2–3 cách đúng.
Thẻ ôn:
{"id":"c-peak-at","front_vi":"...","back_en":"peak at","example_en":"...","tags":["trend","line"]}

=== LỚP 5 — TỰ ĐÁNH GIÁ ===
{"band_descriptors":[{"criterion":"TA|CC|LR|GRA","name_vi":"...","bands":[{"band":4,"plain_vi":"mô tả dễ hiểu","signs_vi":["dấu hiệu nhận biết trong bài của mình"]}]}],
 "band_sets":[{"id":"b-line-01","lesson_id":"l-line-02","essays":[{"band":5,"text_en":"...","word_count":0,"comments_vi":[{"quote_en":"đoạn trích nguyên văn từ bài","issue_vi":"...","fix_en":"..."}]}],"compare_vi":"bài band 6 hơn band 5 ở đâu, band 7 hơn band 6 ở đâu"}],
 "self_check_routes":[{"criterion":"TA","problem_vi":"Overview chưa nêu được ý chính","go_to":"g-guide-line#overview_frames","tip_vi":"..."}]}
band_descriptors: band 4, 5, 6, 7 cho cả 4 tiêu chí; diễn đạt bằng lời dễ hiểu, KHÔNG chép nguyên văn band descriptors chính thức. Mỗi band_set có đủ 3 bài band 5, 6, 7 cho CÙNG một đề; bài band 5 và 6 phải có lỗi thật, điển hình của người Việt; comments_vi 4–8 mục/bài, quote_en trích đúng nguyên văn.

=== MỤC "KIỂM TRA" (viết sau khối JSON, mỗi lô) ===
Liệt kê ngắn:
1. Số mục đã soạn theo từng loại.
2. Đã đối chiếu từng con số trong bài mẫu với hình chưa (ghi "đã đối chiếu" + các con số dễ nhầm).
3. Số từ từng bài mẫu.
4. Chủ đề đã dùng (để lô sau tránh trùng).
5. Điều gì chưa chắc chắn, cần người duyệt xem lại.

Trả lời "ĐÃ HIỂU" và tóm tắt 5 lớp trong 5 dòng. Chưa soạn gì cho tới khi nhận prompt lô.
````

---

## B. PROMPT LÔ (dán lần lượt, mỗi lần một lô)

Thứ tự soạn: lớp 1 → lớp 5 (mô tả band) → lớp 2 → lớp 4 → lớp 5 (bộ bài 3 mức) → lớp 3.

### Lớp 1 — Kiến thức nền (5 lô)

```text
Lô L1-intro: soạn bài nhập môn "g-intro" theo đúng cấu trúc Lớp 1 (a). Đủ 6 section, mỗi section 2–4 ví dụ, quiz 8 câu.
```

```text
Lô L1-guides-a: soạn hướng dẫn dạng cho line, bar, pie (3 mục g-guide-line, g-guide-bar, g-guide-pie) theo Lớp 1 (b).
```

```text
Lô L1-guides-b: soạn hướng dẫn dạng cho table, mixed (g-guide-table, g-guide-mixed) theo Lớp 1 (b).
```

```text
Lô L1-guides-c: soạn hướng dẫn dạng cho map, process (g-guide-map, g-guide-process) theo Lớp 1 (b). Process phải dạy kỹ câu bị động và từ nối thứ tự; map phải dạy từ chỉ hướng, vị trí và động từ thay đổi (was replaced by, was extended, was demolished…).
```

```text
Lô L1-grammar: soạn 8 ghi chú ngữ pháp theo Lớp 1 (c).
```

### Lớp 5 — Mô tả band (1 lô)

```text
Lô L5-descriptors: soạn "band_descriptors" (4 tiêu chí × band 4–7) và "self_check_routes" (ít nhất 12 route, trỏ vào id của lớp 1 đã soạn). Chưa soạn band_sets.
```

### Lớp 2 — Bài học có hướng dẫn (1–2 bài mỗi lô, tổng 25 bài)

Mỗi dạng một lô tương ứng; đổi `<dạng>` và số thứ tự:

```text
Lô L2-<dạng>-01: soạn 2 bài lớp 2 cho dạng <dạng>: l-<dạng>-01 (stage foundation, order 1) và l-<dạng>-02 (stage foundation, order 2). Đủ mọi trường, scaffold theo chặng foundation.
```

```text
Lô L2-<dạng>-02: soạn 2 bài lớp 2 cho dạng <dạng>: l-<dạng>-03 (stage developing) và l-<dạng>-04 (stage advanced). Chủ đề khác hai bài trước.
```

Phân bổ gợi ý:

| Dạng | Số bài | Lô |
|---|---|---|
| line | 4 | L2-line-01, L2-line-02 |
| bar | 4 | L2-bar-01, L2-bar-02 |
| pie | 4 | L2-pie-01, L2-pie-02 |
| table | 4 | L2-table-01, L2-table-02 |
| process | 4 | L2-process-01, L2-process-02 (01: linear + cycle; 02: cycle phức tạp + branch) |
| map | 3 | L2-map-01 (2 bài foundation/developing), L2-map-02 (1 bài advanced) |
| mixed | 2 | L2-mixed-01 (developing + advanced) |

### Lớp 4 — Bài luyện ngắn (30–40 câu mỗi lô)

```text
Lô L4-<kỹ năng>-01: soạn 30 bài luyện lớp 4 cho skill "<kỹ năng>", trộn đủ các kind phù hợp, difficulty tăng dần từ 1 đến 5, rải đều các group. Thêm 15 thẻ ôn liên quan.
```

Kỹ năng cần có: `paraphrase`, `overview`, `trend`, `comparison`, `numbers`, `grammar`, `passive`, `sequencing`, `map-language`, `grouping` (10 lô, khoảng 300 bài luyện và 150 thẻ ôn).

### Lớp 5 — Bộ bài 3 mức (1 bộ mỗi lô)

```text
Lô L5-set-<dạng>: soạn 1 band_set cho đề của bài l-<dạng>-02 (dùng lại đúng đề và số liệu đó). Đủ 3 bài band 5, 6, 7 và compare_vi.
```

Làm cho line, bar, pie, table, map, process (6 lô).

### Lớp 3 — Ngân hàng đề (5 đề mỗi lô, làm dần)

```text
Lô L3-<dạng>-<số lô>: soạn 5 đề lớp 3 cho dạng <dạng>, id tiếp nối từ p-<dạng>-<số tiếp theo>, difficulty lần lượt 1, 2, 3, 4, 5. Chủ đề không trùng với các lô trước (danh sách đã dùng: <dán mục 4 của các lô trước>).
```

Mục tiêu: 10–15 đề mỗi dạng (khoảng 80–100 đề, 16–20 lô).

---

## C. Khi nhận lại dữ liệu

Gửi các file JSON cho Claude Code. Claude Code sẽ:
- kiểm tra JSON và id trùng;
- đối chiếu mọi con số trong bài mẫu với số liệu hình;
- đếm lại số từ, kiểm tra trường tiếng Việt bị trống;
- kiểm tra chỗ trống `___` khớp số đáp án;
- tách đáp án ra khỏi dữ liệu học viên;
- rồi mới nạp vào web.
