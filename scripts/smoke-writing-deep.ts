/** Direct model contract smoke; does not create or change learner data. */
import { generateDeepInsights } from "../src/lib/writing-grading/deep-provider";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.WRITING_CLOUDFLARE_PROXY_SECRET ?? process.env.CLOUDFLARE_AI_API_TOKEN;
if (!accountId || !apiToken) throw new Error("Cloudflare credentials required");
const essay = `Nowadays, many cities want to host major international sporting events, such as the Olympic Games or the World Cup. These events can bring some benefits to the host city, but they also have several disadvantages. In my opinion, the disadvantages outweigh the advantages.

On the one hand, hosting international sporting events can bring many benefits. Firstly, these events can attract a large number of tourists from different countries. Tourists spend money on hotels, restaurants and transportation, which can help local businesses earn more money. Secondly, the government often builds new roads, stadiums and public transport systems before the events. These facilities can improve people's daily lives. For example, new train stations can help local people travel more easily after the competition ends.

On the other hand, there are also some serious disadvantages. The biggest problem is the high cost of organizing these events. Governments need to spend a lot of money on building stadiums and other facilities. However, some stadiums may not be used regularly after the events. As a result, this can waste public money. Moreover, the money could be used to improve schools and hospitals instead. Another problem is that hosting these events can cause traffic jams and overcrowding because too many tourists visit the city at the same time. This can make daily life more difficult for local residents.

In conclusion, although hosting international sporting events can improve tourism and transportation, I believe the disadvantages are greater because of the high costs and problems for local people.`;
const input = {
  taskType: "academic_task2" as const,
  prompt: "Some people believe hosting major international sporting events brings more advantages than disadvantages. Discuss both sides and give your opinion.",
  essay, verifiedFacts: [],
  criteria: [
    { key: "TR", score_display: 7, next_step_vi: "Giải thích rõ vì sao bất lợi lớn hơn lợi ích." },
    { key: "CC", score_display: 6, next_step_vi: "Liên kết luận điểm và ví dụ tự nhiên hơn." },
    { key: "LR", score_display: 6, next_step_vi: "Dùng các cụm diễn đạt chính xác theo ngữ cảnh." },
    { key: "GRA", score_display: 6, next_step_vi: "Tăng phạm vi cấu trúc câu một cách chính xác." },
  ],
  errors: [{ category: "lexical", original_text: "spend a lot of money", suggestion: "allocate substantial public funds", explanation_vi: "Cụm từ này khá chung chung." }],
};
const task1Input = {
  taskType: "academic_task1" as const,
  prompt: "The line graph shows the share of electricity from renewable sources in Europe, South America, North America and Asia between 2000 and 2020. Summarise the main features and make comparisons.",
  essay: "The line graph compares the share of electricity generated from renewable sources in four regions between 2000 and 2020. Overall, Europe recorded the strongest growth and became the leading region by the end of the period. Asia stayed at the lowest level throughout, although its share also increased. Europe began at 15 percent in 2000. Its figure rose to 25 percent by 2010 and then climbed more rapidly, reaching 45 percent in 2020. In contrast, South America started much higher, at 35 percent, before falling to 30 percent in 2010. It recovered during the following decade and finished at 40 percent. The two regions were level at 35 percent in 2015. North America and Asia both remained below the other two regions. North America's share stayed at 10 percent from 2000 to 2010, then doubled to 20 percent in 2020. Asia increased from 5 percent at the start to 15 percent at the end.",
  verifiedFacts: [
    { id: "eu-growth", claim: "Europe rose from 15% in 2000 to 25% in 2010 and 45% in 2020." },
    { id: "sa-trajectory", claim: "South America was 35% in 2000, fell to 30% in 2010, and recovered to 40% in 2020." },
    { id: "na-trajectory", claim: "North America remained at 10% from 2000 to 2010 and reached 20% in 2020." },
    { id: "asia-trajectory", claim: "Asia had the lowest share throughout, rising from 5% in 2000 to 15% in 2020." },
    { id: "eu-sa-2015", claim: "Europe and South America were both at 35% in 2015." },
  ],
  criteria: [
    { key: "TA", score_display: 7, next_step_vi: "Nhấn mạnh điểm nổi bật và so sánh." },
    { key: "CC", score_display: 7, next_step_vi: "Nhóm các vùng theo xu hướng." },
    { key: "LR", score_display: 6, next_step_vi: "Đa dạng hóa cách diễn đạt biến động." },
    { key: "GRA", score_display: 7, next_step_vi: "Dùng câu so sánh linh hoạt." },
  ],
  errors: [],
};
const selected = process.argv.includes("--task1") ? task1Input : input;
generateDeepInsights(selected, { accountId, apiToken, proxyUrl: process.env.WRITING_CLOUDFLARE_PROXY_URL })
  .then((result) => console.log(JSON.stringify({
    task_type: selected.taskType,
    coverage: result.coverage.length, paragraphs: result.paragraphs.length,
    lexical: result.lexical.length, grammar: result.grammar.length,
    audit: result.error_audit.length, drills: result.drills.length,
    grammar_notes: result.grammar.map(({ anchor_quote, pattern_vi }) => ({ anchor_quote, pattern_vi })),
  })))
  .catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
