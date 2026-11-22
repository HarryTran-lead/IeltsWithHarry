/** Put the first photo halfway through the passage and an optional third near three-quarters. */
export function inlinePhotoAfterParagraph(paragraphCount: number, position: 1 | 2) {
  if (paragraphCount < 4) return -1;
  return Math.max(0, Math.min(paragraphCount - 2, Math.floor(paragraphCount * (position === 1 ? 0.5 : 0.75)) - 1));
}

/** Prefer a related paragraph near the target reading distance, rather than paragraph count alone. */
export function inlinePhotoAnchor(paragraphs:string[],position:1|2,description:string){
  if(paragraphs.length<4)return -1;
  const counts=paragraphs.map((value)=>value.match(/[\p{L}\p{N}]+/gu)?.length??0);const total=counts.reduce((a,b)=>a+b,0)||1;
  const target=position===1?.5:.75;
  const tokens=[...new Set(description.toLowerCase().match(/[a-z]{4,}/g)??[])].filter((word)=>!["photo","image","view","with","from","this","that","taken","commons","wikimedia"].includes(word));
  let consumed=0;
  const candidates=paragraphs.slice(0,-1).map((paragraph,index)=>{
    consumed+=counts[index];const fraction=consumed/total;
    const words=new Set(paragraph.toLowerCase().match(/[a-z]{4,}/g)??[]);
    return {index,fraction,score:tokens.filter((token)=>words.has(token)).length*.15-Math.abs(fraction-target)};
  }).filter((item)=>Math.abs(item.fraction-target)<.19);
  return candidates.sort((a,b)=>b.score-a.score||a.index-b.index)[0]?.index??inlinePhotoAfterParagraph(paragraphs.length,position);
}
