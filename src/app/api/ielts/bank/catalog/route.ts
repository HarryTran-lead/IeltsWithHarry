import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { catalogSkills, sectionSummaries, withSummaries, type CatalogExam } from "@/lib/ielts-bank/catalog";
import { learnerSkillAvailable } from "@/lib/runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestedSkill = new URL(request.url).searchParams.get("skill");
  if (!learnerSkillAvailable(requestedSkill)) return Response.json({ error: "Question bank is not available yet." }, { status: 404 });
  try {
    await viewer();
    const skill = catalogSkills.find((value) => value === requestedSkill);
    const client = bankClient();
    const exams: CatalogExam[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      let query = client.from("ielts_exams")
        .select("id,title,skill,practice_type,format,duration_minutes,attribution,license,ai_generated,created_at,topic,difficulty,source_id,external_id,published_version_id")
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
    // General Training letters are not offered to learners for now.
    const enriched = (summary.error ? exams : withSummaries(exams, summary.data ?? []))
      .filter((exam) => !(exam.skill === "Writing" && exam.practice_type === "task1_general"));
    if (skill === "Writing") {
      // A Task 1 card's cover is the task's own figure: its image, or the full chart data to draw
      // (the summary drops large visuals and falls back to a decorative cover).
      const versions = enriched.filter((exam) => exam.practice_type === "task1_academic")
        .map((exam) => exam.published_version_id)
        .filter((id): id is string => Boolean(id));
      const figures = new Map<string, { figure: string | null; visual: unknown }>();
      for (let index = 0; index < versions.length; index += 100) {
        const { data, error } = await client.from("ielts_exam_versions").select("id,figure:content->>imageUrl,visual:content->visual").in("id", versions.slice(index, index + 100));
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as { id: string; figure: string | null; visual: unknown }[]) figures.set(row.id, { figure: row.figure, visual: row.visual });
      }
      for (const exam of enriched) {
        const found = figures.get(exam.published_version_id ?? "");
        if (!found) continue;
        exam.figure_url = found.figure || null;
        if (!exam.visual && found.visual && typeof found.visual === "object" && !Array.isArray(found.visual)) exam.visual = found.visual as Record<string, unknown>;
      }
    }
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
    return Response.json({ exams: enriched, total: enriched.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}
