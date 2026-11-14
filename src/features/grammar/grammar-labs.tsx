"use client";
/**
 * Grammar practice labs UI (M20 concept map, M21 diagnostic, M22–M26 labs).
 * Items and feedback come only from /api/grammar/labs; private banks never reach the browser.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Compass, FlaskConical, Layers, Mic, PenLine, Repeat2, Search, Split, Stethoscope, X } from "lucide-react";
import { grammarLevels, grammarWorlds, type GrammarLevel } from "@/lib/grammar/types";
import { isLevelOpen } from "@/lib/grammar/gate";
import {
  labInfo, labKinds,
  type ChoiceQuestion, type ClinicItem, type ContextItem, type ContrastItem, type DiagnosticQuestion, type DiagnosticResult,
  type LabGrade, type LabItem, type LabKind, type LabSummary, type LessonLabs, type LevelLabs, type OpenTask, type TransferItem, type TransformSet,
} from "@/lib/grammar/labs-types";
import "./grammar-labs.css";

const ROOT = "/app/grammar";
const STORE = "ieltswithharry-grammar-labs-v1";
const icons: Record<LabKind, typeof Stethoscope> = { clinic: Stethoscope, contrast: Split, transform: Repeat2, context: Search, transfer: PenLine };

type Attempt = { done: number; total: number; correct: number; at: string };
function readAttempts(): Record<string, Attempt> {
  try { return JSON.parse(window.localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}
function useAttempts() {
  // Lab lists render only after their fetch resolves, so reading storage up front is hydration-safe.
  const [attempts, setAttempts] = useState<Record<string, Attempt>>(() => (typeof window === "undefined" ? {} : readAttempts()));
  const record = useCallback((key: string, value: Attempt) => {
    setAttempts((current) => {
      const next = { ...current, [key]: value };
      try { window.localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* private window */ }
      return next;
    });
  }, []);
  return { attempts, record };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Không tải được phòng luyện.");
  return data as T;
}
async function postJson<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/grammar/labs", { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Không chấm được câu trả lời.");
  return data as T;
}

/** Lab content marks emphasis with **double asterisks**; render it instead of showing the stars. */
function Rich({ text }: { text?: string | null }) {
  if (!text) return null;
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</>;
}

function DraftNote({ preview }: { preview: boolean }) {
  return <p className="gg-lab-draft" role="note">{preview ? "Bản nháp biên tập · chưa được giáo viên duyệt. " : ""}Phòng luyện chỉ để tự học: không tính điểm thành thạo, không mở khóa cấp, không chứng nhận CEFR/IELTS.</p>;
}

