import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import a2 from "../src/data/grammar-editorial/A2.json";
import { PracticeSession } from "../src/features/grammar/practice-session";
import { GrammarToday } from "../src/features/grammar/grammar-today";
import { isGrammarSigningKeyValid } from "../src/lib/grammar/assessment-ticket";
import { normalizeItem } from "../src/lib/grammar/normalize";

vi.mock("server-only", () => ({}));
import { gradeEditorialAnswer } from "../src/lib/grammar/editorial";

describe("Grammar Phase 1 production hotfixes", () => {
  it("validates assessment signing key availability without throwing", () => {
    expect(isGrammarSigningKeyValid(undefined, false)).toBe(false);
    expect(isGrammarSigningKeyValid("short-key", false)).toBe(false);
    expect(isGrammarSigningKeyValid("local-demo-grammar-assessment-only", false)).toBe(false);
    expect(isGrammarSigningKeyValid("a".repeat(32), false)).toBe(true);
    expect(isGrammarSigningKeyValid(undefined, true)).toBe(true);
  });

  it("clarifies error_correction placeholder and accepts both replacement word and full sentence", () => {
    const raw = a2["A2-01"].questions.find((q) => q.id === "A2-01-Q036")!;
    const q = raw as unknown as Parameters<typeof gradeEditorialAnswer>[0];
    const item = normalizeItem(q);
    const html = renderToStaticMarkup(createElement(PracticeSession, {
      entries: [{ code: "A2-01", item }],
      progress: {},
      update: () => {},
      title: "A2-01",
      label: () => "Tự luyện",
      onFinish: () => {},
    }));
    expect(html).toContain("Chỉ nhập từ/cụm thay thế đúng");
    expect(html).not.toContain("Viết lại câu đúng…");

    expect(gradeEditorialAnswer(q, "weren't").correct).toBe(true);
    expect(gradeEditorialAnswer(q, "The hotel rooms weren't available before two o'clock.").correct).toBe(true);
    expect(gradeEditorialAnswer(q, "wasn't").correct).toBe(false);
  });

  it("excludes locked-level mistakes from GrammarToday open-level review count", () => {
    const now = "2026-11-27T00:00:00.000Z";
    const progress = {
      "A1-01": {
        theorySeen: true,
        updatedAt: now,
        responses: {
          "A1-01-Q001": { answer: "Her", status: "NEED_REVIEW" as const, correct: false, referenceAnswer: "She", updatedAt: now },
        },
      },
      "B1-01": {
        theorySeen: false,
        updatedAt: now,
        responses: {
          "B1-01-Q001": { answer: "approve", status: "NEED_REVIEW" as const, correct: false, referenceAnswer: "approved", updatedAt: now },
        },
      },
    };
    const html = renderToStaticMarkup(createElement(GrammarToday, {
      progress,
      level: "A1",
      unlocked: ["A2"],
    }));
    expect(html).toContain("1 câu cần ôn");
    expect(html).not.toContain("2 câu cần ôn");
  });
});
