"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { type Attempt, type StudyTask, seedTasks, todayISO } from "@/lib/demo-data";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { dailyGoalSchema, draftSchema, exerciseAnswersSchema, taskSchema } from "@/lib/validation/study";
import { completeNextLinkedTask } from "@/lib/learning-progress";
import { findPlanned } from "@/lib/planner/core";

type Grade = { score: number; total: number; review?: { slug: string; correctIndex: number; explanation: string }[] };
type StoreState = {
  tasks: StudyTask[]; attempts: Attempt[]; goal: number; draft: string; ready: boolean; error: string;
  clearError: () => void;
  /** Adds a task; a linked task already open on the same day is returned instead of a duplicate. */
  addTask: (task: NewTask) => Promise<StudyTask>;
  /** Adds several tasks in one request (a repeating series or a generated week). */
  addTasks: (tasks: NewTask[]) => Promise<StudyTask[]>;
  updateTask: (id: string, patch: Partial<StudyTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  /** Saves the order of one day's tasks: `ids` top to bottom. */
  reorderDay: (ids: string[]) => Promise<void>;
  /** Re-reads tasks the server may have changed (a test submitted elsewhere, a teacher's task). */
  refreshTasks: () => Promise<void>;
  submitExercise: (lesson: string, answers: Record<string, number>, demoScore: number, total: number) => Promise<Grade>;
  saveDraft: (draft: string) => Promise<void>;
  setGoal: (goal: number) => Promise<void>;
};
const Store = createContext<StoreState | null>(null);
const KEY = "english-skill-lab-demo-v1";
const supabase = !demoMode && process.env.NEXT_PUBLIC_SUPABASE_URL ? createClient() : null;

type NewTask = Omit<StudyTask, "id">;
type TaskRow = {
  id: string; title: string; skill: StudyTask["skill"]; due_date: string;
  due_time: string | null; completed: boolean; priority: StudyTask["priority"];
  lesson_slug: string | null; sort_order: number;
  duration_minutes?: number | null; source?: StudyTask["source"] | null; series_id?: string | null;
  completed_at?: string | null; assigned_by?: string | null;
};
const toTask = (row: TaskRow): StudyTask => ({
  id: row.id, title: row.title, skill: row.skill, date: row.due_date,
  time: row.due_time?.slice(0, 5) ?? "", completed: row.completed,
  priority: row.priority, lesson: row.lesson_slug ?? undefined,
  duration: row.duration_minutes ?? undefined, source: row.assigned_by ? "teacher" : row.source ?? undefined,
  seriesId: row.series_id ?? undefined, completedAt: row.completed_at ?? undefined,
  sortOrder: row.sort_order, assigned: Boolean(row.assigned_by),
});
/** Columns Planner 2.0 added; dropped and retried when the database has not been migrated yet. */
const plannerColumns = ["duration_minutes", "source", "series_id"] as const;
const toRow = (task: Partial<StudyTask>, insert = false) => ({
  ...(task.title !== undefined && { title: task.title }),
  ...(task.skill !== undefined && { skill: task.skill }),
  ...(task.date !== undefined && { due_date: task.date }),
  ...(task.time !== undefined && { due_time: task.time || null }),
  ...(task.completed !== undefined && { completed: task.completed }),
  ...(task.priority !== undefined && { priority: task.priority }),
  ...(task.lesson !== undefined && { lesson_slug: task.lesson ?? null }),
  ...("duration" in task && { duration_minutes: task.duration ?? null }),
  ...(insert && task.source !== undefined && { source: task.source }),
  ...("seriesId" in task && { series_id: task.seriesId ?? null }),
});
const withoutPlannerColumns = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([key]) => !(plannerColumns as readonly string[]).includes(key)));
/** PostgREST reports a column the schema does not have yet as PGRST204, Postgres as 42703. */
const missingColumn = (error: { code?: string } | null) => error?.code === "PGRST204" || error?.code === "42703";
const sortTasks = (list: StudyTask[]) => [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

/** Supabase errors are plain objects, not Error instances; give the learner one readable sentence. */
function friendlyError(cause: unknown) {
  const message = cause && typeof cause === "object" && "message" in cause ? String((cause as { message: unknown }).message) : "";
  if (/network|fetch/i.test(message)) return "Mất kết nối, chưa lưu được. Kiểm tra mạng rồi thử lại.";
  if (cause && typeof cause === "object" && "issues" in cause) return "Thông tin nhiệm vụ chưa hợp lệ. Kiểm tra tên, ngày và thời lượng.";
  return message && !/^[\[{]/.test(message) ? `Chưa lưu được: ${message}` : "Chưa lưu được thay đổi. Thử lại sau ít phút.";
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<StudyTask[]>(demoMode ? seedTasks() : []);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [goal, setGoalValue] = useState(5);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const refreshTasks = useCallback(async () => {
    if (demoMode || !supabase) return;
    const { data, error: loadError } = await supabase.from("study_tasks").select("*").order("due_date").order("sort_order");
    if (!loadError && data) setTasks(sortTasks((data as TaskRow[]).map(toTask)));
  }, []);

  // Tasks change outside this page too: a test submitted, a lesson finished (the database ticks the
  // linked task), a teacher's assignment. Re-read when the learner comes back to the tab or when a
  // feature says it changed the planner.
  useEffect(() => {
    if (demoMode) return;
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 4000) return;
      last = Date.now();
      void refreshTasks();
    };
    const changed = () => { last = Date.now(); void refreshTasks(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("planner-tasks-changed", changed);
    window.addEventListener("learner-activity", changed);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("planner-tasks-changed", changed);
      window.removeEventListener("learner-activity", changed);
    };
  }, [refreshTasks]);

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
        // The local session (no network) names the learner; RLS on every table still verifies it server-side.
        const { data: sessionData, error: authError } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;
        if (authError || !userId) {
          setError(authError?.message ?? "Vui lòng đăng nhập để tải dữ liệu học.");
          setReady(true);
          return;
        }
        const [taskResult, attemptResult, draftResult, profileResult] = await Promise.all([
          supabase.from("study_tasks").select("*").order("due_date").order("sort_order"),
          supabase.from("exercise_attempts").select("id,lesson_slug,score,total,submitted_at").order("submitted_at", { ascending: false }).limit(100),
          supabase.from("writing_drafts").select("body").eq("lesson_slug", "writing-technology").maybeSingle(),
          supabase.from("profiles").select("daily_goal").eq("id", userId).maybeSingle(),
        ]);
        const failure = taskResult.error || attemptResult.error || profileResult.error || draftResult.error;
        if (failure) setError(failure.message);
        else {
          setTasks(sortTasks((taskResult.data as TaskRow[]).map(toTask)));
          setAttempts((attemptResult.data ?? []).map((row) => ({
            id: row.id, lesson: row.lesson_slug, score: row.score,
            total: row.total, date: row.submitted_at.slice(0, 10), submittedAt: row.submitted_at,
          })));
          setGoalValue(profileResult.data?.daily_goal ?? 5);
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
    catch (cause) { setError(friendlyError(cause)); throw cause; }
  }
  async function insertRows(rows: Record<string, unknown>[]) {
    const first = await supabase!.from("study_tasks").insert(rows).select("*");
    if (!missingColumn(first.error)) return first;
    return supabase!.from("study_tasks").insert(rows.map(withoutPlannerColumns)).select("*");
  }
  const value = useMemo<StoreState>(() => ({
    tasks, attempts, goal, draft, ready, error, clearError: () => setError(""),
    addTask: async (task) => {
      const existing = findPlanned(tasksRef.current, task.lesson, task.date);
      if (existing) return existing;
      let created: StudyTask | null = null;
      await perform(async () => {
        const valid = taskSchema.parse(task) as NewTask;
        const sortOrder = tasksRef.current.filter((item) => item.date === valid.date).length;
        if (demoMode) { created = { ...task, ...valid, id: crypto.randomUUID(), sortOrder }; }
        else {
          const { data, error } = await insertRows([{ ...toRow(valid, true), sort_order: sortOrder }]);
          if (error || !data?.[0]) throw error ?? new Error("Không tạo được nhiệm vụ.");
          created = toTask(data[0] as TaskRow);
        }
        const made = created!;
        setTasks((current) => sortTasks([...current, made]));
      });
      return created!;
    },
    addTasks: async (list) => {
      const fresh = list.filter((task) => !findPlanned(tasksRef.current, task.lesson, task.date));
      if (!fresh.length) return [];
      let created: StudyTask[] = [];
      await perform(async () => {
        const counts = new Map<string, number>();
        const rows = fresh.map((task) => {
          const valid = taskSchema.parse(task) as NewTask;
          const order = counts.get(valid.date) ?? tasksRef.current.filter((item) => item.date === valid.date).length;
          counts.set(valid.date, order + 1);
          return { valid, order };
        });
        if (demoMode) created = rows.map(({ valid, order }) => ({ ...valid, id: crypto.randomUUID(), sortOrder: order }));
        else {
          const { data, error } = await insertRows(rows.map(({ valid, order }) => ({ ...toRow(valid, true), sort_order: order })));
          if (error || !data) throw error ?? new Error("Không tạo được nhiệm vụ.");
          created = (data as TaskRow[]).map(toTask);
        }
        setTasks((current) => sortTasks([...current, ...created]));
      });
      return created;
    },
    updateTask: async (id, patch) => {
      const before = tasksRef.current.find((task) => task.id === id);
      if (!before) return;
      // Show the change at once; put it back if the server refuses it.
      setTasks((current) => sortTasks(current.map((task) => task.id === id ? { ...task, ...patch, completedAt: patch.completed ? new Date().toISOString() : patch.completed === false ? undefined : task.completedAt } : task)));
      try {
        await perform(async () => {
          if (demoMode) return;
          const row = toRow(patch);
          let result = await supabase!.from("study_tasks").update(row).eq("id", id).select("*").single();
          if (missingColumn(result.error)) result = await supabase!.from("study_tasks").update(withoutPlannerColumns(row)).eq("id", id).select("*").single();
          if (result.error) throw result.error;
          const saved = toTask(result.data as TaskRow);
          setTasks((current) => sortTasks(current.map((task) => task.id === id ? saved : task)));
        });
      } catch (cause) {
        setTasks((current) => sortTasks(current.map((task) => task.id === id ? before : task)));
        throw cause;
      }
    },
    deleteTask: async (id) => {
      const before = tasksRef.current.find((task) => task.id === id);
      setTasks((current) => current.filter((task) => task.id !== id));
      try {
        await perform(async () => {
          if (demoMode) return;
          const { error } = await supabase!.from("study_tasks").delete().eq("id", id);
          if (error) throw error;
        });
      } catch (cause) {
        if (before) setTasks((current) => sortTasks([...current, before]));
        throw cause;
      }
    },
    reorderDay: async (ids) => {
      const order = new Map(ids.map((id, index) => [id, index]));
      const before = tasksRef.current;
      setTasks((current) => sortTasks(current.map((task) => order.has(task.id) ? { ...task, sortOrder: order.get(task.id)! } : task)));
      try {
        await perform(async () => {
          if (demoMode) return;
          const rpc = await supabase!.rpc("reorder_study_tasks", { p_ids: ids });
          if (!rpc.error) return;
          // Before the migration the function does not exist: fall back to one update per task.
          const results = await Promise.all(ids.map((id, index) => supabase!.from("study_tasks").update({ sort_order: index }).eq("id", id)));
          const failure = results.find((result) => result.error)?.error;
          if (failure) throw failure;
        });
      } catch (cause) {
        setTasks(before);
        throw cause;
      }
    },
    refreshTasks,
    submitExercise: async (lesson, answers, demoScore, total) => {
      let grade: Grade = { score: demoScore, total };
      await perform(async () => {
        if (!demoMode) {
          const result = await supabase!.rpc("submit_exercise", { p_lesson_slug: lesson, p_answers: exerciseAnswersSchema.parse(answers) });
          if (result.error) throw result.error;
          grade = result.data as Grade;
          window.dispatchEvent(new Event("learner-activity"));
        }
        setAttempts((current) => [{ id: crypto.randomUUID(), lesson, score: grade.score, total: grade.total, date: todayISO(), submittedAt: new Date().toISOString() }, ...current]);
        setTasks((current) => completeNextLinkedTask(current, lesson));
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
  }), [tasks, attempts, goal, draft, ready, error, refreshTasks]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useDemo() {
  const value = useContext(Store);
  if (!value) throw new Error("DemoProvider missing");
  return value;
}

/** The store when it is mounted, else null: for shared UI (dialogs, badges) that can render outside the portal. */
export function useOptionalDemo() {
  return useContext(Store);
}
