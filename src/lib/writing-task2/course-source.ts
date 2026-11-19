import "server-only";
/*
 * Where the R01–R16 course files live. They are private (answers, locked final prompts) and the repository is
 * public, so they are never committed: production reads them from a private Supabase Storage bucket with the
 * server's service role key, and local development reads the same layout from a folder outside the checkout.
 *
 * Layout (identical in both): DATASET_INDEX.json at the root, then R01/learner_guided/*.json, R01/server_only/*.json…
 * Each milestone is read only when a learner opens it, and kept in memory for a while.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildCourseModule, type CourseSourceFile } from "./course-normalize";
import { courseLayers, isCourseModule, type CourseAnswer, type CourseModule, type CourseModuleSummary } from "./course-types";

type IndexEntry = { source_path: string; milestone: string; visibility: string };
export class CourseUnavailable extends Error {}

const TTL = process.env.NODE_ENV === "production" ? 10 * 60_000 : 30_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

/** Which source is configured, without saying where. */
export function courseSource(): "dir" | "bucket" | null {
  if (process.env.TASK2_COURSE_DIR) return "dir";
  if (process.env.TASK2_COURSE_BUCKET && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "bucket";
  return null;
}

async function readText(path: string): Promise<string> {
  if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.includes("..")) throw new CourseUnavailable("Bad course path.");
  const dir = process.env.TASK2_COURSE_DIR;
  if (dir) return readFile(join(dir, path), "utf8");
  if (courseSource() !== "bucket") throw new CourseUnavailable("Writing Task 2 course data is not configured.");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.storage.from(process.env.TASK2_COURSE_BUCKET!).download(path);
  if (error || !data) throw new CourseUnavailable(`Course file missing: ${path}`);
  return data.text();
}

const readJson = (path: string) => cached(`file:${path}`, async () => JSON.parse(await readText(path)) as unknown);

async function index(): Promise<IndexEntry[]> {
  const data = await readJson("DATASET_INDEX.json");
  if (!Array.isArray(data)) throw new CourseUnavailable("Course index is malformed.");
  return data.filter((entry): entry is IndexEntry => Boolean(entry) && typeof entry.source_path === "string" && typeof entry.milestone === "string");
}

/** One milestone, normalised: the module for learners and its answers for the reveal route. */
export function loadCourseModule(id: string): Promise<{ module: CourseModule; answers: Record<string, CourseAnswer> }> {
  if (!isCourseModule(id)) return Promise.reject(new CourseUnavailable(`Unknown milestone ${id}`));
  return cached(`module:${id}`, async () => {
    const entries = (await index()).filter((entry) => entry.milestone === id && (entry.visibility === "learner_guided" || entry.visibility === "server_only"));
    const files: CourseSourceFile[] = await Promise.all(entries.map(async (entry) => ({ path: entry.source_path, visibility: entry.visibility, data: await readJson(entry.source_path) })));
    return buildCourseModule(id, files);
  });
}

export async function loadCourseSummaries(): Promise<CourseModuleSummary[]> {
  const ids = courseLayers.flatMap((layer) => layer.modules);
  const modules = await Promise.all(ids.map((id) => loadCourseModule(id)));
  return modules.map(({ module }) => ({ id: module.id, layer: module.layer, title: module.title, overview: module.overview, counts: module.counts }));
}
