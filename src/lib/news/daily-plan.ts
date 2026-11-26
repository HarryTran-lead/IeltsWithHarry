export type DailyCandidate = {
  id: string;
  category: string;
  published_at: string;
  origin_region?: string | null;
  interest_topics?: string[] | null;
};

/** Publisher value stored on articles Harry Up writes itself. Kept as-is so existing rows still match. */
export const OWN_PUBLISHER = "IeltsWithHarry";
export const BRAND_NAME = "Harry Up";
export function publisherLabel(publisher: string) { return publisher === OWN_PUBLISHER ? BRAND_NAME : publisher; }

export const AI_ART_SOURCE = "https://pollinations.ai/";

export function hasRealNewsPhoto(row: {
  image_url: string | null;
  image_alt: string | null;
  image_credit: string | null;
  illustration_source_url: string | null;
}) {
  return Boolean(row.image_url?.trim() && row.image_alt?.trim() && row.image_credit?.trim()
    && row.illustration_source_url !== AI_ART_SOURCE);
}

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
  if (publisher !== OWN_PUBLISHER) return publisher;
  try {
    const host = new URL(reportUrl || canonicalUrl).hostname.replace(/^www\./, "");
    if (host === "vnexpress.net" || host.endsWith(".vnexpress.net")) return "VnExpress";
    if (host === "tuoitrenews.vn" || host === "tuoitre.vn" || host.endsWith(".tuoitre.vn")) return "Tuổi Trẻ";
    if (host === "thanhnien.vn" || host.endsWith(".thanhnien.vn")) return "Thanh Niên";
    return host;
  } catch { return publisherLabel(publisher); }
}

export function readingMinutes(wordCount: number) {
  return Math.max(1, Math.ceil(wordCount / 150));
}

/** Give each next-read slot a purpose while keeping unseen stories ahead of rereads. */
export function nextNewsReads<T extends DailyCandidate>(articles:T[],read:Set<string>,currentCategory:string,preferred:string[],quizTypes:Map<string,string[]>,weakType?:string){
  const remaining=[...articles].sort((a,b)=>Number(read.has(a.id))-Number(read.has(b.id))||Number(b.origin_region==="vietnam")-Number(a.origin_region==="vietnam")||b.published_at.localeCompare(a.published_at));
  const result:(T&{recommendationReason:string})[]=[];
  const take=(predicate:(item:T)=>boolean,reason:string)=>{
    const unread=remaining.filter((item)=>!read.has(item.id));const eligible=unread.length?unread:remaining;
    const chosen=eligible.find(predicate)??eligible[0];if(!chosen)return;
    remaining.splice(remaining.findIndex((item)=>item.id===chosen.id),1);result.push({...chosen,recommendationReason:predicate(chosen)?reason:"Khám phá bài đọc tiếp theo"});
  };
  take((item)=>preferred.includes(item.category)||(item.interest_topics??[]).some((topic)=>preferred.includes(topic))||item.category===currentCategory,"Gần chủ đề bạn quan tâm");
  take((item)=>weakType?quizTypes.get(item.id)?.includes(weakType)===true:quizTypes.has(item.id),weakType?"Có dạng câu hỏi bạn cần luyện":"Có câu hỏi để luyện tiếp");
  take((item)=>item.category!==currentCategory&&!result.some((selected)=>selected.category===item.category),"Khám phá một chủ đề khác");
  return result;
}
