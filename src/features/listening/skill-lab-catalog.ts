"use client";
/*
 * One shared request for the Skill Lab catalog. The Dictation home, the path map, the stage pages and
 * Sổ câu sai all need the same list, so it is fetched once and kept for a few minutes: moving between
 * those pages then renders straight away instead of waiting on the network again.
 */
import type { CatalogEntry } from "@/lib/dictation-skill-lab/lessons";

const FRESH_MS = 5 * 60_000;
let cached: { at: number; request: Promise<CatalogEntry[]> } | null = null;

export function fetchSkillLabCatalog(): Promise<CatalogEntry[]> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.request;
  const request = fetch("/api/dictation/skill-lab").then(async (response) => {
    const data = await response.json().catch(() => ({})) as { lessons?: CatalogEntry[]; error?: string };
    if (!response.ok || !data.lessons) throw new Error(data.error ?? "Không tải được kho IELTS Skill Lab.");
    return data.lessons;
  });
  cached = { at: Date.now(), request };
  // A failed request is not kept, so the next page can try again.
  request.catch(() => { if (cached?.request === request) cached = null; });
  return request;
}
