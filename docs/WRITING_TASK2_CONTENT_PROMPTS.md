# Bộ prompt soạn dữ liệu Writing Task 2 cho người tự học

Dùng với ChatGPT, Claude hoặc Gemini. Cách dùng:

1. Mở một cuộc trò chuyện mới. Dán **Prompt 0 (khung chung)** trước.
2. Dán **một** prompt lớp (1–7), thay các chỗ `{{...}}`.
3. Mỗi lần chỉ xin **một lô nhỏ** như prompt ghi. Lô dài thì AI viết ẩu dần.
4. Lưu kết quả JSON thành file, đặt tên theo mã: `skills/S04.json`, `topics/TP-EDU.json`…
5. Dán **Prompt 8 (kiểm duyệt)** cùng file vừa nhận, để AI tự rà lỗi trước khi bạn đọc.
6. Gửi file cho Claude Code import: script sẽ kiểm tra mã, độ dài, trường thiếu, đáp án lộ ra phía học viên.

Thứ tự soạn nên là: Lớp 1 → Lớp 2 → Lớp 3 → Lớp 5 (lỗi) → Lớp 4 → Lớp 7 → Lớp 6.
Lý do: kỹ năng, chủ đề và lỗi là "từ điển mã" mà đề và bài học trỏ tới.

---

## Prompt 0: khung chung (dán đầu mỗi cuộc trò chuyện)

