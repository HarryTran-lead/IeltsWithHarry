export type ReadingSection = { start: number; title: string };
export function parseReadingSections(value: unknown, paragraphCount: number): ReadingSection[] {
  if(!Array.isArray(value)||value.length>3)return [];
  const result:ReadingSection[]=[];
  for(const section of value){
    if(!section||typeof section!=="object"||!Number.isInteger(section.start)||section.start<0||section.start>=paragraphCount||typeof section.title!=="string"||section.title.trim().length<3||section.title.length>90||result.some((item)=>item.start>=section.start))return [];
    result.push({start:section.start,title:section.title.trim()});
  }
  return result;
}
