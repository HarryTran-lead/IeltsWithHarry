import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bandFile, bandIndex, levelRubric, practiceBands, reviewKey, type BandExercise } from "./band-practice";
import { closestAnswer } from "./compare-words";
import { practiceExerciseSchema } from "./schema";

// The page fetches these files from /public; the test reads the same files from disk.
async function allExercises() {
  return new Map<string, BandExercise[]>(practiceBands.map((band) =>
    [band, JSON.parse(readFileSync(join(process.cwd(), "public", bandFile(band)), "utf8")) as BandExercise[]]));
}

describe("band translation practice data", () => {
  it("keeps only individually aligned exercises in the band track", async () => {
    expect(practiceBands).toHaveLength(17);
    expect(practiceBands[0]).toBe("1.0");
    expect(practiceBands.at(-1)).toBe("9.0");
    expect(levelRubric.map((item) => item.level)).toEqual(practiceBands);
    expect(bandIndex.map((item) => item.level)).toEqual(practiceBands);

    const bands = await allExercises();
    const exercises = [...bands.values()].flat();
    const original = exercises.filter((item) => item.source !== "esl-v2");
    expect(exercises).toHaveLength(2040);
    expect(original).toHaveLength(950);
    expect(exercises.filter((item) => item.source === "original-starter")).toHaveLength(51);
    expect(exercises.filter((item) => item.source === "original-level-authored")).toHaveLength(34);
    expect(new Set(exercises.map((item) => item.id)).size).toBe(exercises.length);
    expect(new Set(exercises.map((item) => item.promptVi.toLocaleLowerCase("vi-VN").trim())).size).toBe(exercises.length);

    for (const band of practiceBands) {
      const items = bands.get(band) ?? [];
      const summary = bandIndex.find((item) => item.level === band);
      expect(summary?.keys).toEqual(items.map(reviewKey));
      expect(summary?.topics).toBe(new Set(items.map((item) => item.topic)).size);
      // The 950 published exercises keep their per-band counts; ESL v2 only adds.
      const target = Number(band) < 3 ? 40 : Number(band) < 5 ? 50 : Number(band) < 7 ? 60 : 70;
      expect(items.filter((item) => item.source !== "esl-v2")).toHaveLength(target);
      for (const item of items) {
        expect(item.practiceLevel).toBe(band);
        expect(practiceExerciseSchema.safeParse(item).success).toBe(true);
        expect(item.source).not.toMatch(/^original-pattern/);
        if (item.targetTerm) expect(item.referenceAnswers[0].toLocaleLowerCase("en-US")).toContain(item.targetTerm.toLocaleLowerCase("en-US"));
        else expect(item.source).toBe("esl-v2");
        if (band === "1.0") expect(item.type).toBe("word");
        if (band === "1.5" || band === "2.0") expect(item.type).toBe("phrase");
        if (band === "2.5") expect(["phrase", "sentence"]).toContain(item.type);
      }
      if (Number(band) >= 7) {
        expect(items.every((item) => item.type === "paragraph")).toBe(true);
        for (const item of items) {
          expect((item.promptVi.match(/[.!?]/g) ?? []).length).toBeGreaterThanOrEqual(3);
          expect((item.referenceAnswers[0].match(/[.!?]/g) ?? []).length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("adds ESL v2 lessons without giving the answer away before the review", async () => {
    const esl = [...(await allExercises()).values()].flat().filter((item) => item.source === "esl-v2");
    expect(esl).toHaveLength(1090);
    expect(esl.filter((item) => item.referenceAnswers.length > 1)).toHaveLength(311);
    for (const item of esl) {
      expect(item.editorialStatus).toBe("pilot");
      expect(Number(item.practiceLevel)).toBeGreaterThanOrEqual(2.5);
      for (const answer of item.referenceAnswers) expect(item.explanationVi).not.toContain(answer);
      for (const error of item.commonErrors) expect(error.incorrect).not.toBe(error.correction);
    }
  });

  it("only shows step hints that quote the prompt and never the answer", async () => {
    const exercises = [...(await allExercises()).values()].flat();
    const hinted = exercises.filter((item) => item.hintsVi?.length);
    expect(hinted.length).toBeGreaterThan(1800);
    // Collect problems and assert once: ~130k individual expects ran past the 5 s timeout.
    const problems: string[] = [];
    for (const item of hinted) {
      if (item.hintsVi!.length > 3) problems.push(`${item.id}: more than 3 hints`);
      const trigrams = item.referenceAnswers.flatMap((answer) => {
        const words = answer.toLowerCase().match(/[a-z']+/g) ?? [];
        return words.slice(0, -2).map((_, index) => words.slice(index, index + 3).join(" "));
      });
      for (const hint of item.hintsVi!) {
        if (/bắt đầu bằng chữ|chữ cái|→ “/.test(hint)) problems.push(`${item.id}: spelling or translation cue`);
        for (const quote of hint.match(/“[^”]*”/g) ?? []) {
          if (!item.promptVi.includes(quote.slice(1, -1).replace(/(…|\.\.\.)$/, "").trim())) problems.push(`${item.id}: quote not in prompt`);
        }
        const text = hint.toLowerCase();
        const leaked = trigrams.find((trigram) => text.includes(trigram));
        if (leaked) problems.push(`${item.id}: repeats "${leaked}"`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("closestAnswer", () => {
  const answers = [
    "I believe public libraries should stay open later to serve working adults.",
    "I think public libraries should stay open later to serve working adults.",
  ];

  it("prefers the alternative the learner's wording follows", () => {
    expect(closestAnswer("I think libraries should stay open later for working adults.", answers)).toBe(1);
  });

  it("keeps the main model when nothing matches better", () => {
    expect(closestAnswer("", answers)).toBe(0);
    expect(closestAnswer("Libraries should open later.", answers)).toBe(0);
  });
});
