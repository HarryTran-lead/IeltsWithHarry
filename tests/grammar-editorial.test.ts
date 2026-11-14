import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import catalog from "../src/data/grammar-editorial/catalog.json";

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];

describe("Grammar editorial import", () => {
  it("has 180 lessons and 14,455 unique questions from the six canonical level files", () => {
    const ids = new Set<string>();
    let count = 0;
    let missingTranslations = 0;
    for (const level of levels) {
      const rows = JSON.parse(readFileSync(join(process.cwd(), "src/data/grammar-editorial", `${level}.json`), "utf8")) as Record<string, { questions: { id: string; lesson_id: string; publishable: boolean; translation_vi?: string | null; correct_answer: string; accepted_answers: string[] }[] }>;
      expect(Object.keys(rows).length).toBe(catalog.filter((lesson) => lesson.level === level).length);
      for (const [code, row] of Object.entries(rows)) {
        const lesson = catalog.find((item) => item.code === code);
        expect(lesson).toBeDefined();
        expect(row.questions.length).toBe(Object.values(lesson!.counts).reduce((sum, value) => sum + value, 0));
        for (const question of row.questions) {
          expect(question.lesson_id).toBe(code);
          expect(question.publishable).toBe(false);
          expect(question.correct_answer).toBeTruthy();
          expect(question.accepted_answers).toContain(question.correct_answer);
          expect(ids.has(question.id)).toBe(false);
          ids.add(question.id);
          count++;
          if (!question.translation_vi) missingTranslations++;
        }
      }
    }
    expect(catalog).toHaveLength(180);
    expect(count).toBe(14455);
    expect(ids.size).toBe(14455);
    // M14B filled the 330 missing C2 translations (and one B1 actor fix).
    expect(missingTranslations).toBe(0);
  }, 30000);
});
