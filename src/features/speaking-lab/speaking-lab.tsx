"use client";
/*
 * Speaking Lab: 16 skill routes (4 criteria × 4 skills) and 24 Part 1/2 topic lessons from the M10-L80 handoff.
 * The map reuses the Listening Lab layout so the self-study labs read as one product. A unit walks through its
 * spoken tasks one at a time: learn first, speak and keep a take (it stays in this browser), tick a self-check,
 * then the server releases the tip for that task, coaching after the first and a model after the last.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, BookOpenCheck, CalendarClock, Check, ChevronDown, Lightbulb, Mic, MicOff, Pause, Play, RotateCcw, Sparkles, Square, Target, Timer } from "lucide-react";
import { clock, useMic } from "@/features/ielts/speaking-kit";
import {
  SPEAKING_API, SPEAKING_BASE, criterionInfo, criterionOrder, emptySpeakingState, partLabel, secondsLabel, tasksDone, unitDone,
  type Criterion, type SpeakingCatalog, type SpeakingRelease, type SpeakingState, type SpeakingTask, type SpeakingUnit,
} from "@/lib/speaking-lab/types";
import { cacheSpeakingState, keepRecording, loadAllSpeakingStates, loadSpeakingState, recordingUrl, releaseSpeaking, saveSpeakingState } from "./speaking-state";
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
const topicTone = { "--ll-tone": "#6a4fb3", "--ll-soft": "#efeafb" } as CSSProperties;
const unitTone = (unit: SpeakingUnit, catalog: SpeakingCatalog) => {
  const criterion = unit.criterion ?? catalog.skills.find((skill) => skill.id === unit.skills[0])?.criterion;
  return unit.kind === "topic" ? topicTone : criterion ? tone(criterion) : topicTone;
};
const unitNumber = (unit: SpeakingUnit) => unit.kind === "skill" ? unit.skills[0] : String(unit.order ?? 0).padStart(2, "0");

/* ───────────────────────── Map ───────────────────────── */

