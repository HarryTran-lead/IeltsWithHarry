/** Shape the M08–M13 teaching modules were written against; teaching/index.ts maps it to GrammarGuide. */
export type TeachingSection = {
  heading: string; formula: string; explanation: string; examples: { en: string; vi?: string }[];
  mistake?: { wrong: string; correct: string; why_vi: string } | null; note: string;
};
export type TeachingGuide = {
  code: string; title: string; objectives: string[]; sections: TeachingSection[]; caveats: string[];
  tables?: { heading: string; headers: string[]; rows: string[][] }[];
  m08ReviewBanner?: string; m09ReviewBanner?: string; m10ReviewBanner?: string;
  m11ReviewBanner?: string; m12ReviewBanner?: string; m13ReviewBanner?: string;
};
