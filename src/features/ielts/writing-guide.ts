/**
 * The writing guide shown beside a Writing task: what this particular question asks for, the
 * positions that are all acceptable, a paragraph plan, timing, common traps and a self-check
 * against the four public IELTS Writing criteria. No AI: the question type is read from the
 * prompt's own wording, so the same prompt always gets the same advice.
 */

export type Task2Kind = "opinion" | "discussion" | "adv_disadv" | "outweigh" | "positive_negative" | "problem_solution" | "two_part" | "general";
export type Task1Kind = "line" | "bar" | "pie" | "table" | "mixed" | "process" | "map" | "chart";
export type LetterTone = "formal" | "semi_formal" | "informal";

export type PartPlan = { id: string; title: string; hint: string; target: string };
export type WritingGuide = {
  label: string;
  /** What the question requires, in the order an examiner checks it. */
  demands: string[];
  /** Acceptable ways to answer; shown so no single position looks like "the right one". */
  stance?: { note: string; options: string[] };
  parts: PartPlan[];
  timing: string;
  traps: string[];
  checklist: { criterion: string; items: string[] }[];
  phrases: string[];
  outline: string;
};

const clean = (prompt: string) => prompt.replace(/\*\*/g, "").replace(/[“”]/g, "\"").replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** Task 2 question type from the prompt's wording; the order matters ("outweigh" also mentions advantages). */
export function task2Kind(prompt: string): Task2Kind {
  const text = clean(prompt).toLowerCase();
  if (/\boutweigh/.test(text)) return "outweigh";
  if (/advantages? and (the )?disadvantages?|benefits? and (the )?drawbacks?|pros and cons/.test(text)) return "adv_disadv";
  if (/discuss both (these |the )?(views|opinions|sides|points of view)/.test(text)) return "discussion";
  if (/positive or (a )?negative/.test(text)) return "positive_negative";
  if (/agree or disagree|do you agree/.test(text)) return "opinion";
  const asksWhy = /\b(cause|causes|caused|reason|reasons|problem|problems|why|factor|factors|contribute)\b/.test(text);
  const asksFix = /\b(solution|solutions|solve|solved|tackle|address|measures?|what can be done|reduce[ds]?|improve[ds]?|prevent)\b/.test(text);
  if (asksWhy && asksFix) return "problem_solution";
  if ((text.match(/\?/g) ?? []).length >= 2) return "two_part";
  return "general";
}

export function task1Kind(prompt: string): Task1Kind {
  const text = clean(prompt).toLowerCase();
  const kinds = [
    /line graph|line chart/.test(text) && "line",
    /bar chart|bar graph|column chart/.test(text) && "bar",
    /pie chart/.test(text) && "pie",
    /\btable\b/.test(text) && "table",
  ].filter(Boolean) as Task1Kind[];
  if (kinds.length > 1) return "mixed";
  if (kinds.length === 1) return kinds[0];
  if (/\bprocess\b|\bstages?\b|how .* (is|are) (made|produced)|life cycle/.test(text)) return "process";
  if (/\bmaps?\b|\bplans?\b of|layout/.test(text)) return "map";
  return "chart";
}

export function letterTone(prompt: string): LetterTone {
  const text = clean(prompt).toLowerCase();
  if (/\bfriend\b|\bcousin\b|\bpen ?pal\b/.test(text)) return "informal";
  if (/\bneighbou?r|\blandlord|\bteacher|\bcolleague|\bclassmate/.test(text)) return "semi_formal";
  return "formal";
}

/** The questions a prompt actually asks, word for word, so a two-part answer can be checked against each. */
function questionsOf(prompt: string) {
  return clean(prompt).split(/(?<=\?)\s+/).map((part) => part.trim()).filter((part) => part.endsWith("?")).map((part) => part.replace(/^.*?(?=(What|Why|How|Which|Who|Is|Are|Do|Does|Should|Can|To what)\b)/, ""));
}

