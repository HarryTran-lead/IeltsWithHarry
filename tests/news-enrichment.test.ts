import { describe, expect, it } from "vitest";
import { AiQuotaError, findNewsIllustration, generateNewsQuiz, imageKeywords, quizExcerpt, validateGeneratedQuiz } from "../src/lib/news/enrichment";

const passage = "The Artemis team tested a new spacecraft on Tuesday. The spacecraft will carry instruments to study the Moon. Scientists will use the results to prepare later missions.";
function questions(evidence = "The Artemis team tested a new spacecraft on Tuesday.", count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    prompt: `What did the article say about the Artemis team in question ${index + 1}?`,
    options: ["They tested a spacecraft", "They built a school", "They moved to Mars", "They closed a lab"],
    correct_index: 0, supporting_sentence: evidence,
    explanation: "The article explicitly says that the team tested a spacecraft.",
  }));
}
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

describe("news AI quiz validation", () => {
  it("accepts ten distinct questions with exact article evidence", () => {
    expect(validateGeneratedQuiz({ questions: questions() }, passage)).toHaveLength(10);
  });
  it("rejects claims without a matching sentence in the article", () => {
    expect(() => validateGeneratedQuiz({ questions: questions("The mission landed on Mars yesterday.") }, passage)).toThrow(/evidence/);
  });
  it("rejects duplicate options and incomplete quizzes", () => {
    const bad = questions(); bad[0].options[1] = bad[0].options[0];
    expect(() => validateGeneratedQuiz({ questions: bad }, passage)).toThrow(/option/);
    expect(() => validateGeneratedQuiz({ questions: questions().slice(0, 9) }, passage)).toThrow();
  });
  it("keeps ten valid questions when spare ones are faulty", () => {
    const set = questions(undefined, 12);
    set[1].supporting_sentence = "The mission landed on Mars yesterday.";
    set[4].options[2] = set[4].options[0];
    const kept = validateGeneratedQuiz({ questions: set }, passage);
    expect(kept).toHaveLength(10);
    expect(kept.map((question) => question.prompt)).not.toContain(set[1].prompt);
  });
  it("treats typographic quotes and dashes in evidence as equal", () => {
    const curly = "NASA’s team — working fast — tested a new spacecraft on Tuesday and recorded every result.";
    expect(validateGeneratedQuiz({ questions: questions("NASA's team - working fast - tested a new spacecraft on Tuesday") }, curly)).toHaveLength(10);
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
        return geminiReply({ questions: questions(undefined, 12), image_query: "Artemis spacecraft!" });
      };
      const result = await generateNewsQuiz("Artemis test", passage, fetcher as typeof fetch);
      expect(result.model).toBe("gemini-3.5-flash-lite");
      expect(result.questions).toHaveLength(10);
      expect(result.imageQuery).toBe("Artemis spacecraft");
      for (const question of result.questions) expect(question.options[question.correct_index]).toBe("They tested a spacecraft");
    });
  });
  it("falls back to the next configured model when one is rate limited", async () => {
    await withKey(async () => {
      const seen: string[] = [];
      const fetcher = async (url: string | URL | Request) => {
        seen.push(String(url));
        if (seen.length === 1) return new Response(JSON.stringify({ error: { details: [{ retryDelay: "30s" }] } }), { status: 429 });
        return geminiReply({ questions: questions(), image_query: "" });
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
