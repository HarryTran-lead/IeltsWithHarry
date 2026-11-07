import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { groupQuestions, QuestionGroupView } from "../src/features/ielts/bank-questions";
import type { ExamQuestion } from "../src/lib/ielts-bank/schema";

function question(number: number, type: string, prompt: string, options: string[] = [], mediaUrl?: string): ExamQuestion {
  return { id: `q-${number}`, number, type, prompt, instructions: "Complete the form below.", options, answers: ["A"], explanation: "", ...(mediaUrl ? { mediaUrl } : {}) };
}

const props = {
  answers: {} as Record<string, string>,
  setAnswer: () => {},
  flags: [] as string[],
  toggleFlag: () => {},
  numberOf: (id: string) => Number(id.slice(2)),
};

describe("Listening question layouts", () => {
  it("keeps a printed form as a table with one answer field per number", () => {
    const group = groupQuestions([question(1, "form_completion", "Name"), question(2, "form_completion", "Phone")])[0];
    const html = renderToStaticMarkup(<QuestionGroupView group={group} props={props} printed={"Detail | Answer\nName | **1** __________\nPhone | **2** __________"} />);
    expect(html).toContain("<table");
    expect((html.match(/<input/g) || []).length).toBe(2);
    expect(html).toContain("aria-label=\"Câu 1\"");
    expect(html).toContain("aria-label=\"Câu 2\"");
  });

  it("shows a map beside the letter grid", () => {
    const mediaUrl = "https://example.org/map.png";
    const group = groupQuestions([question(15, "map_labelling", "Stage", ["A", "B", "C"], mediaUrl), question(16, "map_labelling", "Water station", ["A", "B", "C"], mediaUrl)])[0];
    const html = renderToStaticMarkup(<QuestionGroupView group={group} props={props} />);
    expect(html).toContain(mediaUrl);
    expect(html).toContain("bq-matrix");
    expect((html.match(/type=\"radio\"/g) || []).length).toBe(6);
  });

  it("shows one shared choice set for a Choose TWO question", () => {
    const options = ["A — Morning", "B — Afternoon", "C — Evening", "D — Weekend", "E — Online"];
    const questions = [11, 12].map((number) => ({ ...question(number, "multiple_answers", "Which TWO times are available?", options), group: "times" }));
    const html = renderToStaticMarkup(<QuestionGroupView group={groupQuestions(questions)[0]} props={props} />);
    expect((html.match(/Which TWO times are available\?/g) || []).length).toBe(1);
    expect((html.match(/type=\"checkbox\"/g) || []).length).toBe(5);
    expect(html).toContain("Chọn 2 đáp án cho câu 11–12");
  });
});
