"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Headphones, RotateCcw } from "lucide-react";
import type { GradedQuestion, PublicLesson, PublicQuestion } from "@/lib/dictation-skill-lab/lessons";
import { listeningModules, listeningTypeLabels } from "@/lib/listening-lab/curriculum";
import type { ListeningModulePlan, ListeningPhase, ListeningTask } from "@/lib/listening-lab/plan";
import { listPracticeResults, loadPracticeResults, savePracticeSnapshot, type PracticeResult } from "@/features/learning/practice-results";
import "./listening-lab.css";

const BASE = "/app/self-study/listening";
const phases: ListeningPhase[] = ["guided", "independent", "transfer"];
const phaseLabels: Record<ListeningPhase, string> = { guided: "1 · Nghe có hướng dẫn", independent: "2 · Luyện độc lập", transfer: "3 · Chuyển giao" };
const phaseSlug = (id: string, phase: ListeningPhase) => `listening-lab:v1:${id}:${phase}`;
const placementStartPrefix = "listening-lab:placement-start:v1:";
const errorSlug = (id: string, phase: ListeningPhase, lessonId: string, questionId: string) => `listening-lab-error:v1:${id}:${phase}:${lessonId}:${questionId}`;
const questionKey = (lessonId: string, questionId: string) => `${lessonId}:${questionId}`;
const errorReasons: Record<string, string> = { empty_answer: "Chưa có đáp án", word_limit_exceeded: "Vượt giới hạn từ", missing_word_limit_config: "Dữ liệu giới hạn từ cần rà soát", not_in_accepted_answers: "Đáp án chưa khớp" };
function mastered(id: string, progress: Record<string, PracticeResult>) {
  const independent = progress[phaseSlug(id, "independent")];
  const transfer = progress[phaseSlug(id, "transfer")];
  return independent?.checked === 10 && independent.correct >= 8 && Boolean(transfer && transfer.checked >= 10 && transfer.correct / transfer.checked >= .75);
}

export function ListeningLab() {
  const parts = usePathname().split("/").filter(Boolean);
  const moduleId = parts[3] === "module" ? parts[4] : undefined;
  if (parts[3] === "placement") return <PlacementPage />;
  if (parts[3] === "review") return <ReviewPage />;
  if (moduleId) return <ModulePage key={moduleId} id={moduleId} />;
  return <RoadmapPage />;
}

function useProgress() {
  const [progress, setProgress] = useState<Record<string, PracticeResult>>({});
  useEffect(() => { let alive = true; void listPracticeResults("listening-lab:v1:").then((data) => { if (alive) setProgress(data); }).catch(() => undefined); return () => { alive = false; }; }, []);
  return progress;
}

