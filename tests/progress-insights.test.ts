import { describe, expect, it } from "vitest";
import {
  accuracyForBand, behaviorInsights, classifyAttempt, examPlan, hasAnswer, overallBand, skillSummaries, weakTypes, wordCount, writingTask,
  type InsightAttempt, type TypeStat,
} from "../src/lib/progress-insights";
import { bucketActivity, dayIntensity, derivedOverallGoal, emptyDay, emptyGoals } from "../src/lib/study-progress";

const attempt = (patch: Partial<InsightAttempt>): InsightAttempt => ({
  id: Math.random().toString(36).slice(2), title: "Test", skill: "Reading", format: "Academic", score: 30, total: 40, band: 7,
  partial: false, part: null, minutes: 55, submittedAt: "2026-11-10T10:00:00Z", status: "valid", ...patch,
});

describe("attempt validity", () => {
  it("ignores system keys when looking for an answer", () => {
    expect(hasAnswer({ __section: "s1", q1: " " })).toBe(false);
    expect(hasAnswer({ q1: "B" })).toBe(true);
    expect(hasAnswer({ __response: "Some essay" })).toBe(true);
    expect(hasAnswer(null)).toBe(false);
  });

  it("flags abandoned and rushed Reading tests", () => {
    // 39 of 40 skipped after the timer ran out.
    expect(classifyAttempt({ skill: "Reading", questions: 40, answered: 1, seconds: 3600 })).toBe("abandoned");
    // 12 of 13 right in three minutes: a retake after seeing the answers.
    expect(classifyAttempt({ skill: "Reading", questions: 13, answered: 13, seconds: 180 })).toBe("rushed");
    expect(classifyAttempt({ skill: "Reading", questions: 13, answered: 13, seconds: 1800 })).toBe("valid");
  });

  it("judges essays by length, not by time", () => {
    expect(wordCount("In many countries, people   who commit minor crimes…")).toBe(8);
    expect(writingTask("Writing Task 1: Mixed Commuting Verdon")).toBe(1);
    expect(writingTask("Writing Task 2: Advantages Disadvantages")).toBe(2);
    expect(classifyAttempt({ skill: "Writing", words: 60, task: 1 })).toBe("abandoned");
    expect(classifyAttempt({ skill: "Writing", words: 280, task: 2 })).toBe("valid");
  });
});

describe("band estimate", () => {
  it("leaves abandoned and rushed tests out of the band", () => {
    const [reading] = skillSummaries([
      attempt({ band: 5.5, partial: true, total: 13, submittedAt: "2026-11-10T11:00:00Z" }),
      attempt({ band: 0, score: 0, status: "abandoned", submittedAt: "2026-11-09T16:00:00Z" }),
      attempt({ band: 8.5, partial: true, total: 13, status: "rushed", submittedAt: "2026-11-07T16:00:00Z" }),
    ]);
    expect(reading.current).toBe(5.5);
    expect(reading.valid).toBe(1);
    expect(reading.attempts).toBe(3);
    // One single passage is weak evidence: a wide margin and more tests needed.
    expect(reading.margin).toBe(1.5);
    expect(reading.needMore).toBe(3);
    expect(reading.bestPartial).toBe(true);
  });

  it("weights full tests above single passages", () => {
    const [reading] = skillSummaries([
      attempt({ band: 7, submittedAt: "2026-11-01T10:00:00Z" }),
      attempt({ band: 7, submittedAt: "2026-11-02T10:00:00Z" }),
      attempt({ band: 7, submittedAt: "2026-11-03T10:00:00Z" }),
      attempt({ band: 4, partial: true, total: 13, submittedAt: "2026-11-04T10:00:00Z" }),
    ]);
    // (4 × 0.35 + 7 + 7 + 7) / 3.35 ≈ 6.69 → 6.5; three tests' worth of evidence.
    expect(reading.current).toBe(6.5);
    expect(reading.needMore).toBe(0);
    expect(reading.best).toBe(7);
    expect(reading.bestPartial).toBe(false);
  });

  it("needs Reading, Listening and Writing before an overall", () => {
    const only = overallBand(skillSummaries([attempt({ band: 6 })]));
    expect(only.band).toBeNull();
    expect(only.missing).toEqual(["Listening", "Writing"]);
    const three = overallBand(skillSummaries([
      attempt({ band: 6 }), attempt({ skill: "Listening", band: 7 }), attempt({ skill: "Writing", band: 6, task: 2, score: null, total: null }),
    ]));
    expect(three.band).toBe(6.5);
    expect(three.withoutSpeaking).toBe(true);
  });
});

