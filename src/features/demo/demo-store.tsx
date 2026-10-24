"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  type Attempt,
  type StudyTask,
  seedTasks,
  todayISO,
} from "@/lib/demo-data";

type DemoState = {
  tasks: StudyTask[];
  attempts: Attempt[];
  goal: number;
  draft: string;
  ready: boolean;
  addTask: (task: Omit<StudyTask, "id">) => void;
  updateTask: (id: string, patch: Partial<StudyTask>) => void;
  deleteTask: (id: string) => void;
  reorderTask: (dragged: string, target: string) => void;
  saveAttempt: (lesson: string, score: number, total: number) => void;
  saveDraft: (draft: string) => void;
  setGoal: (goal: number) => void;
};

const Store = createContext<DemoState | null>(null);
const KEY = "english-skill-lab-demo-v1";

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<StudyTask[]>(seedTasks);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [goal, setGoalValue] = useState(5);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            tasks?: StudyTask[];
            attempts?: Attempt[];
            goal?: number;
            draft?: string;
          };
          if (Array.isArray(parsed.tasks)) setTasks(parsed.tasks);
          if (Array.isArray(parsed.attempts)) setAttempts(parsed.attempts);
          if (typeof parsed.goal === "number") setGoalValue(parsed.goal);
          if (typeof parsed.draft === "string") setDraft(parsed.draft);
        }
      } catch {
        /* A damaged local demo save starts fresh. */
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready)
      localStorage.setItem(
        KEY,
        JSON.stringify({ tasks, attempts, goal, draft }),
      );
  }, [tasks, attempts, goal, draft, ready]);

  const value = useMemo<DemoState>(
    () => ({
      tasks,
      attempts,
      goal,
      draft,
      ready,
      addTask: (task) =>
        setTasks((current) => [
          ...current,
          { ...task, id: crypto.randomUUID() },
        ]),
      updateTask: (id, patch) =>
        setTasks((current) =>
          current.map((task) =>
            task.id === id ? { ...task, ...patch } : task,
          ),
        ),
      deleteTask: (id) =>
        setTasks((current) => current.filter((task) => task.id !== id)),
      reorderTask: (dragged, target) =>
        setTasks((current) => {
          const items = [...current];
          const from = items.findIndex((t) => t.id === dragged);
          const to = items.findIndex((t) => t.id === target);
          if (from < 0 || to < 0) return current;
          items.splice(to, 0, items.splice(from, 1)[0]);
          return items;
        }),
      saveAttempt: (lesson, score, total) => {
        setAttempts((current) => [
          ...current,
          { id: crypto.randomUUID(), lesson, score, total, date: todayISO() },
        ]);
        setTasks((current) =>
          current.map((task) =>
            task.lesson === lesson && !task.completed
              ? { ...task, completed: true }
              : task,
          ),
        );
      },
      saveDraft: setDraft,
      setGoal: (value) => setGoalValue(Math.max(1, Math.min(20, value))),
    }),
    [tasks, attempts, goal, draft, ready],
  );

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useDemo() {
  const value = useContext(Store);
  if (!value) throw new Error("DemoProvider missing");
  return value;
}
