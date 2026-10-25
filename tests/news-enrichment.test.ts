import { describe, expect, it } from "vitest";
import { findNewsIllustration, validateGeneratedQuiz } from "../src/lib/news/enrichment";

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

describe("Commons illustration selection", () => {
  const page = (license: string) => ({ title: "File:Artemis spacecraft above the Moon.jpg", imageinfo: [{
    thumburl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/artemis.jpg/960px-artemis.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Artemis_spacecraft_above_the_Moon.jpg",
    width: 1200, height: 700,
    extmetadata: { LicenseShortName: { value: license }, Artist: { value: "NASA" }, ImageDescription: { value: "Artemis spacecraft above the Moon" } },
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
});
