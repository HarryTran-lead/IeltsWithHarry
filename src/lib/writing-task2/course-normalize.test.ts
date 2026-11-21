import { describe, expect, it } from "vitest";
import { buildCourseModule, labelOf } from "./course-normalize";

describe("buildCourseModule", () => {
  it("keeps each teaching unit once when a guide repeats it under another key", () => {
    const step = (name: string) => ({ name_vi: name, instruction_vi: `Làm ${name}` });
    const { module } = buildCourseModule("R01", [{
      path: "R01/REQUIREMENT_GUIDE.json", visibility: "learner_guided",
      data: { steps: [step("Đọc nguyên đề"), step("Tách nhiệm vụ")], parts: [step("Đọc nguyên đề"), step("Tách nhiệm vụ"), step("Giữ phạm vi")] },
    }]);
    expect(module.units.map((unit) => unit.title)).toEqual(["Đọc nguyên đề", "Tách nhiệm vụ", "Giữ phạm vi"]);
    expect(module.counts.units).toBe(3);
  });
});

describe("labelOf", () => {
  it("names R01's numbered reading stages in Vietnamese", () => {
    expect(labelOf("stage1")).toBe("Bước 1 · Chủ đề và đối tượng");
    expect(labelOf("Stage5")).toBe("Bước 5 · Lập trường");
    expect(labelOf("stage3_vi")).toBe("Bước 3 · Các nhiệm vụ");
  });
});
