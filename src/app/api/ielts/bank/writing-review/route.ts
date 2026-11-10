import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { gradingEnabled } from "@/lib/writing-grading/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await viewer(true);
    const client = bankClient();
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (jobId) {
      const id = z.uuid().parse(jobId);
      const { data: job, error } = await client.from("writing_grading_jobs").select("id,attempt_id,task_type,status,error_code,prompt_snapshot,visual_snapshot,essay_snapshot,created_at")
        .eq("id", id).single();
      if (error || !job) return Response.json({ error: "Job unavailable" }, { status: 404 });
      const result = await client.from("writing_grading_results").select("id,result,model_version,rubric_version,created_at").eq("job_id", id).maybeSingle();
      if (result.error) throw new Error("Review detail unavailable");
      const reviews = result.data ? await client.from("writing_teacher_reviews").select("id,criterion_scores,rationale,created_at").eq("result_id", result.data.id).order("created_at", { ascending: false }) : null;
      if (reviews?.error) throw new Error("Review detail unavailable");
      return Response.json({ job, result: result.data, reviews: reviews?.data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const { data, error } = await client.from("writing_grading_jobs").select("id,attempt_id,task_type,status,error_code,created_at,updated_at")
      .in("status", ["needs_review", "failed", "partial", "completed"]).order("created_at", { ascending: false }).limit(50);
    if (error && !gradingEnabled()) return Response.json({ status: "unavailable", jobs: [] }, { headers: { "Cache-Control": "private, no-store" } });
    if (error) throw new Error("Review queue unavailable");
    return Response.json({ jobs: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await viewer(true);
    const body = z.object({
      resultId: z.uuid(), rationale: z.string().min(1).max(4000),
      scores: z.record(z.enum(["TA", "TR", "CC", "LR", "GRA"]), z.number().min(0).max(9).refine((value) => Number.isInteger(value * 2))),
    }).parse(await request.json());
    const client = bankClient();
    const { data: result, error } = await client.from("writing_grading_results").select("id,result").eq("id", body.resultId).single();
    if (error || !result) return Response.json({ error: "Result unavailable" }, { status: 404 });
    const expected = (result.result as { task_type?: string }).task_type === "academic_task1" ? ["TA", "CC", "LR", "GRA"] : ["TR", "CC", "LR", "GRA"];
    if (Object.keys(body.scores).length !== 4 || expected.some((key) => body.scores[key as keyof typeof body.scores] === undefined)) return Response.json({ error: "Four criterion labels required" }, { status: 400 });
    const { data: review, error: writeError } = await client.from("writing_teacher_reviews").insert({ result_id: body.resultId, reviewer_id: admin.id, criterion_scores: body.scores, rationale: body.rationale }).select("id").single();
    if (writeError || !review) throw new Error("Review could not be saved");
    return Response.json({ reviewId: review.id }, { status: 201 });
  } catch (error) { return requestError(error); }
}
