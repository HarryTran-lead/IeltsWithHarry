import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bandFile, bandIndex, CANONICAL_TOPICS, levelRubric, practiceBands, reviewKey, type BandExercise } from "./band-practice";
import { buildChunkPuzzle, splitParagraphSteps } from "./chunk-builder";
import { closestAnswer, evaluateExpression } from "./compare-words";
import { hintLadder } from "./hint-ladder";
import { buildPhraseHints, buildSentenceBlueprint } from "./phrase-hints";
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
    const original = exercises.filter((item) => item.source !== "esl-v2" && item.source !== "bridge-v3");
    const bridges = exercises.filter((item) => item.source === "bridge-v3");
    expect(exercises).toHaveLength(2080);
    expect(original).toHaveLength(950);
    expect(bridges).toHaveLength(40);
    expect(exercises.filter((item) => item.source === "original-starter")).toHaveLength(51);
    expect(exercises.filter((item) => item.source === "original-level-authored")).toHaveLength(34);
    expect(new Set(exercises.map((item) => item.id)).size).toBe(exercises.length);
    expect(new Set(exercises.map((item) => item.promptVi.toLocaleLowerCase("vi-VN").trim())).size).toBe(exercises.length);

    for (const band of practiceBands) {
      const items = bands.get(band) ?? [];
      const summary = bandIndex.find((item) => item.level === band);
      expect(summary?.keys).toEqual(items.map(reviewKey));
      expect(summary?.topics).toBe(new Set(items.map((item) => item.topic)).size);
      // The 950 published exercises keep their per-band counts; ESL v2 and bridge-v3 only add.
      const target = Number(band) < 3 ? 40 : Number(band) < 5 ? 50 : Number(band) < 7 ? 60 : 70;
      expect(items.filter((item) => item.source !== "esl-v2" && item.source !== "bridge-v3")).toHaveLength(target);
      for (const item of items) {
        expect(item.practiceLevel).toBe(band);
        expect(practiceExerciseSchema.safeParse(item).success).toBe(true);
        expect(item.source).not.toMatch(/^original-pattern/);
        expect(item.targetTerm).toBeTruthy();
        expect(item.referenceAnswers[0].toLocaleLowerCase("en-US")).toContain((item.targetTerm ?? "").toLocaleLowerCase("en-US"));
        if (band === "1.0") expect(item.type).toBe("word");
        if (band === "1.5" || band === "2.0") expect(item.type).toBe("phrase");
        if (band === "2.5") expect(["phrase", "sentence"]).toContain(item.type);
      }
      if (Number(band) >= 7) {
        expect(items.every((item) => item.type === "paragraph")).toBe(true);
        for (const item of items) {
          const minSentences = item.source === "bridge-v3" ? 2 : 3;
          expect((item.promptVi.match(/[.!?]/g) ?? []).length).toBeGreaterThanOrEqual(minSentences);
          expect((item.referenceAnswers[0].match(/[.!?]/g) ?? []).length).toBeGreaterThanOrEqual(minSentences);
        }
      }
    }
  });

  it("adds ESL v2 lessons and curates topics, variants and clean notes without giving the answer away", async () => {
    const all = [...(await allExercises()).values()].flat();
    const esl = all.filter((item) => item.source === "esl-v2");
    expect(esl).toHaveLength(1090);
    expect(esl.filter((item) => item.referenceAnswers.length > 1).length).toBeGreaterThanOrEqual(311);

    const canonicalSet = new Set<string>(CANONICAL_TOPICS);
    for (const item of all) {
      expect(canonicalSet.has(item.topic)).toBe(true);
      expect(item.explanationVi).not.toContain("Ví dụ dịch chưa đạt:");
      expect(item.explanationVi).not.toContain("nghĩa xác thực");
    }

    for (const summary of bandIndex) {
      const sumTopics = Object.values(summary.topicCounts ?? {}).reduce((a, b) => a + b, 0);
      expect(sumTopics).toBe(summary.keys.length);
    }

    for (const item of esl) {
      expect(item.editorialStatus).toBe("pilot");
      expect(Number(item.practiceLevel)).toBeGreaterThanOrEqual(2.5);
      for (const answer of item.referenceAnswers) expect(item.explanationVi).not.toContain(answer);
      for (const error of item.commonErrors) expect(error.incorrect).not.toBe(error.correction);
    }
  });

  it("builds a hint ladder from the model answer for nearly every exercise", async () => {
    const exercises = [...(await allExercises()).values()].flat();
    // Collect problems and assert once: per-hint expects across 2,000+ exercises are slow.
    const problems: string[] = [];
    let framed = 0;
    for (const item of exercises) {
      const ladder = hintLadder(item);
      if (ladder.some((hint) => hint.kind === "frame")) framed++;
      for (const hint of ladder) {
        if (item.referenceAnswers.some((answer) => answer.trim().toLowerCase() === hint.text.trim().toLowerCase())) problems.push(`${item.id}: ${hint.kind} equals the answer`);
      }
      const order = ladder.map((hint) => hint.kind).filter((kind) => kind !== "keyword");
      if (order.join() !== ["frame", "grammar", "letters"].filter((kind) => order.includes(kind as never)).join()) problems.push(`${item.id}: order ${order}`);
    }
    expect(problems).toEqual([]);
    expect(framed).toBeGreaterThan(1900);
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

describe("evaluateExpression & interactive builders", () => {
  it("recognises IELTS synonyms without marking valid paraphrases as traps", () => {
    const model = ["This scholarship gives students from rural areas the opportunity to attend university."];
    const paraphrase = "This grant enables learners from countryside areas to pursue university.";
    const result = evaluateExpression(paraphrase, model, []);
    expect(result.conceptScore).toBeGreaterThanOrEqual(70);
    expect(result.detectedTrap).toBeNull();
    expect(result.learnerTokens.some((tok) => tok.role === "synonym")).toBe(true);
    // Function words in model are not dictionary-lookup buttons.
    const theToken = result.modelTokens.find((tok) => tok.text === "the");
    const scholToken = result.modelTokens.find((tok) => tok.text === "scholarship");
    expect(theToken?.lookupable).toBe(false);
    expect(scholToken?.lookupable).toBe(true);
  });

  it("flags common Vietnamese->English grammar traps accurately", () => {
    const model = ["I believe public libraries should stay open later."];
    const errors = [{
      incorrect: "I believe public libraries should to stay open later.",
      correction: "I believe public libraries should stay open later.",
      reasonVi: "Modal should đi với động từ nguyên mẫu không có to.",
    }];
    const result = evaluateExpression("I think public libraries should to stay open later.", model, errors);
    expect(result.detectedTrap).not.toBeNull();
    expect(result.learnerTokens.some((tok) => tok.role === "trap")).toBe(true);
  });

  it("builds chunk puzzles and splits aligned paragraphs into steps", () => {
    const puzzle = buildChunkPuzzle({
      id: "band-5.0-test",
      type: "sentence",
      referenceAnswers: ["Shops can reduce waste by using less packaging."],
      commonErrors: [{
        incorrect: "Shops can reduce waste by use less packaging.",
        correction: "Shops can reduce waste by using less packaging.",
        reasonVi: "Sau giới từ by dùng V-ing.",
      }],
    });
    expect(puzzle.solution.map((c) => c.text).join(" ")).toBe("Shops can reduce waste by using less packaging.");
    expect(puzzle.bank.some((c) => c.isDistractor)).toBe(true);

    const steps = splitParagraphSteps({
      type: "paragraph",
      promptVi: "Câu một nêu luận điểm. Câu hai đưa phản biện. Câu ba chốt điều kiện.",
      referenceAnswers: ["Sentence one states the claim. Sentence two gives a counterpoint. Sentence three sets the condition."],
    });
    expect(steps).toHaveLength(3);
    expect(steps?.[1]?.promptVi).toBe("Câu hai đưa phản biện.");
  });

  it("segments Vietnamese sentences into tap-to-reveal phrase rescues and builds structural blueprints", async () => {
    const sample = {
      id: "band-5.5-health",
      type: "sentence" as const,
      promptVi: "Tập thể dục thường xuyên có thể giúp phòng ngừa một số bệnh mãn tính.",
      referenceAnswers: ["Regular exercise can help prevent some chronic diseases."],
      targetTerm: "prevent",
      meaningVi: "phòng ngừa",
      explanationVi: "Prevent đi với danh từ chỉ bệnh; can help giữ sắc thái thận trọng.",
    };
    const chips = buildPhraseHints(sample);
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips[0]?.en.toLowerCase()).toBe("regular exercise");
    expect(chips.at(-1)?.en.toLowerCase()).toContain("chronic diseases");

    const blueprint = buildSentenceBlueprint(sample);
    expect(blueprint.formula).toContain("can help");
    expect(blueprint.formula).not.toContain("___");

    // Guarantee zero mid-word Vietnamese splits across all 2,080 exercises!
    const all = [...(await allExercises()).values()].flat();
    const brokenSplits = all.filter((item) => {
      const joined = buildPhraseHints(item).map((c) => c.vi).join(" ").replace(/\s+/g, " ").trim();
      const expected = item.promptVi.replace(/\s+/g, " ").trim();
      return joined !== expected;
    });
    expect(brokenSplits).toEqual([]);
  });
});
