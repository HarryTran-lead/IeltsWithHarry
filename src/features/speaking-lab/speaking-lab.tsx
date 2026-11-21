"use client";
/*
 * Speaking Lab: 16 skill routes (4 criteria × 4 skills), 24 Part 1/2 topic lessons, 80 Part 3 lessons and 24
 * pronunciation lessons from the M10-L80 handoff.
 * The map reuses the Listening Lab layout so the self-study labs read as one product. A unit walks through its
 * spoken tasks one at a time: learn first, speak and keep a take (it stays in this browser), tick a self-check,
 * then the server releases the tip for that task, coaching after the first and a model after the last.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BookOpenCheck, CalendarClock, Check, ChevronDown, Headphones, Lightbulb, Mic, MicOff, Pause, Play, RotateCcw, Sparkles, Square, Target, Timer } from "lucide-react";
import { clock, useMic, type SpeakingItem } from "@/features/ielts/speaking-kit";
import { PracticeCoaching } from "@/features/ielts/speaking-practice-coaching";
import {
  SPEAKING_API, SPEAKING_BASE, criterionInfo, emptySpeakingState, partLabel, secondsLabel, speakingAudioUrl, tasksDone,
  type Criterion, type SpeakingCatalog, type SpeakingModel, type SpeakingRelease, type SpeakingState, type SpeakingTask, type SpeakingUnit,
} from "@/lib/speaking-lab/types";
import { cacheSpeakingState, keepRecording, loadAllSpeakingStates, loadSpeakingState, recordingUrl, releaseSpeaking, saveSpeakingState } from "./speaking-state";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { LessonBar, LessonDone, LessonLocked, StudyPath } from "@/features/self-study-path/study-path";
import { buildPath } from "@/lib/self-study-path/path";
import { speakingCourse, speakingProgress, speakingTabOf, type SpeakingTab } from "@/lib/self-study-path/speaking";
import "@/features/listening/listening-lab.css";
import "./speaking-lab.css";

export function SpeakingLab() {
  const parts = usePathname().split("/").filter(Boolean);
  return parts[3] ? <UnitPage key={parts[3]} id={decodeURIComponent(parts[3])} /> : <MapPage />;
}

type CatalogResponse = { catalog: SpeakingCatalog; ready: boolean };
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Không tải được dữ liệu.");
  return body as T;
}

const tone = (criterion: Criterion) => ({ "--ll-tone": criterionInfo[criterion].tone, "--ll-soft": criterionInfo[criterion].soft }) as CSSProperties;
const swatch = (toneColor: string, soft: string) => ({ "--ll-tone": toneColor, "--ll-soft": soft }) as CSSProperties;
const topicTone = swatch("#6a4fb3", "#efeafb");
const pronTone = swatch("#0a7f89", "#e2f5f4");
const mockTone = swatch("#c8473f", "#fdecea");
const seriesTone: Record<string, CSSProperties> = {
  L57: swatch("#3b6fb6", "#e5eefb"), L58: swatch("#8a5bb8", "#f0e8f8"), L59: swatch("#2f7d6d", "#e3f3ee"), L60: swatch("#c0623b", "#fbece4"),
};
const unitTone = (unit: SpeakingUnit, catalog: SpeakingCatalog) => {
  if (unit.kind === "topic") return topicTone;
  if (unit.kind === "pron") return pronTone;
  if (unit.kind === "mock") return mockTone;
  if (unit.kind === "part3") return seriesTone[unit.series ?? ""] ?? topicTone;
  const criterion = unit.criterion ?? catalog.skills.find((skill) => skill.id === unit.skills[0])?.criterion;
  return criterion ? tone(criterion) : topicTone;
};

/* ───────────────────────── Map ───────────────────────── */

const tabParam: Record<SpeakingTab, string> = { skills: "", topics: "chu-de", advanced: "nang-cao", pron: "phat-am", mocks: "thi-thu" };
const mapHref = (unit: SpeakingUnit) => tabParam[speakingTabOf(unit)] ? `${SPEAKING_BASE}?tab=${tabParam[speakingTabOf(unit)]}` : SPEAKING_BASE;

/** The catalogue, every unit's saved turns, and the path of one tab built from them. */
function useSpeakingPath(tab: SpeakingTab | null) {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [states, setStates] = useState<Record<string, SpeakingState> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void getJson<CatalogResponse>(SPEAKING_API).then(async (loaded) => {
      if (!alive) return;
      setData(loaded);
      const saved = await loadAllSpeakingStates(loaded.catalog.units.map((unit) => unit.id)).catch(() => ({}));
      if (alive) setStates(saved);
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); });
    return () => { alive = false; };
  }, []);
  const course = useMemo(() => data && tab ? speakingCourse(data.catalog, tab) : null, [data, tab]);
  const view = useMemo(() => data && tab && course && states ? buildPath(course, speakingProgress(data.catalog, tab, states)) : null, [data, tab, course, states]);
  return { data, states, course, view, error };
}

