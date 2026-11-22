/** Diagram data stays explicit; never infer spatial facts from unrelated prose. */
export type QuestionDiagram = { title: string; labels: string[]; gap: number; prompt: string };
export function parseQuestionDiagram(prompt: string): QuestionDiagram | null {
  const marker=/\[DIAGRAM:(\{[^\n]+\})\]\s*/.exec(prompt);
  if(!marker)return null;
  try{
    const data=JSON.parse(marker[1]) as {title?:unknown;labels?:unknown;gap?:unknown};
    if(typeof data.title!=="string"||data.title.length>100||!Array.isArray(data.labels)||data.labels.length<2||data.labels.length>6||!data.labels.every((item)=>typeof item==="string"&&item.length>0&&item.length<=70)||!Number.isInteger(data.gap)||Number(data.gap)<0||Number(data.gap)>=data.labels.length||data.labels[Number(data.gap)]!=="______")return null;
    return {title:data.title,labels:data.labels as string[],gap:Number(data.gap),prompt:prompt.replace(marker[0],"").trim()};
  }catch{return null;}
}

export function sharedMatchingOptions(items: {options:string[]}[]): string[] | null {
  if(items.length<2||!items[0].options.length)return null;
  const first=JSON.stringify(items[0].options);
  return items.every((item)=>JSON.stringify(item.options)===first)?items[0].options:null;
}
