import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ieltsQuestionTypes } from "../src/lib/news/ielts-passage";
import { ArticleRequestBudget, FactoryProviderError, alternateV2Model, strictGeminiJson } from "../src/lib/news/question-factory-v2/provider";
import { MAX_ARTICLE_REQUESTS, generateNewsQuizV2, v2Timing, withEvidenceSpans } from "../src/lib/news/question-factory-v2";
import { selectQuestionTypes } from "../src/lib/news/adaptive-quiz";
import { MAP_SYSTEM, blindQaPayload, generationPrompt, generationSchema, mapSchema, planBatches } from "../src/lib/news/question-factory-v2/prompts";
import { paragraphLabel, validateBlindReview, validateCandidate, validateGeneration, validatePassageMap } from "../src/lib/news/question-factory-v2/validate";
import { article, map, positiveFixtures } from "./fixtures/news-factory-v2";

describe("Question Factory V2 editorial corpus", () => {
  it("contains 14 forms at P1, P2 and P3", () => {
    expect(positiveFixtures).toHaveLength(42);
    for (const type of ieltsQuestionTypes) {
      expect(positiveFixtures.filter((item) => item.type === type).map((item) => item.difficulty)).toEqual(["P1", "P2", "P3"]);
    }
  });
  it.each(positiveFixtures)("$id is structurally valid", (item) => {
    expect(validateCandidate(item, article, map)).toEqual([]);
  });
  it.each(ieltsQuestionTypes)("%s rejects an unsupported citation", (type) => {
    const item = positiveFixtures.find((candidate) => candidate.type === type)!;
    expect(validateCandidate({ ...item, supporting_sentence: "An invented passage detail with no source." }, article, map)).toContain("EVIDENCE");
  });
  it("rejects a real quote paired with a wrong source offset", () => {
    const item = positiveFixtures[0];
    expect(validateCandidate({ ...item, evidence_spans: [{ ...item.evidence_spans[0], start: 0 }] }, article, map))
      .toContain("EVIDENCE_OFFSETS");
  });
  const formNegatives: { type: typeof ieltsQuestionTypes[number]; change: (item: typeof positiveFixtures[number]) => typeof positiveFixtures[number]; code: string }[] = [
    { type: "mcq", change: (item) => ({ ...item, options: item.options.slice(0, 3), option_notes: item.option_notes.slice(0, 3) }), code: "MCQ_FOUR" },
    { type: "tfng", change: (item) => ({ ...item, options: ["True", "False", "Maybe"] }), code: "CHOICE_POOL" },
    { type: "ynng", change: (item) => item, code: "NO_WRITER_VIEW" },
    { type: "matching_headings", change: (item) => ({ ...item, prompt: "Choose the best heading for this section." }), code: "HEADING_PARAGRAPH" },
    { type: "matching_information", change: (item) => ({ ...item, options: ["A", "B", "C"] }), code: "INFORMATION_PARAGRAPHS" },
    { type: "matching_features", change: (item) => ({ ...item, option_notes: [] }), code: "OPTION_NOTES" },
    { type: "matching_sentence_endings", change: (item) => ({ ...item, prompt: item.prompt + "." }), code: "SENTENCE_STEM" },
    { type: "sentence_completion", change: (item) => ({ ...item, prompt: item.prompt.replace("______", "some") }), code: "ONE_GAP" },
    { type: "summary_completion", change: (item) => ({ ...item, prompt: item.prompt + " and ______" }), code: "ONE_GAP" },
    { type: "note_completion", change: (item) => ({ ...item, answer: "a very long answer" }), code: "WRITTEN_ANSWER" },
    { type: "table_completion", change: (item) => ({ ...item, prompt: item.prompt.replace(":", " -") }), code: "TABLE_ROW" },
    { type: "flow_chart_completion", change: (item) => ({ ...item, prompt: item.prompt.replace("Step 1:", "Event:") }), code: "FLOW_PROCESS" },
    { type: "diagram_label_completion", change: (item) => ({ ...item, prompt: item.prompt.replace("middle charcoal layer", "invented silver layer") }), code: "DIAGRAM" },
    { type: "short_answer", change: (item) => ({ ...item, prompt: item.prompt.replace("?", ".") }), code: "SHORT_QUESTION" },
  ];
  it.each(formNegatives)("$type rejects a form-specific defect", ({ type, change, code }) => {
    const item = positiveFixtures.find((candidate) => candidate.type === type)!;
    const alteredMap = type === "ynng" ? { ...map, writer_view: "" } : map;
    expect(validateCandidate(change(item), article, alteredMap)).toContain(code);
  });
  it("rejects incorrect matching pools and repeated facts", () => {
    const matching = positiveFixtures.filter((item) => item.type === "matching_features").map((item) => ({ ...item }));
    matching[1].options = [...matching[1].options].reverse();
    const result = validateGeneration({ passage_map: map, questions: matching, image_query: "" }, article, ["matching_features"]);
    expect(result.issues).toContain("matching_features_group:MATCHING_POOL");
  });
  it("rejects inconsistent note word limits and a fake flow process", () => {
    const notes = positiveFixtures.filter((item) => item.type === "note_completion").map((item) => ({ ...item }));
    notes[1].prompt = notes[1].prompt.replace("[W1]", "[W2]");
    expect(validateGeneration({ passage_map: map, questions: notes, image_query: "" }, article, ["note_completion"]).issues)
      .toContain("note_completion_group:WORD_LIMIT");
    const flow = positiveFixtures.find((item) => item.type === "flow_chart_completion")!;
    expect(validateCandidate(flow, article, { ...map, process_steps: [] })).toContain("FLOW_PROCESS");
  });
  it("blind review receives no author key, evidence or explanation", () => {
    const candidate = positiveFixtures[0];
    const payload = blindQaPayload(article, [candidate]);
    expect(payload).toContain(candidate.prompt);
    expect(payload).not.toContain('"correct_index"');
    expect(payload).not.toContain('"supporting_sentence"');
    expect(payload).not.toContain('"explanation"');
  });
  it("allocates 11 items without exhausting the heading option pool", () => {
    const prompt = generationPrompt(["matching_headings", "mcq", "tfng"], 11, "");
    expect(prompt).toContain("matching_headings: 3, mcq: 4, tfng: 4");
  });
  it("requires complete independent answers and blocks disagreement", () => {
    const candidate = positiveFixtures[0];
    const good = { reviews: [{ id: candidate.id, status: "answerable" as const,
      independent_answer: candidate.options[candidate.correct_index], competing_answers: [],
      paraphrase_faithful: true, distractors_fair: true, form_valid: true, reason_vi: "Có bằng chứng." }] };
    expect(validateBlindReview(good, [candidate]).accepted).toHaveLength(1);
    expect(validateBlindReview({ reviews: [] }, [candidate]).issues).toContain("QA_COVERAGE");
    const bad = { reviews: [{ ...good.reviews[0], independent_answer: "wrong" }] };
    expect(validateBlindReview(bad, [candidate]).issues).toContain(`${candidate.id}:QA_MISMATCH`);
    const unfair = { reviews: [{ ...good.reviews[0], distractors_fair: false }] };
    expect(validateBlindReview(unfair, [candidate]).accepted).toHaveLength(0);
  });
});

