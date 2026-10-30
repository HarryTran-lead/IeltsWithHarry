import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { catalogSkills, sectionSummaries, withSummaries, type CatalogExam } from "@/lib/ielts-bank/catalog";
import { releaseLocks } from "@/lib/runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (releaseLocks) return Response.json({ error: "Question bank is not available yet." }, { status: 404 });
  try {
    await viewer();
    const requestedSkill = new URL(request.url).searchParams.get("skill");
    const skill = catalogSkills.find((value) => value === requestedSkill);
    const client = bankClient();
    const exams: CatalogExam[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      let query = client.from("ielts_exams")
        .select("id,title,skill,practice_type,format,duration_minutes,attribution,license,ai_generated,created_at,topic,difficulty,source_id,published_version_id")
        .eq("status", "published")
        .not("published_version_id", "is", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (skill) query = query.eq("skill", skill);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      exams.push(...(data || []) as CatalogExam[]);
      if (!data || data.length < pageSize) break;
    }
    // Card details are optional: the library still works if the summary function is missing.
    const summary = await client.rpc("ielts_catalog_summary", { p_skill: skill ?? null });
    const enriched = summary.error ? exams : withSummaries(exams, summary.data ?? []);
    if (skill === "Reading" || skill === "Listening") {
      const versions = exams.filter((exam) => exam.practice_type === "full_test")
        .map((exam) => exam.published_version_id)
        .filter((id): id is string => Boolean(id));
      const sections = new Map<string, CatalogExam["sections"]>();
      for (let index = 0; index < versions.length; index += 100) {
        const { data, error } = await client.from("ielts_exam_versions").select("id,content").in("id", versions.slice(index, index + 100));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
          sections.set(row.id, sectionSummaries(row.content as Parameters<typeof sectionSummaries>[0]));
        }
      }
      for (const exam of enriched) exam.sections = sections.get(exam.published_version_id ?? "");
    }
    return Response.json({ exams: enriched, total: exams.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}
