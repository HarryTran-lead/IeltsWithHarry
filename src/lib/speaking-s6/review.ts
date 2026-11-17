export type ReviewOffset=2|7|21;
export function reviewDueAt(anchor:string,days:ReviewOffset):Date{
  const start=new Date(anchor).getTime();
  if(!Number.isFinite(start))throw new Error("INVALID_REVIEW_ANCHOR");
  return new Date(start+days*24*60*60*1000);
}
export function reviewIsDue(anchor:string,days:ReviewOffset,now=Date.now()):boolean{
  return now>=reviewDueAt(anchor,days).getTime();
}
