/*
 * Built-in teaching content for the Writing Task 1 Lab: the "Bài 0" introduction, a short guide per figure type
 * and the sentence frames the drills offer. It is original, written for Vietnamese self-learners, and stands in
 * until the T1-DATA-v1 layer-1 data (docs/WRITING_TASK1_DATA_PROMPT.md) arrives; lessons with their own
 * keywords, phrases or scaffold use those first.
 */

export type GuideExample = { en: string; vi?: string; note_vi?: string };
export type GuideSection = { id: string; title_vi: string; body_vi: string[]; examples?: GuideExample[] };

export const TASK1_GUIDE_ID = "huong-dan";

export const introGuide: { title_vi: string; lead_vi: string; sections: GuideSection[] } = {
  title_vi: "Task 1 là gì và làm thế nào",
  lead_vi: "Đọc trang này một lần trước khi vào bài 01. Mất khoảng 8 phút, và bạn có thể quay lại bất cứ lúc nào từ nút “Hướng dẫn” trong mỗi bài.",
  sections: [
    {
      id: "what",
      title_vi: "1. Đề bài yêu cầu gì",
      body_vi: [
        "Bạn được cho một hình: biểu đồ đường, cột, tròn, bảng, bản đồ hoặc sơ đồ quy trình. Nhiệm vụ là viết một bài báo cáo ngắn, ít nhất 150 từ, mô tả những điểm chính của hình.",
        "Bạn chỉ mô tả những gì hình cho thấy: không nêu ý kiến, không đoán nguyên nhân, không thêm số liệu ngoài hình.",
        "Nên làm trong khoảng 20 phút. Task 1 chiếm khoảng 1/3 điểm Writing, Task 2 chiếm 2/3.",
      ],
    },
    {
      id: "criteria",
      title_vi: "2. Bài được chấm theo 4 tiêu chí",
      body_vi: [
        "TA – Hoàn thành yêu cầu: có Overview nêu được điểm chính, chọn đúng số liệu quan trọng, số liệu chính xác.",
        "CC – Mạch lạc: bài chia đoạn rõ ràng, ý được nhóm hợp lý, có từ nối tự nhiên.",
        "LR – Từ vựng: dùng từ chỉ xu hướng, so sánh, tỉ lệ đúng và đa dạng; không lặp lại một từ quá nhiều.",
        "GRA – Ngữ pháp: đúng thì, đúng câu so sánh, có cả câu đơn và câu phức, ít lỗi.",
      ],
    },
    {
      id: "structure",
      title_vi: "3. Bố cục 4 đoạn",
      body_vi: [
        "Mở bài (1 câu): nói lại đề bằng từ của bạn – hình nói về cái gì, ở đâu, khi nào.",
        "Overview (1–2 câu): 2 đặc điểm nổi bật nhất của cả hình. Không đưa số liệu chi tiết vào đây.",
        "Body 1 và Body 2 (mỗi đoạn 2–4 câu): chia dữ kiện thành hai nhóm, mô tả kèm số liệu để chứng minh.",
      ],
      examples: [
        { en: "The line chart compares daily commuter journeys using three forms of transport in Westbridge from 2010 to 2025.", note_vi: "Mở bài: đổi “shows” thành “compares”, giữ đúng đối tượng, nơi chốn, thời gian." },
        { en: "Overall, metro use grew markedly and became the most popular mode, whereas bus travel fluctuated and finished slightly lower.", note_vi: "Overview: hai ý lớn nhất, không có con số nào." },
        { en: "In 2010, buses carried around 40,000 daily journeys, more than twice the metro figure of 15,000.", note_vi: "Body: mỗi câu có số liệu và một phép so sánh." },
      ],
    },
    {
      id: "overview",
      title_vi: "4. Tìm Overview thế nào",
      body_vi: [
        "Overview là phần quan trọng nhất: thiếu Overview thì khó vượt band 5 ở tiêu chí TA.",
        "Tự hỏi 3 câu: Cái gì lớn nhất / nhỏ nhất? Xu hướng chung là tăng, giảm hay dao động? Có thay đổi nào nổi bật nhất không?",
        "Với bản đồ: khu vực thay đổi nhiều nhất là gì, cái gì giữ nguyên. Với quy trình: có bao nhiêu bước, bắt đầu và kết thúc ở đâu, có lặp lại không.",
      ],
      examples: [
        { en: "Overall, ___ was the most popular ___, while ___ ___ throughout the period.", note_vi: "Khung Overview dùng được cho hầu hết biểu đồ." },
      ],
    },
    {
      id: "select",
      title_vi: "5. Chọn số liệu, đừng liệt kê hết",
      body_vi: [
        "Người chấm không cần mọi con số. Chọn: điểm đầu và điểm cuối, cao nhất và thấp nhất, chỗ đổi chiều, chỗ hai đường cắt nhau.",
        "Mỗi câu ở thân bài nên có một phép so sánh (more than, twice as, while, by contrast) chứ không chỉ đọc số.",
      ],
    },
    {
      id: "time",
      title_vi: "6. 20 phút chia thế nào",
      body_vi: [
        "2 phút đọc đề và hình: tiêu đề, đơn vị, mốc thời gian.",
        "3 phút lập ý: tìm 2 ý Overview, chia hai nhóm cho Body.",
        "13 phút viết theo thứ tự Mở bài → Overview → Body 1 → Body 2.",
        "2 phút soát: số liệu, thì, mạo từ, số ít/số nhiều.",
      ],
    },
  ],
};

