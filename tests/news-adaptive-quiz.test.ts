import { describe, expect, it } from "vitest";
import { validateAdaptiveQuiz } from "../src/lib/news/adaptive-quiz";
import { choiceTypes, gapTypes, ieltsQuestionTypes, passageForKey, typesForKey, type IeltsQuestionType } from "../src/lib/news/ielts-passage";

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
  it("assigns stable passage levels and varied groups", () => {
    expect(passageForKey("article-one")).toBe(passageForKey("article-one"));
    expect(new Set(Array.from({ length: 30 }, (_, index) => passageForKey(`article-${index}`))).size).toBe(3);
    const groups = typesForKey("article-one");
    expect(groups).toHaveLength(3);
    expect(new Set(groups).size).toBe(3);
  });
});
