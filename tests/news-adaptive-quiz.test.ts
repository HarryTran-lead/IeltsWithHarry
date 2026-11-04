import { describe, expect, it } from "vitest";
import { generateAdaptiveNewsQuiz, longestSharedQuestionPhrase, looksLikeDirectLookup, targetQuestionCount, validateAdaptiveQuiz } from "../src/lib/news/adaptive-quiz";
import { choiceTypes, gapTypes, ieltsQuestionTypes, typesForKey, type IeltsQuestionType } from "../src/lib/news/ielts-passage";

const quote = "Scientists used solar panels to power the research station during the summer.";
const body = `${quote}\n\nThe station collected data about the local climate.`;
const explanation = "Câu dẫn chứng nói rõ trạm sử dụng tấm pin, nên đây là đáp án phù hợp.";
const note = "Bài đọc nêu thông tin này một cách rõ ràng.";
function generated(types: IeltsQuestionType[]) {
  return { questions: types.flatMap((type) => Array.from({ length: 4 }, (_, index) => {
    const options = type === "tfng" ? ["True", "False", "Not Given"] : type === "ynng" ? ["Yes", "No", "Not Given"] : ["Solar panels", "Wind turbines", "Diesel engines"];
    const choice = choiceTypes.has(type);
    return { type, prompt: `${type} question ${index + 1}: ${gapTypes.has(type) ? "The station uses ______ for power." : type === "short_answer" ? "What powered the station?" : "What powered the research station?"}`,
      options: choice ? options : [], correct_index: choice ? 0 : -1, answer: choice ? "" : "solar panels",
      supporting_sentence: quote, explanation, option_notes: choice ? options.map(() => note) : [] };
  })) };
}