function RoadmapPage() {
  const progress = useProgress();
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [suggestedStart, setSuggestedStart] = useState("01");
  useEffect(() => { let alive = true; void listPracticeResults(placementStartPrefix).then((saved) => {
    const latest = Object.entries(saved).sort((a, b) => (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? ""))[0];
    if (alive && latest) setSuggestedStart(latest[0].slice(placementStartPrefix.length));
  }).catch(() => undefined); return () => { alive = false; }; }, []);
  const groups = useMemo(() => [...new Set(listeningModules.map((item) => item.level))], []);
  const types = useMemo(() => [...new Set(listeningModules.flatMap((item) => item.types))], []);
  const done = listeningModules.filter((item) => mastered(item.id, progress)).length;
  const startIndex = Math.max(0, listeningModules.findIndex((item) => item.id === suggestedStart));
  const next = listeningModules.slice(startIndex).find((item) => !mastered(item.id, progress)) ?? listeningModules.at(-1)!;
  return <div className="ll-page">
    <header className="ll-hero"><span className="ll-eyebrow">TỰ HỌC IELTS · LISTENING LAB</span><h1>Nghe theo lộ trình, luyện đúng từng dạng</h1>
      <p>28 mô-đun từ nhận âm, tên và số đến Section 1–4. Mỗi mô-đun có bài hướng dẫn, bài độc lập và bài chuyển giao từ những bản ghi khác nhau.</p>
      <div className="ll-actions"><Link className="ll-primary" href={`${BASE}/module/${next.id}`}>Tiếp tục · {next.title} <ArrowRight size={17}/></Link><Link className="ll-secondary" href={`${BASE}/placement`}>Kiểm tra đầu vào</Link><a className="ll-secondary" href="#luyen-theo-dang">Luyện theo dạng</a><Link className="ll-secondary" href={`${BASE}/review`}>Ôn lỗi của tôi</Link></div>
      <small>{done}/28 mô-đun đạt mục tiêu luyện tập · Cần ít nhất 8/10 câu độc lập và 75% câu chuyển giao. Mức 1.0–7.0+ là mức luyện nội bộ, không phải band IELTS.</small>
    </header>
    <div id="luyen-theo-dang" className="ll-type-filter"><label htmlFor="ll-type">Luyện theo dạng câu hỏi</label><select id="ll-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Tất cả các dạng</option>{types.map((type) => <option value={type} key={type}>{listeningTypeLabels[type] ?? type}</option>)}</select></div>
    <div className="ll-filter" role="group" aria-label="Lọc lộ trình"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Toàn bộ</button>{groups.map((level) => <button key={level} aria-pressed={filter === level} onClick={() => setFilter(level)}>{level}</button>)}</div>
    {groups.filter((level) => (filter === "all" || filter === level) && listeningModules.some((item) => item.level === level && (typeFilter === "all" || item.types.includes(typeFilter)))).map((level) => <section className="ll-section" key={level}><h2>Chặng {level}</h2><div className="ll-grid">{listeningModules.filter((item) => item.level === level && (typeFilter === "all" || item.types.includes(typeFilter))).map((item) => {
      const completed = phases.filter((phase) => (progress[phaseSlug(item.id, phase)]?.checked ?? 0) > 0).length;
      return <Link href={`${BASE}/module/${item.id}`} className="ll-card" key={item.id}><span className="ll-number">{item.id}</span><span className="ll-card-body"><strong>{item.title}</strong><span>{item.objective}</span><small>{mastered(item.id, progress) ? "Đã đạt mục tiêu" : `${completed}/3 bước đã làm`} · {item.stages.join(", ")}</small></span><ArrowRight size={17}/></Link>;
    })}</div></section>)}
    <aside className="ll-note">Bài nghe nguồn đang ở trạng thái bản nháp và cần giáo viên rà soát audio, đáp án, sơ đồ trước khi phát hành chính thức. Kết quả tại đây là điểm luyện tập, không quy đổi sang band.</aside>
  </div>;
}