describe("passage map paragraph labels", () => {
  it("normalises common model spellings to source-order letters", () => {
    expect(["A", "b", "B.", "(C)", "Paragraph D", "1", "P2", "Paragraph 3", "intro"].map(paragraphLabel))
      .toEqual(["A", "B", "B", "C", "D", "A", "B", "C", "I"]);
  });
  it("accepts a map whose ids came back as P1, P2 ... (the production failure)", () => {
    const numbered = { ...map, paragraphs: map.paragraphs.map((paragraph, index) => ({ ...paragraph, id: `P${index + 1}` })) };
    expect(validatePassageMap(numbered, article)).not.toContain("PASSAGE_MAP_PARAGRAPH");
  });
  it("keeps valid questions when only paragraph metadata is wrong, but drops paragraph matching", () => {
    const broken = { ...map, paragraphs: map.paragraphs.map((paragraph) => ({ ...paragraph, main_idea: "" })) };
    const mcq = positiveFixtures.filter((item) => item.type === "mcq");
    const info = positiveFixtures.filter((item) => item.type === "matching_information");
    const result = validateGeneration({ passage_map: broken, questions: [...mcq, ...info], image_query: "" },
      article, ["mcq", "matching_information"]);
    expect(result.issues).toContain("PASSAGE_MAP_PARAGRAPH");
    expect(result.valid.map((item) => item.id)).toEqual(mcq.map((item) => item.id));
    expect(result.issues.some((issue) => issue.endsWith("PARAGRAPH_MAP_UNRELIABLE"))).toBe(true);
  });
  it("still rejects everything when the map shape itself is broken", () => {
    const mcq = positiveFixtures.filter((item) => item.type === "mcq");
    const result = validateGeneration({ passage_map: { ...map, paragraphs: undefined } as unknown as typeof map,
      questions: mcq, image_query: "" }, article, ["mcq"]);
    expect(result.valid).toEqual([]);
    expect(result.issues).toContain("PASSAGE_MAP_SCHEMA");
  });
  it("splits a set into batches of at most five items without splitting a form", () => {
    expect(planBatches(["mcq", "short_answer"], [3, 3])).toEqual([{ types: ["mcq"], counts: [3] }, { types: ["short_answer"], counts: [3] }]);
    expect(planBatches(["tfng", "mcq", "short_answer"], [2, 2, 1])).toEqual([{ types: ["tfng", "mcq", "short_answer"], counts: [2, 2, 1] }]);
    expect(planBatches(["matching_headings", "mcq"], [3, 0])).toEqual([{ types: ["matching_headings"], counts: [3] }]);
    expect(MAP_SYSTEM).toContain("exactly one capital letter");
    expect((mapSchema.properties.passage_map as { properties: { paragraphs: { maxItems: number } } }).properties.paragraphs.maxItems).toBe(12);
  });
  it("computes evidence offsets from the exact supporting sentence", () => {
    const item = positiveFixtures[0];
    const computed = withEvidenceSpans({ ...item, evidence_spans: [] }, article);
    expect(computed.evidence_spans).toEqual([{ start: article.indexOf(item.supporting_sentence),
      end: article.indexOf(item.supporting_sentence) + item.supporting_sentence.length, quote: item.supporting_sentence }]);
    expect(withEvidenceSpans({ ...item, supporting_sentence: "Not in the article at all." }, article).evidence_spans).toEqual([]);
  });
  it("tells the model the exact id format in both prompt and schema", () => {
    expect(generationPrompt(["mcq"], 6, "")).toContain("exactly one capital letter");
    const schema = generationSchema(["mcq"]) as unknown as { properties: { passage_map: { properties: {
      paragraphs: { maxItems: number; items: { properties: { id: { enum: string[] } } } } } } } };
    const paragraphs = schema.properties.passage_map.properties.paragraphs;
    expect(paragraphs.maxItems).toBe(12);
    expect(paragraphs.items.properties.id.enum).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);
  });
});

