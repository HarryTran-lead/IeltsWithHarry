/** M13 C2 review-only teaching preview. No official question scoring or progress mutations. */
import teaching from "@/data/grammar-c2-m13/lessons.json";
import type { TeachingGuide as GrammarGuide } from "./teaching-types";
export type M13C2Draft = {
 lesson_id:string; title:string; overview_vi:string; decision_steps_vi:string[];
 source_rules:{rule_id:string;heading:string;pattern:string;function_vi:string;example_en:string;example_vi?:string|null;source_status:string}[];
 semantic_contrast:{option_a_en:string;option_b_en:string;analysis_vi:string;teacher_review_required:boolean};
 discourse_edit:{scenario_vi:string;task_en:string;model_en:string;editor_commentary_vi:string};
 draft_practice:{stage:string;prompt_en:string;draft_id:string;assessment_mode:string;editorial_status:string}[];
 editorial_status:string; question_import_policy:string;
};
const drafts=teaching as Record<string,M13C2Draft>;
export function getM13C2Draft(code:string):M13C2Draft|null {
 return Object.prototype.hasOwnProperty.call(drafts,code)?drafts[code]:null;
}
export function enhanceM13C2Guide(guide:GrammarGuide):GrammarGuide {
 const draft=getM13C2Draft(guide.code);
 if(!draft)return guide;
 const section=(heading:string,formula:string,explanation:string,examples:{en:string;vi?:string}[]=[])=>
  ({heading,formula,explanation,examples,mistake:null,note:""});
 // Existing C2 source rules remain intact; M13 adds only interpretation and transfer.
 const additional=[
   section("C2 — Lựa chọn cấu trúc theo bằng chứng và ngữ cảnh", "Three checks",
     `${draft.overview_vi}\n${draft.decision_steps_vi.map((x,i)=>`${i+1}. ${x}`).join("\n")}`),
   section("Hai cách diễn đạt: hàm ý, trọng tâm và mức độ phù hợp", "Check meaning and register",
     draft.semantic_contrast.analysis_vi,
     [{en:draft.semantic_contrast.option_a_en},{en:draft.semantic_contrast.option_b_en}]),
   section("Expert editing — sửa diễn ngôn nhưng không đổi sự thật",draft.discourse_edit.scenario_vi,
     `${draft.discourse_edit.task_en}\nPhân tích: ${draft.discourse_edit.editor_commentary_vi}`,
     [{en:draft.discourse_edit.model_en}]),
 ];
 return {...guide,sections:[...additional,...guide.sections],
   m13ReviewBanner:"M13 C2: tài liệu biên tập đang chờ giáo viên duyệt; bài luyện mở chưa chấm điểm hoặc mở khóa cấp độ."};
}
