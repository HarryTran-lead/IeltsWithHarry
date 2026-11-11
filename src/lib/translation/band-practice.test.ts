import { describe, expect, it } from "vitest";
import { bandExercises, levelRubric, practiceBands } from "./band-practice";
import { practiceExerciseSchema } from "./schema";

describe("band translation practice data", () => {
  it("keeps only individually aligned exercises in the band track", () => {
    expect(practiceBands).toHaveLength(17);
    expect(practiceBands[0]).toBe("1.0");
    expect(practiceBands.at(-1)).toBe("9.0");
    expect(levelRubric.map((item) => item.level)).toEqual(practiceBands);
    expect(bandExercises).toHaveLength(950);
    expect(bandExercises.filter((item) => item.source === "original-starter")).toHaveLength(51);
    expect(bandExercises.filter((item) => item.source === "original-level-authored")).toHaveLength(34);
    expect(new Set(bandExercises.map((item) => item.id)).size).toBe(bandExercises.length);
    expect(new Set(bandExercises.map((item) => item.promptVi.toLocaleLowerCase("vi-VN").trim())).size).toBe(bandExercises.length);
    for (const band of practiceBands) {
      const exercises = bandExercises.filter((item) => item.practiceLevel === band);
      const target = Number(band) < 3 ? 40 : Number(band) < 5 ? 50 : Number(band) < 7 ? 60 : 70;
      expect(exercises).toHaveLength(target);
      for (const item of exercises) {
        expect(practiceExerciseSchema.safeParse(item).success).toBe(true);
        expect(item.source).not.toMatch(/^original-pattern/);
        expect(item.referenceAnswers[0].toLocaleLowerCase("en-US")).toContain(item.targetTerm.toLocaleLowerCase("en-US"));
        if (band === "1.0") expect(item.type).toBe("word");
        if (band === "1.5" || band === "2.0") expect(item.type).toBe("phrase");
        if (band === "2.5") expect(["phrase", "sentence"]).toContain(item.type);
      }
      if (Number(band) >= 7) {
        expect(exercises.every((item) => item.type === "paragraph")).toBe(true);
        for (const item of exercises) {
          expect((item.promptVi.match(/[.!?]/g) ?? []).length).toBeGreaterThanOrEqual(3);
          expect((item.referenceAnswers[0].match(/[.!?]/g) ?? []).length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});
