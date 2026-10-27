import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "../ielts-bank/schema";
import { generateTextPractice, type TextSkill } from "./text-generation";

/** One practice draft. Scheduled callers must check generation_enabled before invoking. */
export async function createTextPracticeJob(client: SupabaseClient, skill: TextSkill, topic: string, actorId: string | null = null) {
  if (!process.env.AI_FACTORY_GEMINI_API_KEY || process.env.AI_FACTORY_FREE_TIER_ONLY !== "true") throw new Error("Configure a separate, unbilled AI Factory free-tier key before generating drafts");
  const { data: settings, error: settingsError } = await client.from("ai_factory_settings").select("daily_job_limit").single();
  if (settingsError) throw new Error(settingsError.message);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await client.from("ai_factory_jobs").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString());
  if (countError) throw new Error(countError.message);
  if ((count || 0) >= settings.daily_job_limit) throw new Error("Daily Content Factory job limit reached");
  let createdId: string | null = null;
  try {
    const draft = await generateTextPractice(skill, topic);
    const payload = { topic, evidence: draft.evidence, usage: draft.usage, exam: draft.exam, ...(draft.audioPayload || {}) };
    const created = await client.from("ai_factory_jobs").insert({ kind: skill === "Listening" ? "listening_audio" : skill.toLowerCase(), status: draft.warnings.length ? "qa_failed" : "failed", provider: skill === "Listening" ? "kokoro" : "gemini-free", model_id: skill === "Listening" ? "hexgrad/Kokoro-82M" : "gemini-3.5-flash-lite", created_by: actorId, payload, error: draft.warnings.length ? draft.warnings.join(", ").slice(0, 1000) : "Draft transaction incomplete" }).select("id").single();
    if (created.error || !created.data) throw new Error(created.error?.message || "Could not record generation job");
    createdId = created.data.id;
    if (draft.warnings.length) return { job: created.data, warnings: draft.warnings, status: "qa_failed" as const };
    const exam = draft.exam;
    const meta = { skill: exam.skill, title: exam.title, format: exam.format, mode: exam.mode, topic: exam.topic, difficulty: exam.difficulty, duration_minutes: exam.durationMinutes,
      license: exam.license, license_url: exam.licenseUrl, source_url: exam.sourceUrl, attribution: exam.attribution, ai_generated: true };
    const imported = await client.rpc("ielts_upsert_import", { p_source: "ai-factory", p_external: exam.externalId, p_meta: meta, p_content: exam.content, p_hash: contentHash(exam.content), p_upstream: draft.model, p_warnings: draft.warnings });
    if (imported.error) throw new Error(imported.error.message);
    const { data: record, error: recordError } = await client.from("ielts_exams").select("id,current_version_id").eq("source_id", "ai-factory").eq("external_id", exam.externalId).single();
    if (recordError || !record) throw new Error(recordError?.message || "Generated draft missing");
    if (exam.skill !== "Listening") {
      const qa = await client.from("ai_factory_qa").insert({ job_id: createdId, technical: { skill: exam.skill, questionCount: exam.content.sections.flatMap((s) => s.questions).length, schemaPassed: true }, answer_alignment: { evidence: draft.evidence, warnings: [] }, passed: true });
      if (qa.error) throw new Error(qa.error.message);
    }
    const nextStatus = exam.skill === "Listening" ? "queued" : "awaiting_review";
    const { error: jobError } = await client.from("ai_factory_jobs").update({ exam_id: record.id, exam_version_id: record.current_version_id, status: nextStatus, payload, error: null, updated_at: new Date().toISOString() }).eq("id", createdId);
    if (jobError) throw new Error(jobError.message);
    return { job: created.data, examId: record.id, status: nextStatus, warnings: [] };
  } catch (error) {
    if (createdId) await client.from("ai_factory_jobs").update({ status: "failed", error: String(error).slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", createdId);
    throw error;
  }
}
