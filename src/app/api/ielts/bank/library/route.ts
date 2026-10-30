import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { contentSchema, publicContent } from "@/lib/ielts-bank/schema";
import { releaseLocks } from "@/lib/runtime";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (releaseLocks) return Response.json({ error: "Question bank is not available yet." }, { status: 404 });
  try {
    await viewer();
    const client = bankClient(), url = new URL(request.url), id = url.searchParams.get("id");
    if (id) {
      const { data, error } = await client.from("ielts_exams").select("*,ielts_exam_versions!ielts_published_version_fk(id,content,revision)").eq("id", id).not("published_version_id", "is", null).single();
      if (error || !data) throw new Error("Exam unavailable");
      const version = Array.isArray(data.ielts_exam_versions) ? data.ielts_exam_versions[0] : data.ielts_exam_versions;
      return Response.json({ exam: { ...data, ielts_exam_versions: undefined, content: publicContent(contentSchema.parse(version.content)), versionId: version.id, revision: version.revision } });
    }
    const page = Math.max(0, Math.min(1000, Number(url.searchParams.get("page") || 0) || 0));
    let query = client.from("ielts_exams").select("id,title,skill,format,mode,topic,difficulty,duration_minutes,attribution,license,license_url,source_url,ai_generated", { count: "exact" }).not("published_version_id", "is", null).order("created_at", { ascending: false }).range(page * 20, page * 20 + 19);
    if (url.searchParams.get("skill")) query = query.eq("skill", url.searchParams.get("skill")!);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return Response.json({ exams: data, total: count });
  } catch (error) { return requestError(error); }
}