```text
Bạn là giáo viên IELTS Writing có 10 năm dạy học sinh Việt Nam từ mất gốc đến band 7.5+, đồng thời là người thiết kế học liệu cho người TỰ HỌC (không có giáo viên bên cạnh).

MỤC TIÊU
Soạn dữ liệu cho "Writing Task 2 Lab" của một website học IELTS tiếng Việt. Người học phải:
(1) hiểu được mà không cần hỏi ai, (2) làm được ngay nhờ có mẫu và khung, (3) tự luyện thêm lâu dài nhờ ngân hàng bài tập.

NGUYÊN TẮC SƯ PHẠM (bắt buộc)
- Dạy trước, hỏi sau: mọi bài tự viết phải đi sau ít nhất một ví dụ mẫu và một bài nhận biết/hoàn thành cùng kỹ năng.
- 3 bậc luyện: "recognize" (chọn/nhận biết) → "complete" (điền vào khung) → "produce" (tự viết).
- Gợi ý mở dần 3 bậc: bậc 1 nhắc hướng nghĩ, bậc 2 đưa khung câu/từ khoá, bậc 3 gần như đáp án. Không bậc nào được là câu chung chung kiểu "Đọc kỹ đề".
- Mọi đáp án phải có: câu mẫu thật (không phải lời dặn), giải thích VÌ SAO đúng, ít nhất 1 cách viết khác cũng đúng, 1 lỗi hay gặp kèm cách sửa.
- Không lặp: không dùng lại nguyên văn một gợi ý hoặc giải thích cho hai câu khác nhau.
- Mọi ví dụ phải đúng ngữ pháp, chính tả, viết hoa (ví dụ "I", không phải "i").

NGÔN NGỮ
- Giải thích, gợi ý, nhận xét: tiếng Việt tự nhiên, câu ngắn, xưng "bạn".
- Câu mẫu, đáp án, bài mẫu: tiếng Anh, kèm bản dịch tiếng Việt ở trường "_vi" khi người học ở chặng foundation/basic.
- Thuật ngữ (thesis, topic sentence, paraphrase…) lần đầu xuất hiện phải giải thích bằng tiếng Việt trong ngoặc.

TRÌNH ĐỘ THEO CHẶNG (khớp độ khó câu chữ với chặng)
- foundation (mức luyện 1.0–3.0, ~A1–A2): câu ≤ 12 từ, từ vựng thông dụng, chỉ because/so/and/but; viết 2–3 câu (25–60 từ).
- basic (3.5–4.5, ~A2–B1): câu ≤ 18 từ, thêm although/when/if; viết mở bài + 1 đoạn thân bài (80–150 từ).
- developing (5.0–6.0, ~B1–B2): câu phức đơn giản, mệnh đề quan hệ; bài 250–280 từ.
- advanced (6.5–7.5+, ~B2–C1): nhượng bộ, điều kiện, danh từ hoá vừa phải; bài 270–320 từ.
"Mức luyện" là thang nội bộ, KHÔNG được ghi là band IELTS chính thức.

BẢN QUYỀN
- 100% nội dung tự soạn. Không chép đề, bài mẫu, mô tả band từ Cambridge, IDP, British Council hay sách đã xuất bản. Được phép theo cùng dạng đề và cấu trúc bài.
- Không dùng tên người, trường, thương hiệu có thật trong ví dụ. Số liệu trong ví dụ phải là ví dụ minh hoạ, không ghi như số liệu thật.

ĐỊNH DẠNG ĐẦU RA
- Chỉ trả về MỘT khối JSON hợp lệ (UTF-8), không lời dẫn trước hay sau, không chú thích trong JSON.
- Giữ đúng tên trường và mã (id) như mẫu. Không tự thêm trường.
- Nếu hết độ dài trả lời, dừng ở cuối một phần tử hoàn chỉnh và ghi "next_from": "<id tiếp theo>" ở cuối JSON.

MÃ DÙNG CHUNG (chỉ dùng các mã này)
Chặng: foundation | basic | developing | advanced
Dạng đề: agree_disagree | discuss_both_views | advantages_disadvantages | advantages_outweigh_disadvantages | causes_solutions | problem_solution | double_question
Kỹ năng:
 S01 Đọc và phân tích đề        S02 Paraphrase đề
 S03 Chọn lập trường            S04 Viết thesis
 S05 Tìm và chọn ý              S06 Chuỗi lập luận (ý → vì sao → kết quả → ví dụ)
 S07 Câu chủ đề                 S08 Viết đoạn thân bài
 S09 Ý ngược lại (nhượng bộ, phản bác)   S10 Liên kết câu và đoạn
 S11 Mở bài                     S12 Kết luận
 S13 Từ vựng chính xác (collocation, paraphrase từ)   S14 Câu phức đúng ngữ pháp
 S15 Tự sửa bài
Chủ đề:
 TP-EDU giáo dục, TP-ENV môi trường, TP-TEC công nghệ, TP-HEA sức khoẻ, TP-WRK việc làm,
 TP-CRM tội phạm và pháp luật, TP-TRA giao thông, TP-CIT đô thị và nhà ở, TP-MED truyền thông và quảng cáo,
 TP-FAM gia đình và trẻ em, TP-TOU du lịch, TP-CUL văn hoá và truyền thống, TP-GOV chi tiêu chính phủ,
 TP-GLO toàn cầu hoá, TP-SPO thể thao và giải trí, TP-FOO thực phẩm, TP-ENE năng lượng, TP-SCI khoa học và không gian,
 TP-ART nghệ thuật, TP-AGE người cao tuổi và dân số
Lỗi: ERR-001 … ERR-060 (được định nghĩa ở Lớp 5; chỉ trỏ tới mã đã có).

Trả lời "Đã hiểu khung" rồi chờ yêu cầu tiếp theo.
```

---

## Prompt 1: kiến thức nền (7 dạng đề + cấu trúc bài + tiêu chí)

Chạy 3 lần: (a) dạng đề, mỗi lần 2 dạng; (b) cấu trúc bài; (c) tiêu chí chấm.

