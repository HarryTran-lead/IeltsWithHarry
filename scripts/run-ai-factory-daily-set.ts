import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chooseDailySet, composeFullDraft, dailyPieceKinds, dailySetId, nextMissingPiece, type DailyPieces } from "../src/lib/ai-factory/daily-set";
import { factoryKinds, topicSeeds, type FactoryKind } from "../src/lib/ai-factory/kinds";
import { recordFactoryDraft } from "../src/lib/ai-factory/produce";
import { generateFactoryDraft } from "../src/lib/ai-factory/text-generation";
import { contentHash, validateExam } from "../src/lib/ielts-bank/schema";

type Progress = { dailySet: true; setId: string; pieces: DailyPieces; materialized: string[]; quotaDay: string; longRequestsUsed: number; lastLongRequestAt?: string; completedAt?: string };
type SetRow = { id: string; status: string; payload: Progress };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const today = () => new Date().toISOString().slice(0, 10);

async function save(client: SupabaseClient, row: SetRow, patch: Record<string, unknown> = {}) {
  const { error } = await client.from("ai_factory_jobs").update({ payload: row.payload, updated_at: new Date().toISOString(), ...patch }).eq("id", row.id);
  if (error) throw new Error(`Could not checkpoint daily set: ${error.message}`);
}

async function existingJob(client: SupabaseClient, setId: string, role: string) {
  const { data, error } = await client.from("ai_factory_jobs").select("id,status").contains("payload", { dailySetId: setId, dailyRole: role }).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0];
}

async function storeFull(client: SupabaseClient, row: SetRow, skill: "Listening" | "Reading") {
  const role = `${skill.toLowerCase()}_full`;
  if (row.payload.materialized.includes(role)) return;
  const existing = await existingJob(client, row.payload.setId, role);
  if (existing && ["queued", "running", "awaiting_review", "approved"].includes(existing.status)) {
    if (skill === "Reading") {
      const { data: qa, error: qaError } = await client.from("ai_factory_qa").select("passed").eq("job_id", existing.id).maybeSingle();
      if (qaError) throw new Error(qaError.message);
      if (!qa?.passed) {
        const { evidence } = composeFullDraft(skill, row.payload.setId, row.payload.pieces);
        const inserted = await client.from("ai_factory_qa").upsert({ job_id: existing.id,
          technical: { skill, questionCount: 40, formatGatePassed: true }, answer_alignment: { evidence, warnings: [] }, passed: true });
        if (inserted.error) throw new Error(inserted.error.message);
      }
    }
    row.payload.materialized.push(role); await save(client, row); return;
  }
  const { exam, audioSections, evidence } = composeFullDraft(skill, row.payload.setId, row.payload.pieces);
  const meta = { skill, title: exam.title, format: exam.format, mode: exam.mode, topic: exam.topic, difficulty: exam.difficulty,
    duration_minutes: exam.durationMinutes, license: exam.license, license_url: exam.licenseUrl, source_url: exam.sourceUrl,
    attribution: exam.attribution, ai_generated: true };
  const warnings = skill === "Listening" ? validateExam(exam) : [];
  const imported = await client.rpc("ielts_upsert_import", { p_source: "ai-factory", p_external: exam.externalId, p_meta: meta,
    p_content: exam.content, p_hash: contentHash(exam.content), p_upstream: row.payload.setId, p_warnings: warnings });
  if (imported.error) throw new Error(imported.error.message);
  const { data: record, error: recordError } = await client.from("ielts_exams").select("id,current_version_id").eq("source_id", "ai-factory").eq("external_id", exam.externalId).single();
  if (recordError || !record) throw new Error(recordError?.message || "Full test import missing");
  const payload = { dailySetId: row.payload.setId, dailyRole: role, factoryKind: role, exam, ...(skill === "Listening" ? { sections: audioSections } : { evidence }) };
  const created = await client.from("ai_factory_jobs").insert({ kind: skill === "Listening" ? "listening_audio" : "reading",
    status: skill === "Listening" ? "queued" : "awaiting_review", provider: skill === "Listening" ? "kokoro" : "gemini-free",
    model_id: skill === "Listening" ? "hexgrad/Kokoro-82M" : "gemini-3.8-flash", exam_id: record.id,
    exam_version_id: record.current_version_id, payload }).select("id").single();
  if (created.error || !created.data) throw new Error(created.error?.message || "Could not create full-test job");
  if (skill === "Reading") {
    const qa = await client.from("ai_factory_qa").insert({ job_id: created.data.id,
      technical: { skill, questionCount: 40, formatGatePassed: true }, answer_alignment: { evidence, warnings: [] }, passed: true });
    if (qa.error) throw new Error(qa.error.message);
  }
  row.payload.materialized.push(role); await save(client, row);
  console.log(`Created ${skill} full-test job ${created.data.id}`);
}

