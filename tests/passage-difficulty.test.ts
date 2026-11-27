import { describe, expect, it } from "vitest";
import { PASSAGE_CUTOFFS, passageForScore, passageScore, textDifficulty, validRubric } from "../src/lib/news/passage-difficulty";
import { chooseTargets } from "../src/lib/news/press-discovery";
import { topUpCounts } from "../src/lib/news/question-factory-v2";

const plain = Array.from({ length: 12 }, (_, i) => `The team opened a new park on day ${i + 1}. Many families came to see it.`).join(" ");
const academic = Array.from({ length: 12 }, () => "Although conventional explanations emphasise institutional constraints, researchers increasingly contend that technological interdependence, which nevertheless remains underestimated, consequently reshapes organisational accountability.").join(" ");

describe("passage difficulty score", () => {
  it("rates dense academic prose above plain reporting", () => {
    expect(textDifficulty(academic)!).toBeGreaterThan(textDifficulty(plain)! + 0.5);
    expect(textDifficulty("Too short.")).toBeNull();
  });
  it("accepts only whole ratings from 1 to 5", () => {
    expect(validRubric({ abstraction: 1, argument: 2, inference: 3, vocabulary: 5 })).toEqual({ abstraction: 1, argument: 2, inference: 3, vocabulary: 5 });
    expect(validRubric({ abstraction: 0, argument: 2, inference: 3, vocabulary: 5 })).toBeNull();
    expect(validRubric({ abstraction: 2.5, argument: 2, inference: 3, vocabulary: 5 })).toBeNull();
    expect(passageScore(undefined, "argument", academic)).toBeNull();
  });
  it("maps a concrete report to Passage 1 and an abstract argument to Passage 3", () => {
    const low = passageScore({ abstraction: 1, argument: 1, inference: 1, vocabulary: 2 }, "factual", plain)!;
    const high = passageScore({ abstraction: 5, argument: 5, inference: 4, vocabulary: 5 }, "argument", academic)!;
    expect(passageForScore(low)).toBe(1);
    expect(passageForScore(high)).toBe(3);
    expect(passageForScore(PASSAGE_CUTOFFS.passage2)).toBe(2);
  });
  it("scores only style, abstraction, argument and the text measures", () => {
    const base = passageScore({ abstraction: 3, argument: 3, inference: 1, vocabulary: 1 }, "sections", academic);
    expect(passageScore({ abstraction: 3, argument: 3, inference: 5, vocabulary: 5 }, "sections", academic)).toBe(base);
    // Without usable text measures the score is the mean of the three judged parts.
    expect(passageScore({ abstraction: 3, argument: 3, inference: 2, vocabulary: 2 }, "sections", "Too short.")).toBe(50);
  });
  it("puts a sectioned text that is fairly abstract and argued in Passage 3, as Cambridge does", () => {
    // Typical calibration ratings: Passage 3 sections 3/3, Passage 2 sections 2/2, Passage 1 factual 1/1.
    expect(passageForScore(passageScore({ abstraction: 3, argument: 3, inference: 3, vocabulary: 4 }, "sections", "Too short.")!)).toBe(3);
    expect(passageForScore(passageScore({ abstraction: 2, argument: 2, inference: 2, vocabulary: 3 }, "sections", "Too short.")!)).toBe(2);
    expect(passageForScore(passageScore({ abstraction: 1, argument: 1, inference: 2, vocabulary: 3 }, "factual", "Too short.")!)).toBe(1);
  });
});

describe("evening out the passage mix", () => {
  it("writes the least represented passage first, harder on ties", () => {
    expect(chooseTargets({ 1: 5, 2: 4, 3: 0 }, 3)).toEqual([3, 3, 3]);
    expect(chooseTargets({ 1: 0, 2: 0, 3: 0 }, 4)).toEqual([3, 2, 1, 3]);
    expect(chooseTargets({ 1: 2, 2: 6, 3: 3 }, 2)).toEqual([1, 3]);
  });
});

describe("top-up within the set's forms", () => {
  it("lifts forms short of a full block before sharing the rest", () => {
    const passing = new Map([["tfng", 5], ["mcq", 1]] as const);
    expect(topUpCounts(["tfng", "mcq"], passing as never, 5)).toEqual([1, 4]);
    // Asking for exactly what is missing: an odd remainder cannot become half a Choose TWO question.
    const mixed = topUpCounts(["tfng", "mcq_multiple"], new Map() as never, 5);
    expect(mixed[0] + mixed[1]).toBe(5);
    expect(mixed[1] % 2).toBe(0);
  });
  it("asks for Choose TWO in whole questions", () => {
    const counts = topUpCounts(["mcq_multiple", "tfng"], new Map() as never, 5);
    expect(counts[0] % 2).toBe(0);
    expect(counts[0] + counts[1]).toBe(5);
  });
});
