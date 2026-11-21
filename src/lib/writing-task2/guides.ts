/*
 * Writing Task 2 Lab: the teaching that comes with the lab itself. Every drill kind, question type and
 * stage has a short "how to" here, so a lesson teaches before it asks even when its own data is thin.
 * An enrichment file (content/writing-task2/enrich) overrides these per lesson.
 */
import type { Task2Drill, Task2DrillLevel, Task2Stage } from "./types";

export type DrillGuide = {
  name: string;
  /** One sentence: what this drill trains. */
  what_vi: string;
  /** Two or three concrete steps. */
  steps_vi: string[];
  /** Hint 1: where to look first. */
  think_vi: string;
  /** Hint 2: a sentence frame, per question type when it differs. */
  frame_en: string | Partial<Record<string, string>> & { default: string };
  /** Drills answered in Vietnamese (naming a mistake) say so. */
  answer_lang?: "vi";
};

const thesisFrames = {
  default: "I agree that ___ because ___ and ___.",
  agree_disagree: "I agree that ___ because ___ and ___.",
  discuss_both_views: "While some people believe ___, I think ___ because ___.",
  advantages_disadvantages: "This has clear benefits, such as ___, but it also causes problems, such as ___.",
  advantages_outweigh_disadvantages: "Although ___, I believe the advantages outweigh the disadvantages because ___.",
  causes_solutions: "This problem is mainly caused by ___, and it can be reduced by ___.",
  problem_solution: "The main problem is ___, and the most practical solution is ___.",
  double_question: "This happens mainly because ___, and I think it is a positive development because ___.",
};