// ------------------------------------------------------------------ lesson tab
export function LessonLabsPanel({ code }: { code: string }) {
  const [data, setData] = useState<LessonLabs | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ lab: LabKind; id: string } | null>(null);
  const { attempts, record } = useAttempts();
  useEffect(() => {
    let active = true;
    getJson<LessonLabs>(`/api/grammar/labs?lesson=${encodeURIComponent(code)}`).then((value) => { if (active) setData(value); }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [code]);
  if (error) return <div className="gg-error"><p>{error}</p></div>;
  if (!data) return <div className="gg-loading">Đang tải phòng luyện…</div>;
  if (open) return <LabPlayer lab={open.lab} id={open.id} onClose={() => setOpen(null)} onAttempt={record} />;
  const total = labKinds.reduce((sum, lab) => sum + data.labs[lab].length, 0);
  return <div className="gg-labs-panel">
    {data.concept && <section className="gg-lab-concept"><div><span className="gg-eyebrow">BẢN ĐỒ KIẾN THỨC · {data.concept.id}</span><h3>{data.concept.title}</h3><p>Nhóm: {data.concept.family}{data.concept.prerequisites.length ? ` · Cần nắm trước: ${data.concept.prerequisites.join(", ")}` : ""}</p></div>
      {data.concept.skills.length > 0 && <ol>{data.concept.skills.map((skill) => <li key={skill.id}><strong>{skill.title}</strong>{skill.formula && <code>{skill.formula}</code>}</li>)}</ol>}</section>}
    <DraftNote preview={data.draftPreview} />
    {total === 0 ? <div className="gg-empty"><FlaskConical size={28} /><h2>Chưa có bài luyện chuyên sâu cho bài này</h2><p>Hãy luyện tập theo 4 giai đoạn, hoặc mở phòng luyện của cả cấp.</p><Link className="gg-primary" href={`${ROOT}/labs?level=${code.slice(0, 2)}`}>Phòng luyện {code.slice(0, 2)} <ArrowRight size={16} /></Link></div>
      : labKinds.filter((lab) => data.labs[lab].length).map((lab) => <LabSection key={lab} lab={lab} items={data.labs[lab]} attempts={attempts} onOpen={(id) => setOpen({ lab, id })} />)}
  </div>;
}

function LabSection({ lab, items, attempts, onOpen, limit }: { lab: LabKind; items: LabSummary[]; attempts: Record<string, Attempt>; onOpen: (id: string) => void; limit?: number }) {
  const Icon = icons[lab];
  const [expanded, setExpanded] = useState(false);
  const shown = limit && !expanded ? items.slice(0, limit) : items;
  const done = items.filter((item) => attempts[`${lab}:${item.id}`]).length;
  return <section className={`gg-lab-section gg-lab-${lab}`}>
    <header><span className="gg-lab-icon"><Icon size={20} /></span><div><h3>{labInfo[lab].name} <small>{labInfo[lab].milestone}</small></h3><p>{labInfo[lab].description}</p></div><span className="gg-lab-count">{done}/{items.length}</span></header>
    <div className="gg-lab-cards">{shown.map((item) => { const attempt = attempts[`${lab}:${item.id}`]; return <button key={item.id} className={attempt ? "done" : ""} onClick={() => onOpen(item.id)}>
      <span className="gg-lab-card-top"><small>{item.lessonIds.join(" · ")}</small>{attempt && <em><Check size={13} /> {attempt.total ? `${attempt.correct}/${attempt.total}` : "Đã làm"}</em>}</span>
      <strong>{item.title}</strong>{item.subtitle && <span className="gg-lab-sub">{item.subtitle}</span>}<ChevronRight className="gg-lab-chevron" size={16} />
    </button>; })}</div>
    {limit && items.length > limit && <button className="gg-secondary gg-lab-more" onClick={() => setExpanded(!expanded)}>{expanded ? "Thu gọn" : `Xem tất cả ${items.length} bài`}</button>}
  </section>;
}

// ------------------------------------------------------------------ hub page
export function LabsHub({ levelParam, labParam, idParam, unlocked }: { levelParam: string | null; labParam: string | null; idParam: string | null; unlocked: GrammarLevel[] }) {
  const level = grammarLevels.includes(levelParam as GrammarLevel) ? levelParam as GrammarLevel : (idParam?.match(/(A1|A2|B1|B2|C1|C2)/)?.[1] as GrammarLevel | undefined) ?? "A1";
  const [filter, setFilter] = useState<LabKind | "all" | "diagnostic">(labParam === "diagnostic" ? "diagnostic" : labKinds.includes(labParam as LabKind) ? labParam as LabKind : "all");
  const [loaded, setLoaded] = useState<LevelLabs | null>(null);
  const [failure, setFailure] = useState<{ level: GrammarLevel; message: string } | null>(null);
  const data = loaded?.level === level ? loaded : null;
  const error = failure?.level === level ? failure.message : "";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ lab: LabKind; id: string } | null>(idParam && labKinds.includes(labParam as LabKind) ? { lab: labParam as LabKind, id: idParam } : null);
  const { attempts, record } = useAttempts();
  const levelOpen = isLevelOpen(level, unlocked);
  useEffect(() => {
    if (!levelOpen) return;
    let active = true;
    getJson<LevelLabs>(`/api/grammar/labs?level=${level}`).then((value) => { if (active) setLoaded(value); }).catch((cause) => { if (active) setFailure({ level, message: cause.message }); });
    return () => { active = false; };
  }, [level, levelOpen]);
  const filtered = useMemo(() => {
    if (!data) return null;
    const q = query.trim().toLowerCase();
    return Object.fromEntries(labKinds.map((lab) => [lab, data.labs[lab].filter((item) => !q || `${item.title} ${item.subtitle ?? ""} ${item.lessonIds.join(" ")}`.toLowerCase().includes(q))])) as Record<LabKind, LabSummary[]>;
  }, [data, query]);
  if (open) return <div className="gg-subpage gg-labs"><LabPlayer lab={open.lab} id={open.id} onClose={() => setOpen(null)} onAttempt={record} /></div>;
  const totals = data ? labKinds.reduce((sum, lab) => sum + data.labs[lab].length, 0) : 0;
  return <div className="gg-subpage gg-labs">
    <Link className="gg-back" href={`${ROOT}/level/${level}`}><ArrowLeft size={16} /> Lộ trình {level}</Link>
    <section className="gg-lab-hero"><div><span className="gg-eyebrow">PHÒNG LUYỆN CHUYÊN SÂU · {level}</span><h1>{grammarWorlds[level].icon} Luyện sâu {grammarWorlds[level].name}</h1><p>Chẩn đoán nhanh, chữa lỗi theo bước, phân biệt cấu trúc, viết lại câu, đọc ngữ cảnh và vận dụng vào Viết/Nói.</p></div>
      {data && <div className="gg-lab-stats"><div><strong>{totals}</strong><span>bài luyện</span></div><div><strong>{data.diagnosticItems}</strong><span>câu chẩn đoán</span></div><div><strong>{Object.keys(attempts).filter((key) => data.labs[key.split(":")[0] as LabKind]?.some((x) => x.id === key.split(":").slice(1).join(":"))).length}</strong><span>đã làm</span></div></div>}</section>
    <div className="gg-lab-levels" role="group" aria-label="Chọn cấp độ">{grammarLevels.map((item) => <Link key={item} className={item === level ? "active" : ""} aria-disabled={!isLevelOpen(item, unlocked)} href={isLevelOpen(item, unlocked) ? `${ROOT}/labs?level=${item}` : `${ROOT}/placement?target=${item}`}>{item}</Link>)}</div>
    {!levelOpen ? <div className="gg-empty"><Layers size={28} /><h2>Cấp {level} đang khóa</h2><p>Mở cấp này trong lộ trình Grammar để vào phòng luyện.</p><Link className="gg-primary" href={`${ROOT}/placement?target=${level}`}>Kiểm tra mở cấp <ArrowRight size={16} /></Link></div>
      : error ? <div className="gg-error"><p>{error}</p></div>
        : !data || !filtered ? <div className="gg-loading">Đang tải phòng luyện…</div>
          : <>
            <div className="gg-stage-tabs gg-lab-filter" role="group" aria-label="Lọc phòng luyện">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tất cả <small>{totals}</small></button>
              <button className={filter === "diagnostic" ? "active" : ""} onClick={() => setFilter("diagnostic")}>Chẩn đoán <small>M21</small></button>
              {labKinds.map((lab) => <button key={lab} className={filter === lab ? "active" : ""} onClick={() => setFilter(lab)}>{labInfo[lab].short} <small>{data.labs[lab].length}</small></button>)}
            </div>
            <DraftNote preview={data.draftPreview} />
            {(filter === "all" || filter === "diagnostic") && <DiagnosticCard level={level} available={data.diagnosticItems > 0} expanded={filter === "diagnostic"} onOpenClinic={(id) => setOpen({ lab: "clinic", id })} />}
            {filter !== "diagnostic" && <div className="gg-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã bài, chủ điểm hoặc tình huống…" aria-label="Tìm bài luyện" />{query && <button onClick={() => setQuery("")}>Xóa</button>}</div>}
            {filter !== "diagnostic" && labKinds.filter((lab) => (filter === "all" || filter === lab) && filtered[lab].length).map((lab) => <LabSection key={lab} lab={lab} items={filtered[lab]} attempts={attempts} limit={filter === "all" ? 6 : undefined} onOpen={(id) => setOpen({ lab, id })} />)}
            {filter !== "diagnostic" && labKinds.every((lab) => !(filter === "all" || filter === lab) || !filtered[lab].length) && <div className="gg-empty"><Search size={26} /><h2>Không có bài phù hợp</h2></div>}
          </>}
  </div>;
}

