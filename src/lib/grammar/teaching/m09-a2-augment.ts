/**
 * M09 A2 teaching PREVIEW adapter. Pure mapping of teacher-draft material to
 * public guide theory. Practice drafts stay server-side and cannot be scored.
 * Source lessons/questions and student progress remain untouched.
 */
import teaching from "@/data/grammar-a2-m09/lessons.json";
import type { TeachingGuide as GrammarGuide } from "./teaching-types";
export type A2TeachingDraft = {
  lesson_id:string; title:string; overview_vi:string; decision_steps_vi:string[];
  patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string}[];
  worked_examples:{situation_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
  contrasts:{first_en:string;second_en:string;difference_vi:string}[];
  common_mistakes:{wrong:string;correct:string;why_vi:string}[];
  supplemental_practice:{stage:string;prompt_en:string;answer:string;explanation_vi:string;translation_vi:string;draft_id:string}[];
  editorial_status:string; question_import_policy:string;
};
const drafts = teaching as Record<string,A2TeachingDraft>;
export function getM09A2Draft(code:string):A2TeachingDraft|null {
  return Object.prototype.hasOwnProperty.call(drafts,code) ? drafts[code] : null;
}
export function enhanceM09A2Guide(guide:GrammarGuide):GrammarGuide {
  const draft=getM09A2Draft(guide.code);
  if (!draft) return guide;
  const sec=(heading:string,formula:string,explanation:string,examples:{en:string;vi?:string}[]=[],mistake:{wrong:string;correct:string;why_vi:string}|null=null) =>
    ({heading,formula,explanation,examples,mistake,note:""});
  const extra=[
    sec("Hiểu ý nghĩa và chọn cấu trúc", "3 bước quyết định", `${draft.overview_vi}\n${draft.decision_steps_vi.map((x,i)=>`${i+1}. ${x}`).join("\n")}`),
    ...draft.patterns.map((p,i)=>sec(`Cấu trúc ${i+1}: ${p.pattern}`,p.pattern,p.use_vi,[{en:p.example_en,vi:p.example_vi}])),
    ...draft.worked_examples.map((p,i)=>sec(`Ví dụ phân tích ${i+1}`,p.situation_vi,p.reason_vi,[{en:p.answer_en,vi:p.translation_vi}])),
    ...draft.contrasts.map((p,i)=>sec(`So sánh dễ nhầm ${i+1}`,"Hai cách dùng",p.difference_vi,[{en:p.first_en},{en:p.second_en}])),
    ...draft.common_mistakes.map((p,i)=>sec(`Lỗi thường gặp ${i+1}`,"Tự phát hiện và sửa",p.why_vi,[],p)),
  ];
  return {...guide,sections:[...extra,...guide.sections],m09ReviewBanner:"Học liệu A2 M09 đang chờ giáo viên kiểm duyệt; đây chỉ là bản xem trước, chưa dùng bài luyện nháp để chấm điểm."};
}
