"use client";
/*
 * Writing Task 1 Lab. A roadmap of three chặng, a "Bài 0" guide, and a lesson workspace built for self-learners:
 * the prompt and figure stay pinned beside the work (a sheet on phones), and each lesson teaches before it asks —
 * understand the task, read the figure one question at a time, study the key facts and a model, practise each
 * paragraph with a sentence frame, then write. It renders the F37 lessons today and the richer T1-DATA-v1 fields
 * (translation, keywords, annotated models, scaffolds, checklists) when they arrive.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, BookOpen, BookOpenCheck, Check, CheckCircle2, ChevronDown, Clock3, Compass, Eye, Image as ImageIcon,
  Languages, Lightbulb, ListChecks, PenLine, Save, Sparkles, Target, Wand2, X, XCircle,
} from "lucide-react";
import {
  TASK1_API, TASK1_BASE, countWords, drillModeLabels, drillSaved, essaySaved, modelFirst, modelParagraphs, partLabels,
  reportChecklist, stageInfo, writingTargets,
  type Task1Check, type Task1DrillAnswer, type Task1Lesson, type Task1LessonSummary, type Task1Model, type Task1Part, type Task1ScaffoldPart,
  type Task1Stage, type Task1State,
} from "@/lib/writing-task1/types";
import { TASK1_GUIDE_ID, drillFrames, essayFrame, groupGuides, guideFor, introGuide } from "@/lib/writing-task1/guide";
import { buildPath } from "@/lib/self-study-path/path";
import { TASK1_GUIDE_READ_KEY, task1Course, task1Progress } from "@/lib/self-study-path/task1";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { LessonBar, LessonDone, LessonFoot, LessonLocked, StudyPath } from "@/features/self-study-path/study-path";
import { Task1Figure } from "./task1-figure";
import { cacheTask1State, checkTask1, emptyTask1State, learnTask1, loadAllTask1States, loadTask1State, revealTask1, saveTask1State } from "./task1-state";
import "@/features/listening/listening-lab.css";
import "./writing-task1.css";

export function WritingTask1Lab() {
  const parts = usePathname().split("/").filter(Boolean);
  const id = parts[3] ? decodeURIComponent(parts[3]) : "";
  if (id === TASK1_GUIDE_ID) return <GuidePage/>;
  return id ? <LessonPage key={id} id={id}/> : <RoadmapPage/>;
}

const themeStyle = (stage: Task1Stage) => ({ "--ll-tone": stageInfo[stage].tone, "--ll-soft": stageInfo[stage].soft }) as CSSProperties;
const guideHref = `${TASK1_BASE}/${TASK1_GUIDE_ID}`;

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được dữ liệu.");
  return body as T;
}

/** Wraps each occurrence of the given phrases in <mark>, so the language a lesson teaches stands out in the model. */
function highlight(text: string, phrases: string[]): ReactNode {
  const terms = phrases.map((phrase) => phrase.trim()).filter((phrase) => phrase.length > 2);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((piece, index) => index % 2 ? <mark key={index}>{piece}</mark> : piece);
}

/**
 * The F37 Process items name boxes and arrows by graph codes ("box marked 01 (or n01)", "Mũi tên e01", "Cạnh e03").
 * Learners only see numbered boxes, so the codes are dropped until the T1-DATA-v1 rewrite replaces these items.
 */
function plain(text: string) {
  return text
    .replace(/\s*\(or n\d+\)/gi, "")
    .replace(/\s*\((?:e|n)\d{2}\)/gi, "")
    .replace(/\b(?:Mũi tên|Cạnh|Arrow|edge)\s+e\d{2}\b/gi, "Mũi tên này")
    .replace(/\bNhãn n0?(\d+)\b/gi, "Ô số $1")
    .replace(/\bNhãn ([a-l])\b/g, (_, letter: string) => `Ô số ${letter.charCodeAt(0) - 96}`)
    .replace(/\bn0?(\d+)\b/g, "ô $1")
    .replace(/\bcạnh\b/g, "mũi tên")
    .replace(/(^|[.!?]\s+)graph\b/gi, "$1Sơ đồ")
    .replace(/\bgraph\b/gi, "sơ đồ");
}

/* ───────────────────────── Roadmap ───────────────────────── */

const readGuideFlag = () => { try { return localStorage.getItem(TASK1_GUIDE_READ_KEY) === "1"; } catch { return false; } };

/** Lessons, the learner's saved work and the shared path built from both. Null until both have loaded. */
function useTask1Path() {
  const [lessons, setLessons] = useState<Task1LessonSummary[] | null>(null);
  const [states, setStates] = useState<Record<string, Task1State> | null>(null);
  const [guideRead, setGuideRead] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void getJson<{ lessons: Task1LessonSummary[] }>(TASK1_API).then(async ({ lessons: list }) => {
      if (!alive) return;
      setGuideRead(readGuideFlag());
      setLessons(list);
      const saved = await loadAllTask1States(list.map((lesson) => lesson.id)).catch(() => ({}));
      if (alive) setStates(saved);
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); });
    return () => { alive = false; };
  }, []);

  const course = useMemo(() => lessons ? task1Course(lessons) : null, [lessons]);
  const view = useMemo(() => course && lessons && states ? buildPath(course, task1Progress(lessons, states, guideRead)) : null, [course, lessons, states, guideRead]);
  return { lessons, course, view, error };
}

function RoadmapPage() {
  const { course, view, error } = useTask1Path();
  const streak = useLearnerStreak();
  if (error) return <div className="ll-page t1-lab"><p className="ll-error" role="alert">{error}</p></div>;
  if (!course || !view) return <div className="ll-page t1-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;
  return <StudyPath course={course} view={view} streak={streak?.current ?? 0}>
    <p className="sp-footnote"><Sparkles size={15} aria-hidden/> Đề, hình và bài mẫu là tài liệu luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Bài hoàn thành khi bạn lưu bài viết đủ độ dài; mức band ở đây là mức luyện nội bộ, không quy đổi sang band IELTS.</p>
  </StudyPath>;
}

