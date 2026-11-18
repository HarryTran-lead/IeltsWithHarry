import { describe, expect, it } from "vitest";
import { contentSchema, explanationMismatches, publicContent, scoreAnswers, withLatestFiveStep, type ExamContent, type FiveStep } from "../src/lib/ielts-bank/schema";

const step = (text: string) => ({ en: text, vi: text });
const fiveStep: FiveStep = {
  understand: step("Find the heading for the whole paragraph."),
  wordClass: step("A noun phrase that prefers one thing to another."),
  paraphrase: { ...step("Colour returns as red flowers."), pairs: [{ question: "colour", passage: "colour vision" }] },
  evidence: { ...step("The paragraph opens with colour vision."), quotes: [{ paragraph: "P2-C", quote: "excellent colour vision", role: "supports", exact: true }] },
  final: { ...step("v."), answer: "v", trapEn: "", trapVi: "", tipEn: "", tipVi: "" },
};

const content: ExamContent = contentSchema.parse({
  prompt: "",
  sections: [{ id: "p1", title: "Passage 1", passage: "**A** Text.", questions: [
    { id: "Q01", number: 1, type: "true_false_not_given", prompt: "A statement.", answers: ["TRUE"], explanation: "Short.", fiveStep },
    { id: "Q24", number: 24, type: "multiple_answers", prompt: "Choose THREE.", options: ["A — a", "B — b", "C — c", "D — d", "E — e", "F — f", "G — g"], answers: ["B"], group: "g24" },
    { id: "Q25", number: 25, type: "multiple_answers", prompt: "Choose THREE.", options: ["A — a", "B — b", "C — c", "D — d", "E — e", "F — f", "G — g"], answers: ["E"], group: "g24" },
    { id: "Q26", number: 26, type: "multiple_answers", prompt: "Choose THREE.", options: ["A — a", "B — b", "C — c", "D — d", "E — e", "F — f", "G — g"], answers: ["G"], group: "g24" },
  ] }],
});

describe("five-step explanations", () => {
  it("never reach the learner before grading", () => {
    const visible = publicContent(content).sections[0].questions[0];
    expect(visible).not.toHaveProperty("fiveStep");
    expect(visible.answers).toEqual([]);
  });

  it("come back with the graded review", () => {
    const review = scoreAnswers(content, { Q01: "TRUE" }).review;
    expect(review.find((item) => item.id === "Q01")?.fiveStep?.final.answer).toBe("v");
    expect(review.find((item) => item.id === "Q24")).not.toHaveProperty("fiveStep");
  });

  it("reach older reviews only while the answer key is unchanged", () => {
    const old = scoreAnswers(contentSchema.parse({ ...content, sections: content.sections.map((section) => ({ ...section, questions: section.questions.map((question) => { const plain = { ...question }; delete plain.fiveStep; return plain; }) })) }), { Q01: "TRUE" }).review;
    expect(old.find((item) => item.id === "Q01")).not.toHaveProperty("fiveStep");
    expect(withLatestFiveStep(old, content).find((item) => item.id === "Q01")?.fiveStep?.final.answer).toBe("v");
    const rekeyed = old.map((item) => item.id === "Q01" ? { ...item, answers: ["FALSE"] } : item);
    expect(withLatestFiveStep(rekeyed, content).find((item) => item.id === "Q01")).not.toHaveProperty("fiveStep");
  });

  it("attach only when every answer matches the live key", () => {
    expect(explanationMismatches(content, [{ questionId: "Q01", answers: ["TRUE"] }])).toEqual([]);
    expect(explanationMismatches(content, [{ questionId: "Q01", answers: ["FALSE"] }])).toHaveLength(1);
    expect(explanationMismatches(content, [{ questionId: "Q99", answers: ["TRUE"] }])).toHaveLength(1);
  });

  it("compare a choose-three set with the whole group, in any order", () => {
    expect(explanationMismatches(content, [{ questionId: "Q24", answers: ["G", "B", "E"] }])).toEqual([]);
    expect(explanationMismatches(content, [{ questionId: "Q25", answers: ["B", "E"] }])).toHaveLength(1);
    expect(explanationMismatches(content, [{ questionId: "Q26", answers: ["B", "E", "F"] }])).toHaveLength(1);
  });
});
