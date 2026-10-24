"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { z } from "zod";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { notebookInputSchema, type NotebookInput } from "@/lib/validation/notebook";

const STORAGE_KEY = "english-skill-lab-notebook-v1";
const entrySchema = z.intersection(notebookInputSchema, z.object({
  id: z.string().uuid(), sourcePath: z.string(), createdAt: z.string(), updatedAt: z.string(),
}));
const visitSchema = z.object({ id: z.string().uuid(), path: z.string(), title: z.string(), visitedAt: z.string() });
export type NotebookEntry = z.infer<typeof entrySchema>;
export type StudyVisit = z.infer<typeof visitSchema>;

type NotebookStore = {
  entries: NotebookEntry[];
  visits: StudyVisit[];
  ready: boolean;
  error: string;
  clearError: () => void;
  addEntry: (input: NotebookInput) => Promise<void>;
  updateEntry: (id: string, input: NotebookInput) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
};
const Store = createContext<NotebookStore | null>(null);

function visitTitle(path: string) {
  if (path.startsWith("/app/news/learn/")) return `Learn with News: ${path.split("/").pop()?.replaceAll("-", " ")}`;
  if (path.startsWith("/app/news/")) return `Daily News: ${path.split("/").pop()?.replaceAll("-", " ")}`;
  if (path.startsWith("/app/lesson/")) return `Bài học: ${(path.split("/").pop() ?? "").replaceAll("-", " ")}`;
  if (path.startsWith("/app/learn/")) return `Lộ trình: ${path.split("/").pop()?.replaceAll("-", " ")}`;
  const titles: Record<string, string> = {
    "/app/learn": "Khám phá lộ trình", "/app/news": "Daily English News", "/app/vocabulary": "Luyện từ vựng",
    "/app/grammar": "Luyện ngữ pháp", "/app/reading": "Luyện Reading",
    "/app/listening": "Luyện Listening", "/app/writing": "Luyện Writing",
    "/app/speaking": "Luyện Speaking", "/app/content-lab": "Thử Content Lab",
  };
  return titles[path] ?? "";
}

type EntryRow = {
  id: string; kind: "note" | "word"; title: string; body: string;
  meaning_vi: string; example: string; source_path: string;
  created_at: string; updated_at: string;
};
type VisitRow = { id: string; path: string; title: string; visited_at: string };
const fromEntryRow = (row: EntryRow): NotebookEntry => ({
  id: row.id, kind: row.kind, title: row.title, body: row.body,
  meaningVi: row.meaning_vi, example: row.example, sourcePath: row.source_path,
  createdAt: row.created_at, updatedAt: row.updated_at,
} as NotebookEntry);
const fromVisitRow = (row: VisitRow): StudyVisit => ({
  id: row.id, path: row.path, title: row.title, visitedAt: row.visited_at,
});

export function NotebookProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = useMemo(() => demoMode ? null : createClient(), []);
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [visits, setVisits] = useState<StudyVisit[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const lastPath = useRef("");

  useEffect(() => {
    async function load() {
      if (demoMode) {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            const savedEntries = z.array(entrySchema).safeParse(parsed.entries);
            const savedVisits = z.array(visitSchema).safeParse(parsed.visits);
            if (savedEntries.success) setEntries(savedEntries.data);
            if (savedVisits.success) setVisits(savedVisits.data);
          }
        } catch { /* Damaged local demo data can be replaced with a fresh notebook. */ }
      } else {
        const [entryResult, visitResult] = await Promise.all([
          supabase!.from("notebook_entries").select("*").order("created_at", { ascending: false }).limit(500),
          supabase!.from("study_visits").select("*").order("visited_at", { ascending: false }).limit(200),
        ]);
        if (entryResult.error || visitResult.error) setError(entryResult.error?.message ?? visitResult.error!.message);
        else {
          setEntries((entryResult.data as EntryRow[]).map(fromEntryRow));
          setVisits((visitResult.data as VisitRow[]).map(fromVisitRow));
        }
      }
      setReady(true);
    }
    void load();
  }, [supabase]);

  useEffect(() => {
    if (demoMode && ready) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, visits })); }
      catch { void Promise.resolve().then(() => setError("Sổ tay trong trình duyệt đã đầy. Hãy xuất JSON và xóa bớt mục cũ.")); }
    }
  }, [entries, visits, ready]);

  useEffect(() => {
    if (!ready || lastPath.current === pathname) return;
    lastPath.current = pathname;
    const title = visitTitle(pathname);
    if (!title) return;
    async function record() {
      if (demoMode) {
        setVisits((current) => [{ id: crypto.randomUUID(), path: pathname, title, visitedAt: new Date().toISOString() }, ...current].slice(0, 200));
      } else {
        const result = await supabase!.from("study_visits").insert({ path: pathname, title }).select("*").single();
        if (result.error) setError(result.error.message);
        else setVisits((current) => [fromVisitRow(result.data as VisitRow), ...current].slice(0, 200));
      }
    }
    void record();
  }, [pathname, ready, supabase]);

  const value = useMemo<NotebookStore>(() => ({
    entries, visits, ready, error, clearError: () => setError(""),
    addEntry: async (input) => {
      const valid = notebookInputSchema.parse(input);
      const sourcePath = visitTitle(pathname) ? pathname : "";
      setError("");
      if (demoMode) {
        const now = new Date().toISOString();
        setEntries((current) => [{ ...valid, id: crypto.randomUUID(), sourcePath, createdAt: now, updatedAt: now }, ...current]);
      } else {
        const result = await supabase!.from("notebook_entries").insert({
          kind: valid.kind, title: valid.title, body: valid.body,
          meaning_vi: valid.meaningVi, example: valid.example, source_path: sourcePath,
        }).select("*").single();
        if (result.error) { setError(result.error.message); throw result.error; }
        setEntries((current) => [fromEntryRow(result.data as EntryRow), ...current]);
      }
    },
    updateEntry: async (id, input) => {
      const valid = notebookInputSchema.parse(input);
      const currentEntry = entries.find((entry) => entry.id === id);
      if (!currentEntry || currentEntry.kind !== valid.kind) throw new Error("Notebook entry unavailable");
      setError("");
      if (demoMode) {
        setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...valid, updatedAt: new Date().toISOString() } : entry));
      } else {
        const result = await supabase!.from("notebook_entries").update({
          title: valid.title, body: valid.body, meaning_vi: valid.meaningVi,
          example: valid.example, updated_at: new Date().toISOString(),
        }).eq("id", id).select("*").single();
        if (result.error) { setError(result.error.message); throw result.error; }
        setEntries((current) => current.map((entry) => entry.id === id ? fromEntryRow(result.data as EntryRow) : entry));
      }
    },
    removeEntry: async (id) => {
      setError("");
      if (!demoMode) {
        const result = await supabase!.from("notebook_entries").delete().eq("id", id);
        if (result.error) { setError(result.error.message); throw result.error; }
      }
      setEntries((current) => current.filter((entry) => entry.id !== id));
    },
  }), [entries, visits, ready, error, pathname, supabase]);

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useNotebook() {
  const value = useContext(Store);
  if (!value) throw new Error("NotebookProvider missing");
  return value;
}
