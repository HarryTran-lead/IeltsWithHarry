import { describe, expect, it } from "vitest";
import type { StudyTask } from "../src/lib/demo-data";
import {
  addDay, addMonths, dayCounts, dayLabel, daysBetween, findPlanned, inferSkill, lateDays, minutesLabel, minutesOf, mondayOf,
  monthGrid, monthLabel, overdueTasks, plannerSummary, seriesDates, tasksForDay, weekOfDay, weekdayOf,
} from "../src/lib/planner/core";
import { lessonInfo, lessonSlug } from "../src/lib/planner/links";
import { buildSuggestions, focusSkills, generateWeekPlan } from "../src/lib/planner/suggest";

const task = (id: string, date: string, extra: Partial<StudyTask> = {}): StudyTask => ({
  id, title: id, skill: "Reading", date, time: "", completed: false, priority: "Medium", ...extra,
});
const open = () => true;

describe("planner calendar", () => {
  it("steps whole months across year ends", () => {
    expect(addMonths("2026-11-24", 1)).toBe("2026-12-01");
    expect(addMonths("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
    expect(monthLabel("2026-11-24")).toBe("Tháng 11/2026");
  });
  it("lays a month out in Monday-first weeks", () => {
    const november = monthGrid("2026-11-24");
    expect(november[0]).toBe("2026-10-26");
    expect(november.at(-1)).toBe("2026-12-06");
    expect(november.length).toBe(42);
    expect(monthGrid("2027-02-10")).toHaveLength(28);
    expect(monthGrid("2027-02-10")[0]).toBe("2027-02-01");
    expect(monthGrid("2026-02-10")).toHaveLength(35);
    expect(monthGrid("2026-06-01")[0]).toBe("2026-06-01");
  });
});

describe("planner dates", () => {
  it("does day arithmetic on calendar days", () => {
    expect(addDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-30", "2026-11-24")).toBe(25);
  });
  it("starts weeks on Monday, the T2 … CN order", () => {
    expect(weekdayOf("2026-11-24")).toBe(2);
    expect(weekdayOf("2026-11-29")).toBe(7);
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(weekOfDay("2026-11-24")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
  });
  it("labels days the way a learner says them", () => {
    expect(dayLabel("2026-11-24", "2026-11-24")).toBe("Hôm nay");
    expect(dayLabel("2026-11-25", "2026-11-24")).toBe("Ngày mai");
    expect(dayLabel("2026-11-23", "2026-11-24")).toBe("Hôm qua");
    expect(dayLabel("2026-11-26", "2026-11-24")).toBe("Thứ Năm, 26/11");
    expect(minutesLabel(45)).toBe("45 phút");
    expect(minutesLabel(70)).toBe("1 giờ 10 phút");
  });
});

describe("planner lists", () => {
  const today = "2026-11-24";
  const tasks = [
    task("late-old", "2026-10-30"), task("late-new", "2026-11-12"), task("late-done", "2026-11-01", { completed: true }),
    task("today-b", today, { sortOrder: 1 }), task("today-a", today, { sortOrder: 0, duration: 30 }), task("today-done", today, { completed: true, sortOrder: 0 }),
    task("sunday", "2026-11-29"), task("next-week", "2026-12-01"),
  ];
  it("keeps late tasks visible, oldest first, finished ones excluded", () => {
    expect(overdueTasks(tasks, today).map((item) => item.id)).toEqual(["late-old", "late-new"]);
    expect(lateDays(tasks[0], today)).toBe(25);
  });
  it("orders a day: open tasks in the learner's order, finished below", () => {
    expect(tasksForDay(tasks, today).map((item) => item.id)).toEqual(["today-a", "today-b", "today-done"]);
  });
  it("summarises today, this Monday-to-Sunday week and the late count", () => {
    const summary = plannerSummary(tasks, today);
    expect(summary.today).toEqual({ done: 1, total: 3, minutes: 70, doneMinutes: 20 });
    expect(summary.week.total).toBe(4);
    expect(summary.overdue).toBe(2);
    expect(dayCounts(tasks, weekOfDay(today)).get("2026-11-29")).toEqual({ total: 1, done: 0 });
  });
  it("finds an open linked task already planned for a day", () => {
    const linked = [task("a", today, { lesson: "dictation" }), task("b", today, { lesson: "news", completed: true })];
    expect(findPlanned(linked, "dictation", today)?.id).toBe("a");
    expect(findPlanned(linked, "news", today)).toBeUndefined();
    expect(findPlanned(linked, undefined, today)).toBeUndefined();
  });
});

describe("planner helpers", () => {
  it("guesses the skill of a quick-added task", () => {
    expect(inferSkill("Passage 2 TFNG")).toBe("Reading");
    expect(inferSkill("TASK 1: Map")).toBe("Writing");
    expect(inferSkill("Topic.")).toBe("Speaking");
    expect(inferSkill("Bài đọc về môi trường")).toBe("Reading");
    expect(inferSkill("Ôn 20 từ vựng")).toBe("Vocabulary");
    expect(inferSkill("Đi chợ")).toBe("Personal");
  });
  it("expands a weekly series and caps its length", () => {
    expect(seriesDates("2026-11-24", [2, 4], 2)).toEqual(["2026-11-24", "2026-11-26", "2026-12-01", "2026-12-03"]);
    expect(seriesDates("2026-11-24", [], 4)).toEqual(["2026-11-24"]);
    expect(seriesDates("2026-11-24", [1, 2, 3, 4, 5, 6, 7], 12).length).toBe(60);
  });
  it("links lessons to their pages and default lengths", () => {
    expect(lessonInfo("ielts:abc")?.href).toBe("/app/question-bank/exam/abc");
    expect(lessonInfo("news:my-article")?.href).toBe("/app/news/learn/my-article");
    expect(lessonInfo("reading:tfng")?.href).toBe("/app/reading?type=passage&kind=tfng");
    expect(lessonInfo("lab:writing-task-2")).toMatchObject({ href: "/app/self-study/writing-task-2", skill: "Writing", minutes: 40 });
    expect(lessonInfo("dictation")).toMatchObject({ href: "/app/dictation", minutes: 15, auto: true });
    expect(lessonInfo("writing-technology")).toBeNull();
    expect(lessonSlug("dictation", "L1-01")).toBe("dictation:L1-01");
    expect(minutesOf({ lesson: "vocabulary-review" })).toBe(10);
    expect(minutesOf({ lesson: "vocabulary-review", duration: 25 })).toBe(25);
  });
});

describe("planner suggestions and weekly plans", () => {
  const today = "2026-11-24";
  it("puts due reviews and the weakest question type first and skips what is planned", () => {
    const suggestions = buildSuggestions({
      today, tasks: [task("planned", today, { lesson: "dictation" })], vocabDue: 23,
      weakType: { skill: "Reading", label: "True/False/Not Given", kind: "tfng", correct: 7, total: 12 }, examDate: null, available: open,
    });
    expect(suggestions[0]).toMatchObject({ lesson: "vocabulary-review", duration: 8, title: "Ôn 23 từ đến hạn" });
    expect(suggestions[1]).toMatchObject({ lesson: "reading:tfng", priority: "High" });
    expect(suggestions.some((item) => item.lesson === "dictation")).toBe(false);
  });
  it("never suggests locked parts of the app", () => {
    const suggestions = buildSuggestions({ today, tasks: [], vocabDue: 0, weakType: null, examDate: null, available: (lesson) => lesson !== "news" });
    expect(suggestions.map((item) => item.lesson)).toEqual(["dictation", "grammar"]);
  });
  it("plans the chosen days from today on, within the daily minutes", () => {
    const plan = generateWeekPlan({ today, weekOf: today, weekdays: [1, 2, 4, 6], minutesPerDay: 45, focus: ["Writing"], examDate: null, available: open });
    const days = [...new Set(plan.map((item) => item.date))];
    expect(days).toEqual(["2026-11-24", "2026-11-26", "2026-11-28"]);
    for (const day of days) {
      const minutes = plan.filter((item) => item.date === day).reduce((total, item) => total + (item.duration ?? 0), 0);
      expect(minutes).toBeLessThanOrEqual(45);
      expect(plan.filter((item) => item.date === day)[0].lesson).toBe("vocabulary-review");
    }
    expect(plan.some((item) => item.skill === "Writing")).toBe(true);
    expect(plan.every((item) => item.source === "plan")).toBe(true);
  });
  it("adds a timed full test near the exam and leaves out locked skills", () => {
    const plan = generateWeekPlan({ today, weekOf: "2026-11-30", weekdays: [1, 3, 6], minutesPerDay: 90, focus: [], examDate: "2026-12-10", available: (lesson) => lesson !== "listening" });
    expect(plan.some((item) => item.lesson === "listening")).toBe(false);
    expect(plan.filter((item) => item.date === "2026-12-05").some((item) => item.title.includes("đề full"))).toBe(true);
  });
  it("ranks skills by the gap to their target band", () => {
    expect(focusSkills({ Reading: 7, Listening: 7, Writing: 6.5, Speaking: 6.5 }, { Reading: 6.5, Listening: 7, Writing: 5.5, Speaking: 6 })).toEqual(["Writing", "Reading", "Speaking"]);
  });
});
