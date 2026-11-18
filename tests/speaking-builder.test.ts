import { describe, expect, it } from "vitest";
import { builderSteps, filled } from "../src/features/ielts/speaking-builder";

const ask = (text: string, part: 1 | 3 = 1, topic = "education") => builderSteps({ id: "q", part, kind: "question", text }, topic);
const first = (text: string, part: 1 | 3 = 1) => ask(text, part)[0].options.map((option) => option.sentence);

describe("Speaking Builder", () => {
  it("answers a yes/no question by echoing it in the first person", () => {
    expect(first("Do you like your subject?")).toEqual([
      "Yes, I do. I really like my subject.",
      "Well, it depends, really — more on some days than others.",
      "Not really, to be honest. I don't like my subject that much.",
    ]);
    expect(first("Are you good with numbers?")[0]).toBe("Yes, I'd say I'm good with numbers.");
  });

  it("offers each side of an either/or question", () => {
    expect(first("Are you a student or do you work now?").slice(0, 2)).toEqual(["I'm a student.", "I work now."]);
    expect(first("Do you prefer to study in the mornings or in the afternoons?").slice(0, 2)).toEqual([
      "I prefer to study in the mornings, definitely.",
      "I prefer to study in the afternoons, to be honest.",
    ]);
    expect(first("Do you like tea or coffee?")[1]).toBe("I like coffee, to be honest.");
  });

  it("takes a stance on Part 3 yes/no questions and frames Part 3 wh-questions", () => {
    expect(first("Should schools give less homework?", 3)[0]).toBe("Yes, I'd definitely say that schools should give less homework.");
    expect(first("Are exams the best way to measure ability?", 3)[0]).toBe("Yes, I'd definitely say that exams are the best way to measure ability.");
    const wh = ask("How has technology changed learning?", 3)[0].options[0];
    expect(wh.blank).toBeTruthy();
    expect(filled(wh, "it has made learning more flexible")).toBe("Well, I'd say it has made learning more flexible.");
  });

  it("follows a negative answer with reasons against", () => {
    const steps = builderSteps({ id: "q", part: 1, kind: "question", text: "Do you like your subject?" }, "education", "neg");
    expect(steps.map((step) => step.label)).toEqual(["Trả lời", "Lý do", "Ví dụ", "Kết luận"]);
    expect(steps[1].options.every((option) => option.tone === "neg")).toBe(true);
  });

  it("builds a Part 2 answer in five steps that fit what the cue card is about", () => {
    const steps = builderSteps({ id: "c", part: 2, kind: "cue", text: "Describe an exam you prepared very hard for", bullets: ["what the exam was for", "how you prepared"] }, "education");
    expect(steps.map((step) => step.label)).toEqual(["Mở bài", "Bối cảnh", "Tả chung", "Tả sát đề", "Chốt lại"]);
    expect(steps[0].options[0].sentence).toBe("I'd like to talk about an exam I prepared very hard for.");
    expect(steps[2].options[0].sentence).toMatch(/experience/);
    expect(steps[3].options.map((option) => option.sentence)).toEqual(["As for what the exam was for, ___.", "As for how I prepared, ___."]);
  });
});
