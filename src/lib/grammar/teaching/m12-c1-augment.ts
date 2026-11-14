/** M12 C1 teacher-preview: append ONLY new interpretive sections, disabled by default. */
import teaching from "@/data/grammar-c1-m12/lessons.json";
import type { TeachingGuide as GrammarGuide } from "./teaching-types";
export type M12C1Draft = {
 lesson_id:string; title:string; overview_vi:string; decision_steps_vi:string[];
 patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string;provenance_rule_id:string}[];
 worked_examples:{context_vi:string;answer_en:string;translation_vi:string;reason_vi:string;provenance_rule_id:string}[];
 contrast:{first_en:string;second_en:string;difference_vi:string;comparison_note:string;teacher_review_required:boolean};
 common_mistakes:{wrong:string;correct:string;why_vi:string;provenance_rule_id:string}[];
 discourse_transfer:{context_vi:string;task_en:string;model_paragraph_en:string;coaching_vi:string};
 draft_practice:{stage:string;prompt_en:string;draft_id:string;assessment_mode:string;editorial_status:string}[];
 editorial_status:string; question_import_policy:string;
};
const drafts=teaching as Record<string,M12C1Draft>;
export function getM12C1Draft(code:string):M12C1Draft|null {
 return Object.prototype.hasOwnProperty.call(drafts,code)?drafts[code]:null;
}
export function enhanceM12C1Guide(guide:GrammarGuide):GrammarGuide {
 const draft=getM12C1Draft(guide.code);
 if(!draft)return guide;
 const section=(heading:string,formula:string,explanation:string,examples:{en:string;vi?:string}[]=[])=>
   ({heading,formula,explanation,examples,mistake:null,note:""});
 // Existing editorial rules/examples/mistakes already render via guide.sections; do not repeat.
 const additional=[
  section("C1 — Mục đích diễn đạt và mức độ chắc chắn", "Ba bước lựa chọn", `${draft.overview_vi}\n${draft.decision_steps_vi.map((x,i)=>`${i+1}. ${x}`).join("\n")}`),
  section("Đối chiếu sắc thái, phạm vi và văn phong", "Không kết luận cả hai đều đúng", draft.contrast.difference_vi,
    [{en:draft.contrast.first_en},{en:draft.contrast.second_en}]),
  section("Vận dụng vào diễn ngôn học thuật", draft.discourse_transfer.context_vi,
    `${draft.discourse_transfer.task_en}\nPhân tích: ${draft.discourse_transfer.coaching_vi}`,
    [{en:draft.discourse_transfer.model_paragraph_en}]),
 ];
 return {...guide,sections:[...additional,...guide.sections],m12ReviewBanner:"M12 C1: học liệu dự thảo chưa được giáo viên phê duyệt. 120 bài luyện mới không chấm điểm và không mở khóa."};
}
