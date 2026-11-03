import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fillAnswer, normalizeGuide, normalizeItem, wrongFeedback, type SourceLesson, type SourceQuestion } from "../src/lib/grammar/normalize";
import { applyGrade, reviewedCount, type GrammarResponse } from "../src/lib/grammar/types";

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
const lessons = levels.flatMap((level) => Object.entries(JSON.parse(readFileSync(join(process.cwd(), "src/data/grammar-editorial", `${level}.json`), "utf8")) as Record<string, { lesson: SourceLesson; questions: SourceQuestion[] }>));
const lesson = (code: string) => lessons.find(([key]) => key === code)![1];

describe("Grammar theory normalisation", () => {
  it("gives every lesson at least one rule with learner content and no editor notes", () => {
    expect(lessons).toHaveLength(180);
    for (const [code, source] of lessons) {
      const guide = normalizeGuide(source.lesson);
      const filled = guide.sections.filter((section) => section.formula || section.explanation || section.examples.length || section.points.length || section.table);
      expect(filled.length, code).toBeGreaterThan(0);
      for (const section of guide.sections) expect(section.note, code).not.toMatch(/giáo viên|biên tập/);
      for (const caveat of guide.caveats) expect(caveat, code).not.toMatch(/giáo viên|biên tập|accepted_answers/);
      for (const objective of guide.objectives) expect(objective, code).not.toMatch(/[A-Z]{2,}_[A-Z]+/);
      for (const mistake of guide.mistakes) expect(mistake.wrong, code).toBeTruthy();
    }
  }, 30000);

  it("reads top-level A1 rules, the pronoun table, `vi` explanations and C2 pattern examples", () => {
    const a110 = normalizeGuide(lesson("A1-10").lesson);
    expect(a110.sections[0].formula).toContain("this/that");
    expect(a110.sections.find((section) => section.heading === "Quy tắc cần nhớ")!.points.length).toBeGreaterThan(3);
    const table = normalizeGuide(lesson("A1-01").lesson).sections.find((section) => section.table)!.table!;
    expect(table.columns).toEqual(["Đại từ", "Nghĩa", "Ví dụ", "Dịch"]);
    expect(table.rows).toHaveLength(7);
    expect(normalizeGuide(lesson("B1-05").lesson).sections[0].explanation).toMatch(/Quá khứ hoàn thành/);
    const c204 = normalizeGuide(lesson("C2-04").lesson).sections[0];
    expect(c204.examples[0].en).toMatch(/^Had the pilot/);
    expect(c204.explanation).toMatch(/Đảo điều kiện/);
  });

  it("drops upper-case rule labels used as formulas", () => {
    const formulas = normalizeGuide(lesson("B2-04").lesson).sections.map((section) => section.formula);
    expect(formulas).not.toContain("SHOULD HAVE");
  });
});

describe("Grammar question normalisation", () => {
  it("splits ordering prompts written as a / b / c into chunks", () => {
    const question = lesson("A1-02").questions.find((item) => item.id === "A1-02-Q32")!;
    expect(normalizeItem(question).chunks).toEqual(["fresh", "are", "The apples"]);
  });

  it("fills template slots with the learner's answer and prefers specific feedback", () => {
    expect(fillAnswer("“{student_answer}” sai vì: thiếu V3.", "I have eaten eaten")).toBe("“I have eaten eaten” sai vì: thiếu V3.");
    expect(fillAnswer("“{team} was rejected” không đúng.", "the panel was rejected")).toBe("“the panel was rejected” không đúng.");
    const pronoun = lesson("A1-01").questions.find((item) => item.id === "A1-01-Q01")!;
    expect(wrongFeedback(pronoun, "Her")).toMatch(/tân ngữ/);
    for (const [, source] of lessons) for (const question of source.questions) {
      for (const option of question.options ?? [question.correct_answer]) expect(wrongFeedback(question, option)).not.toMatch(/\{[a-z_]+\}/);
    }
  }, 30000);
});

describe("Grammar first-attempt record", () => {
  const blank: GrammarResponse = { answer: "", updatedAt: "" };
  const wrong = { correct: false, referenceAnswer: "She", explanation: "", feedback: "", errorTag: null };
  const right = { ...wrong, correct: true };

  it("keeps a mistake in review when the learner retries straight away", () => {
    const first = applyGrade(blank, "Her", wrong, "_____ is my mother.", "2026-11-03T08:00:00.000Z");
    expect(first.status).toBe("NEED_REVIEW");
    const retry = applyGrade({ ...first, retrying: true }, "She", right, "_____ is my mother.", "2026-11-03T08:01:00.000Z");
    expect(retry.status).toBe("NEED_REVIEW");
    expect(retry.first).toEqual({ answer: "Her", correct: false, at: "2026-11-03T08:00:00.000Z" });
    expect(retry.attempts).toBe(2);
    expect(retry.retrying).toBe(false);
  });

  it("clears the review flag after a correct answer on a later day", () => {
    const first = applyGrade(blank, "Her", wrong, "p", "2026-11-03T08:00:00.000Z");
    expect(applyGrade(first, "She", right, "p", "2026-11-05T08:00:00.000Z").status).toBe("UNDERSTOOD");
  });

  it("counts spaced-review question ids", () => {
    const now = "2026-11-03T08:00:00.000Z";
    expect(reviewedCount({ theorySeen: true, updatedAt: now, responses: { "A1-01-SR-01": { answer: "We", status: "UNDERSTOOD", updatedAt: now }, "A1-01-Q01": { answer: "She", status: "NEED_REVIEW", updatedAt: now } } })).toBe(2);
  });
});
