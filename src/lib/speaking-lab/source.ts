import "server-only";
/*
 * Speaking Lab content. The public catalog is committed (titles and task shapes only). The private file
 * (questions, coaching, models) is never committed because the repository is public: local development reads
 * it from SPEAKING_LAB_DIR, production from the private Supabase Storage bucket (speaking-lab, or SPEAKING_LAB_BUCKET) with the
 * server's service role key. scripts/import-speaking-lab.py writes both.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import catalogFile from "../../../content/speaking-lab/catalog.json";
import { AUDIO_ID, type SpeakingCatalog, type SpeakingPrivateFile, type SpeakingPrivateUnit, type SpeakingUnit } from "./types";

export const PRIVATE_FILE = "speaking-lab-private.json";
export class SpeakingContentUnavailable extends Error {}

const catalog = catalogFile as unknown as SpeakingCatalog;
export const speakingCatalog = () => catalog;
export const speakingUnit = (id: string): SpeakingUnit | null => catalog.units.find((unit) => unit.id === id) ?? null;

/** The private bucket's name; `speaking-lab` unless a deployment overrides it. */
const bucketName = () => process.env.SPEAKING_LAB_BUCKET || "speaking-lab";

/** Which private source is configured, without saying where. */
export function speakingSource(): "dir" | "bucket" | null {
  if (process.env.SPEAKING_LAB_DIR) return "dir";
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "bucket";
  return null;
}

const TTL = process.env.NODE_ENV === "production" ? 10 * 60_000 : 30_000;
let cache: { at: number; value: Promise<SpeakingPrivateFile> } | null = null;

async function readPrivate(): Promise<SpeakingPrivateFile> {
  const source = speakingSource();
  let text: string;
  if (source === "dir") text = await readFile(join(process.env.SPEAKING_LAB_DIR!, PRIVATE_FILE), "utf8");
  else if (source === "bucket") {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.storage.from(bucketName()).download(PRIVATE_FILE);
    if (error || !data) throw new SpeakingContentUnavailable("Speaking Lab private file is missing from the bucket.");
    text = await data.text();
  } else throw new SpeakingContentUnavailable("Speaking Lab private content is not configured.");
  const parsed = JSON.parse(text) as SpeakingPrivateFile;
  if (parsed.version !== 1 || !parsed.units) throw new SpeakingContentUnavailable("Speaking Lab private file is malformed.");
  return parsed;
}

/** One listening-check clip (L39 synthetic previews), from the same private source as the lessons. */
export async function speakingAudio(itemId: string): Promise<Uint8Array | null> {
  if (!AUDIO_ID.test(itemId)) return null;
  const name = `audio/${itemId}.wav`;
  const source = speakingSource();
  try {
    if (source === "dir") return new Uint8Array(await readFile(join(process.env.SPEAKING_LAB_DIR!, name)));
    if (source === "bucket") {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = await admin.storage.from(bucketName()).download(name);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    }
  } catch { return null; }
  return null;
}

export async function speakingPrivateUnit(id: string): Promise<SpeakingPrivateUnit | null> {
  if (!cache || Date.now() - cache.at > TTL) {
    const value = readPrivate();
    cache = { at: Date.now(), value };
    value.catch(() => { cache = null; });
  }
  return (await cache.value).units[id] ?? null;
}
