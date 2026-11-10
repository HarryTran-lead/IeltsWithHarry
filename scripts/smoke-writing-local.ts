/** Synthetic Task 2 inference check. Never loads a learner's essay or writes a grade. */
import { verifyModelDraft } from "../src/lib/writing-grading/contract";
import { gradeWithLocalModel, verifyLocalModelRevision } from "../src/lib/writing-grading/local-provider";

const url = process.env.WRITING_LOCAL_MODEL_URL || "http://127.0.0.1:11434";
const model = process.env.WRITING_LOCAL_MODEL_ID;
const revision = process.env.WRITING_LOCAL_MODEL_REVISION;
if (!model || !revision) throw new Error("Set WRITING_LOCAL_MODEL_ID and WRITING_LOCAL_MODEL_REVISION");

const prompt = "Some shops, buses and cafés no longer accept cash and take payment only by card or phone. Discuss the advantages and disadvantages of a society in which cash is no longer accepted.";
const essay = `Cashless payments are now common in everyday life. Paying by phone or card is convenient for many people, but a society without cash can also leave some people behind. Both benefits and risks should be considered before cash is removed entirely.

One clear advantage is speed. Passengers can tap a card when boarding a bus, and customers can pay at a busy café without waiting for change. Digital records can also help small businesses check their sales and spot mistakes. For example, a shop owner can compare the number of transactions with the goods sold at the end of each day. A contactless system may also reduce the amount of cash staff must carry, which can lower the risk of theft.

However, cashless payment is not equally accessible. Some older people do not own smartphones, and some families do not have bank accounts. A person who cannot use a card should still be able to buy food or travel home. Technical problems create another risk. If a network fails or a phone battery dies, a customer may be unable to complete a purchase even when they have enough money. Digital payments can also reveal personal spending habits, so strong privacy rules are necessary.

In conclusion, card and phone payments make many purchases quicker and easier to record. Nevertheless, removing cash too soon would exclude some people and make daily life vulnerable to technical failures. Keeping cash as an option while improving digital access is a more balanced approach.`;

async function main() {
  await verifyLocalModelRevision({ url, model: model!, revision: revision! });
  const started = Date.now();
  const draft = await gradeWithLocalModel({ taskType: "academic_task2", prompt, essay, visual: null, verifiedFacts: [] }, { url, model: model! });
  const result = verifyModelDraft(draft, "academic_task2", essay, []);
  console.log(JSON.stringify({
    task: result.task_type, model, revision, elapsed_ms: Date.now() - started,
    schema_valid: true, evidence_count: result.criteria.reduce((total, item) => total + item.evidence.length, 0),
    error_count: result.errors.length, estimated_band_unvalidated: result.task_band_display,
  }));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "Smoke failed"); process.exitCode = 1; });
