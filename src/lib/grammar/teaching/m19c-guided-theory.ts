import "server-only";
/** M19C: B1 scaffolded theory, formative-only, editorial draft. */
import authoredRaw from "@/data/grammar-guided/b1-guided-m19c.json";
import sourceRaw from "@/data/grammar-b1-m10/lessons.json";
import type { M19GuidedFlow, M19GuidedStep } from "../types";

type Check = {id:string;prompt_vi:string;options_en:string[];correct_index:number;option_feedback_vi:string[];focus:string};
type Authored={code:string;title:string;context_vi:string;goal_vi:string;contrast_cue_vi:string;
  checkpoints:Check[];transfer:{prompt_vi:string;sample_en:string;rubric_vi:string};
  review_status:"DRAFT_TEACHER_REVIEW_REQUIRED";assessment_mode:"FORMATIVE_ONLY"};
type Original={title:string;overview_vi:string;decision_steps_vi:string[];
 patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string}[];
 worked_examples:{situation_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
 contrasts:{first_en:string;second_en:string;difference_vi:string}[];
 common_mistakes:{wrong:string;correct:string;why_vi:string}[]};
const authored=authoredRaw as Record<string,Authored>;
const source=sourceRaw as Record<string,Original>;
export function getM19CPublicFlow(code:string):M19GuidedFlow|null {
 if(!/^B1-\d{2}$/.test(code)||!Object.prototype.hasOwnProperty.call(authored,code)||!source[code]) return null;
 const a=authored[code],s=source[code];
 if(a.code!==code||a.review_status!=="DRAFT_TEACHER_REVIEW_REQUIRED"||a.assessment_mode!=="FORMATIVE_ONLY"||a.checkpoints.length!==3) return null;
 const steps:M19GuidedStep[]=[];
 const push=(kind:M19GuidedStep["kind"],title:string,bodyVi:string,extra:Partial<M19GuidedStep>={})=>{
  steps.push({id:`${code}-M19C-S${String(steps.length+1).padStart(2,"0")}`,kind,title,bodyVi,...extra});
 };
 const check=(i:number,title:string)=>{
  const q=a.checkpoints[i];push("check",title,
    i===0 ? `Trước tiên xác định mục đích: ${a.goal_vi}`
      : i===1 ? `Phân biệt cấu trúc dựa trên: ${s.decision_steps_vi[1] || a.contrast_cue_vi}`
      : `Hãy chọn câu thực sự mắc lỗi, theo tiêu chí: ${s.decision_steps_vi[2] || a.contrast_cue_vi}`,
    {checkId:q.id,promptVi:q.prompt_vi,options:q.options_en});
 };
 push("scenario","01 · Đọc tình huống và xác định mục tiêu",a.context_vi,{footnoteVi:a.goal_vi});
 check(0,"02 · Thử dự đoán (chưa học công thức)");
 push("explain","03 · Tìm bằng chứng trong ngữ cảnh",s.decision_steps_vi[0],{footnoteVi:s.overview_vi});
 const p1=s.patterns[0];push("rule","04 · Học một cấu trúc và cách dùng",p1.use_vi,{formula:p1.pattern,exampleEn:p1.example_en,exampleVi:p1.example_vi});
 const d1=s.worked_examples[0];push("demo","05 · Theo dõi giáo viên nghĩ thành lời",d1.situation_vi,{exampleEn:d1.answer_en,exampleVi:d1.translation_vi,explanationVi:d1.reason_vi});
 const c=s.contrasts[0];push("contrast","06 · Đối chiếu ý nghĩa, không học mẹo",a.contrast_cue_vi,{compareFirstEn:c.first_en,compareSecondEn:c.second_en,comparisonVi:c.difference_vi});
 check(1,"07 · Kiểm tra phân biệt ngữ cảnh");
 const p2=s.patterns[1];push("rule","08 · Mở rộng đúng một quy tắc",p2.use_vi,{formula:p2.pattern,exampleEn:p2.example_en,exampleVi:p2.example_vi});
 const d2=s.worked_examples[1];push("demo","09 · Xem cách giải tình huống thứ hai",d2.situation_vi,{exampleEn:d2.answer_en,exampleVi:d2.translation_vi,explanationVi:d2.reason_vi});
 const error=s.common_mistakes[0];push("mistake","10 · Tự tìm lỗi và sửa",error.why_vi,{wrongEn:error.wrong,correctEn:error.correct});
 check(2,"11 · Phát hiện lỗi tương tự");
 push("transfer","12 · Viết đoạn văn của riêng bạn",a.transfer.prompt_vi,{modelEn:a.transfer.sample_en,rubricVi:a.transfer.rubric_vi});
 push("recap","13 · Quy trình tự sử dụng khi gặp tình huống mới","Tự kiểm tra lần lượt theo ba bước:",{
   decisionSteps:s.decision_steps_vi.slice(0,3)});
 return {code,title:s.title,version:"m19c-b1-v1",reviewStatus:"DRAFT_TEACHER_REVIEW_REQUIRED",steps};
}
/** Returns only the explanation for the selected option. Never records scores, mastery or unlock. */
export function checkM19CAnswer(code:string,checkId:string,selection:number):{correct:boolean;explanationVi:string}|null {
 if(!/^B1-\d{2}$/.test(code)||!Number.isInteger(selection)||!Object.prototype.hasOwnProperty.call(authored,code)) return null;
 const a=authored[code],q=a.checkpoints.find(item=>item.id===checkId);
 if(!q||selection<0||selection>=q.options_en.length||selection>=q.option_feedback_vi.length) return null;
 return {correct:selection===q.correct_index,explanationVi:q.option_feedback_vi[selection]};
}