```text
LỚP 1A: HƯỚNG DẪN DẠNG ĐỀ. Soạn cho các dạng: {{agree_disagree, discuss_both_views}}.

Mỗi dạng một object:
{
  "type_id": "agree_disagree",
  "name_vi": "Đồng ý / Không đồng ý",
  "recognize_vi": "Cách nhận ra dạng đề: những câu hỏi cuối đề hay gặp…",
  "question_endings_en": ["To what extent do you agree or disagree?", "..."],           // 4–6 cách hỏi
  "what_it_asks_vi": "Đề thật sự yêu cầu bạn làm gì, giải thích như nói với người mới.",
  "positions": [                                                                       // các lập trường hợp lệ
    {"name_vi": "Đồng ý hoàn toàn", "when_vi": "Khi nào nên chọn", "thesis_frame_en": "I completely agree that … because … and …"}
  ],
  "outline_by_stage": {                                                                // dàn bài theo chặng
    "foundation": [{"part_vi": "Câu 1", "does_vi": "Nêu ý kiến", "frame_en": "I agree that …"}],
    "basic": [...], "developing": [...], "advanced": [...]
  },
  "sentence_frames": [{"role_vi": "Mở bài - nêu chủ đề", "frame_en": "…", "example_en": "…", "example_vi": "…"}],   // 10–14 khung
  "traps": [{"trap_vi": "Bàn cả hai phía mà không nói mình đồng ý mức nào", "why_bad_vi": "…", "fix_vi": "…", "error_id": "ERR-0xx"}],  // 4–6 bẫy
  "worked_example": {
    "prompt_en": "Một đề tự soạn thuộc dạng này",
    "prompt_vi": "…",
    "stage": "developing",
    "essay_en": "Bài mẫu 260–280 từ, đoạn cách nhau bằng \n\n",
    "annotations": [{"quote_en": "Câu trích nguyên văn từ bài", "label_vi": "Thesis", "note_vi": "Vì sao câu này làm tốt vai trò của nó"}]   // chú thích từng câu chức năng, 10–16 mục
  }
}
Trả về: {"question_types": [ ... ]}
```

```text
LỚP 1B: CẤU TRÚC BÀI VÀ ĐOẠN VĂN.
Soạn JSON:
{
  "essay_structure": {
    "overview_vi": "Một bài Task 2 gồm những phần nào, mỗi phần dài bao nhiêu, theo từng chặng",
    "parts": [{"id": "intro|body|conclusion", "name_vi": "…", "purpose_vi": "…", "length_by_stage": {"foundation": "…", "basic": "…", "developing": "…", "advanced": "…"},
               "must_have_vi": ["…"], "must_avoid_vi": ["…"], "example_en": "…", "example_vi": "…"}]
  },
  "paragraph_model": {
    "name_vi": "Mô hình đoạn thân bài: Câu chủ đề → Giải thích → Kết quả → Ví dụ → Câu chốt",
    "steps": [{"id": "topic|explain|result|example|link", "name_vi": "…", "job_vi": "…", "frames_en": ["…"], "bad_en": "…", "good_en": "…", "why_vi": "…"}],
    "full_example_en": "Một đoạn hoàn chỉnh 90–110 từ", "full_example_vi": "…"
  },
  "glossary": [{"term": "thesis", "vi": "câu nêu lập trường", "explain_vi": "Giải thích 1–2 câu cho người mới", "example_en": "…"}]   // 20–25 thuật ngữ
}
```

```text
LỚP 1C: TIÊU CHÍ CHẤM, DIỄN GIẢI CHO NGƯỜI TỰ HỌC.
Không chép mô tả band chính thức. Tự diễn giải bằng lời của giáo viên.
{
  "criteria": [
    {"id": "TR|CC|LR|GRA", "name_vi": "…", "name_en": "Task Response", "plain_vi": "Tiêu chí này hỏi bạn điều gì, nói bằng lời đơn giản",
     "levels": [{"level": "4|5|6|7", "looks_like_vi": "Bài ở mức này thường…", "example_en": "Một câu/đoạn ngắn minh hoạ mức này", "to_next_vi": "Muốn lên mức sau, làm gì cụ thể"}],
     "self_check_by_stage": {"foundation": ["2–3 câu hỏi tự kiểm, phù hợp đoạn 2–3 câu"], "basic": ["…"], "developing": ["…"], "advanced": ["…"]}}
  ]
}
```

---

## Prompt 2: ngân hàng kỹ năng (mỗi lần 1 kỹ năng, mỗi lô 15 câu luyện)

