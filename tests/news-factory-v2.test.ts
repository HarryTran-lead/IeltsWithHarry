import { afterEach, describe, expect, it } from "vitest";
import { ieltsQuestionTypes } from "../src/lib/news/ielts-passage";
import { ArticleRequestBudget, FactoryProviderError, strictGeminiJson } from "../src/lib/news/question-factory-v2/provider";
import { generateNewsQuizV2 } from "../src/lib/news/question-factory-v2";
import { selectQuestionTypes } from "../src/lib/news/adaptive-quiz";
import { blindQaPayload, generationPrompt } from "../src/lib/news/question-factory-v2/prompts";
import { validateBlindReview, validateCandidate, validateGeneration } from "../src/lib/news/question-factory-v2/validate";
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
  it("runs generation and independent QA in exactly two mocked API requests", async () => {
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
    const reviewed = { reviews: questions.map((item) => ({
      id: item.id, status: "answerable", independent_answer: item.correct_index < 0 ? item.answer : item.options[item.correct_index],
      competing_answers: [], paraphrase_faithful: true, distractors_fair: true, form_valid: true,
      reason_vi: "Câu này có một đáp án rõ ràng.",
    })) };
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
      const data = calls === 1 ? generated : reviewed;
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(data) }] } }],
        usageMetadata: { promptTokenCount: calls * 100, candidatesTokenCount: calls * 50, totalTokenCount: calls * 150 } });
    }) as typeof fetch;
    const output = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(output.state).toBe("READY");
    expect(output.questions).toHaveLength(6);
    expect(output.audit.requests).toBe(2);
    expect(output.audit.generation_tokens?.total).toBe(150);
    expect(output.audit.qa_tokens?.total).toBe(300);
    expect(calls).toBe(2);
    const cached = await generateNewsQuizV2("Water checks", passage, id, fake);
    expect(cached.audit.requests).toBe(0);
    expect(calls).toBe(2);
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