// ------------------------------------------------------------------ diagnostic
function DiagnosticCard({ level, available, expanded, onOpenClinic }: { level: GrammarLevel; available: boolean; expanded: boolean; onOpenClinic: (id: string) => void }) {
  const [questions, setQuestions] = useState<DiagnosticQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true); setError(""); setResult(null); setAnswers({});
    try { const data = await getJson<{ questions: DiagnosticQuestion[] }>(`/api/grammar/labs?diagnostic=${level}`); setQuestions(data.questions); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không tạo được bài chẩn đoán."); }
    finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setError("");
    try { setResult(await postJson<DiagnosticResult>({ diagnostic: level, answers })); setQuestions([]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không chấm được bài chẩn đoán."); }
    finally { setBusy(false); }
  }
  const statusLabel = { REVIEW_PRIORITY: "Nên ôn trước", MIXED: "Chưa chắc", PROVISIONAL_STRENGTH: "Tạm ổn", INSUFFICIENT_EVIDENCE: "Chưa đủ dữ liệu" } as const;
  return <section className="gg-lab-section gg-lab-diagnostic">
    <header><span className="gg-lab-icon"><Compass size={20} /></span><div><h3>Chẩn đoán nhanh {level} <small>M21</small></h3><p>Khoảng 12 câu, 2 câu cho mỗi chủ điểm. Kết quả gợi ý bài nên ôn và phòng chữa lỗi phù hợp, không phải điểm trình độ.</p></div></header>
    {!available ? <p className="gg-side-foot">Bài chẩn đoán của cấp này chưa phát hành.</p>
      : result ? <div className="gg-lab-diag-result">
        <strong className="gg-lab-score">{result.points}/{result.total} câu khớp đáp án</strong><p>{result.summaryVi}</p>
        <ul className="gg-lab-concepts">{result.concepts.map((c) => <li key={c.conceptId} className={c.status.toLowerCase()}><span>{statusLabel[c.status]}</span><Link href={`${ROOT}/lesson/${c.lessonId}`}>{c.lessonId} · {c.title}</Link><small>{c.correct}/{c.total}</small></li>)}</ul>
        {result.review.length > 0 && <div className="gg-lab-next"><h4>Gợi ý ôn tiếp</h4>{result.review.map((r) => <div key={r.lessonId}><Link href={`${ROOT}/lesson/${r.lessonId}`}>{r.lessonId} · {r.title}</Link>{r.clinicId && <button className="gg-secondary" onClick={() => onOpenClinic(r.clinicId!)}><Stethoscope size={15} /> Vào phòng chữa lỗi</button>}</div>)}</div>}
        <details><summary>Xem đáp án từng câu</summary><ol>{result.answers.map((a) => <li key={a.id} className={a.correct ? "ok" : "no"}>{a.correct ? "Đúng" : "Chưa đúng"} · Đáp án: <strong>{a.correctOption}</strong>{a.rationaleVi && <p>{a.rationaleVi}</p>}</li>)}</ol></details>
        <button className="gg-primary" onClick={() => void start()}>Làm bộ câu mới <ArrowRight size={16} /></button>
      </div>
        : questions.length ? <div className="gg-placement-questions">{questions.map((q, index) => <fieldset key={q.id} className="gg-placement-question"><legend>Câu {index + 1} / {questions.length}</legend><strong>{q.prompt}</strong><div className="gg-placement-options">{q.options.map((option, i) => <label key={i}><input type="radio" name={q.id} checked={answers[q.id] === i} onChange={() => setAnswers((current) => ({ ...current, [q.id]: i }))} />{option}</label>)}</div></fieldset>)}
          <div className="gg-placement-submit"><span>{Object.keys(answers).length}/{questions.length} câu đã trả lời</span><button className="gg-primary" disabled={busy || Object.keys(answers).length !== questions.length} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Xem kết quả"}</button></div></div>
          : <button className="gg-primary" disabled={busy} onClick={() => void start()}>{busy ? "Đang tạo đề…" : expanded ? "Bắt đầu chẩn đoán" : "Làm chẩn đoán nhanh"} <ArrowRight size={16} /></button>}
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
  </section>;
}

// ------------------------------------------------------------------ players
function LabPlayer({ lab, id, onClose, onAttempt }: { lab: LabKind; id: string; onClose: () => void; onAttempt: (key: string, value: Attempt) => void }) {
  const [item, setItem] = useState<LabItem | null>(null);
  const [error, setError] = useState("");
  const score = useRef<Record<string, boolean | null>>({});
  useEffect(() => {
    let active = true;
    getJson<{ item: LabItem }>(`/api/grammar/labs?lab=${lab}&id=${encodeURIComponent(id)}`).then((data) => { if (active) setItem(data.item); }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [lab, id]);
  // Called from event handlers only, so updating the parent's attempt list here is safe.
  const graded = useCallback((questionId: string, correct: boolean | null, total: number) => {
    score.current = { ...score.current, [questionId]: correct };
    const values = Object.values(score.current);
    onAttempt(`${lab}:${id}`, { done: values.length, total, correct: values.filter((x) => x === true).length, at: new Date().toISOString() });
  }, [lab, id, onAttempt]);
  const Icon = icons[lab];
  return <div className="gg-lab-player">
    <div className="gg-lab-player-head"><button className="gg-back" onClick={onClose}><ArrowLeft size={16} /> Danh sách bài luyện</button><span className="gg-eyebrow"><Icon size={14} /> {labInfo[lab].name.toUpperCase()} · {id}</span></div>
    {error ? <div className="gg-error"><p>{error}</p></div> : !item ? <div className="gg-loading">Đang tải bài luyện…</div>
      : item.lab === "clinic" ? <ClinicPlayer item={item} onGraded={graded} />
        : item.lab === "contrast" ? <ContrastPlayer item={item} onGraded={graded} />
          : item.lab === "transform" ? <TransformPlayer item={item} onGraded={graded} />
            : item.lab === "context" ? <ContextPlayer item={item} onGraded={graded} />
              : <TransferPlayer item={item} onGraded={graded} />}
    <DraftNote preview={false} />
  </div>;
}

type Graded = (questionId: string, correct: boolean | null, total: number) => void;

function ChoiceCheck({ lab, itemId, question, index, total, onGraded }: { lab: LabKind; itemId: string; question: ChoiceQuestion; index: number; total: number; onGraded: Graded }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [grade, setGrade] = useState<LabGrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (selected === null || busy) return;
    setBusy(true); setError("");
    try { const result = await postJson<LabGrade>({ lab, id: itemId, questionId: question.id, answer: selected }); setGrade(result); onGraded(question.id, result.kind === "choice" ? result.correct : null, total); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không chấm được."); }
    finally { setBusy(false); }
  }
  return <div className="gg-lab-check"><span className="gg-eyebrow">CÂU {index + 1} / {total}{question.type ? ` · ${question.type.replaceAll("_", " ").toLowerCase()}` : ""}</span><p className="gg-lab-prompt"><Rich text={question.promptVi} /></p>
    <div className="gg-options" role="group" aria-label="Chọn đáp án">{question.optionsEn.map((option, i) => <button key={i} disabled={Boolean(grade)} className={`${selected === i ? "selected" : ""} ${grade?.kind === "choice" && grade.correctOption === option ? "gg-lab-right" : ""} ${grade && selected === i && grade.kind === "choice" && !grade.correct ? "gg-lab-wrong" : ""}`} onClick={() => setSelected(i)}>{option}</button>)}</div>
    {!grade ? <div className="gg-question-actions"><button className="gg-primary" disabled={selected === null || busy} onClick={() => void submit()}>{busy ? "Đang kiểm tra…" : "Kiểm tra"}</button></div>
      : grade.kind === "choice" && <div className={`gg-lab-feedback ${grade.correct ? "ok" : "no"}`}><strong>{grade.correct ? <><Check size={16} /> Khớp ý cần chọn</> : <><X size={16} /> Chưa khớp</>}</strong><p><Rich text={grade.feedbackVi} /></p>{!grade.correct && grade.correctOption && <p><b>Phương án phù hợp:</b> {grade.correctOption}</p>}{!grade.correct && grade.explanationVi && <p><Rich text={grade.explanationVi} /></p>}{grade.noteVi && <small><Rich text={grade.noteVi} /></small>}<button className="gg-secondary" onClick={() => { setGrade(null); setSelected(null); }}>Làm lại câu này</button></div>}
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
  </div>;
}

function OpenCheck({ lab, itemId, task, label, minLength, onGraded, total, localRubric }: { lab: LabKind; itemId: string; task: { id: string; promptVi: string; draftEn?: string | null }; label: string; minLength: number; onGraded: Graded; total: number; localRubric?: string[] }) {
  const [text, setText] = useState(task.draftEn ?? "");
  const [grade, setGrade] = useState<LabGrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [self, setSelf] = useState<"ok" | "review" | null>(null);
  async function submit() {
    if (text.trim().length < minLength || busy) return;
    if (localRubric) { setGrade({ kind: "open", questionId: task.id, matchedReference: false, feedbackVi: "Bài tự viết không chấm tự động. Hãy đối chiếu với từng tiêu chí bên dưới.", rubricVi: localRubric }); return; }
    setBusy(true); setError("");
    try { const result = await postJson<LabGrade>({ lab, id: itemId, questionId: task.id, answer: text }); setGrade(result); onGraded(task.id, result.kind === "open" && result.matchedReference ? true : null, total); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không gửi được bài."); }
    finally { setBusy(false); }
  }
  return <div className="gg-lab-check gg-lab-open"><span className="gg-eyebrow">{label}</span><p className="gg-lab-prompt"><Rich text={task.promptVi} /></p>
    <textarea value={text} rows={task.draftEn ? 6 : 4} onChange={(event) => { setText(event.target.value); setGrade(null); setSelf(null); }} aria-label={label} placeholder="Viết câu trả lời bằng tiếng Anh…" />
    <div className="gg-question-actions"><span className="gg-lab-hint">{text.trim().length < minLength ? `Viết ít nhất ${minLength} ký tự` : `${text.trim().split(/\s+/).length} từ`}</span><button className="gg-primary" disabled={text.trim().length < minLength || busy || Boolean(grade)} onClick={() => void submit()}>{busy ? "Đang gửi…" : "Gửi và xem gợi ý"}</button></div>
    {grade?.kind === "open" && <div className={`gg-lab-feedback ${grade.matchedReference ? "ok" : "info"}`}><strong>{grade.matchedReference ? <><Check size={16} /> Khớp câu mẫu</> : "Tự đối chiếu"}</strong><p><Rich text={grade.feedbackVi} /></p>
      {grade.referenceEn && <p><b>Câu tham khảo:</b> <span className="gg-lab-en">{grade.referenceEn}</span></p>}
      {grade.noteVi && <p><Rich text={grade.noteVi} /></p>}
      {grade.rubricVi && grade.rubricVi.length > 0 && <><b>Tiêu chí tự kiểm:</b><ul>{grade.rubricVi.map((line, i) => <li key={i}><Rich text={line} /></li>)}</ul></>}
      {!grade.matchedReference && <div className="gg-self-review"><p>Sau khi so sánh, bạn tự đánh giá:</p><div><button className="gg-secondary" aria-pressed={self === "ok"} onClick={() => { setSelf("ok"); onGraded(task.id, true, total); }}>Câu của tôi đạt</button><button className="gg-secondary" aria-pressed={self === "review"} onClick={() => { setSelf("review"); onGraded(task.id, false, total); }}>Tôi cần sửa lại</button></div></div>}
    </div>}
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
  </div>;
}

function Stepper({ steps, children }: { steps: Array<{ title: string; body: ReactNode }>; children?: ReactNode }) {
  const [step, setStep] = useState(0);
  const last = step >= steps.length;
  return <div className="gg-lab-stepper">
    <div className="gg-lab-progress" aria-hidden="true">{[...steps, { title: "Luyện tập" }].map((_, i) => <span key={i} className={i < step ? "done" : i === step ? "now" : ""} />)}</div>
    {!last ? <div className="gg-lab-step"><span className="gg-eyebrow">BƯỚC {step + 1} / {steps.length} · {steps[step].title}</span>{steps[step].body}</div> : children}
    <div className="gg-practice-nav"><button disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft size={16} /> Bước trước</button><span>{last ? "Luyện tập" : `${step + 1}/${steps.length}`}</span><button disabled={last} onClick={() => setStep(step + 1)}>{step === steps.length - 1 ? "Vào luyện tập" : "Bước tiếp"} <ChevronRight size={16} /></button></div>
  </div>;
}

const stepNames: Record<string, string> = { identify: "Nhận diện", diagnose: "Chẩn đoán", one_rule: "Một quy tắc", model: "Câu mẫu", self_check: "Tự kiểm", practice: "Thực hành", transfer: "Vận dụng", independent: "Tự làm", review: "Tự soát", context: "Tình huống", predict: "Dự đoán", notice: "Quan sát", compare: "So sánh", worked: "Ví dụ phân tích", recap: "Tóm tắt", quiz: "Kiểm tra" };
const stepTitle = (kind: string) => stepNames[kind] ?? kind.replaceAll("_", " ");

function ClinicPlayer({ item, onGraded }: { item: ClinicItem; onGraded: Graded }) {
  const steps = [
    { title: "Lỗi hay gặp", body: <><h2>{item.title}</h2><p className="gg-lab-callout"><b>Hiểu nhầm thường gặp:</b> <Rich text={item.misconceptionVi} /></p><p><Rich text={item.contextVi} /></p><p className="gg-lab-rule"><b>Quy tắc quyết định:</b> <Rich text={item.decisionRuleVi} /></p></> },
    ...item.steps.map((s) => ({ title: stepTitle(s.kind), body: <><p className="gg-lab-instruction"><Rich text={s.instructionVi} /></p>{s.contentVi && <p><Rich text={s.contentVi} /></p>}{(s.problematicEn || s.recommendedEn) && <div className="gg-lab-compare">{s.problematicEn && <div className="no"><small>Câu dễ sai</small><span className="gg-lab-en">{s.problematicEn}</span></div>}{s.recommendedEn && <div className="ok"><small>Nên viết</small><span className="gg-lab-en">{s.recommendedEn}</span></div>}</div>}{s.explanationVi && <p><Rich text={s.explanationVi} /></p>}</> })),
  ];
  const total = item.practice.length + 1;
  return <Stepper steps={steps}><div className="gg-lab-practice"><h2>Luyện tập · {item.practice.length} câu + 1 bài viết</h2>
    {item.practice.map((q, i) => <ChoiceCheck key={q.id} lab="clinic" itemId={item.id} question={{ ...q, type: q.type === "UNSEEN_TRANSFER_RECHECK" ? "câu mới để kiểm tra lại" : "sửa có hướng dẫn" }} index={i} total={total} onGraded={onGraded} />)}
    <OpenCheck lab="clinic" itemId={item.id} task={{ id: `${item.id}-WRITE`, promptVi: item.independentTask.promptVi }} label="TỰ VIẾT · TỰ CHẤM THEO TIÊU CHÍ" minLength={12} total={total} onGraded={onGraded} localRubric={item.independentTask.rubricVi} />
  </div></Stepper>;
}

function ContrastPlayer({ item, onGraded }: { item: ContrastItem; onGraded: Graded }) {
  const steps = item.steps.filter((s) => !s.checkId).map((s) => ({ title: stepTitle(s.kind), body: <>
    {s.kind === "context" && <h2>{item.title}</h2>}
    <p className="gg-lab-instruction"><Rich text={s.instructionVi} /></p>{s.contentVi && <p><Rich text={s.contentVi} /></p>}{s.contextVi && <p className="gg-lab-callout"><Rich text={s.contextVi} /></p>}
    {s.examplesEn && <ul className="gg-lab-examples">{s.examplesEn.map((x, i) => <li key={i} className="gg-lab-en">{x}</li>)}</ul>}
    {(s.aEn || s.aMeaningVi) && <div className="gg-lab-compare">{(s.aEn || s.aMeaningVi) && <div><small>A</small>{s.aEn && <span className="gg-lab-en">{s.aEn}</span>}{s.aMeaningVi && <p><Rich text={s.aMeaningVi} /></p>}</div>}{(s.bEn || s.bMeaningVi) && <div><small>B</small>{s.bEn && <span className="gg-lab-en">{s.bEn}</span>}{s.bMeaningVi && <p><Rich text={s.bMeaningVi} /></p>}</div>}</div>}
    {s.explanationVi && <p><Rich text={s.explanationVi} /></p>}
    {s.selfReviewVi && <ul>{s.selfReviewVi.map((x, i) => <li key={i}><Rich text={x} /></li>)}</ul>}
  </> }));
  return <Stepper steps={steps}><div className="gg-lab-practice"><h2>Chọn câu khớp ý người nói</h2>{item.practice.map((q, i) => <ChoiceCheck key={q.id} lab="contrast" itemId={item.id} question={q} index={i} total={item.practice.length} onGraded={onGraded} />)}</div></Stepper>;
}

function TransformPlayer({ item, onGraded }: { item: TransformSet; onGraded: Graded }) {
  const [index, setIndex] = useState(0);
  const current = item.items[index];
  return <div className="gg-lab-practice"><h2>{item.title}</h2><p className="gg-lab-instruction">{current.instructionVi}</p>
    <div className="gg-practice-bar"><span style={{ width: `${(index + 1) / item.items.length * 100}%` }} /></div>
    <div className="gg-lab-source"><small>Câu gốc</small><span className="gg-lab-en">{current.sourceSentenceEn}</span><em>Gợi ý: {current.cue}</em></div>
    <OpenCheck key={current.id} lab="transform" itemId={item.id} task={{ id: current.id, promptVi: "Viết lại câu, giữ nguyên nghĩa." }} label={`CÂU ${index + 1} / ${item.items.length}`} minLength={6} total={item.items.length} onGraded={onGraded} />
    <div className="gg-practice-nav"><button disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={16} /> Câu trước</button><select value={index} onChange={(event) => setIndex(Number(event.target.value))} aria-label="Chọn câu">{item.items.map((x, i) => <option key={x.id} value={i}>Câu {i + 1}</option>)}</select><button disabled={index === item.items.length - 1} onClick={() => setIndex(index + 1)}>Câu tiếp <ChevronRight size={16} /></button></div>
  </div>;
}

const openLabel: Record<OpenTask["kind"], string> = { edit: "SỬA LỖI TRONG BẢN NHÁP", diagnose: "GIẢI THÍCH LỖI", transfer: "TỰ VIẾT VẬN DỤNG" };
function ContextPlayer({ item, onGraded }: { item: ContextItem; onGraded: Graded }) {
  const total = item.questions.length + item.open.length;
  return <div className="gg-lab-practice gg-lab-context-grid"><article className="gg-lab-passage"><span className="gg-eyebrow">{item.lessonId} · {item.genre}</span><h2>{item.title}</h2>{item.passageEn.split(/\n+/).map((para, i) => <p key={i} className="gg-lab-en">{para}</p>)}</article>
    <div className="gg-lab-tasks">{item.questions.map((q, i) => <ChoiceCheck key={q.id} lab="context" itemId={item.id} question={q} index={i} total={total} onGraded={onGraded} />)}
      {item.open.map((task) => <OpenCheck key={task.id} lab="context" itemId={item.id} task={task} label={openLabel[task.kind]} minLength={task.kind === "transfer" ? 10 : 16} total={total} onGraded={onGraded} />)}</div></div>;
}

function TransferPlayer({ item, onGraded }: { item: TransferItem; onGraded: Graded }) {
  return <div className="gg-lab-practice"><span className="gg-eyebrow">{item.mode === "SPEAKING" ? <><Mic size={13} /> NÓI · ghi lại lời nói thành chữ</> : <><PenLine size={13} /> VIẾT</>} · {item.lessonId}</span><h2><Rich text={item.titleVi} /></h2><p className="gg-lab-callout"><Rich text={item.promptVi} /></p>
    {item.sourceContextEn && <div className="gg-lab-source"><small>Ngữ liệu nguồn</small><span className="gg-lab-en">{item.sourceContextEn}</span></div>}
    <div className="gg-lab-prep"><h4>Chuẩn bị</h4><ol>{item.preparationStepsVi.map((x, i) => <li key={i}>{x.replace(/^\d+\.\s*/, "")}</li>)}</ol><p><b>Mục tiêu:</b> <Rich text={item.targetVi} /> · <b>Độ dài:</b> <Rich text={item.timeLengthVi} /></p></div>
    <OpenCheck lab="transfer" itemId={item.id} task={{ id: item.id, promptVi: item.mode === "SPEAKING" ? "Nói thử, sau đó gõ lại những gì bạn đã nói." : "Viết bài của bạn." }} label={item.mode === "SPEAKING" ? "BẢN GHI LỜI NÓI" : "BÀI VIẾT"} minLength={15} total={1} onGraded={onGraded} />
  </div>;
}