const task2Checklist = (kind: Task2Kind): WritingGuide["checklist"] => [
  { criterion: "Task Response · Trả lời đề", items: [
    "Đã trả lời mọi phần đề hỏi, không bỏ sót ý nào.",
    kind === "adv_disadv" || kind === "general" || kind === "two_part" || kind === "problem_solution"
      ? "Nếu có nêu ý kiến riêng thì ý kiến đó nhất quán từ mở bài đến kết bài."
      : "Quan điểm được nêu rõ ở mở bài và giữ nguyên đến kết bài.",
    "Mỗi ý chính có giải thích và ví dụ, không chỉ liệt kê.",
    "Bài viết đúng chủ đề của đề, không lan sang chủ đề rộng hơn.",
    "Đủ ít nhất 250 từ (câu chép nguyên từ đề không giúp tăng điểm).",
  ] },
  { criterion: "Coherence & Cohesion · Mạch lạc", items: [
    "Mỗi đoạn thân bài có một ý trung tâm, câu đầu đoạn nêu ý đó.",
    "Thứ tự ý hợp lý, người đọc không phải đoán vì sao chuyển ý.",
    "Từ nối dùng đúng nghĩa, không đặt ở đầu mọi câu.",
    "Dùng this/these/it/they để tránh lặp danh từ, và người đọc biết chúng chỉ cái gì.",
  ] },
  { criterion: "Lexical Resource · Từ vựng", items: [
    "Mở bài diễn đạt lại đề bằng từ của mình, không chép nguyên câu.",
    "Có từ vựng đúng chủ đề, không lặp một từ quá nhiều lần.",
    "Kiểm tra chính tả và dạng từ (danh từ, động từ, tính từ).",
    "Tránh từ quá hoa mỹ mà mình không chắc nghĩa.",
  ] },
  { criterion: "Grammatical Range & Accuracy · Ngữ pháp", items: [
    "Có cả câu đơn và câu phức (because, although, which, if…).",
    "Soát mạo từ a/an/the, số ít/số nhiều và chia động từ theo chủ ngữ.",
    "Thì động từ phù hợp với thời điểm đang nói tới.",
    "Mỗi câu có dấu chấm câu đúng, không nối nhiều mệnh đề bằng dấu phẩy.",
  ] },
];

const fairNote = "Giám khảo không chấm theo việc bạn đứng về phía nào. Điểm phụ thuộc vào việc trả lời đủ đề, lập trường rõ ràng và lập luận có dẫn chứng. Chọn hướng mà bạn giải thích và cho ví dụ được tốt nhất.";

