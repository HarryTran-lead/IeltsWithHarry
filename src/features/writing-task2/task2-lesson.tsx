"use client";
/*
 * A Writing Task 2 lesson in four short screens: understand the prompt, learn how (model, thinking steps,
 * grammar), practise one drill at a time, then write and check. The prompt, vocabulary and terms stay in a
 * side desk, so the learner never scrolls back up to reread the question.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowRight, BookOpen, BookOpenCheck, Check, CheckCircle2, ChevronDown, Eye, Languages, ListChecks, PenLine, Save, Target, Wand2 } from "lucide-react";
import { drillGuides, glossary, guideFor, stageChecklists, stageWriting, typeGuides } from "@/lib/writing-task2/guides";
import {
  TASK2_API, TASK2_BASE, countWords, drillSaved, essaySaved, questionTypeLabels, stageInfo, writingTargets,
  type Task2DrillAnswer, type Task2Lesson, type Task2LessonSummary, type Task2ModelEssay, type Task2Stage, type Task2State,
} from "@/lib/writing-task2/types";
import { DrillCard, type DrillSave } from "./task2-drill";
import { cacheTask2State, emptyTask2State, loadTask2State, revealTask2, saveTask2State } from "./task2-state";
import { AnnotatedText, AnnotationList, emptyExplanation, withTerms } from "./task2-text";
import { LessonBar, LessonDone, LessonLocked } from "@/features/self-study-path/study-path";
import { buildPath } from "@/lib/self-study-path/path";
import { readTask2Level, task2LessonsCourse, task2LessonsProgress } from "@/lib/self-study-path/task2";
import { loadAllTask2States } from "./task2-state";
import { useSkillFor } from "./task2-path";

type Step = "read" | "learn" | "drills" | "write";
const stepIds: Step[] = ["read", "learn", "drills", "write"];
const themeStyle = (stage: Task2Stage) => ({ "--ll-tone": stageInfo[stage].tone, "--ll-soft": stageInfo[stage].soft }) as CSSProperties;
const typeLabel = (type: string) => questionTypeLabels[type] ?? type;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được dữ liệu.");
  return body as T;
}

export function LessonPage({ id }: { id: string }) {
  const [lesson, setLesson] = useState<Task2Lesson | null>(null);
  const [list, setList] = useState<Task2LessonSummary[]>([]);
  const [state, setState] = useState<Task2State | null>(null);
  const [step, setStep] = useState<Step>("read");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Task2DrillAnswer>>({});
  const [model, setModel] = useState<Task2ModelEssay | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visited, setVisited] = useState(0);
  const [locked, setLocked] = useState<{ title: string; href?: string } | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getJson<{ lesson: Task2Lesson }>(`${TASK2_API}/${encodeURIComponent(id)}`),
      getJson<{ lessons: Task2LessonSummary[] }>(TASK2_API).catch(() => ({ lessons: [] as Task2LessonSummary[] })),
      loadTask2State(id).catch(() => emptyTask2State()),
    ]).then(async ([{ lesson: loaded }, { lessons }, saved]) => {
      if (!alive) return;
      setLesson(loaded); setList(lessons); setState(saved);
      const done = loaded.drills.filter((drill) => drillSaved(saved, drill.id));
      const hash = window.location.hash.slice(1) as Step;
      const firstOpen = loaded.drills.findIndex((drill) => !drillSaved(saved, drill.id));
      setCurrent(firstOpen >= 0 ? firstOpen : 0);
      const resume: Step = essaySaved(saved, loaded.stage) || done.length === loaded.drills.length ? "write" : done.length ? "drills" : "read";
      // A link may point at a later step, but not past the furthest step the learner has reached.
      setStep(stepIds.includes(hash) && stepIds.indexOf(hash) <= stepIds.indexOf(resume) ? hash : resume);
      setVisited(stepIds.indexOf(resume));
      // Lessons open in path order: a lesson not reached yet sends the learner to the one that is.
      if (lessons.length) {
        void loadAllTask2States(lessons.map((item) => item.id)).then((all) => {
          if (!alive) return;
          const view = buildPath(task2LessonsCourse(lessons), task2LessonsProgress(lessons, { ...all, [loaded.id]: saved }, readTask2Level()));
          const node = view.stages.flatMap((stage) => stage.nodes).find((item) => item.id === loaded.id);
          const next = view.next?.node;
          if (node?.status === "locked") setLocked({ title: next ? `Bài ${next.number} · ${next.title}` : "", href: next?.href });
        }).catch(() => undefined);
      }
      // Answers the learner already earned or opened come back without another click.
      const targets = [...new Set([...done.map((drill) => drill.id), ...Object.keys(saved.peeked).filter((key) => key !== "essay")])];
      if (essaySaved(saved, loaded.stage) || saved.peeked.essay) targets.push("essay");
      if (targets.length) {
        const revealed = await revealTask2(loaded.id, targets, saved, true).catch(() => null);
        if (alive && revealed) { setAnswers(revealed.drills); if (revealed.model_essay !== undefined) setModel(revealed.model_essay); }
      }
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài học."); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);

  /** Typing is kept in the browser at once and synced to the account a moment after the learner pauses. */
  function update(change: (current: Task2State) => Task2State) {
    setState((previous) => {
      if (!previous) return previous;
      const next = { ...change(previous), updatedAt: Date.now() };
      cacheTask2State(id, next);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => { void saveTask2State(id, next).catch(() => undefined); }, 2500);
      return next;
    });
  }

  async function persist(next: Task2State) {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setState(next);
    await saveTask2State(id, next);
  }

  async function saveDrill(drillId: string, save: DrillSave) {
    if (!state || !lesson) return;
    const next: Task2State = {
      ...state, answers: { ...state.answers, [drillId]: save.answer }, saved: { ...state.saved, [drillId]: new Date().toISOString() },
      ...(save.choice !== undefined && { choices: { ...state.choices, [drillId]: save.choice } }),
      ...(save.fills && { fills: { ...state.fills, [drillId]: save.fills } }),
      updatedAt: Date.now(),
    };
    setBusy(drillId); setError("");
    try {
      await persist(next).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Chưa lưu được vào tài khoản."));
      const revealed = await revealTask2(lesson.id, [drillId], next, true);
      setAnswers((previous) => ({ ...previous, ...revealed.drills }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa mở được đáp án.");
    } finally { setBusy(""); }
  }

  async function peek(target: string) {
    if (!state || !lesson) return;
    setBusy(target); setError("");
    try {
      const revealed = await revealTask2(lesson.id, [target], state, true);
      if (target === "essay") setModel(revealed.model_essay ?? null);
      else setAnswers((previous) => ({ ...previous, ...revealed.drills }));
      const done = target === "essay" ? essaySaved(state, lesson.stage) : drillSaved(state, target);
      if (!done) update((previous) => ({ ...previous, peeked: { ...previous.peeked, [target]: new Date().toISOString() } }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa mở được đáp án.");
    } finally { setBusy(""); }
  }

  async function saveEssay() {
    if (!state || !lesson) return;
    const next: Task2State = { ...state, essaySavedAt: new Date().toISOString(), updatedAt: Date.now() };
    setBusy("essay"); setError(""); setNotice("");
    try {
      await persist(next);
      const words = countWords(next.essay);
      const min = writingTargets[lesson.stage].min;
      if (!essaySaved(next, lesson.stage)) { setNotice(`Đã lưu (${words} từ). Viết từ ${min} từ trở lên để hoàn thành bài học.`); return; }
      setNotice(`Đã lưu bài viết (${words} từ).`);
      if (model === undefined && lesson.has_model_essay) {
        const revealed = await revealTask2(lesson.id, ["essay"], next, true);
        setModel(revealed.model_essay ?? null);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa lưu được bài.");
    } finally { setBusy(""); }
  }

  function go(target: Step) {
    setStep(target);
    setVisited((value) => Math.max(value, stepIds.indexOf(target)));
    history.replaceState(null, "", `#${target}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goDrill(index: number) {
    setCurrent(index);
    document.querySelector(".t2-drill-pills")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (error && !lesson) return <div className="ll-page t2-lab"><Breadcrumb current="Không tải được"/><p className="ll-error" role="alert">{error}</p></div>;
  if (!lesson || !state) return <div className="ll-page t2-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const index = list.findIndex((item) => item.id === lesson.id);
  const number = index >= 0 ? String(index + 1).padStart(2, "0") : "";
  const nextLesson = index >= 0 ? list[index + 1] : undefined;
  const savedDrills = lesson.drills.filter((drill) => drillSaved(state, drill.id)).length;
  const target = writingTargets[lesson.stage];
  const essayDone = essaySaved(state, lesson.stage);
  const steps: { id: Step; label: string; hint: string; score: string; pass: boolean }[] = [
    { id: "read", label: "Hiểu đề", hint: "Đề hỏi gì, dàn bài", score: "", pass: savedDrills > 0 || step !== "read" },
    { id: "learn", label: "Học cách làm", hint: lesson.mini_lesson ? "Bài giảng, mẫu, ngữ pháp" : "Các bước tư duy, câu mẫu", score: "", pass: savedDrills > 0 },
    { id: "drills", label: "Luyện từng câu", hint: "Có cách làm và gợi ý", score: `${savedDrills}/${lesson.drills.length}`, pass: savedDrills === lesson.drills.length },
    { id: "write", label: target.label, hint: "Ghép nháp, tự kiểm tra", score: essayDone ? `${countWords(state.essay)} từ` : "", pass: essayDone },
  ];
  const drill = lesson.drills[current];
  const position = stepIds.indexOf(step);
  const lessonName = `${number ? `Bài ${Number(number)} · ` : ""}${lesson.topic}`;
  const complete = essayDone && savedDrills === lesson.drills.length;

  if (locked) return <LessonLocked title={lessonName} nextTitle={locked.title} nextHref={locked.href} pathHref={`${TASK2_BASE}?tab=luyen-de`}/>;

  return <div className="ll-page ll-module t2-lab t2-lesson sp-kit" style={themeStyle(lesson.stage)}>
    <header className="t2-lessonbar">
      <LessonBar exitHref={`${TASK2_BASE}?tab=luyen-de`} kicker={`Writing Task 2 · Luyện đề · ${stageInfo[lesson.stage].name}`} title={lessonName}
        info={<>
          <p>{typeLabel(lesson.question_type)} · {lesson.minutes} phút · mức luyện {lesson.target_range}</p>
          <p>{withTerms(lesson.goal_vi)}</p>
        </>}
        steps={steps.map((item) => ({ label: item.label, note: item.score || item.hint, pass: item.pass }))} step={position}
        reached={Math.max(visited, ...steps.map((item, index) => item.pass ? Math.min(index + 1, stepIds.length - 1) : 0))}
        onPick={(index) => go(stepIds[index])}/>
    </header>

    {error && <p className="ll-error" role="alert">{error}</p>}

    <div className="t2-layout">
      <div className="t2-main">
        {step === "read" && <ReadStep lesson={lesson} onNext={() => go("learn")}/>}
        {step === "learn" && <LearnStep lesson={lesson} onNext={() => go("drills")}/>}
        {step === "drills" && drill && <>
          <div className="t2-drill-pills" role="tablist" aria-label="Các câu luyện">
            {lesson.drills.map((item, i) => {
              const done = drillSaved(state, item.id);
              const peeked = !done && Boolean(state.peeked[item.id]);
              return <button key={item.id} type="button" role="tab" aria-selected={i === current} className={`${done ? "is-done" : ""} ${peeked ? "is-peeked" : ""}`}
                title={`Câu ${i + 1}: ${guideFor(item).name}${done ? " · đã làm" : peeked ? " · đã xem mẫu" : ""}`} onClick={() => goDrill(i)}>
                {done ? <Check size={13} strokeWidth={3}/> : i + 1}
              </button>;
            })}
            <small>{savedDrills}/{lesson.drills.length} câu đã làm</small>
          </div>
          <DrillCard key={drill.id} lesson={lesson} drill={drill} index={current} state={state} answer={answers[drill.id]} busy={busy === drill.id}
            onChange={(value) => update((previous) => ({ ...previous, answers: { ...previous.answers, [drill.id]: value } }))}
            onSave={(save) => void saveDrill(drill.id, save)} onPeek={() => void peek(drill.id)}
            onPrev={current > 0 ? () => goDrill(current - 1) : undefined}
            onNext={() => current < lesson.drills.length - 1 ? goDrill(current + 1) : go("write")}
            nextLabel={current < lesson.drills.length - 1 ? "Câu tiếp" : `Sang bước ${target.label.toLowerCase()}`}/>
        </>}
        {step === "write" && <WriteStep lesson={lesson} state={state} answers={answers} model={model} busy={busy} notice={notice}
          onEssay={(essay) => update((previous) => ({ ...previous, essay }))}
          onCheck={(key, checked) => update((previous) => ({ ...previous, checklist: { ...previous.checklist, [key]: checked } }))}
          onSave={() => void saveEssay()} onPeek={() => void peek("essay")}/>}
        {step === "write" && complete && <LessonDone embedded title={`Xong ${lessonName}`}
          stats={[{ label: "Câu luyện", value: `${savedDrills}/${lesson.drills.length}` }, { label: "Bài viết", value: `${countWords(state.essay)} từ` }, { label: "Thời lượng", value: `${lesson.minutes} phút` }]}
          nextLabel={nextLesson ? "Sang bài tiếp theo" : undefined} nextHref={nextLesson ? `${TASK2_BASE}/${nextLesson.id}` : undefined} pathHref={`${TASK2_BASE}?tab=luyen-de`}/>}
        {step === "write" && essayDone && !complete && <p className="ll-tip"><ListChecks size={16}/> Bài viết đã lưu. Còn {lesson.drills.length - savedDrills} câu luyện ở bước “Luyện từng câu” chưa làm; làm xong mới hoàn thành bài và mở bài tiếp theo.</p>}
      </div>
      <PromptDesk lesson={lesson}/>
    </div>

    <p className="ll-footnote">Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Bài làm được lưu vào tài khoản của bạn; tiến độ không quy đổi sang band.</p>
  </div>;
}

/* ───────────── Side desk: prompt, vocabulary, terms ───────────── */

function PromptDesk({ lesson }: { lesson: Task2Lesson }) {
  const [tab, setTab] = useState<"prompt" | "vocab" | "terms">("prompt");
  const [open, setOpen] = useState(false);
  const [translated, setTranslated] = useState(false);
  const type = typeGuides[lesson.question_type];
  return <aside className={`t2-desk ${open ? "is-open" : ""}`} aria-label="Đề bài và công cụ">
    <button type="button" className="t2-desk-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <BookOpen size={16}/><span><b>Đề bài</b><small lang="en">{lesson.prompt}</small></span><ChevronDown size={16}/>
    </button>
    <div className="t2-desk-body">
      <div className="t2-tabs" role="tablist">
        {([["prompt", "Đề bài"], ["vocab", `Từ vựng (${lesson.vocabulary.length})`], ["terms", "Thuật ngữ"]] as const).map(([key, label]) =>
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      {tab === "prompt" && <div className="t2-desk-pane">
        <p className="t2-desk-prompt" lang="en">{lesson.prompt}</p>
        {lesson.prompt_vi && <>
          <button type="button" className="t2-link-btn" onClick={() => setTranslated(!translated)}><Languages size={14}/> {translated ? "Ẩn bản dịch" : "Xem bản dịch"}</button>
          {translated && <p className="t2-vi">{lesson.prompt_vi}</p>}
        </>}
        <dl className="t2-desk-facts">
          <div><dt>Dạng đề</dt><dd>{typeLabel(lesson.question_type)}</dd></div>
          <div><dt>Đề hỏi gì</dt><dd>{withTerms(lesson.prompt_analysis?.task_vi ?? type?.asks_vi)}</dd></div>
          <div><dt>Bạn cần viết</dt><dd>{stageWriting[lesson.stage].ask_vi}</dd></div>
        </dl>
      </div>}
      {tab === "vocab" && <ul className="t2-desk-vocab">{lesson.vocabulary.map((word) => <li key={word.phrase_en}>
        <b lang="en">{word.phrase_en}</b><span>{word.meaning_vi}</span>
        {word.example_en && <small lang="en">{word.example_en}</small>}
      </li>)}</ul>}
      {tab === "terms" && <dl className="t2-desk-terms">{glossary.filter((entry) => entry.term.length > 3).map((entry) => <div key={entry.term}><dt>{entry.term}</dt><dd>{entry.vi}</dd></div>)}</dl>}
    </div>
  </aside>;
}

/* ───────────── Step 1: understand the prompt ───────────── */

function ReadStep({ lesson, onNext }: { lesson: Task2Lesson; onNext: () => void }) {
  const type = typeGuides[lesson.question_type];
  const analysis = lesson.prompt_analysis;
  const early = lesson.stage === "foundation" || lesson.stage === "basic";
  return <>
    <section className="t2-panel">
      <span className="ll-kicker">Bước 1 · Hiểu đề</span>
      <h2>Đề này hỏi gì?</h2>
      <p className="t2-lead">{withTerms(analysis?.task_vi ?? type?.asks_vi)}</p>
      {analysis?.keywords.length ? <ul className="t2-keywords" aria-label="Từ khoá trong đề">{analysis.keywords.map((word) => <li key={word.en}><b lang="en">{word.en}</b><span>{word.vi}</span></li>)}</ul> : null}
      {(analysis?.trap_vi ?? type?.trap_vi) && <p className="t2-warn"><AlertTriangle size={16}/><span><b>Bẫy dễ mắc</b>{withTerms(analysis?.trap_vi ?? type?.trap_vi)}</span></p>}
    </section>
    <section className="t2-panel">
      <h2>{early ? "Bạn sẽ viết những câu này" : "Dàn bài cho dạng đề này"}</h2>
      {early
        ? <ol className="t2-outline-list">{stageWriting[lesson.stage].outline.map((part) => <li key={part.part_vi}><b>{part.part_vi}</b><code lang="en">{part.frame_en}</code></li>)}</ol>
        : <ol className="t2-outline-list">{(type?.plan_vi ?? []).map((part) => <li key={part}><b>{withTerms(part)}</b></li>)}</ol>}
      <p className="t2-target"><Target size={15}/><span><b>Mục tiêu hoàn thành:</b> {withTerms(lesson.target_vi)}</span></p>
    </section>
    <SkillLink questionType={lesson.question_type}/>
    <div className="t2-next"><button type="button" className="ll-btn ll-btn-primary" onClick={onNext}>Tiếp: học cách làm <ArrowRight size={16}/></button></div>
  </>;
}

/** Points a prompt lesson back at the skills milestone that teaches its question type (R09–R12). */
function SkillLink({ questionType }: { questionType: string }) {
  const found = useSkillFor(questionType);
  if (!found) return null;
  const { module: milestone, node } = found;
  const open = node && node.status !== "locked" && node.href;
  const state = node?.status === "done" ? "Bạn đã học xong chặng này, xem lại khi cần." : open ? "Nên học chặng này trước hoặc song song với đề này." : "Chặng này mở khi bạn học tới đó trong Khoá kỹ năng.";
  return <aside className="t2-skill-link">
    <span><small>Kỹ năng cho dạng đề này · Khoá kỹ năng</small><b>{milestone.id} · {milestone.title}</b><em>{state}</em></span>
    {open && <Link className="ll-btn" href={node.href!}>Học kỹ năng <ArrowRight size={15}/></Link>}
  </aside>;
}

/* ───────────── Step 2: learn how ───────────── */

function LearnStep({ lesson, onNext }: { lesson: Task2Lesson; onNext: () => void }) {
  const [vi, setVi] = useState(false);
  const mini = lesson.mini_lesson;
  const grammar = lesson.grammar_focus;
  const hasVi = lesson.steps.some((item) => item.sample_vi) || Boolean(mini?.worked_example_vi);
  return <>
    {mini && <section className="t2-panel">
      <span className="ll-kicker">Bước 2 · Học cách làm</span>
      <h2>Bài giảng ngắn</h2>
      <p className="t2-lead">{withTerms(mini.explain_vi)}</p>
      {mini.frame_en && <p className="t2-frame-show"><span>Khung câu</span><code lang="en">{mini.frame_en}</code></p>}
      {mini.worked_example_en && <div className="t2-worked">
        <div className="t2-panel-head"><span className="ll-kicker">Ví dụ mẫu, mổ xẻ từng phần</span>{mini.worked_example_vi && <button type="button" className="t2-link-btn" onClick={() => setVi(!vi)}><Languages size={14}/> {vi ? "Ẩn bản dịch" : "Xem bản dịch"}</button>}</div>
        <AnnotatedText text={mini.worked_example_en} annotations={mini.annotations}/>
        {vi && mini.worked_example_vi && <p className="t2-vi">{mini.worked_example_vi}</p>}
        <AnnotationList annotations={mini.annotations}/>
      </div>}
      {mini.good_vs_bad?.length ? <div className="t2-compare">{mini.good_vs_bad.map((pair, i) => <div key={i}>
        <p className="is-bad" lang="en"><b>Chưa tốt</b>{pair.bad_en}</p>
        <p className="is-good" lang="en"><b>Tốt hơn</b>{pair.good_en}</p>
        <small>{withTerms(pair.why_vi)}</small>
      </div>)}</div> : null}
    </section>}

    <section className="t2-panel">
      {!mini && <span className="ll-kicker">Bước 2 · Học cách làm</span>}
      <div className="t2-panel-head"><h2>Các bước tư duy</h2>{hasVi && <button type="button" className="t2-link-btn" onClick={() => setVi(!vi)}><Languages size={14}/> {vi ? "Ẩn bản dịch" : "Xem bản dịch"}</button>}</div>
      <ol className="t2-steps">{lesson.steps.map((item, i) => <li key={i}>
        <span className="t2-step-num">{i + 1}</span>
        <div><b>{withTerms(item.title_vi)}</b><p>{withTerms(item.instruction_vi)}</p>
          {item.sample_en && <blockquote lang="en">{item.sample_en}</blockquote>}
          {vi && item.sample_vi && <p className="t2-vi">{item.sample_vi}</p>}
        </div>
      </li>)}</ol>
      {!lesson.steps.some((item) => item.sample_en) && <p className="t2-soft">Bài này chưa có câu mẫu cho từng bước. Mỗi câu luyện ở bước sau đều có phần Cách làm, khung câu và đáp án mẫu.</p>}
    </section>

    {grammar && <GrammarPanel grammar={grammar}/>}

    <div className="t2-next"><button type="button" className="ll-btn ll-btn-primary" onClick={onNext}>Bắt đầu luyện {lesson.drills.length} câu <ArrowRight size={16}/></button></div>
  </>;
}

function GrammarPanel({ grammar }: { grammar: NonNullable<Task2Lesson["grammar_focus"]> }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return <section className="t2-panel">
    <span className="ll-kicker">Ngữ pháp trọng tâm</span>
    <h2>{grammar.name_vi}</h2>
    <p className="t2-lead">{withTerms(grammar.explain_vi)}</p>
    <ul className="t2-examples">{grammar.examples.map((example) => <li key={example.en}><span lang="en">{example.en}</span><small>{example.vi}</small></li>)}</ul>
    {grammar.drills?.length ? <ol className="t2-mini-drills">{grammar.drills.map((item, i) => <li key={i}>
      <span>{item.task_vi}</span>
      {open[i] ? <code lang="en">{item.answer_en}</code> : <button type="button" className="t2-link-btn" onClick={() => setOpen({ ...open, [i]: true })}><Eye size={14}/> Xem đáp án</button>}
    </li>)}</ol> : null}
  </section>;
}

/* ───────────── Step 4: write and check ───────────── */

/**
 * The learner's own saved drill sentences, put in essay order, so the draft starts from work already done.
 * A picked option joins the draft only when it was the right one.
 */
function draftFrom(lesson: Task2Lesson, state: Task2State, answers: Record<string, Task2DrillAnswer>) {
  const usable = (drill: Task2Lesson["drills"][number]) => drillSaved(state, drill.id) && (!drill.options?.length || (answers[drill.id]?.correct !== undefined && state.choices[drill.id] === answers[drill.id].correct));
  const take = (guides: object[]) => lesson.drills.filter((drill) => guides.includes(guideFor(drill)) && usable(drill)).map((drill) => state.answers[drill.id].trim()).filter(Boolean);
  const intro = take([drillGuides.paraphrase, drillGuides.thesis]);
  const body1 = take([drillGuides.topic_sentence, drillGuides.causal_chain, drillGuides.example_check]);
  const body2 = take([drillGuides.second_side, drillGuides.nuance]);
  if (lesson.stage === "foundation") return [...intro, ...body1].join(" ");
  if (lesson.stage === "basic") return [intro.join(" "), [...body1, ...body2].join(" ")].filter(Boolean).join("\n\n");
  return [intro.join(" "), body1.join(" "), body2.join(" ")].filter(Boolean).join("\n\n");
}

type WriteProps = {
  lesson: Task2Lesson; state: Task2State; answers: Record<string, Task2DrillAnswer>; model: Task2ModelEssay | null | undefined; busy: string; notice: string;
  onEssay: (essay: string) => void; onCheck: (key: string, checked: boolean) => void; onSave: () => void; onPeek: () => void;
};

function WriteStep({ lesson, state, answers, model, busy, notice, onEssay, onCheck, onSave, onPeek }: WriteProps) {
  const [vi, setVi] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const target = writingTargets[lesson.stage];
  const words = countWords(state.essay);
  const draft = draftFrom(lesson, state, answers);
  const checks = lesson.self_check_vi?.length ? lesson.self_check_vi.map((text, i) => ({ id: `own-${i}`, criterion: "", text })) : stageChecklists[lesson.stage];
  const ticked = checks.filter((item) => state.checklist[item.id]).length;
  const done = essaySaved(state, lesson.stage);

  function insert(frame: string) {
    const element = area.current;
    const text = state.essay;
    const at = element ? element.selectionEnd : text.length;
    const before = text.slice(0, at).replace(/\s*$/, "");
    const next = `${before}${before ? " " : ""}${frame} ${text.slice(at).replace(/^\s*/, "")}`.trimEnd();
    onEssay(next);
    requestAnimationFrame(() => { element?.focus(); const caret = before.length + (before ? 1 : 0) + frame.indexOf("___"); element?.setSelectionRange(caret, caret + 3); });
  }

  return <>
    <section className="t2-panel t2-write-panel">
      <div className="t2-panel-head">
        <div><span className="ll-kicker">Bước 4 · {target.label}</span><h2>{stageWriting[lesson.stage].ask_vi}</h2></div>
        {draft && !state.essay.trim() && <button type="button" className="ll-btn" onClick={() => onEssay(draft)}><Wand2 size={15}/> Ghép câu từ bài luyện</button>}
      </div>
      <div className="t2-scaffold" aria-label="Khung bài, bấm để chèn">
        {stageWriting[lesson.stage].outline.map((part) => <button type="button" key={part.part_vi} onClick={() => insert(part.frame_en)} title="Chèn khung câu vào chỗ con trỏ">
          <b>{part.part_vi}</b><span lang="en">{part.frame_en}</span>
        </button>)}
      </div>
      <textarea ref={area} className="t2-text t2-essay-text" lang="en" rows={lesson.stage === "foundation" ? 5 : lesson.stage === "basic" ? 9 : 14} value={state.essay}
        placeholder={draft ? "Bấm \"Ghép câu từ bài luyện\" để bắt đầu từ các câu bạn đã viết, hoặc bấm một khung ở trên." : "Bấm một khung ở trên để bắt đầu, rồi thay ___ bằng ý của bạn."}
        aria-label="Bài viết" onChange={(event) => onEssay(event.target.value)}/>
      <div className="t2-row">
        <span className={`t2-words ${words >= target.goal ? "is-good" : words >= target.min ? "is-fair" : ""}`}>
          <b>{words}</b> / {target.goal} từ<i aria-hidden="true"><em style={{ width: `${Math.min(100, (words / target.goal) * 100)}%` }}/></i>
        </span>
        {notice && <small className="t2-notice"><CheckCircle2 size={14}/> {notice}</small>}
        <button type="button" className="ll-btn ll-btn-primary" disabled={busy === "essay" || !state.essay.trim()} onClick={onSave}><Save size={15}/>{busy === "essay" ? "Đang lưu…" : "Lưu bài viết"}</button>
      </div>
    </section>

    <section className="t2-panel">
      <div className="t2-panel-head"><h2><ListChecks size={18}/> Tự kiểm tra</h2><small>{ticked}/{checks.length}</small></div>
      <ul className="t2-checklist">{checks.map((item) => <li key={item.id}><label>
        <input type="checkbox" checked={Boolean(state.checklist[item.id])} onChange={(event) => onCheck(item.id, event.target.checked)}/>
        {item.criterion && <span className="t2-criterion">{withTerms(item.criterion)}</span>}<span>{withTerms(item.text)}</span>
      </label></li>)}</ul>
    </section>

    {model ? <section className="t2-panel t2-model">
      <div className="t2-panel-head">
        <div><span className="ll-kicker">Bài mẫu tham khảo · khoảng {model.word_count} từ</span><h2 lang="en">{model.title}</h2></div>
        {model.text_vi && <button type="button" className="t2-link-btn" onClick={() => setVi(!vi)}><Languages size={14}/> {vi ? "Ẩn bản dịch" : "Xem bản dịch"}</button>}
      </div>
      <AnnotatedText text={model.essay} annotations={model.annotations}/>
      {vi && model.text_vi && <p className="t2-vi">{model.text_vi}</p>}
      <AnnotationList annotations={model.annotations}/>
      {!emptyExplanation(model.explanation_vi) && <div className="ll-tip"><span><BookOpenCheck size={17}/></span><p><b>Vì sao bài này hiệu quả</b>{withTerms(model.explanation_vi)}</p></div>}
      {model.outline_vi && <p className="t2-outline"><b>Dàn ý:</b> {model.outline_vi}</p>}
      <p className="ll-footnote">So cách lập luận và cách nối ý với bài của bạn. Đừng chép nguyên câu.</p>
    </section>
      : lesson.has_model_essay ? <div className="t2-model-gate">
        <p><PenLine size={16}/> {done ? "Đang mở bài mẫu…" : `Bài mẫu sẽ hiện sau khi bạn lưu bài từ ${target.min} từ. Tự viết trước rồi so sánh sẽ nhớ lâu hơn.`}</p>
        {!done && <button type="button" className="ll-btn" disabled={busy === "essay"} onClick={onPeek}><Eye size={15}/> Mình bí rồi, xem bài mẫu</button>}
      </div>
        : <p className="t2-soft">Bài này chưa có bài mẫu. Dùng bảng tự kiểm tra ở trên để rà lại bài, rồi so với đáp án mẫu của từng câu luyện.</p>}

    {lesson.review && (done || model) && <section className="t2-panel t2-review">
      <h2>Nhớ gì sau bài này</h2>
      <div className="t2-review-grid">
        <div><b>Ý chính</b><ul>{lesson.review.remember_vi.map((item) => <li key={item}>{withTerms(item)}</li>)}</ul></div>
        <div><b>Lỗi cần tránh</b><ul>{lesson.review.mistakes_vi.map((item) => <li key={item}>{withTerms(item)}</li>)}</ul></div>
      </div>
    </section>}

  </>;
}

function Breadcrumb({ current }: { current: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={`${TASK2_BASE}?tab=luyen-de`}>Writing Task 2 Lab · Luyện đề</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}