describe("adaptive IELTS passage quiz", () => {
  it("accepts every supported type in a three-group, twelve-question set", () => {
    for (let start = 0; start < ieltsQuestionTypes.length; start += 3) {
      const selected = [0, 1, 2].map((offset) => ieltsQuestionTypes[(start + offset) % ieltsQuestionTypes.length]);
      const result = validateAdaptiveQuiz(generated(selected), body, selected);
      expect(result).toHaveLength(12);
      expect(result.map((question) => question.type)).toEqual(selected.flatMap((type) => Array(4).fill(type)));
    }
  });
  it("rejects unsupported evidence and missing answers", () => {
    const selected: IeltsQuestionType[] = ["mcq", "note_completion", "short_answer"];
    const data = generated(selected);
    data.questions[0].supporting_sentence = "A fabricated sentence about the Moon.";
    expect(() => validateAdaptiveQuiz(data, body, selected)).toThrow(/only 11 valid/);
    const missing = generated(selected);
    missing.questions[5].answer = "wind turbines";
    expect(() => validateAdaptiveQuiz(missing, body, selected)).toThrow(/only 11 valid/);
  });
  it("accepts a smaller, evidence-backed set for a short article", () => {
    const selected: IeltsQuestionType[] = ["mcq", "tfng"];
    const result = validateAdaptiveQuiz(generated(selected), body, selected, 2);
    expect(result).toHaveLength(4);
    expect(result.map((question) => question.type)).toEqual(["mcq", "mcq", "tfng", "tfng"]);
    const partial = generated(selected);
    partial.questions.slice(0, 3).forEach((question) => { question.supporting_sentence = "A fabricated sentence about the Moon."; });
    expect(validateAdaptiveQuiz(partial, body, selected, 2)).toHaveLength(3);
  });
  it("drops copied evidence clues and a uniquely copied multiple-choice answer", () => {
    expect(longestSharedQuestionPhrase(
      "What did scientists use to power the research station during the summer?", quote,
    )).toBeGreaterThanOrEqual(6);
    const direct = generated(["mcq"]);
    direct.questions[0].prompt = "What did scientists use to power the research station during the summer?";
    direct.questions[1].prompt = "What did the scientists power?";
    direct.questions[1].options = ["the research station", "the city power grid", "the nearby laboratory"];
    const kept = validateAdaptiveQuiz(direct, body, ["mcq"], 2);
    expect(kept).toHaveLength(2);
    expect(kept.every((question) => question.prompt !== direct.questions[0].prompt && question.prompt !== direct.questions[1].prompt)).toBe(true);
    expect(looksLikeDirectLookup("What did researchers record during survey stage 4?", "Researchers recorded soil temperature during survey stage 4 for comparison.")).toBe(true);
    expect(looksLikeDirectLookup("Which measurement was documented during phase 4?", "Researchers recorded soil temperature during survey stage 4 for comparison.")).toBe(false);
  });
  it("assigns varied question groups", () => {
    const groups = typesForKey("article-one");
    expect(groups).toHaveLength(3);
    expect(new Set(groups).size).toBe(3);
  });
  it("does not request thirteen questions from a repetitive long article", () => {
    const sentence = "Researchers measured the same feature during the survey and wrote down the same result for the field station.";
    expect(targetQuestionCount(Array(50).fill(sentence).join(" "))).toBe(1);
    const varied = Array.from({ length: 40 }, (_, index) =>
      `Researchers measured feature ${index + 1} during the survey and recorded its distinct result at the field station for later comparison with earlier observations across several seasons in the region.`).join(" ");
    expect(targetQuestionCount(varied)).toBe(13);
  });
  it("reviews every flagged candidate in one call for a supported thirteen-question article", async () => {
    const sentences = Array.from({ length: 40 }, (_, index) =>
      `Researchers recorded detail${index + 1} during survey stage ${index + 1} and compared the measurement with earlier records to explain how the local environment changed across several months at the field station.`);
    const passage = Array.from({ length: 8 }, (_, index) => sentences.slice(index * 5, index * 5 + 5).join(" ")).join("\n\n");
    const requests: string[] = [];
    const reply = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] } };
      const system = request.systemInstruction.parts[0].text;
      requests.push(system);
      if (system.includes("Focused second-pass quality check")) {
        const ids = [...system.matchAll(/"id":(\d+)/g)].map((match) => Number(match[1]));
        return reply({ reviews: ids.map((id) => ({ id, action: "keep", reason: "Evidence and answer checked." })) });
      }
      let index = 0;
      const questions = [...system.matchAll(/(\d+) ([a-z_]+) candidates \(\d+ kept\)/g)].flatMap((match) =>
        Array.from({ length: Number(match[1]) }, () => {
          const type = match[2] as IeltsQuestionType;
          const number = ++index;
          const options = type === "tfng" ? ["True", "False", "Not Given"] : type === "ynng" ? ["Yes", "No", "Not Given"] : ["First", "Second", "Third", "Fourth"];
          const choice = choiceTypes.has(type);
          const prompt = number % 3 === 0
            ? gapTypes.has(type)
              ? `${type === "flow_chart_completion" ? `Step ${number}: ` : type === "table_completion" ? "Survey finding: " : ""}Researchers recorded ______ during survey stage ${number}.`
              : type === "short_answer" ? `What did researchers record during survey stage ${number}?`
                : `Which option describes researchers recording survey stage ${number}?`
            : gapTypes.has(type)
            ? `${type === "flow_chart_completion" ? `Step ${number}: ` : type === "table_completion" ? "Survey finding: " : ""}The team documented ______ for later comparison in phase ${number}.`
            : type === "short_answer" ? `Which measurement was documented in phase ${number}?`
              : `Which interpretation best fits phase ${number}?`;
          return { type, prompt, options: choice ? options : [], correct_index: choice ? 0 : -1,
            answer: choice ? "" : `detail${number}`, supporting_sentence: sentences[number - 1], explanation,
            option_notes: choice ? options.map(() => note) : [], needs_review: true, review_reason: "Check this fact." };
        }));
      return reply({ questions, image_query: "research field station" });
    };
    const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "test-key";
    try {
      const result = await generateAdaptiveNewsQuiz("Survey findings", passage, "long-article", fetcher as typeof fetch);
      expect(result.questions).toHaveLength(13);
      const directCount = result.questions.filter((question) => looksLikeDirectLookup(question.prompt, question.supporting_sentence)).length;
      expect(directCount).toBeGreaterThan(0);
      expect(directCount).toBeLessThanOrEqual(3);
      expect(new Set(result.questions.map((question) => question.type)).size).toBeGreaterThanOrEqual(2);
      expect(requests).toHaveLength(2);
      expect(requests[0]).toContain("Balance the set across difficulty");
      const candidateCount = Number(requests[0].match(/Create (\d+) candidate questions/)?.[1]);
      expect(candidateCount).toBeGreaterThan(13);
      expect([...requests[1].matchAll(/"id":\d+/g)]).toHaveLength(candidateCount);
    } finally {
      if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
    }
  });
});