function task2Guide(prompt: string): WritingGuide {
  const kind = task2Kind(prompt);
  const intro = (extra: string): PartPlan => ({ id: "intro", title: "Introduction", hint: `Diễn đạt lại đề bằng từ của bạn. ${extra}`, target: "40–60 từ" });
  const conclusion = (hint: string): PartPlan => ({ id: "conclusion", title: "Conclusion", hint, target: "30–50 từ" });
  const body = (id: "body1" | "body2", hint: string): PartPlan => ({ id, title: id === "body1" ? "Body 1" : "Body 2", hint, target: "80–100 từ" });
  const shared = {
    timing: "40 phút: 5 phút đọc đề và lập dàn ý · 30 phút viết · 5 phút soát lỗi theo danh sách bên dưới.",
    checklist: task2Checklist(kind),
  };
  const commonTraps = ["Học thuộc mở bài mẫu dài không liên quan đến đề: phần đó không được tính là trả lời đề.", "Viết lan sang chủ đề rộng hơn đề hỏi (ví dụ đề hỏi về thành phố nhưng bàn chung về cả quốc gia)."];

  switch (kind) {
    case "opinion": return { ...shared, label: "Opinion · To what extent do you agree or disagree?",
      demands: ["Nêu rõ bạn đồng ý, không đồng ý, hay đồng ý một phần với nhận định trong đề.", "Đưa lý do cho quan điểm đó, mỗi lý do có giải thích và ví dụ.", "Giữ một quan điểm xuyên suốt bài."],
      stance: { note: fairNote, options: ["Đồng ý hoàn toàn: hai đoạn thân bài là hai lý do ủng hộ.", "Không đồng ý hoàn toàn: hai đoạn thân bài là hai lý do phản đối.", "Đồng ý một phần: một đoạn cho phần bạn đồng ý, một đoạn cho phần bạn không đồng ý, và nói rõ phần nào nặng hơn."] },
      parts: [intro("Nêu luôn quan điểm của bạn và mức độ đồng ý."), body("body1", "Lý do thứ nhất cho quan điểm của bạn → giải thích → ví dụ cụ thể."), body("body2", "Lý do thứ hai (hoặc, nếu đồng ý một phần, mặt bạn không đồng ý) → giải thích → ví dụ."), conclusion("Nhắc lại quan điểm bằng cách diễn đạt khác, không thêm lý do mới.")],
      traps: ["Đến kết bài mới nêu quan điểm, hoặc đổi quan điểm giữa bài.", "Viết như bài Discussion, trình bày hai phía ngang nhau mà không nói mình nghiêng về đâu.", ...commonTraps],
      phrases: ["I largely agree that …", "I disagree with the view that …", "While it is true that …, I believe …", "The main reason is that …", "This is particularly true when …", "For example, …", "For these reasons, I believe …"],
      outline: "Quan điểm: đồng ý / không đồng ý / một phần\nLý do 1 + ví dụ\nLý do 2 + ví dụ\nKết: nhắc lại quan điểm" };
    case "discussion": return { ...shared, label: "Discussion · Discuss both views and give your own opinion",
      demands: ["Trình bày quan điểm thứ nhất trong đề và lý do người ta nghĩ vậy.", "Trình bày quan điểm thứ hai và lý do của nó.", "Nêu ý kiến của chính bạn. Đây là yêu cầu bắt buộc, thiếu sẽ mất điểm Task Response."],
      stance: { note: fairNote, options: ["Nghiêng về quan điểm thứ nhất.", "Nghiêng về quan điểm thứ hai.", "Kết hợp cả hai, với điều kiện nói rõ khi nào và vì sao."] },
      parts: [intro("Giới thiệu hai quan điểm, rồi nêu ngắn gọn ý kiến của bạn."), body("body1", "Quan điểm thứ nhất: vì sao một số người nghĩ vậy → giải thích → ví dụ. Trình bày công bằng, kể cả khi bạn không đồng ý."), body("body2", "Quan điểm thứ hai: vì sao người khác nghĩ vậy → giải thích → ví dụ. Có thể nói rõ bạn ủng hộ phía này ở cuối đoạn."), conclusion("Tóm tắt hai quan điểm và nhắc lại ý kiến của bạn.")],
      traps: ["Chỉ bàn một phía, hoặc phía mình không ủng hộ chỉ được một câu.", "Không nêu ý kiến riêng, hoặc chỉ nêu ở câu cuối mà không có lý do.", ...commonTraps],
      phrases: ["Some people argue that …", "This view is based on the idea that …", "Others, however, believe that …", "Supporters of this view point out that …", "Having considered both sides, I believe …", "In my opinion, …", "In conclusion, while …, I would argue that …"],
      outline: "Quan điểm 1: lý do + ví dụ\nQuan điểm 2: lý do + ví dụ\nÝ kiến của tôi: … vì …" };
    case "adv_disadv": return { ...shared, label: "Advantages & Disadvantages",
      demands: ["Nêu những lợi ích chính.", "Nêu những bất lợi chính.", "Đề không yêu cầu ý kiến riêng: không bắt buộc kết luận bên nào hơn. Nếu bạn nêu ý kiến, hãy giữ nhất quán."],
      stance: { note: "Dạng này chấm việc bạn trình bày cả hai mặt đầy đủ và cân bằng. Hai đoạn thân bài nên có độ dài và độ sâu tương đương nhau.", options: ["Trình bày trung lập hai mặt, không nêu ý kiến.", "Trình bày hai mặt, rồi nêu nhận xét ngắn ở kết bài (không bắt buộc)."] },
      parts: [intro("Nói rằng bài sẽ bàn cả lợi ích lẫn bất lợi."), body("body1", "Lợi ích: một đến hai ý chính → giải thích ai được lợi và vì sao → ví dụ."), body("body2", "Bất lợi: một đến hai ý chính → giải thích ai bị ảnh hưởng và vì sao → ví dụ."), conclusion("Tóm tắt lợi ích và bất lợi chính. Không đưa ý mới.")],
      traps: ["Một mặt viết dài, mặt kia chỉ một hai câu.", "Liệt kê nhiều lợi ích mà không giải thích ý nào.", ...commonTraps],
      phrases: ["One clear benefit of … is that …", "This is advantageous because …", "Another advantage is …", "On the other hand, a significant drawback is …", "This could lead to …", "For instance, …", "In summary, … offers … but also …"],
      outline: "Lợi ích 1–2 + ví dụ\nBất lợi 1–2 + ví dụ\nKết: tóm tắt hai mặt" };
    case "outweigh": return { ...shared, label: "Advantages vs Disadvantages · Do the advantages outweigh the disadvantages?",
      demands: ["Nêu cả lợi ích và bất lợi.", "Kết luận rõ ràng bên nào lớn hơn. Đây là yêu cầu chính của đề, không thể trả lời là hai bên bằng nhau.", "Giải thích vì sao bên đó lớn hơn, chứ không chỉ đếm số ý."],
        stance: { note: fairNote, options: ["Lợi ích lớn hơn bất lợi.", "Bất lợi lớn hơn lợi ích.", "Lợi ích lớn hơn trong một số điều kiện, với điều kiện nói rõ điều kiện đó và vẫn chọn một bên."] },
        parts: [intro("Nêu ngay bạn cho rằng bên nào lớn hơn."), body("body1", "Bên yếu hơn: thừa nhận một đến hai ý của nó → giải thích ngắn → ví dụ."), body("body2", "Bên mạnh hơn: các ý chính → vì sao chúng quan trọng hơn bên kia → ví dụ."), conclusion("Nhắc lại bên nào lớn hơn và lý do quyết định.")],
        traps: ["Trình bày hai mặt như dạng Advantages & Disadvantages mà không kết luận bên nào hơn.", "Kết luận bên này hơn nhưng không giải thích vì sao.", ...commonTraps],
        phrases: ["Although there are some drawbacks, I believe the benefits are greater.", "Admittedly, …", "However, this is outweighed by …", "More importantly, …", "This matters more because …", "Overall, the advantages clearly outweigh …"],
        outline: "Kết luận: bên nào lớn hơn\nBên yếu hơn: 1–2 ý\nBên mạnh hơn: ý chính + vì sao quan trọng hơn" };
    case "positive_negative": return { ...shared, label: "Positive or negative development?",
      demands: ["Nói rõ bạn thấy xu hướng này tích cực, tiêu cực, hay tích cực với điều kiện.", "Đưa lý do và ví dụ cho nhận định đó.", "Giữ nhận định nhất quán đến kết bài."],
      stance: { note: fairNote, options: ["Chủ yếu tích cực.", "Chủ yếu tiêu cực.", "Tích cực về mặt này nhưng tiêu cực về mặt kia, với kết luận rõ mặt nào nặng hơn."] },
      parts: [intro("Nêu luôn bạn thấy xu hướng này tích cực hay tiêu cực."), body("body1", "Lý do chính cho nhận định của bạn → giải thích → ví dụ."), body("body2", "Lý do thứ hai, hoặc thừa nhận mặt còn lại rồi giải thích vì sao nó nhẹ hơn."), conclusion("Nhắc lại nhận định của bạn bằng cách diễn đạt khác.")],
      traps: ["Chỉ mô tả xu hướng mà không đánh giá nó.", "Kết luận \"vừa tốt vừa xấu\" mà không nói mặt nào nặng hơn.", ...commonTraps],
      phrases: ["I consider this a largely positive development.", "This trend is beneficial because …", "A less positive consequence is …", "On balance, …", "For example, …"],
      outline: "Nhận định: tích cực / tiêu cực\nLý do 1 + ví dụ\nLý do 2 / mặt còn lại" };
    case "problem_solution": return { ...shared, label: "Problem / Causes & Solutions",
      demands: ["Nêu vấn đề hoặc nguyên nhân mà đề hỏi.", "Đề xuất giải pháp, và giải pháp phải khớp với nguyên nhân đã nêu.", "Nếu đề nói rõ ai phải hành động (chính quyền, trường học…), giải pháp cần nói đến đúng người đó."],
      parts: [intro("Nói bài sẽ phân tích nguyên nhân và đưa ra giải pháp."), body("body1", "Một đến hai nguyên nhân hoặc vấn đề chính → giải thích vì sao chúng gây ra tình trạng này → ví dụ."), body("body2", "Giải pháp cho từng nguyên nhân ở Body 1 → ai làm, làm thế nào → vì sao có tác dụng."), conclusion("Tóm tắt nguyên nhân chính và giải pháp chính.")],
      traps: ["Giải pháp không liên quan đến nguyên nhân đã nêu.", "Giải pháp chung chung (\"chính phủ nên làm gì đó\") mà không nói cụ thể làm gì.", ...commonTraps],
      phrases: ["One major cause of this problem is …", "This is partly because …", "As a result, …", "One effective solution would be to …", "This would help because …", "Authorities could also …"],
      outline: "Nguyên nhân 1, 2\nGiải pháp cho nguyên nhân 1\nGiải pháp cho nguyên nhân 2" };
    case "two_part": {
      const questions = questionsOf(prompt);
      return { ...shared, label: "Two-part question",
        demands: questions.length >= 2 ? questions.map((question, index) => `Trả lời câu hỏi ${index + 1}: "${question}"`) : ["Trả lời đầy đủ từng câu hỏi trong đề, mỗi câu một đoạn thân bài."],
        stance: { note: "Hai câu hỏi có trọng số như nhau. Câu nào hỏi ý kiến (Do you think…?, Is this…?) thì cần một câu trả lời rõ ràng.", options: ["Mỗi đoạn thân bài trả lời một câu hỏi, theo đúng thứ tự trong đề."] },
        parts: [intro("Trả lời ngắn gọn cả hai câu hỏi ngay ở mở bài."), body("body1", `Trả lời câu hỏi 1${questions[0] ? ` ("${questions[0]}")` : ""} → giải thích → ví dụ.`), body("body2", `Trả lời câu hỏi 2${questions[1] ? ` ("${questions[1]}")` : ""} → giải thích → ví dụ.`), conclusion("Tóm tắt câu trả lời cho cả hai câu hỏi.")],
        traps: ["Câu hỏi thứ hai chỉ được trả lời trong một hai câu.", "Trả lời một câu hỏi gần giống chứ không phải đúng câu đề hỏi.", ...commonTraps],
        phrases: ["There are several reasons why …", "The main reason is that …", "As for whether …, I believe …", "This means that …", "For example, …"],
        outline: "Câu hỏi 1: trả lời + ví dụ\nCâu hỏi 2: trả lời + ví dụ" };
    }
    default: return { ...shared, label: "Task 2",
      demands: ["Đọc kỹ từng câu hỏi và chỉ dẫn trong đề, gạch chân động từ chỉ việc cần làm (discuss, explain, give your opinion…).", "Trả lời mọi phần đề yêu cầu."],
      parts: [intro("Câu trả lời trực tiếp cho câu hỏi của đề."), body("body1", "Ý chính thứ nhất → giải thích → ví dụ."), body("body2", "Ý chính thứ hai → giải thích → ví dụ."), conclusion("Tóm lại câu trả lời, không thêm ý mới.")],
      traps: commonTraps,
      phrases: ["It is often argued that …", "The main reason is that …", "For instance, …", "This is largely because …", "On the other hand, …", "In conclusion, …"],
      outline: "Câu trả lời chính\nÝ 1 + ví dụ\nÝ 2 + ví dụ" };
  }
}

