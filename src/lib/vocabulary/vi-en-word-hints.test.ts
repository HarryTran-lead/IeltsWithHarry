import { describe, expect, it } from "vitest";
import { promptWordHints } from "./vi-en-word-hints";

describe("Vietnamese word hints", () => {
  it("finds contextual hints for only the hovered word or short phrase", () => {
    const prompt = "Tôi tìm hiểu về khu bảo hộ động vật khi đến thăm một trung tâm cứu hộ.";
    const hints = promptWordHints(
      prompt,
      "I learned about the animal sanctuary when I visited an animal rescue centre.",
      "animal sanctuary",
      "khu bảo hộ động vật",
    );
    expect(hints.map((hint) => hint.text).join(" ")).toBe("Tôi tìm hiểu về khu bảo hộ động vật khi đến thăm một trung tâm cứu hộ");
    expect(hints.find((hint) => hint.text === "Tôi")?.english).toContain("I");
    expect(hints.find((hint) => hint.text === "tìm")?.english).toContain("learned");
    expect(hints.find((hint) => hint.text === "hộ")?.english).toContain("sanctuary");
    expect(hints.every((hint) => hint.english.length <= 2 && hint.english.every((word) => word.split(/\s+/).length <= 4))).toBe(true);
  });

  it("does not substitute an unrelated dictionary sense absent from the model answer", () => {
    const hints = promptWordHints("Tôi về.", "I went.", "go", "đi");
    expect(hints.find((hint) => hint.text === "về")?.english).toEqual([]);
  });
});
