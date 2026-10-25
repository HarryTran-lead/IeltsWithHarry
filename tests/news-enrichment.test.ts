import { describe, expect, it } from "vitest";
import { findNewsIllustration, generateNewsQuiz, validateGeneratedQuiz } from "../src/lib/news/enrichment";

const passage = "The Artemis team tested a new spacecraft on Tuesday. The spacecraft will carry instruments to study the Moon. Scientists will use the results to prepare later missions.";
function questions(evidence = "The Artemis team tested a new spacecraft on Tuesday.") {
  return Array.from({ length: 10 }, (_, index) => ({
    prompt: `What did the article say about the Artemis team in question ${index + 1}?`,
    options: ["They tested a spacecraft", "They built a school", "They moved to Mars", "They closed a lab"],
    correct_index: 0, supporting_sentence: evidence,
    explanation: "The article explicitly says that the team tested a spacecraft.",
  }));
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
});

describe("Gemini news quiz generation", () => {
  it("sends a server-side Gemini request and validates its response", async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    try {
      const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toContain("/models/gemini-3.5-flash-lite:generateContent");
        expect(init?.headers).toMatchObject({ "x-goog-api-key": "test-key" });
        const request = JSON.parse(String(init?.body));
        expect(request.contents[0].parts[0].text).toContain(passage);
        expect(request.generationConfig.responseFormat.text.mimeType).toBe("APPLICATION_JSON");
        return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ questions: questions() }) }] } }] }), { status: 200 });
      };
      const result = await generateNewsQuiz("Artemis test", passage, fetcher as typeof fetch);
      expect(result.model).toBe("gemini-3.5-flash-lite");
      expect(result.questions).toHaveLength(10);
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });
});

describe("Commons illustration selection", () => {
  const page = (license: string) => ({ title: "File:Artemis spacecraft above the Moon.jpg", imageinfo: [{
    thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/artemis.jpg/960px-artemis.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Artemis_spacecraft_above_the_Moon.jpg",
    width: 1200, height: 700,
    extmetadata: { LicenseShortName: { value: license }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" }, Artist: { value: "NASA" }, ImageDescription: { value: "Artemis spacecraft above the Moon" } },
  }] });
  it("uses an explicitly public-domain and relevant image with credit", async () => {
    const fetcher = async () => new Response(JSON.stringify({ query: { pages: [page("Public domain")] } }), { status: 200 });
    const image = await findNewsIllustration("Artemis spacecraft Moon mission", fetcher as typeof fetch);
    expect(image?.image_credit).toBe("NASA");
    expect(image?.license_name).toBe("Public domain");
    expect(image?.image_source_url).toContain("commons.wikimedia.org");
  });
  it("rejects an image without an approved license", async () => {
    const fetcher = async () => new Response(JSON.stringify({ query: { pages: [page("All rights reserved")] } }), { status: 200 });
    expect(await findNewsIllustration("Artemis spacecraft Moon mission", fetcher as typeof fetch)).toBeNull();
  });
  it("accepts an attributed Creative Commons image after broadening the search", async () => {
    let calls = 0;
    const fetcher = async () => new Response(JSON.stringify({ query: { pages: ++calls === 1 ? [] : [page("CC BY-SA 4.0")] } }), { status: 200 });
    const image = await findNewsIllustration("Artemis spacecraft Moon mission", fetcher as typeof fetch);
    expect(calls).toBe(2);
    expect(image?.license_url).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(image?.image_credit).toBe("NASA");
  });
});
