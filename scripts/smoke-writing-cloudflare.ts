/** Synthetic transport/contract smoke only; never use its estimated band as validation. */
import { cloudflareWritingModel, gradeWithCloudflare } from "../src/lib/writing-grading/cloudflare-provider";
import { verifyModelDraft } from "../src/lib/writing-grading/contract";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;
if (!accountId || !apiToken) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN are required");

const essay = `Some people believe that cities should spend more money on public transport than on new roads. I agree because reliable buses and trains can move many people through limited space. A city with frequent services also gives people who cannot drive a practical way to reach work, school and health care.

One reason to invest in public transport is congestion. A new road can make a journey faster at first, but it may attract more drivers as nearby districts grow. A bus lane can carry several groups of passengers in the space used by a few cars. If services arrive regularly and fares are affordable, commuters have a reason to leave their cars at home. This could reduce delays for people who still need to drive, such as delivery workers.

Another reason is access. Building roads mainly helps households that own vehicles. Students, older residents and low income workers may gain little from an extra highway. A connected network of buses and trains gives these groups more choices. However, city leaders should not ignore roads completely. Existing roads need repairs, and emergency vehicles need safe routes. The useful approach is to maintain them while giving most new funding to transport that serves more people.

In conclusion, public transport deserves the larger share of investment because it can reduce congestion and improve access. Road maintenance remains necessary, but expanding roads should not be the first response to every traffic problem.`;

const started = Date.now();
const draft = await gradeWithCloudflare(
  { taskType: "academic_task2", prompt: "Cities should spend more money on public transport than new roads. To what extent do you agree or disagree?", essay, visual: null, verifiedFacts: [] },
  { accountId, apiToken },
);
const checked = verifyModelDraft(draft, "academic_task2", essay, []);
console.log(JSON.stringify({ model: cloudflareWritingModel, elapsed_ms: Date.now() - started, criteria: checked.criteria.map(({ key, score_display }) => ({ key, score_display })), evidence_count: checked.criteria.reduce((sum, item) => sum + item.evidence.length, 0), error_count: checked.errors.length }));
