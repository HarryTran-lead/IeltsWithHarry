import "server-only";
/** M19E: 30 C1 step-by-step DRAFT, formative only, server-side answer keys. */
import authoredRaw from "@/data/grammar-guided/c1-guided-m19e.json";
import sourceRaw from "@/data/grammar-c1-m12/lessons.json";
import type { M19GuidedFlow, M19GuidedStep } from "../types";

type Check={id:string;prompt_vi:string;options_en:string[];correct_index:number;option_feedback_vi:string[];focus:string};
type Authored={code:string;title:string;context_vi:string;goal_vi:string;contrast_cue_vi:string;
  checkpoints:Check[];transfer:{prompt_vi:string;sample_en:string;rubric_vi:string};
  review_status:"DRAFT_TEACHER_REVIEW_REQUIRED";assessment_mode:"FORMATIVE_ONLY"};
type Source={title:string;overview_vi:string;decision_steps_vi:string[];
  patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string}[];
  worked_examples:{context_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
  contrast:{first_en:string;second_en:string;difference_vi:string};
  discourse_transfer:{context_vi:string;task_en:string;model_paragraph_en:string;coaching_vi:string};
  common_mistakes:{wrong:string;correct:string;why_vi:string}[]};
const authored=authoredRaw as Record<string,Authored>;
const source=sourceRaw as Record<string,Source>;

/** GET: no correct_index, option_feedback_vi, answer key or review decision exposed. */
export function getM19EPublicFlow(code:string):M19GuidedFlow|null {
  if(!/^C1-\d{2}$/.test(code)||!Object.prototype.hasOwnProperty.call(authored,code)||!source[code])return null;
  const a=authored[code],s=source[code];
  if(a.code!==code||a.review_status!=="DRAFT_TEACHER_REVIEW_REQUIRED"||a.assessment_mode!=="FORMATIVE_ONLY"||a.checkpoints.length!==3||s.patterns.length<2||s.common_mistakes.length<2)return null;
  const steps:M19GuidedStep[]=[];
  const push=(kind:M19GuidedStep["kind"],title:string,bodyVi:string,extra:Partial<M19GuidedStep>={})=>{
    steps.push({id:`${code}-M19E-S${String(steps.length+1).padStart(2,"0")}`,kind,title,bodyVi,...extra});
  };
  const check=(i:number,title:string)=>{const q=a.checkpoints[i];
    push("check",title,i===0 ? `Định hướng mục đích trước khi xem quy tắc: ${a.goal_vi}`
      : i===1 ? `Xem xét sự khác biệt về sắc thái: ${a.contrast_cue_vi}`
      : `Sửa mà không làm đổi ý: ${s.decision_steps_vi[2] || a.goal_vi}`,
      {checkId:q.id,promptVi:q.prompt_vi,options:q.options_en});};
  push("scenario","01 · Xác định người đọc và mục đích lập luận",a.context_vi,{footnoteVi:a.goal_vi});
  check(0,"02 · Quyết định trước khi xem cấu trúc");
  push("explain","03 · Chọn trọng tâm và mức độ chắc chắn",s.decision_steps_vi[0],{footnoteVi:s.overview_vi});
  const p1=s.patterns[0];
  push("rule","04 · Học cấu trúc thứ nhất trong ngữ cảnh",p1.use_vi,{formula:p1.pattern,exampleEn:p1.example_en,exampleVi:p1.example_vi});
  const d=s.worked_examples[0];
  push("demo","05 · Theo dõi lời giải có bằng chứng",d.context_vi,{exampleEn:d.answer_en,exampleVi:d.translation_vi,explanationVi:d.reason_vi});
  const c=s.contrast;
  push("contrast","06 · So sánh tác động của hai cách diễn đạt",a.contrast_cue_vi,{compareFirstEn:c.first_en,compareSecondEn:c.second_en,comparisonVi:c.difference_vi});
  check(1,"07 · Chọn cách diễn đạt theo sắc thái");
  const p2=s.patterns[1];
  push("rule","08 · Mở rộng cấu trúc nhưng không đổi nghĩa",p2.use_vi,{formula:p2.pattern,exampleEn:p2.example_en,exampleVi:p2.example_vi});
  push("explain","09 · Kiểm tra tác nhân, phạm vi và bằng chứng",s.decision_steps_vi[1],{footnoteVi:s.decision_steps_vi[2]});
  push("demo","10 · Quan sát một đoạn văn học thuật",s.discourse_transfer.context_vi,
    {exampleEn:s.discourse_transfer.model_paragraph_en,explanationVi:s.discourse_transfer.coaching_vi});
  const mistake=s.common_mistakes[1];
  push("mistake","11 · Phân tích một lỗi thật trong dữ liệu",mistake.why_vi,{wrongEn:mistake.wrong,correctEn:mistake.correct});
  check(2,"12 · Tự sửa lỗi theo ý nghĩa câu");
  push("transfer","13 · Biên tập và viết đoạn văn của bạn",a.transfer.prompt_vi,
    {modelEn:a.transfer.sample_en,rubricVi:a.transfer.rubric_vi});
  push("explain","14 · Tự phản biện trước khi hoàn thành",a.transfer.rubric_vi,
    {footnoteVi:"Câu mẫu không phải đáp án duy nhất. Nếu cách viết của bạn giữ đúng thông tin và giải thích hợp lý, hãy ghi chú để giáo viên phản hồi."});
  push("recap","15 · Quy trình quyết định ngữ pháp C1","Trước mỗi đoạn văn mới, tự hỏi lần lượt:",
    {decisionSteps:s.decision_steps_vi.slice(0,3)});
  return {code,title:s.title,version:"m19e-c1-v1",reviewStatus:"DRAFT_TEACHER_REVIEW_REQUIRED",steps};
}
/** POST: returns only selected option's rationale. No persistent score/mastery/unlock writes. */
export function checkM19EAnswer(code:string,checkId:string,selection:number):{correct:boolean;explanationVi:string}|null {
  if(!/^C1-\d{2}$/.test(code)||!Number.isInteger(selection)||!Object.prototype.hasOwnProperty.call(authored,code))return null;
  const a=authored[code],q=a.checkpoints.find(x=>x.id===checkId);
  if(!q||selection<0||selection>=q.options_en.length||selection>=q.option_feedback_vi.length)return null;
  return {correct:selection===q.correct_index,explanationVi:q.option_feedback_vi[selection]};
}
