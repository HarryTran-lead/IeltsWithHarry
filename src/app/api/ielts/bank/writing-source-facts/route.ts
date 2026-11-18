import { createHash } from "node:crypto";
import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { contentSchema } from "@/lib/ielts-bank/schema";

export const runtime = "nodejs";
const bodySchema = z.object({
  examVersionId: z.uuid(),
  facts: z.array(z.object({ id: z.string().min(1).max(100), claim: z.string().min(1).max(1000) }).strict()).min(1).max(100),
});

export async function GET(request: Request) {
  try {
    await viewer(true);
    const id = z.uuid().parse(new URL(request.url).searchParams.get("examVersionId"));
    const client = bankClient();
    const { data: version, error } = await client.from("ielts_exam_versions").select("id,content,ielts_exams(skill,format,practice_type)").eq("id", id).single();
    if (error || !version) return Response.json({ error: "Exam version unavailable" }, { status: 404 });
    const { data: verified } = await client.from("writing_grading_source_facts").select("facts,source_hash,source_hash_kind,source_ref,verification_method,verified_at").eq("exam_version_id", id).maybeSingle();
    return Response.json({ version, verified }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}

/** Admin verifies source facts from the original chart; never inferred from learner prose. */
export async function POST(request: Request) {
  try {
    const admin = await viewer(true);
    const body = bodySchema.parse(await request.json());
    if (new Set(body.facts.map((fact) => fact.id)).size !== body.facts.length) return Response.json({ error: "Duplicate fact IDs" }, { status: 400 });
    const client = bankClient();
    const { data: version, error } = await client.from("ielts_exam_versions").select("id,content,ielts_exams(skill,format,practice_type)").eq("id", body.examVersionId).single();
    if (error || !version) return Response.json({ error: "Exam version unavailable" }, { status: 404 });
    const exam = Array.isArray(version.ielts_exams) ? version.ielts_exams[0] : version.ielts_exams;
    if (exam?.skill !== "Writing" || exam.format !== "Academic" || exam.practice_type !== "task1_academic") return Response.json({ error: "Academic Task 1 required" }, { status: 400 });
    const content = contentSchema.parse(version.content);
    if (!content.imageUrl && !content.visual) return Response.json({ error: "Source visual unavailable" }, { status: 400 });
    const sourceHash = createHash("sha256").update(JSON.stringify({ prompt: content.prompt, imageUrl: content.imageUrl ?? null, visual: content.visual ?? null, facts: body.facts })).digest("hex");
    const { error: writeError } = await client.from("writing_grading_source_facts").upsert({ exam_version_id: body.examVersionId, facts: body.facts, source_hash: sourceHash, source_hash_kind: "prompt_visual_facts_json", source_ref: content.imageUrl ?? null, verification_method: "human_chart_review", verified_by: admin.id, verified_at: new Date().toISOString() });
    if (writeError) throw new Error("Source facts could not be saved");
    return Response.json({ ok: true, source_hash: sourceHash });
  } catch (error) { return requestError(error); }
}
