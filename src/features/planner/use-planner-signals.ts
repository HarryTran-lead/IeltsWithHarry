"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { catalogQuestionTypes } from "@/lib/ielts-bank/catalog";
import { skillSummaries, type ProgressInsights } from "@/lib/progress-insights";
import type { ProgressGoals, ProgressReport } from "@/lib/study-progress";
import type { Skill } from "@/lib/demo-data";
import type { SuggestionInput } from "@/lib/planner/suggest";

export type PlannerSignals = {
  goals: ProgressGoals | null;
  examDate: string | null;
  vocabDue: number | null;
  weakType: SuggestionInput["weakType"];
  /** Current band estimate per skill from recent tests, for choosing what to practise more. */
  current: Partial<Record<Skill, number | null>>;
};

const empty: PlannerSignals = { goals: null, examDate: null, vocabDue: null, weakType: null, current: {} };
const GOALS_KEY = "ieltswithharry-progress-goals-v1";

/** "True/False/Not Given" → "tfng", so a suggestion can open the library filtered to that type. */
function typeKind(label: string) {
  const key = label.toLowerCase().replace(/[^a-z]+/g, "_");
  return catalogQuestionTypes.find((group) => group.test.test(key))?.id;
}

/**
 * What the planner needs to know about the learner beyond their tasks: exam date and target bands,
 * how many saved words are due, and the weakest question type in recent tests. Each source is
 * optional; a failed request just leaves that hint out.
 */
export function usePlannerSignals(today: string) {
  const [signals, setSignals] = useState<PlannerSignals>(empty);
  useEffect(() => {
    let active = true;
    const merge = (patch: Partial<PlannerSignals>) => { if (active) setSignals((current) => ({ ...current, ...patch })); };
    if (demoMode) {
      void Promise.resolve().then(() => {
        try {
          const goals = JSON.parse(localStorage.getItem(GOALS_KEY) ?? "null") as ProgressGoals | null;
          if (goals) merge({ goals, examDate: goals.examDate });
        } catch { /* storage may be blocked */ }
      });
      return () => { active = false; };
    }
    void fetch(`/api/progress?from=${today}&to=${today}`).then((response) => response.ok ? response.json() as Promise<ProgressReport> : null)
      .then((report) => { if (report?.goals) merge({ goals: report.goals, examDate: report.goals.examDate }); }).catch(() => {});
    void fetch("/api/progress/insights").then((response) => response.ok ? response.json() as Promise<ProgressInsights> : null)
      .then((insights) => {
        if (!insights) return;
        const weakest = insights.questionTypes.filter((item) => item.total >= 5)
          .sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
        const current = Object.fromEntries(skillSummaries(insights.attempts).map((item) => [item.skill, item.current]));
        merge({ current, weakType: weakest ? { skill: weakest.skill, label: weakest.type, kind: typeKind(weakest.type), correct: weakest.correct, total: weakest.total } : null });
      }).catch(() => {});
    void createClient().from("user_word_reviews").select("notebook_entry_id", { count: "exact", head: true }).lte("due_at", new Date().toISOString())
      .then(({ count, error }) => { if (!error) merge({ vocabDue: count ?? 0 }); });
    return () => { active = false; };
  }, [today]);
  return signals;
}
