import { describe, expect, it } from "vitest";
import { editorApproves } from "../src/lib/news/fact-dossier";

describe("learner editor gate", () => {
  it("keeps a draft at B2 or C1 that flows and has no listed problem", () => {
    expect(editorApproves({ level: "B2", coherent: true, problems: [] })).toBe(true);
    expect(editorApproves({ level: "C1", coherent: true, problems: [] })).toBe(true);
  });
  it("asks for one revision when the level, flow or a concrete problem is off", () => {
    expect(editorApproves({ level: "C2", coherent: true, problems: [] })).toBe(false);
    expect(editorApproves({ level: "B1", coherent: true, problems: [] })).toBe(false);
    expect(editorApproves({ level: "B2", coherent: false, problems: [] })).toBe(false);
    expect(editorApproves({ level: "B2", coherent: true, problems: ["Paragraph 4 repeats paragraph 2."] })).toBe(false);
    expect(editorApproves({})).toBe(false);
  });
});