function task1AcademicGuide(prompt: string): WritingGuide {
  const kind = task1Kind(prompt);
  const process = kind === "process", map = kind === "map";
  const what: Record<Task1Kind, string> = {
    line: "Biểu đồ đường: tập trung vào xu hướng tăng, giảm, dao động và điểm cao hay thấp nhất theo thời gian.",
    bar: "Biểu đồ cột: so sánh các nhóm với nhau, và cả theo thời gian nếu có nhiều năm.",
    pie: "Biểu đồ tròn: so sánh tỷ lệ, chỉ ra phần lớn nhất, nhỏ nhất và các phần gần bằng nhau.",
    table: "Bảng số liệu: chọn số nổi bật để so sánh, không chép lại cả bảng.",
    mixed: "Nhiều biểu đồ: mô tả từng biểu đồ và chỉ ra mối liên hệ giữa chúng nếu có.",
    process: "Quy trình: mô tả các giai đoạn theo thứ tự, thường dùng câu bị động (is heated, are collected).",
    map: "Bản đồ: so sánh trước và sau, cái gì được xây, bị bỏ hay giữ nguyên, và vị trí của chúng.",
    chart: "Xác định đây là dạng biểu đồ gì để chọn cách mô tả phù hợp.",
  };
  return {
    label: `Task 1 Academic · ${{ line: "Line graph", bar: "Bar chart", pie: "Pie chart", table: "Table", mixed: "Nhiều biểu đồ", process: "Process", map: "Map", chart: "Biểu đồ" }[kind]}`,
    demands: [what[kind], "Có một đoạn Overview nêu các đặc điểm chính, không có số liệu chi tiết.", process ? "Nêu đủ các giai đoạn, không bỏ bước." : map ? "Mô tả đủ các thay đổi chính, không chỉ một vài." : "Chọn số liệu tiêu biểu và so sánh khi phù hợp.", "Chỉ mô tả những gì có trong hình, không đưa ý kiến hay đoán nguyên nhân."],
    parts: [
      { id: "intro", title: "Introduction", hint: "Diễn đạt lại đề: hình cho thấy gì, ở đâu, khi nào. Một câu là đủ.", target: "20–30 từ" },
      { id: "overview", title: "Overview", hint: process ? "Quy trình có bao nhiêu giai đoạn, bắt đầu và kết thúc bằng gì." : map ? "Thay đổi tổng thể lớn nhất giữa hai thời điểm." : "Hai đặc điểm hoặc xu hướng lớn nhất, không dùng số liệu chi tiết.", target: "30–40 từ" },
      { id: "body1", title: "Body 1", hint: process ? "Nửa đầu quy trình theo thứ tự, dùng từ nối first, then, after that." : map ? "Những thay đổi ở một khu vực hoặc một nhóm đối tượng." : "Nhóm số liệu thứ nhất: so sánh, có số liệu dẫn chứng.", target: "50–60 từ" },
      { id: "body2", title: "Body 2", hint: process ? "Nửa sau quy trình đến bước cuối cùng." : map ? "Những thay đổi còn lại." : "Nhóm số liệu còn lại: thay đổi, so sánh, điểm cao hay thấp nhất.", target: "50–60 từ" },
    ],
    timing: "20 phút: 3 phút đọc hình và chọn ý chính · 14 phút viết · 3 phút soát số liệu và lỗi.",
    traps: ["Không có Overview, hoặc Overview chỉ là chép lại số liệu.", "Liệt kê mọi con số mà không so sánh.", "Sai đơn vị (%, triệu, tấn) hoặc sai thì động từ so với mốc thời gian.", "Đưa ý kiến hay giải thích nguyên nhân mà hình không thể hiện."],
    checklist: [
      { criterion: "Task Achievement · Hoàn thành yêu cầu", items: ["Có Overview rõ ràng.", "Các đặc điểm chính đều được nhắc đến và có số liệu dẫn chứng.", "Số liệu và đơn vị chép đúng.", "Đủ ít nhất 150 từ."] },
      { criterion: "Coherence & Cohesion · Mạch lạc", items: ["Dữ liệu được chia nhóm hợp lý giữa hai đoạn thân bài.", "Từ nối so sánh dùng đúng (while, whereas, in contrast, similarly)."] },
      { criterion: "Lexical Resource · Từ vựng", items: ["Dùng đa dạng từ mô tả xu hướng (rise, decline, fluctuate, peak, remain stable…).", "Không lặp mãi một động từ."] },
      { criterion: "Grammatical Range & Accuracy · Ngữ pháp", items: [process ? "Dùng câu bị động đúng cho các bước của quy trình." : "Thì động từ đúng với thời gian trong hình (quá khứ, hiện tại hay dự báo).", "Có câu so sánh (higher than, twice as much as, the largest)."] },
    ],
    phrases: process ? ["The diagram illustrates how …", "Overall, there are … stages, beginning with … and ending with …", "First, … is collected.", "After that, …", "Once …, it is then …", "Finally, …"]
      : map ? ["The maps show how … changed between … and …", "Overall, the area became more …", "… was replaced by …", "A new … was built to the north of …", "… remained unchanged."]
      : ["The chart compares …", "Overall, it is clear that …", "… rose sharply from X to Y.", "… remained stable at around …", "In contrast, …", "… accounted for the largest proportion of …", "… was approximately twice as high as …"],
    outline: process ? "Overview: số giai đoạn, bắt đầu → kết thúc\nBody 1: các bước đầu\nBody 2: các bước sau" : "Overview: 2 đặc điểm chính\nBody 1: nhóm số liệu 1\nBody 2: nhóm số liệu 2",
  };
}

