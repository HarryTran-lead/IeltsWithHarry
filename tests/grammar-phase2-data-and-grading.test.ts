import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { gradeEditorialAnswer } from "../src/lib/grammar/editorial";
import { labsForLesson } from "../src/lib/grammar/labs-server";

type GradeQuestion = Parameters<typeof gradeEditorialAnswer>[0];
const levels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const loadLevel = (lvl: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "src/data/grammar-editorial", `${lvl}.json`), "utf8")) as Record<
    string,
    { lesson: Record<string, unknown>; questions: GradeQuestion[] }
  >;

describe("Grammar Phase 2 data sanitization & smart fill_blank grading", () => {
  it("auto-grades closed-slot fill_blank mistakes as false with specific feedback and accepts contractions", () => {
    const a1 = loadLevel("A1");
    const qPronoun = a1["A1-01"].questions.find((q) => q.type === "fill" || q.type === "fill_blank")!;
    expect(gradeEditorialAnswer(qPronoun, qPronoun.correct_answer).correct).toBe(true);
    const wrongPronoun = gradeEditorialAnswer(qPronoun, "He" === qPronoun.correct_answer ? "She" : "He");
    expect(wrongPronoun.correct).toBe(false);
    expect(wrongPronoun.feedback.length).toBeGreaterThan(0);

    const a2 = loadLevel("A2");
    const qNeg = a2["A2-04"].questions.find((q) => q.id === "A2-04-Q027")!; // "did not"
    expect(gradeEditorialAnswer(qNeg, "did not").correct).toBe(true);
    expect(gradeEditorialAnswer(qNeg, "didn't").correct).toBe(true);
    expect(gradeEditorialAnswer(qNeg, "do not").correct).toBe(false);
  });

  it("flags same-lemma tense errors on lexical blanks while keeping open synonyms for self-review", () => {
    const b1 = loadLevel("B1");
    const qBought = b1["B1-01"].questions.find((q) => q.id === "B1-01-Q013")!; // "bought"
    expect(gradeEditorialAnswer(qBought, "bought").correct).toBe(true);
    const wrongTense = gradeEditorialAnswer(qBought, "buy");
    expect(wrongTense.correct).toBe(false);
    expect(wrongTense.feedback).toContain("“buy”");
    // Unlisted lexical synonym remains self_review (null) rather than false negative
    expect(gradeEditorialAnswer(qBought, "purchased").correct).toBeNull();
  });

  it("has zero leaked rule codes, snake_case rule names, {team} slots, or non-blank 'vị trí trống' mismatches across 14,455 questions", { timeout: 30_000 }, () => {
    for (const lvl of levels) {
      const data = loadLevel(lvl);
      for (const [code, bundle] of Object.entries(data)) {
        for (const q of bundle.questions) {
          const text = JSON.stringify({
            ec: q.explanation_correct_vi,
            ew: q.explanation_wrong_vi,
            fw: q.feedback_on_wrong_vi,
            or: q.option_rationales_vi,
          });
          expect(text, `${code}:${q.id}`).not.toMatch(/\{team\}/);
          expect(text, `${code}:${q.id}`).not.toMatch(/\b[A-C][12]-\d{2}-R\d+\b/);
          expect(text, `${code}:${q.id}`).not.toMatch(/quy tắc\s+[a-z]+_[a-z0-9_]+/i);
          if (!q.prompt_en.includes("_")) {
            expect(text, `${code}:${q.id}`).not.toContain("vị trí trống");
          }
        }
      }
    }
  });

  it("keeps M08 contrast audio sentences grammatical and gives distinct M26 transfer card titles", () => {
    const m08 = JSON.parse(readFileSync(join(process.cwd(), "src/data/grammar-a1-m08/lessons.json"), "utf8")) as Record<
      string,
      { contrasts: { first_en: string; second_en: string }[] }
    >;
    const allContrastSentences = Object.values(m08).flatMap((l) => l.contrasts.flatMap((c) => [c.first_en, c.second_en]));
    expect(allContrastSentences).not.toContain("She teacher.");
    expect(allContrastSentences).not.toContain("Her knows he.");
    expect(allContrastSentences).not.toContain("Do you are ready?");

    const labs = labsForLesson("A1-01");
    const transferTitles = labs.labs.transfer.map((t) => t.title);
    expect(new Set(transferTitles).size).toBe(transferTitles.length);
  });
});
