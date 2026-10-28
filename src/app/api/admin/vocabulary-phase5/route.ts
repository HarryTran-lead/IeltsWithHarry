import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";

export async function GET() {
  try {
    await viewer(true);
    const db = bankClient();
    const [topics, drafts, original, expansion, linksFirst, linksRest, packReviews] = await Promise.all([
      db.from("ielts_learning_topics").select("slug,title,origin,target_new_unique"),
      db.from("ielts_vocabulary_draft_entries").select("batch_key,topic_slug,review_status"),
      db.from("ielts_vocabulary_entries").select("source_key", { count: "exact", head: true }).eq("content_origin", "source_csv"),
      db.from("ielts_vocabulary_entries").select("source_key", { count: "exact", head: true }).eq("content_origin", "owner_authorized_editorial").eq("published", true),
      db.from("ielts_vocabulary_topic_links").select("topic_slug").order("pack_row").range(0, 999),
      db.from("ielts_vocabulary_topic_links").select("topic_slug").order("pack_row").range(1000, 1999),
      db.from("ielts_vocabulary_pack_review_events").select("source_key", { count: "exact", head: true }),
    ]);
    const failure = topics.error || drafts.error || original.error || expansion.error || linksFirst.error || linksRest.error || packReviews.error;
    if (failure) throw new Error(failure.message);
    const rows = topics.data ?? [];
    const draftRows = drafts.data ?? [];
    const linkRows = [...(linksFirst.data ?? []), ...(linksRest.data ?? [])];
    return Response.json({
      sourceTopics: rows.filter((row) => row.origin === "source_named").length,
      learningTopics: rows.filter((row) => row.origin === "editorial_expansion").length,
      targetNewUnique: rows.reduce((sum, row) => sum + row.target_new_unique, 0),
      originalEntries: original.count ?? 0,
      publishedNew: expansion.count ?? 0,
      proposed: draftRows.filter((row) => row.review_status === "proposed").length,
      approved: draftRows.filter((row) => row.review_status === "approved").length,
      packReviewed: packReviews.count ?? 0,
      topicPlacements: linkRows.length,
      topics: rows.filter((row) => row.origin === "editorial_expansion").map((row) => ({
        title: row.title,
        target: row.target_new_unique,
        approved: draftRows.filter((draft) => draft.topic_slug === row.slug && draft.review_status === "approved").length,
        placements: linkRows.filter((link) => link.topic_slug === row.slug).length,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return requestError(error);
  }
}
