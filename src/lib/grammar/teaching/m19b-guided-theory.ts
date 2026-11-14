import "server-only";
/** M19B: A2 scaffolded theory, draft-only. No assessment or unlock writes. */
import authoredRaw from "@/data/grammar-guided/a2-guided-m19b.json";
import sourceRaw from "@/data/grammar-a2-m09/lessons.json";
import type { M19GuidedFlow, M19GuidedStep } from "../types";

type Check = {
  id:string; prompt_vi:string; options_en:string[];
  correct_index:number; option_feedback_vi:string[];
};
type Lesson = {
  code:string; context_vi:string; contrast_cue_vi:string; checkpoints:Check[];
  transfer:{prompt_vi:string;sample_en:string;rubric_vi:string};
  review_status:"DRAFT_TEACHER_REVIEW_REQUIRED";
};
type Content = {
  title:string;overview_vi:string;decision_steps_vi:string[];
  patterns:{pattern:string;use_vi:string;example_en:string;example_vi:string}[];
  worked_examples:{situation_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
  contrasts:{first_en:string;second_en:string;difference_vi:string}[];
  common_mistakes:{wrong:string;correct:string;why_vi:string}[];
};
const authored = authoredRaw as Record<string,Lesson>;
const source = sourceRaw as Record<string,Content>;

export function getM19BPublicFlow(code:string): M19GuidedFlow|null {
  if (!/^A2-\d{2}$/.test(code) || !Object.prototype.hasOwnProperty.call(authored,code) || !source[code]) return null;
  const a=authored[code], s=source[code];
  if (a.code!==code || a.review_status!=="DRAFT_TEACHER_REVIEW_REQUIRED" || a.checkpoints.length!==3) return null;
  const steps:M19GuidedStep[]=[];
  const push=(kind:M19GuidedStep["kind"],title:string,bodyVi:string,extras:Partial<M19GuidedStep>={})=>{
    steps.push({id:`${code}-M19B-S${String(steps.length+1).padStart(2,"0")}`,kind,title,bodyVi,...extras});
  };
  const check=(i:number,title:string)=>{
    const q=a.checkpoints[i];
    const prompt = i === 0 ? `Trước khi xem công thức, xác định tình huống: ${a.context_vi}`
      : i === 1 ? `Tự vận dụng tiêu chí thứ hai: ${s.decision_steps_vi[1] || a.contrast_cue_vi}`
      : `Tránh lỗi thường gặp khi áp dụng: ${s.decision_steps_vi[2] || a.contrast_cue_vi}`;
    push("check",title,prompt,{
      checkId:q.id,promptVi:q.prompt_vi,options:q.options_en
    });
  };
  push("scenario","Tình huống trước, công thức sau",a.context_vi,{
    footnoteVi:"Hãy tự đặt mình vào tình huống. Bạn đang nói về thời gian, mức độ, lời khuyên hay điều kiện?"
  });
  check(0,"Thử dự đoán");
  push("explain","Bước 1 · Tìm tín hiệu quyết định",s.decision_steps_vi[0] || s.overview_vi,{
    footnoteVi:s.overview_vi
  });
  const first=s.patterns[0];
  if(first) push("rule","Bước 2 · Học một quy tắc",first.use_vi,{
    formula:first.pattern,exampleEn:first.example_en,exampleVi:first.example_vi
  });
  const demo=s.worked_examples[0];
  if(demo) push("demo","Bước 3 · Giáo viên làm mẫu",demo.situation_vi,{
    exampleEn:demo.answer_en,exampleVi:demo.translation_vi,explanationVi:demo.reason_vi
  });
  const compare=s.contrasts[0];
  if(compare) push("contrast","Bước 4 · So sánh hai cách nói",a.contrast_cue_vi,{
    compareFirstEn:compare.first_en,compareSecondEn:compare.second_en,comparisonVi:compare.difference_vi
  });
  check(1,"Bước 5 · Tự phân biệt");
  const second=s.patterns[1];
  if(second) push("rule","Bước 6 · Mở rộng quy tắc",second.use_vi,{
    formula:second.pattern,exampleEn:second.example_en,exampleVi:second.example_vi
  });
  const error=s.common_mistakes[0];
  if(error) push("mistake","Bước 7 · Tìm và sửa lỗi",error.why_vi,{
    wrongEn:error.wrong,correctEn:error.correct
  });
  check(2,"Bước 8 · Kiểm tra đã hiểu");
  push("transfer","Bước 9 · Bạn tự tạo câu",a.transfer.prompt_vi,{
    modelEn:a.transfer.sample_en,rubricVi:a.transfer.rubric_vi
  });
  push("recap","Bước 10 · Quy trình tự lựa chọn", "Khi gặp một câu mới, hãy tự hỏi lần lượt:",{
    decisionSteps:s.decision_steps_vi.slice(0,3)
  });
  return {code,title:s.title,version:"m19b-a2-v1",reviewStatus:"DRAFT_TEACHER_REVIEW_REQUIRED",steps};
}

/** Only responds with the rationale for the selected option. Do not award Mastery credit. */
export function checkM19BAnswer(code:string,checkId:string,selection:number):{correct:boolean;explanationVi:string}|null {
  if(!/^A2-\d{2}$/.test(code) || !Number.isInteger(selection) || !Object.prototype.hasOwnProperty.call(authored,code)) return null;
  const a=authored[code];
  const q=a.checkpoints.find(item=>item.id===checkId);
  if(!q || selection<0 || selection>=q.options_en.length || selection>=q.option_feedback_vi.length) return null;
  return {correct:selection===q.correct_index,explanationVi:q.option_feedback_vi[selection]};
}
