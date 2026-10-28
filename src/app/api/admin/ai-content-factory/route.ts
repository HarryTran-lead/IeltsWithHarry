import { z } from "zod";
import { bankClient, requestError, saveRevision, viewer } from "@/lib/ielts-bank/server";
import { contentHash, contentSchema, validateExam } from "@/lib/ielts-bank/schema";
import { pilotContent, pilotPayload } from "@/lib/ai-factory/pilot";
import { createTextPracticeJob } from "@/lib/ai-factory/produce";
import { defaultKind, factoryKinds, type FactoryKind } from "@/lib/ai-factory/kinds";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    await viewer(true);
    const client = bankClient();
    const [settings, voices, jobs, usage, dailySet] = await Promise.all([
      client.from("ai_factory_settings").select("*").single(),
      client.from("ai_factory_voices").select("*").order("id"),
      client.from("ai_factory_jobs").select("*,ai_factory_qa(*),ai_factory_segments(ordinal,speaker_id,voice_id,pace,canonical_text,start_ms,end_ms)").order("created_at", { ascending: false }).limit(50),
      client.from("ai_factory_usage").select("provider,characters,audio_seconds,processing_seconds,storage_bytes,estimated_usd,actual_usd,created_at").gte("created_at", new Date(Date.now()-31*86400000).toISOString()).limit(1000),
      client.from("ai_factory_jobs").select("status,error,payload").contains("payload", { dailySet: true }).order("created_at", { ascending: false }).limit(1),
    ]);
    for (const result of [settings, voices, jobs, usage, dailySet]) if (result.error) throw new Error(result.error.message);
    const rows = await Promise.all((jobs.data || []).filter((job) => !job.payload?.dailySet).map(async (job) => {
      let previewUrl: string | null = null;
      const previewUrls: { sectionId: string; url: string }[] = [];
      if (job.artifact_path && ["awaiting_review", "qa_failed"].includes(job.status)) {
        const sections = Array.isArray(job.payload?.sections) ? job.payload.sections as { sectionId: string }[] : [];
        const paths = sections.length ? JSON.parse(job.artifact_path) as Record<string, string> : { [job.payload?.sectionId ?? "audio"]: job.artifact_path };
        for (const [sectionId, path] of Object.entries(paths)) {
          const signed = await client.storage.from("ai-factory-drafts").createSignedUrl(path, 600);
          if (signed.data?.signedUrl) previewUrls.push({ sectionId, url: signed.data.signedUrl });
        }
        previewUrl = previewUrls[0]?.url ?? null;
      }
      return { ...job, previewUrl, previewUrls };
    }));
    const set = dailySet.data?.[0];
    return Response.json({ settings: settings.data, voices: voices.data, jobs: rows, usage: usage.data,
      dailySet: set ? { setId: set.payload?.setId, completedPieces: Object.keys(set.payload?.pieces ?? {}).length,
        totalPieces: 11, longRequestsUsed: set.payload?.longRequestsUsed ?? 0, completedAt: set.payload?.completedAt ?? null, error: set.error } : null,
      textProviderReady: Boolean(process.env.AI_FACTORY_GEMINI_API_KEY && process.env.AI_FACTORY_FREE_TIER_ONLY === "true" && process.env.AI_FACTORY_FREE_TIER_CONFIRMED === "true") });
  } catch (error) { return requestError(error); }
}

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pilot") }),
  z.object({ action: z.literal("generate"), skill: z.enum(["Listening", "Reading", "Writing", "Speaking"]), kind: z.enum(Object.keys(factoryKinds) as [FactoryKind, ...FactoryKind[]]).optional(), topic: z.string().trim().min(4).max(100) }),
  z.object({ action: z.literal("settings"), generationEnabled: z.boolean().optional(), dailyJobLimit: z.number().int().min(0).max(100).optional(), maxConcurrency: z.number().int().min(1).max(8).optional() }),
  z.object({ action: z.literal("voice"), voiceId: z.string().min(1), enabled: z.boolean(), pace: z.number().min(0.75).max(1.25).optional() }),
  z.object({ action: z.literal("cancel"), jobId: z.uuid() }),
  z.object({ action: z.literal("regenerate_audio"), jobId: z.uuid() }),
  z.object({ action: z.literal("review_text"), jobId: z.uuid(), decision: z.enum(["approve", "reject"]), note: z.string().min(3).max(2000), answersChecked: z.boolean() }),
  z.object({ action: z.literal("review"), jobId: z.uuid(), decision: z.enum(["approve","reject"]), note: z.string().min(3).max(2000), listened: z.boolean(), answersChecked: z.boolean() }),
]);

