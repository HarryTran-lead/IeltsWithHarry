/** Synthetic transport/contract smoke only; never use its estimated band as validation. */
import { cloudflareWritingModel, gradeWithCloudflare } from "../src/lib/writing-grading/cloudflare-provider";
import { verifyModelDraft } from "../src/lib/writing-grading/contract";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.WRITING_CLOUDFLARE_PROXY_SECRET ?? process.env.CLOUDFLARE_AI_API_TOKEN;
const proxyUrl = process.env.WRITING_CLOUDFLARE_PROXY_URL;
if (!accountId || !apiToken) throw new Error("Cloudflare account ID and inference credential are required");

const essay = `Some people believe that cities should spend more money on public transport than on new roads. I agree because reliable buses and trains can move many people through limited space. A city with frequent services also gives people who cannot drive a practical way to reach work, school and health care.

One reason to invest in public transport is congestion. A new road can make a journey faster at first, but it may attract more drivers as nearby districts grow. A bus lane can carry several groups of passengers in the space used by a few cars. If services arrive regularly and fares are affordable, commuters have a reason to leave their cars at home. This could reduce delays for people who still need to drive, such as delivery workers.

Another reason is access. Building roads mainly helps households that own vehicles. Students, older residents and low income workers may gain little from an extra highway. A connected network of buses and trains gives these groups more choices. However, city leaders should not ignore roads completely. Existing roads need repairs, and emergency vehicles need safe routes. The useful approach is to maintain them while giving most new funding to transport that serves more people.

In conclusion, public transport deserves the larger share of investment because it can reduce congestion and improve access. Road maintenance remains necessary, but expanding roads should not be the first response to every traffic problem.`;

const task1Essay = `The line graph compares the share of electricity generated from renewable sources in four regions between 2000 and 2020. Overall, Europe recorded the strongest growth and became the leading region by the end of the period. Asia stayed at the lowest level throughout, although its share also increased.

Europe began at 15 percent in 2000. Its figure rose to 25 percent by 2010 and then climbed more rapidly, reaching 45 percent in 2020. In contrast, South America started much higher, at 35 percent, before falling to 30 percent in 2010. It recovered during the following decade and finished at 40 percent. The two regions were level at 35 percent in 2015.

North America and Asia both remained below the other two regions. North America's share stayed at 10 percent from 2000 to 2010, then doubled to 20 percent in 2020. Asia increased from 5 percent at the start to 15 percent at the end. Thus, all four regions ended the period above their initial figures, despite South America's temporary decline.`;
const isTask1 = process.argv.includes("--task1");
const input = isTask1 ? {
  taskType: "academic_task1" as const,
  prompt: "The line graph shows renewable electricity shares in Europe, South America, North America and Asia from 2000 to 2020. Summarise the main features and comparisons.",
  essay: task1Essay,
  visual: { figureDescription: "Europe 15% (2000), 25% (2010), 45% (2020); South America 35%, 30%, 40%; North America 10%, 10%, 20%; Asia 5% to 15%." },
  verifiedFacts: [
    { id: "eu-growth", claim: "Europe rose from 15% in 2000 to 25% in 2010 and 45% in 2020." },
    { id: "sa-trajectory", claim: "South America was 35% in 2000, fell to 30% in 2010, and recovered to 40% in 2020." },
    { id: "na-trajectory", claim: "North America remained at 10% from 2000 to 2010 and reached 20% in 2020." },
    { id: "asia-trajectory", claim: "Asia had the lowest share throughout, rising from 5% in 2000 to 15% in 2020." },
    { id: "eu-sa-2015", claim: "Europe and South America were both at 35% in 2015." },
  ],
} : {
  taskType: "academic_task2" as const,
  prompt: "Cities should spend more money on public transport than new roads. To what extent do you agree or disagree?",
  essay,
  visual: null,
  verifiedFacts: [],
};

async function main() {
  const started = Date.now();
  const draft = await gradeWithCloudflare(input, { accountId: accountId!, apiToken: apiToken!, proxyUrl });
  const checked = verifyModelDraft(draft, input.taskType, input.essay, input.verifiedFacts.map((fact) => fact.id));
  console.log(JSON.stringify({ model: cloudflareWritingModel, task_type: input.taskType, elapsed_ms: Date.now() - started, criteria: checked.criteria.map(({ key, score_display }) => ({ key, score_display })), evidence_count: checked.criteria.reduce((sum, item) => sum + item.evidence.length, 0), error_count: checked.errors.length, vocabulary_count: checked.vocabulary_suggestions.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