function MapPage() {
  const router = useRouter();
  const param = useSearchParams().get("tab") ?? "";
  const tab = (Object.keys(tabParam) as SpeakingTab[]).find((key) => tabParam[key] && tabParam[key] === param) ?? "skills";
  const { data, course, view, error } = useSpeakingPath(tab);
  const streak = useLearnerStreak();
  const show = (target: SpeakingTab) => router.replace(tabParam[target] ? `${SPEAKING_BASE}?tab=${tabParam[target]}` : SPEAKING_BASE, { scroll: false });

  const of = (kind: SpeakingUnit["kind"]) => data?.catalog.units.filter((unit) => unit.kind === kind) ?? [];
  const tabs = <div className="spk-path"><div className="spk-tabs" role="tablist" aria-label="Speaking Lab">
    <button type="button" role="tab" aria-selected={tab === "skills"} onClick={() => show("skills")}><b>16 kỹ năng</b><small>Theo 4 tiêu chí chấm</small></button>
    <button type="button" role="tab" aria-selected={tab === "topics"} onClick={() => show("topics")}><b>Chủ đề Part 1–2</b><small>{of("topic").length} bài, mỗi bài 6 lượt</small></button>
    <button type="button" role="tab" aria-selected={tab === "advanced"} onClick={() => show("advanced")}><b>Nâng cao Part 3</b><small>{of("part3").length} bài thảo luận</small></button>
    <button type="button" role="tab" aria-selected={tab === "pron"} onClick={() => show("pron")}><b>Phát âm</b><small>{data?.catalog.modules.length ?? 8} nhóm, {of("pron").length} bài</small></button>
    <button type="button" role="tab" aria-selected={tab === "mocks"} onClick={() => show("mocks")}><b>Thi thử</b><small>{of("mock").length} đề đủ 3 phần</small></button>
  </div></div>;

  if (error) return <div className="ll-page spk-lab">{tabs}<p className="ll-error" role="alert">{error}</p></div>;
  if (!data || !course || !view) return <div className="ll-page spk-lab">{tabs}<div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const intro = !data.ready && <p className="spk-path ll-error" role="status">Nội dung câu hỏi đang được cập nhật. Bạn vẫn xem được lộ trình; bài học sẽ mở khi dữ liệu sẵn sàng.</p>;
  return <StudyPath course={course} view={view} streak={streak?.current ?? 0} top={tabs} intro={intro}>
    <p className="sp-footnote"><Sparkles size={15} aria-hidden/> {data.catalog.source.note_vi} Mỗi tab là một lộ trình riêng, đi theo thứ tự. Bản ghi âm chỉ lưu trên trình duyệt này, trừ khi bạn tự gửi một bài Part 2 để nhận phân tích; tài khoản lưu tiến độ, ghi chú và phần tự kiểm tra.</p>
  </StudyPath>;
}

/* ───────────────────────── Unit ───────────────────────── */

const stamp = () => ({ iso: new Date().toISOString(), at: Date.now() });
const sentence = (line: string) => { const text = line.trim().replace(/[.;]+$/, ""); return text.charAt(0).toUpperCase() + text.slice(1); };
const fallbackChecks = ["Mình trả lời thẳng vào câu hỏi.", "Có ít nhất một lý do hoặc chi tiết cụ thể.", "Mình nói bằng lời của mình, không đọc thuộc."];

