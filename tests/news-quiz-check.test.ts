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
    expect(parsePracticeAnswers({ [id(1)]: 4 })).toBeNull();
    expect(parsePracticeAnswers({ [id(1)]: "   " })).toBeNull();
    expect(parsePracticeAnswers({ [id(1)]: "x".repeat(121) })).toBeNull();
  });

  it("grades just the chosen questions, in quiz order", () => {
    const review = gradePractice(keys, { [id(3)]: "the Kennedy Space Center", [id(1)]: 0 });
    expect(review?.map((item) => [item.id, item.correct])).toEqual([[id(1), false], [id(3), true]]);
    expect(review?.[1]).toMatchObject({ acceptedAnswers: ["Kennedy Space Center"], supportingSentence: "s3", correctIndex: null });
  });

  it("rejects answers of the wrong kind or for questions outside the quiz", () => {
    expect(gradePractice(keys, { [id(2)]: "D" })).toBeNull();
    expect(gradePractice(keys, { [id(3)]: 2 })).toBeNull();
    expect(gradePractice(keys, { [id(1)]: 1, [id(9)]: 1 })).toBeNull();
  });
});
