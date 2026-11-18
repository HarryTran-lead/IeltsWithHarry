import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canTestLevel, isLevelOpen, prerequisiteLevel, scoreGrammarPlacement } from "../src/lib/grammar/gate";

describe("Grammar level unlock", () => {
  it("requires the preceding level and 16 of 20 correct answers", () => {
    expect(isLevelOpen("A1", [])).toBe(true);
    expect(isLevelOpen("A2", [])).toBe(false);
    expect(prerequisiteLevel("A2")).toBe("A1");
    expect(canTestLevel("A2", [])).toBe(true);
    expect(canTestLevel("B1", [])).toBe(false);
    expect(canTestLevel("B1", ["A2"])).toBe(true);
    expect(scoreGrammarPlacement(15).passed).toBe(false);
    expect(scoreGrammarPlacement(16)).toMatchObject({ percent: 80, passed: true });
  });

  it("has at least 20 distinct lessons with objective choice questions for every transition", () => {
    for (const level of ["A1", "A2", "B1", "B2", "C1"]) {
      const source = JSON.parse(readFileSync(join(process.cwd(), "src/data/grammar-editorial", `${level}.json`), "utf8")) as Record<string, { questions: { type: string; stage: string; auto_gradable?: boolean; options?: string[]; correct_answer: string }[] }>;
      const eligible = Object.values(source).filter(({ questions }) => questions.some((question) =>
        question.auto_gradable === true && ["mcq", "error_choice"].includes(question.type)
        && ["independent", "mastery"].includes(question.stage)
        && question.options?.includes(question.correct_answer)));
      expect(eligible.length, level).toBeGreaterThanOrEqual(20);
    }
  });
});