function ModulePage({ id }: { id: string }) {
  const [plan, setPlan] = useState<ListeningModulePlan | null>(null);
  const [phase, setPhase] = useState<ListeningPhase>("guided");
  const [lessons, setLessons] = useState<Record<string, PublicLesson>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Record<string, GradedQuestion> | null>(null);
  const [progress, setProgress] = useState<Record<string, PracticeResult>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const requested = window.location.hash.slice(1) as ListeningPhase; if (phases.includes(requested)) queueMicrotask(() => setPhase(requested)); }, []);
  useEffect(() => {
    let alive = true;
    void Promise.all([fetch(`/api/listening-lab/modules/${id}`, { cache: "no-store" }).then(async (res) => { const json = await res.json(); if (!res.ok) throw new Error(json.error ?? "Không tải được bài."); return json.plan as ListeningModulePlan; }),
      loadPracticeResults(phases.map((item) => phaseSlug(id, item)))]).then(([loaded, saved]) => { if (alive) { setPlan(loaded); setProgress(saved); } }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài."); });
    return () => { alive = false; };
  }, [id]);
  const tasks = useMemo(() => plan?.phases[phase] ?? [], [plan, phase]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) { setLessons({}); setAnswers({}); setGraded(null); setError(""); } });
    if (!tasks.length) return;
    void Promise.all(tasks.map(async (task) => { const response = await fetch(`/api/dictation/skill-lab/${task.lessonId}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Không tải được audio."); return data.lesson as PublicLesson; }))
      .then((items) => { if (alive) setLessons(Object.fromEntries(items.map((item) => [item.lesson_id, item]))); })
      .catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được audio."); });
    return () => { alive = false; };
  }, [tasks]);
  async function submit() {
    if (!plan || busy || graded || tasks.some((task) => !lessons[task.lessonId])) return;
    setBusy(true); setError("");
    try {
      const resultPairs = await Promise.all(tasks.map(async (task) => {
        const response = await fetch(`/api/dictation/skill-lab/${task.lessonId}/grade`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: task.lessonId.startsWith("FND2-") ? "practice" : "ielts", question_ids: task.questionIds, answers: Object.fromEntries(task.questionIds.map((questionId) => [questionId, answers[questionKey(task.lessonId, questionId)] ?? ""])) }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Không chấm được bài.");
        return { task, results: body.results as GradedQuestion[] };
      }));
      const results = Object.fromEntries(resultPairs.flatMap(({ task, results }) => results.map((result) => [questionKey(task.lessonId, result.question_id), result])));
      setGraded(results);
      const all = Object.values(results);
      const summary = { correct: all.filter((item) => item.correct).length, checked: all.length, total: all.length };
      setProgress((current) => ({ ...current, [phaseSlug(id, phase)]: summary }));
      const saved = await Promise.allSettled([savePracticeSnapshot(phaseSlug(id, phase), summary),
        ...resultPairs.flatMap(({ task, results }) => results.map((result) => savePracticeSnapshot(errorSlug(id, phase, task.lessonId, result.question_id), { correct: result.correct ? 1 : 0, checked: 1, total: 1 })))]);
      if (saved.some((item) => item.status === "rejected")) setError("Đã chấm bài nhưng một phần tiến độ chưa lưu được. Hãy kiểm tra kết nối và thử lại sau.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không chấm được bài."); }
    finally { setBusy(false); }
  }
  if (!plan && !error) return <div className="ll-page"><p>Đang chuẩn bị mô-đun…</p></div>;
  if (!plan) return <div className="ll-page"><Link href={BASE}>← Lộ trình Listening</Link><p role="alert">{error}</p></div>;
  const phaseCount = plan.counts[phase];
  return <div className="ll-page"><nav className="ll-breadcrumb"><Link href={BASE}>Listening Lab</Link><span>›</span><span>{plan.module.id}. {plan.module.title}</span></nav>
    <header className="ll-module-hero"><span className="ll-eyebrow">CHẶNG {plan.module.level} · MÔ-ĐUN {plan.module.id}</span><h1>{plan.module.title}</h1><p>{plan.module.objective}</p><div className="ll-strategy"><strong>Trước khi nghe</strong><span>{plan.module.strategy}</span></div></header>
    <div className="ll-phase-tabs" role="tablist" aria-label="Các bước luyện">{phases.map((item) => <button type="button" role="tab" aria-selected={phase === item} key={item} onClick={() => setPhase(item)}>{phaseLabels[item]}{progress[phaseSlug(id, item)]?.checked ? <CheckCircle2 size={15}/> : null}</button>)}</div>
    <div className="ll-instructions"><strong>{phaseLabels[phase]}</strong><p>{phase === "guided" ? "Đọc câu hỏi, dự đoán câu trả lời rồi nghe. Bạn có thể nghe lại; bằng chứng hiện sau khi nộp." : phase === "independent" ? "Làm với bản ghi mới. Đọc yêu cầu và trả lời trước khi xem lời giải." : "Bản ghi mới để kiểm tra chuyển giao. Hãy nghe một lượt như khi làm bài thi."} {phaseCount} câu · {tasks.length} bản ghi.</p></div>
    {error && <p className="ll-error" role="alert">{error}</p>}
    {!tasks.length ? <p className="ll-empty">Chưa có đủ bản ghi phù hợp cho bước này. Cần biên soạn và duyệt thêm dữ liệu.</p> : tasks.map((task) => {
      const lesson = lessons[task.lessonId];
      return lesson ? <Recording key={`${phase}-${task.lessonId}`} task={task} lesson={lesson} phase={phase} answers={answers} onAnswer={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))} graded={graded}/> : <p key={task.lessonId}>Đang tải {task.title}…</p>;
    })}
    {tasks.length > 0 && <div className="ll-submit"><button type="button" className="ll-primary" disabled={busy || Boolean(graded) || tasks.some((task) => !lessons[task.lessonId])} onClick={() => void submit()}>{busy ? "Đang chấm…" : graded ? "Đã nộp bài" : "Nộp và xem bằng chứng"}</button>
      {graded && <strong>{Object.values(graded).filter((item) => item.correct).length}/{Object.keys(graded).length} câu đúng</strong>}{graded && phase !== "transfer" && <button className="ll-secondary" onClick={() => setPhase(phases[phases.indexOf(phase) + 1])}>Bước tiếp theo <ArrowRight size={16}/></button>}{graded && phase === "transfer" && <Link className="ll-secondary" href={BASE}>Về lộ trình</Link>}</div>}
    <p className="ll-footnote">Điểm này chỉ phản ánh câu hỏi đã làm trong Listening Lab. Bài Dictation gốc được lưu riêng. Nội dung nguồn đang chờ giáo viên kiểm duyệt.</p>
  </div>;
}

function Recording({ task, lesson, phase, answers, onAnswer, graded }: { task: ListeningTask; lesson: PublicLesson; phase: ListeningPhase; answers: Record<string, string>; onAnswer: (key: string, value: string) => void; graded: Record<string, GradedQuestion> | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [turnIndex, setTurnIndex] = useState(0);
  const sourceTurns = useMemo(() => lesson.turns.filter((turn, index, all) => all.findIndex((item) => item.source_turn_id === turn.source_turn_id) === index && turn.audio_url), [lesson.turns]);
  const turn = sourceTurns[turnIndex];
  const canReplay = phase === "guided" || Boolean(graded);
  function start() {
    if (heard && !canReplay) return;
    setTurnIndex(0); setPlaying(true); setHeard(true);
    const player = audio.current;
    if (player && sourceTurns[0]) { player.src = sourceTurns[0].audio_url ?? ""; void player.play().catch(() => setPlaying(false)); }
  }
  function ended() {
    const next = turnIndex + 1;
    if (next >= sourceTurns.length) { setPlaying(false); return; }
    setTurnIndex(next);
    const player = audio.current;
    if (player) { player.src = sourceTurns[next].audio_url ?? ""; void player.play().catch(() => setPlaying(false)); }
  }
  const questions = task.questionIds.map((id) => lesson.questions.find((item) => item.question_id === id)).filter((item): item is PublicQuestion => Boolean(item));
  return <section className="ll-recording"><div className="ll-recording-head"><div><span>{task.lessonId} · {task.section ? `Section ${task.section}` : "Foundation"}</span><h2>{task.title}</h2></div><span>{questions.length} câu</span></div>
    <div className="ll-player"><Headphones size={18}/><button type="button" onClick={start} disabled={playing || (heard && !canReplay)}>{playing ? "Đang phát…" : heard ? canReplay ? "Nghe lại từ đầu" : "Đã nghe một lượt" : "Phát bản ghi"}</button><span>{playing && turn ? `Đoạn ${turnIndex + 1}/${sourceTurns.length}` : `${sourceTurns.length} đoạn audio`}</span><audio ref={audio} onEnded={ended} onError={() => setPlaying(false)} preload="none" /></div>
    {lesson.turns.some((item) => item.flagged) && <p className="ll-qa">Một số đoạn audio của bài này đang cần kiểm tra phát âm.</p>}
    {questions.map((question, index) => { const key = questionKey(task.lessonId, question.question_id); const result = graded?.[key]; const options = question.options ?? question.choices;
      return <div className="ll-question" key={key}><div className="ll-question-title"><span>{index + 1}</span><div><small>{listeningTypeLabels[question.type] ?? question.type}{question.word_limit ? ` · tối đa ${question.word_limit} từ` : ""}</small><p>{question.prompt}</p>{question.instructions_en && <small>{question.instructions_en}</small>}</div></div>
        {/* eslint-disable-next-line @next/next/no-img-element -- lesson maps are server-provided SVG assets */}
        {question.map_url && <img className="ll-map" src={question.map_url} alt="Sơ đồ để làm câu hỏi" />}
        {options?.length ? <div className="ll-options">{options.map((option) => <label key={option}><input type="radio" name={key} value={option} checked={answers[key] === option} disabled={Boolean(graded)} onChange={() => onAnswer(key, option)}/>{option}</label>)}</div> : <input className="ll-answer" aria-label={`Đáp án câu ${index + 1}`} value={answers[key] ?? ""} disabled={Boolean(graded)} onChange={(event) => onAnswer(key, event.target.value)} placeholder="Nhập đáp án" />}
        {result && <div className={`ll-feedback ${result.correct ? "is-correct" : "is-wrong"}`}><strong>{result.correct ? "Đúng" : "Cần ôn lại"} · {result.accepted_answers.join(" / ")}</strong>{!result.correct && <small>{errorReasons[result.reason] ?? "Cần ôn lại"}</small>}<p>{result.explanation_vi}</p>{result.evidence.map((evidence) => { const clip = lesson.turns.find((item) => item.source_turn_id === evidence.turn_id && item.audio_url); return <div className="ll-evidence" key={evidence.turn_id}><p><b>{evidence.turn_id}:</b> {evidence.text_en}{evidence.translation_vi && <em> · {evidence.translation_vi}</em>}</p>{clip?.audio_url && <audio controls preload="none" src={clip.audio_url} aria-label={`Nghe lại bằng chứng ${evidence.turn_id}`} />}</div>; })}</div>}
      </div>;
    })}
    <Link className="ll-dictation-link" href={`/app/dictation/banks/skill-lab/${task.lessonId}`}><RotateCcw size={15}/> Luyện nghe chép bản ghi này</Link>
  </section>;
}

type PlacementTask = ListeningTask & { moduleId: string };
function placementSuggestion(tasks: PlacementTask[], results: Record<string, GradedQuestion>) {
  const score = (ids: string[]) => tasks.filter((task) => ids.includes(task.moduleId))
    .flatMap((task) => task.questionIds.map((id) => results[questionKey(task.lessonId, id)]))
    .filter((item) => item?.correct).length;
  return score(["01", "02", "05"]) < 4 ? "01" : score(["08", "15"]) < 3 ? "08" : score(["20", "24"]) < 2 ? "17" : "21";
}

function PlacementPage() {
  const [tasks, setTasks] = useState<PlacementTask[] | null>(null);
  const [lessons, setLessons] = useState<Record<string, PublicLesson>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Record<string, GradedQuestion> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void fetch("/api/listening-lab/placement", { cache: "no-store" }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Không tải được bài đầu vào."); return data.tasks as PlacementTask[];
    }).then(async (items) => {
      const unique = [...new Set(items.map((item) => item.lessonId))];
      const loaded = await Promise.all(unique.map(async (id) => { const response = await fetch(`/api/dictation/skill-lab/${id}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Không tải được audio."); return data.lesson as PublicLesson; }));
      if (alive) { setTasks(items); setLessons(Object.fromEntries(loaded.map((item) => [item.lesson_id, item]))); }
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài đầu vào."); });
    return () => { alive = false; };
  }, []);
  async function submit() {
    if (!tasks || graded || busy) return;
    setBusy(true); setError("");
    try {
      const pairs = await Promise.all(tasks.map(async (task) => {
        const response = await fetch(`/api/dictation/skill-lab/${task.lessonId}/grade`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: task.lessonId.startsWith("FND2-") ? "practice" : "ielts", question_ids: task.questionIds, answers: Object.fromEntries(task.questionIds.map((id) => [id, answers[questionKey(task.lessonId, id)] ?? ""])) }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Không chấm được bài đầu vào.");
        return { task, results: data.results as GradedQuestion[] };
      }));
      const result = Object.fromEntries(pairs.flatMap(({ task, results }) => results.map((item) => [questionKey(task.lessonId, item.question_id), item])));
      setGraded(result);
      const all = Object.values(result);
      const saved = await Promise.allSettled([
        savePracticeSnapshot("listening-lab:placement:v1", { correct: all.filter((item) => item.correct).length, checked: all.length, total: all.length }),
        savePracticeSnapshot(`${placementStartPrefix}${placementSuggestion(tasks, result)}`, { correct: 1, checked: 1, total: 1 }),
      ]);
      if (saved.some((item) => item.status === "rejected")) setError("Đã chấm bài đầu vào nhưng chưa lưu được toàn bộ tiến độ. Hãy kiểm tra kết nối.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không chấm được bài đầu vào."); }
    finally { setBusy(false); }
  }
  const count = tasks?.reduce((sum, item) => sum + item.questionIds.length, 0) ?? 0;
  const recommended = !graded ? "01" : placementSuggestion(tasks ?? [], graded);
  const recommendedUnit = listeningModules.find((item) => item.id === recommended);
  return <div className="ll-page"><nav className="ll-breadcrumb"><Link href={BASE}>Listening Lab</Link><span>›</span><span>Kiểm tra đầu vào</span></nav>
    <header className="ll-module-hero"><span className="ll-eyebrow">KIỂM TRA ĐẦU VÀO</span><h1>Chọn chặng bắt đầu phù hợp</h1><p>{count || 12} câu hiểu nội dung từ nhận âm/tên đến Section 4. Hãy nghe một lượt, nộp bài rồi xem gợi ý chặng học. Kết quả không phải band IELTS.</p></header>
    {error && <p role="alert" className="ll-error">{error}</p>}
    {!tasks && !error && <p>Đang tải bài đầu vào…</p>}
    {tasks?.map((task) => <Recording key={`${task.moduleId}:${task.lessonId}`} task={task} lesson={lessons[task.lessonId]} phase="transfer" answers={answers} onAnswer={(key, value) => setAnswers((current) => ({ ...current, [key]: value }))} graded={graded}/>)}
    {tasks && <div className="ll-submit"><button className="ll-primary" type="button" disabled={busy || Boolean(graded)} onClick={() => void submit()}>{busy ? "Đang chấm…" : graded ? "Đã nộp" : "Nộp bài đầu vào"}</button>{graded && <strong>{Object.values(graded).filter((item) => item.correct).length}/{Object.keys(graded).length} câu đúng</strong>}</div>}
    {graded && recommendedUnit && <section className="ll-recommendation"><strong>Gợi ý bắt đầu: chặng {recommendedUnit.level}</strong><p>{recommendedUnit.title}. Đây là gợi ý từ các nhóm câu đã làm; bạn vẫn có thể chọn bất kỳ mô-đun nào.</p><Link className="ll-primary" href={`${BASE}/module/${recommendedUnit.id}`}>Vào mô-đun {recommendedUnit.id} <ArrowRight size={16}/></Link></section>}
  </div>;
}

function ReviewPage() {
  const [errors, setErrors] = useState<Record<string, PracticeResult & { updatedAt?: string }> | null>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => { let alive = true; void listPracticeResults("listening-lab-error:v1:").then((data) => { if (alive) setErrors(data); }).catch(() => { if (alive) setErrors({}); }); return () => { alive = false; }; }, []);
  const wrong = Object.entries(errors ?? {}).filter(([, result]) => result.correct === 0).sort((a, b) => (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? ""));
  return <div className="ll-page"><nav className="ll-breadcrumb"><Link href={BASE}>Listening Lab</Link><span>›</span><span>Ôn lỗi</span></nav><header className="ll-module-hero"><span className="ll-eyebrow">ÔN LỖI CỦA TÔI</span><h1>Quay lại chỗ nghe sai</h1><p>Mỗi câu sai được lưu riêng. Xem đoạn làm bằng chứng rồi luyện thêm bằng một bản ghi khác.</p></header>
    {errors === null ? <p>Đang tải lỗi cần ôn…</p> : !wrong.length ? <section className="ll-recording"><h2>Chưa có lỗi cần ôn</h2><p>Hãy bắt đầu một mô-đun rồi nộp bài để xem điểm cần luyện thêm.</p><Link href={BASE}>Xem lộ trình <ArrowRight size={15}/></Link></section> : <div className="ll-review-list">{wrong.map(([slug, result]) => { const [, , id, phase, lessonId, questionId] = slug.split(":"); const unit = listeningModules.find((item) => item.id === id); const due = result.updatedAt ? new Date(new Date(result.updatedAt).getTime() + 2 * 86400000) : null;
      const nextPhase: ListeningPhase = phase === "guided" ? "independent" : phase === "independent" ? "transfer" : "independent";
      return <section key={slug} className="ll-review-item"><div className="ll-review-row"><span>{unit?.title ?? `Mô-đun ${id}`}<small>{lessonId} · {questionId} · {phaseLabels[phase as ListeningPhase] ?? phase}{due && due > new Date() ? ` · Ôn từ ${due.toLocaleDateString("vi-VN")}` : ""}</small></span><div><button type="button" onClick={() => setSelected((current) => current === slug ? "" : slug)}>{selected === slug ? "Ẩn bằng chứng" : "Xem bằng chứng"}</button><Link href={`${BASE}/module/${id}#${nextPhase}`}>Luyện bản ghi khác <ArrowRight size={15}/></Link></div></div>{selected === slug && <ReviewEvidence lessonId={lessonId} questionId={questionId}/>}</section>;
    })}</div>}
  </div>;
}