/* ───────────────────────── Bài 0 guide ───────────────────────── */

function GuidePage() {
  const [group, setGroup] = useState("line");
  useEffect(() => {
    // Opening Bài 0 ticks it off on the path, so the first numbered lesson becomes the next step.
    try { localStorage.setItem(TASK1_GUIDE_READ_KEY, "1"); } catch { /* the path then waits for the first lesson */ }
    const hash = window.location.hash.slice(1);
    // Opening a type's guide from a lesson ("#dang-process") selects that tab.
    if (hash.startsWith("dang-") && groupGuides[hash.slice(5)]) queueMicrotask(() => setGroup(hash.slice(5)));
  }, []);
  const guide = guideFor(group);
  return <div className="ll-page t1-lab t1-guide-page" style={themeStyle("foundation")}>
    <Breadcrumb current="Bài 0 · Hướng dẫn"/>
    <header className="t1-head">
      <div className="ll-module-badge"><small>Bài</small><b>0</b></div>
      <div><span className="ll-kicker">Đọc trước khi học</span><h1>{introGuide.title_vi}</h1><p>{introGuide.lead_vi}</p></div>
    </header>
    <nav className="t1-toc" aria-label="Mục lục">{introGuide.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title_vi}</a>)}<a href="#dang-hinh">7. Cách đọc từng dạng hình</a></nav>
    <div className="t1-guide-grid">{introGuide.sections.map((section) => <section key={section.id} id={section.id} className="t1-panel">
      <h2>{section.title_vi}</h2>
      <ul className="t1-bullets">{section.body_vi.map((line) => <li key={line}>{line}</li>)}</ul>
      {section.examples && <div className="t1-examples">{section.examples.map((example) => <div key={example.en}><q lang="en">{example.en}</q>{example.note_vi && <small>{example.note_vi}</small>}</div>)}</div>}
    </section>)}</div>
    <section id="dang-hinh" className="t1-panel">
      <h2>7. Cách đọc từng dạng hình</h2>
      <div className="ll-typebar t1-guide-tabs" role="group" aria-label="Dạng hình">{Object.entries(groupGuides).map(([key, item]) => <button key={key} type="button" aria-pressed={group === key} onClick={() => { setGroup(key); history.replaceState(null, "", `#dang-${key}`); }}>{item.name_vi}</button>)}</div>
      <GroupGuideBody group={group}/>
      <p className="t1-guide-note"><b>Thì nên dùng:</b> {guide.tense_vi}</p>
    </section>
    <div className="t1-guide-foot"><Link className="ll-btn ll-btn-primary" href={TASK1_BASE}>Xong Bài 0 · về lộ trình <ArrowRight size={16}/></Link></div>
  </div>;
}

function GroupGuideBody({ group, compact = false }: { group: string; compact?: boolean }) {
  const guide = guideFor(group);
  return <div className="t1-group-guide">
    <p className="t1-lead">{guide.shows_vi}</p>
    <h3>Nhìn vào đâu</h3>
    <ol className="t1-look">{guide.look_for_vi.map((item) => <li key={item}>{item}</li>)}</ol>
    <h3>Khung Overview</h3>
    <p className="t1-frame" lang="en">{guide.overview_frame_en}</p>
    <h3>Chia hai đoạn thân bài</h3>
    <p>{guide.grouping_vi}</p>
    {!compact && <><h3>Cụm từ hay dùng</h3><PhraseTable rows={guide.phrases.map((phrase) => ({ en: phrase.en, vi: phrase.vi, example: phrase.example_en }))}/></>}
  </div>;
}

function PhraseTable({ rows }: { rows: { en: string; vi: string; example?: string }[] }) {
  return <ul className="t1-phrase-list">{rows.map((row) => <li key={row.en}><b lang="en">{row.en}</b><span>{row.vi}</span>{row.example && <q lang="en">{row.example}</q>}</li>)}</ul>;
}

/* ───────────────────────── Lesson workspace ───────────────────────── */

type Step = "understand" | "read" | "learn" | "drills" | "essay";
const stepIds: Step[] = ["understand", "read", "learn", "drills", "essay"];
const drillPart: Record<string, Task1Part> = { intro: "intro", overview: "overview", groups: "body1", plan: "body1", observe: "intro" };

