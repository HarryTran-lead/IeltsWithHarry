import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import a2 from "../src/data/grammar-editorial/A2.json";
import { PracticeSession } from "../src/features/grammar/practice-session";
import { normalizeItem } from "../src/lib/grammar/normalize";
import { answered } from "../src/lib/grammar/schedule";
import { applyGrade, confirmSelfReview, reviewedCount } from "../src/lib/grammar/types";

vi.mock("server-only", () => ({}));
import { gradeEditorialAnswer } from "../src/lib/grammar/editorial";

const questions = a2["A2-05"].questions;
type GradeQuestion = Parameters<typeof gradeEditorialAnswer>[0];
const question = (id: string) => questions.find((item) => item.id === id)! as GradeQuestion;

describe("Grammar fill-in clues and grading", () => {
  it("shows the Vietnamese meaning before submission in a fill-in session", () => {
    const item = normalizeItem(question("A2-05-Q027"));
    const html = renderToStaticMarkup(createElement(PracticeSession, {
      entries: [{ code: "A2-05", item }], progress: {}, update: () => {},
      title: "Past Time Expressions", label: () => "Tự luyện", onFinish: () => {},
    }));
    expect(html).toContain("Bố đã nấu mì Ý tối hôm qua.");
    expect(html).toContain("dữ kiện để trả lời");
    expect(html).not.toContain("Xem nghĩa tiếng Việt");
  });

  it("accepts equivalent time phrases in the two reported questions", () => {
    expect(gradeEditorialAnswer(question("A2-05-Q023"), "at 9 pm last night").correct).toBe(true);
    expect(gradeEditorialAnswer(question("A2-05-Q023"), "at nine last night").correct).toBe(true);
    expect(gradeEditorialAnswer(question("A2-05-Q027"), "last night").correct).toBe(true);
  });

  it("leaves an unlisted free-text answer ungraded while still rejecting a wrong choice", () => {
    const unlisted = gradeEditorialAnswer(question("A2-05-Q027"), "tomorrow night");
    expect(unlisted.correct).toBeNull();
    expect(unlisted.feedback).toContain("tự đánh giá");
    const choice = questions.find((item) => item.type === "mcq")! as GradeQuestion;
    expect(gradeEditorialAnswer(choice, choice.options!.find((option) => option !== choice.correct_answer)!).correct).toBe(false);
  });

  it("requires self review before counting an ungraded answer as completed", () => {
    const now = "2026-11-21T00:00:00.000Z";
    const raw = gradeEditorialAnswer(question("A2-05-Q027"), "last evening");
    const pending = applyGrade({ answer: "last evening", updatedAt: now }, "last evening", raw, "Dad cooked pasta _____.", now);
    const lesson = { theorySeen: true, responses: { "A2-05-Q027": pending }, updatedAt: now };
    expect(pending.status).toBe("PENDING_REVIEW");
    expect(answered(lesson, "A2-05-Q027")).toBe(false);
    expect(reviewedCount(lesson)).toBe(0);
    const checked = confirmSelfReview(pending, true, now);
    expect(checked.correct).toBeNull();
    expect(answered({ ...lesson, responses: { "A2-05-Q027": checked } }, "A2-05-Q027")).toBe(true);
    expect(confirmSelfReview(pending, false, now).status).toBe("NEED_REVIEW");
  });
});