export const drillGuides: Record<string, DrillGuide> = {
  identify: {
    name: "Đọc đề",
    what_vi: "Biết chính xác đề hỏi gì trước khi nghĩ ý. Sai bước này thì cả bài lạc đề.",
    steps_vi: ["Đọc câu hỏi ở cuối đề trước (To what extent…?, Discuss both views…?).", "Gạch chân chủ đề và các từ giới hạn như free, all, only, should.", "Viết một câu: đề muốn bạn làm gì, về chuyện gì."],
    think_vi: "Câu cuối của đề mới là câu hỏi thật. Nó yêu cầu nêu ý kiến, bàn hai phía, hay trả lời hai câu hỏi?",
    frame_en: "The question asks me to ___ (give my opinion / discuss both views / explain causes and solutions) about ___.",
  },
  paraphrase: {
    name: "Paraphrase đề",
    what_vi: "Viết lại ý của đề bằng từ của bạn, dùng làm câu đầu của mở bài.",
    steps_vi: ["Giữ nguyên ý chính: ai, làm gì, ở đâu.", "Đổi một vài từ sang từ cùng nghĩa, ví dụ important → essential, people → individuals, should → ought to.", "Không thêm ý kiến hay chi tiết mới."],
    think_vi: "Đổi cách mở câu của đề (ví dụ dùng 'It is often argued that…' hoặc 'Many people believe…'), rồi viết phần còn lại bằng từ khác.",
    frame_en: "It is often argued that ___ should ___.",
  },
  idea: {
    name: "Tìm ý",
    what_vi: "Tìm hai ý khác nhau. Mỗi ý sẽ thành một đoạn (hoặc một câu ở chặng Nền tảng).",
    steps_vi: ["Tự hỏi: ai được lợi, ai bị ảnh hưởng? Về tiền, thời gian, sức khoẻ, môi trường hay xã hội?", "Chọn hai ý không trùng nhau, cùng trả lời đúng câu hỏi.", "Viết mỗi ý thành một câu ngắn, có chủ ngữ và động từ."],
    think_vi: "Thử hai góc khác nhau: một ý về tiền hoặc thời gian, một ý về con người hoặc môi trường.",
    frame_en: "Idea A: ___. Idea B: ___.",
  },
  thesis: {
    name: "Viết thesis",
    what_vi: "Thesis là câu nêu lập trường của bạn, thường ở cuối mở bài. Người chấm đọc câu này để biết cả bài đi về đâu.",
    steps_vi: ["Chọn lập trường và giữ nó đến hết bài.", "Nêu luôn hai lý do bạn sẽ viết ở thân bài.", "Không thêm lý do mới mà thân bài không nói tới."],
    think_vi: "Trả lời thẳng câu hỏi của đề trong một câu, rồi thêm 'because' và hai ý bạn đã tìm.",
    frame_en: thesisFrames,
  },
  topic_sentence: {
    name: "Câu chủ đề",
    what_vi: "Câu đầu của đoạn thân bài, nói ý chính của cả đoạn. Các câu sau chỉ giải thích và chứng minh nó.",
    steps_vi: ["Lấy một ý từ thesis.", "Nói ý đó trong một câu rõ, chưa cần ví dụ.", "Câu sau giải thích vì sao ý đó đúng."],
    think_vi: "Nếu người đọc chỉ đọc câu này, họ có biết đoạn văn nói về điều gì không?",
    frame_en: "The main reason is that ___. This is because ___.",
  },
  causal_chain: {
    name: "Chuỗi lập luận",
    what_vi: "Một ý mạnh cần ba phần: ý chính → vì sao → ví dụ. Thiếu phần giải thích thì ví dụ không chứng minh được gì.",
    steps_vi: ["Câu 1: nêu ý chính.", "Câu 2: giải thích vì sao ý đó dẫn tới kết quả (because, this means that).", "Câu 3: một ví dụ cụ thể, nhỏ và đời thường (For example, …)."],
    think_vi: "Lấy Ý A của bạn. Hỏi 'Tại sao lại như vậy?' rồi 'Ví dụ cụ thể là gì?'.",
    frame_en: "___. This is because ___. For example, ___.",
  },
  example_check: {
    name: "Kiểm tra ví dụ",
    what_vi: "Ví dụ tốt chứng minh lý do. Ví dụ kém chỉ lặp lại lý do bằng câu khác.",
    steps_vi: ["Đọc lý do của bạn, rồi đọc ví dụ.", "Hỏi: ví dụ có cho thấy một tình huống cụ thể (ai, làm gì, kết quả gì) không?", "Nếu chỉ lặp lại lý do, thay bằng một tình huống cụ thể."],
    think_vi: "Ví dụ cụ thể thường có một người, một hành động và một kết quả nhìn thấy được.",
    frame_en: "For example, a ___ could ___, so ___.",
  },
  second_side: {
    name: "Ý thứ hai",
    what_vi: "Đoạn thứ hai cần phát triển riêng như đoạn đầu: có câu chủ đề, giải thích và ví dụ, không lặp lại ý đầu.",
    steps_vi: ["Mở đoạn bằng ý B (Another reason… / On the other hand…).", "Giải thích ý B bằng một lý do mới.", "Thêm một ví dụ khác ví dụ ở đoạn đầu."],
    think_vi: "Lấy Ý B của bạn và làm lại đúng ba phần như chuỗi lập luận đầu tiên.",
    frame_en: { default: "Another reason is that ___. As a result, ___. For instance, ___.", discuss_both_views: "On the other hand, some people believe ___. This is because ___. For instance, ___." },
  },
  nuance: {
    name: "Giới hạn lập luận",
    what_vi: "Thêm một điều kiện làm lập luận chính xác hơn, cho thấy bạn suy nghĩ kỹ. Nó không được lật ngược lập trường.",
    steps_vi: ["Hỏi: ý của mình đúng trong trường hợp nào, cần điều kiện gì?", "Viết một câu bắt đầu bằng However hoặc That said.", "Giữ nguyên lập trường của thesis."],
    think_vi: "Ý tưởng này cần gì để thành công: tiền, quy định, địa điểm an toàn, hay sự tham gia của ai?",
    frame_en: "However, this only works if ___.",
  },
  diagnose: {
    name: "Tìm lỗi",
    what_vi: "Đoán trước lỗi dễ mắc nhất với đề này để tránh khi viết.",
    steps_vi: ["Nghĩ: nếu viết vội, mình dễ trả lời lệch ở đâu?", "Lỗi Task Response hay gặp: quên nêu ý kiến, chỉ trả lời một nửa đề, ví dụ không liên quan.", "Viết lỗi đó thành một câu ngắn, có thể bằng tiếng Việt."],
    think_vi: "Nhìn lại câu hỏi của đề: phần nào người viết dễ bỏ quên nhất?",
    frame_en: "A common mistake is to ___ instead of ___.",
    answer_lang: "vi",
  },
  self_revision: {
    name: "Tự sửa bài",
    what_vi: "Đọc lại và sửa câu khẳng định quá mức, để kết luận khớp với thesis.",
    steps_vi: ["So kết luận với thesis: có cùng lập trường không?", "Tìm từ tuyệt đối như always, never, everyone, all.", "Đổi sang often, many, most, can, rồi viết lại câu."],
    think_vi: "Câu nào nói 'mọi người' hay 'luôn luôn'? Điều đó có thật sự đúng với tất cả không?",
    frame_en: "Before: ___ → After: ___",
  },
  short_write: {
    name: "Viết ngắn",
    what_vi: "Viết một hoặc hai câu tiếng Anh theo đúng yêu cầu.",
    steps_vi: ["Đọc kỹ yêu cầu.", "Viết một hoặc hai câu ngắn, rõ ý.", "So với gợi ý tham khảo và sửa một chỗ."],
    think_vi: "Viết câu đơn giản nhất mà vẫn đúng yêu cầu. Câu đúng quan trọng hơn câu dài.",
    frame_en: "___ because ___.",
  },
};

