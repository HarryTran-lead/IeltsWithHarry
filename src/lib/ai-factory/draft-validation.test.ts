import { describe, expect, it } from "vitest";
import { normalizeEvidenceQuote, validateFactoryDraft } from "./draft-validation";
import type { NormalizedExam } from "../ielts-bank/schema";

const base: NormalizedExam = {
  externalId: "test", skill: "Writing", format: "Academic", mode: "practice", title: "A public transport policy",
  durationMinutes: 40, sourceUrl: "https://example.org", attribution: "Original practice", license: "Original", licenseUrl: "https://example.org",
  aiGenerated: true, upstreamVersion: "test", content: { sections: [], prompt: "Write about public transport and give your opinion with examples from your experience.", taskType: "Writing Task 2", minimumWords: 250 },
};

describe("factory draft gate", () => {
  it("recovers a literal evidence span from an edge-ellipsis quote", () => {
    const passage = "The survey found that children in green spaces showed lower stress levels, especially after long walks.";
    expect(normalizeEvidenceQuote(passage, "...children in green spaces showed lower stress levels...")).toBe("children in green spaces showed lower stress levels");
    expect(normalizeEvidenceQuote(passage, "...a result that was never stated...")).toBe("...a result that was never stated...");
  });

  it("holds drafts that are not practice items or not flagged as AI-assisted", () => {
    expect(validateFactoryDraft(base)).toEqual([]);
    expect(validateFactoryDraft({ ...base, mode: "full_mock" })).toContain("practice_mode_required");
    expect(validateFactoryDraft({ ...base, aiGenerated: false })).toContain("ai_generated_flag_required");
  });
});