function ReviewEvidence({ lessonId, questionId }: { lessonId: string; questionId: string }) {
  const [review, setReview] = useState<{ result: GradedQuestion; lesson: PublicLesson } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void Promise.all([fetch(`/api/dictation/skill-lab/${lessonId}/grade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: lessonId.startsWith("FND2-") ? "practice" : "ielts", question_ids: [questionId], answers: {} }) }),
      fetch(`/api/dictation/skill-lab/${lessonId}`, { cache: "no-store" })]).then(async ([gradeResponse, lessonResponse]) => {
      const [gradeBody, lessonBody] = await Promise.all([gradeResponse.json(), lessonResponse.json()]);
      if (!gradeResponse.ok || !lessonResponse.ok) throw new Error(gradeBody.error ?? lessonBody.error ?? "Không tải được bằng chứng.");
      if (!gradeBody.results?.[0]) throw new Error("Câu hỏi này không còn trong bài nguồn.");
      if (alive) setReview({ result: gradeBody.results[0] as GradedQuestion, lesson: lessonBody.lesson as PublicLesson });
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bằng chứng."); });
    return () => { alive = false; };
  }, [lessonId, questionId]);
  if (error) return <p className="ll-error" role="alert">{error}</p>;
  if (!review) return <p className="ll-review-evidence">Đang tải bằng chứng…</p>;
  return <div className="ll-review-evidence"><strong>Đáp án: {review.result.accepted_answers.join(" / ")}</strong><p>{review.result.explanation_vi}</p>{review.result.evidence.map((item) => {
    const clip = review.lesson.turns.find((turn) => turn.source_turn_id === item.turn_id && turn.audio_url);
    return <div key={item.turn_id}><p><b>{item.turn_id}:</b> {item.text_en}{item.translation_vi && <em> · {item.translation_vi}</em>}</p>{clip?.audio_url && <audio controls preload="none" src={clip.audio_url} aria-label={`Nghe lại ${item.turn_id}`} />}</div>;
  })}</div>;
}