beforeAll(() => { v2Timing.outageRetryDelayMs = 0; });
/** Blind QA reply for exactly the ids in the request payload; ids in `wrong` get a disagreeing answer. */
function qaReplyFor(text: string, pool: typeof positiveFixtures, wrong = new Set<string>()) {
  const listed = JSON.parse(text.slice(text.indexOf("ANSWER-STRIPPED ITEMS:") + "ANSWER-STRIPPED ITEMS:".length)) as { id: string }[];
  return { reviews: listed.map(({ id }) => {
    const item = pool.find((candidate) => candidate.id === id)!;
    return { id, status: "answerable", independent_answer: wrong.has(id) ? "a different answer"
      : item.correct_index < 0 ? item.answer : item.options[item.correct_index],
    competing_answers: [], paraphrase_faithful: true, distractors_fair: true, form_valid: true, reason_vi: "Câu này có một đáp án rõ ràng." };
  }) };
}
/** A passage and article id that select mcq and short_answer, with six valid fixtures. */
function sixItemCase(prefix: string) {
  const filler = Array.from({ length: 12 }, (_, i) =>
    `The community bulletin number ${i + 1} explained how residents could compare readings from different months, ask the local office for help, and keep printed records for later discussion.`).join(" ");
  const passage = article + " " + filler;
  const words = passage.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const id = Array.from({ length: 20000 }, (_, n) => `${prefix}-${n}`).find((key) => {
    const selected = selectQuestionTypes(passage, words, key);
    return selected.includes("mcq") && selected.includes("short_answer");
  })!;
  const questions = positiveFixtures.filter((item) => item.type === "mcq" || item.type === "short_answer")
    .map((item) => ({ ...item, difficulty: item.id === "short_answer_p1" ? "P2" as const : item.difficulty,
      paraphrase_depth: item.id === "short_answer_p1" ? 2 as const : item.paraphrase_depth }));
  return { passage, id, questions };
}
const modelOf = (url: string | URL | Request) => /models\/([^:]+):/.exec(String(url))?.[1];
type Step = "map" | "batch" | "repair" | "qa";
/** Which factory step a mocked Gemini request belongs to, and the forms a batch asked for. */
function stepOf(init?: RequestInit) {
  const body = JSON.parse(String(init?.body));
  const system = body.systemInstruction.parts[0].text as string;
  const text = body.contents[0].parts[0].text as string;
  const step: Step = system.includes("REPAIR TASK") ? "repair" : system.includes("PASSAGE MAP.") ? "map"
    : system.includes("QUESTION BATCH") ? "batch" : "qa";
  const types = (body.generationConfig?.responseFormat?.text?.schema?.properties?.questions?.items?.properties?.type?.enum ?? []) as string[];
  return { step, text, types };
}
/** A well-behaved split factory: map, the requested forms from `pool`, and blind QA answers. */
function factoryData(init: RequestInit | undefined, pool: typeof positiveFixtures, wrong = new Set<string>()) {
  const { step, text, types } = stepOf(init);
  if (step === "map") return { passage_map: map, image_query: "harbor water" };
  if (step === "batch") return { questions: pool.filter((item) => types.includes(item.type)) };
  return qaReplyFor(text, pool, wrong);
}
const gemini = (data: unknown, n = 1) => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }],
  usageMetadata: { promptTokenCount: n * 100, candidatesTokenCount: n * 50, totalTokenCount: n * 150 } });
