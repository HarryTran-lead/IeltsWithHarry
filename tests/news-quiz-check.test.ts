import { describe, expect, it } from "vitest";
import { gradePractice, parsePracticeAnswers, type QuizKey } from "../src/lib/news/quiz-check";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const keys: QuizKey[] = [
  { id: id(1), question_type: "tfng", supporting_sentence: "s1", correct_index: 1, accepted_answers: null, explanation: "Vì bài nói vậy.", option_notes: null },
  { id: id(2), question_type: "mcq", supporting_sentence: "s2", correct_index: 3, accepted_answers: null, explanation: "Vì bài nói vậy.", option_notes: ["a", "b", "c", "d"] },
  { id: id(3), question_type: "short_answer", supporting_sentence: "s3", correct_index: null, accepted_answers: ["Kennedy Space Center"], explanation: "Vì bài nói vậy.", option_notes: null },
];

describe("Daily News practice by question type", () => {
  it("accepts only well-formed answer maps", () => {
    expect(parsePracticeAnswers({ [id(1)]: 1, [id(3)]: "  the kennedy space center " })).toEqual({ [id(1)]: 1, [id(3)]: "the kennedy space center" });
    expect(parsePracticeAnswers({})).toBeNull();
    expect(parsePracticeAnswers([1])).toBeNull();
    expect(parsePracticeAnswers({ "not-an-id": 1 })).toBeNull();
    // Letters run to J (index 9) for a summary word list.
    expect(parsePracticeAnswers({ [id(1)]: 9 })).toEqual({ [id(1)]: 9 });
    expect(parsePracticeAnswers({ [id(1)]: 10 })).toBeNull();
    expect(parsePracticeAnswers({ [id(1)]: "   " })).toBeNull();
    // A blank beside a real answer is kept, so the round can be submitted and the blank graded wrong.
    expect(parsePracticeAnswers({ [id(1)]: 1, [id(3)]: "" })).toEqual({ [id(1)]: 1, [id(3)]: "" });
    expect(parsePracticeAnswers({ [id(1)]: "x".repeat(121) })).toBeNull();
  });

  it("grades just the chosen questions, in quiz order", () => {
    const review = gradePractice(keys, { [id(3)]: "the Kennedy Space Center", [id(1)]: 0 });
    expect(review?.map((item) => [item.id, item.correct])).toEqual([[id(1), false], [id(3), true]]);
    expect(review?.[1]).toMatchObject({ acceptedAnswers: ["Kennedy Space Center"], supportingSentence: "s3", correctIndex: null });
  });

  it("accepts a space in place of a hyphen in a written answer", () => {
    const written: QuizKey = { ...keys[2], accepted_answers: ["fixed-price"] };
    expect(gradePractice([written], { [written.id]: "fixed price" })?.[0].correct).toBe(true);
  });

  it("rejects answers of the wrong kind or for questions outside the quiz", () => {
    expect(gradePractice(keys, { [id(2)]: "D" })).toBeNull();
    expect(gradePractice(keys, { [id(3)]: 2 })).toBeNull();
    expect(gradePractice(keys, { [id(1)]: 1, [id(9)]: 1 })).toBeNull();
  });
});

describe("Daily News short-answer matching", () => {
  const brands = "How many different brands are participating in the exhibition?";
  const vehicles = "How many vehicles were chosen for the motorsport section?";
  it("accepts what an IELTS examiner would", async () => {
    const { answerMatches } = await import("../src/lib/news/quiz-check");
    expect(answerMatches("44 brands", "44", brands)).toBe(true);
    expect(answerMatches("300", "approximately 300", vehicles)).toBe(true);
    expect(answerMatches("300 vehicles", "approximately 300", vehicles)).toBe(true);
    expect(answerMatches("The Plastic Bags", "plastic bags", "What did the shop stop selling?")).toBe(true);
    expect(answerMatches("1,200", "1200")).toBe(true);
  });
  it("still rejects wrong content, plural slips and blanks", async () => {
    const { answerMatches } = await import("../src/lib/news/quiz-check");
    expect(answerMatches("45", "44", brands)).toBe(false);
    expect(answerMatches("44 cars", "44", brands)).toBe(false);
    expect(answerMatches("brands", "44", brands)).toBe(false);
    expect(answerMatches("plastic bag", "plastic bags", "What did the shop stop selling?")).toBe(false);
    expect(answerMatches("more than 300", "300", vehicles)).toBe(false);
    expect(answerMatches("", "44", brands)).toBe(false);
  });
  it("grades a Choose TWO question as a set, whatever order the letters are given in", () => {
    const pair: QuizKey[] = [
      { id: id(4), question_type: "mcq_multiple", prompt: "Which TWO steps come first?", supporting_sentence: "s4", correct_index: 1, accepted_answers: null, explanation: "Vì bài nói vậy.", option_notes: null },
      { id: id(5), question_type: "mcq_multiple", prompt: "Which TWO steps come first?", supporting_sentence: "s5", correct_index: 3, accepted_answers: null, explanation: "Vì bài nói vậy.", option_notes: null },
    ];
    const marks = (a: number, b: number) => gradePractice(pair, { [id(4)]: a, [id(5)]: b })!.map((item) => item.correct);
    expect(marks(1, 3)).toEqual([true, true]);
    expect(marks(3, 1)).toEqual([true, true]);
    expect(marks(1, 4)).toEqual([true, false]);
    expect(marks(0, 3)).toEqual([false, true]);
    // The same correct letter twice scores once.
    expect(marks(3, 3)).toEqual([true, false]);
  });
});
