import { describe, expect, it } from "vitest";
import { AiQuotaError, findNewsIllustration, generateNewsQuiz, imageKeywords, normalizeAnswer, quizExcerpt, tfngOptions, validateGeneratedQuiz } from "../src/lib/news/enrichment";

const passage = "The Artemis team tested a new spacecraft on Tuesday. The spacecraft will carry instruments to study the Moon. Scientists will use the results to prepare later missions. The test took place at Kennedy Space Center in Florida. Engineers measured the heat shield during the flight.";
const quote = "The Artemis team tested a new spacecraft on Tuesday.";
const explanation = "Câu trích trong bài nói rõ điều này, nên đáp án này đúng.";
/** A complete AI reply: the planned count plus one spare in every group. */
function reply(evidence = quote) {
  return {
    true_false_not_given: Array.from({ length: 7 }, (_, i) => ({ statement: `Statement ${i + 1} about the spacecraft test`, answer: ["TRUE", "FALSE", "NOT GIVEN"][i % 3], option_notes: ["Đúng vì bài nói rõ điều này.", "Sai vì bài không phủ nhận điều này.", "Sai vì bài có nhắc tới thông tin này."], supporting_sentence: evidence, explanation })),
    multiple_choice: Array.from({ length: 7 }, (_, i) => ({ question: `Question ${i + 1}: what did the team test?`, options: ["A spacecraft", "A school", "A rover on Mars", "A laboratory"], correct_index: 0, option_notes: ["Đúng: bài nói nhóm đã thử nghiệm điều này.", "Sai: bài không nhắc tới trường học.", "Sai: bài không nói về sao Hỏa.", "Sai: bài không nhắc tới phòng thí nghiệm."], supporting_sentence: evidence, explanation })),
    sentence_completion: Array.from({ length: 5 }, (_, i) => ({ sentence: `Completion ${i + 1}: the test was held at ______.`, answer: "Kennedy Space Center", supporting_sentence: "The test took place at Kennedy Space Center in Florida.", explanation })),
    short_answer: Array.from({ length: 5 }, (_, i) => ({ question: `Short question ${i + 1}: what did engineers measure?`, answer: "the heat shield", supporting_sentence: "Engineers measured the heat shield during the flight.", explanation })),
    image_query: "Artemis spacecraft!",
  };
}
const types = (questions: { type: string }[]) => questions.map((question) => question.type);
const planned = [...Array(6).fill("tfng"), ...Array(6).fill("mcq"), ...Array(4).fill("sentence_completion"), ...Array(4).fill("short_answer")];
const geminiReply = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
async function withKey<T>(run: () => Promise<T>, models?: string) {
  const previous = { key: process.env.GEMINI_API_KEY, models: process.env.GEMINI_MODELS };
  process.env.GEMINI_API_KEY = "test-key";
  if (models) process.env.GEMINI_MODELS = models; else delete process.env.GEMINI_MODELS;
  try { return await run(); }
  finally {
    if (previous.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.key;
    if (previous.models === undefined) delete process.env.GEMINI_MODELS; else process.env.GEMINI_MODELS = previous.models;
  }
}

describe("IELTS-style AI quiz validation", () => {
  it("builds twenty questions grouped as TFNG, multiple choice, completion and short answer", () => {
    const quiz = validateGeneratedQuiz(reply(), passage);
    expect(types(quiz)).toEqual(planned);
    expect(quiz[0]).toMatchObject({ options: tfngOptions, correct_index: 0, accepted_answers: null });
    expect(quiz[2].correct_index).toBe(2);
    expect(quiz[12]).toMatchObject({ prompt: "Completion 1: the test was held at ______.", options: [], correct_index: null, accepted_answers: ["Kennedy Space Center"] });
    expect(quiz[16].accepted_answers).toEqual(["the heat shield"]);
  });
  it("replaces a faulty item with the group's spare", () => {
    const data = reply(); data.true_false_not_given[1].supporting_sentence = "The mission landed on Mars yesterday.";
    data.multiple_choice[0].options[1] = data.multiple_choice[0].options[0];
    const quiz = validateGeneratedQuiz(data, passage);
    expect(types(quiz)).toEqual(planned);
    expect(quiz.map((question) => question.prompt)).not.toContain("Statement 2 about the spacecraft test");
  });
  it("covers a thin group with spare questions of other types", () => {
    const data = reply(); data.sentence_completion = data.sentence_completion.slice(0, 2);
    const quiz = validateGeneratedQuiz(data, passage);
    expect(quiz).toHaveLength(20);
    expect(types(quiz).filter((type) => type === "sentence_completion")).toHaveLength(2);
  });
  it("rejects claims without a matching sentence in the article", () => {
    expect(() => validateGeneratedQuiz(reply("The mission landed on Mars yesterday."), passage)).toThrow(/evidence/);
  });
  it("rejects a set whose multiple-choice options repeat", () => {
    const data = reply(); for (const item of data.multiple_choice) item.options[1] = item.options[0];
    expect(() => validateGeneratedQuiz(data, passage)).toThrow(/option.*too few mcq/);
  });
  it("checks written answers against the IELTS word limit and the quoted sentence", () => {
    const broken = (change: (item: { sentence: string; answer: string }) => void) => {
      const data = reply(); for (const item of data.sentence_completion) change(item);
      return () => validateGeneratedQuiz(data, passage);
    };
    expect(broken((item) => { item.answer = "Kennedy Space Center in Florida"; })).toThrow(/three words/);
    expect(broken((item) => { item.answer = "Houston"; })).toThrow(/not in the quoted sentence/);
    expect(broken((item) => { item.sentence = item.sentence.replace("______", "Kennedy Space Center"); })).toThrow(/gap|gives away/);
    const data = reply(); for (const item of data.short_answer) item.question = item.question.replace("?", ".");
    expect(() => validateGeneratedQuiz(data, passage)).toThrow(/not a question/);
  });
  it("prefers a True/False/Not Given selection that uses every answer, in article order", () => {
    const data = reply();
    data.true_false_not_given.forEach((item, index) => { item.answer = ["TRUE", "TRUE", "TRUE", "FALSE", "FALSE", "NOT GIVEN", "NOT GIVEN"][index]; });
    const tfng = validateGeneratedQuiz(data, passage).slice(0, 6);
    expect(tfng.map((question) => question.correct_index)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(tfng.map((question) => question.prompt)).not.toContain("Statement 3 about the spacecraft test");
  });
  it("requires Vietnamese explanations and one note per option", () => {
    const english = reply();
    for (const group of [english.true_false_not_given, english.multiple_choice, english.sentence_completion, english.short_answer]) for (const item of group) item.explanation = "The quoted sentence states this directly.";
    expect(() => validateGeneratedQuiz(english, passage)).toThrow(/not in Vietnamese/);
    const missing = reply(); for (const item of missing.multiple_choice) item.option_notes = item.option_notes.slice(0, 3);
    expect(() => validateGeneratedQuiz(missing, passage)).toThrow(/too few mcq/);
    const quiz = validateGeneratedQuiz(reply(), passage);
    expect(quiz[0].option_notes).toHaveLength(3);
    expect(quiz[12].option_notes).toBeNull();
  });
  it("rejects True/False/Not Given statements that all share one answer", () => {
    const data = reply(); for (const item of data.true_false_not_given) item.answer = "TRUE";
    expect(() => validateGeneratedQuiz(data, passage)).toThrow(/same answer/);
  });
  it("treats typographic quotes and dashes in evidence as equal", () => {
    const curly = `${passage} NASA’s team — working fast — recorded every result.`;
    expect(validateGeneratedQuiz(reply("NASA's team - working fast - recorded every result."), curly)).toHaveLength(20);
  });
  it("normalizes written answers like the database grader", () => {
    expect(normalizeAnswer("The Heat-Shield.")).toBe("heat shield");
    expect(normalizeAnswer(" 1,200 tonnes ")).toBe("1200 tonnes");
    expect(normalizeAnswer("an orbit")).toBe("orbit");
  });
  it("cuts long articles at a paragraph boundary", () => {
    const body = Array.from({ length: 40 }, (_, index) => `Paragraph ${index} ${"text ".repeat(80)}`).join("\n\n");
    const excerpt = quizExcerpt(body);
    expect(excerpt.length).toBeLessThanOrEqual(12000);
    expect(body.startsWith(excerpt)).toBe(true);
    expect(body.slice(excerpt.length, excerpt.length + 2)).toBe("\n\n");
  });
});

describe("Gemini news quiz generation", () => {
  it("sends a server-side Gemini request, validates and shuffles its response", async () => {
    await withKey(async () => {
      const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toContain("/models/gemini-3.5-flash-lite:generateContent");
        expect(init?.headers).toMatchObject({ "x-goog-api-key": "test-key" });
        const request = JSON.parse(String(init?.body));
        expect(request.contents[0].parts[0].text).toContain(passage);
        expect(request.generationConfig.responseFormat.text.mimeType).toBe("APPLICATION_JSON");
        expect(request.generationConfig.responseFormat.text.schema.required).toContain("true_false_not_given");
        return geminiReply(reply());
      };
      const result = await generateNewsQuiz("Artemis test", passage, fetcher as typeof fetch);
      expect(result.model).toBe("gemini-3.5-flash-lite");
      expect(result.questions).toHaveLength(20);
      expect(result.imageQuery).toBe("Artemis spacecraft");
      // Shuffling keeps each option's note with its option.
      for (const question of result.questions.filter((item) => item.type === "mcq")) {
        expect(question.options[question.correct_index!]).toBe("A spacecraft");
        expect(question.option_notes![question.correct_index!]).toMatch(/^Đúng/);
      }
      expect(result.questions[0].options).toEqual(tfngOptions);
    });
  });
  it("falls back to the next configured model when one is rate limited", async () => {
    await withKey(async () => {
      const seen: string[] = [];
      const fetcher = async (url: string | URL | Request) => {
        seen.push(String(url));
        if (seen.length === 1) return new Response(JSON.stringify({ error: { details: [{ retryDelay: "30s" }] } }), { status: 429 });
        return geminiReply({ ...reply(), image_query: "" });
      };
      const result = await generateNewsQuiz("Artemis test", passage, fetcher as typeof fetch);
      expect(result.model).toBe("model-b");
      expect(seen[0]).toContain("/models/model-a:");
    }, "model-a,model-b");
  });
  it("reports a daily quota so the article is retried after the reset", async () => {
    await withKey(async () => {
      const fetcher = async () => new Response(JSON.stringify({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }), { status: 429 });
      const error = await generateNewsQuiz("Artemis test", passage, fetcher as typeof fetch).catch((cause) => cause);
      expect(error).toBeInstanceOf(AiQuotaError);
      expect(error.daily).toBe(true);
      expect(error.retryAfterMs).toBeGreaterThan(0);
      expect(error.retryAfterMs).toBeLessThanOrEqual(86400000);
    });
  });
});

describe("illustration search", () => {
  const commonsPage = (license: string) => ({ title: "File:Artemis spacecraft above the Moon.jpg", imageinfo: [{
    thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/artemis.jpg/960px-artemis.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Artemis_spacecraft_above_the_Moon.jpg",
    width: 1200, height: 700,
    extmetadata: { LicenseShortName: { value: license }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" }, Artist: { value: "NASA" }, ImageDescription: { value: "Artemis spacecraft above the Moon" } },
  }] });
  const nasaItem = (extra: Record<string, string> = {}) => ({
    data: [{ title: "Artemis spacecraft over the Moon", nasa_id: "art001", media_type: "image", center: "JSC", photographer: "James Blair", description: "The Artemis spacecraft orbits the Moon.", keywords: ["Artemis"], ...extra }],
    links: [{ href: "https://images-assets.nasa.gov/image/art001/art001~medium.jpg", rel: "alternate", width: 1280 }],
  });
  function fetcherFor(commons: unknown[][], nasa: unknown[] = []) {
    const calls = { commons: 0, nasa: 0 };
    const fetcher = async (url: string | URL | Request) => {
      if (String(url).startsWith("https://images-api.nasa.gov/")) { calls.nasa++; return new Response(JSON.stringify({ collection: { items: nasa } }), { status: 200 }); }
      const pages = commons[Math.min(calls.commons++, commons.length - 1)];
      return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
    };
    return { fetcher: fetcher as typeof fetch, calls };
  }
  it("uses an explicitly public-domain and relevant Commons image with credit", async () => {
    const image = await findNewsIllustration("Artemis spacecraft Moon mission", fetcherFor([[commonsPage("Public domain")]]).fetcher);
    expect(image?.image_credit).toBe("NASA");
    expect(image?.license_name).toBe("Public domain");
    expect(image?.image_source_url).toContain("commons.wikimedia.org");
  });
  it("rejects an image without an approved license", async () => {
    expect(await findNewsIllustration("Artemis spacecraft Moon mission", fetcherFor([[commonsPage("All rights reserved")]]).fetcher)).toBeNull();
  });
  it("accepts an attributed Creative Commons image after broadening the search", async () => {
    const { fetcher, calls } = fetcherFor([[], [commonsPage("CC BY-SA 4.0")]]);
    const image = await findNewsIllustration("Artemis spacecraft Moon mission", fetcher);
    expect(calls.commons).toBe(2);
    expect(image?.license_url).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(image?.image_credit).toBe("NASA");
  });
  it("prefers a NASA Image Library photo and skips third-party credits", async () => {
    const image = await findNewsIllustration("Artemis spacecraft Moon mission", fetcherFor([[commonsPage("CC BY-SA 4.0")]], [nasaItem()]).fetcher);
    expect(image).toMatchObject({ image_credit: "NASA/James Blair", image_source_url: "https://images.nasa.gov/details/art001", license_name: "NASA media guidelines" });
    const outside = await findNewsIllustration("Artemis spacecraft Moon mission", fetcherFor([[]], [nasaItem({ secondary_creator: "Intuitive Machines" })]).fetcher);
    expect(outside).toBeNull();
  });
  it("searches with the AI's visual subject and words the article repeats", async () => {
    expect(imageKeywords("NASA Marks Milestone", "The coral reef grows. Coral reef scientists study the coral reef. Reef coral.", "coral reef survey")).toEqual(["coral", "reef", "survey", "marks", "milestone"]);
  });
});