```text
LỚP 2: KỸ NĂNG {{S04 Viết thesis}}. Lô câu luyện số {{1}} (15 câu).
Lô 1 gồm bài giảng + 15 câu luyện. Lô 2 chỉ thêm 15 câu luyện mới, id nối tiếp, không trùng đề và chủ đề với lô 1.

Phân bổ 15 câu: 5 recognize, 5 complete, 5 produce.
Phân bổ chặng: 4 foundation, 4 basic, 4 developing, 3 advanced.
Trải đều ít nhất 5 dạng đề và 8 chủ đề khác nhau.

{
  "skill_id": "S04",
  "lesson": {                                     // chỉ có ở lô 1
    "name_vi": "Viết thesis",
    "why_vi": "Vì sao kỹ năng này quan trọng, nó ảnh hưởng tiêu chí nào",
    "explain_vi": "Giải thích từng bước, 120–200 từ, như đang giảng cho người mới",
    "steps_vi": ["Bước 1 …", "Bước 2 …"],
    "frames_by_type": [{"type_id": "agree_disagree", "frame_en": "…", "example_en": "…", "example_vi": "…"}],   // cho cả 7 dạng
    "good_vs_bad": [{"bad_en": "…", "good_en": "…", "why_vi": "…"}],                                          // 3 cặp
    "summary_vi": ["3 ý cần nhớ"]
  },
  "items": [
    {
      "id": "S04-001",
      "level": "recognize | complete | produce",
      "stage": "foundation",
      "type_id": "agree_disagree",
      "topic_id": "TP-TRA",
      "prompt_en": "Đề ngắn tự soạn (1–2 câu) làm ngữ cảnh", "prompt_vi": "…",
      "question_vi": "Yêu cầu cụ thể của câu luyện",

      // recognize: trắc nghiệm 3–4 phương án, chỉ 1 đúng; mỗi phương án sai phải là lỗi người học thật hay mắc
      "options": [{"id": "a", "text_en": "…", "correct": true, "feedback_vi": "Vì sao đúng / vì sao sai"}],

      // complete: khung có chỗ trống ___ ; bank là các từ gợi ý (có thể có từ gây nhiễu)
      "frame_en": "I agree that ___ because ___.", "word_bank_en": ["…"],

      // produce: để trống options và frame_en
      "hints": ["Bậc 1: hướng nghĩ", "Bậc 2: khung câu hoặc từ khoá", "Bậc 3: gần như đáp án"],
      "answer_en": "Đáp án mẫu hoàn chỉnh", "answer_vi": "…",
      "why_vi": "Vì sao đáp án đạt yêu cầu, chỉ ra từng phần",
      "alternatives_en": ["Một cách viết khác cũng đúng"],
      "common_mistake": {"wrong_en": "…", "fix_en": "…", "why_vi": "…", "error_id": "ERR-0xx"},
      "self_check_vi": ["1–2 câu hỏi để người học tự so bài mình với đáp án"]
    }
  ]
}
Với recognize: bỏ trống frame_en, word_bank_en. Với complete: options = [].
```

---

## Prompt 3: chủ đề (mỗi lần 1 chủ đề)

```text
LỚP 3: CHỦ ĐỀ {{TP-EDU giáo dục}}.
{
  "topic_id": "TP-EDU",
  "name_vi": "Giáo dục",
  "subtopics_vi": ["5–8 tiểu chủ đề hay ra thi"],
  "vocabulary": [                                                   // 30 mục; 10 foundation/basic, 12 developing, 8 advanced
    {"id": "TP-EDU-V01", "phrase_en": "tuition fees", "pos": "noun phrase", "meaning_vi": "học phí", "stage": "basic",
     "collocations_en": ["pay tuition fees", "rising tuition fees"],
     "example_en": "Câu ví dụ đúng văn phong Task 2", "example_vi": "…",
     "paraphrases_en": ["the cost of studying"], "mistake_vi": "Lỗi người Việt hay mắc với cụm này (nếu có)"}
  ],
  "idea_bank": [                                                    // 12–16 ý, chia ủng hộ/phản đối/nguyên nhân/giải pháp
    {"id": "TP-EDU-I01", "claim_en": "Free university education widens access.", "claim_vi": "…",
     "use_for": ["agree_disagree", "advantages_disadvantages"], "side": "for | against | cause | solution | effect",
     "chain_en": {"because": "…", "result": "…", "example": "…"}, "chain_vi": "…",
     "counter_en": "Một phản biện người khác có thể đưa ra", "rebuttal_en": "Cách đáp lại phản biện đó"}
  ],
  "prompts_seed": ["8 đề tự soạn thuộc chủ đề này, trải đủ 7 dạng đề (chỉ câu đề tiếng Anh)"]
}
```

