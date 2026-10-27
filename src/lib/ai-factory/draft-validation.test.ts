import { describe, expect, it } from "vitest";
import { validateFactoryDraft } from "./draft-validation";
import type { NormalizedExam } from "../ielts-bank/schema";

const base: NormalizedExam = {
  externalId: "test", skill: "Writing", format: "Academic", mode: "practice", title: "A public transport policy",
  durationMinutes: 40, sourceUrl: "https://example.org", attribution: "Original practice", license: "Original", licenseUrl: "https://example.org",
  aiGenerated: true, upstreamVersion: "test", content: { sections: [], prompt: "", taskType: "Task 2", minimumWords: 250 },
};

describe("factory draft gate", () => {
  it("holds a vague writing task for review", () => {
    expect(validateFactoryDraft(base)).toContain("writing_prompt_invalid");
  });

  it("rejects a reading answer whose cited evidence is absent", () => {
    const passage = Array.from({ length: 90 }, () => "The coastal survey recorded seasonal changes in native plants and water quality.").join(" ");
    const questions = Array.from({ length: 10 }, (_, index) => ({
      id: `q${index + 1}`, number: index + 1, type: "short_answer", prompt: "What did the survey record?", instructions: "NO MORE THAN THREE WORDS",
      options: [], answers: ["native plants"], explanation: "The passage identifies native plants and water quality.",
    }));
    const exam: NormalizedExam = { ...base, skill: "Reading", content: { sections: [{ id: "passage-1", title: "Coastal survey", passage, transcript: "", questions }], prompt: "" } };
    const evidence = Object.fromEntries(questions.map((q) => [q.id, "The mountain study recorded unrelated results."]));
    expect(validateFactoryDraft(exam, evidence)).toContain("evidence_missing:q1");
  });
});
