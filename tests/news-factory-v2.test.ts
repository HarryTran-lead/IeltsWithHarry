import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ieltsQuestionTypes } from "../src/lib/news/ielts-passage";
import { ArticleRequestBudget, FactoryProviderError, alternateV2Model, strictGeminiJson } from "../src/lib/news/question-factory-v2/provider";
import { MAX_ARTICLE_REQUESTS, generateNewsQuizV2, v2Timing } from "../src/lib/news/question-factory-v2";
import { selectQuestionTypes } from "../src/lib/news/adaptive-quiz";
import { blindQaPayload, generationPrompt, generationSchema } from "../src/lib/news/question-factory-v2/prompts";
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
    expect(MAX_ARTICLE_REQUESTS).toBe(15);
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
    const filler = Array.from({ length: 12 }, (_, i) =>
      `The community bulletin number ${i + 1} explained how residents could compare readings from different months, ask the local office for help, and keep printed records for later discussion.`).join(" ");
    const passage = article + " " + filler;
    const words = passage.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    const id = Array.from({ length: 10000 }, (_, n) => `outage-retry-${n}`).find((key) => {
      const selected = selectQuestionTypes(passage, words, key);
      return selected.includes("mcq") && selected.includes("short_answer");
    })!;
    const questions = positiveFixtures.filter((item) => item.type === "mcq" || item.type === "short_answer")
      .map((item) => ({ ...item, difficulty: item.id === "short_answer_p1" ? "P2" as const : item.difficulty,
        paraphrase_depth: item.id === "short_answer_p1" ? 2 as const : item.paraphrase_depth }));
    const urls: string[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      urls.push(String(url));
      if (urls.length <= 3) return new Response("", { status: 503 });
      const data = urls.length === 4 ? { passage_map: map, questions, image_query: "harbor water" }
        : qaReplyFor(JSON.parse(String(init?.body)).contents[0].parts[0].text, questions);
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }] });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(output.state).toBe("READY");
    expect(output.audit.requests).toBe(6);
    expect(output.model).toBe("gemini-3.1-flash-lite");
    expect(urls.map(modelOf)).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
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
    const filler = Array.from({ length: 12 }, (_, i) =>
      `The community bulletin number ${i + 1} explained how residents could compare readings from different months, ask the local office for help, and keep printed records for later discussion.`).join(" ");
    const longer = article + " " + filler;
    const words = longer.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    const id = Array.from({ length: 10000 }, (_, n) => `qa-outage-${n}`).find((key) => {
      const selected = selectQuestionTypes(longer, words, key);
      return selected.includes("mcq") && selected.includes("short_answer");
    })!;
    const questions = positiveFixtures.filter((item) => item.type === "mcq" || item.type === "short_answer")
      .map((item) => ({ ...item, difficulty: item.id === "short_answer_p1" ? "P2" as const : item.difficulty,
        paraphrase_depth: item.id === "short_answer_p1" ? 2 as const : item.paraphrase_depth }));
    let qaCalls = 0;
    const qaOutage = (async () => {
      qaCalls++;
      if (qaCalls === 1) return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
        passage_map: map, questions, image_query: "" }) }] } }] });
      return new Response("", { status: 503 });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("QA outage", longer, id, qaOutage);
    expect(output.audit.deterministic_pass).toBe(6);
    expect(output.state).toBe("PENDING_PROVIDER");
    expect(output.audit.failure).toBe("unavailable");
    // One generation plus three QA attempts on each model.
    expect(output.audit.requests).toBe(7);
    expect(qaCalls).toBe(7);
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
    const filler = Array.from({ length: 12 }, (_, i) =>
      `The community bulletin number ${i + 1} explained how residents could compare readings from different months, ask the local office for help, and keep printed records for later discussion.`).join(" ");
    const passage = article + " " + filler;
    const excerptWords = passage.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    expect(excerptWords).toBeGreaterThanOrEqual(400);
    expect(excerptWords).toBeLessThan(500);
    const id = Array.from({ length: 10000 }, (_, n) => `fixture-${n}`).find((key) => {
      const selected = selectQuestionTypes(passage, excerptWords, key);
      return selected.includes("mcq") && selected.includes("short_answer");
    })!;
    expect(id).toBeTruthy();
    const questions = positiveFixtures.filter((item) => item.type === "mcq" || item.type === "short_answer")
      .map((item) => ({ ...item, difficulty: item.id === "short_answer_p1" ? "P2" as const : item.difficulty,
        paraphrase_depth: item.id === "short_answer_p1" ? 2 as const : item.paraphrase_depth }));
    const generated = { passage_map: map, questions, image_query: "harbor water" };
    let calls = 0;
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (calls === 2) {
        const qaText = body.contents[0].parts[0].text as string;
        expect(qaText).toContain(passage);
        expect(qaText).not.toContain('"correct_index"');
        expect(qaText).not.toContain('"supporting_sentence"');
      }
      const data = calls === 1 ? generated : qaReplyFor(body.contents[0].parts[0].text as string, questions);
      if (calls === 3) {
        // The cross check sees only the risky items, on the other Flash-Lite model.
        expect(modelOf(_url)).toBe("gemini-3.1-flash-lite");
        expect((data as { reviews: { id: string }[] }).reviews.map((review) => review.id).sort()).toEqual(["mcq_p3", "short_answer_p3"]);
      }
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }],
        usageMetadata: { promptTokenCount: calls * 100, candidatesTokenCount: calls * 50, totalTokenCount: calls * 150 } });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(output.state).toBe("READY");
    expect(output.audit.failure).toBeNull();
    expect(output.questions).toHaveLength(6);
    expect(output.audit.requests).toBe(3);
    expect(output.audit.generation_tokens?.total).toBe(150);
    expect(output.audit.qa_tokens?.total).toBe(750);
    expect(calls).toBe(3);
    const cached = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(cached.audit.requests).toBe(0);
    expect(calls).toBe(3);
  });
  it("repairs a rejected item once instead of dropping the whole quiz", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("repair");
    const systems: string[] = [];
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const system = body.systemInstruction.parts[0].text as string;
      const text = body.contents[0].parts[0].text as string;
      systems.push(system.includes("REPAIR TASK") ? "repair" : system.startsWith("Independent IELTS") ? "qa" : "generate");
      const data = systems.length === 1 ? { passage_map: map, questions, image_query: "" }
        : system.includes("REPAIR TASK") ? { questions: questions.filter((item) => item.id === "mcq_p2") }
          // The first QA disagrees on one item; every later check agrees.
          : qaReplyFor(text, questions, systems.length === 2 ? new Set(["mcq_p2"]) : new Set());
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }] });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Repair", passage, id, fake);
    expect(systems).toEqual(["generate", "qa", "repair", "qa", "qa"]);
    expect(output.state).toBe("READY");
    expect(output.questions).toHaveLength(6);
    expect(output.audit.requests).toBe(5);
    expect(output.audit.issues).toContain("REPAIR:1/1");
    // A per-item disagreement is recorded but no longer blocks a set that ends with six approved items.
    expect(output.audit.issues).toContain("mcq_p2:QA_MISMATCH");
  });
  it("drops a risky item the second model disagrees with", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const { passage, id, questions } = sixItemCase("cross");
    let calls = 0;
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const text = JSON.parse(String(init?.body)).contents[0].parts[0].text as string;
      const data = calls === 1 ? { passage_map: map, questions, image_query: "" }
        : qaReplyFor(text, questions, calls === 3 ? new Set(["mcq_p3"]) : new Set());
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }] });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Cross", passage, id, fake);
    expect(output.state).toBe("PENDING_QUALITY");
    expect(output.audit.issues).toEqual(expect.arrayContaining(["CROSS_QA_DROPPED:1", "TOO_FEW_APPROVED"]));
    expect(output.audit.failure).toBe("quality");
  });
  it("sends complete source text to generation even beyond the legacy excerpt", async () => {
    process.env.AI_FACTORY_FREE_TIER_ONLY = "true";
    process.env.AI_FACTORY_FREE_TIER_CONFIRMED = "true";
    process.env.AI_FACTORY_GEMINI_API_KEY = "offline-test-key";
    const longArticle = article + " " + "A routine report described another small water reading in the public register. ".repeat(220)
      + "TAIL FACT: private wells remained untested.";
    let calls = 0;
    const fake = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      expect(String(init?.body)).toContain("TAIL FACT: private wells remained untested.");
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
        passage_map: map, questions: [], image_query: "",
      }) }] } }] });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Full source check", longArticle, "full-source-case", fake);
    expect(output.state).toBe("PENDING_QUALITY");
    expect(output.audit.requests).toBe(1);
    expect(calls).toBe(1);
  });
});