function UnitPage({ id }: { id: string }) {
  const [catalog, setCatalog] = useState<SpeakingCatalog | null>(null);
  const [state, setState] = useState<SpeakingState | null>(null);
  const [release, setRelease] = useState<SpeakingRelease | null>(null);
  const [takes, setTakes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [teachOpen, setTeachOpen] = useState(false);
  const [openedAt] = useState(() => stamp().at);
  const [locked, setLocked] = useState<{ title: string; href?: string } | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urls = useRef<string[]>([]);
  // The newest progress, so finishing a turn right after keeping a take does not drop the take's timing.
  const latest = useRef<SpeakingState | null>(null);

  const unit = catalog?.units.find((item) => item.id === id) ?? null;

  useEffect(() => {
    let alive = true;
    const opened = urls.current;
    void Promise.all([getJson<CatalogResponse>(SPEAKING_API), loadSpeakingState(id).catch(() => emptySpeakingState())]).then(async ([{ catalog: loaded }, saved]) => {
      if (!alive) return;
      const found = loaded.units.find((item) => item.id === id);
      setCatalog(loaded); setState(saved); latest.current = saved;
      if (!found) { setError("Không tìm thấy bài học."); return; }
      setTeachOpen(!found.tasks.some((task) => saved.done[task.id]));
      // Units open in path order within their tab: one not reached yet sends the learner to the one that is.
      const tab = speakingTabOf(found);
      const siblings = loaded.units.filter((item) => item.kind === found.kind);
      void loadAllSpeakingStates(siblings.map((item) => item.id)).then((all) => {
        if (!alive) return;
        const view = buildPath(speakingCourse(loaded, tab), speakingProgress(loaded, tab, { ...all, [id]: saved }));
        const node = view.stages.flatMap((stage) => stage.nodes).find((item) => item.id === id);
        const next = view.next?.node;
        if (node?.status === "locked") setLocked({ title: next ? `Bài ${next.number} · ${next.title}` : "", href: next?.href });
      }).catch(() => undefined);
      // Kept takes come from this browser; load them alongside the server release, not before it.
      void Promise.all(found.tasks.map(async (task, index) => [task.id, await recordingUrl(id, index)] as const)).then((entries) => {
        const kept = Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
        opened.push(...Object.values(kept));
        if (alive) setTakes(kept);
      });
      const released = await releaseSpeaking(id, saved);
      if (alive) setRelease(released);
    }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được bài học."); });
    return () => { alive = false; opened.forEach((url) => URL.revokeObjectURL(url)); };
  }, [id]);

  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current); }, []);

  const update = useCallback((change: (current: SpeakingState) => SpeakingState) => {
    setState((current) => {
      if (!current) return current;
      const next = { ...change(current), updatedAt: Date.now() };
      latest.current = next;
      cacheSpeakingState(id, next);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => { void saveSpeakingState(id, next).catch(() => undefined); }, 2500);
      return next;
    });
  }, [id]);

  async function keepTake(task: SpeakingTask, index: number, take: { url: string; seconds: number; transcript: string }) {
    setTakes((current) => ({ ...current, [task.id]: take.url }));
    urls.current.push(take.url);
    const current = latest.current;
    if (current) {
      const next = { ...current, seconds: { ...current.seconds, [task.id]: take.seconds }, transcript: { ...current.transcript, [task.id]: take.transcript }, updatedAt: stamp().at };
      latest.current = next;
      update(() => next);
    }
    await keepRecording(id, index, take.url).catch(() => setError("Không lưu được bản ghi trên trình duyệt này; bạn vẫn nghe lại được tới khi rời trang."));
  }

  async function finish(task: SpeakingTask, scroll = true) {
    const current = latest.current;
    if (!current) return;
    const time = stamp();
    const next: SpeakingState = { ...current, done: { ...current.done, [task.id]: time.iso }, updatedAt: time.at };
    if (syncTimer.current) clearTimeout(syncTimer.current);
    latest.current = next;
    setBusy(true); setError(""); setState(next);
    try {
      await saveSpeakingState(id, next);
      setRelease(await releaseSpeaking(id, next));
      if (scroll) window.setTimeout(() => document.getElementById("spk-current")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa lưu được tiến độ.");
    } finally { setBusy(false); }
  }

  if (error && !unit) return <div className="ll-page spk-lab"><Breadcrumb current="Không tải được"/><p className="ll-error" role="alert">{error}</p></div>;
  if (!catalog || !unit || !state) return <div className="ll-page spk-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const count = tasksDone(unit, state);
  const skills = unit.skills.map((skillId) => catalog.skills.find((skill) => skill.id === skillId)).filter((skill) => skill !== undefined);
  const checks = (release?.teach.self_check_vi?.length ? release.teach.self_check_vi
    : release?.card?.self_review_vi?.length ? release.card.self_review_vi
      : release?.coaching?.self_review_vi?.length ? release.coaching.self_review_vi
        : release?.teach.repair?.self_check_vi?.length ? release.teach.repair.self_check_vi
          : fallbackChecks).map(sentence);
  const seriesInfo = catalog.series.find((item) => item.id === unit.series);
  const kicker = unit.kind === "skill" && unit.criterion ? criterionInfo[unit.criterion].name
    : unit.kind === "topic" ? "Bài theo chủ đề"
      : unit.kind === "part3" ? `${seriesInfo?.title_vi ?? "Part 3"}${unit.level ? ` · ${unit.level}` : ""}`
        : unit.kind === "mock" ? "Thi thử đủ 3 phần"
          : `Phát âm · ${unit.level}`;
  const expectsModel = unit.kind === "topic" || unit.kind === "part3";
  const pathLessons = speakingCourse(catalog, speakingTabOf(unit)).stages.flatMap((item) => item.lessons);
  const position = pathLessons.findIndex((item) => item.id === unit.id);
  const following = position >= 0 ? pathLessons[position + 1] : undefined;
  const lessonName = `${position >= 0 ? `Bài ${position + 1} · ` : ""}${unit.title_vi}`;
  const currentTurn = release?.current ? unit.tasks.findIndex((task) => task.id === release.current) : count;
  const turn = Math.min(Math.max(0, currentTurn), unit.tasks.length - 1);
  const spoken = unit.tasks.reduce((sum, task) => sum + (state.seconds[task.id] ?? 0), 0);

  if (locked) return <LessonLocked title={lessonName} nextTitle={locked.title} nextHref={locked.href} pathHref={mapHref(unit)}/>;

  return <div className="ll-page ll-module spk-lab sp-kit" style={unitTone(unit, catalog)}>
    <header className="spk-lessonbar">
      <LessonBar exitHref={mapHref(unit)} kicker={`Speaking · ${kicker}${unit.kind === "mock" ? ` · ${unit.level}` : ` · ${partLabel(unit.part)}`}`} title={lessonName}
        info={<>
          <p lang="en">{unit.title_en}{unit.topic_en ? ` · ${unit.topic_en}` : ""}</p>
          {skills.length > 0 && <p>{skills.map((skill) => `${skill.id} ${skill.title_vi}`).join(" · ")}</p>}
        </>}
        count={unit.tasks.length}
        steps={unit.kind === "mock" ? undefined : unit.tasks.map((task) => ({ label: task.label, note: state.done[task.id] ? "Đã xong" : task.hint, pass: Boolean(state.done[task.id]) }))}
        step={release?.current === null ? unit.tasks.length : turn} reached={release?.current === null ? unit.tasks.length - 1 : turn}
        onPick={(index) => document.getElementById(`spk-task-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}/>
    </header>

    {unit.target_vi && <div className="ll-tip"><span><Target size={17}/></span><p><b>Mục tiêu</b>{unit.target_vi}</p></div>}
    {error && <p className="ll-error" role="alert">{error}</p>}
    {!release ? <div className="ll-skeleton ll-skeleton-card"/> : unit.kind === "mock" ? <MockRunner
      unit={unit} release={release} state={state} takes={takes} busy={busy}
      onTake={(task, index, take) => keepTake(task, index, take)} onFinish={(task) => finish(task, false)}
    /> : <>
      <TeachPanel release={release} open={teachOpen} onToggle={() => setTeachOpen((value) => !value)}/>

      <ol className="spk-tasks">{unit.tasks.map((task, index) => {
        const prompt = release.prompts[task.id];
        const isDone = Boolean(state.done[task.id]);
        const isCurrent = release.current === task.id;
        if (!prompt) return <li key={task.id} id={`spk-task-${index}`} className="spk-task is-locked"><span className="spk-task-num">{index + 1}</span><div><b>{task.label}</b><small>{task.hint}</small></div><span className="spk-lock">Mở sau lượt {index}</span></li>;
        const previous = index > 0 ? state.done[unit.tasks[index - 1].id] : undefined;
        return <li key={task.id} id={isCurrent ? "spk-current" : `spk-task-${index}`} className={`spk-task ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}>
          <TaskCard
            unit={unit} task={task} index={index} prompt={prompt} tip={release.tips[task.id]} state={state} take={takes[task.id]}
            checks={checks} previousDoneAt={previous} openedAt={openedAt} busy={busy} recent={isDone && (release.current ? unit.tasks[index + 1]?.id === release.current : index === unit.tasks.length - 1)}
            onTake={(take) => keepTake(task, index, take)} onFinish={() => void finish(task)} update={update}
          />
          {index === 0 && isDone && (release.coaching || release.card) && <Coaching release={release}/>}
        </li>;
      })}</ol>

      {release.model ? <ModelPanel model={release.model}/>
        : expectsModel && release.current !== null && <p className="ll-empty">Phần tham khảo mở sau khi bạn xong cả {unit.tasks.length} lượt nói.</p>}

      {release.current === null && <LessonDone embedded title={`Xong ${lessonName}`}
        stats={[{ label: "Lượt nói", value: `${count}/${unit.tasks.length}` }, { label: "Thời gian nói", value: spoken ? clock(spoken) : "–" }, { label: "Phần thi", value: partLabel(unit.part) }]}
        nextLabel={following ? "Sang bài tiếp theo" : undefined} nextHref={following?.href} pathHref={mapHref(unit)}/>}
    </>}

    <p className="ll-footnote">Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức, và không chấm điểm. Bản ghi âm chỉ ở trên trình duyệt này, trừ khi bạn tự gửi bài Part 2 để phân tích; tài khoản lưu tiến độ, ghi chú và phần tự kiểm tra.</p>
  </div>;
}