---

## Prompt 4: ngân hàng đề (mỗi lô 5 đề)

Chia 2 hạng. Đề lõi có bài mẫu 3 mức; đề mở rộng chỉ có phân tích + dàn ý.

```text
LỚP 4: NGÂN HÀNG ĐỀ. Lô {{P-001…P-005}}, hạng {{core | extended}}.
Đề lấy từ "prompts_seed" của chủ đề {{TP-EDU}} (đã soạn ở Lớp 3), dùng lại ý trong idea_bank bằng mã.

{
  "prompts": [
    {
      "id": "P-001", "tier": "core", "type_id": "discuss_both_views", "topic_id": "TP-EDU", "difficulty": "developing",
      "prompt_en": "Đề hoàn chỉnh, đúng văn phong Task 2", "prompt_vi": "…",
      "analysis": {
        "keywords": [{"en": "…", "vi": "…", "why_vi": "Vì sao từ này quan trọng"}],
        "task_vi": "Đề yêu cầu chính xác những phần nào",
        "trap_vi": "Bẫy dễ mắc nhất ở đề này", "error_ids": ["ERR-0xx"]
      },
      "ideas": [{"idea_id": "TP-EDU-I03", "use_vi": "Dùng ý này ở đoạn nào, vì sao hợp đề"}],
      "outline_vi": [{"part": "intro|body1|body2|conclusion", "plan_vi": "…", "plan_en": "Câu chủ đề dự kiến"}],
      "useful_vocab_ids": ["TP-EDU-V04"],
      // chỉ hạng core:
      "models": [
        {"level": "5", "word_count": 0, "essay_en": "…", "teacher_comment_vi": "Vì sao ở mức này: điểm được và điểm thiếu theo 4 tiêu chí",
         "annotations": [{"quote_en": "…", "label_vi": "…", "note_vi": "…"}]},
        {"level": "6.5", "...": "..."},
        {"level": "7.5", "...": "..."}
      ],
      "upgrade_notes_vi": ["Từ bài mức 5 lên mức 6.5 đã đổi những gì (3–5 điểm cụ thể, trích câu trước/sau)"]
    }
  ]
}
word_count phải là số từ thật của essay_en. Ba bài mẫu cùng dàn ý để người học so sánh được.
```

---

## Prompt 5: ngân hàng lỗi và bài nhiều mức có nhận xét

```text
LỚP 5A: NGÂN HÀNG LỖI. Lô {{ERR-001…ERR-015}}.
Ưu tiên lỗi học sinh Việt Nam thật sự hay mắc. Trải đủ 4 tiêu chí.
{
  "errors": [
    {"id": "ERR-001", "criterion": "TR|CC|LR|GRA", "name_vi": "Không nêu rõ lập trường", "stages": ["foundation", "basic"],
     "explain_vi": "Lỗi này là gì, vì sao bị trừ điểm",
     "examples": [{"wrong_en": "…", "right_en": "…", "why_vi": "…"}],                  // 3 cặp, ngữ cảnh khác nhau
     "how_to_spot_vi": "Cách tự phát hiện lỗi này trong bài mình",
     "drills": [{"id": "ERR-001-D1", "task_vi": "Sửa câu sau", "wrong_en": "…", "answer_en": "…", "why_vi": "…"}],   // 3 câu luyện sửa
     "skill_ids": ["S04"]}
  ]
}
```

