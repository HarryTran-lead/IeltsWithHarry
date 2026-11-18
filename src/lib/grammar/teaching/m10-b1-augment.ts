/** M10 teacher-draft preview: do not turn on for production before independent review. */
import teaching from "@/data/grammar-b1-m10/lessons.json";
import type { TeachingGuide as GrammarGuide } from "./teaching-types";
export type M10B1Draft = {
 lesson_id:string;title:string;overview_vi:string; decision_steps_vi:string[];
 patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string}[];
 worked_examples:{situation_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
 contrasts:{first_en:string;second_en:string;difference_vi:string}[];
 common_mistakes:{wrong:string;correct:string;why_vi:string}[];
 paragraph_transfer:{context_vi:string;task_en:string;model_paragraph_en:string;coaching_vi:string};
 draft_practice:{stage:string;prompt_en:string;draft_id:string;assessment_mode:string}[];
 editorial_status:string;question_import_policy:string;
};
const drafts=teaching as Record<string,M10B1Draft>;
export function getM10B1Draft(code:string):M10B1Draft|null {
 return Object.prototype.hasOwnProperty.call(drafts,code)?drafts[code]:null;
}
export function enhanceM10B1Guide(guide:GrammarGuide):GrammarGuide {
 const draft=getM10B1Draft(guide.code);
 if(!draft)return guide;
 const sec=(heading:string,formula:string,explanation:string,examples:{en:string;vi?:string}[]=[],mistake:{wrong:string;correct:string;why_vi:string}|null=null)=>
    ({heading,formula,explanation,examples,mistake,note:""});
 const extra=[
  sec("B1 — Quyết định cấu trúc theo nghĩa","3 bước",`${draft.overview_vi}\n${draft.decision_steps_vi.map((x,i)=>`${i+1}. ${x}`).join("\n")}`),
  ...draft.patterns.map((p,i)=>sec(`Bài giảng mới ${i+1}: ${p.pattern}`,p.pattern,p.use_vi,[{en:p.example_en,vi:p.example_vi}])),
  ...draft.worked_examples.map((e,i)=>sec(`Phân tích từng bước ${i+1}`,e.situation_vi,e.reason_vi,[{en:e.answer_en,vi:e.translation_vi}])),
  ...draft.contrasts.map((c,i)=>sec(`So sánh cách diễn đạt ${i+1}`,"Hai câu có thể đổi nghĩa",c.difference_vi,[{en:c.first_en},{en:c.second_en}])),
  ...draft.common_mistakes.map((m,i)=>sec(`Tự sửa lỗi ${i+1}`,"Phát hiện và giải thích",m.why_vi,[],m)),
  sec("Vận dụng vào đoạn văn",draft.paragraph_transfer.context_vi,
    `${draft.paragraph_transfer.task_en}\nGợi ý phân tích: ${draft.paragraph_transfer.coaching_vi}`,
    [{en:draft.paragraph_transfer.model_paragraph_en}]),
 ];
 // No draft practice, draft IDs, answer key or teacher-only files go to student guide.
 return {...guide,sections:[...extra,...guide.sections],m10ReviewBanner:"M10 B1 đang ở bản xem trước; tài liệu cần giáo viên duyệt, chưa sử dụng 140 bài nháp để chấm điểm hoặc mở khóa."};
}
