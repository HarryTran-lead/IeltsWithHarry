export type DailyCandidate = {
  id: string;
  category: string;
  published_at: string;
  origin_region?: string | null;
  interest_topics?: string[] | null;
};

/** Stable daily choices favour ready, unread Vietnamese news without repeating one category. */
export function dailyNewsPicks<T extends DailyCandidate>(
  articles: T[], ready: Set<string>, read: Set<string>, preferredTopics: string[] = [], weakCategories: string[] = [], count = 4,
) {
  const categories = new Set<string>();
  const picks: T[] = [];
  const remaining = [...articles];
  while (picks.length < count && remaining.length) {
    remaining.sort((a, b) => {
      const score = (row: T) => Number(ready.has(row.id)) * 8 + Number(row.origin_region === "vietnam") * 4
        + Number(!read.has(row.id)) * 3 + Number(preferredTopics.includes(row.category)) * 7
        + Number(weakCategories.includes(row.category)) * 2
        + Number((row.interest_topics ?? []).some((topic) => preferredTopics.includes(topic))) * 5
        + Number(!categories.has(row.category)) * 5;
      return score(b) - score(a) || b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id);
    });
    const chosen = remaining.shift()!;
    picks.push(chosen);
    categories.add(chosen.category);
  }
  return picks;
}

export function originalNewsSource(reportUrl: string | null, canonicalUrl: string, publisher: string) {
  if (publisher !== "IeltsWithHarry") return publisher;
  try {
    const host = new URL(reportUrl || canonicalUrl).hostname.replace(/^www\./, "");
    if (host === "vnexpress.net" || host.endsWith(".vnexpress.net")) return "VnExpress";
    if (host === "tuoitrenews.vn" || host === "tuoitre.vn" || host.endsWith(".tuoitre.vn")) return "Tuổi Trẻ";
    if (host === "thanhnien.vn" || host.endsWith(".thanhnien.vn")) return "Thanh Niên";
    return host;
  } catch { return publisher; }
}

export function readingMinutes(wordCount: number) {
  return Math.max(1, Math.ceil(wordCount / 150));
}