function task1GeneralGuide(prompt: string): WritingGuide {
  const tone = letterTone(prompt);
  const toneLabel = { formal: "Thư trang trọng", semi_formal: "Thư bán trang trọng", informal: "Thư thân mật" }[tone];
  return {
    label: `Task 1 General · ${toneLabel}`,
    demands: ["Trả lời đủ cả ba gạch đầu dòng của đề, mỗi gạch đầu dòng một đoạn.", "Nói rõ mục đích viết thư ngay ở một hai câu đầu.", tone === "informal" ? "Giọng thân mật, tự nhiên như viết cho bạn bè." : tone === "semi_formal" ? "Giọng lịch sự nhưng không quá cứng, vì người nhận là người bạn có quen biết." : "Giọng trang trọng, lịch sự, không dùng từ viết tắt hay tiếng lóng."],
    stance: { note: "Bạn được tự nghĩ ra chi tiết như tên, ngày, địa điểm. Giám khảo chỉ chấm việc thư đủ ý, đúng mục đích và đúng giọng văn, không chấm câu chuyện có thật hay không.", options: [tone === "informal" ? "Mở: Dear + tên · Kết: Best wishes / Love + tên." : tone === "semi_formal" ? "Mở: Dear Mr/Ms + họ · Kết: Kind regards + họ tên." : "Mở: Dear Sir or Madam · Kết: Yours faithfully + họ tên (hoặc Dear Mr/Ms … → Yours sincerely)."] },
    parts: [
      { id: "opening", title: "Mở thư", hint: "Lời chào + một câu nêu lý do viết thư.", target: "20–30 từ" },
      { id: "body1", title: "Ý thứ nhất", hint: "Gạch đầu dòng thứ nhất của đề, có chi tiết cụ thể.", target: "40–50 từ" },
      { id: "body2", title: "Ý thứ hai", hint: "Gạch đầu dòng thứ hai: giải thích hoặc mô tả.", target: "40–50 từ" },
      { id: "body3", title: "Ý thứ ba", hint: "Gạch đầu dòng thứ ba: đề nghị, yêu cầu hoặc kế hoạch.", target: "30–40 từ" },
      { id: "closing", title: "Kết thư", hint: "Câu kết phù hợp giọng văn + lời chào cuối + tên.", target: "15–25 từ" },
    ],
    timing: "20 phút: 3 phút xác định giọng văn và ý cho ba gạch đầu dòng · 14 phút viết · 3 phút soát lỗi.",
    traps: ["Bỏ sót hoặc chỉ viết một câu cho một gạch đầu dòng.", "Giọng văn lẫn lộn, ví dụ mở bằng Dear Sir nhưng viết như nói với bạn.", "Không nói rõ mục đích viết thư."],
    checklist: [
      { criterion: "Task Achievement · Hoàn thành yêu cầu", items: ["Cả ba gạch đầu dòng đều được trả lời có chi tiết.", "Mục đích thư rõ ràng.", "Giọng văn phù hợp người nhận từ đầu đến cuối.", "Đủ ít nhất 150 từ."] },
      { criterion: "Coherence & Cohesion · Mạch lạc", items: ["Mỗi gạch đầu dòng một đoạn, theo thứ tự hợp lý.", "Lời chào đầu và lời chào cuối khớp nhau."] },
      { criterion: "Lexical Resource · Từ vựng", items: ["Từ ngữ hợp giọng văn (formal: I would be grateful… / informal: Can you…).", "Chính tả đúng."] },
      { criterion: "Grammatical Range & Accuracy · Ngữ pháp", items: ["Có câu phức và câu yêu cầu lịch sự (Could you…, I would appreciate it if…).", "Soát thì động từ và mạo từ."] },
    ],
    phrases: tone === "informal" ? ["Thanks so much for your letter.", "I'm writing to tell you about …", "Guess what?", "Why don't we …?", "Can't wait to see you!", "Best wishes,"]
      : ["I am writing to …", "I would be grateful if you could …", "Unfortunately, …", "I would like to suggest that …", "I look forward to hearing from you.", tone === "formal" ? "Yours faithfully," : "Kind regards,"],
    outline: "Mục đích thư\nÝ 1 (gạch đầu dòng 1)\nÝ 2 (gạch đầu dòng 2)\nÝ 3 (gạch đầu dòng 3)",
  };
}

export function writingGuide(type: string | null | undefined, prompt: string): WritingGuide {
  if (type === "task1_academic") return task1AcademicGuide(prompt);
  if (type === "task1_general") return task1GeneralGuide(prompt);
  return task2Guide(prompt);
}