afterEach(() => { v2Timing.runBudgetMs = 120_000; });

describe("two request free-tier budget", () => {
  const oldEnv = {
    only: process.env.AI_FACTORY_FREE_TIER_ONLY,
    confirmed: process.env.AI_FACTORY_FREE_TIER_CONFIRMED,
    key: process.env.AI_FACTORY_GEMINI_API_KEY,
  };
  afterEach(() => {
    if (oldEnv.only === undefined) delete process.env.AI_FACTORY_FREE_TIER_ONLY; else process.env.AI_FACTORY_FREE_TIER_ONLY = oldEnv.only;
    if (oldEnv.confirmed === undefined) delete process.env.AI_FACTORY_FREE_TIER_CONFIRMED; else process.env.AI_FACTORY_FREE_TIER_CONFIRMED = oldEnv.confirmed;
    if (oldEnv.key === undefined) delete process.env.AI_FACTORY_GEMINI_API_KEY; else process.env.AI_FACTORY_GEMINI_API_KEY = oldEnv.key;
  });
  it("counts attempts before a failed response and never invokes a third call", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    let calls = 0;
    const fake = (async () => { calls++; return new Response("", { status: 503 }); }) as typeof fetch;
    const budget = new ArticleRequestBudget();
    for (let i = 0; i < 2; i++)
      await expect(strictGeminiJson("system", "user", {}, budget, fake)).rejects.toBeInstanceOf(FactoryProviderError);
    await expect(strictGeminiJson("system", "user", {}, budget, fake)).rejects.toThrow("budget exhausted");
    expect(calls).toBe(2);
    expect(budget.used).toBe(2);
  });
  it("marks a Gemini 503 as a retryable outage instead of an article failure", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    let calls = 0;
    const fake = (async () => { calls++; return new Response("", { status: 503 }); }) as typeof fetch;
    await expect(strictGeminiJson("system", "user", {}, new ArticleRequestBudget(), fake))
      .rejects.toMatchObject({ kind: "unavailable" });
    const passage = article + " " + "Residents compared monthly readings and kept printed records for later discussion. ".repeat(40);
    const output = await generateNewsQuizV2("Outage", passage, "outage-case", fake);
    expect(output.state).toBe("PENDING_PROVIDER");
    expect(output.audit.retryable).toBe(true);
    // Three attempts on each Flash-Lite model, then the article waits for the next run.
    expect(output.audit.requests).toBe(6);
    expect(calls).toBe(7);
  });
  it("keeps Google's error status, message and wait for diagnosis", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const fake = (async () => Response.json({ error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded. Please try again later." } },
      { status: 503 })) as typeof fetch;
    await expect(strictGeminiJson("system", "user", {}, new ArticleRequestBudget(), fake))
      .rejects.toThrow("Gemini returned HTTP 503 (gemini-3.5-flash-lite: UNAVAILABLE: The model is overloaded. Please try again later.; after");
    const empty = (async () => new Response("", { status: 503 })) as typeof fetch;
    await expect(strictGeminiJson("system", "user", {}, new ArticleRequestBudget(), empty)).rejects.toThrow("no error body");
  });
  it("does not mark a malformed 4xx request as retryable", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const fake = (async () => new Response("", { status: 400 })) as typeof fetch;
    const passage = article + " " + "Residents compared monthly readings and kept printed records for later discussion. ".repeat(40);
    const output = await generateNewsQuizV2("Bad request", passage, "bad-request-case", fake);
    expect(output.state).toBe("PENDING_PROVIDER");
    expect(output.audit.retryable).toBe(false);
    expect(output.audit.failure).toBe("rejected");
  });
  it("labels each provider failure with the reason the worker acts on", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const passage = article + " " + "Residents compared monthly readings and kept printed records for later discussion. ".repeat(40);
    const run = (id: string, reply: () => Response) => generateNewsQuizV2("Reason", passage, id, (async () => reply()) as typeof fetch);
    expect((await run("reason-503", () => new Response("", { status: 503 }))).audit.failure).toBe("unavailable");
    expect((await run("reason-401", () => new Response("", { status: 401 }))).audit.failure).toBe("config");
    expect((await run("reason-404", () => new Response("", { status: 404 }))).audit.failure).toBe("config");
    const truncated = await run("reason-cut", () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }));
    expect(truncated.audit.failure).toBe("incomplete");
    const quota = await run("reason-429", () => Response.json({ error: { message: "Requests per day limit exceeded" } },
      { status: 429, headers: { "retry-after": "60" } }));
    expect(quota.state).toBe("PENDING_QUOTA");
    expect(quota.audit).toMatchObject({ failure: "quota", retryable: true, retry_after_ms: 60000 });
    const short = await generateNewsQuizV2("Short", "Too short for a quiz.", "reason-short", (async () => { throw Error("must not call"); }) as typeof fetch);
    expect(short.audit).toMatchObject({ failure: "too_short", requests: 0 });
  });
  it("caps requests per article and pairs the Flash-Lite models", async () => {
    expect(MAX_ARTICLE_REQUESTS).toBe(30);
    const budget = new ArticleRequestBudget(3);
    for (let i = 0; i < 3; i++) budget.reserve();
    expect(() => budget.reserve()).toThrow("budget exhausted");
    expect(alternateV2Model("gemini-3.5-flash-lite")).toBe("gemini-3.1-flash-lite");
    expect(alternateV2Model("gemini-3.1-flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(alternateV2Model("gemini-9-pro")).toBe("gemini-9-pro");
  });
  it("retries a 503 three times per model, switches model, and publishes", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("outage-retry");
    const urls: string[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      if (urls.length <= 3) return new Response("", { status: 503 });
      return gemini(factoryData(init, questions));
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(output.state).toBe("READY");
    expect(output.model).toBe("gemini-3.1-flash-lite");
    // map x3 on 3.5 (503), map + two batches + QA on 3.1, cross QA on 3.5.
    expect(urls.map(modelOf)).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    expect(output.audit.requests).toBe(8);
  });
  it("stops after six generation attempts, or earlier when the run time budget is spent", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const passage = article + " " + "Residents compared monthly readings and kept printed records for later discussion. ".repeat(40);
    let calls = 0;
    const output = await generateNewsQuizV2("Budget", passage, "retry-run-budget", (async () => { calls++; return new Response("", { status: 503 }); }) as typeof fetch);
    expect(calls).toBe(6);
    v2Timing.runBudgetMs = 0;
    let late = 0;
    const capped = await generateNewsQuizV2("Budget", passage, "retry-run-budget-2", (async () => { late++; return new Response("", { status: 503 }); }) as typeof fetch);
    // No retry starts when a full request would overrun the function's time budget.
    expect(late).toBe(1);
    expect(capped.audit).toMatchObject({ failure: "unavailable", requests: 1 });
    expect(output.audit.requests).toBe(6);
  });
  it("does not retry a 4xx, and retries a QA outage like generation", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const passage = article + " " + "Residents compared monthly readings and kept printed records for later discussion. ".repeat(40);
    let calls = 0;
    const rejected = await generateNewsQuizV2("Rejected", passage, "no-retry-400", (async () => { calls++; return new Response("", { status: 400 }); }) as typeof fetch);
    expect(rejected.audit.requests).toBe(1);
    expect(calls).toBe(1);
    const { passage: longer, id, questions } = sixItemCase("qa-outage");
    let qaCalls = 0;
    const qaOutage = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (stepOf(init).step === "qa") { qaCalls++; return new Response("", { status: 503 }); }
      return gemini(factoryData(init, questions));
    }) as typeof fetch;
    const output = await generateNewsQuizV2("QA outage", longer, id, qaOutage);
    expect(output.audit.deterministic_pass).toBe(6);
    expect(output.state).toBe("PENDING_PROVIDER");
    expect(output.audit.failure).toBe("unavailable");
    // Map, two batches, then three QA attempts on each model.
    expect(qaCalls).toBe(6);
    expect(output.audit.requests).toBe(9);
  });
  it("halts before any call without confirmed free tier", async () => {
    delete process.env.AI_FACTORY_FREE_TIER_CONFIRMED;
    const budget = new ArticleRequestBudget();
    const fake = (async () => { throw Error("must not call"); }) as typeof fetch;
    await expect(strictGeminiJson("system", "user", {}, budget, fake)).rejects.toThrow("Free Tier");
    expect(budget.used).toBe(0);
  });
  it("classifies a quota response without a fallback request", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    let calls = 0;
    const fake = (async () => { calls++; return Response.json({
      error: { message: "Requests per day limit exceeded" },
    }, { status: 429, headers: { "retry-after": "60" } }); }) as typeof fetch;
    const budget = new ArticleRequestBudget();
    await expect(strictGeminiJson("system", "user", {}, budget, fake)).rejects.toThrow("quota RPD; retry-after=60");
    expect(calls).toBe(1);
    expect(budget.used).toBe(1);
  });
  it("runs generation, blind QA and a cross-model check of risky items", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("fixture");
    const steps: string[] = [];
    let calls = 0;
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const { step, text } = stepOf(init);
      steps.push(step);
      if (step === "qa") {
        expect(text).toContain(passage);
        expect(text).not.toContain('"correct_index"');
        expect(text).not.toContain('"supporting_sentence"');
      }
      if (calls === 5) expect(modelOf(url)).toBe("gemini-3.1-flash-lite");
      return gemini(factoryData(init, questions), calls);
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(steps).toEqual(["map", "batch", "batch", "qa", "qa"]);
    expect(output.state).toBe("READY");
    expect(output.audit.failure).toBeNull();
    expect(output.questions).toHaveLength(6);
    expect(output.audit.requests).toBe(5);
    expect(output.audit.generation_tokens?.total).toBe(150 + 300 + 450);
    expect(output.audit.qa_tokens?.total).toBe(600 + 750);
    const cached = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(cached.audit.requests).toBe(0);
    expect(calls).toBe(5);
  });
  it("repairs a rejected item once instead of dropping the whole quiz", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("repair");
    const steps: string[] = [];
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      const { step } = stepOf(init);
      steps.push(step);
      if (step === "repair") return gemini({ questions: questions.filter((item) => item.id === "mcq_p2") });
      // The first QA disagrees on one item; every later check agrees.
      const firstQa = step === "qa" && steps.filter((value) => value === "qa").length === 1;
      return gemini(factoryData(init, questions, firstQa ? new Set(["mcq_p2"]) : new Set()));
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Repair", passage, id, fake);
    expect(steps).toEqual(["map", "batch", "batch", "qa", "repair", "qa", "qa"]);
    expect(output.state).toBe("READY");
    expect(output.questions).toHaveLength(6);
    expect(output.audit.requests).toBe(7);
    expect(output.audit.issues).toContain("REPAIR:1/1");
    // A per-item disagreement is recorded but no longer blocks a set that ends with six approved items.
    expect(output.audit.issues).toContain("mcq_p2:QA_MISMATCH");
  });
  it("drops a risky item the second model disagrees with", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("cross");
    let qa = 0;
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (stepOf(init).step === "qa") qa++;
      return gemini(factoryData(init, questions, qa === 2 ? new Set(["mcq_p3"]) : new Set()));
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Cross", passage, id, fake);
    expect(output.state).toBe("PENDING_QUALITY");
    expect(output.audit.issues).toEqual(expect.arrayContaining(["CROSS_QA_DROPPED:1", "TOO_FEW_APPROVED"]));
    expect(output.audit.failure).toBe("quality");
  });
  it("sends complete source text to every generation step even beyond the legacy excerpt", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const longArticle = article + " " + "A routine report described another small water reading in the public register. ".repeat(220)
      + "TAIL FACT: private wells remained untested.";
    let calls = 0;
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      expect(String(init?.body)).toContain("TAIL FACT: private wells remained untested.");
      const { step } = stepOf(init);
      return gemini(step === "map" ? { passage_map: map, image_query: "" } : { questions: [] });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Full source check", longArticle, "full-source-case", fake);
    expect(output.state).toBe("PENDING_QUALITY");
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(output.audit.requests).toBe(calls);
  });
  it("keeps the other batches when one batch hits an outage, and treats a short set as an outage", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("batch-outage");
    const steps: string[] = [];
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      const { step, types } = stepOf(init);
      steps.push(step === "batch" ? `batch:${types.join("+")}` : step);
      if (step === "batch" && types.includes("short_answer")) return new Response("", { status: 503 });
      return gemini(factoryData(init, questions));
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Batch outage", passage, id, fake);
    expect(steps.filter((step) => step === "batch:short_answer")).toHaveLength(6);
    expect(steps).toContain("batch:mcq");
    expect(output.audit.candidate_count).toBe(3);
    expect(output.state).toBe("PENDING_PROVIDER");
    expect(output.audit.retryable).toBe(true);
  });
  it("renames ids that two batches both used", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("same-ids");
    const clash = questions.map((item, index) => ({ ...item, id: `q${index % 3}`, group_id: `g${index % 3}` }));
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => gemini(factoryData(init, clash))) as typeof fetch;
    const output = await generateNewsQuizV2("Same ids", passage, id, fake);
    expect(output.audit.issues.some((issue) => issue.includes("DUPLICATE_ID"))).toBe(false);
    expect(output.audit.deterministic_pass).toBe(6);
  });
});