/** The guide for a drill. M112 lessons use one generic mode; their question says what the drill really trains. */
export function guideFor(drill: Pick<Task2Drill, "mode" | "question_vi">): DrillGuide {
  if (drill.mode !== "short_write") return drillGuides[drill.mode] ?? drillGuides.short_write;
  const question = drill.question_vi.toLowerCase();
  if (/paraphrase|viết lại đề/.test(question)) return drillGuides.paraphrase;
  if (/thesis/.test(question)) return drillGuides.thesis;
  if (/câu chủ đề/.test(question)) return drillGuides.topic_sentence;
  if (/ví dụ/.test(question)) return drillGuides.example_check;
  return drillGuides.short_write;
}

export const frameFor = (guide: DrillGuide, questionType: string) =>
  typeof guide.frame_en === "string" ? guide.frame_en : guide.frame_en[questionType] ?? guide.frame_en.default;

export const drillLevel = (drill: Pick<Task2Drill, "level" | "options" | "frame_en">): Task2DrillLevel =>
  drill.level ?? (drill.options?.length ? "recognize" : drill.frame_en ? "complete" : "produce");

export const levelLabels: Record<Task2DrillLevel, { name: string; hint: string }> = {
  recognize: { name: "Nhận biết", hint: "Chọn phương án đúng" },
  complete: { name: "Hoàn thành", hint: "Điền vào khung câu" },
  produce: { name: "Tự viết", hint: "Viết bằng lời của bạn" },
};

export type TypeGuide = { asks_vi: string; plan_vi: string[]; trap_vi: string };
export const typeGuides: Record<string, TypeGuide> = {
  agree_disagree: {
    asks_vi: "Nói rõ bạn đồng ý đến mức nào, rồi giữ một lập trường suốt bài.",
    plan_vi: ["Mở bài: nhắc lại đề + nêu lập trường", "Thân bài 1: lý do 1, giải thích, ví dụ", "Thân bài 2: lý do 2 (hoặc giới hạn nếu bạn chỉ đồng ý một phần)", "Kết luận: nhắc lại lập trường"],
    trap_vi: "Bàn cả hai phía mà không nói mình đồng ý mức nào.",
  },
  discuss_both_views: {
    asks_vi: "Trình bày cả hai quan điểm, rồi nói bạn nghiêng về bên nào.",
    plan_vi: ["Mở bài: nêu hai quan điểm + ý kiến của bạn", "Thân bài 1: quan điểm thứ nhất và lý do", "Thân bài 2: quan điểm thứ hai và lý do", "Kết luận: nhắc lại bạn nghiêng về bên nào"],
    trap_vi: "Chỉ bàn một quan điểm, hoặc quên nêu ý kiến của mình.",
  },
  advantages_disadvantages: {
    asks_vi: "Nêu cả lợi ích và bất lợi, mỗi bên có giải thích.",
    plan_vi: ["Mở bài: nhắc lại đề + nói sẽ bàn cả lợi và hại", "Thân bài 1: lợi ích chính", "Thân bài 2: bất lợi chính", "Kết luận: tóm tắt hai bên"],
    trap_vi: "Chỉ viết một bên, hoặc liệt kê nhiều ý mà không giải thích ý nào.",
  },
  advantages_outweigh_disadvantages: {
    asks_vi: "Cân lợi và hại, rồi kết luận bên nào lớn hơn.",
    plan_vi: ["Mở bài: nêu bên nào lớn hơn", "Thân bài 1: bên yếu hơn (thừa nhận ngắn gọn)", "Thân bài 2: bên mạnh hơn và vì sao nó quan trọng hơn", "Kết luận: nhắc lại bên nào lớn hơn"],
    trap_vi: "Nêu lợi và hại nhưng không nói bên nào lớn hơn.",
  },
  causes_solutions: {
    asks_vi: "Giải thích nguyên nhân, rồi đề xuất giải pháp khớp với từng nguyên nhân.",
    plan_vi: ["Mở bài: nhắc lại vấn đề + nói sẽ nêu nguyên nhân và giải pháp", "Thân bài 1: một hoặc hai nguyên nhân", "Thân bài 2: giải pháp cho đúng các nguyên nhân đó", "Kết luận: tóm tắt"],
    trap_vi: "Giải pháp không khớp nguyên nhân đã nêu.",
  },
  problem_solution: {
    asks_vi: "Nêu vấn đề cụ thể và giải pháp làm được.",
    plan_vi: ["Mở bài: nhắc lại tình huống", "Thân bài 1: vấn đề chính và hậu quả", "Thân bài 2: giải pháp, ai làm, làm thế nào", "Kết luận: tóm tắt"],
    trap_vi: "Chỉ mô tả vấn đề, giải pháp chung chung không làm được.",
  },
  double_question: {
    asks_vi: "Đề có hai câu hỏi. Trả lời cả hai, mỗi câu một đoạn.",
    plan_vi: ["Mở bài: trả lời ngắn cả hai câu hỏi", "Thân bài 1: câu hỏi thứ nhất", "Thân bài 2: câu hỏi thứ hai", "Kết luận: nhắc lại hai câu trả lời"],
    trap_vi: "Trả lời kỹ câu đầu, bỏ quên câu thứ hai.",
  },
};

