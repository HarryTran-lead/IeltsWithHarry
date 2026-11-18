"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ProgressView } from "@/features/progress/progress-page";
import type { LearnerOverview } from "@/lib/account";
import { estimateBand } from "@/lib/ielts-bank/band";
import { todayISO } from "@/lib/demo-data";
import type { InsightAttempt, ProgressInsights } from "@/lib/progress-insights";
import { addDays, emptyDay, emptyGoals, type ProgressDay, type ProgressSkill } from "@/lib/study-progress";

/** Deterministic pseudo-random numbers so the fixture looks the same on every load. */
function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function fixture() {
  const today = todayISO(), random = seeded(7);
  const days: ProgressDay[] = [];
  for (let offset = 90; offset >= 0; offset -= 1) {
    const day = emptyDay(addDays(today, -offset));
    const busy = random() < (offset < 30 ? 0.75 : 0.5);
    if (busy) {
      day.active = true;
      day.Reading = Math.floor(random() * 3); day.Listening = Math.floor(random() * 3);
      day.Writing = random() < 0.2 ? 1 : 0; day.Speaking = random() < 0.1 ? 1 : 0; day.other = Math.floor(random() * 3);
      day.minutes = (day.Reading + day.Listening) * 18 + day.Writing * 40;
    }
    days.push(day);
  }
  const titles: Record<ProgressSkill, string[]> = {
    Reading: ["Cambridge-style Test 3 · The history of glass", "Urban farming in Singapore", "The psychology of habit", "Ocean plastics: a new approach"],
    Listening: ["Exchange programme enquiry", "Museum audio tour", "Campus accommodation", "Lecture: coral reef recovery"],
    Writing: ["Task 2 · Remote work and cities", "Task 1 · Energy consumption 1990–2020"],
    Speaking: ["Part 2 · A place you would like to visit"],
  };
  const attempts: InsightAttempt[] = [];
  const plan: [ProgressSkill, number, number, boolean][] = [
    ["Reading", 13, 20, false], ["Listening", 22, 40, false], ["Reading", 8, 13, true], ["Writing", 0, 0, false], ["Listening", 6, 10, true],
    ["Reading", 26, 40, false], ["Listening", 27, 40, false], ["Reading", 9, 13, true], ["Writing", 0, 0, false], ["Listening", 8, 10, true],
    ["Reading", 29, 40, false], ["Listening", 30, 40, false], ["Speaking", 0, 0, false], ["Reading", 10, 14, true],
  ];
  plan.forEach(([skill, score, total, partial], index) => {
    const submittedAt = `${addDays(today, -(plan.length - index) * 5)}T09:30:00Z`;
    const writing = skill === "Writing" ? [5.5, 6][index > 5 ? 1 : 0] : null;
    attempts.unshift({
      id: `a${index}`, title: titles[skill][index % titles[skill].length], skill, format: "Academic",
      score: total ? score : null, total: total || null, partial, part: partial ? String((index % 3) + 1) : null,
      band: total ? estimateBand(skill, "Academic", score, total) : writing, minutes: total ? (partial ? 18 : 55) : 38, submittedAt,
    });
  });
  const insights: ProgressInsights = {
    attempts,
    questionTypes: [
      { skill: "Reading", type: "True / False / Not Given", correct: 21, total: 38 },
      { skill: "Reading", type: "Matching headings", correct: 9, total: 20 },
      { skill: "Reading", type: "Sentence completion", correct: 24, total: 30 },
      { skill: "Reading", type: "Multiple choice", correct: 15, total: 19 },
      { skill: "Reading", type: "Summary completion", correct: 11, total: 16 },
      { skill: "Reading", type: "Matching information", correct: 1, total: 2 },
      { skill: "Listening", type: "Form completion", correct: 34, total: 38 },
      { skill: "Listening", type: "Multiple choice", correct: 12, total: 21 },
      { skill: "Listening", type: "Map labelling", correct: 5, total: 10 },
      { skill: "Listening", type: "Note completion", correct: 19, total: 25 },
    ],
  };
  const overview = {
    profile: null, controls: null,
    streak: { current: 6, longest: 14, today, activeToday: true, totalDays: 58, days: [] },
    stats: { lessons: 42, lessonScore: 78, newsQuizzes: 17, newsScore: 71, newsRead: 33, words: 186, dictation: 240, ieltsAttempts: attempts.length, tasksDone: 31, tasksOpen: 4, messages: 0 },
    openTasks: [],
    timeline: [
      { kind: "ielts", at: `${addDays(today, 0)}T08:10:00Z`, title: "Lecture: coral reef recovery", score: 30, total: 40 },
      { kind: "dictation", at: `${addDays(today, -1)}T19:00:00Z`, title: "BBC 6 Minute English · Sleep" },
      { kind: "lesson", at: `${addDays(today, -1)}T18:20:00Z`, title: "Starter U01 Listening Exchange Programme", score: 3, total: 5 },
      { kind: "word", at: `${addDays(today, -2)}T12:00:00Z`, title: "sustainable" },
      { kind: "news_quiz", at: `${addDays(today, -3)}T07:45:00Z`, title: "Cities test four-day week", score: 7, total: 10 },
      { kind: "task", at: `${addDays(today, -4)}T21:00:00Z`, title: "Ôn 20 từ Academic Word List" },
    ],
  } as unknown as LearnerOverview;
  return { today, days, insights, overview, goals: { ...emptyGoals, overall: 7, Reading: 7, Listening: 7.5, Writing: 6.5, Speaking: 6.5, examDate: addDays(today, 54) } };
}

function Preview() {
  const empty = useSearchParams().get("empty") === "1";
  const data = fixture();
  return <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 16px" }}>
    {empty
      ? <ProgressView today={data.today} days={[]} goals={emptyGoals} overview={null} insights={{ attempts: [], questionTypes: [] }} loading={false} />
      : <ProgressView today={data.today} days={data.days} goals={data.goals} overview={data.overview} insights={data.insights} loading={false} />}
  </div>;
}

export function ProgressPreview() {
  return <Suspense fallback={null}><Preview /></Suspense>;
}