function TeachPanel({ release, open, onToggle }: { release: SpeakingRelease; open: boolean; onToggle: () => void }) {
  const { guide, repair, skills, moves, strategies, pron } = release.teach;
  return <section className={`spk-panel spk-teach ${open ? "is-open" : ""}`}>
    <button type="button" className="spk-teach-toggle" aria-expanded={open} onClick={onToggle}>
      <span><Lightbulb size={17}/> Học trước khi nói</span><ChevronDown size={18}/>
    </button>
    {open && <div className="spk-teach-body">
      {guide && <>
        {guide.objective_vi && <p className="spk-lead">{guide.objective_vi}</p>}
        {guide.steps_vi && <ol className="spk-steps">{guide.steps_vi.map((step, index) => <li key={index}><span className="spk-step-num">{index + 1}</span><div><p>{step}</p></div></li>)}</ol>}
        {guide.caution_vi && <p className="spk-caution"><b>Lưu ý:</b> {guide.caution_vi}</p>}
      </>}
      {repair && <div className="spk-repair">
        <h3>{repair.title_vi}{repair.title_en && <small lang="en"> · {repair.title_en}</small>}</h3>
        {repair.goal_vi && <p>{repair.goal_vi}</p>}
        {repair.useful_language_en && <p className="spk-language"><b>Cụm nên dùng:</b> <span lang="en">{repair.useful_language_en}</span></p>}
      </div>}
      {skills?.map((skill) => <div key={skill.id} className="spk-repair">
        <h3>{skill.id} · {skill.title_vi}</h3>
        {skill.objective_vi && <p>{skill.objective_vi}</p>}
        {skill.steps_vi?.[1] && <p className="spk-language"><b>Cách nói:</b> {skill.steps_vi[1]}</p>}
        {skill.caution_vi && <p className="spk-caution"><b>Lưu ý:</b> {skill.caution_vi}</p>}
      </div>)}
      {pron && <>
        {pron.why_vi && <p className="spk-lead">{pron.why_vi}</p>}
        {pron.contrast && <p className="spk-language"><b>Trọng tâm:</b> <span>{pron.contrast}</span></p>}
        {pron.steps && <ol className="spk-steps">{pron.steps.map((step, index) => <li key={index}><span className="spk-step-num">{index + 1}</span><div><p>{step.vi}</p></div></li>)}</ol>}
        {pron.tip_vi && <p className="spk-repair"><b>Mẹo:</b> {pron.tip_vi}</p>}
        {pron.mistake_vi && <p className="spk-caution"><b>Lỗi hay gặp:</b> {pron.mistake_vi}</p>}
      </>}
      {moves?.length ? <ol className="spk-moves">{moves.map((move, index) => <li key={move.phase}>
        <span className="spk-step-num">{index + 1}</span>
        <div><b>{move.title_vi}</b>{move.instruction_vi && <p>{move.instruction_vi}</p>}
          {move.phrases?.length ? <div className="ll-card-types spk-collocations">{move.phrases.map((phrase) => <span key={phrase} lang="en">{phrase}</span>)}</div> : null}</div>
      </li>)}</ol> : null}
      {strategies?.length ? <details className="spk-strategies">
        <summary>8 cách xử lý khi đang nói bị vấp</summary>
        <ul>{strategies.map((item) => <li key={item.title_vi ?? item.title_en}><b>{item.title_vi}</b>{item.guidance_vi && <p>{item.guidance_vi}</p>}{item.example_en && <q lang="en">{item.example_en}</q>}</li>)}</ul>
      </details> : null}
    </div>}
  </section>;
}

