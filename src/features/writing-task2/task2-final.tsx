"use client";
/*
 * R16 final assessment and the learner's mistake log. A paper's prompt stays on the server until the learner
 * starts it; the 40-minute clock runs from that first start. After submitting, the learner self-reviews with the
 * 0–3 evidence rubric, then sees idea guidance and a model essay of the same type, rewrites, and logs mistakes,
 * which come back for review after 1, 3, 7 and 14 days.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BookOpenCheck, Check, ClipboardList, Eye, Languages, Lock, NotebookPen, Play, RotateCcw, Save, Send, Timer, Trash2 } from "lucide-react";
import {
  criteria, criterionNames, finalSubmitted, mistakeDue, newMistake, reviewMistake,
  type Criterion, type FinalAttempt, type FinalBundle, type FinalPaper, type FinalPrompt, type FinalReview, type MistakeEntry,
} from "@/lib/writing-task2/final-types";
import { countWords, questionTypeLabels } from "@/lib/writing-task2/types";
import { fetchFinalBundle, loadFinalAttempts, loadMistakes, removeMistake, reviewFinal, saveFinalAttempt, saveMistake, startFinal } from "./course-state";
import { withTerms } from "./task2-text";

export type MistakePrefill = Partial<Pick<MistakeEntry, "criterion" | "original_excerpt" | "revised_excerpt" | "why_vi" | "source">>;
const typeLabel = (type: string) => questionTypeLabels[type] ?? type;
/** The current time, read in handlers and timers (never while rendering). */
const stamp = () => Date.now();
const clock = (seconds: number) => `${Math.floor(Math.abs(seconds) / 60)}:${String(Math.abs(seconds) % 60).padStart(2, "0")}`;

/** Loads the learner-safe final bundle once for both screens. */
export function useFinalBundle() {
  const [bundle, setBundle] = useState<FinalBundle | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void fetchFinalBundle().then((data) => { if (alive) setBundle(data); }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài thi."); });
    return () => { alive = false; };
  }, []);
  return { bundle, error };
}

/* ───────────── Final assessment ───────────── */