export async function POST(request: Request) {
  try {
    const actor = await viewer(true);
    if (Number(request.headers.get("content-length") || 0) > 32_000) throw new Error("Request too large");
    const body = command.parse(await request.json());
    const client = bankClient();
    if (body.action === "settings") {
      const patch = { ...(body.generationEnabled === undefined ? {} : { generation_enabled: body.generationEnabled }), ...(body.dailyJobLimit === undefined ? {} : { daily_job_limit: body.dailyJobLimit }), ...(body.maxConcurrency === undefined ? {} : { max_concurrency: body.maxConcurrency }), updated_at: new Date().toISOString() };
      const { error } = await client.from("ai_factory_settings").update(patch).eq("id", true);
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    if (body.action === "voice") {
      const { error } = await client.from("ai_factory_voices").update({ enabled: body.enabled, ...(body.pace === undefined ? {} : { pace: body.pace }) }).eq("id", body.voiceId);
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    if (body.action === "cancel") {
      const { error } = await client.from("ai_factory_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", body.jobId).eq("status", "queued");
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    if (body.action === "generate") {
      // A kind must belong to the chosen skill; without one, the skill's default kind is written.
      const kind = body.kind && factoryKinds[body.kind].skill === body.skill ? body.kind : defaultKind[body.skill];
      return Response.json(await createTextPracticeJob(client, kind, body.topic, actor.id, { day: Math.floor(Date.now() / 86_400_000) }));
    }
    if (body.action === "pilot") {
      const { data: settings, error: settingsError } = await client.from("ai_factory_settings").select("daily_job_limit").single();
      if (settingsError) throw new Error(settingsError.message);
      const today = new Date(); today.setUTCHours(0,0,0,0);
      const { count, error: countError } = await client.from("ai_factory_jobs").select("id", { count: "exact", head: true }).not("created_by", "is", null).gte("created_at", today.toISOString());
      if (countError) throw new Error(countError.message);
      if ((count || 0) >= settings.daily_job_limit) throw new Error("Daily Content Factory job limit reached");
      const { data: active, error: activeError } = await client.from("ai_factory_jobs").select("id,status").eq("kind", "listening_audio").in("status", ["queued","running","awaiting_review","approved"]).contains("payload", { pilot: true }).limit(1);
      if (activeError) throw new Error(activeError.message);
      if (active?.length) throw new Error("Pilot already queued or awaiting review");
      const sourceUrl = "https://ieltswithharry.vercel.app/app/question-bank";
      const meta = { skill: "Listening", title: "Urban ecology project discussion — Part 3", format: "Academic", mode: "practice", topic: "Urban ecology", difficulty: "B2-C1", duration_minutes: 12, license: "Original AI-assisted practice", license_url: sourceUrl, source_url: sourceUrl, attribution: "IeltsWithHarry Content Factory (AI-assisted)", ai_generated: true };
      const warnings = validateExam({ externalId: "pilot-listening-part-3-v1", skill: "Listening", format: "Academic", mode: "practice", title: meta.title, topic: meta.topic, difficulty: meta.difficulty, durationMinutes: 12, sourceUrl, attribution: meta.attribution, license: meta.license, licenseUrl: sourceUrl, aiGenerated: true, upstreamVersion: "pilot-v1", content: pilotContent });
      const imported = await client.rpc("ielts_upsert_import", { p_source: "ai-factory", p_external: "pilot-listening-part-3-v1", p_meta: meta, p_content: pilotContent, p_hash: contentHash(pilotContent), p_upstream: "pilot-v1", p_warnings: warnings });
      if (imported.error) throw new Error(imported.error.message);
      const { data: exam, error: examError } = await client.from("ielts_exams").select("id,current_version_id").eq("source_id", "ai-factory").eq("external_id", "pilot-listening-part-3-v1").single();
      if (examError || !exam) throw new Error(examError?.message || "Pilot exam missing");
      const created = await client.from("ai_factory_jobs").insert({ kind: "listening_audio", exam_id: exam.id, exam_version_id: exam.current_version_id, created_by: actor.id, payload: { ...pilotPayload, pilot: true } }).select("id,status").single();
      if (created.error) throw new Error(created.error.message);
      return Response.json({ job: created.data, examId: exam.id, warnings });
    }
    const { data: job, error: jobError } = await client.from("ai_factory_jobs").select("*").eq("id", body.jobId).single();
    if (jobError || !job) throw new Error(jobError?.message || "Job missing");
    if (body.action === "regenerate_audio") {
      if (job.kind !== "listening_audio" || !["awaiting_review", "approved"].includes(job.status)) throw new Error("Only a reviewed or reviewable Listening draft can be regenerated");
      const { data: qa, error: qaError } = await client.from("ai_factory_qa").select("technical").eq("job_id", job.id).single();
      if (qaError || !qa || !(qa.technical?.generation?.needs_regeneration ?? job.provider === "kokoro")) throw new Error("This audio is not marked for Gemini regeneration");
      const { data: exam, error: examError } = await client.from("ielts_exams").select("current_version_id,status").eq("id", job.exam_id).single();
      if (examError || !exam || exam.current_version_id !== job.exam_version_id || exam.status === "published") throw new Error("Exam version changed or is already published; review the current exam first");
      const { data: active, error: activeError } = await client.from("ai_factory_jobs").select("id,status").eq("kind", "listening_audio").in("status", ["queued", "running", "awaiting_review"]).contains("payload", { regenerationOf: job.id }).limit(1);
      if (activeError) throw new Error(activeError.message);
      if (active?.length) return Response.json({ ok: true, job: active[0], alreadyQueued: true });
      const { data: queued, error: queueError } = await client.from("ai_factory_jobs").insert({
        kind: "listening_audio", exam_id: job.exam_id, exam_version_id: job.exam_version_id,
        created_by: actor.id, provider: "gemini", model_id: "gemini-3.8-flash-tts",
        payload: { ...job.payload, pilot: false, regenerationOf: job.id },
      }).select("id,status").single();
      if (queueError || !queued) throw new Error(queueError?.message || "Could not queue audio regeneration");
      return Response.json({ ok: true, job: queued });
    }
    if (body.action === "review_text") {
      if (job.kind === "listening_audio" || !["awaiting_review", "qa_failed"].includes(job.status)) throw new Error("Text draft cannot be reviewed in this state");
      if (body.decision === "approve") {
        if (job.status !== "awaiting_review" || !body.answersChecked) throw new Error("Inspect the full draft and every answer before approval");
        const { data: qa, error: qaError } = await client.from("ai_factory_qa").select("passed").eq("job_id", job.id).single();
        if (qaError || !qa?.passed) throw new Error("Content QA has not passed");
        const { data: exam, error: examError } = await client.from("ielts_exams").select("current_version_id,status").eq("id", job.exam_id).single();
        if (examError || !exam || exam.current_version_id !== job.exam_version_id || exam.status === "published") throw new Error("Draft changed after generation; review the current version");
      }
      const { error } = await client.from("ai_factory_jobs").update({ status: body.decision === "approve" ? "approved" : "rejected", reviewed_by: actor.id, review_note: body.note, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", job.status);
      if (error) throw new Error(error.message);
      if (body.decision === "approve") await client.from("ielts_review_log").insert({ exam_id: job.exam_id, version_id: job.exam_version_id, actor_id: actor.id, action: "text_approved", note: body.note });
      return Response.json({ ok: true, examId: job.exam_id });
    }
    if (job.kind !== "listening_audio") throw new Error("Use text review for this draft");
    if (body.decision === "reject") {
      if (!["awaiting_review","qa_failed"].includes(job.status)) throw new Error("Job cannot be rejected in this state");
      const { error } = await client.from("ai_factory_jobs").update({ status: "rejected", reviewed_by: actor.id, review_note: body.note, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", job.status);
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    if (job.status !== "awaiting_review" || !job.artifact_path) throw new Error("Audio has not passed technical QA");
    if (!body.listened || !body.answersChecked) throw new Error("Listen to the audio and verify every answer before approval");
    const { data: qa, error: qaError } = await client.from("ai_factory_qa").select("passed").eq("job_id", job.id).single();
    if (qaError || !qa?.passed) throw new Error("Technical QA has not passed");
    const { data: version, error: versionError } = await client.from("ielts_exam_versions").select("content").eq("id", job.exam_version_id).single();
    if (versionError || !version) throw new Error(versionError?.message || "Exam version missing");
    const { data: exam, error: examError } = await client.from("ielts_exams").select("current_version_id,status").eq("id", job.exam_id).single();
    if (examError || !exam || exam.current_version_id !== job.exam_version_id || exam.status === "published") throw new Error("Exam changed after audio was queued; re-review required");
    const content = contentSchema.parse(version.content);
    const fullSections = Array.isArray(job.payload?.sections) ? job.payload.sections as { sectionId: string }[] : [];
    const draftPaths: Record<string, string> = fullSections.length ? JSON.parse(job.artifact_path) as Record<string, string> : { [String(job.payload.sectionId)]: job.artifact_path };
    if (fullSections.length && (fullSections.length !== 4 || content.sections.length !== 4 || fullSections.some((part, index) => part.sectionId !== `part-${index + 1}`))) throw new Error("Full Listening draft needs four sections");
    if (fullSections.length && Object.keys(draftPaths).length !== content.sections.length) throw new Error("Audio files do not match exam sections");
    const targetSections = fullSections.length ? content.sections : content.sections.filter((section) => section.id === job.payload.sectionId);
    if (targetSections.length !== (fullSections.length ? 4 : 1)) throw new Error("Audio section missing");
    for (const section of targetSections) {
      const draftPath = draftPaths[section.id];
      if (!draftPath || !draftPath.startsWith(`${job.id}/`)) throw new Error(`Audio file missing for ${section.id}`);
      const { data: download, error: downloadError } = await client.storage.from("ai-factory-drafts").download(draftPath);
      if (downloadError || !download) throw new Error(downloadError?.message || "Audio draft missing");
      const publicPath = fullSections.length ? `ai-factory/${job.id}/${section.id}.mp3` : `ai-factory/${job.id}.mp3`;
      const uploaded = await client.storage.from("ielts-audio").upload(publicPath, download, { contentType: "audio/mpeg", upsert: false });
      if (uploaded.error && !/already exists|Duplicate/i.test(uploaded.error.message)) throw new Error(uploaded.error.message);
      section.audioUrl = client.storage.from("ielts-audio").getPublicUrl(publicPath).data.publicUrl;
    }
    const saved = await saveRevision(job.exam_id, content, actor.id, job.exam_version_id);
    const { error: qaUpdateError } = await client.from("ai_factory_qa").update({ naturalness_review: { listened: true, answersChecked: true, note: body.note, actorId: actor.id } }).eq("job_id", job.id);
    if (qaUpdateError) throw new Error(qaUpdateError.message);
    const { error: updateError } = await client.from("ai_factory_jobs").update({ status: "approved", exam_version_id: saved.versionId, reviewed_by: actor.id, review_note: body.note, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "awaiting_review");
    if (updateError) throw new Error(updateError.message);
    await client.from("ielts_review_log").insert({ exam_id: job.exam_id, version_id: saved.versionId, actor_id: actor.id, action: "audio_approved", note: body.note });
    return Response.json({ ok: true, examId: job.exam_id, versionId: saved.versionId, warnings: saved.warnings });
  } catch (error) { return requestError(error); }
}
