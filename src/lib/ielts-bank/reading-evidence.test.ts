import { describe, expect, it } from "vitest";
import { evidenceFromExplanation, explanationWithoutEvidence } from "./reading-evidence";

describe("Reading review evidence", () => {
  const explanation = "Điền **silt** (bùn lắng): bồi lắng khiến hồ chứa được ít nước hơn.\n\nDẫn chứng (P1-F): “A pond that gradually filled with silt would store less water”";

  it("extracts an imported passage quote and leaves one clean explanation", () => {
    expect(evidenceFromExplanation(explanation)).toEqual({ paragraph: "P1-F", quote: "A pond that gradually filled with silt would store less water" });
    expect(explanationWithoutEvidence(explanation)).toBe("Điền **silt** (bùn lắng): bồi lắng khiến hồ chứa được ít nước hơn.");
  });

  it("does not invent evidence when a question has none", () => {
    expect(evidenceFromExplanation("Compare the two claims in paragraph B.")).toBeNull();
  });
});
