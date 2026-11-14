import "server-only";
/** M19: teaching preview only. NEVER grade official Mastery here. */
import authoredRaw from "@/data/grammar-guided/a1-guided-m19.json";
import sourceRaw from "@/data/grammar-a1-m08/lessons.json";
import type { M19GuidedFlow, M19GuidedStep } from "../types";

type Check = { id: string; prompt_vi: string; options_en: string[]; correct_index: number; explanation_vi: string; option_feedback_vi: string[] };
type Authored = { code: string; context_vi: string; checkpoints: Check[]; transfer: {prompt_vi:string; sample_en:string; rubric_vi:string}; review_status:string };
type Source = { title:string; overview_vi:string; decision_steps_vi:string[];
  patterns: {pattern:string;use_vi:string;example_en:string;example_vi:string}[];
  worked_examples: {situation_vi:string;answer_en:string;translation_vi:string;reason_vi:string}[];
  common_mistakes:{wrong:string;correct:string;why_vi:string}[];
};
const authored = authoredRaw as Record<string, Authored>;
const source = sourceRaw as Record<string, Source>;

/** Only projected student-safe fields leave the server. correct_index stays server-side. */
export function getM19PublicFlow(code: string): M19GuidedFlow | null {
  if (!/^A1-\d{2}$/.test(code) || !Object.prototype.hasOwnProperty.call(authored, code) || !source[code]) return null;
  const a = authored[code], s = source[code];
  const steps:M19GuidedStep[] = [];
  function push(kind:M19GuidedStep["kind"], title:string, bodyVi:string, extras:Partial<M19GuidedStep>={}) {
    steps.push({id:`${code}-M19-S${String(steps.length+1).padStart(2,"0")}`,kind,title,bodyVi,...extras});
  }
  push("scenario", "Bắt đầu từ một tình huống", a.context_vi, { footnoteVi:"Chưa xem công thức. Hãy thử suy nghĩ xem người nói muốn diễn đạt điều gì." });
  const checks = a.checkpoints;
  push("check", "Thử dự đoán trước", "Chọn cách diễn đạt phù hợp nhất. Sai cũng không sao: bạn sẽ biết vì sao.", {checkId: checks[0].id, promptVi:checks[0].prompt_vi, options:checks[0].options_en});
  push("explain", "Tìm dấu hiệu quyết định", s.decision_steps_vi[0] || s.overview_vi, { footnoteVi: s.overview_vi });
  const first = s.patterns[0];
  if (first) push("rule", "Học đúng một quy tắc", first.use_vi, {formula:first.pattern, exampleEn:first.example_en, exampleVi:first.example_vi});
  const demo = s.worked_examples[0];
  if (demo) push("demo", "Xem giáo viên làm mẫu", demo.situation_vi, {exampleEn:demo.answer_en, exampleVi:demo.translation_vi, explanationVi:demo.reason_vi});
  const second = s.patterns[1];
  if (second) push("rule", "Mở rộng khi đã hiểu phần trước", second.use_vi, {formula:second.pattern, exampleEn:second.example_en, exampleVi:second.example_vi});
  push("check", "Thử lần hai: tránh lỗi thường gặp", "Lần này, chọn câu đúng dựa vào vai trò và ý nghĩa của cấu trúc.", {checkId:checks[1].id,promptVi:checks[1].prompt_vi, options:checks[1].options_en});
  const mistake=s.common_mistakes[0];
  if (mistake) push("mistake", "Tại sao câu sai lại sai?", mistake.why_vi, {wrongEn:mistake.wrong,correctEn:mistake.correct});
  push("transfer", "Đến lượt bạn tự tạo câu", a.transfer.prompt_vi, {modelEn:a.transfer.sample_en,rubricVi:a.transfer.rubric_vi});
  push("recap", "Tóm lại để dùng được", "Khi gặp một câu mới, hãy tự hỏi theo thứ tự:", {decisionSteps:s.decision_steps_vi.slice(0,3)});
  return { code, title:s.title,version:"m19-a1-v1",reviewStatus:"DRAFT_TEACHER_REVIEW_REQUIRED", steps };
}

export function checkM19Answer(code: string, checkId:string, selection:number): {correct:boolean;explanationVi:string} | null {
  if (!/^A1-\d{2}$/.test(code) || !Number.isInteger(selection)) return null;
  const a=authored[code];
  if (!a) return null;
  const check = a.checkpoints.find(c=>c.id===checkId);
  if (!check || selection<0 || selection>=check.options_en.length) return null;
  return { correct:selection === check.correct_index, explanationVi:check.option_feedback_vi?.[selection] ?? check.explanation_vi };
}
