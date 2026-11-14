/** M11 B2 teacher-preview addon; off by default. Never expose the teacher-only key. */
import teaching from "@/data/grammar-b2-m11/lessons.json";
import type { TeachingGuide as GrammarGuide } from "./teaching-types";
export type M11B2Draft = {
 lesson_id:string; title:string; overview_vi:string; decision_steps_vi:string[];
 patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string;provenance_rule_id:string}[];
 worked_examples:{context_vi:string;answer_en:string;translation_vi:string;reason_vi:string;provenance_rule_id:string}[];
 contrast:{first_en:string;second_en:string;difference_vi:string};
 common_mistakes:{wrong:string;correct:string;why_vi:string;provenance_rule_id:string}[];
 paragraph_transfer:{context_vi:string;task_en:string;model_paragraph_en:string;coaching_vi:string};
 draft_practice:{stage:string;prompt_en:string;draft_id:string;assessment_mode:string}[];
 editorial_status:string;question_import_policy:string;
};
const drafts=teaching as Record<string,M11B2Draft>;
export function getM11B2Draft(code:string):M11B2Draft|null {
 return Object.prototype.hasOwnProperty.call(drafts,code)?drafts[code]:null;
}
export function enhanceM11B2Guide(guide:GrammarGuide):GrammarGuide {
 const draft=getM11B2Draft(guide.code);
 if(!draft)return guide;
 const section=(heading:string,formula:string,explanation:string,examples:{en:string;vi?:string}[]=[],mistake:{wrong:string;correct:string;why_vi:string}|null=null)=>
   ({heading,formula,explanation,examples,mistake,note:""});
 const extra=[
   section("B2 — Lựa chọn cấu trúc theo ý nghĩa","Ba bước",`${draft.overview_vi}\n${draft.decision_steps_vi.map((x,i)=>`${i+1}. ${x}`).join("\n")}`),
   // Source rules, worked examples and common mistakes are already in guide.sections.
   // Do not duplicate them here; only attach the three *new* B2 learning components.
   section("So sánh sắc thái","Đặt hai câu cạnh nhau",draft.contrast.difference_vi,[{en:draft.contrast.first_en},{en:draft.contrast.second_en}]),
   section("Vận dụng: viết đoạn văn theo ngữ cảnh",draft.paragraph_transfer.context_vi,
     `${draft.paragraph_transfer.task_en}\nGợi ý phân tích: ${draft.paragraph_transfer.coaching_vi}`,
     [{en:draft.paragraph_transfer.model_paragraph_en}]),
 ];
 // Do not include draft answers, IDs or private metadata in GrammarGuide.
 return {...guide,sections:[...extra,...guide.sections],m11ReviewBanner:"M11 B2: bản giảng xem trước, chưa được giáo viên phê duyệt. Bài luyện nháp không tính điểm hoặc mở khóa."};
}
