/**
 * M08: A1 deep-teaching pack. The existing 1,530 A1 questions and saved IDs
 * are NOT modified, nor is supplementary draft practice placed into GET API.
 * This file is pure and safe to use for server-side preview only.
 */
import teaching from "@/data/grammar-a1-m08/lessons.json";
import type { TeachingGuide as GrammarGuide } from "./teaching-types";

export type A1TeachingDraft = {
  lesson_id: string; title: string; overview_vi: string;
  decision_steps_vi: string[];
  patterns: {pattern:string;use_vi:string;example_en:string;example_vi:string}[];
  worked_examples: {situation_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
  contrasts: {first_en:string;second_en:string;difference_vi:string}[];
  common_mistakes: {wrong:string;correct:string;why_vi:string}[];
  supplemental_practice: {stage:string;prompt_en:string;answer:string;explanation_vi:string;translation_vi:string;draft_id:string}[];
  editorial_status: string;
};
const draftBank = teaching as Record<string, A1TeachingDraft>;

export function getM08A1Draft(code: string): A1TeachingDraft | null {
  return Object.prototype.hasOwnProperty.call(draftBank, code) ? draftBank[code] : null;
}

function section(heading: string, formula: string, explanation: string, examples: {en:string;vi?:string}[], mistake: {wrong:string;correct:string;why_vi:string}|null = null) {
  return {heading,formula,explanation,examples,mistake,note:""};
}

/**
 * Explicit opt-in via GRAMMAR_M08_ENABLE_TEACHING=true in server environment.
 * Draft questions never appear in the public GET response and cannot gain
 * scoring, progress or unlock privileges through this teaching preview.
 */
export function enhanceM08A1Guide(guide: GrammarGuide, sourceLesson?: {sections?: Record<string,unknown>[]}): GrammarGuide {
  const record = getM08A1Draft(guide.code);
  if (!record) return guide;
  const extra = [
    section("Bắt đầu: hiểu ý nghĩa và chọn cấu trúc", "Ba bước quyết định", `${record.overview_vi}\n${record.decision_steps_vi.map((v,i)=>`${i+1}. ${v}`).join("\n")}`, []),
    ...record.patterns.map((p,i)=>section(`Quy tắc ${i+1}: ${p.pattern}`,p.pattern,p.use_vi,[{en:p.example_en,vi:p.example_vi}])),
    ...record.worked_examples.map((p,i)=>section(`Ví dụ có hướng dẫn ${i+1}`,p.situation_vi,p.reason_vi,[{en:p.answer_en,vi:p.translation_vi}])),
    ...record.contrasts.map((p,i)=>section(`So sánh để tránh nhầm ${i+1}`,"Hai cách dùng",p.difference_vi,[{en:p.first_en},{en:p.second_en}])),
    ...record.common_mistakes.map((p,i)=>section(`Lỗi thường gặp ${i+1}`,"Tự sửa lỗi",p.why_vi,[],p)),
  ];
  // Original A1-01 sections contain 7 pronouns as table.items, which the
  // earlier normalizer did not display. Render it as real table only in M08.
  const tables: NonNullable<GrammarGuide["tables"]> = [];
  for (const raw of sourceLesson?.sections ?? []) {
    const items = Array.isArray(raw.items) ? raw.items : [];
    if (!items.length) continue;
    const valid = items.filter((x): x is Record<string,unknown> => !!x && typeof x === "object" && !Array.isArray(x));
    if (valid.length && valid.every(x=>["pronoun","meaning","example","translation"].every(k=>typeof x[k]==="string"))) {
      tables.push({
        heading: typeof raw.heading === "string" ? raw.heading : "Bảng tham chiếu",
        headers:["Đại từ","Nghĩa","Ví dụ","Dịch nghĩa"],
        rows:valid.map(x=>[x.pronoun,x.meaning,x.example,x.translation] as string[]),
      });
    }
  }
  return {
    ...guide,
    sections:[...extra,...guide.sections],
    tables:[...(guide.tables ?? []),...tables],
    m08ReviewBanner:"Học liệu A1 M08 là bản biên tập nháp, cần giáo viên kiểm duyệt trước khi công bố.",
  };
}
