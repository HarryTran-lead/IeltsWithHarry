import { describe, expect, it } from "vitest";
import { checkFormat, fitsLimit, wordLimit } from "../src/lib/ielts-bank/format-rules";
import type { ExamContent, ExamQuestion } from "../src/lib/ielts-bank/schema";

const q = (number: number, over: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id: `q${number}`, number, type: "note_completion", prompt: "Bring a __________", instructions: "Complete the notes below. Write ONE WORD ONLY for each answer.",
  options: [], answers: ["torch"], explanation: "", ...over,
});
const codes = (findings: { code: string; severity: string }[], severity = "error") => findings.filter((f) => f.severity === severity).map((f) => f.code);

describe("format rules", () => {
  it("reads word limits and applies the number allowance", () => {
    expect(wordLimit({ instructions: "Write ONE WORD AND/OR A NUMBER for each answer." })).toEqual({ words: 1, number: true });
    expect(fitsLimit("24 June", { words: 1, number: true })).toBe(true);
    expect(fitsLimit("safety briefing", { words: 1, number: true })).toBe(false);
    expect(fitsLimit("1990", { words: 1, number: false })).toBe(true);
    expect(fitsLimit("half past nine", { words: 2, number: false })).toBe(false);
    expect(fitsLimit("0800 555 118", { words: 1, number: true })).toBe(true);
  });

  it("accepts a well-formed Listening part and flags format errors", () => {
    const good: ExamContent = { prompt: "", sections: [{ id: "p1", title: "Part 1", passage: "", transcript: "", audioUrl: "https://x.test/a.mp3", questions: [
      ...Array.from({ length: 8 }, (_, i) => q(i + 1)),
      q(9, { type: "multiple_choice", prompt: "Why?", instructions: "Choose the correct letter, A, B or C.", options: ["A — one", "B — two", "C — three"], answers: ["B"] }),
      q(10, { type: "multiple_choice", prompt: "Who?", instructions: "Choose the correct letter, A, B or C.", options: ["A — one", "B — two", "C — three"], answers: ["A"] }),
    ] }] };
    expect(codes(checkFormat("Listening", good, "part"))).toEqual([]);

    const bad: ExamContent = { ...good, sections: [{ ...good.sections[0], audioUrl: undefined, questions: [
      q(1, { answers: ["safety briefing"] }),
      q(2, { prompt: "Bring a torch", instructions: "" }),
      q(3, { type: "multiple_choice", prompt: "Why?", instructions: "Choose", options: ["A — a", "B — b", "C — c", "D — d"], answers: ["E"] }),
      q(4, { type: "multiple_answers", prompt: "Which TWO?", instructions: "Choose TWO letters, A–E.", options: ["A — a", "B — b", "C — c", "D — d", "E — e"], answers: ["A", "C"] }),
    ] }] };
    expect(new Set(codes(checkFormat("Listening", bad, "part")))).toEqual(new Set(["L2", "G3", "G2", "G4", "L3", "G5", "L4"]));
  });

  it("checks a Choose TWO pair and Reading passage rules", () => {
    const pair = (n: number, answer: string): ExamQuestion => q(n, { type: "multiple_answers", group: "g", prompt: "Which TWO?", instructions: "Choose TWO letters, A–E.", options: ["A — a", "B — b", "C — c", "D — d", "E — e"], answers: [answer] });
    const passage = Array.from({ length: 120 }, () => "word word word word word word word").join(" ");
    const reading: ExamContent = { prompt: "", sections: [{ id: "r1", title: "Passage 1", passage, transcript: "", questions: [
      pair(1, "B"), pair(2, "B"),
      q(3, { type: "true_false_not_given", prompt: "Statement", instructions: "Do the following statements agree…", answers: ["MAYBE"] }),
      q(4, { type: "matching_headings", prompt: "Paragraph A", instructions: "Choose the correct heading", options: ["i — x", "ii — y"], answers: ["i"] }),
    ] }] };
    expect(new Set(codes(checkFormat("Reading", reading, "part")))).toEqual(new Set(["R6", "R4", "R5"]));
  });
});
