import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BITE_STAGE_SIZE, catalog, lessonDone, lessonStars, levelStarSummary, nextStarTarget } from "../src/features/grammar/grammar-catalog";
import { SessionSummary } from "../src/features/grammar/practice-session";
import { GrammarToday } from "../src/features/grammar/grammar-today";
import { stageQueue } from "../src/lib/grammar/schedule";
import type { GrammarLessonProgress, GrammarPracticeItem } from "../src/lib/grammar/types";

const now = "2026-11-27T08:00:00.000Z";
const makeProgress = (count: number): GrammarLessonProgress => ({
  theorySeen: true,
  updatedAt: now,
  responses: Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `A1-01-Q${String(i + 1).padStart(2, "0")}`,
      { answer: "She", status: "UNDERSTOOD" as const, correct: true, updatedAt: now },
    ]),
  ),
});

describe("Grammar Phase 3 3-Star Mastery, Bite-sized Sprints & Combo UX", () => {
  it("computes 1-star, 2-star, and 3-star milestones without requiring 51-question walls", () => {
    const a101 = catalog.find((item) => item.code === "A1-01")!;
    expect(lessonStars(a101, makeProgress(6))).toBe(0);
    expect(lessonDone(a101, makeProgress(6))).toBe(false);
    expect(nextStarTarget(a101, makeProgress(6))).toEqual({ target: 8, remaining: 2, nextStar: 1 });

    expect(lessonStars(a101, makeProgress(8))).toBe(1);
    expect(lessonDone(a101, makeProgress(8))).toBe(true);
    expect(nextStarTarget(a101, makeProgress(9))).toEqual({ target: 18, remaining: 9, nextStar: 2 });

    expect(lessonStars(a101, makeProgress(18))).toBe(2);
    expect(lessonStars(a101, makeProgress(24))).toBe(3);
    expect(nextStarTarget(a101, makeProgress(24))).toBeNull();

    const summary = levelStarSummary("A1", { "A1-01": makeProgress(24), "A1-02": makeProgress(8) });
    expect(summary).toMatchObject({ earned: 4, max: 90, startedLessons: 2, masteredLessons: 1, totalLessons: 30 });
  });

  it("caps bite-sized stage sprints to 8–10 questions per round", () => {
    const items: GrammarPracticeItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `A1-01-Q${String(i + 1).padStart(2, "0")}`,
      stage: "guided",
      type: "mcq",
      instruction: "",
      prompt: `Q${i + 1}`,
      translation: null,
      options: ["a", "b"],
      chunks: [],
      hint: null,
      publishable: false,
    }));
    const sprint = stageQueue(items, "guided", undefined, BITE_STAGE_SIZE.guided);
    expect(sprint).toHaveLength(8);
  });

  it("renders 3-star progress, combo streak KPIs, and sprint copy in SessionSummary and GrammarToday", () => {
    const summaryHtml = renderToStaticMarkup(
      createElement(
        SessionSummary,
        {
          result: {
            entries: [],
            firstTry: { "A1-01:Q1": true, "A1-01:Q2": true, "A1-01:Q3": true, "A1-01:Q4": true, "A1-01:Q5": true },
            bestCombo: 5,
          },
          progress: {},
          title: "Hoàn thành chặng Có hướng dẫn",
          starsEarned: 2,
        },
        createElement("span", null, "Next"),
      ),
    );
    expect(summaryHtml).toContain("100%");
    expect(summaryHtml).toContain("🔥 x5");
    expect(summaryHtml).toContain("Đạt 2 trên 3 sao");

    const todayHtml = renderToStaticMarkup(createElement(GrammarToday, { progress: {}, level: "A1", unlocked: ["A1"] }));
    expect(todayHtml).toContain("Chặng 1 Sao · 8 câu ngắn (~4 phút)");
  });
});
