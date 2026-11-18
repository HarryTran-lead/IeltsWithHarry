"use client";
import { useState } from "react";
import type { M19GuidedFlow } from "@/lib/grammar/types";

type Feedback = {selection:number; correct:boolean; explanationVi:string};
export function GuidedTheoryPlayer({ flow, onPractice }: { flow:M19GuidedFlow; onPractice:()=>void }) {
  const [position,setPosition]=useState(0);
  const [answers,setAnswers]=useState<Record<string,Feedback>>({});
  const [selection,setSelection]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [draft,setDraft]=useState("");
  const [revealed,setRevealed]=useState(false);
  const step=flow.steps[position];
  const feedback=step.checkId ? answers[step.checkId] : undefined;
  const isCheck=step.kind==="check";
  const canContinue = step.kind==="transfer" ? revealed : !isCheck || feedback?.correct===true;
  const last = position === flow.steps.length - 1;
  const done = Object.values(answers).filter(x=>x.correct).length;
  const total = flow.steps.filter(x=>x.kind==="check").length;
  function jump(to:number) { setPosition(to); setSelection(null); setError(""); }
  async function answer() {
    if (!isCheck || !step.checkId || selection===null || busy) return;
    setBusy(true); setError("");
    try {
      const response=await fetch("/api/grammar/guided-check",{
        method:"POST", headers:{"Content-Type":"application/json"}, cache:"no-store",
        body:JSON.stringify({code:flow.code,checkId:step.checkId,selection}),
      });
      if (!response.ok) throw Error("Không kiểm tra được câu trả lời. Hãy thử lại.");
      const value=await response.json() as {correct:boolean;explanationVi:string};
      setAnswers(previous=>({...previous,[step.checkId!]:{selection,correct:value.correct,explanationVi:value.explanationVi}}));
    } catch (cause) { setError(cause instanceof Error ? cause.message:"Lỗi kiểm tra."); }
    finally {setBusy(false);}
  }
  return <div className="gg-m19-shell">
    <div className="gg-m19-meta" role="status">BẢN HỌC THỬ · CHỜ GIÁO VIÊN DUYỆT · KHÔNG TÍNH ĐIỂM MASTERY</div>
    <header className="gg-m19-top">
      <div><strong>Học từng bước</strong><p>{flow.code} · {flow.title}</p></div>
      <span>Bước {position+1}/{flow.steps.length}</span>
    </header>
    <div className="gg-m19-meter" role="progressbar" aria-label="Tiến độ bài giảng" aria-valuenow={position+1} aria-valuemin={1} aria-valuemax={flow.steps.length}>
      <span style={{width:`${(position+1)/flow.steps.length*100}%`}}/>
    </div>
    <article className="gg-m19-card" key={step.id}>
      <span className="gg-m19-phase">{step.kind==="check"?"Bạn thử làm":step.kind==="rule"?"Quy tắc ngắn":step.kind==="demo"?"Làm mẫu từng bước":step.kind==="contrast"?"So sánh theo ý nghĩa":step.kind==="mistake"?"Tìm lỗi":step.kind==="transfer"?"Tự tạo câu":step.kind==="recap"?"Ghi nhớ": "Hướng dẫn"}</span>
      <h2>{step.title}</h2>
      <p className="gg-m19-body">{step.bodyVi}</p>
      {step.footnoteVi && <p className="gg-m19-hint">{step.footnoteVi}</p>}
      {step.formula && <div className="gg-m19-formula"><span>Cách dùng</span><strong>{step.formula}</strong></div>}
      {step.exampleEn && <div className="gg-m19-example"><strong>{step.exampleEn}</strong>{step.exampleVi && <p>{step.exampleVi}</p>}{step.explanationVi && <p><b>Vì sao?</b> {step.explanationVi}</p>}</div>}
      {step.kind==="contrast" && <div className="gg-m19-compare"><p><b>Cách 1:</b> {step.compareFirstEn}</p><p><b>Cách 2:</b> {step.compareSecondEn}</p><p><strong>Khác nhau ở đâu?</strong> {step.comparisonVi}</p></div>}
      {step.kind==="mistake" && <div className="gg-m19-example"><p><b>Chưa đúng:</b> <s>{step.wrongEn}</s></p><p><b>Sửa:</b> {step.correctEn}</p></div>}
      {step.kind==="check" && <>
        <p className="gg-m19-prompt">{step.promptVi}</p>
        <div className="gg-m19-choices" role="group" aria-label={step.promptVi}>
          {step.options?.map((value,i)=><button key={i} type="button" disabled={busy || Boolean(feedback?.correct)}
            className={(selection===i || (selection===null && feedback?.selection===i))?"gg-m19-picked":""}
            aria-pressed={selection===i}
            onClick={()=>{setSelection(i);setError("");}}>{String.fromCharCode(65+i)}. {value}</button>)}
        </div>
        <button type="button" className="gg-m19-check" disabled={selection===null || busy || Boolean(feedback?.correct)} onClick={()=>void answer()}>{busy?"Đang kiểm tra…":"Kiểm tra câu trả lời"}</button>
        {feedback && <div className={feedback.correct?"gg-m19-feedback is-right":"gg-m19-feedback is-wrong"} role="status">
          <strong>{feedback.correct?"Đúng rồi. Bạn đã nhận ra quy tắc!":"Chưa đúng. Hãy xem lý do và chọn lại."}</strong>
          <p>{feedback.explanationVi}</p>
        </div>}
      </>}
      {step.kind==="transfer" && <>
        <label className="gg-m19-input-label" htmlFor="gg-m19-transfer">Tự viết câu tiếng Anh của bạn</label>
        <textarea id="gg-m19-transfer" rows={3} value={draft} onChange={e=>{setDraft(e.target.value);setRevealed(false)}} placeholder="Viết câu trước khi xem câu mẫu…"/>
        <button type="button" className="gg-m19-check" disabled={draft.trim().length<10} onClick={()=>setRevealed(true)}>Tự đối chiếu với câu mẫu</button>
        {revealed && <div className="gg-m19-example" role="status"><strong>Một cách diễn đạt tham khảo (không phải đáp án duy nhất)</strong><p>{step.modelEn}</p><strong>Tự kiểm tra</strong><p>{step.rubricVi}</p><p>Đây là tự đối chiếu; hệ thống không chấm đúng/sai hoặc tính điểm thành thạo.</p></div>}
      </>}
      {step.kind==="recap" && <ol className="gg-m19-recap">{step.decisionSteps?.map((x,i)=><li key={i}>{x}</li>)}</ol>}
      {error && <p className="gg-m19-error" role="alert">{error}</p>}
    </article>
    <nav className="gg-m19-nav" aria-label="Điều hướng từng bước">
      <button type="button" disabled={position===0} onClick={()=>jump(position-1)}>Bước trước</button>
      {last ? <button type="button" className="gg-m19-next" onClick={onPractice} disabled={done!==total || !revealed}>Chuyển sang luyện tập</button>
        : <button type="button" className="gg-m19-next" disabled={!canContinue} onClick={()=>jump(position+1)}>Hiểu rồi · Tiếp tục</button>}
    </nav>
    <p className="gg-m19-progress-note">Đã trả lời đúng {done}/{total} câu kiểm tra ngắn. Đây chỉ là bài học thử, không cấp quyền mở khóa.</p>
  </div>;
}
