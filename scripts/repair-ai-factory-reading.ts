import { createClient } from "@supabase/supabase-js";
import { contentHash, type NormalizedExam } from "../src/lib/ielts-bank/schema";
import { normalizeEvidenceQuote, validateFactoryDraft } from "../src/lib/ai-factory/draft-validation";

async function main() {
  const jobId = process.argv[2];
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Provide a Reading job UUID");
  const url = process.env.AI_FACTORY_SUPABASE_URL;
  const key = process.env.AI_FACTORY_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("AI Factory database configuration is missing");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: job, error } = await client.from("ai_factory_jobs").select("*").eq("id", jobId).single();
  if (error || !job || job.kind !== "reading" || job.status !== "qa_failed" || job.exam_id) throw new Error("Only a non-imported Reading QA failure can be repaired");
  if (!String(job.error || "").split(", ").every((warning) => /^evidence_missing:q\d+$/.test(warning))) throw new Error("Job has QA failures beyond evidence formatting");
  const exam = job.payload?.exam as NormalizedExam | undefined;
  const rawEvidence = job.payload?.evidence as Record<string, string> | undefined;
  const passage = exam?.content?.sections?.[0]?.passage;
  if (!exam || exam.skill !== "Reading" || !passage || !rawEvidence) throw new Error("Reading draft payload is incomplete");
  const evidence = Object.fromEntries(Object.entries(rawEvidence).map(([id, quote]) => [id, normalizeEvidenceQuote(passage, quote)]));
  const missing = Object.entries(evidence).filter(([, quote]) => quote.trim().length < 15 || !passage.toLocaleLowerCase("en").includes(quote.trim().toLocaleLowerCase("en"))).map(([id]) => `evidence_missing:${id}`);
  const warnings = [...validateFactoryDraft(exam), ...missing];
  if (warnings.length) throw new Error(`Reading draft still fails QA: ${warnings.join(", ")}`);
  const meta = { skill: exam.skill, title: exam.title, format: exam.format, mode: exam.mode, topic: exam.topic, difficulty: exam.difficulty,
    duration_minutes: exam.durationMinutes, license: exam.license, license_url: exam.licenseUrl, source_url: exam.sourceUrl, attribution: exam.attribution, ai_generated: true };
  const imported = await client.rpc("ielts_upsert_import", { p_source: "ai-factory", p_external: exam.externalId, p_meta: meta, p_content: exam.content,
    p_hash: contentHash(exam.content), p_upstream: job.model_id, p_warnings: [] });
  if (imported.error) throw new Error(imported.error.message);
  const { data: record, error: recordError } = await client.from("ielts_exams").select("id,current_version_id").eq("source_id", "ai-factory").eq("external_id", exam.externalId).single();
  if (recordError || !record) throw new Error(recordError?.message || "Repaired exam was not imported");
  const repairedEvidenceIds = Object.keys(evidence).filter((id) => evidence[id] !== rawEvidence[id]);
  const qa = await client.from("ai_factory_qa").upsert({ job_id: jobId, technical: { skill: "Reading", schemaPassed: true, repairedEvidenceIds }, answer_alignment: { evidence, warnings: [] }, passed: true });
  if (qa.error) throw new Error(qa.error.message);
  const updated = await client.from("ai_factory_jobs").update({ exam_id: record.id, exam_version_id: record.current_version_id, status: "awaiting_review",
    payload: { ...job.payload, evidence }, error: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "qa_failed");
  if (updated.error) throw new Error(updated.error.message);
  console.log(`Reading job ${jobId} repaired for human review; exam ${record.id}, ${repairedEvidenceIds.length} evidence spans normalized.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Reading repair failed"); process.exitCode = 1; });