```text
LỚP 5B: BỘ BÀI NHIỀU MỨC CÓ NHẬN XÉT. Đề: {{P-00x}}.
Soạn 4 bài "học sinh" tự soạn cho CÙNG một đề, ở mức 4, 5, 6, 7. Bài phải giống bài người học thật viết, có lỗi tự nhiên của mức đó, không phải bài mẫu.
{
  "prompt_id": "P-00x",
  "scripts": [
    {"level": "5", "essay_en": "…", "word_count": 0,
     "by_criterion": [{"criterion": "TR", "comment_vi": "…", "evidence_en": "Trích câu trong bài"}],
     "errors": [{"quote_en": "…", "error_id": "ERR-0xx", "fix_en": "…"}],
     "top3_actions_vi": ["3 việc cụ thể để bài này lên mức tiếp theo"]}
  ]
}
```

---

## Prompt 6: lộ trình, kiểm tra đầu vào, điều kiện qua

```text
LỚP 6: LỘ TRÌNH.
{
  "placement": {                                         // 12–15 câu, làm trong 15 phút, không cần viết bài dài
    "items": [{"id": "PL-01", "skill_id": "S01", "kind": "choice|short_write", "question_vi": "…", "options": [...], "answer": "…",
               "rubric_vi": "Với short_write: thế nào là đạt"}],
    "result_rules": [{"if_vi": "Đúng ≤ 4 câu", "start_stage": "foundation", "advice_vi": "…"}]
  },
  "mastery": [{"skill_id": "S04", "stage": "basic", "rule_vi": "Đạt 8/10 câu produce và tự kiểm đủ 2 tiêu chí", "unlocks": ["S07"]}],
  "review_schedule_vi": "Lịch ôn lặp lại: từ vựng và lỗi sai ôn sau 1, 3, 7, 14 ngày",
  "timed_progression": [{"stage": "developing", "steps_vi": ["Không giới hạn", "60 phút", "50 phút", "40 phút"], "move_on_when_vi": "…"}],
  "weekly_plans": [{"stage": "foundation", "hours_per_week": 3, "days": [{"day": 1, "tasks_vi": ["…"], "items": ["S01-001", "TP-EDU-V01"]}]}]
}
```

---

## Prompt 7: soạn dày 36 bài học có sẵn (mỗi lần 1 bài)

Dán kèm JSON của bài đó (lấy từ `content/writing-task2/lessons.json` và `answers.json`).