export type GroupGuide = {
  name_vi: string;
  shows_vi: string;
  look_for_vi: string[];
  overview_frame_en: string;
  grouping_vi: string;
  phrases: { en: string; vi: string; example_en: string }[];
  tense_vi: string;
};

export const groupGuides: Record<string, GroupGuide> = {
  line: {
    name_vi: "Biểu đồ đường",
    shows_vi: "Sự thay đổi của một hay nhiều đối tượng qua thời gian.",
    look_for_vi: ["Đường nào cao nhất, thấp nhất lúc đầu và lúc cuối?", "Mỗi đường tăng, giảm hay dao động?", "Có chỗ hai đường cắt nhau hoặc đạt đỉnh không?"],
    overview_frame_en: "Overall, ___ rose significantly, while ___ fell / remained stable over the period.",
    grouping_vi: "Thường chia theo nhóm đường có xu hướng giống nhau, hoặc theo giai đoạn (trước và sau một mốc).",
    phrases: [
      { en: "rise / increase steadily", vi: "tăng đều", example_en: "Metro journeys rose steadily to 20,000 in 2015." },
      { en: "fall / decline sharply", vi: "giảm mạnh", example_en: "The figure fell sharply to 38,000." },
      { en: "peak at", vi: "đạt đỉnh ở", example_en: "Bus use peaked at 45,000 in 2015." },
      { en: "fluctuate", vi: "dao động", example_en: "Cycling fluctuated between 20,000 and 30,000." },
      { en: "overtake", vi: "vượt qua", example_en: "The metro overtook the bus between 2020 and 2025." },
      { en: "remain stable", vi: "giữ ổn định", example_en: "The number remained stable at around 40,000." },
    ],
    tense_vi: "Mốc thời gian đã qua: quá khứ đơn. Có dự báo tương lai: “is expected to / is predicted to”.",
  },
  bar: {
    name_vi: "Biểu đồ cột",
    shows_vi: "So sánh số lượng giữa các nhóm, có thể qua vài mốc thời gian.",
    look_for_vi: ["Cột nào cao nhất, thấp nhất?", "Nếu có nhiều năm: nhóm nào tăng, nhóm nào giảm?", "Có hai nhóm nào gần bằng nhau hoặc chênh lệch rất lớn?"],
    overview_frame_en: "Overall, ___ had the highest ___, whereas ___ recorded the lowest.",
    grouping_vi: "Chia theo nhóm cao và nhóm thấp, hoặc theo nhóm tăng và nhóm giảm.",
    phrases: [
      { en: "the highest / the lowest", vi: "cao nhất / thấp nhất", example_en: "Town A produced the highest amount of waste." },
      { en: "twice as much as", vi: "gấp đôi", example_en: "Town A produced twice as much waste as Town C." },
      { en: "slightly more than", vi: "nhiều hơn một chút", example_en: "Plastic accounted for slightly more than paper." },
      { en: "compared with", vi: "so với", example_en: "Only 12 kg was recycled, compared with 30 kg in Town B." },
      { en: "a similar figure", vi: "con số tương đương", example_en: "Town B recorded a similar figure." },
      { en: "by contrast", vi: "ngược lại", example_en: "By contrast, glass waste was minimal." },
    ],
    tense_vi: "Theo mốc thời gian của hình; không có năm thì dùng hiện tại đơn.",
  },
  pie: {
    name_vi: "Biểu đồ tròn",
    shows_vi: "Tỉ lệ các phần trong một tổng, thường so sánh hai hoặc ba thời điểm.",
    look_for_vi: ["Phần nào lớn nhất ở mỗi biểu đồ?", "Phần nào tăng tỉ lệ, phần nào giảm giữa các biểu đồ?", "Có phần nào gần như không đổi?"],
    overview_frame_en: "Overall, ___ made up the largest proportion, and the share of ___ grew considerably.",
    grouping_vi: "Chia theo phần lớn và phần nhỏ, hoặc theo phần tăng và phần giảm.",
    phrases: [
      { en: "account for / make up", vi: "chiếm", example_en: "Coal accounted for 50% of the total." },
      { en: "the proportion / share of", vi: "tỉ lệ của", example_en: "The share of solar power rose to 20%." },
      { en: "a quarter / a third / half", vi: "một phần tư / một phần ba / một nửa", example_en: "Gas made up almost a third of the total." },
      { en: "the majority of", vi: "phần lớn", example_en: "The majority of energy came from coal." },
      { en: "double", vi: "tăng gấp đôi", example_en: "The proportion of wind power doubled." },
      { en: "remain unchanged", vi: "giữ nguyên", example_en: "The share of oil remained unchanged at 10%." },
    ],
    tense_vi: "Quá khứ cho năm đã qua; luôn nhắc đơn vị là phần trăm (%) chứ không phải số lượng.",
  },
  table: {
    name_vi: "Bảng số liệu",
    shows_vi: "Nhiều con số theo hàng và cột; khó nhất là chọn lọc.",
    look_for_vi: ["Hàng nào có tổng hoặc giá trị lớn nhất, nhỏ nhất?", "Cột nào thay đổi nhiều nhất?", "Có dòng “Total” cho xu hướng chung không?"],
    overview_frame_en: "Overall, ___ recorded the highest figures in all categories, while ___ showed the greatest change.",
    grouping_vi: "Chia theo nhóm hàng cao/thấp hoặc theo cột; đừng đi lần lượt từng ô.",
    phrases: [
      { en: "the figure for", vi: "con số của", example_en: "The figure for Country A was 12 million." },
      { en: "respectively", vi: "lần lượt", example_en: "Countries B and C recorded 8 and 5 million respectively." },
      { en: "followed by", vi: "tiếp theo là", example_en: "Rice was the largest crop, followed by wheat." },
      { en: "in terms of", vi: "về mặt", example_en: "In terms of exports, Country A led." },
      { en: "range from ... to ...", vi: "dao động từ ... đến ...", example_en: "Prices ranged from $2 to $9." },
      { en: "the gap between", vi: "khoảng cách giữa", example_en: "The gap between the two cities widened." },
    ],
    tense_vi: "Theo thời gian của bảng; nhiều năm thì quá khứ đơn.",
  },
  mixed: {
    name_vi: "Biểu đồ kết hợp",
    shows_vi: "Hai hình khác loại (ví dụ đường + tròn) cùng một chủ đề.",
    look_for_vi: ["Mỗi hình nói gì riêng?", "Hai hình liên quan với nhau thế nào?", "Điểm nổi bật nhất của từng hình là gì?"],
    overview_frame_en: "Overall, the line graph shows that ___, while the pie chart indicates that ___.",
    grouping_vi: "Thường mỗi hình một đoạn Body; Overview phải có ý của cả hai hình.",
    phrases: [
      { en: "the first chart / the second chart", vi: "hình thứ nhất / hình thứ hai", example_en: "The second chart breaks this total down by age." },
      { en: "turning to", vi: "chuyển sang", example_en: "Turning to the pie chart, students made up 40%." },
      { en: "in addition", vi: "ngoài ra", example_en: "In addition, spending on food doubled." },
      { en: "this figure", vi: "con số này", example_en: "This figure rose to 60% by 2020." },
    ],
    tense_vi: "Xét thời gian của từng hình riêng.",
  },
  map: {
    name_vi: "Bản đồ",
    shows_vi: "Một khu vực ở hai thời điểm (hoặc hiện tại và dự kiến); bạn mô tả cái gì thay đổi.",
    look_for_vi: ["Cái gì được xây mới, phá bỏ, mở rộng, thay thế?", "Cái gì giữ nguyên?", "Thay đổi chung: đô thị hoá hơn, nhiều cây xanh hơn, giao thông thuận tiện hơn?"],
    overview_frame_en: "Overall, the area became more ___, with ___ replacing ___, while ___ remained unchanged.",
    grouping_vi: "Chia theo khu vực (phía bắc / phía nam) hoặc theo loại thay đổi (xây mới / bỏ đi).",
    phrases: [
      { en: "was replaced by", vi: "bị thay thế bởi", example_en: "The farmland was replaced by housing." },
      { en: "was demolished", vi: "bị phá bỏ", example_en: "The old factory was demolished." },
      { en: "was extended", vi: "được mở rộng", example_en: "The car park was extended to the east." },
      { en: "was constructed / built", vi: "được xây", example_en: "A new bridge was constructed across the river." },
      { en: "to the north of", vi: "ở phía bắc của", example_en: "A school was built to the north of the park." },
      { en: "remained unchanged", vi: "giữ nguyên", example_en: "The main road remained unchanged." },
    ],
    tense_vi: "Thay đổi đã xảy ra: quá khứ đơn bị động. Dự kiến: “will be built / is planned to”.",
  },
  process: {
    name_vi: "Sơ đồ quy trình",
    shows_vi: "Các bước nối nhau để làm ra một thứ (quy trình sản xuất) hoặc một vòng đời tự nhiên.",
    look_for_vi: ["Có bao nhiêu bước? Bắt đầu và kết thúc ở bước nào?", "Đi theo một đường thẳng, có rẽ nhánh, hay lặp lại thành vòng?", "Đọc theo số thứ tự và chiều mũi tên, không tự thêm bước."],
    overview_frame_en: "Overall, there are ___ main stages in the process, beginning with ___ and ending with ___.",
    grouping_vi: "Chia các bước làm hai nửa ở chỗ quy trình chuyển giai đoạn (ví dụ: chuẩn bị → chế biến → đóng gói).",
    phrases: [
      { en: "First / Firstly", vi: "đầu tiên", example_en: "First, the apples are picked by hand." },
      { en: "Next / After that", vi: "tiếp theo / sau đó", example_en: "Next, the fruit is washed." },
      { en: "Once ... , ...", vi: "khi đã ... thì ...", example_en: "Once the apples are sorted by size, they are placed in boxes." },
      { en: "is / are + V3 (bị động)", vi: "được làm (bởi người/máy)", example_en: "The boxes are dispatched to shops." },
      { en: "Finally", vi: "cuối cùng", example_en: "Finally, the boxes are delivered to supermarkets." },
      { en: "the cycle begins again", vi: "vòng lặp bắt đầu lại", example_en: "The adult lays eggs, and the cycle begins again." },
    ],
    tense_vi: "Quy trình sản xuất: hiện tại đơn bị động (is/are + V3). Vòng đời tự nhiên: hiện tại đơn chủ động.",
  },
};

export const guideFor = (group: string) => groupGuides[group] ?? groupGuides.line;

/** Sentence frames the drills offer when a lesson has no scaffold of its own. "___" marks a gap. */
export const drillFrames: Record<string, (group: string) => string> = {
  intro: (group) => group === "process" ? "The diagram illustrates how ___ ." : group === "map" ? "The maps compare ___ in ___ and ___ ." : "The ___ compares ___ in ___ between ___ and ___ .",
  overview: (group) => guideFor(group).overview_frame_en,
  groups: () => "Body 1: ___\nBody 2: ___",
  plan: () => "Body 1: bước ___ → ___\nBody 2: bước ___ → ___",
  observe: () => "Số bước: ___\nBước đầu: ___\nBước cuối: ___\nCó lặp / rẽ nhánh không: ___",
};

/** The essay outline offered in the writing step, by stage. */
export const essayFrame = (stage: string, group: string) => stage === "foundation"
  ? `${drillFrames.intro(group)}\n\n${guideFor(group).overview_frame_en}`
  : `${drillFrames.intro(group)}\n\n${guideFor(group).overview_frame_en}\n\n(Body 1) ___\n\n(Body 2) ___`;