/** What each stage teaches and who it is for, in the words a learner uses to place themselves. */
export const stageAbout: Record<Task2Stage, { who_vi: string; learn_vi: string }> = {
  foundation: { who_vi: "Mới bắt đầu, viết một câu tiếng Anh còn khó", learn_vi: "Đọc hiểu đề, nêu ý kiến trong một câu, thêm lý do và ví dụ." },
  basic: { who_vi: "Viết được câu đơn, chưa viết được đoạn", learn_vi: "Viết mở bài 2 câu và một đoạn thân bài có giải thích, ví dụ." },
  developing: { who_vi: "Viết được đoạn, chưa viết trọn một bài", learn_vi: "Lập dàn ý, viết bài 250 từ với hai đoạn thân bài liên kết." },
  advanced: { who_vi: "Đã viết được bài, muốn lên 6.5+", learn_vi: "Lập luận có điều kiện, phản biện, kết luận chặt; viết trong 40 phút." },
};

export type StageWriting ={ ask_vi: string; outline: { part_vi: string; frame_en: string }[] };
export const stageWriting: Record<Task2Stage, StageWriting> = {
  foundation: {
    ask_vi: "Viết 2–3 câu (khoảng 40 từ). Không giới hạn thời gian.",
    outline: [
      { part_vi: "Câu 1 · Ý kiến", frame_en: "I agree that ___." },
      { part_vi: "Câu 2 · Lý do", frame_en: "This is because ___." },
      { part_vi: "Câu 3 · Ví dụ", frame_en: "For example, ___." },
    ],
  },
  basic: {
    ask_vi: "Viết mở bài 2 câu và một đoạn thân bài 65–85 từ (khoảng 120 từ).",
    outline: [
      { part_vi: "Mở bài · Nhắc lại đề", frame_en: "These days, many people think that ___." },
      { part_vi: "Mở bài · Lập trường", frame_en: "I believe that ___ because ___." },
      { part_vi: "Thân bài · Câu chủ đề", frame_en: "The main reason is that ___." },
      { part_vi: "Thân bài · Giải thích", frame_en: "This means that ___." },
      { part_vi: "Thân bài · Ví dụ", frame_en: "For example, ___." },
    ],
  },
  developing: {
    ask_vi: "Viết bài 250+ từ: mở bài, hai đoạn thân bài, kết luận. Lúc đầu cứ viết trong 50–60 phút.",
    outline: [
      { part_vi: "Mở bài", frame_en: "It is often argued that ___. I believe that ___ because ___ and ___." },
      { part_vi: "Thân bài 1", frame_en: "The main reason is that ___. This is because ___. For example, ___." },
      { part_vi: "Thân bài 2", frame_en: "Another reason is that ___. As a result, ___. For instance, ___." },
      { part_vi: "Kết luận", frame_en: "In conclusion, I believe that ___ because ___." },
    ],
  },
  advanced: {
    ask_vi: "Viết bài 250–300 từ trong 40 phút, có ý ngược lại hoặc điều kiện.",
    outline: [
      { part_vi: "Mở bài", frame_en: "It is often argued that ___. While ___, I believe that ___." },
      { part_vi: "Thân bài 1", frame_en: "The strongest argument for this is that ___. This is because ___. For example, ___." },
      { part_vi: "Thân bài 2", frame_en: "Admittedly, ___. However, ___, so ___." },
      { part_vi: "Kết luận", frame_en: "In conclusion, although ___, I believe that ___." },
    ],
  },
};