```text
LỚP 7: SOẠN LẠI BÀI HỌC. Dưới đây là dữ liệu gốc của bài {{T2-M113-01}}:
{{dán JSON bài học + đáp án}}

Giữ nguyên: id, prompt, stage, question_type, topic, và các drill id. Soạn lại cho người tự học theo 9 phần:
{
  "lesson_id": "T2-M113-01",
  "topic_id": "TP-...",                                  // chọn mã chủ đề gần nhất
  "skill_ids": ["S01", "S04", "S06"],                    // kỹ năng bài này dạy
  "goal_vi": "Sau bài này bạn viết được… (cụ thể, đo được)",
  "prompt_vi": "Bản dịch đề",
  "prompt_analysis": {"keywords": [{"en": "…", "vi": "…"}], "task_vi": "…", "trap_vi": "…"},
  "mini_lesson": {"explain_vi": "Bài giảng 150–250 từ cho kỹ năng chính", "frame_en": "…", "worked_example_en": "…", "worked_example_vi": "…",
                  "annotations": [{"quote_en": "…", "label_vi": "…", "note_vi": "…"}], "good_vs_bad": [{"bad_en": "…", "good_en": "…", "why_vi": "…"}]},
  "vocabulary": [{"phrase_en": "…", "meaning_vi": "…", "example_en": "…", "example_vi": "…", "collocations_en": ["…"]}],   // 8–12 mục
  "grammar_focus": {"name_vi": "Nối lý do bằng because/so", "explain_vi": "…", "examples": [{"en": "…", "vi": "…"}],
                    "drills": [{"task_vi": "…", "answer_en": "…"}]},                                                  // 3 câu
  "steps": [{"title_vi": "…", "instruction_vi": "…", "sample_en": "…", "sample_vi": "…"}],                            // giữ 4 bước, viết đầy đủ
  "drills": [                                                                                                          // giữ đúng drill id gốc, theo thứ tự gốc
    {"id": "T2-M113-01-D1", "level": "recognize|complete|produce",
     "how_to_vi": "Cách làm dạng câu này (2–3 câu)", "question_vi": "…",
     "options": [...], "frame_en": "…", "word_bank_en": [...],
     "hints": ["bậc 1", "bậc 2", "bậc 3"],
     "answer_en": "…", "answer_vi": "…", "why_vi": "…", "alternatives_en": ["…"],
     "common_mistake": {"wrong_en": "…", "fix_en": "…", "why_vi": "…", "error_id": "ERR-0xx"}}
  ],
  "model": {"kind": "paragraph|intro_body|essay", "text_en": "Đúng độ dài chặng", "text_vi": "chỉ foundation/basic", "word_count": 0,
            "annotations": [{"quote_en": "…", "label_vi": "…", "note_vi": "…"}]},
  "self_check_vi": ["4–6 câu tự kiểm phù hợp chặng"],
  "review": {"remember_vi": ["3 ý chính"], "mistakes_vi": ["3 lỗi cần nhớ"], "next_practice": ["S04-00x", "P-00x"]}
}
Chặng foundation: ít nhất một nửa số drill là recognize hoặc complete. Không drill produce nào được đứng trước bài mẫu cùng kỹ năng.
Sửa mọi đáp án gốc đang là lời dặn ("Keep…", "Explain…") thành câu mẫu thật. Drill tự sửa bài phải có câu trước và câu sau khi sửa.
```

---

## Prompt 8: kiểm duyệt (dán sau mỗi lô)

```text
Bạn là người duyệt học liệu khó tính. Rà JSON dưới đây theo đúng Prompt 0 và prompt lớp tương ứng. KHÔNG viết lại toàn bộ.
Trả về JSON:
{
  "valid_json": true,
  "issues": [{"id": "S04-007", "field": "answer_en", "problem_vi": "…", "fix": "Giá trị sửa đề xuất"}],
  "checks": {
    "grammar_spelling_errors": 0,            // sai ngữ pháp/chính tả/viết hoa trong tiếng Anh
    "level_mismatch": 0,                     // câu chữ khó hơn chặng
    "generic_hints": 0,                      // gợi ý chung chung hoặc lặp nguyên văn
    "answers_that_are_instructions": 0,      // đáp án là lời dặn chứ không phải câu mẫu
    "word_count_wrong": 0,                   // word_count lệch số từ thật
    "unknown_ids": 0,                        // trỏ tới mã không có trong danh sách
    "copied_or_real_names": 0,               // giống tài liệu đã xuất bản, tên/thương hiệu thật
    "teach_before_ask_violations": 0
  }
}
JSON cần duyệt:
{{dán JSON}}
```

---

## Khối lượng tham khảo

| Lớp | Tối thiểu | Đầy đủ | Số lần chạy prompt (tối thiểu) |
|---|---|---|---|
| 1. Kiến thức nền | 7 dạng + cấu trúc + tiêu chí | như tối thiểu | 6 |
| 2. Kỹ năng | 15 × 15 câu | 15 × 30 câu | 15 |
| 3. Chủ đề | 10 chủ đề | 20 chủ đề | 10 |
| 4. Đề | 80 đề, 20 core | 300 đề, 50 core | 16 |
| 5. Lỗi + bài nhiều mức | 30 lỗi + 3 bộ | 60 lỗi + 10 bộ | 5 |
| 6. Lộ trình | 1 | 1 | 1 |
| 7. 36 bài học | 36 | 36 | 36 |