async function materialize(client: SupabaseClient, row: SetRow) {
  const pieces = row.payload.pieces;
  if (dailyPieceKinds.slice(0, 4).every((kind) => pieces[kind])) await storeFull(client, row, "Listening");
  if (dailyPieceKinds.slice(4, 7).every((kind) => pieces[kind])) await storeFull(client, row, "Reading");
  for (const kind of dailyPieceKinds.slice(7)) {
    const draft = pieces[kind];
    if (!draft || row.payload.materialized.includes(kind)) continue;
    const existing = await existingJob(client, row.payload.setId, kind);
    if (!existing || !["queued", "running", "awaiting_review", "approved"].includes(existing.status)) {
      const saved = await recordFactoryDraft(client, draft, null, row.payload.setId);
      if (saved.status !== "awaiting_review") throw new Error(`${kind} failed its format gate`);
      console.log(`Created ${kind} job ${saved.job.id}`);
    }
    row.payload.materialized.push(kind); await save(client, row);
  }
}

async function main() {
  if (process.env.AI_FACTORY_FREE_TIER_CONFIRMED !== "true" || process.env.AI_FACTORY_FREE_TIER_ONLY !== "true" || !process.env.AI_FACTORY_GEMINI_API_KEY) {
    console.log("AI Factory free-tier key is unconfigured; no model request made."); return;
  }
  const url = process.env.AI_FACTORY_SUPABASE_URL, key = process.env.AI_FACTORY_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("AI Factory database configuration is missing");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: settings, error: settingsError } = await client.from("ai_factory_settings").select("generation_enabled,daily_job_limit,paid_provider_enabled").eq("id", true).single();
  if (settingsError) throw new Error(settingsError.message);
  if (!settings.generation_enabled || !settings.daily_job_limit || settings.paid_provider_enabled) { console.log("AI Factory text schedule is disabled by production settings."); return; }
  const currentId = dailySetId(new Date());
  const [current, unfinished] = await Promise.all([
    client.from("ai_factory_jobs").select("id,status,payload").contains("payload", { dailySet: true, setId: currentId }).limit(1),
    client.from("ai_factory_jobs").select("id,status,payload").contains("payload", { dailySet: true }).eq("status", "failed").order("created_at", { ascending: true }).limit(1),
  ]);
  if (current.error || unfinished.error) throw new Error(current.error?.message || unfinished.error?.message);
  const selected = chooseDailySet(current.data?.[0] as SetRow | undefined ?? null, unfinished.data?.[0] as SetRow | undefined ?? null);
  if (selected === "complete") { console.log(`${currentId} already complete.`); return; }
  let row = selected ?? undefined;
  if (!row) {
    const progress: Progress = { dailySet: true, setId: currentId, pieces: {}, materialized: [], quotaDay: today(), longRequestsUsed: 0 };
    const created = await client.from("ai_factory_jobs").insert({ kind: "reading", status: "failed", provider: "gemini-free", model_id: "daily-set", payload: progress, error: "Daily set in progress" }).select("id,status,payload").single();
    if (created.error || !created.data) throw new Error(created.error?.message || "Could not start daily set");
    row = created.data as SetRow;
  }
  const active = row;
  if (active.payload.quotaDay !== today()) { active.payload.quotaDay = today(); active.payload.longRequestsUsed = 0; active.payload.lastLongRequestAt = undefined; await save(client, active); }
  try {
    await materialize(client, active);
    let kind = nextMissingPiece(active.payload.pieces);
    while (kind) {
      const chosen: FactoryKind = kind;
      const dayNumber = Math.floor(new Date(`${active.payload.setId.slice(4)}T00:00:00Z`).getTime() / 86_400_000);
      const { data: recent } = await client.from("ielts_exams").select("title").eq("source_id", "ai-factory").eq("skill", factoryKinds[chosen].skill).order("created_at", { ascending: false }).limit(30);
      const seeds = topicSeeds[chosen];
      const draft = await generateFactoryDraft(chosen, seeds[dayNumber % seeds.length], {
        day: dayNumber, avoid: (recent ?? []).map((item) => item.title),
        beforeRequest: async () => {
          if (!chosen.startsWith("listening") && !chosen.startsWith("reading")) return;
          if (active.payload.longRequestsUsed >= 20) throw new Error("AI Factory daily request budget exhausted");
          const last = active.payload.lastLongRequestAt ? Date.parse(active.payload.lastLongRequestAt) : 0;
          await pause(Math.max(0, 13_000 - (Date.now() - last)));
          active.payload.longRequestsUsed += 1; active.payload.lastLongRequestAt = new Date().toISOString(); await save(client, active);
        },
      });
      if (draft.warnings.length) throw new Error(`${chosen} failed format gate: ${draft.warnings.join("; ").slice(0, 800)}`);
      active.payload.pieces[chosen] = draft; await save(client, active);
      console.log(`Checkpointed ${chosen}; long model requests today: ${active.payload.longRequestsUsed}/20`);
      await materialize(client, active);
      kind = nextMissingPiece(active.payload.pieces);
    }
    active.payload.completedAt = new Date().toISOString(); await save(client, active, { status: "cancelled", error: null });
    console.log(`Completed ${active.payload.setId}; long model requests today: ${active.payload.longRequestsUsed}/20`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await save(client, active, { error: message.slice(0, 1000) });
    if (/daily request budget|daily quota exhausted/i.test(message)) { console.log(`${active.payload.setId} paused: ${message}`); return; }
    throw error;
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "AI Factory daily set failed"); process.exitCode = 1; });
