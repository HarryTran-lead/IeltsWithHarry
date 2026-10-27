import { bankClient, requestError, runSync } from "@/lib/ielts-bank/server";
import type { SourceId } from "@/lib/ielts-bank/connectors";
import { enrichIeltsCovers } from "@/lib/ielts-bank/cover-art";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const secret = process.env.IELTS_SYNC_SECRET || process.env.NEWS_SYNC_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const client = bankClient();
    const { data, error } = await client.from("ielts_sources").select("id,sync_hours,last_synced_at").eq("approved", true).eq("enabled", true);
    if (error) throw new Error(error.message);
    const { data: active } = await client.from("ielts_import_jobs").select("source_id").eq("status", "running").eq("dry_run", false);
    const activeIds = new Set((active || []).map((job) => job.source_id));
    const due = (data || []).filter((s) => activeIds.has(s.id) || !s.last_synced_at || Date.now() - new Date(s.last_synced_at).getTime() >= s.sync_hours * 3600000);
    const results = [];
    for (const source of due) results.push({ sourceId: source.id, ...(await runSync(source.id as SourceId)) });
    const covers = await enrichIeltsCovers(client);
    return Response.json({ results, covers });
  } catch (error) { return requestError(error); }
}