export function FinalAssessment({ bundle, onLogMistake }: { bundle: FinalBundle; onLogMistake: (prefill: MistakePrefill) => void }) {
  const [attempts, setAttempts] = useState<Record<string, FinalAttempt>>({});
  const [active, setActive] = useState<FinalPaper | null>(null);
  const [prompt, setPrompt] = useState<FinalPrompt | null>(null);
  const [confirming, setConfirming] = useState<FinalPaper | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(stamp);

  useEffect(() => {
    const tick = setInterval(() => setNow(stamp()), 30_000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    let alive = true;
    void loadFinalAttempts().then((saved) => { if (alive) setAttempts(saved); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  async function open(paper: FinalPaper) {
    setBusy(true); setError("");
    try {
      const started = await startFinal(paper.id);
      const existing = attempts[paper.id];
      const attempt: FinalAttempt = existing ?? { f: 1, startedAt: started.startedAt, essay: "", review: {}, evidence: {}, updatedAt: stamp() };
      if (!existing) { await saveFinalAttempt(paper.id, attempt).catch(() => undefined); setAttempts((current) => ({ ...current, [paper.id]: attempt })); }
      setPrompt(started.prompt); setActive(paper); setConfirming(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa mở được đề."); }
    finally { setBusy(false); }
  }

  if (active && prompt) return <FinalPaperView paper={active} prompt={prompt} bundle={bundle} attempt={attempts[active.id]}
    onChange={(attempt) => setAttempts((current) => ({ ...current, [active.id]: attempt }))}
    onBack={() => { setActive(null); setPrompt(null); }} onLogMistake={onLogMistake}/>;

  const submitted = Object.values(attempts).filter((attempt) => finalSubmitted(attempt)).length;
  return <section className="t2-panel">
    <span className="ll-kicker">Bài thi cuối khoá · {bundle.papers.length} đề</span>
    <h2>Mỗi dạng đề một bài, 40 phút</h2>
    <p className="t2-lead">Đề chỉ hiện khi bạn bấm bắt đầu, và đồng hồ chạy ngay từ lúc đó. Gợi ý ý tưởng và bài mẫu cùng dạng mở sau khi bạn nộp bài từ 100 từ trở lên. Sau đó bạn tự chấm theo 4 tiêu chí, viết lại và ghi lỗi vào sổ.</p>
    {bundle.rubric.pass_vi && <p className="t2-target"><BookOpenCheck size={15}/><span><b>Điều kiện hoàn thành:</b> {bundle.rubric.pass_vi}</span></p>}
    {error && <p className="ll-error" role="alert">{error}</p>}
    <ol className="t2-papers">{bundle.papers.map((paper, i) => {
      const attempt = attempts[paper.id];
      const done = finalSubmitted(attempt);
      const elapsed = attempt ? Math.round((now - Date.parse(attempt.startedAt)) / 1000) : 0;
      return <li key={paper.id} className={done ? "is-done" : attempt ? "is-started" : ""}>
        <span className="t2-step-num">{done ? <Check size={14} strokeWidth={3}/> : i + 1}</span>
        <div><b>Đề {i + 1} · {typeLabel(paper.question_type)}</b><small>{paper.time_limit} phút · tối thiểu {paper.min_words} từ · {done ? `đã nộp ${countWords(attempt!.essay)} từ` : attempt ? (elapsed < paper.time_limit * 60 ? `đang làm, còn ${clock(paper.time_limit * 60 - elapsed)}` : "đã hết giờ, chưa nộp") : "chưa làm"}</small></div>
        <button type="button" className={`ll-btn ${attempt ? "" : "ll-btn-primary"}`} disabled={busy} onClick={() => (attempt ? void open(paper) : setConfirming(paper))}>
          {done ? <><Eye size={15}/> Xem lại</> : attempt ? <><Play size={15}/> Tiếp tục</> : <><Lock size={15}/> Bắt đầu</>}
        </button>
      </li>;
    })}</ol>
    <p className="t2-soft">Đã nộp {submitted}/{bundle.papers.length} đề. Thang tự chấm 0–3 là bằng chứng nội bộ, không quy đổi sang band IELTS.</p>
    {confirming && <div className="t2-confirm" role="alertdialog" aria-labelledby="t2-confirm-title">
      <AlertTriangle size={18}/>
      <div><b id="t2-confirm-title">Bắt đầu Đề {bundle.papers.indexOf(confirming) + 1} · {typeLabel(confirming.question_type)}?</b>
        <p>Đồng hồ {confirming.time_limit} phút chạy ngay và không dừng được. Hãy chuẩn bị chỗ yên tĩnh, không xem tài liệu.</p>
        <div className="t2-row"><button type="button" className="ll-btn" onClick={() => setConfirming(null)}>Để sau</button><button type="button" className="ll-btn ll-btn-primary" disabled={busy} onClick={() => void open(confirming)}><Play size={15}/> Bắt đầu tính giờ</button></div>
      </div>
    </div>}
  </section>;
}

type PaperProps = {
  paper: FinalPaper; prompt: FinalPrompt; bundle: FinalBundle; attempt?: FinalAttempt;
  onChange: (attempt: FinalAttempt) => void; onBack: () => void; onLogMistake: (prefill: MistakePrefill) => void;
};

function FinalPaperView({ paper, prompt, bundle, attempt, onChange, onBack, onLogMistake }: PaperProps) {
  const [now, setNow] = useState(stamp);
  const [vi, setVi] = useState(false);
  const [review, setReview] = useState<FinalReview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current: FinalAttempt = attempt ?? { f: 1, startedAt: new Date(now).toISOString(), essay: "", review: {}, evidence: {}, updatedAt: 0 };
  const done = Boolean(current.submittedAt);
  const words = countWords(current.essay);
  const left = paper.time_limit * 60 - Math.round((now - Date.parse(current.startedAt)) / 1000);

  useEffect(() => {
    if (done) return;
    const tick = setInterval(() => setNow(stamp()), 1000);
    return () => clearInterval(tick);
  }, [done]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!done || review) return;
    let alive = true;
    void reviewFinal(paper.id, current.essay).then((data) => { if (alive) setReview(data); }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Chưa mở được nhận xét."); });
    return () => { alive = false; };
  }, [done, review, paper.id, current.essay]);

  function update(change: Partial<FinalAttempt>, immediate = false) {
    const next = { ...current, ...change, updatedAt: stamp() };
    onChange(next);
    if (timer.current) clearTimeout(timer.current);
    const persist = () => void saveFinalAttempt(paper.id, next).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Chưa lưu được."));
    if (immediate) persist(); else timer.current = setTimeout(persist, 2500);
    return next;
  }

  async function submit() {
    if (words < paper.min_words && !window.confirm(`Bài mới có ${words}/${paper.min_words} từ. Vẫn nộp?`)) return;
    setBusy(true); setError("");
    const next = { ...current, submittedAt: new Date(stamp()).toISOString(), updatedAt: stamp() };
    onChange(next);
    try { await saveFinalAttempt(paper.id, next); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa lưu được."); }
    finally { setBusy(false); }
  }

  return <section className="t2-panel t2-exam">
    <div className="t2-panel-head">
      <button type="button" className="t2-link-btn" onClick={onBack}><ArrowLeft size={14}/> Danh sách đề</button>
      {!done && <p className={`t2-timer ${left <= 0 ? "is-over" : left < 300 ? "is-low" : ""}`} role="timer"><Timer size={14}/> {left > 0 ? `Còn ${clock(left)}` : `Quá giờ ${clock(left)}`}</p>}
    </div>
    <span className="ll-kicker">Đề {bundle.papers.indexOf(paper) + 1} · {typeLabel(paper.question_type)} · {paper.time_limit} phút · tối thiểu {paper.min_words} từ</span>
    <div className="t2-prompt-box">
      <div className="t2-panel-head"><span className="ll-kicker">Đề</span>{prompt.prompt_vi && <button type="button" className="t2-link-btn" onClick={() => setVi(!vi)}><Languages size={14}/> {vi ? "Ẩn bản dịch" : "Xem bản dịch"}</button>}</div>
      <p lang="en">{prompt.prompt_en}</p>
      {vi && prompt.prompt_vi && <p className="t2-vi">{prompt.prompt_vi}</p>}
    </div>
    {error && <p className="ll-error" role="alert">{error}</p>}

    {!done ? <>
      <textarea className="t2-text t2-essay-text" lang="en" rows={16} value={current.essay} aria-label="Bài thi" placeholder="Lập dàn ý 5 phút, viết 30 phút, chừa 5 phút đọc lại…"
        onChange={(event) => update({ essay: event.target.value })}/>
      <div className="t2-row">
        <span className={`t2-words ${words >= paper.min_words ? "is-good" : words >= paper.min_words * 0.6 ? "is-fair" : ""}`}><b>{words}</b> / {paper.min_words} từ</span>
        <button type="button" className="ll-btn ll-btn-primary" disabled={busy || !current.essay.trim()} onClick={() => void submit()}><Send size={15}/> Nộp bài</button>
      </div>
    </> : <>
      <details className="t2-more" open={!review}><summary>Bài bạn đã nộp · {words} từ</summary><div className="t2-example-text" lang="en">{current.essay.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div></details>

      <div className="t2-rubric">
        <h3><ClipboardList size={17}/> Tự chấm theo 4 tiêu chí (0–3)</h3>
        {bundle.rubric.dimensions.map((dimension) => <fieldset key={dimension.id}>
          <legend><span className="t2-criterion">{dimension.id}</span> {criterionNames[dimension.id]}</legend>
          <p>{withTerms(dimension.question_vi)}</p>
          <ul>{dimension.evidence_vi.map((evidence) => { const key = `${dimension.id}:${evidence}`; return <li key={key}><label>
            <input type="checkbox" checked={Boolean(current.evidence[key])} onChange={(event) => update({ evidence: { ...current.evidence, [key]: event.target.checked } })}/> <span>{withTerms(evidence)}</span>
          </label></li>; })}</ul>
          <div className="t2-levels" role="radiogroup" aria-label={`Mức ${dimension.id}`}>{bundle.rubric.levels.map((level) =>
            <button key={level.level} type="button" role="radio" aria-checked={current.review[dimension.id] === level.level} title={level.vi} onClick={() => update({ review: { ...current.review, [dimension.id]: level.level } })}>{level.level}</button>)}
            <small>{bundle.rubric.levels.find((level) => level.level === current.review[dimension.id])?.vi ?? "Chọn mức có bằng chứng trong bài"}</small>
          </div>
          {dimension.repair_vi && <p className="t2-soft"><b>Cách sửa:</b> {withTerms(dimension.repair_vi)}</p>}
        </fieldset>)}
      </div>

      {review ? <div className="t2-final-review">
        {review.requirement_vi && <p className="t2-target"><BookOpenCheck size={15}/><span><b>Đề yêu cầu:</b> {withTerms(review.requirement_vi)}</span></p>}
        {review.ideas_en.length > 0 && <div className="t2-selfcheck"><b>Gợi ý ý tưởng</b><ul className="t2-bullets">{review.ideas_en.map((idea) => <li key={idea} lang="en">{idea}</li>)}</ul></div>}
        {review.model && <div className="t2-model t2-panel">
          <span className="ll-kicker">Bài mẫu cùng dạng · {review.model.title}{review.model.word_count ? ` · ${review.model.word_count} từ` : ""}</span>
          {review.model.prompt_en && <p className="t2-soft" lang="en">{review.model.prompt_en}</p>}
          <div className="t2-example-text" lang="en">{review.model.essay_en.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
          {review.model.structure_vi && <p className="t2-outline"><b>Cấu trúc:</b> {withTerms(review.model.structure_vi)}</p>}
          {review.model.warning_vi && <p className="t2-soft">{withTerms(review.model.warning_vi)}</p>}
        </div>}
      </div> : !error && <p className="t2-soft">Đang mở gợi ý và bài mẫu…</p>}

      <div className="t2-rewrite">
        <h3><RotateCcw size={17}/> Viết lại sau khi tự chấm</h3>
        <p className="t2-soft">Sửa ít nhất hai lỗi bạn tìm được, rồi ghi từng lỗi vào sổ để ôn lại.</p>
        <textarea className="t2-text" lang="en" rows={10} value={current.rewrite ?? current.essay} aria-label="Bản viết lại" onChange={(event) => update({ rewrite: event.target.value })}/>
        <div className="t2-row">
          <span className="t2-words"><b>{countWords(current.rewrite ?? current.essay)}</b> từ</span>
          <button type="button" className="ll-btn" onClick={() => onLogMistake({ source: paper.id })}><NotebookPen size={15}/> Ghi lỗi vào sổ</button>
          <button type="button" className="ll-btn ll-btn-primary" onClick={() => update({}, true)}><Save size={15}/> Lưu bản viết lại</button>
        </div>
      </div>
    </>}
  </section>;
}

/* ───────────── Mistake log ───────────── */

export function MistakeLog({ bundle, prefill, onPrefillUsed }: { bundle: FinalBundle; prefill: MistakePrefill | null; onPrefillUsed: () => void }) {
  const [entries, setEntries] = useState<MistakeEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<MistakePrefill & { error_code?: string } | null>(prefill);
  const [filter, setFilter] = useState<"due" | "all">("due");

  useEffect(() => {
    let alive = true;
    void loadMistakes().then((list) => { if (alive) { setEntries(list); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const due = entries.filter((entry) => mistakeDue(entry));
  const shown = filter === "due" ? due : entries;
  const daysFor = (code: string) => bundle.mistakes.find((item) => item.id === code)?.review_days;

  async function persist(entry: MistakeEntry) {
    setEntries((current) => [...current.filter((item) => item.id !== entry.id), entry].sort((a, b) => a.next_review_at.localeCompare(b.next_review_at)));
    try { await saveMistake(entry); } catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa lưu được."); }
  }

  return <section className="t2-panel">
    <div className="t2-panel-head">
      <div><span className="ll-kicker">Sổ lỗi của bạn</span><h2>{due.length ? `${due.length} lỗi cần ôn hôm nay` : "Hôm nay chưa có lỗi cần ôn"}</h2></div>
      {!form && <button type="button" className="ll-btn ll-btn-primary" onClick={() => setForm({})}><NotebookPen size={15}/> Ghi lỗi mới</button>}
    </div>
    <p className="t2-soft">Mỗi lỗi quay lại sau 1, 3, 7 rồi 14 ngày. Viết lại đúng 4 lần là thuộc. Sổ lỗi chỉ bạn xem được.</p>
    {error && <p className="ll-error" role="alert">{error}</p>}
    {form && <MistakeForm bundle={bundle} initial={form} onCancel={() => { setForm(null); onPrefillUsed(); }}
      onSave={(entry) => { void persist(entry); setForm(null); onPrefillUsed(); setFilter("all"); }}/>}

    <div className="t2-filters"><div role="group" aria-label="Lọc sổ lỗi">
      <button type="button" aria-pressed={filter === "due"} onClick={() => setFilter("due")}>Cần ôn<small>{due.length}</small></button>
      <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả<small>{entries.length}</small></button>
    </div></div>
    {!loaded ? <p className="t2-soft">Đang mở sổ lỗi…</p> : !shown.length
      ? <p className="t2-soft">{entries.length ? "Không có lỗi nào đến hạn. Quay lại vào ngày mai nhé." : "Chưa có lỗi nào. Sau mỗi bài viết, ghi lại lỗi bạn tìm được để ôn."}</p>
      : <ul className="t2-mistakes">{shown.map((entry) => <MistakeCard key={entry.id} entry={entry} bundle={bundle}
        onReview={(correct) => void persist(reviewMistake(entry, correct, daysFor(entry.error_code)))}
        onRemove={() => { setEntries((current) => current.filter((item) => item.id !== entry.id)); void removeMistake(entry.id); }}/>)}</ul>}

    <details className="t2-more"><summary>Bảng {bundle.mistakes.length} mã lỗi theo 4 tiêu chí</summary>
      <div className="t2-cards">{bundle.mistakes.map((code) => <article key={code.id}><b><span className="t2-criterion">{code.criterion}</span> {code.name_vi}</b>
        <dl className="t2-fields"><div><dt>Dấu hiệu</dt><dd>{withTerms(code.symptom_vi)}</dd></div><div><dt>Cách sửa</dt><dd>{withTerms(code.repair_vi)}</dd></div></dl></article>)}</div>
    </details>
  </section>;
}

function MistakeForm({ bundle, initial, onSave, onCancel }: { bundle: FinalBundle; initial: MistakePrefill & { error_code?: string }; onSave: (entry: MistakeEntry) => void; onCancel: () => void }) {
  const [criterion, setCriterion] = useState<Criterion>(initial.criterion ?? "TR");
  const codes = bundle.mistakes.filter((code) => code.criterion === criterion);
  const [code, setCode] = useState(initial.error_code ?? codes[0]?.id ?? "");
  const [original, setOriginal] = useState(initial.original_excerpt ?? "");
  const [revised, setRevised] = useState(initial.revised_excerpt ?? "");
  const [why, setWhy] = useState(initial.why_vi ?? "");
  const chosen = bundle.mistakes.find((item) => item.id === code);
  const ready = original.trim().length >= 3 && revised.trim().length >= 3 && why.trim().length >= 12;
  return <form className="t2-mistake-form" onSubmit={(event) => { event.preventDefault(); if (ready) onSave(newMistake({ criterion, error_code: code, original_excerpt: original.trim(), revised_excerpt: revised.trim(), why_vi: why.trim(), source: initial.source }, chosen?.review_days)); }}>
    <div className="t2-form-row">
      <label>Tiêu chí<select value={criterion} onChange={(event) => { const next = event.target.value as Criterion; setCriterion(next); setCode(bundle.mistakes.find((item) => item.criterion === next)?.id ?? ""); }}>
        {criteria.map((item) => <option key={item} value={item}>{item} · {criterionNames[item]}</option>)}</select></label>
      <label>Loại lỗi<select value={code} onChange={(event) => setCode(event.target.value)}>{codes.map((item) => <option key={item.id} value={item.id}>{item.name_vi}</option>)}</select></label>
    </div>
    {chosen && <p className="t2-soft"><b>Dấu hiệu:</b> {chosen.symptom_vi} · <b>Cách sửa:</b> {chosen.repair_vi}</p>}
    <label>Câu gốc có lỗi<textarea className="t2-text" lang="en" rows={2} value={original} onChange={(event) => setOriginal(event.target.value)}/></label>
    <label>Câu đã sửa<textarea className="t2-text" lang="en" rows={2} value={revised} onChange={(event) => setRevised(event.target.value)}/></label>
    <label>Vì sao sai, vì sao bản sửa đúng (tiếng Việt)<textarea className="t2-text" rows={2} value={why} onChange={(event) => setWhy(event.target.value)}/></label>
    <div className="t2-row"><button type="button" className="ll-btn" onClick={onCancel}>Huỷ</button><button type="submit" className="ll-btn ll-btn-primary" disabled={!ready}><Save size={15}/> Lưu vào sổ</button></div>
  </form>;
}

function MistakeCard({ entry, bundle, onReview, onRemove }: { entry: MistakeEntry; bundle: FinalBundle; onReview: (correct: boolean) => void; onRemove: () => void }) {
  const [attempt, setAttempt] = useState("");
  const [shown, setShown] = useState(false);
  const code = bundle.mistakes.find((item) => item.id === entry.error_code);
  const isDue = mistakeDue(entry);
  return <li className={`t2-mistake-card ${entry.review_status === "mastered" ? "is-mastered" : ""}`}>
    <div className="t2-mistake-head">
      <span className="t2-criterion">{entry.criterion}</span><b>{code?.name_vi ?? entry.error_code}</b>
      <small>{entry.review_status === "mastered" ? "Đã thuộc" : isDue ? "Đến hạn ôn" : `Ôn lại ${new Date(entry.next_review_at).toLocaleDateString("vi-VN")}`} · {entry.review_attempts}/4 lần</small>
      <button type="button" className="t2-link-btn" aria-label="Xoá lỗi này" onClick={onRemove}><Trash2 size={14}/></button>
    </div>
    <p className="t2-quote is-stimulus"><b>Câu gốc</b><span lang="en">{entry.original_excerpt}</span></p>
    {isDue && !shown ? <>
      <textarea className="t2-text" lang="en" rows={2} value={attempt} placeholder="Tự viết lại câu này cho đúng, rồi so với bản sửa của bạn…" onChange={(event) => setAttempt(event.target.value)}/>
      <div className="t2-row"><button type="button" className="ll-btn" onClick={() => setShown(true)}><Eye size={15}/> So với bản sửa</button></div>
    </> : <>
      <p className="t2-quote"><b>Bản sửa</b><span lang="en">{entry.revised_excerpt}</span></p>
      <p className="t2-soft">{withTerms(entry.why_vi)}</p>
      {isDue && <div className="t2-row">
        <button type="button" className="ll-btn" onClick={() => { onReview(false); setShown(false); setAttempt(""); }}>Chưa đúng, ôn lại mai</button>
        <button type="button" className="ll-btn ll-btn-primary" onClick={() => onReview(true)}><Check size={15}/> Mình sửa đúng</button>
      </div>}
    </>}
  </li>;
}