describe("goals and plan", () => {
  it("derives the overall target from four skill targets", () => {
    expect(derivedOverallGoal({ ...emptyGoals, Reading: 7, Listening: 7.5, Writing: 6, Speaking: 6.5 })).toBe(7);
    expect(derivedOverallGoal({ ...emptyGoals, Reading: 7 })).toBeNull();
  });

  it("compares the pace needed with the recent pace", () => {
    const attempts = [attempt({ band: 3, submittedAt: "2026-11-20T10:00:00Z" })];
    const summaries = skillSummaries(attempts);
    const goals = { ...emptyGoals, Reading: 6.5, examDate: "2027-02-20" };
    const plan = examPlan(goals, summaries, attempts, "2026-11-25");
    expect(plan.status).toBe("behind");
    if (plan.status !== "behind") return;
    expect(plan.daysLeft).toBe(87);
    expect(plan.gap).toBe(3.5);
    expect(plan.perWeekNeeded).toBe(Math.ceil((7 * 6) / (87 / 7)));
    expect(plan.perWeekNow).toBe(0.3);
    expect(examPlan({ ...goals, examDate: null }, summaries, attempts, "2026-11-25").status).toBe("no-exam");
    expect(examPlan({ ...emptyGoals, examDate: "2027-02-20" }, summaries, attempts, "2026-11-25").status).toBe("no-target");
  });
});

describe("question types", () => {
  it("knows the accuracy a band needs", () => {
    expect(accuracyForBand("Reading", 6.5)).toBeCloseTo(27 / 40);
    expect(accuracyForBand("Listening", 7)).toBeCloseTo(30 / 40);
  });

  it("judges only types with enough answers, against the target", () => {
    const rows: TypeStat[] = [
      { skill: "Reading", type: "Matching headings", correct: 2, wrong: 8, skipped: 17, total: 27 },
      { skill: "Reading", type: "True / False / Not Given", correct: 14, wrong: 20, skipped: 28, total: 62 },
      { skill: "Reading", type: "Diagram labelling", correct: 1, wrong: 3, skipped: 4, total: 8 },
    ];
    const { weak, byTarget } = weakTypes(rows, "Reading", 6.5);
    expect(byTarget).toBe(true);
    expect(weak).toEqual(["Matching headings", "True / False / Not Given"]);
  });
});

describe("study days", () => {
  it("counts a day only through real learning", () => {
    const days = bucketActivity([
      { at: "2026-11-20T03:00:00Z", skill: "Reading", minutes: 0, counted: false },
      { at: "2026-11-21T03:00:00Z", skill: "other", minutes: 0, counted: true },
    ], "2026-11-20", "2026-11-23", "Asia/Ho_Chi_Minh", { activeSeconds: { "2026-11-22": 420, "2026-11-23": 120 } });
    expect(days.map((day) => day.active)).toEqual([false, true, true, false]);
    expect(days[2]).toMatchObject({ activeMinutes: 7, minutes: 7 });
  });

  it("grades intensity by minutes or finished work", () => {
    expect(dayIntensity(undefined)).toBe(0);
    expect(dayIntensity({ ...emptyDay("2026-11-01"), active: true, other: 1 })).toBe(1);
    expect(dayIntensity({ ...emptyDay("2026-11-01"), active: true, Reading: 1, minutes: 70 })).toBe(4);
    expect(dayIntensity({ ...emptyDay("2026-11-01"), active: true, Listening: 5 })).toBe(3);
  });
});

describe("behaviour notes", () => {
  it("spots abandoned tests and ungraded essays", () => {
    const notes = behaviorInsights({
      today: "2026-11-25", days: [],
      attempts: [
        attempt({ status: "abandoned", minutes: 1 }), attempt({ status: "abandoned", minutes: 1 }), attempt({ status: "valid" }),
        attempt({ skill: "Writing", status: "valid", graded: false, band: null }),
      ],
    });
    const ids = notes.map((note) => note.id);
    expect(ids).toContain("abandoned");
    expect(ids).toContain("no-test");
    expect(ids).toContain("ungraded");
    expect(notes.length).toBeLessThanOrEqual(4);
  });
});