function Coaching({ release }: { release: SpeakingRelease }) {
  const { coaching, card } = release;
  return <section className="ll-feedback spk-coaching">
    <div className="ll-feedback-top"><strong><BookOpenCheck size={14}/> Cách sửa sau lượt đầu</strong></div>
    {coaching && <>
      {coaching.focus_vi && !coaching.weak_en && <p className="spk-lead">{coaching.focus_vi}</p>}
      {coaching.weak_en && <div className="spk-pair"><div><small>Câu còn yếu</small><q lang="en">{coaching.weak_en}</q></div><div><small>Câu tốt hơn</small><q lang="en">{coaching.improved_en}</q></div></div>}
      {coaching.analysis_vi && <p>{coaching.analysis_vi}</p>}
      {coaching.steps_vi?.length ? <ol className="spk-bullets spk-numbered">{coaching.steps_vi.map((line) => <li key={line}>{line}</li>)}</ol> : null}
      {coaching.mistakes_vi?.length ? <><p><b>Lỗi nên tự soát:</b></p><ul className="spk-bullets">{coaching.mistakes_vi.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
      {coaching.reflection_vi && <p className="spk-reflect"><b>Tự hỏi:</b> {coaching.reflection_vi}</p>}
    </>}
    {card && <>
      {card.teach_focus_vi && <p className="spk-lead">{card.teach_focus_vi}</p>}
      {card.common_weak_response_en && <div className="spk-pair"><div><small>Câu còn yếu</small><q lang="en">{card.common_weak_response_en}</q></div><div><small>Câu tốt hơn</small><q lang="en">{card.improved_phrase_en}</q></div></div>}
      {card.why_improvement_vi && <p>{card.why_improvement_vi}</p>}
      {card.target_collocations_EN?.length ? <div className="ll-card-types spk-collocations">{card.target_collocations_EN.map((phrase) => <span key={phrase} lang="en">{phrase}</span>)}</div> : null}
      {card.what_to_prepare_vi && <p><b>Chuẩn bị:</b> {card.what_to_prepare_vi}</p>}
      {card.pronunciation_note_vi && <p className="spk-reflect"><b>Phát âm:</b> {card.pronunciation_note_vi}</p>}
    </>}
  </section>;
}

function ModelPanel({ model }: { model: SpeakingModel }) {
  return <section className="spk-panel spk-model">
    <span className="ll-kicker">{model.model_en ? "Bài nói tham khảo" : "Sửa câu tham khảo"}</span>
    {model.model_en && <div className="spk-model-text" lang="en">{model.model_en}</div>}
    {model.weak_en && <div className="spk-pair"><div><small>Câu còn yếu</small><q lang="en">{model.weak_en}</q></div><div><small>Câu tốt hơn</small><q lang="en">{model.improved_en}</q></div></div>}
    {model.analysis_vi && <p className="spk-model-note">{model.analysis_vi}</p>}
    {model.extra?.length ? <dl className="spk-extra">{model.extra.map((row) => <div key={row.label}><dt>{row.label}</dt><dd lang={row.en ? "en" : undefined}>{row.text}</dd></div>)}</dl> : null}
    {model.critical_improvement_vi && <div className="ll-tip"><span><BookOpenCheck size={17}/></span><p><b>Điểm tạo khác biệt</b>{model.critical_improvement_vi}{model.critical_improvement_en && <q lang="en"> {model.critical_improvement_en}</q>}</p></div>}
    {model.self_review_questions_vi && <ul className="spk-bullets">{model.self_review_questions_vi.map((line) => <li key={line}>{line}</li>)}</ul>}
    <p className="ll-footnote">{model.model_purpose_vi ?? "Ví dụ để tham khảo cách tổ chức ý, không phải bài được chấm band."} Đừng học thuộc; hãy nói lại ý của chính bạn.</p>
  </section>;
}

type TaskProps = {
  unit: SpeakingUnit; task: SpeakingTask; index: number; prompt: SpeakingRelease["prompts"][string]; tip: SpeakingRelease["tips"][string] | undefined;
  state: SpeakingState; take: string | undefined; checks: string[]; previousDoneAt: string | undefined; openedAt: number; busy: boolean; recent: boolean;
  onTake: (take: { url: string; seconds: number; transcript: string }) => Promise<void>; onFinish: () => void;
  update: (change: (current: SpeakingState) => SpeakingState) => void;
};

function TaskCard(props: TaskProps) {
  const { task, prompt, state, recent } = props;
  // Older finished turns fold away; the one just finished stays open so its tip is visible.
  const [manual, setManual] = useState<boolean | null>(null);
  const done = Boolean(state.done[task.id]);
  const open = manual ?? (!done || recent);
  if (done && !open) {
    const seconds = state.seconds[task.id] ?? 0;
    return <button type="button" className="spk-task-row" onClick={() => setManual(true)}>
      <span className="spk-task-num is-done"><Check size={14} strokeWidth={3}/></span>
      <span><b>{task.label}</b><small lang="en">{task.mode === "listen_choice" ? `${task.items?.length ?? 0} cặp từ` : prompt.prompt_en}</small></span>
      <span className="spk-task-meta">{task.mode === "listen_choice" ? "Đã nghe" : seconds ? clock(seconds) : "Không ghi âm"}<ChevronDown size={16}/></span>
    </button>;
  }
  const collapse = done ? () => setManual(false) : undefined;
  return task.mode === "listen_choice" ? <ListenTask {...props} onCollapse={collapse}/> : <SpokenTask {...props} onCollapse={collapse}/>;
}

function TaskHead({ task, index, done, onCollapse }: { task: SpeakingTask; index: number; done: boolean; onCollapse?: () => void }) {
  return <div className="ll-q-head">
    <span className="ll-q-num">{done ? <Check size={14} strokeWidth={3}/> : index + 1}</span>
    <div><small>{task.label} · {partLabel(task.part)}{task.expected_seconds.max ? ` · ${secondsLabel(task.expected_seconds)}` : ""}</small><em className="spk-hint">{task.hint}</em></div>
    {onCollapse && <button type="button" className="spk-collapse" onClick={onCollapse} aria-label="Thu gọn"><ChevronDown size={16}/></button>}
  </div>;
}

function ListenTask({ task, index, prompt, tip, state, busy, onFinish, update, onCollapse }: TaskProps & { onCollapse?: () => void }) {
  const done = Boolean(state.done[task.id]);
  const items = task.items ?? [];
  const chosen = (itemId: string) => state.choices[`${task.id}:${itemId}`];
  const answered = items.filter((item) => chosen(item.id)).length;
  const right = tip?.answers ? items.filter((item) => chosen(item.id) === tip.answers![item.id]).length : 0;
  return <article className="ll-q spk-card">
    <TaskHead task={task} index={index} done={done} onCollapse={onCollapse}/>
    {prompt.instructions_vi && <p className="spk-instructions">{prompt.instructions_vi}</p>}
    <ul className="spk-listen">{items.map((item, number) => {
      const answer = tip?.answers?.[item.id];
      return <li key={item.id} className={answer ? chosen(item.id) === answer ? "is-right" : "is-wrong" : ""}>
        <span className="spk-listen-num">{number + 1}</span>
        <audio controls preload="none" src={speakingAudioUrl(item.id)} aria-label={`Âm thanh ${number + 1}`}/>
        <div className="spk-listen-options" role="radiogroup" aria-label={`Chọn từ nghe được ở câu ${number + 1}`}>
          {item.options.map((option) => <button type="button" role="radio" key={option.id} disabled={done} aria-checked={chosen(item.id) === option.id}
            className={answer === option.id ? "is-answer" : ""}
            onClick={() => update((value) => ({ ...value, choices: { ...value.choices, [`${task.id}:${item.id}`]: option.id } }))}>
            <b>{option.id}</b><span lang="en">{option.word}</span>
          </button>)}
        </div>
      </li>;
    })}</ul>
    {!done ? <div className="spk-row">
      <small>{answered}/{items.length} câu đã chọn</small>
      <button type="button" className="ll-btn ll-btn-primary" disabled={busy || answered < items.length} onClick={onFinish}><Check size={15}/>{busy ? "Đang lưu…" : "Kiểm tra & mở tiếp"}</button>
    </div> : tip && <div className="ll-feedback spk-tip">
      <div className="ll-feedback-top"><strong><Headphones size={14}/> Đúng {right}/{items.length}</strong></div>
      {tip.tip_vi && <p>{tip.tip_vi}</p>}
    </div>}
  </article>;
}

function SpokenTask({ unit, task, index, prompt, tip, state, take, checks, previousDoneAt, openedAt, busy, onTake, onFinish, update, onCollapse }: TaskProps & { onCollapse?: () => void }) {
  const mic = useMic();
  const [prep, setPrep] = useState(0);
  const [noMic, setNoMic] = useState(false);
  const done = Boolean(state.done[task.id]);
  const seconds = state.seconds[task.id] ?? 0;
  const ticked = checks.filter((_, item) => state.checks[`${task.id}:${item}`]).length;

  useEffect(() => {
    if (prep <= 0) return;
    const timer = window.setTimeout(() => setPrep((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [prep]);

  const waitDays = useMemo(() => {
    if (!task.gap_days || !previousDoneAt || done) return 0;
    const since = Math.max(0, (openedAt - new Date(previousDoneAt).getTime()) / 86_400_000);
    return since < task.gap_days ? Math.ceil(task.gap_days - since) : 0;
  }, [task.gap_days, previousDoneAt, done, openedAt]);

  async function toggleRecording() {
    if (mic.recording) {
      const result = await mic.stop();
      if (result) await onTake(result);
      return;
    }
    setPrep(0);
    await mic.start();
  }

  const over = mic.recording && mic.seconds > task.expected_seconds.max;
  const ready = seconds > 0 || noMic;
  // A Part 2 cue card can go to the existing coaching queue, like the practice room; it is the learner's choice to upload.
  const cue: SpeakingItem | null = task.mode === "full_cue" ? { id: `${unit.id}:${task.id}`, part: 2, kind: "cue", text: prompt.prompt_en, bullets: prompt.cue_bullets } : null;

  return <article className="ll-q spk-card">
    <TaskHead task={task} index={index} done={done} onCollapse={onCollapse}/>

    <div className="spk-prompt" lang="en">
      <p>{prompt.prompt_en}</p>
      {prompt.cue_bullets?.length ? <><small>You should say:</small><ul>{prompt.cue_bullets.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
      {prompt.model_en && <p className="spk-prompt-model"><small>Mẫu để luyện:</small> {prompt.model_en}</p>}
    </div>
    {prompt.instructions_vi && <p className="spk-instructions">{prompt.instructions_vi}</p>}
    {waitDays > 0 && <p className="spk-wait"><CalendarClock size={15}/> Lượt này nên nói sau {task.gap_days} ngày để kiểm tra bạn nhớ được gì (còn khoảng {waitDays} ngày). Bạn vẫn có thể nói ngay.</p>}

    <div className="spk-recorder">
      {task.prep_seconds > 0 && !mic.recording && <button type="button" className="ll-btn" onClick={() => setPrep(prep ? 0 : task.prep_seconds)}><Timer size={15}/>{prep ? `Chuẩn bị ${clock(prep)}` : `Chuẩn bị ${task.prep_seconds / 60} phút`}</button>}
      <button type="button" className={`ll-btn ${mic.recording ? "spk-rec-on" : "ll-btn-primary"}`} onClick={() => void toggleRecording()}>
        {mic.recording ? <><Square size={14} fill="currentColor"/> Dừng · {clock(mic.seconds)}</> : take ? <><RotateCcw size={15}/> Nói lại</> : <><Mic size={15}/> Bắt đầu nói</>}
      </button>
      {mic.recording && <button type="button" className="ll-btn" onClick={mic.paused ? mic.resume : mic.pause}>{mic.paused ? <><Play size={14}/> Tiếp</> : <><Pause size={14}/> Tạm dừng</>}</button>}
      {mic.recording && <span className="spk-level" aria-hidden="true"><i style={{ width: `${Math.min(100, mic.level * 400)}%` }}/></span>}
      {over && <small className="spk-over">Đã quá {task.expected_seconds.max} giây, có thể dừng.</small>}
    </div>
    {mic.error && <p className="ll-error" role="alert"><MicOff size={14}/> {mic.error}</p>}
    {take && !mic.recording && <div className="spk-take">
      <audio controls src={take} preload="metadata"/>
      <small>{clock(seconds)} · mục tiêu {secondsLabel(task.expected_seconds)}</small>
    </div>}
    {state.transcript[task.id] && !mic.recording && <p className="spk-transcript"><small>Trình duyệt nghe được:</small> <span lang="en">{state.transcript[task.id]}</span></p>}
    {!take && !done && <label className="spk-nomic"><input type="checkbox" checked={noMic} onChange={(event) => setNoMic(event.target.checked)}/> Tôi nói thành tiếng nhưng không ghi âm</label>}
    {cue && take && !mic.recording && <PracticeCoaching examId={`speaking-lab:${unit.id}`} item={cue} take={{ url: take, seconds, transcript: state.transcript[task.id] ?? "" }}/>}

    <fieldset className="spk-checks">
      <legend>Tự kiểm tra sau khi nói</legend>
      {checks.map((line, item) => <label key={item}><input type="checkbox" checked={Boolean(state.checks[`${task.id}:${item}`])}
        onChange={(event) => { const checked = event.target.checked; update((value) => ({ ...value, checks: { ...value.checks, [`${task.id}:${item}`]: checked } })); }}/>{line}</label>)}
    </fieldset>
    <textarea className="spk-text spk-note" rows={2} value={state.notes[task.id] ?? ""} placeholder="Ghi chú: điều mình muốn sửa ở lượt sau…" aria-label={`Ghi chú lượt ${index + 1}`}
      onChange={(event) => { const value = event.target.value; update((currentState) => ({ ...currentState, notes: { ...currentState.notes, [task.id]: value.slice(0, 1000) } })); }}/>

    {!done ? <div className="spk-row">
      <small>{ticked}/{checks.length} mục tự kiểm tra</small>
      <button type="button" className="ll-btn ll-btn-primary" disabled={busy || !ready || mic.recording} onClick={onFinish}>
        <Check size={15}/>{busy ? "Đang lưu…" : index === unit.tasks.length - 1 ? "Xong lượt cuối" : "Xong lượt nói, mở tiếp"}
      </button>
    </div> : tip && <div className="ll-feedback spk-tip">
      <div className="ll-feedback-top"><strong><Lightbulb size={14}/> Gợi ý cho lượt này</strong></div>
      {tip.tip_vi && <p>{tip.tip_vi}</p>}
      {tip.tip_en && <p className="spk-reflect" lang="en">{tip.tip_en}</p>}
      {tip.contrast_en && <p className="spk-language"><b>Phân biệt:</b> <span lang="en">{tip.contrast_en}</span></p>}
      {tip.focus_collocation_en && <p className="spk-language"><b>Cụm nên thử:</b> <span lang="en">{tip.focus_collocation_en}</span></p>}
      {tip.phrases?.length ? <div className="ll-card-types spk-collocations">{tip.phrases.map((phrase) => <span key={phrase} lang="en">{phrase}</span>)}</div> : null}
      {tip.error_to_avoid_en && <p className="spk-caution"><b>Tránh:</b> <span lang="en">{tip.error_to_avoid_en}</span></p>}
      {tip.note_vi && <p className="spk-reflect">{tip.note_vi}</p>}
    </div>}
  </article>;
}

type Take = { url: string; seconds: number; transcript: string };

/**
 * A full mock test, run like the exam: one question on screen, answer, stop, and the next question opens.
 * No tips during the test; the debrief and any sample excerpts come from the server after the last question.
 */
function MockRunner({ unit, release, state, takes, busy, onTake, onFinish }: {
  unit: SpeakingUnit; release: SpeakingRelease; state: SpeakingState; takes: Record<string, string>; busy: boolean;
  onTake: (task: SpeakingTask, index: number, take: Take) => Promise<void>; onFinish: (task: SpeakingTask) => Promise<void>;
}) {
  const mic = useMic();
  const [prep, setPrep] = useState(0);
  const [started, setStarted] = useState(Boolean(release.current && release.current !== unit.tasks[0]?.id));
  const index = unit.tasks.findIndex((task) => task.id === release.current);
  const task = index >= 0 ? unit.tasks[index] : null;
  const prompt = task ? release.prompts[task.id] : undefined;

  useEffect(() => {
    if (prep <= 0) return;
    const timer = window.setTimeout(() => setPrep((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [prep]);

  async function answer() {
    if (!task) return;
    if (!mic.recording) { setPrep(0); await mic.start(); return; }
    const take = await mic.stop();
    if (take) await onTake(task, index, take);
    await onFinish(task);
  }

  const parts = [1, 2, 3].map((part) => ({ part, tasks: unit.tasks.filter((item) => item.part === part) }));

  if (task && !started) return <section className="spk-panel spk-mock-intro">
    <h2>Trước khi bắt đầu</h2>
    <ul className="spk-bullets">
      <li>Đề có 3 phần, 16 câu: Part 1 phỏng vấn ngắn, Part 2 cue card (1 phút chuẩn bị, nói tối đa 2 phút) và Part 3 thảo luận.</li>
      <li>Mỗi lần chỉ hiện một câu. Bấm <b>Trả lời</b> để ghi âm, bấm <b>Xong, câu tiếp</b> để chuyển câu; không quay lại câu trước.</li>
      <li>Không có gợi ý trong lúc thi. Nhận xét và đoạn mẫu mở sau câu cuối. Bản ghi chỉ lưu trên trình duyệt này.</li>
    </ul>
    <div className="spk-row"><button type="button" className="ll-btn ll-btn-primary" onClick={() => { setStarted(true); void mic.open(); }}><Play size={15}/> Bắt đầu thi thử</button></div>
  </section>;

  return <>
    <ol className="spk-mock-track" aria-label="Tiến độ đề thi">{parts.map(({ part, tasks }) => <li key={part}>
      <b>{partLabel(part)}</b>
      <span>{tasks.map((item) => <i key={item.id} className={state.done[item.id] ? "is-done" : item.id === release.current ? "is-here" : ""}/>)}</span>
    </li>)}</ol>

    {task && prompt ? <article className="ll-q spk-card spk-mock-card" id="spk-current">
      <div className="ll-q-head">
        <span className="ll-q-num">{index + 1}</span>
        <div><small>{partLabel(task.part)} · {task.label} · câu {index + 1}/{unit.tasks.length}</small></div>
      </div>
      <div className="spk-prompt" lang="en">
        <p>{prompt.prompt_en}</p>
        {prompt.cue_bullets?.length ? <><small>You should say:</small><ul>{prompt.cue_bullets.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
      </div>
      <div className="spk-recorder">
        {task.prep_seconds > 0 && !mic.recording && <button type="button" className="ll-btn" onClick={() => setPrep(prep ? 0 : task.prep_seconds)}><Timer size={15}/>{prep ? `Chuẩn bị ${clock(prep)}` : "Chuẩn bị 1 phút"}</button>}
        <button type="button" className={`ll-btn ${mic.recording ? "spk-rec-on" : "ll-btn-primary"}`} disabled={busy} onClick={() => void answer()}>
          {mic.recording ? <><Square size={14} fill="currentColor"/> Xong, câu tiếp · {clock(mic.seconds)}</> : busy ? "Đang lưu…" : <><Mic size={15}/> Trả lời</>}
        </button>
        {mic.recording && <span className="spk-level" aria-hidden="true"><i style={{ width: `${Math.min(100, mic.level * 400)}%` }}/></span>}
        {mic.recording && mic.seconds > task.expected_seconds.max && <small className="spk-over">Đã đủ thời gian, có thể chuyển câu.</small>}
        {!mic.recording && <button type="button" className="ll-btn spk-skip" disabled={busy} onClick={() => void onFinish(task)}>Nói không ghi âm, câu tiếp</button>}
      </div>
      {mic.error && <p className="ll-error" role="alert"><MicOff size={14}/> {mic.error}</p>}
    </article> : <>
      <section className="spk-panel">
        <span className="ll-kicker">Nghe lại bài thi</span>
        <ol className="spk-review">{unit.tasks.map((item) => {
          const itemPrompt = release.prompts[item.id];
          const take = takes[item.id];
          const seconds = state.seconds[item.id] ?? 0;
          const cue: SpeakingItem | null = item.mode === "full_cue" && itemPrompt ? { id: `${unit.id}:${item.id}`, part: 2, kind: "cue", text: itemPrompt.prompt_en, bullets: itemPrompt.cue_bullets } : null;
          return <li key={item.id}>
            <small>{partLabel(item.part)} · {item.label}</small>
            <p lang="en">{itemPrompt?.prompt_en}</p>
            {take ? <div className="spk-take"><audio controls src={take} preload="none"/><small>{clock(seconds)}</small></div> : <small className="spk-review-none">Không ghi âm</small>}
            {state.transcript[item.id] && <p className="spk-transcript"><small>Trình duyệt nghe được:</small> <span lang="en">{state.transcript[item.id]}</span></p>}
            {cue && take && <PracticeCoaching examId={`speaking-lab:${unit.id}`} item={cue} take={{ url: take, seconds, transcript: state.transcript[item.id] ?? "" }}/>}
          </li>;
        })}</ol>
      </section>
      {release.model && <ModelPanel model={release.model}/>}
      <div className="spk-finish"><Check size={18}/> Bạn đã hoàn thành đề này. <Link href={mapHref(unit)}>Về danh sách đề</Link></div>
    </>}
  </>;
}

function Breadcrumb({ current, back = SPEAKING_BASE }: { current: string; back?: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={back}>Speaking Lab</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}