describe("candidate normalization", () => {
  it("fixes presentation slips without touching what an item tests", async () => {
    const { normalizeCandidate } = await import("../src/lib/news/question-factory-v2");
    const choice = normalizeCandidate({ type: "mcq", answer: "B", options: ["a", "b", "c", "d"], correct_index: 1, prompt: "Which is true?" } as never);
    expect(choice.answer).toBe("");
    expect(choice.correct_index).toBe(1);
    const bracket = normalizeCandidate({ type: "sentence_completion", prompt: "The probe was cooled to [gap] before launch.", answer: "minus 200", options: ["x"], option_notes: [], correct_index: 0 } as never);
    expect(bracket.prompt).toBe("The probe was cooled to ______ before launch.");
    expect(bracket.options).toEqual([]);
    expect(bracket.correct_index).toBe(-1);
    const ellipsis = normalizeCandidate({ type: "summary_completion", prompt: "Engineers fitted ______ to the rotor…", answer: "cameras", options: [], option_notes: [], correct_index: -1 } as never);
    expect(ellipsis.prompt).toBe("Engineers fitted ______ to the rotor");
    const spelled = normalizeCandidate({ type: "note_completion", prompt: "Cameras built by Malin Space Science Systems [W3]", answer: "Malin Space Science", options: [], option_notes: [], correct_index: -1 } as never);
    expect(spelled.prompt).toBe("Cameras built by ______ Systems [W3]");
    const two = normalizeCandidate({ type: "sentence_completion", prompt: "A ______ and a ______.", answer: "x", options: [], option_notes: [], correct_index: -1 } as never);
    expect(two.prompt).toBe("A ______ and a ______.");
  });
});
