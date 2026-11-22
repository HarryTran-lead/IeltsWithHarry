type Attempt = { article_id: string; score: number; total: number; partial?: boolean; submitted_at: string };
export type CardResult = { score: number; total: number; practice?: { score: number; total: number } };

/** A short review never replaces the latest full result. */
export function cardResults(attempts: Attempt[]): Record<string, CardResult> {
  const full = new Map<string, Attempt>();
  const practice = new Map<string, Attempt>();
  for (const item of [...attempts].sort((a,b)=>b.submitted_at.localeCompare(a.submitted_at))) {
    const group = item.partial ? practice : full;
    if (!group.has(item.article_id)) group.set(item.article_id,item);
  }
  return Object.fromEntries([...new Set(attempts.map((item)=>item.article_id))].map((id)=>{
    const result=full.get(id);const review=practice.get(id);
    return [id,{score:result?.score??0,total:result?.total??0,...(review?{practice:{score:review.score,total:review.total}}:{})}];
  }));
}
