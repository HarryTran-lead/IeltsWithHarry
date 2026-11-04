import { describe, expect, it } from "vitest";
import { findEvidenceLocation } from "../src/lib/news/evidence-location";

const passage = [
  "Scans showed a three-centimeter mass near specific lumbar vertebrae and critical nerve bundles.",
  "Post-surgery, the individual showed no new neurological damage and managed to stand and walk unassisted after two days. He later returned home.",
];

describe("findEvidenceLocation", () => {
  it("locates an exact evidence sentence in the correct paragraph", () => {
    const location = findEvidenceLocation(passage, "Post-surgery, the individual showed no new neurological damage and managed to stand and walk unassisted after two days.");
    expect(location?.paragraph).toBe(1);
    expect(passage[1].slice(location!.start, location!.end)).toContain("walk unassisted after two days");
  });

  it("ignores punctuation and spacing differences", () => {
    const location = findEvidenceLocation(passage, "Scans showed a three centimeter mass near specific lumbar vertebrae and critical nerve bundles");
    expect(location?.paragraph).toBe(0);
  });

  it("uses a strong paraphrase match without choosing an unrelated sentence", () => {
    expect(findEvidenceLocation(passage, "After surgery, the individual had no new neurological damage and walked unassisted after two days")?.paragraph).toBe(1);
    expect(findEvidenceLocation(passage, "The hospital treated hundreds of children last year")).toBeNull();
  });
});
