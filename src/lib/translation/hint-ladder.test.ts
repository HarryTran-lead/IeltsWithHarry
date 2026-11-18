import { describe, expect, it } from "vitest";
import { firstLetters, grammarNote, hintLadder, sentenceFrame } from "./hint-ladder";

const urban = {
  type: "sentence" as const,
  targetTerm: "urban planning",
  meaningVi: "quy hoạch đô thị",
  referenceAnswers: ["Effective urban planning can shorten commutes and improve air quality."],
  explanationVi: "Shorten và improve là hai động từ song song sau can.",
};

describe("hint ladder", () => {
  it("keeps grammar words and the key term, blanking content words", () => {
    expect(sentenceFrame(urban.referenceAnswers[0], urban.targetTerm)).toBe("___ urban planning can ___ ___ and ___ ___ ___.");
    expect(firstLetters(urban.referenceAnswers[0], urban.targetTerm)).toBe("E________ urban planning can s______ c_______ and i______ a__ q______.");
  });

  it("opens key word, frame, grammar note, then first letters", () => {
    expect(hintLadder(urban).map((hint) => hint.kind)).toEqual(["keyword", "frame", "grammar", "letters"]);
  });

  it("keeps contractions, hyphenated words and numbers whole", () => {
    expect(sentenceFrame("I don't have a part-time job in 2024.")).toBe("I don't have a ___ ___ in 2024.");
    expect(firstLetters("I don't have a part-time job.")).toBe("I don't have a p___-____ j__.");
  });

  it("drops generic advice and notes about another sentence", () => {
    expect(grammarNote("Phân tích: because nêu nguyên nhân. Tự kiểm tra: giữ đúng chủ thể.", "I stayed home because it rained.")).toBe("because nêu nguyên nhân.");
    // A unit-wide rule that names no word of this answer is not shown.
    expect(grammarNote("Nói nơi chốn: S + be + place: My keys are in the drawer.", "ready for the test")).toBe("");
  });

  it("skips a frame for single words and any hint equal to the answer", () => {
    const word = { type: "word" as const, targetTerm: "name", meaningVi: "tên", referenceAnswers: ["name"], explanationVi: "Ghi nhớ cách viết từ." };
    expect(hintLadder(word).map((hint) => hint.kind)).toEqual(["keyword"]);
  });
});
