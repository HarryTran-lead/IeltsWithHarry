import "server-only";
/** M19F C2 formative DRAFT: answers remain server-side. Never calculate mastery here. */
import authoredRaw from "@/data/grammar-guided/c2-guided-m19f.json";
import lessonRaw from "@/data/grammar-c2-m13/lessons.json";
import type { M19GuidedFlow, M19GuidedStep } from "../types";

type Check = {id:string;prompt_vi:string;options_en:string[];correct_index:number;option_feedback_vi:string[];focus:string};
type Authored={code:string;title:string;context_vi:string;goal_vi:string;contrast_cue_vi:string;
  checkpoints:Check[];transfer:{prompt_vi:string;sample_en:string;rubric_vi:string};
  review_status:"DRAFT_TEACHER_REVIEW_REQUIRED";assessment_mode:"FORMATIVE_ONLY"};
type Source={title:string;overview_vi:string;decision_steps_vi:string[];
  semantic_contrast:{option_a_en:string;option_b_en:string;analysis_vi:string};
  discourse_edit:{scenario_vi:string;task_en:string;model_en:string;editor_commentary_vi:string};
  source_rules:{pattern:string;function_vi:string;example_en:string;example_vi?:string|null}[]};
const authored=authoredRaw as Record<string,Authored>;
const source=lessonRaw as Record<string,Source>;

/** Build public steps without copying grading keys into a client payload. */
export function getM19FPublicFlow(code:string):M19GuidedFlow|null {
 if(!/^C2-(0[1-9]|1[0-9]|20)$/.test(code)||!Object.prototype.hasOwnProperty.call(authored,code)||!Object.prototype.hasOwnProperty.call(source,code))return null;
 const a=authored[code],s=source[code];
 if(a.code!==code||a.review_status!=="DRAFT_TEACHER_REVIEW_REQUIRED"||a.assessment_mode!=="FORMATIVE_ONLY"||a.checkpoints.length!==3||s.source_rules.length<2||s.decision_steps_vi.length<3)return null;
 const steps:M19GuidedStep[]=[];
 const push=(kind:M19GuidedStep["kind"],title:string,bodyVi:string,extra:Partial<M19GuidedStep>={})=>
   steps.push({id:`${code}-M19F-S${String(steps.length+1).padStart(2,"0")}`,kind,title,bodyVi,...extra});
 const check=(i:number,title:string)=>{const q=a.checkpoints[i];
   push("check",title,i===0 ? `Trước tiên giữ đúng mục tiêu biên tập: ${a.goal_vi}`
     : i===1 ? `Xem lại khác biệt về ngữ nghĩa: ${a.contrast_cue_vi}`
     : `Giữ nguyên sự kiện được xác minh: ${s.decision_steps_vi[2] || a.goal_vi}`,
     {checkId:q.id,promptVi:q.prompt_vi,options:q.options_en});};
 push("scenario","01 · Xác định bối cảnh biên tập",a.context_vi,{footnoteVi:a.goal_vi});
 check(0,"02 · Quyết định trước khi xem quy tắc");
 push("explain","03 · Xác định dữ kiện được phép khẳng định",s.decision_steps_vi[0],{footnoteVi:s.overview_vi});
 const r1=s.source_rules[0];
 push("rule","04 · Một cấu trúc phục vụ ý nghĩa",r1.function_vi,{formula:r1.pattern,exampleEn:r1.example_en,exampleVi:r1.example_vi ?? undefined});
 push("contrast","05 · Chứng minh hai cách viết không luôn tương đương",a.contrast_cue_vi,
   {compareFirstEn:s.semantic_contrast.option_a_en,compareSecondEn:s.semantic_contrast.option_b_en,comparisonVi:s.semantic_contrast.analysis_vi});
 check(1,"06 · Kiểm tra sắc thái và phạm vi thông tin");
 push("explain","07 · Soát tác nhân, thời gian và giả định",s.decision_steps_vi[1],
   {footnoteVi:"Hãy diễn đạt bằng lời: thay đổi cấu trúc nào sẽ đổi dữ kiện, người làm hoặc mức chắc chắn?"});
 const r2=s.source_rules[1];
 push("rule","08 · Mở rộng theo mục đích diễn đạt",r2.function_vi,{formula:r2.pattern,exampleEn:r2.example_en,exampleVi:r2.example_vi ?? undefined});
 push("demo","09 · Quan sát đoạn biên tập mẫu",`Đọc nhiệm vụ biên tập, tự dự đoán cách sửa rồi mới xem mẫu: ${s.discourse_edit.task_en}`,
   {exampleEn:s.discourse_edit.model_en,explanationVi:s.discourse_edit.editor_commentary_vi});
 push("explain","10 · Giải thích vì sao bản mẫu trung thực",s.decision_steps_vi[2],
   {footnoteVi:"Đối chiếu từng mệnh đề với tình huống nguồn. Không chấp nhận suy diễn nguyên nhân hoặc tác nhân chưa có bằng chứng."});
 check(2,"11 · Phản biện và sửa cách diễn đạt");
 // M19G: don't repeat the exact contrast from step 05. Use a real wrong
 // alternative from check 03 to reinforce the editorial error just practised.
 const third=a.checkpoints[2];
 const wrongIndex=third.options_en.findIndex((_,i)=>i!==third.correct_index);
 push("mistake","12 · Mổ xẻ một phương án biên tập gây sai lệch",third.option_feedback_vi[wrongIndex],
   {wrongEn:third.options_en[wrongIndex],correctEn:third.options_en[third.correct_index]});
 push("transfer","13 · Tự biên tập văn bản trước khi xem mẫu",a.transfer.prompt_vi,
   {modelEn:a.transfer.sample_en,rubricVi:a.transfer.rubric_vi});
 push("explain","14 · Kiểm tra dữ kiện đã giữ nguyên",a.transfer.rubric_vi,
   {footnoteVi:"Câu mẫu không phải đáp án duy nhất; bài viết khác giữ đúng thông tin và mục đích vẫn có thể hợp lệ."});
 push("explain","15 · Khi nào không nên dùng cấu trúc phức?","Một biến đổi hình thức chỉ có ích nếu người đọc hiểu đúng hơn. Nếu đổi chủ thể, mốc thời gian, phạm vi phủ định, độ chắc chắn hoặc quan hệ nhân quả thì phải sửa lại.",
   {footnoteVi:s.overview_vi});
 push("recap","16 · Quy trình biên tập C2 trước khi tự luyện","Trước khi gửi văn bản, kiểm tra lần lượt:",
   {decisionSteps:s.decision_steps_vi.slice(0,3)});
 return {code,title:s.title,version:"m19f-c2-v1",reviewStatus:"DRAFT_TEACHER_REVIEW_REQUIRED",steps};
}
/** POST: return only a chosen option's rationale; no persistent effects. */
export function checkM19FAnswer(code:string,checkId:string,selection:number):{correct:boolean;explanationVi:string}|null {
 if(!/^C2-(0[1-9]|1[0-9]|20)$/.test(code)||!Number.isInteger(selection)||!Object.prototype.hasOwnProperty.call(authored,code))return null;
 const a=authored[code];if(a.review_status!=="DRAFT_TEACHER_REVIEW_REQUIRED")return null;
 const q=a.checkpoints.find(x=>x.id===checkId);
 if(!q||selection<0||selection>=q.options_en.length||selection>=q.option_feedback_vi.length)return null;
 return {correct:selection===q.correct_index,explanationVi:q.option_feedback_vi[selection]};
}
