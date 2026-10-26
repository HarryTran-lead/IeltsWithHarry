import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { catalogSkills, withSummaries, type CatalogExam } from "@/lib/ielts-bank/catalog";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await viewer();
    const requestedSkill = new URL(request.url).searchParams.get("skill");
    const skill = catalogSkills.find((value) => value === requestedSkill);
    const client = bankClient();
    const exams: CatalogExam[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      let query = client.from("ielts_exams")
        .select("id,title,skill,practice_type,format,duration_minutes,attribution,license,ai_generated,created_at,topic,difficulty,source_id")
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
    return Response.json({ exams: enriched, total: exams.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}
