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
import { ArrowRight, BookOpenCheck, CalendarClock, Check, ChevronDown, Headphones, Lightbulb, Mic, MicOff, Pause, Play, RotateCcw, Sparkles, Square, Target, Timer } from "lucide-react";
import { clock, useMic, type SpeakingItem } from "@/features/ielts/speaking-kit";
import { PracticeCoaching } from "@/features/ielts/speaking-practice-coaching";
import {
  SPEAKING_API, SPEAKING_BASE, criterionInfo, criterionOrder, emptySpeakingState, partLabel, secondsLabel, speakingAudioUrl, tasksDone, unitDone,
  type Criterion, type SpeakingCatalog, type SpeakingModel, type SpeakingRelease, type SpeakingState, type SpeakingTask, type SpeakingUnit,
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
const swatch = (toneColor: string, soft: string) => ({ "--ll-tone": toneColor, "--ll-soft": soft }) as CSSProperties;
const topicTone = swatch("#6a4fb3", "#efeafb");
const pronTone = swatch("#0a7f89", "#e2f5f4");
const seriesTone: Record<string, CSSProperties> = {
  L57: swatch("#3b6fb6", "#e5eefb"), L58: swatch("#8a5bb8", "#f0e8f8"), L59: swatch("#2f7d6d", "#e3f3ee"), L60: swatch("#c0623b", "#fbece4"),
};
const unitTone = (unit: SpeakingUnit, catalog: SpeakingCatalog) => {
  if (unit.kind === "topic") return topicTone;
  if (unit.kind === "pron") return pronTone;
  if (unit.kind === "part3") return seriesTone[unit.series ?? ""] ?? topicTone;
  const criterion = unit.criterion ?? catalog.skills.find((skill) => skill.id === unit.skills[0])?.criterion;
  return criterion ? tone(criterion) : topicTone;
};
const unitNumber = (unit: SpeakingUnit) => unit.kind === "skill" ? unit.skills[0] : unit.kind === "pron" ? unit.id.replace("pron-", "") : String(unit.order ?? 0).padStart(2, "0");
function unitLabel(unit: SpeakingUnit, catalog: SpeakingCatalog) {
  if (unit.kind === "skill") return `Kỹ năng ${unit.skills[0]}`;
  if (unit.kind === "topic") return `Chủ đề ${unitNumber(unit)}`;
  if (unit.kind === "pron") return `Phát âm ${unitNumber(unit)}`;
  return `${catalog.series.find((series) => series.id === unit.series)?.title_vi ?? "Part 3"} · Bài ${unitNumber(unit)}`;
}

type Tab = "skills" | "topics" | "advanced" | "pron";
const tabParam: Record<Tab, string> = { skills: "", topics: "chu-de", advanced: "nang-cao", pron: "phat-am" };
const tabKinds: Record<Tab, SpeakingUnit["kind"]> = { skills: "skill", topics: "topic", advanced: "part3", pron: "pron" };
const tabOf = (unit: SpeakingUnit) => (Object.keys(tabKinds) as Tab[]).find((key) => tabKinds[key] === unit.kind) ?? "skills";
const mapHref = (unit: SpeakingUnit) => tabParam[tabOf(unit)] ? `${SPEAKING_BASE}?tab=${tabParam[tabOf(unit)]}` : SPEAKING_BASE;

/* ───────────────────────── Map ───────────────────────── */

function MapPage() {
  const router = useRouter();
  const param = useSearchParams().get("tab") ?? "";
  const tab = (Object.keys(tabParam) as Tab[]).find((key) => tabParam[key] && tabParam[key] === param) ?? "skills";
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [states, setStates] = useState<Record<string, SpeakingState>>({});
  const [error, setError] = useState("");
  const [part, setPart] = useState<0 | 1 | 2>(0);
  const [series, setSeries] = useState("");

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
  const of = (kind: SpeakingUnit["kind"]) => units.filter((unit) => unit.kind === kind);
  const skillUnits = of("skill");
  const topicUnits = of("topic");
  const part3Units = of("part3");
  const pronUnits = of("pron");
  const started = (unit: SpeakingUnit) => tasksDone(unit, states[unit.id]) > 0;
  const finished = (list: SpeakingUnit[]) => list.filter((unit) => unitDone(unit, states[unit.id])).length;
  const pool = of(tabKinds[tab]);
  const next = pool.find((unit) => started(unit) && !unitDone(unit, states[unit.id])) ?? pool.find((unit) => !unitDone(unit, states[unit.id])) ?? pool[0];
  const done = finished(units);
  const turns = units.reduce((sum, unit) => sum + tasksDone(unit, states[unit.id]), 0);
  const allTurns = units.reduce((sum, unit) => sum + unit.tasks.length, 0);
  const show = (target: Tab) => router.replace(tabParam[target] ? `${SPEAKING_BASE}?tab=${tabParam[target]}` : SPEAKING_BASE, { scroll: false });
  const card = (unit: SpeakingUnit) => <UnitCard key={unit.id} unit={unit} state={states[unit.id]} isNext={unit.id === next?.id} catalog={catalog}/>;
  const stage = (key: string, style: CSSProperties, tag: string, title: string, sub: string, list: SpeakingUnit[], shown = list) =>
    <section className="ll-stage" id={key} key={key} style={style}>
      <header><span className="ll-stage-tag">{tag}</span><h2>{title}<small>{sub}</small></h2><span className="ll-stage-progress"><i><em style={{ width: `${(finished(list) / Math.max(1, list.length)) * 100}%` }}/></i>{finished(list)}/{list.length} xong</span></header>
      <div className="ll-grid">{shown.map(card)}</div>
    </section>;

  return <div className="ll-page ll-roadmap spk-lab">
    <header className="ll-hero spk-hero">
      <div className="ll-hero-copy">
        <h1>Luyện Speaking theo kỹ năng, <em>từng lượt nói một.</em></h1>
        <div className="ll-hero-actions">
          {next && <Link className="ll-cta" href={`${SPEAKING_BASE}/${next.id}`}>
            <span className="ll-cta-icon"><Play size={18} fill="currentColor"/></span>
            <span><b>{started(next) ? "Học tiếp" : "Bắt đầu"}</b><small>{unitLabel(next, catalog)} · {next.title_vi}</small></span>
            <ArrowRight size={18}/>
          </Link>}
          <span className="ll-draft-pill" title="Nội dung luyện tập do đội ngũ biên soạn, chưa được giáo viên duyệt toàn bộ">Thử nghiệm</span>
        </div>
      </div>
      <div className="ll-stats">
        <div className="ll-stats-ring"><Ring value={done} total={units.length}/><div><strong>Bài đã hoàn thành</strong><span>Còn {units.length - done} bài</span></div></div>
        <dl><div><dt>Lượt đã xong</dt><dd>{turns}/{allTurns}</dd></div><div><dt>Kỹ năng</dt><dd>{catalog.skills.length}</dd></div><div><dt>Bài học</dt><dd>{units.length}</dd></div></dl>
      </div>
    </header>

    {!data.ready && <p className="ll-error" role="status">Nội dung câu hỏi đang được cập nhật. Bạn vẫn xem được lộ trình; bài học sẽ mở khi dữ liệu sẵn sàng.</p>}

    <div className="spk-tabs" role="tablist" aria-label="Speaking Lab">
      <button type="button" role="tab" aria-selected={tab === "skills"} onClick={() => show("skills")}><b>16 kỹ năng</b><small>Theo 4 tiêu chí chấm</small></button>
      <button type="button" role="tab" aria-selected={tab === "topics"} onClick={() => show("topics")}><b>Chủ đề Part 1–2</b><small>{topicUnits.length} bài, mỗi bài 6 lượt</small></button>
      <button type="button" role="tab" aria-selected={tab === "advanced"} onClick={() => show("advanced")}><b>Nâng cao Part 3</b><small>{part3Units.length} bài thảo luận</small></button>
      <button type="button" role="tab" aria-selected={tab === "pron"} onClick={() => show("pron")}><b>Phát âm</b><small>{catalog.modules.length} nhóm, {pronUnits.length} bài</small></button>
    </div>

    {tab === "skills" && <>
      <section className="ll-journey spk-journey" aria-labelledby="spk-journey-title">
        <div className="ll-section-head"><div><span className="ll-kicker">Bản đồ kỹ năng</span><h2 id="spk-journey-title">4 tiêu chí, 16 kỹ năng</h2></div><small>Mỗi kỹ năng: học → nói lần đầu → xem cách sửa → nói câu mới.</small></div>
        <ol className="ll-track-map">{criterionOrder.map((criterion) => {
          const group = skillUnits.filter((unit) => unit.criterion === criterion);
          const count = finished(group);
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
      {criterionOrder.map((criterion) => stage(`tieu-chi-${criterion}`, tone(criterion), criterion, criterionInfo[criterion].name, criterionInfo[criterion].en, skillUnits.filter((unit) => unit.criterion === criterion)))}
    </>}

    {tab === "topics" && <>
      <div className="ll-typebar" role="group" aria-label="Lọc theo phần thi">
        <span><Mic size={16}/> Phần thi</span>
        {([0, 1, 2] as const).map((value) => <button type="button" key={value} aria-pressed={part === value} onClick={() => setPart(value)}>
          {value ? partLabel(value) : "Tất cả"}<small>{value ? topicUnits.filter((unit) => unit.part === value).length : topicUnits.length}</small>
        </button>)}
      </div>
      {stage("chu-de", topicTone, "Chủ đề", "Bài theo chủ đề", "Mỗi bài 6 lượt nói, từ trả lời đầu tiên đến tình huống mới", topicUnits, topicUnits.filter((unit) => !part || unit.part === part))}
    </>}

    {tab === "advanced" && <>
      <div className="ll-typebar" role="group" aria-label="Lọc theo chuỗi bài">
        <span><Target size={16}/> Chuỗi bài</span>
        <button type="button" aria-pressed={!series} onClick={() => setSeries("")}>Tất cả<small>{part3Units.length}</small></button>
        {catalog.series.map((item) => <button type="button" key={item.id} aria-pressed={series === item.id} onClick={() => setSeries(item.id)}>{item.title_vi}<small>{part3Units.filter((unit) => unit.series === item.id).length}</small></button>)}
      </div>
      {catalog.series.filter((item) => !series || series === item.id).map((item) =>
        stage(`chuoi-${item.id}`, seriesTone[item.id] ?? topicTone, `Chuỗi ${catalog.series.indexOf(item) + 1}`, item.title_vi, item.about_vi, part3Units.filter((unit) => unit.series === item.id)))}
    </>}

    {tab === "pron" && catalog.modules.map((module, index) =>
      stage(`am-${module.code}`, pronTone, `Nhóm ${index + 1}`, module.title_vi, `${module.title_en} · ${module.contrast}`, pronUnits.filter((unit) => unit.module === module.code)))}

    <aside className="ll-note"><Sparkles size={16}/><p>{catalog.source.note_vi} Bản ghi âm chỉ lưu trên trình duyệt này, trừ khi bạn tự gửi một bài Part 2 để nhận phân tích; tài khoản lưu tiến độ, ghi chú và phần tự kiểm tra.</p></aside>
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
    <div className="ll-card-types"><span>{partLabel(unit.part)}</span>{unit.kind === "pron" && unit.level && <span>{unit.level}</span>}{skillNames.map((name) => <span key={name}>{name}</span>)}</div>
    <div className="ll-card-foot">
      <span className="ll-pips" aria-label={`${count}/${unit.tasks.length} lượt nói`}>{unit.tasks.map((task) => <i key={task.id} className={`spk-pip ${state?.done[task.id] ? "is-pass" : ""}`}/>)}</span>
      <small><Mic size={12}/> {unit.tasks.length} lượt</small>
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
const badgeLabel: Record<SpeakingUnit["kind"], string> = { skill: "Kỹ năng", topic: "Chủ đề", part3: "Part 3", pron: "Phát âm" };

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
  const checks = (release?.teach.self_check_vi?.length ? release.teach.self_check_vi
    : release?.card?.self_review_vi?.length ? release.card.self_review_vi
      : release?.coaching?.self_review_vi?.length ? release.coaching.self_review_vi
        : release?.teach.repair?.self_check_vi?.length ? release.teach.repair.self_check_vi
          : fallbackChecks).map(sentence);
  const seriesInfo = catalog.series.find((item) => item.id === unit.series);
  const kicker = unit.kind === "skill" && unit.criterion ? criterionInfo[unit.criterion].name
    : unit.kind === "topic" ? "Bài theo chủ đề"
      : unit.kind === "part3" ? `${seriesInfo?.title_vi ?? "Part 3"}${unit.level ? ` · ${unit.level}` : ""}`
        : `Phát âm · ${unit.level}`;
  const expectsModel = unit.kind === "topic" || unit.kind === "part3";

  return <div className="ll-page ll-module spk-lab" style={unitTone(unit, catalog)}>
    <Breadcrumb current={`${unitLabel(unit, catalog)} · ${unit.title_vi}`} back={mapHref(unit)}/>
    <header className="ll-module-hero">
      <div className="ll-module-badge"><small>{badgeLabel[unit.kind]}</small><b>{unitNumber(unit)}</b></div>
      <div className="ll-module-copy">
        <span className="ll-kicker">{kicker} · {partLabel(unit.part)}</span>
        <h1>{unit.title_vi}</h1>
        <p lang="en">{unit.title_en}{unit.topic_en ? ` · ${unit.topic_en}` : ""}</p>
        <div className="ll-chips">{skills.map((skill) => <span key={skill.id}>{skill.id} · {skill.title_vi}</span>)}</div>
      </div>
      <dl className="ll-facts"><div><dt>Lượt</dt><dd>{count}/{unit.tasks.length}</dd></div><div><dt>Phần thi</dt><dd>{unit.part}</dd></div></dl>
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

      {release.model ? <ModelPanel model={release.model}/>
        : expectsModel && release.current !== null && <p className="ll-empty">Phần tham khảo mở sau khi bạn xong cả {unit.tasks.length} lượt nói.</p>}

      {release.current === null && <div className="spk-finish"><Check size={18}/> Bạn đã xong bài này. <Link href={mapHref(unit)}>Về lộ trình</Link></div>}
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

function Breadcrumb({ current, back = SPEAKING_BASE }: { current: string; back?: string }) {
  return <nav className="ll-breadcrumb" aria-label="Vị trí"><Link href={back}>Speaking Lab</Link><span aria-hidden="true">›</span><span>{current}</span></nav>;
}