/** A self-check sized to what each stage writes: a short paragraph is not marked against a full essay. */
export type CheckItem = { id: string; criterion: "TR" | "CC" | "LR" | "GRA"; text: string };
const fullEssayChecks: CheckItem[] = [
  { id: "tr-parts", criterion: "TR", text: "Trả lời đủ mọi phần của đề, đúng dạng câu hỏi." },
  { id: "tr-position", criterion: "TR", text: "Lập trường (thesis) rõ ở mở bài và nhất quán đến kết luận." },
  { id: "tr-support", criterion: "TR", text: "Mỗi ý chính có giải thích và ví dụ cụ thể." },
  { id: "cc-paragraph", criterion: "CC", text: "Mỗi đoạn thân bài tập trung vào một ý, có câu chủ đề." },
  { id: "cc-links", criterion: "CC", text: "Liên kết câu và đoạn tự nhiên, không lạm dụng từ nối." },
  { id: "lr-range", criterion: "LR", text: "Dùng từ đúng chủ đề, có paraphrase, ít lặp từ." },
  { id: "gra-range", criterion: "GRA", text: "Có câu phức đúng ngữ pháp, không chỉ câu đơn." },
  { id: "gra-check", criterion: "GRA", text: "Đã đọc lại để sửa thì, mạo từ, số ít/số nhiều và chính tả." },
];
export const stageChecklists: Record<Task2Stage, CheckItem[]> = {
  foundation: [
    { id: "f-opinion", criterion: "TR", text: "Câu đầu nói rõ bạn đồng ý hay không đồng ý." },
    { id: "f-reason", criterion: "CC", text: "Có một lý do, nối bằng because hoặc so." },
    { id: "f-example", criterion: "TR", text: "Có một ví dụ cụ thể (For example, …) đúng chủ đề của đề." },
    { id: "f-sentence", criterion: "GRA", text: "Mỗi câu có chủ ngữ và động từ; viết hoa đầu câu và chữ I." },
  ],
  basic: [
    { id: "b-position", criterion: "TR", text: "Mở bài có lập trường rõ ràng." },
    { id: "b-topic", criterion: "CC", text: "Đoạn thân bài mở đầu bằng câu chủ đề nói ý chính." },
    { id: "b-explain", criterion: "TR", text: "Có câu giải thích vì sao, rồi mới đến ví dụ." },
    { id: "b-example", criterion: "TR", text: "Ví dụ đúng chủ đề và chứng minh được lý do." },
    { id: "b-links", criterion: "CC", text: "Dùng đúng chỗ các từ nối đơn giản: because, so, however, for example." },
    { id: "b-grammar", criterion: "GRA", text: "Đã kiểm thì của động từ và số ít/số nhiều." },
  ],
  developing: fullEssayChecks,
  advanced: fullEssayChecks,
};

/** Terms explained wherever they appear; keys are matched case-insensitively in learner-facing text. */
export const glossary: { term: string; match: RegExp; vi: string }[] = [
  { term: "Thesis", match: /\bthesis\b/i, vi: "Câu nêu lập trường của bạn, thường ở cuối mở bài, cho biết cả bài sẽ chứng minh điều gì." },
  { term: "Overview", match: /\boverview\b/i, vi: "Ở Task 2, đây là câu nói hướng đi của cả bài, tương tự thesis." },
  { term: "Paraphrase", match: /\bparaphrase\b/i, vi: "Diễn đạt lại cùng một ý bằng từ và cấu trúc khác, không đổi nghĩa." },
  { term: "Topic sentence", match: /\btopic sentence\b/i, vi: "Câu chủ đề: câu đầu đoạn thân bài, nói ý chính của cả đoạn." },
  { term: "Task Response", match: /\btask response\b/i, vi: "Tiêu chí TR: bài có trả lời đúng và đủ đề không, lập trường có rõ không, ý có được phát triển không." },
  { term: "TR", match: /\bTR\b/, vi: "Task Response: trả lời đúng, đủ đề; lập trường rõ; ý có giải thích và ví dụ." },
  { term: "CC", match: /\bCC\b/, vi: "Coherence and Cohesion: bài có mạch lạc không, chia đoạn hợp lý không, liên kết câu có tự nhiên không." },
  { term: "LR", match: /\bLR\b/, vi: "Lexical Resource: vốn từ có đủ rộng và chính xác không, có dùng đúng cụm từ đi kèm không." },
  { term: "GRA", match: /\bGRA\b/, vi: "Grammatical Range and Accuracy: có dùng nhiều kiểu câu không, và có đúng ngữ pháp không." },
  { term: "Collocation", match: /\bcollocation\b/i, vi: "Cụm từ hay đi với nhau, ví dụ make a decision, không nói do a decision." },
];
