import "server-only";
/** M19D: guided Grammar B2, teacher-review DRAFT, formative only. */
import authoredRaw from "@/data/grammar-guided/b2-guided-m19d.json";
import sourceRaw from "@/data/grammar-b2-m11/lessons.json";
import type { M19GuidedFlow, M19GuidedStep } from "../types";

type Check={id:string;prompt_vi:string;options_en:string[];correct_index:number;option_feedback_vi:string[];focus:string};
type Authored={code:string;title:string;context_vi:string;goal_vi:string;contrast_cue_vi:string;
 checkpoints:Check[];transfer:{prompt_vi:string;sample_en:string;rubric_vi:string};
 review_status:"DRAFT_TEACHER_REVIEW_REQUIRED";assessment_mode:"FORMATIVE_ONLY"};
type Source={title:string;overview_vi:string;decision_steps_vi:string[];
 patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string}[];
 worked_examples:{context_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
 contrast:{first_en:string;second_en:string;difference_vi:string};
 paragraph_transfer:{context_vi:string;task_en:string;model_paragraph_en:string;coaching_vi:string}};
const authored=authoredRaw as Record<string,Authored>;
const source=sourceRaw as Record<string,Source>;

/** Public GET contains prompts/options but never the answer index or per-option grading rationale. */
export function getM19DPublicFlow(code:string):M19GuidedFlow|null {
 if (!/^B2-\d{2}$/.test(code)||!Object.prototype.hasOwnProperty.call(authored,code)||!source[code])return null;
 const a=authored[code],s=source[code];
 if(a.code!==code||a.review_status!=="DRAFT_TEACHER_REVIEW_REQUIRED"||a.assessment_mode!=="FORMATIVE_ONLY"||a.checkpoints.length!==3)return null;
 if(s.patterns.length<2||s.worked_examples.length<1)return null;
 const steps:M19GuidedStep[]=[];
 const push=(kind:M19GuidedStep["kind"],title:string,bodyVi:string,extras:Partial<M19GuidedStep>={})=>{
  steps.push({id:`${code}-M19D-S${String(steps.length+1).padStart(2,"0")}`,kind,title,bodyVi,...extras});
 };
 const check=(index:number,title:string)=>{const q=a.checkpoints[index];
  const instruction = index===0 ? `Bắt đầu từ mục đích: ${a.goal_vi}`
    : index===1 ? `Đánh giá điều được phép suy luận: ${s.decision_steps_vi[1] || a.contrast_cue_vi}`
    : `Trước khi sửa, soát lại: ${s.decision_steps_vi[2] || a.goal_vi}`;
  push("check",title,instruction,
   {checkId:q.id,promptVi:q.prompt_vi,options:q.options_en});};
 push("scenario","01 · Đọc tình huống và xác định ý định",a.context_vi,{footnoteVi:a.goal_vi});
 check(0,"02 · Thử giải trước khi xem công thức");
 push("explain","03 · Xác định bằng chứng và thời điểm",s.decision_steps_vi[0]||s.overview_vi,{footnoteVi:s.overview_vi});
 const p1=s.patterns[0];
 push("rule","04 · Học cấu trúc thứ nhất",p1.use_vi,{formula:p1.pattern,exampleEn:p1.example_en,exampleVi:p1.example_vi});
 const d1=s.worked_examples[0];
 push("demo","05 · Giáo viên giải mẫu và lý giải",d1.context_vi,{exampleEn:d1.answer_en,exampleVi:d1.translation_vi,explanationVi:d1.reason_vi});
 const c=s.contrast;
 push("contrast","06 · Hai câu đúng cấu trúc nhưng khác nghĩa",a.contrast_cue_vi,
  {compareFirstEn:c.first_en,compareSecondEn:c.second_en,comparisonVi:c.difference_vi});
 check(1,"07 · Chọn câu giữ đúng mức độ chắc chắn");
 const p2=s.patterns[1];
 push("rule","08 · Mở rộng cấu trúc thứ hai",p2.use_vi,{formula:p2.pattern,exampleEn:p2.example_en,exampleVi:p2.example_vi});
 push("demo","09 · Quan sát đoạn văn ứng dụng",`Đọc yêu cầu vận dụng và soát bản mẫu: ${s.paragraph_transfer.task_en}`,
  {exampleEn:s.paragraph_transfer.model_paragraph_en,explanationVi:s.paragraph_transfer.coaching_vi});
 push("explain","10 · Kiểm tra tác nhân và điểm nhìn",s.decision_steps_vi[1]||s.overview_vi,
  {footnoteVi:"Khi biến đổi câu, đừng đổi sự kiện, người thực hiện hành động hay mức độ chắc chắn chỉ để dùng cấu trúc phức."});
 const q=a.checkpoints[2]; const wrongIndex=q.options_en.findIndex((_,i)=>i!==q.correct_index);
 push("mistake","11 · Mổ xẻ một đáp án gây nhiễu",q.option_feedback_vi[wrongIndex],
  {wrongEn:q.options_en[wrongIndex],correctEn:q.options_en[q.correct_index]});
 check(2,"12 · Tự sửa câu trong tình huống mới");
 push("transfer","13 · Viết đoạn văn và tự đối chiếu",a.transfer.prompt_vi,
  {modelEn:a.transfer.sample_en,rubricVi:a.transfer.rubric_vi});
 push("recap","14 · Ba câu hỏi tự kiểm tra khi viết B2","Trước khi dùng cấu trúc này trong bài nói/viết, hãy tự kiểm tra:",
  {decisionSteps:s.decision_steps_vi.slice(0,3)});
 return {code,title:s.title,version:"m19d-b2-v1",reviewStatus:"DRAFT_TEACHER_REVIEW_REQUIRED",steps};
}
/** Formative checkpoint response. Does not persist scores, mastery, unlocks or publication. */
export function checkM19DAnswer(code:string,checkId:string,selection:number):{correct:boolean;explanationVi:string}|null{
 if(!/^B2-\d{2}$/.test(code)||!Number.isInteger(selection)||!Object.prototype.hasOwnProperty.call(authored,code))return null;
 const a=authored[code];const q=a.checkpoints.find(x=>x.id===checkId);
 if(!q||selection<0||selection>=q.options_en.length||selection>=q.option_feedback_vi.length)return null;
 return {correct:selection===q.correct_index,explanationVi:q.option_feedback_vi[selection]};
}