function MapPage() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "chu-de" ? "topics" : "skills";
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [states, setStates] = useState<Record<string, SpeakingState>>({});
  const [error, setError] = useState("");
  const [part, setPart] = useState<0 | 1 | 2>(0);

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

  if (error) return <div className="ll-page spk-lab"><p className="ll-error" role="alert">{error}</p></div>;
  if (!data) return <div className="ll-page spk-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const { catalog } = data;
  const units = catalog.units;
  const skillUnits = units.filter((unit) => unit.kind === "skill");
  const topicUnits = units.filter((unit) => unit.kind === "topic");
  const started = (unit: SpeakingUnit) => tasksDone(unit, states[unit.id]) > 0;
  const pool = tab === "topics" ? topicUnits : skillUnits;
  const next = pool.find((unit) => started(unit) && !unitDone(unit, states[unit.id])) ?? pool.find((unit) => !unitDone(unit, states[unit.id])) ?? pool[0];
  const done = units.filter((unit) => unitDone(unit, states[unit.id])).length;
  const turns = units.reduce((sum, unit) => sum + tasksDone(unit, states[unit.id]), 0);
  const allTurns = units.reduce((sum, unit) => sum + unit.tasks.length, 0);
  const show = (target: "skills" | "topics") => router.replace(target === "topics" ? `${SPEAKING_BASE}?tab=chu-de` : SPEAKING_BASE, { scroll: false });

  return <div className="ll-page ll-roadmap spk-lab">
    <header className="ll-hero spk-hero">
      <div className="ll-hero-copy">
        <h1>Luyện Speaking theo kỹ năng, <em>từng lượt nói một.</em></h1>
        <div className="ll-hero-actions">
          {next && <Link className="ll-cta" href={`${SPEAKING_BASE}/${next.id}`}>
            <span className="ll-cta-icon"><Play size={18} fill="currentColor"/></span>
            <span><b>{started(next) ? "Học tiếp" : "Bắt đầu"}</b><small>{next.kind === "skill" ? `Kỹ năng ${next.skills[0]}` : `Chủ đề ${unitNumber(next)}`} · {next.title_vi}</small></span>
            <ArrowRight size={18}/>
          </Link>}
          <span className="ll-draft-pill" title="Nội dung luyện tập do đội ngũ biên soạn, chưa được giáo viên duyệt toàn bộ">Thử nghiệm</span>
        </div>
      </div>
      <div className="ll-stats">
        <div className="ll-stats-ring"><Ring value={done} total={units.length}/><div><strong>Bài đã hoàn thành</strong><span>Còn {units.length - done} bài</span></div></div>
        <dl><div><dt>Lượt nói đã xong</dt><dd>{turns}/{allTurns}</dd></div><div><dt>Kỹ năng</dt><dd>{catalog.skills.length}</dd></div><div><dt>Chủ đề</dt><dd>{topicUnits.length}</dd></div></dl>
      </div>
    </header>

    {!data.ready && <p className="ll-error" role="status">Nội dung câu hỏi đang được cập nhật. Bạn vẫn xem được lộ trình; bài học sẽ mở khi dữ liệu sẵn sàng.</p>}

    <div className="spk-tabs" role="tablist" aria-label="Speaking Lab">
      <button type="button" role="tab" aria-selected={tab === "skills"} onClick={() => show("skills")}><b>16 kỹ năng</b><small>Theo 4 tiêu chí chấm</small></button>
      <button type="button" role="tab" aria-selected={tab === "topics"} onClick={() => show("topics")}><b>Bài theo chủ đề</b><small>{topicUnits.length} bài Part 1 &amp; Part 2</small></button>
    </div>

    {tab === "skills" ? <>
      <section className="ll-journey spk-journey" aria-labelledby="spk-journey-title">
        <div className="ll-section-head"><div><span className="ll-kicker">Bản đồ kỹ năng</span><h2 id="spk-journey-title">4 tiêu chí, 16 kỹ năng</h2></div><small>Mỗi kỹ năng: học → nói lần đầu → xem cách sửa → nói câu mới.</small></div>
        <ol className="ll-track-map">{criterionOrder.map((criterion) => {
          const group = skillUnits.filter((unit) => unit.criterion === criterion);
          const count = group.filter((unit) => unitDone(unit, states[unit.id])).length;
          const here = next?.criterion === criterion;
          return <li key={criterion} style={tone(criterion)} className={`${here ? "is-here" : ""} ${group.length && count === group.length ? "is-done" : ""}`}>
            <a href={`#tieu-chi-${criterion}`}>
              <span className="ll-node">{group.length && count === group.length ? <Check size={16} strokeWidth={3}/> : criterion}</span>
              <b>{criterionInfo[criterion].name}</b><small>{group.length} kỹ năng</small>
              <i aria-label={`${count}/${group.length} kỹ năng hoàn thành`}>{group.map((unit) => <em key={unit.id} className={unitDone(unit, states[unit.id]) ? "is-on" : ""}/>)}</i>
              {here && <span className="ll-here">Bạn ở đây</span>}
            </a>
          </li>;
        })}</ol>
      </section>
      {criterionOrder.map((criterion) => {
        const group = skillUnits.filter((unit) => unit.criterion === criterion);
        const count = group.filter((unit) => unitDone(unit, states[unit.id])).length;
        return <section className="ll-stage" id={`tieu-chi-${criterion}`} key={criterion} style={tone(criterion)}>
          <header><span className="ll-stage-tag">{criterion}</span><h2>{criterionInfo[criterion].name}<small>{criterionInfo[criterion].en}</small></h2><span className="ll-stage-progress"><i><em style={{ width: `${(count / group.length) * 100}%` }}/></i>{count}/{group.length} xong</span></header>
          <div className="ll-grid">{group.map((unit) => <UnitCard key={unit.id} unit={unit} state={states[unit.id]} isNext={unit.id === next?.id}/>)}</div>
        </section>;
      })}
    </> : <>
      <div className="ll-typebar" role="group" aria-label="Lọc theo phần thi">
        <span><Mic size={16}/> Phần thi</span>
        {([0, 1, 2] as const).map((value) => <button type="button" key={value} aria-pressed={part === value} onClick={() => setPart(value)}>
          {value ? partLabel(value) : "Tất cả"}<small>{value ? topicUnits.filter((unit) => unit.part === value).length : topicUnits.length}</small>
        </button>)}
      </div>
      <section className="ll-stage" style={topicTone}>
        <header><span className="ll-stage-tag">Chủ đề</span><h2>Bài theo chủ đề<small>Mỗi bài 6 lượt nói, từ trả lời đầu tiên đến tình huống mới</small></h2><span className="ll-stage-progress"><i><em style={{ width: `${(topicUnits.filter((unit) => unitDone(unit, states[unit.id])).length / topicUnits.length) * 100}%` }}/></i>{topicUnits.filter((unit) => unitDone(unit, states[unit.id])).length}/{topicUnits.length} xong</span></header>
        <div className="ll-grid">{topicUnits.filter((unit) => !part || unit.part === part).map((unit) => <UnitCard key={unit.id} unit={unit} state={states[unit.id]} isNext={unit.id === next?.id} catalog={catalog}/>)}</div>
      </section>
    </>}

    <aside className="ll-note"><Sparkles size={16}/><p>{catalog.source.note_vi} Bản ghi âm chỉ lưu trên trình duyệt này; tài khoản chỉ lưu tiến độ, ghi chú và phần tự kiểm tra.</p></aside>
  </div>;
}

