"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { type Attempt, type StudyTask, seedTasks, todayISO } from "@/lib/demo-data";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { dailyGoalSchema, draftSchema, exerciseAnswersSchema, taskSchema } from "@/lib/validation/study";

type Grade = { score: number; total: number; review?: { slug: string; correctIndex: number; explanation: string }[] };
type StoreState = {
  tasks: StudyTask[]; attempts: Attempt[]; goal: number; draft: string; ready: boolean; error: string;
  clearError: () => void;
  addTask: (task: Omit<StudyTask, "id">) => Promise<void>;
  updateTask: (id: string, patch: Partial<StudyTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  reorderTask: (dragged: string, target: string) => Promise<void>;
  submitExercise: (lesson: string, answers: Record<string, number>, demoScore: number, total: number) => Promise<Grade>;
  saveDraft: (draft: string) => Promise<void>;
  setGoal: (goal: number) => Promise<void>;
};
const Store = createContext<StoreState | null>(null);
const KEY = "english-skill-lab-demo-v1";
const supabase = !demoMode && process.env.NEXT_PUBLIC_SUPABASE_URL ? createClient() : null;

type TaskRow = {
  id: string; title: string; skill: StudyTask["skill"]; due_date: string;
  due_time: string | null; completed: boolean; priority: StudyTask["priority"];
  lesson_slug: string | null; sort_order: number;
};
const toTask = (row: TaskRow): StudyTask => ({
  id: row.id, title: row.title, skill: row.skill, date: row.due_date,
  time: row.due_time?.slice(0, 5) ?? "", completed: row.completed,
  priority: row.priority, lesson: row.lesson_slug ?? undefined,
});
const toRow = (task: Partial<StudyTask>) => ({
  ...(task.title !== undefined && { title: task.title }),
  ...(task.skill !== undefined && { skill: task.skill }),
  ...(task.date !== undefined && { due_date: task.date }),
  ...(task.time !== undefined && { due_time: task.time || null }),
  ...(task.completed !== undefined && { completed: task.completed }),
  ...(task.priority !== undefined && { priority: task.priority }),
  ...(task.lesson !== undefined && { lesson_slug: task.lesson ?? null }),
});

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<StudyTask[]>(demoMode ? seedTasks() : []);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [goal, setGoalValue] = useState(5);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (demoMode) {
        try {
          const saved = localStorage.getItem(KEY);
          if (saved) {
            const data = JSON.parse(saved);
            if (Array.isArray(data.tasks)) setTasks(data.tasks);
            if (Array.isArray(data.attempts)) setAttempts(data.attempts);
            if (typeof data.goal === "number") setGoalValue(data.goal);
            if (typeof data.draft === "string") setDraft(data.draft);
          }
        } catch { /* Ignore damaged local demo data. */ }
      } else if (supabase) {
        const [taskResult, attemptResult, profileResult, draftResult] = await Promise.all([
          supabase.from("study_tasks").select("*").order("due_date").order("sort_order"),
          supabase.from("exercise_attempts").select("id,lesson_slug,score,total,submitted_at").order("submitted_at", { ascending: false }).limit(100),
          supabase.from("profiles").select("daily_goal").single(),
          supabase.from("writing_drafts").select("body").eq("lesson_slug", "writing-technology").maybeSingle(),
        ]);
        const failure = taskResult.error || attemptResult.error || profileResult.error || draftResult.error;
        if (failure) setError(failure.message);
        else {
          setTasks((taskResult.data as TaskRow[]).map(toTask));
          setAttempts((attemptResult.data ?? []).map((row) => ({
            id: row.id, lesson: row.lesson_slug, score: row.score,
            total: row.total, date: row.submitted_at.slice(0, 10),
          })));
          setGoalValue(profileResult.data.daily_goal);
          setDraft(draftResult.data?.body ?? "");
        }
      }
      setReady(true);
    }
    void load();
  }, []);

  useEffect(() => {
    if (demoMode && ready) localStorage.setItem(KEY, JSON.stringify({ tasks, attempts, goal, draft }));
  }, [tasks, attempts, goal, draft, ready]);

  async function perform(operation: () => Promise<void>) {
    try { setError(""); await operation(); }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Could not save your changes"; setError(message); throw cause; }
  }
  const value = useMemo<StoreState>(() => ({
    tasks, attempts, goal, draft, ready, error, clearError: () => setError(""),
    addTask: async (task) => perform(async () => {
      const valid = taskSchema.parse(task);
      if (demoMode) { setTasks((current) => [...current, { ...valid, id: crypto.randomUUID() }]); return; }
      const { data, error } = await supabase!.from("study_tasks").insert(toRow(valid)).select("*").single();
      if (error) throw error;
      setTasks((current) => [...current, toTask(data as TaskRow)]);
    }),
    updateTask: async (id, patch) => perform(async () => {
      if (demoMode) { setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task)); return; }
      const { data, error } = await supabase!.from("study_tasks").update(toRow(patch)).eq("id", id).select("*").single();
      if (error) throw error;
      setTasks((current) => current.map((task) => task.id === id ? toTask(data as TaskRow) : task));
    }),
    deleteTask: async (id) => perform(async () => {
      if (demoMode) { setTasks((current) => current.filter((task) => task.id !== id)); return; }
      const { error } = await supabase!.from("study_tasks").delete().eq("id", id);
      if (error) throw error;
      setTasks((current) => current.filter((task) => task.id !== id));
    }),
    reorderTask: async (dragged, target) => perform(async () => {
      const items = [...tasks];
      const from = items.findIndex((task) => task.id === dragged);
      const to = items.findIndex((task) => task.id === target);
      if (from < 0 || to < 0) return;
      items.splice(to, 0, items.splice(from, 1)[0]);
      if (!demoMode) {
        const results = await Promise.all(items.map((task, index) =>
          supabase!.from("study_tasks").update({ sort_order: index }).eq("id", task.id),
        ));
        const failure = results.find((result) => result.error)?.error;
        if (failure) throw failure;
      }
      setTasks(items);
    }),
    submitExercise: async (lesson, answers, demoScore, total) => {
      let grade: Grade = { score: demoScore, total };
      await perform(async () => {
        if (!demoMode) {
          const result = await supabase!.rpc("submit_exercise", { p_lesson_slug: lesson, p_answers: exerciseAnswersSchema.parse(answers) });
          if (result.error) throw result.error;
          grade = result.data as Grade;
        }
        setAttempts((current) => [{ id: crypto.randomUUID(), lesson, score: grade.score, total: grade.total, date: todayISO() }, ...current]);
        setTasks((current) => current.map((task) => task.lesson === lesson ? { ...task, completed: true } : task));
      });
      return grade;
    },
    saveDraft: async (body) => perform(async () => {
      draftSchema.parse(body);
      if (!demoMode) {
        const { data: userData, error: userError } = await supabase!.auth.getUser();
        if (userError || !userData.user) throw userError ?? new Error("Sign in required");
        const { error } = await supabase!.from("writing_drafts").upsert({
          user_id: userData.user.id, lesson_slug: "writing-technology", body, updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      setDraft(body);
    }),
    setGoal: async (value) => perform(async () => {
      const dailyGoal = dailyGoalSchema.parse(Math.max(1, Math.min(20, value)));
      if (!demoMode) {
        const { data: userData, error: userError } = await supabase!.auth.getUser();
        if (userError || !userData.user) throw userError ?? new Error("Sign in required");
        const { error } = await supabase!.from("profiles").update({ daily_goal: dailyGoal }).eq("id", userData.user.id);
        if (error) throw error;
      }
      setGoalValue(dailyGoal);
    }),
  }), [tasks, attempts, goal, draft, ready, error]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useDemo() {
  const value = useContext(Store);
  if (!value) throw new Error("DemoProvider missing");
  return value;
}