function LessonPage({ id }: { id: string }) {
  const [lesson, setLesson] = useState<Task1Lesson | null>(null);
  const [number, setNumber] = useState("");
  const [nextId, setNextId] = useState("");
  const [state, setState] = useState<Task1State | null>(null);
  const [step, setStep] = useState<Step>("understand");
  const [answers, setAnswers] = useState<Record<string, Task1DrillAnswer>>({});
  const [model, setModel] = useState<Task1Model | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheet, setSheet] = useState(false);
  const [reached, setReached] = useState(0);
  const [locked, setLocked] = useState<{ title: string; href?: string } | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getJson<{ lesson: Task1Lesson }>(`${TASK1_API}/${encodeURIComponent(id)}`),
      getJson<{ lessons: Task1LessonSummary[] }>(TASK1_API).catch(() => ({ lessons: [] as Task1LessonSummary[] })),
      loadTask1State(id).catch(() => emptyTask1State()),
    ]).then(async ([{ lesson: loaded }, { lessons }, saved]) => {
      if (!alive) return;
      const index = lessons.findIndex((item) => item.id === loaded.id);
      setLesson(loaded); setState(saved);
      setNumber(index >= 0 ? String(index + 1).padStart(2, "0") : "");
      setNextId(index >= 0 && lessons[index + 1] ? lessons[index + 1].id : "");
      const hash = window.location.hash.slice(1) as Step;
      const drillsDone = loaded.drills.filter((drill) => drillSaved(saved, drill.id));
      const anyRead = loaded.checks.some((check) => saved.results[check.id]);
      const resume: Step = essaySaved(saved, loaded.stage) || drillsDone.length === loaded.drills.length ? "essay"
        : drillsDone.length ? "drills" : anyRead ? "read" : "understand";
      // A link may point at a later step (#essay), but not past the furthest step the learner has reached.
      const opening = stepIds.includes(hash) && stepIds.indexOf(hash) <= stepIds.indexOf(resume) ? hash : resume;
      setStep(opening);
      setReached(stepIds.indexOf(resume));
      // Lessons open in path order: a lesson that is not reached yet sends the learner to the one that is.
      if (lessons.length) {
        const all = await loadAllTask1States(lessons.map((item) => item.id)).catch(() => null);
        if (!alive) return;
        if (all) {
          const guideRead = (() => { try { return localStorage.getItem(TASK1_GUIDE_READ_KEY) === "1"; } catch { return false; } })();
          const view = buildPath(task1Course(lessons), task1Progress(lessons, { ...all, [loaded.id]: saved }, guideRead));
          const node = view.stages.flatMap((stage) => stage.nodes).find((item) => item.id === loaded.id);
          const next = view.next?.node;
          if (node?.status === "locked") setLocked({ title: next ? (next.number ? `Bài ${next.number} · ${next.title}` : next.title) : "", href: next?.href });
        }
      }
      // Guides already earned in an earlier visit open again without another click.
      const targets = [...drillsDone.map((drill) => drill.id), ...(essaySaved(saved, loaded.stage) ? ["essay"] : [])];
      if (targets.length) {
        const revealed = await revealTask1(loaded.id, targets, saved).catch(() => null);
        if (alive && revealed) { setAnswers(revealed.drills); if (revealed.model !== undefined) setModel(revealed.model); }
      }
      if (alive && modelFirst(loaded)) {
        const learned = await learnTask1(loaded.id).catch(() => undefined);
        if (alive && learned !== undefined) setModel((current) => current ?? learned);
      }
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài học."); });
    return () => { alive = false; };
  }, [id]);

  // Work is kept in the browser at once and synced to the account a moment after the learner pauses.
  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);
  function update(change: (current: Task1State) => Task1State) {
    setState((current) => {
      if (!current) return current;
      const next = { ...change(current), updatedAt: Date.now() };
      cacheTask1State(id, next);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => { void saveTask1State(id, next).catch(() => undefined); }, 2500);
      return next;
    });
  }

  async function checkOne(check: Task1Check) {
    if (!state || !lesson) return;
    const choice = state.choices[check.id];
    if (!choice || state.results[check.id]) return;
    setBusy(check.id); setError("");
    try {
      const results = await checkTask1(lesson.id, { [check.id]: choice });
      update((current) => ({ ...current, results: { ...current.results, ...results } }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa kiểm tra được.");
    } finally { setBusy(""); }
  }

  async function saveAndReveal(target: string) {
    if (!state || !lesson) return;
    const now = new Date().toISOString();
    const next: Task1State = target === "essay" ? { ...state, essaySavedAt: now, updatedAt: Date.now() } : { ...state, saved: { ...state.saved, [target]: now }, updatedAt: Date.now() };
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setBusy(target); setError(""); setNotice(""); setState(next);
    try {
      await saveTask1State(id, next);
      if (target === "essay" && !essaySaved(next, lesson.stage)) { setNotice(`Đã lưu (${countWords(next.essay)} từ). Viết từ ${writingTargets[lesson.stage].min} từ trở lên để hoàn thành bài${lesson.has_model && !modelFirst(lesson) ? " và mở bài mẫu" : ""}.`); return; }
      const revealed = await revealTask1(lesson.id, [target], next);
      if (target === "essay") { setModel((current) => revealed.model ?? current ?? null); setNotice("Đã lưu bài viết. Bài học đã hoàn thành."); }
      else setAnswers((current) => ({ ...current, ...revealed.drills }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa lưu được bài.");
    } finally { setBusy(""); }
  }

  function go(target: Step) {
    setStep(target);
    setReached((value) => Math.max(value, stepIds.indexOf(target)));
    history.replaceState(null, "", `#${target}`);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error && !lesson) return <div className="ll-page t1-lab"><Breadcrumb current="Không tải được"/><p className="ll-error" role="alert">{error}</p></div>;
  if (!lesson || !state) return <div className="ll-page t1-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const checked = lesson.checks.filter((check) => state.results[check.id]);
  const correct = checked.filter((check) => state.results[check.id].correct).length;
  const savedDrills = lesson.drills.filter((drill) => drillSaved(state, drill.id)).length;
  const words = countWords(state.essay);
  const target = writingTargets[lesson.stage];
  const done = essaySaved(state, lesson.stage);
  const steps: { id: Step; label: string; status: string; pass: boolean }[] = [
    { id: "understand", label: "Hiểu đề", status: "2 phút", pass: checked.length > 0 || savedDrills > 0 || done },
    { id: "read", label: "Đọc hình", status: checked.length ? `${correct}/${lesson.checks.length} đúng` : `${lesson.checks.length} câu`, pass: checked.length === lesson.checks.length },
    { id: "learn", label: modelFirst(lesson) ? "Học mẫu" : "Ý chính", status: modelFirst(lesson) ? "Bài mẫu" : "Cụm từ", pass: savedDrills > 0 || done },
    { id: "drills", label: "Luyện khung", status: `${savedDrills}/${lesson.drills.length} phần`, pass: savedDrills === lesson.drills.length },
    { id: "essay", label: "Viết bài", status: done ? `${words} từ` : `~${target.goal} từ`, pass: done },
  ];
  const index = stepIds.indexOf(step);
  const lessonName = `${number ? `Bài ${Number(number)} · ` : ""}${lesson.title}`;

  if (locked) return <LessonLocked title={lessonName} nextTitle={locked.title} nextHref={locked.href} pathHref={TASK1_BASE}/>;

  return <div className="ll-page t1-lab t1-lesson sp-kit" style={themeStyle(lesson.stage)}>
    <header className="t1-lessonbar">
      <LessonBar exitHref={TASK1_BASE} kicker={`Writing Task 1 · ${stageInfo[lesson.stage].name}`} title={lessonName}
        info={<>
          <p>{guideFor(lesson.group).name_vi} · <Clock3 size={12} aria-hidden/> {lesson.minutes} phút · mức luyện {lesson.target_range}</p>
          <p><Link href={`${guideHref}#dang-${lesson.group}`}><Compass size={13} aria-hidden/> Cách làm dạng này</Link></p>
          <p className="sp-info-note">Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Bài làm được lưu vào tài khoản của bạn; tiến độ không quy đổi sang band.</p>
        </>}
        steps={steps.map((item) => ({ label: item.label, note: item.status, pass: item.pass }))} step={index}
        reached={Math.max(reached, ...steps.map((item, position) => item.pass ? Math.min(position + 1, stepIds.length - 1) : 0))}
        onPick={(position) => go(stepIds[position])}/>
    </header>

    <div className="t1-work" ref={topRef} data-step={step}>
      <aside className="t1-side" aria-label="Đề bài và hình">
        <PromptCard lesson={lesson}/>
      </aside>

      <div className="t1-main">
        {error && <p className="ll-error" role="alert">{error}</p>}

        <section className="t1-stage" aria-live="polite">
          {step === "understand" && <UnderstandStep lesson={lesson} target={target}/>}
          {step === "read" && <ReadStep lesson={lesson} state={state} busy={busy} onChoose={(check, value) => update((current) => ({ ...current, choices: { ...current.choices, [check.id]: value } }))} onCheck={(check) => void checkOne(check)} onDone={() => go("learn")}/>}
          {step === "learn" && <LearnStep lesson={lesson} model={model}/>}
          {step === "drills" && <DrillsStep lesson={lesson} state={state} answers={answers} busy={busy}
            onType={(drillId, value) => update((current) => ({ ...current, answers: { ...current.answers, [drillId]: value } }))}
            onSave={(drillId) => void saveAndReveal(drillId)} onDone={() => go("essay")}/>}
          {step === "essay" && <EssayStep lesson={lesson} state={state} model={model} busy={busy} notice={notice} words={words}
            onType={(value) => update((current) => ({ ...current, essay: value }))}
            onCheck={(itemId, value) => update((current) => ({ ...current, checklist: { ...current.checklist, [itemId]: value } }))}
            onSave={() => void saveAndReveal("essay")}/>}
          {step === "essay" && done && <LessonDone embedded title={`Xong ${lessonName}`}
            stats={[
              { label: "Đọc hình đúng", value: `${correct}/${lesson.checks.length}` },
              { label: "Phần luyện", value: `${savedDrills}/${lesson.drills.length}` },
              { label: "Bài viết", value: `${words} từ` },
            ]}
            note={checked.length > correct ? `Có ${checked.length - correct} câu đọc hình chưa đúng: xem lại lời giải ở bước Đọc hình trước khi sang bài mới.` : undefined}
            nextLabel={nextId ? "Sang bài tiếp theo" : undefined} nextHref={nextId ? `${TASK1_BASE}/${nextId}` : undefined} pathHref={TASK1_BASE}/>}
        </section>

        <LessonFoot step={index} labels={steps.map((item) => item.label)} onStep={(position) => go(stepIds[position])}/>
      </div>
    </div>

    <button type="button" className="t1-fab" onClick={() => setSheet(true)}><ImageIcon size={17}/> Xem đề & hình</button>
    {sheet && <div className="t1-sheet" role="dialog" aria-modal="true" aria-label="Đề bài và hình" onClick={() => setSheet(false)}>
      <div className="t1-sheet-body" onClick={(event) => event.stopPropagation()}>
        <div className="t1-sheet-head"><b>Đề bài và hình</b><button type="button" className="t1-icon-btn" onClick={() => setSheet(false)} aria-label="Đóng"><X size={18}/></button></div>
        <PromptCard lesson={lesson}/>
      </div>
    </div>}

    <p className="ll-footnote">Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Bài làm được lưu vào tài khoản của bạn; tiến độ không quy đổi sang band.</p>
  </div>;
}

function PromptCard({ lesson }: { lesson: Task1Lesson }) {
  const [vi, setVi] = useState(false);
  // On a laptop the prompt folds to three lines so the figure stays in view; the button only shows there.
  const [full, setFull] = useState(false);
  const target = writingTargets[lesson.stage];
  return <div className="t1-prompt-card">
    <div className="t1-prompt-top">
      <span className="ll-kicker">Đề bài</span>
      {lesson.question_vi && <button type="button" className="t1-toggle" aria-pressed={vi} onClick={() => setVi((value) => !value)}><Languages size={14}/> {vi ? "Xem tiếng Anh" : "Dịch đề"}</button>}
    </div>
    <p className={`t1-prompt-en ${full ? "" : "is-folded"}`} lang={vi ? "vi" : "en"}>{vi && lesson.question_vi ? lesson.question_vi : lesson.question}</p>
    <button type="button" className="t1-prompt-more" aria-expanded={full} onClick={() => setFull((value) => !value)}>{full ? "Thu gọn đề" : "Xem đủ đề"}</button>
    <p className="t1-prompt-target"><Target size={13}/> Bài này: {target.label.toLowerCase()} · {target.hint}</p>
    <Task1Figure visual={lesson.visual} unit={lesson.unit}/>
  </div>;
}

function StepHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return <header className="t1-step-head"><span className="ll-kicker">{kicker}</span><h2>{title}</h2>{children && <p>{children}</p>}</header>;
}

/* Step 1 — understand the task */
function UnderstandStep({ lesson, target }: { lesson: Task1Lesson; target: (typeof writingTargets)[Task1Stage] }) {
  const guide = guideFor(lesson.group);
  return <>
    <StepHead kicker="Bước 1 · Hiểu đề" title="Đề hỏi gì, nhìn vào đâu">Đọc đề và hình ở {""}<span className="t1-only-wide">cột bên trái</span><span className="t1-only-narrow">trên cùng (hoặc nút “Xem đề & hình”)</span>, rồi đọc phần dưới.</StepHead>
    <div className="t1-cards">
      <div className="t1-card-box">
        <h3><BookOpen size={16}/> Hình này là gì</h3>
        <p>{lesson.gist_vi ?? `${guide.name_vi}: ${guide.shows_vi.charAt(0).toLowerCase()}${guide.shows_vi.slice(1)}`}</p>
        {lesson.question_vi && <p className="t1-muted"><b>Đề (dịch):</b> {lesson.question_vi}</p>}
        {lesson.unit && <p className="t1-muted"><b>Đơn vị:</b> <span lang="en">{lesson.unit}</span></p>}
      </div>
      <div className="t1-card-box">
        <h3><Target size={16}/> Bạn cần viết</h3>
        <p><b>{target.label}</b> · {target.hint}.</p>
        <p className="t1-muted">{lesson.stage === "foundation" ? "Chặng Nền tảng chỉ cần 1 câu mở bài và 1–2 câu Overview. Bài mẫu đầy đủ có sẵn để bạn học cách viết." : "Viết đủ 4 đoạn: Mở bài – Overview – Body 1 – Body 2, chỉ dùng thông tin có trên hình."}</p>
      </div>
    </div>
    {lesson.keywords?.length ? <div className="t1-card-box">
      <h3><Languages size={16}/> Từ khoá trong đề</h3>
      <ul className="t1-keywords">{lesson.keywords.map((keyword) => <li key={keyword.en}><b lang="en">{keyword.en}</b><span>{keyword.vi}</span>{keyword.example_en && <q lang="en">{keyword.example_en}</q>}</li>)}</ul>
    </div> : null}
    <div className="t1-card-box">
      <h3><Eye size={16}/> Nhìn vào đâu trước</h3>
      <ol className="t1-look">{guide.look_for_vi.map((item) => <li key={item}>{item}</li>)}</ol>
    </div>
    <p className="t1-muted t1-center">Mới học Task 1? <Link href={guideHref} className="t1-link">Đọc Bài 0 – Task 1 là gì</Link> (8 phút).</p>
  </>;
}

/* Step 2 — read the figure, one question at a time */
function ReadStep({ lesson, state, busy, onChoose, onCheck, onDone }: {
  lesson: Task1Lesson; state: Task1State; busy: string; onChoose: (check: Task1Check, value: string) => void; onCheck: (check: Task1Check) => void; onDone: () => void;
}) {
  const firstOpen = lesson.checks.findIndex((check) => !state.results[check.id]);
  const [current, setCurrent] = useState(firstOpen < 0 ? 0 : firstOpen);
  const check = lesson.checks[current];
  const result = state.results[check.id];
  const choice = state.choices[check.id];
  const checked = lesson.checks.filter((item) => state.results[item.id]);
  const correct = checked.filter((item) => state.results[item.id].correct).length;
  const allDone = checked.length === lesson.checks.length;
  const nextOpen = lesson.checks.findIndex((item, position) => position > current && !state.results[item.id]);

  return <>
    <StepHead kicker="Bước 2 · Đọc hình" title="Trả lời từng câu, nhìn hình để chọn">{lesson.kind === "process" ? "Đi theo số thứ tự 1 → 2 → 3… và chiều mũi tên trên sơ đồ. Câu Đúng/Sai: chỉ chọn True khi sơ đồ thật sự có mũi tên đi theo đúng chiều đó." : "Mọi câu trả lời phải dựa vào số liệu trên hình, không đoán."}</StepHead>
    <div className="t1-qpager" role="tablist" aria-label="Câu hỏi">{lesson.checks.map((item, position) => {
      const itemResult = state.results[item.id];
      return <button key={item.id} type="button" role="tab" aria-selected={position === current} aria-label={`Câu ${position + 1}`}
        className={`${itemResult ? itemResult.correct ? "is-right" : "is-wrong" : state.choices[item.id] ? "is-picked" : ""}`} onClick={() => setCurrent(position)}>{position + 1}</button>;
    })}<span>{checked.length}/{lesson.checks.length} câu · {correct} đúng</span></div>

    <article className={`ll-q t1-qcard ${result ? result.correct ? "is-correct" : "is-wrong" : ""}`}>
      <div className="ll-q-head"><span className="ll-q-num">{result ? result.correct ? <Check size={14} strokeWidth={3}/> : <XCircle size={14}/> : current + 1}</span>
        <div><small>{check.kind === "tf" ? "Đúng hay sai (True / False)" : "Chọn đáp án đúng"}</small><p lang="en">{plain(check.prompt)}</p>{check.prompt_vi && <p className="t1-muted">{check.prompt_vi}</p>}</div></div>
      <div className={`ll-options ${check.kind === "tf" ? "t1-tf" : ""}`} role="radiogroup" aria-label={`Câu ${current + 1}`}>{check.options.map((option, optionIndex) => {
        const cls = result ? option.id === result.answer ? "is-key" : choice === option.id ? "is-picked-wrong" : "" : choice === option.id ? "is-picked" : "";
        return <label key={option.id} className={cls}><input type="radio" name={`check-${check.id}`} value={option.id} checked={choice === option.id} disabled={Boolean(result)} onChange={() => onChoose(check, option.id)}/><b>{check.kind === "tf" ? option.text[0] : String.fromCharCode(65 + optionIndex)}</b><span lang="en">{option.text}</span></label>;
      })}</div>
      {result && <div className="ll-feedback"><div className="ll-feedback-top"><strong>{result.correct ? <><CheckCircle2 size={14}/> Chính xác</> : <><Target size={14}/> Chưa đúng – đáp án được tô xanh</>}</strong></div>{result.explanation_vi && <p>{plain(result.explanation_vi)}</p>}</div>}
      <div className="t1-row">
        {!result
          ? <button type="button" className="ll-btn ll-btn-primary" disabled={!choice || busy === check.id} onClick={() => onCheck(check)}><Eye size={15}/>{busy === check.id ? "Đang kiểm tra…" : "Kiểm tra câu này"}</button>
          : allDone ? <button type="button" className="ll-btn ll-btn-primary" onClick={onDone}>Xong phần đọc hình <ArrowRight size={15}/></button>
            : <button type="button" className="ll-btn ll-btn-primary" onClick={() => setCurrent(nextOpen >= 0 ? nextOpen : lesson.checks.findIndex((item) => !state.results[item.id]))}>Câu tiếp <ArrowRight size={15}/></button>}
      </div>
    </article>
  </>;
}

/* Step 3 — study key facts, language and (foundation) a model before writing */
function LearnStep({ lesson, model }: { lesson: Task1Lesson; model: Task1Model | null | undefined }) {
  const guide = guideFor(lesson.group);
  const phrases = lesson.language?.length
    ? lesson.language.map((item) => ({ en: item.phrase_en, vi: item.meaning_vi, example: item.example_en }))
    : guide.phrases.map((item) => ({ en: item.en, vi: item.vi, example: item.example_en }));
  const mistakes = lesson.mistakes?.length ? lesson.mistakes : lesson.mistake ? [{ wrong_en: lesson.mistake.en, right_en: "", why_vi: lesson.mistake.vi }] : [];
  const showModel = modelFirst(lesson);
  return <>
    <StepHead kicker="Bước 3 · Học" title={showModel ? "Xem cách một bài tốt được viết" : "Ý chính và cụm từ nên dùng"}>{showModel ? "Đọc bài mẫu từng câu kèm giải thích. Chú ý cụm từ được tô màu – bạn sẽ dùng chúng ở bước sau." : "Ghi nhớ các ý và cụm từ dưới đây; bước sau bạn sẽ tự viết từng phần."}</StepHead>
    {lesson.facts.length > 0 && <div className="t1-card-box">
      <h3><Lightbulb size={16}/> Ý chính nên có trong bài</h3>
      <ul className="t1-facts">{lesson.facts.map((fact) => <li key={fact.en}><b lang="en">{fact.en}</b><span>{fact.vi}</span></li>)}</ul>
    </div>}
    {showModel && (model === undefined ? <div className="ll-skeleton ll-skeleton-card"/> : model ? <ModelView model={model} phrases={lesson.phrases} open/> : null)}
    {!showModel && lesson.has_model && <p className="t1-callout"><BookOpenCheck size={16}/> Ở chặng này bạn tự viết trước. Bài mẫu sẽ mở ở bước 5 sau khi bạn lưu bài viết.</p>}
    {lesson.kind === "process" && !lesson.has_model && <div className="t1-card-box">
      <h3><Wand2 size={16}/> Cách viết bài quy trình</h3>
      <ol className="t1-look">
        <li>Mở bài: nói lại đề – “The diagram illustrates how …”.</li>
        <li>Overview: có bao nhiêu bước, bắt đầu ở đâu, kết thúc ở đâu, có lặp lại không.</li>
        <li>Body 1 và Body 2: mỗi đoạn một nửa quy trình, dùng từ nối thứ tự và câu bị động.</li>
      </ol>
      <p className="t1-muted"><b>Thì:</b> {guide.tense_vi}</p>
    </div>}
    <div className="t1-card-box">
      <h3><Languages size={16}/> Cụm từ cho dạng {guide.name_vi.toLowerCase()}</h3>
      <PhraseTable rows={phrases}/>
      {!lesson.language?.length && lesson.phrases.length > 0 && <p className="t1-muted">Riêng bài này: {lesson.phrases.map((phrase, position) => <span key={phrase}>{position ? ", " : ""}<b lang="en">{phrase}</b></span>)}.</p>}
    </div>
    {mistakes.length > 0 && <div className="t1-card-box">
      <h3><AlertTriangle size={16}/> Lỗi hay gặp</h3>
      <ul className="t1-mistakes">{mistakes.map((item) => <li key={item.wrong_en}>
        {item.right_en ? <><s lang="en">{item.wrong_en}</s><b lang="en">{item.right_en}</b></> : null}
        <span>{item.why_vi}</span>
      </li>)}</ul>
    </div>}
  </>;
}

function ModelView({ model, phrases, open = false }: { model: Task1Model; phrases: string[]; open?: boolean }) {
  const [notes, setNotes] = useState(true);
  const paragraphs = modelParagraphs(model);
  const hasNotes = paragraphs.some((paragraph) => paragraph.sentences.some((sentence) => sentence.note_vi));
  return <details className="t1-card-box t1-model" open={open}>
    <summary><BookOpenCheck size={16}/> Bài mẫu tham khảo · khoảng {model.word_count} từ <ChevronDown size={16} className="t1-chev"/></summary>
    {hasNotes && <button type="button" className="t1-toggle" aria-pressed={notes} onClick={() => setNotes((value) => !value)}>{notes ? "Ẩn giải thích" : "Hiện giải thích"}</button>}
    <div className="t1-model-text">{paragraphs.map((paragraph, index) => <div key={index} className="t1-model-para">
      <span className="t1-para-tag">{partLabels[paragraph.role]}</span>
      {paragraph.sentences.map((sentence, position) => <div key={position} className="t1-model-sentence">
        <p lang="en">{highlight(sentence.en, [...phrases, ...(sentence.highlight ?? [])])}</p>
        {notes && sentence.note_vi && <small>{sentence.note_vi}</small>}
      </div>)}
    </div>)}</div>
    {model.explanation_vi && <div className="ll-tip"><span><Lightbulb size={17}/></span><p><b>Vì sao bài này hiệu quả</b>{model.explanation_vi}</p></div>}
    {model.outline_vi && <p className="t1-outline"><b>Cách chia hai đoạn thân bài:</b> {model.outline_vi}</p>}
    <p className="ll-footnote">Bài mẫu để học cách chọn và nhóm dữ kiện, không phải bài được chấm band chính thức. Học cách viết, đừng chép nguyên câu.</p>
  </details>;
}

/* Step 4 — practise each part with a sentence frame */
function DrillsStep({ lesson, state, answers, busy, onType, onSave, onDone }: {
  lesson: Task1Lesson; state: Task1State; answers: Record<string, Task1DrillAnswer>; busy: string;
  onType: (drillId: string, value: string) => void; onSave: (drillId: string) => void; onDone: () => void;
}) {
  const firstOpen = lesson.drills.findIndex((drill) => !drillSaved(state, drill.id));
  const [current, setCurrent] = useState(firstOpen < 0 ? 0 : firstOpen);
  const drill = lesson.drills[current];
  const text = state.answers[drill.id] ?? "";
  const saved = drillSaved(state, drill.id);
  const answer = answers[drill.id];
  const scaffold: Task1ScaffoldPart = lesson.scaffold?.[drillPart[drill.mode] ?? "intro"] ?? {};
  const frame = scaffold.frame_en ?? drillFrames[drill.mode]?.(lesson.group) ?? "";
  const savedCount = lesson.drills.filter((item) => drillSaved(state, item.id)).length;
  const insertFrame = () => onType(drill.id, text.trim() ? `${text.trimEnd()}\n${frame}` : frame);

  return <>
    <StepHead kicker="Bước 4 · Luyện" title="Viết từng phần theo khung">Bấm “Dùng khung” để chép khung vào ô, rồi thay mỗi “___” bằng thông tin trên hình. Lưu xong sẽ hiện gợi ý để so.</StepHead>
    <div className="t1-tabs" role="tablist" aria-label="Phần luyện">{lesson.drills.map((item, position) => <button key={item.id} type="button" role="tab" aria-selected={position === current} className={drillSaved(state, item.id) ? "is-pass" : ""} onClick={() => setCurrent(position)}>
      {drillSaved(state, item.id) ? <Check size={13} strokeWidth={3}/> : <span>{position + 1}</span>}{drillModeLabels[item.mode] ?? item.mode}
    </button>)}</div>

    <article className={`t1-drill ${saved ? "is-saved" : ""}`}>
      <p className="t1-drill-q">{drill.question_vi}</p>
      <p className="t1-muted"><Lightbulb size={13}/> {drill.hint_vi}</p>
      {scaffold.frame_en && scaffold.answers?.length ? <FrameFill frame={scaffold.frame_en} answers={scaffold.answers}/> : null}
      {scaffold.choose && <ChooseBetter choose={scaffold.choose}/>}
      {frame && <div className="t1-frame-row"><code lang="en">{frame}</code><button type="button" className="ll-btn" onClick={insertFrame}><Wand2 size={14}/> Dùng khung</button></div>}
      {scaffold.task_vi && <p className="t1-muted">{scaffold.task_vi}</p>}
      <textarea className="t1-text" lang="en" rows={drill.mode === "observe" || drill.mode === "plan" || drill.mode === "groups" ? 4 : 3} value={text} placeholder="Viết câu trả lời của bạn…" aria-label={`Bài luyện: ${drillModeLabels[drill.mode] ?? drill.mode}`}
        onChange={(event) => onType(drill.id, event.target.value)}/>
      <div className="t1-row">
        <small>{countWords(text)} từ{text.includes("___") ? " · còn chỗ trống ___" : ""}</small>
        <button type="button" className={`ll-btn ${answer ? "" : "ll-btn-primary"}`} disabled={busy === drill.id || text.trim().length < 3} onClick={() => onSave(drill.id)}>
          <Save size={15}/>{busy === drill.id ? "Đang lưu…" : answer ? "Lưu lại" : "Lưu & xem gợi ý"}
        </button>
      </div>
      {answer && <div className="ll-feedback t1-answer">
        <div className="ll-feedback-top"><strong><Lightbulb size={14}/> Gợi ý để so sánh</strong></div>
        <q lang="en">{answer.answer_guide}</q>
        {answer.explanation_vi && <p>{answer.explanation_vi}</p>}
      </div>}
      {saved && <div className="t1-row">{current < lesson.drills.length - 1
        ? <button type="button" className="ll-btn ll-btn-primary" onClick={() => setCurrent(current + 1)}>Phần tiếp: {drillModeLabels[lesson.drills[current + 1].mode] ?? ""} <ArrowRight size={15}/></button>
        : savedCount === lesson.drills.length && <button type="button" className="ll-btn ll-btn-primary" onClick={onDone}>Sang viết bài <ArrowRight size={15}/></button>}</div>}
    </article>
  </>;
}

function FrameFill({ frame, answers }: { frame: string; answers: string[] }) {
  const pieces = frame.split("___");
  const [values, setValues] = useState<string[]>(() => answers.map(() => ""));
  const [checked, setChecked] = useState(false);
  const normal = (value: string) => value.toLowerCase().replace(/[.,;]+$/, "").replace(/\s+/g, " ").trim();
  return <div className="t1-fill">
    <span className="ll-kicker">Điền vào chỗ trống</span>
    <p lang="en">{pieces.map((piece, position) => <span key={position}>{piece}{position < pieces.length - 1 && <>
      <input value={values[position] ?? ""} aria-label={`Chỗ trống ${position + 1}`} size={Math.max(6, (answers[position] ?? "").length)}
        className={checked ? normal(values[position] ?? "") === normal(answers[position] ?? "") ? "is-right" : "is-wrong" : ""}
        onChange={(event) => { const value = event.target.value; setChecked(false); setValues((current) => current.map((item, index) => index === position ? value : item)); }}/>
      {checked && normal(values[position] ?? "") !== normal(answers[position] ?? "") && <em className="t1-fill-key">{answers[position]}</em>}
    </>}</span>)}</p>
    <button type="button" className="ll-btn" onClick={() => setChecked(true)}><Check size={14}/> Kiểm tra</button>
  </div>;
}

function ChooseBetter({ choose }: { choose: NonNullable<Task1ScaffoldPart["choose"]> }) {
  const [picked, setPicked] = useState<"a" | "b" | "">("");
  return <div className="t1-choose">
    <span className="ll-kicker">Câu nào tốt hơn?</span>
    <div className="ll-options">{(["a", "b"] as const).map((key) => <label key={key} className={picked ? key === choose.better ? "is-key" : picked === key ? "is-picked-wrong" : "" : ""}>
      <input type="radio" name="t1-choose" checked={picked === key} onChange={() => setPicked(key)}/><b>{key.toUpperCase()}</b><span lang="en">{key === "a" ? choose.a_en : choose.b_en}</span>
    </label>)}</div>
    {picked && <p className="t1-muted">{picked === choose.better ? "Đúng. " : `Câu ${choose.better.toUpperCase()} tốt hơn. `}{choose.why_vi}</p>}
  </div>;
}

/* Step 5 — write, with the learner's own notes beside the editor */
function EssayStep({ lesson, state, model, busy, notice, words, onType, onCheck, onSave }: {
  lesson: Task1Lesson; state: Task1State; model: Task1Model | null | undefined; busy: string; notice: string; words: number;
  onType: (value: string) => void; onCheck: (id: string, value: boolean) => void; onSave: () => void;
}) {
  const target = writingTargets[lesson.stage];
  const done = essaySaved(state, lesson.stage);
  const notes = lesson.drills.map((drill) => ({ label: drillModeLabels[drill.mode] ?? drill.mode, text: (state.answers[drill.id] ?? "").trim() })).filter((note) => note.text);
  const checklist = lesson.checklist?.length ? lesson.checklist.map((item, index) => ({ id: `c${index}`, criterion: item.criterion, text: item.item_vi })) : reportChecklist;
  const ticked = checklist.filter((item) => state.checklist[item.id]).length;
  const insertOutline = () => onType(state.essay.trim() ? state.essay : essayFrame(lesson.stage, lesson.group));
  return <>
    <StepHead kicker="Bước 5 · Viết" title={target.label}>{lesson.stage === "foundation" ? "Viết 1 câu mở bài và 1–2 câu Overview cho đề này." : "Viết đủ 4 đoạn: Mở bài – Overview – Body 1 – Body 2."} Lưu từ {target.min} từ trở lên để hoàn thành bài{lesson.has_model && !modelFirst(lesson) ? " và mở bài mẫu" : ""}.</StepHead>
    {notes.length > 0 && <details className="t1-card-box t1-notes" open>
      <summary><PenLine size={15}/> Ghi chú bạn đã viết ở bước 4 <ChevronDown size={16} className="t1-chev"/></summary>
      <dl>{notes.map((note) => <div key={note.label}><dt>{note.label}</dt><dd lang="en">{note.text}</dd></div>)}</dl>
    </details>}
    <div className="t1-essay">
      <div className="t1-essay-tools">
        <button type="button" className="ll-btn" onClick={insertOutline} disabled={Boolean(state.essay.trim())} title={state.essay.trim() ? "Ô viết đã có chữ" : undefined}><Wand2 size={14}/> Chèn dàn bài</button>
        <span className={`t1-words ${words >= target.goal ? "is-good" : words >= target.min ? "is-fair" : ""}`}><b>{words}</b> / {target.goal} từ</span>
      </div>
      <textarea className="t1-text t1-essay-text" lang="en" rows={lesson.stage === "foundation" ? 7 : 15} value={state.essay}
        placeholder={lesson.stage === "foundation" ? "Viết mở bài và Overview ở đây…" : "Viết bài của bạn ở đây…"} aria-label="Bài viết Task 1" onChange={(event) => onType(event.target.value)}/>
      <div className="t1-essay-bar">
        <button type="button" className="ll-btn ll-btn-primary" disabled={busy === "essay" || !state.essay.trim()} onClick={onSave}><Save size={15}/>{busy === "essay" ? "Đang lưu…" : "Lưu bài viết"}</button>
        <i aria-hidden="true"><em style={{ width: `${Math.min(100, (words / target.goal) * 100)}%` }}/></i>
        {notice && <small className="t1-notice"><CheckCircle2 size={14}/> {notice}</small>}
      </div>
    </div>
    <details className="t1-card-box">
      <summary><ListChecks size={16}/> Tự kiểm tra trước khi lưu · {ticked}/{checklist.length} <ChevronDown size={16} className="t1-chev"/></summary>
      <ul className="t1-checklist">{checklist.map((item) => <li key={item.id}><label>
        <input type="checkbox" checked={Boolean(state.checklist[item.id])} onChange={(event) => onCheck(item.id, event.target.checked)}/>
        <span className="t1-criterion">{item.criterion}</span><span>{item.text}</span>
      </label></li>)}</ul>
    </details>
    {model ? <ModelView model={model} phrases={lesson.phrases} open={done && !modelFirst(lesson)}/>
      : done ? <p className="t1-callout"><BookOpenCheck size={16}/> Bài này chưa có bài mẫu. Đối chiếu từng câu của bạn với hình và bảng tự kiểm tra ở trên.</p>
        : lesson.has_model ? <p className="t1-callout"><BookOpenCheck size={16}/> Bài mẫu sẽ hiện ở đây sau khi bạn lưu bài từ {target.min} từ trở lên.</p> : null}
  </>;
}

function Breadcrumb({ current }: { current: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={TASK1_BASE}>Writing Task 1 Lab</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}