function UnitCard({ unit, state, isNext, catalog }: { unit: SpeakingUnit; state: SpeakingState | undefined; isNext: boolean; catalog?: SpeakingCatalog }) {
  const count = tasksDone(unit, state);
  const done = unitDone(unit, state);
  const status = done ? { label: "Hoàn thành", cls: "is-done" } : isNext ? { label: count ? "Đang học" : "Tiếp theo", cls: "is-next" } : count ? { label: "Đang học", cls: "is-tried" } : null;
  const skillNames = catalog ? unit.skills.map((id) => catalog.skills.find((skill) => skill.id === id)?.title_vi ?? id) : [];
  return <Link href={`${SPEAKING_BASE}/${unit.id}`} className={`ll-card ${isNext ? "is-next" : ""} ${done ? "is-done" : ""}`}>
    <div className="ll-card-top"><span className="ll-number">{unitNumber(unit)}</span>{status && <span className={`ll-status ${status.cls}`}>{status.label}</span>}</div>
    <strong>{unit.title_vi}</strong>
    <p className="spk-card-en" lang="en">{unit.title_en}</p>
    {unit.target_vi && <p className="spk-card-target">{unit.target_vi}</p>}
    <div className="ll-card-types"><span>{partLabel(unit.part)}</span>{skillNames.map((name) => <span key={name}>{name}</span>)}</div>
    <div className="ll-card-foot">
      <span className="ll-pips" aria-label={`${count}/${unit.tasks.length} lượt nói`}>{unit.tasks.map((task) => <i key={task.id} className={`spk-pip ${state?.done[task.id] ? "is-pass" : ""}`}/>)}</span>
      <small><Mic size={12}/> {unit.tasks.length} lượt nói</small>
      <ArrowRight size={16}/>
    </div>
  </Link>;
}

function Ring({ value, total }: { value: number; total: number }) {
  return <span className="ll-ring is-hero" role="img" aria-label={`${value}/${total} bài hoàn thành`}>
    <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19"/>{value > 0 && <circle cx="22" cy="22" r="19" strokeDasharray={`${(value / total) * 119.4} 119.4`}/>}</svg>
    <span><b>{value}</b><small>/{total}</small></span>
  </span>;
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
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urls = useRef<string[]>([]);

  const unit = catalog?.units.find((item) => item.id === id) ?? null;

  useEffect(() => {
    let alive = true;
    const opened = urls.current;
    void Promise.all([getJson<CatalogResponse>(SPEAKING_API), loadSpeakingState(id).catch(() => emptySpeakingState())]).then(async ([{ catalog: loaded }, saved]) => {
      if (!alive) return;
      const found = loaded.units.find((item) => item.id === id);
      setCatalog(loaded); setState(saved);
      if (!found) { setError("Không tìm thấy bài học."); return; }
      setTeachOpen(!found.tasks.some((task) => saved.done[task.id]));
      // Kept takes come from this browser; load them alongside the server release, not before it.
      void Promise.all(found.tasks.map(async (task, index) => [task.id, await recordingUrl(id, index)] as const)).then((found) => {
        const kept = Object.fromEntries(found.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
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
      cacheSpeakingState(id, next);
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => { void saveSpeakingState(id, next).catch(() => undefined); }, 2500);
      return next;
    });
  }, [id]);

  async function keepTake(task: SpeakingTask, index: number, take: { url: string; seconds: number; transcript: string }) {
    setTakes((current) => ({ ...current, [task.id]: take.url }));
    urls.current.push(take.url);
    update((current) => ({ ...current, seconds: { ...current.seconds, [task.id]: take.seconds }, transcript: { ...current.transcript, [task.id]: take.transcript } }));
    await keepRecording(id, index, take.url).catch(() => setError("Không lưu được bản ghi trên trình duyệt này; bạn vẫn nghe lại được tới khi rời trang."));
  }

  async function finish(task: SpeakingTask) {
    if (!state) return;
    const time = stamp();
    const next: SpeakingState = { ...state, done: { ...state.done, [task.id]: time.iso }, updatedAt: time.at };
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setBusy(true); setError(""); setState(next);
    try {
      await saveSpeakingState(id, next);
      setRelease(await releaseSpeaking(id, next));
      window.setTimeout(() => document.getElementById("spk-current")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa lưu được tiến độ.");
    } finally { setBusy(false); }
  }

  if (error && !unit) return <div className="ll-page spk-lab"><Breadcrumb current="Không tải được"/><p className="ll-error" role="alert">{error}</p></div>;
  if (!catalog || !unit || !state) return <div className="ll-page spk-lab"><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></div>;

  const count = tasksDone(unit, state);
  const skills = unit.skills.map((skillId) => catalog.skills.find((skill) => skill.id === skillId)).filter((skill) => skill !== undefined);
  const checks = (release?.card?.self_review_vi?.length ? release.card.self_review_vi
    : release?.teach.repair?.self_check_vi?.length ? release.teach.repair.self_check_vi
      : fallbackChecks).map(sentence);

  return <div className="ll-page ll-module spk-lab" style={unitTone(unit, catalog)}>
    <Breadcrumb current={`${unit.kind === "skill" ? `Kỹ năng ${unit.skills[0]}` : `Chủ đề ${unitNumber(unit)}`} · ${unit.title_vi}`}/>
    <header className="ll-module-hero">
      <div className="ll-module-badge"><small>{unit.kind === "skill" ? "Kỹ năng" : "Chủ đề"}</small><b>{unitNumber(unit)}</b></div>
      <div className="ll-module-copy">
        <span className="ll-kicker">{unit.kind === "skill" && unit.criterion ? criterionInfo[unit.criterion].name : "Bài theo chủ đề"} · {partLabel(unit.part)}</span>
        <h1>{unit.title_vi}</h1>
        <p lang="en">{unit.title_en}{unit.topic_en ? ` · ${unit.topic_en}` : ""}</p>
        <div className="ll-chips">{skills.map((skill) => <span key={skill.id}>{skill.id} · {skill.title_vi}</span>)}</div>
      </div>
      <dl className="ll-facts"><div><dt>Lượt nói</dt><dd>{count}/{unit.tasks.length}</dd></div><div><dt>Phần thi</dt><dd>{unit.part}</dd></div></dl>
    </header>

    {unit.target_vi && <div className="ll-tip"><span><Target size={17}/></span><p><b>Mục tiêu</b>{unit.target_vi}</p></div>}
    {error && <p className="ll-error" role="alert">{error}</p>}
    {!release ? <div className="ll-skeleton ll-skeleton-card"/> : <>
      <TeachPanel release={release} open={teachOpen} onToggle={() => setTeachOpen((value) => !value)}/>

      <ol className="spk-tasks">{unit.tasks.map((task, index) => {
        const prompt = release.prompts[task.id];
        const isDone = Boolean(state.done[task.id]);
        const isCurrent = release.current === task.id;
        if (!prompt) return <li key={task.id} className="spk-task is-locked"><span className="spk-task-num">{index + 1}</span><div><b>{task.label}</b><small>{task.hint}</small></div><span className="spk-lock">Mở sau lượt {index}</span></li>;
        const previous = index > 0 ? state.done[unit.tasks[index - 1].id] : undefined;
        return <li key={task.id} id={isCurrent ? "spk-current" : undefined} className={`spk-task ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}>
          <TaskCard
            unit={unit} task={task} index={index} prompt={prompt} tip={release.tips[task.id]} state={state} take={takes[task.id]}
            checks={checks} previousDoneAt={previous} openedAt={openedAt} busy={busy} recent={isDone && (release.current ? unit.tasks[index + 1]?.id === release.current : index === unit.tasks.length - 1)}
            onTake={(take) => keepTake(task, index, take)} onFinish={() => void finish(task)} update={update}
          />
          {index === 0 && isDone && (release.coaching || release.card) && <Coaching release={release}/>}
        </li>;
      })}</ol>

      {release.model ? <section className="spk-panel spk-model">
        <span className="ll-kicker">Bài nói tham khảo</span>
        <div className="spk-model-text" lang="en">{release.model.model_en}</div>
        {release.model.critical_improvement_vi && <div className="ll-tip"><span><BookOpenCheck size={17}/></span><p><b>Điểm tạo khác biệt</b>{release.model.critical_improvement_vi}{release.model.critical_improvement_en && <q lang="en"> {release.model.critical_improvement_en}</q>}</p></div>}
        {release.model.self_review_questions_vi && <ul className="spk-bullets">{release.model.self_review_questions_vi.map((line) => <li key={line}>{line}</li>)}</ul>}
        <p className="ll-footnote">{release.model.model_purpose_vi ?? "Ví dụ cách tổ chức câu trả lời, không phải bài được chấm band."} Đừng học thuộc; hãy nói lại ý của chính bạn.</p>
      </section> : unit.kind === "topic" && release.current !== null && <p className="ll-empty">Bài nói tham khảo mở sau khi bạn xong cả {unit.tasks.length} lượt nói.</p>}

      {release.current === null && <div className="spk-finish"><Check size={18}/> Bạn đã xong bài này. <Link href={unit.kind === "topic" ? `${SPEAKING_BASE}?tab=chu-de` : SPEAKING_BASE}>Về lộ trình</Link></div>}
    </>}

    <p className="ll-footnote">Nội dung luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức, và không chấm điểm. Bản ghi âm chỉ ở trên trình duyệt này; tài khoản lưu tiến độ, ghi chú và phần tự kiểm tra.</p>
  </div>;
}

function TeachPanel({ release, open, onToggle }: { release: SpeakingRelease; open: boolean; onToggle: () => void }) {
  const { guide, repair, skills } = release.teach;
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
    </div>}
  </section>;
}

function Coaching({ release }: { release: SpeakingRelease }) {
  const { coaching, card } = release;
  return <section className="ll-feedback spk-coaching">
    <div className="ll-feedback-top"><strong><BookOpenCheck size={14}/> Cách sửa sau lượt đầu</strong></div>
    {coaching && <>
      {coaching.weak_en && <div className="spk-pair"><div><small>Câu còn yếu</small><q lang="en">{coaching.weak_en}</q></div><div><small>Câu tốt hơn</small><q lang="en">{coaching.improved_en}</q></div></div>}
      {coaching.analysis_vi && <p>{coaching.analysis_vi}</p>}
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

type TaskProps = {
  unit: SpeakingUnit; task: SpeakingTask; index: number; prompt: SpeakingRelease["prompts"][string]; tip: SpeakingRelease["tips"][string] | undefined;
  state: SpeakingState; take: string | undefined; checks: string[]; previousDoneAt: string | undefined; openedAt: number; busy: boolean; recent: boolean;
  onTake: (take: { url: string; seconds: number; transcript: string }) => Promise<void>; onFinish: () => void;
  update: (change: (current: SpeakingState) => SpeakingState) => void;
};

function TaskCard({ unit, task, index, prompt, tip, state, take, checks, previousDoneAt, openedAt, busy, recent, onTake, onFinish, update }: TaskProps) {
  const mic = useMic();
  const [prep, setPrep] = useState(0);
  // Older finished turns fold away; the one just finished stays open so its tip is visible.
  const [manual, setManual] = useState<boolean | null>(null);
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

  const open = manual ?? (!done || recent);
  if (done && !open) return <button type="button" className="spk-task-row" onClick={() => setManual(true)}>
    <span className="spk-task-num is-done"><Check size={14} strokeWidth={3}/></span>
    <span><b>{task.label}</b><small lang="en">{prompt.prompt_en}</small></span>
    <span className="spk-task-meta">{seconds ? clock(seconds) : "Không ghi âm"}<ChevronDown size={16}/></span>
  </button>;

  return <article className="ll-q spk-card">
    <div className="ll-q-head">
      <span className="ll-q-num">{done ? <Check size={14} strokeWidth={3}/> : index + 1}</span>
      <div><small>{task.label} · {partLabel(task.part)} · {secondsLabel(task.expected_seconds)}</small><em className="spk-hint">{task.hint}</em></div>
      {done && <button type="button" className="spk-collapse" onClick={() => setManual(false)} aria-label="Thu gọn"><ChevronDown size={16}/></button>}
    </div>

    <div className="spk-prompt" lang="en">
      <p>{prompt.prompt_en}</p>
      {prompt.cue_bullets?.length ? <><small>You should say:</small><ul>{prompt.cue_bullets.map((line) => <li key={line}>{line}</li>)}</ul></> : null}
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
      {tip.focus_collocation_en && <p className="spk-language"><b>Cụm nên thử:</b> <span lang="en">{tip.focus_collocation_en}</span></p>}
      {tip.error_to_avoid_en && <p className="spk-caution"><b>Tránh:</b> <span lang="en">{tip.error_to_avoid_en}</span></p>}
    </div>}
  </article>;
}

function Breadcrumb({ current }: { current: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={SPEAKING_BASE}>Speaking Lab</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}
