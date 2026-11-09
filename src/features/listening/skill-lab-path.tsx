"use client";
/*
 * IELTS Skill Lab path: placement check, the F1 → S4 stage map with an end-of-stage check for each
 * stage, and the weekly lesson goal (also shown on the Dashboard).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Flag, Lock, Sparkles, Target } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { listPracticeResults, savePracticeResult, savePracticeSnapshot, type PracticeResult } from "@/features/learning/practice-results";
import type { CatalogEntry } from "@/lib/dictation-skill-lab/lessons";
import { skillLabStages, skillLabStageOf, skillLabStageUrl } from "@/lib/dictation-skill-lab/stages";
import { DEFAULT_WEEKLY_GOAL, recommendStage, STAGE_TEST_PASS, stageIndex, UNLOCK_SHARE, weekStart, weeklyGoalChoices, type StageId } from "@/lib/dictation-skill-lab/path";
import { loadResults, type LessonProgress } from "./skill-lab-dictation";
import { SentenceRunner, skillLabItem, type RunnerResult, type SentenceItem } from "./dictation-sessions";
import { fetchSkillLabCatalog } from "./skill-lab-catalog";
import "./voa-dictation.css";
import "./skill-lab-dictation.css";
import "./dictation-sessions.css";

const BASE = "/app/dictation/banks/skill-lab";
const PLACEMENT = "skill-lab-placement:";
const STAGE_TEST = "skill-lab-stagetest:";
const GOAL = "skill-lab-goal:weekly";

type Saved = PracticeResult & { updatedAt?: string };
type PathData = {
  lessons: CatalogEntry[]; progress: Record<string, LessonProgress>;
  placement: { stage: StageId; at?: string } | null; tests: Record<string, Saved>; goal: number;
};

const lessonDone = (lesson: CatalogEntry, progress: Record<string, LessonProgress>) => (progress[lesson.lesson_id]?.dictation?.correct ?? 0) >= lesson.turns;

async function loadPath(): Promise<PathData> {
  // The catalog and the learner's results load together; the catalog is shared with the other Dictation pages.
  const [lessons, progress, placements, tests, goals] = await Promise.all([fetchSkillLabCatalog(), loadResults(), listPracticeResults(PLACEMENT), listPracticeResults(STAGE_TEST), listPracticeResults(GOAL)]);
  const latest = Object.entries(placements).sort(([, a], [, b]) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  return {
    lessons, progress,
    placement: latest ? { stage: latest[0].slice(PLACEMENT.length) as StageId, at: latest[1].updatedAt } : null,
    tests: Object.fromEntries(Object.entries(tests).map(([slug, value]) => [slug.slice(STAGE_TEST.length), value])),
    goal: goals[GOAL]?.total || DEFAULT_WEEKLY_GOAL,
  };
}

/** Lessons finished (every sentence passed) since Monday. */
function lessonsThisWeek(progress: Record<string, LessonProgress>, lessons: CatalogEntry[]) {
  const since = weekStart().toISOString();
  return lessons.filter((lesson) => lessonDone(lesson, progress) && (progress[lesson.lesson_id]?.dictation?.updatedAt ?? "") >= since).length;
}

function WeeklyGoal({ done, goal, onGoal }: { done: number; goal: number; onGoal?: (goal: number) => void }) {
  return (
    <div className="slp-goal">
      <Target size={18} aria-hidden />
      <div><strong>Tuần này: {done}/{goal} bài</strong><span className="sld-meter-inline" aria-hidden><span style={{ width: `${Math.min(100, Math.round(100 * done / goal))}%` }} /></span>
        <small className="sld-muted">{done >= goal ? "Đạt mục tiêu tuần, giỏi lắm!" : `Còn ${goal - done} bài để đạt mục tiêu. Bài tính khi mọi câu đều đạt.`}</small></div>
      {onGoal && <label className="slp-goal-select">Mục tiêu<select value={goal} onChange={(event) => onGoal(Number(event.target.value))}>{weeklyGoalChoices.map((value) => <option key={value} value={value}>{value} bài/tuần</option>)}</select></label>}
    </div>
  );
}

export function SkillLabPath() {
  const router = useRouter();
  const [data, setData] = useState<PathData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    loadPath().then((found) => { if (alive) setData(found); }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : "Không tải được lộ trình."); });
    return () => { alive = false; };
  }, []);

  const stages = useMemo(() => {
    if (!data) return [];
    const recommended = data.placement ? stageIndex(data.placement.stage) : 0;
    let previousOpen = true;
    return skillLabStages.map((stage, index) => {
      const ready = data.lessons.filter((lesson) => lesson.audio_ready && skillLabStageOf(lesson) === stage.id);
      const done = ready.filter((lesson) => lessonDone(lesson, data.progress));
      const started = ready.some((lesson) => data.progress[lesson.lesson_id]?.dictation?.checked || data.progress[lesson.lesson_id]?.questions?.checked);
      const test = data.tests[stage.id];
      const testPassed = Boolean(test && test.correct / Math.max(1, test.total) >= STAGE_TEST_PASS);
      const share = ready.length ? done.length / ready.length : 0;
      // A later stage is suggested once the previous one is 70% done or its check passed; it is never hard-locked.
      const open = index <= recommended || previousOpen || started;
      previousOpen = share >= UNLOCK_SHARE || testPassed;
      const next = ready.find((lesson) => !lessonDone(lesson, data.progress));
      return { stage, ready, done, started, test, testPassed, share, open, next, recommended: index === recommended && Boolean(data.placement) };
    });
  }, [data]);

  const saveGoal = useCallback((goal: number) => {
    setData((current) => current ? { ...current, goal } : current);
    void savePracticeSnapshot(GOAL, { correct: 0, checked: 0, total: goal }).catch(() => undefined);
  }, []);

  const current = stages.find((item) => item.open && item.next && !item.testPassed) ?? stages.find((item) => item.next);
  return (
    <div className="voa-lab sld-lab slp-page">
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><span>Lộ trình IELTS</span></nav>
      <header className="voa-bank-hero">
        <div><span className="voa-eyebrow">IELTS SKILL LAB</span><h1>Lộ trình nghe chép IELTS</h1>
          <p>Bảy chặng từ âm dễ nhầm đến bài giảng Section 4. Mỗi chặng có bài học, và một bài kiểm tra cuối chặng để biết bạn đã sẵn sàng sang chặng sau.</p></div>
        {current?.next && <button type="button" className="voa-primary-button" onClick={() => router.push(`${BASE}/${current.next!.lesson_id}`)}>Học tiếp: {current.stage.label} <ArrowRight size={17} /></button>}
      </header>
      {error && <p className="sld-error" role="alert">{error}</p>}
      {!data ? !error && <p className="sld-muted">Đang tải lộ trình…</p> : <>
        <div className="slp-top">
          <section className="slp-placement voa-surface">
            <Sparkles size={20} aria-hidden />
            {data.placement ? <div><strong>Gợi ý bắt đầu: {skillLabStages[stageIndex(data.placement.stage)].label}</strong><span className="sld-muted">Theo bài xếp lớp{data.placement.at ? ` ngày ${new Date(data.placement.at).toLocaleDateString("vi-VN")}` : ""}. Bạn vẫn có thể học bất kỳ chặng nào.</span></div>
              : <div><strong>Chưa biết bắt đầu từ đâu?</strong><span className="sld-muted">Làm bài xếp lớp 10 câu (khoảng 6 phút), hệ thống gợi ý chặng phù hợp.</span></div>}
            <Link className={data.placement ? "voa-continue-button" : "voa-primary-button"} href={`${BASE}/placement`}>{data.placement ? "Làm lại bài xếp lớp" : "Làm bài xếp lớp"}</Link>
          </section>
          <section className="voa-surface slp-goal-card"><WeeklyGoal done={lessonsThisWeek(data.progress, data.lessons)} goal={data.goal} onGoal={saveGoal} /></section>
        </div>
        <ol className="slp-map">
          {stages.map((item) => (
            <li key={item.stage.id} className={`slp-stage${item.testPassed ? " passed" : item.started ? " active" : ""}${item.open ? "" : " later"}${item.recommended ? " recommended" : ""}`}>
              <span className="slp-node" aria-hidden>{item.testPassed ? <Check size={18} /> : item.open ? item.stage.id : <Lock size={15} />}</span>
              <div className="slp-card voa-surface">
                <div className="slp-card-head">
                  <div><strong>{item.stage.label}</strong><span>{item.stage.detail}</span></div>
                  <span className={`slp-chip${item.testPassed ? " ok" : ""}`}>{item.testPassed ? "Đã vượt chặng" : item.recommended ? "Gợi ý bắt đầu" : !item.ready.length ? "Đang tạo audio" : item.started ? "Đang học" : item.open ? "Sẵn sàng" : "Nên học sau"}</span>
                </div>
                {item.ready.length > 0 && <>
                  <div className="slp-meter-row"><span className="sld-meter-inline" aria-hidden><span style={{ width: `${Math.round(item.share * 100)}%` }} /></span><small>{item.done.length}/{item.ready.length} bài xong</small></div>
                  {!item.open && <p className="slp-hint"><Lock size={13} /> Nên xong {Math.round(UNLOCK_SHARE * 100)}% chặng trước hoặc vượt bài kiểm tra của chặng trước. Bạn vẫn có thể mở xem.</p>}
                  {item.test && <p className="slp-test-score"><Flag size={13} /> Kiểm tra cuối chặng: {item.test.correct}/{item.test.total} câu đạt{item.testPassed ? "" : ` · cần ${Math.ceil(STAGE_TEST_PASS * item.test.total)} câu`}</p>}
                  <div className="slp-actions">
                    {item.next && <button type="button" className={item.open ? "voa-primary-button" : ""} onClick={() => router.push(`${BASE}/${item.next!.lesson_id}`)}>Bài tiếp theo <ArrowRight size={15} /></button>}
                    <Link href={skillLabStageUrl(item.stage.id)}>Xem {item.ready.length} bài</Link>
                    <Link href={`${skillLabStageUrl(item.stage.id)}/test`}><Flag size={14} /> Kiểm tra cuối chặng</Link>
                  </div>
                </>}
              </div>
            </li>
          ))}
        </ol>
      </>}
    </div>
  );
}

/** Placement (`stage` empty) or end-of-stage check: 10 sentences, each heard once. */
export function SkillLabCheck({ stage }: { stage?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<SentenceItem[] | null>(null);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ title: string; text: string; href: string; action: string } | null>(null);
  const [round, setRound] = useState(0);
  const stageInfo = skillLabStages.find((item) => item.id === stage);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/dictation/skill-lab/check?${stage ? `kind=stage&stage=${stage}` : "kind=placement"}`).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { items?: { stage: string; lesson_id: string; lesson_title: string; turn_id: string; audio_url: string; start_ms: number; end_ms: number }[]; error?: string };
      if (!alive) return;
      if (!response.ok || !data.items) { setError(data.error ?? "Không tải được bài kiểm tra."); return; }
      if (data.items.length < 5) { setError("Chặng này chưa đủ câu có audio để làm bài kiểm tra."); return; }
      setItems(data.items.map((entry) => skillLabItem(entry.lesson_id, entry.turn_id, entry.lesson_title, entry.audio_url, entry.stage, entry.start_ms, entry.end_ms)));
    });
    return () => { alive = false; };
  }, [stage, round]);

  const complete = useCallback((results: RunnerResult[]) => {
    const passed = results.filter((result) => result.passed).length;
    if (!stage) {
      const start = recommendStage(results.map((result) => ({ stage: result.group ?? "F1", accuracy: result.accuracy, passed: result.passed })));
      void savePracticeSnapshot(`${PLACEMENT}${start}`, { correct: passed, checked: results.length, total: results.length }).catch(() => undefined);
      const label = skillLabStages[stageIndex(start)].label;
      setOutcome({ title: `Gợi ý: bắt đầu ở ${label}`, text: `Bạn đạt ${passed}/${results.length} câu. ${start === "F1" ? "Bắt đầu từ chặng đầu để luyện chắc âm, số và cách đánh vần." : `Các chặng trước ${label} bạn có thể ôn nhanh hoặc bỏ qua.`}`, href: skillLabStageUrl(start), action: `Vào ${label}` });
      celebrate(undefined, { label: "Đã có lộ trình!" });
      return;
    }
    void savePracticeResult(`${STAGE_TEST}${stage}`, { correct: passed, checked: results.length, total: results.length }).catch(() => undefined);
    const ok = passed / results.length >= STAGE_TEST_PASS;
    const nextStage = skillLabStages[stageIndex(stage) + 1];
    if (ok) celebrate(undefined, { label: "Vượt chặng!" });
    setOutcome(ok
      ? { title: `Vượt chặng ${stageInfo?.label}!`, text: `Bạn đạt ${passed}/${results.length} câu.${nextStage ? ` Sẵn sàng cho ${nextStage.label}.` : " Bạn đã đi hết lộ trình."}`, href: nextStage ? skillLabStageUrl(nextStage.id) : BASE, action: nextStage ? `Sang ${nextStage.label}` : "Về lộ trình" }
      : { title: `Đạt ${passed}/${results.length} câu`, text: `Cần ${Math.ceil(STAGE_TEST_PASS * results.length)} câu để vượt chặng. Ôn các câu sai trong Sổ câu sai rồi thử lại.`, href: "/app/dictation/review", action: "Ôn câu sai" });
  }, [stage, stageInfo]);

  return (
    <div className="voa-lab sld-lab dq-page">
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><Link href={BASE}>Lộ trình IELTS</Link><span>›</span><span>{stageInfo ? `Kiểm tra ${stageInfo.label}` : "Bài xếp lớp"}</span></nav>
      <header className="voa-bank-hero"><div><span className="voa-eyebrow">{stageInfo ? "KIỂM TRA CUỐI CHẶNG" : "BÀI XẾP LỚP"}</span><h1>{stageInfo ? `Kiểm tra ${stageInfo.label}` : "Bạn nên bắt đầu từ đâu?"}</h1>
        <p>{stageInfo ? `10 câu ngẫu nhiên của chặng. Mỗi câu chỉ nghe một lần; đạt ${Math.round(STAGE_TEST_PASS * 100)}% để vượt chặng.` : "10 câu từ dễ đến khó, mỗi câu chỉ nghe một lần. Đáp án hiện ở cuối, kèm chặng gợi ý để bắt đầu."}</p></div></header>
      {error && <p className="sld-error" role="alert">{error}</p>}
      {outcome && <section className="slp-outcome voa-surface" aria-live="polite"><strong>{outcome.title}</strong><p>{outcome.text}</p>
        <div><button type="button" className="voa-primary-button" onClick={() => router.push(outcome.href)}>{outcome.action} <ArrowRight size={15} /></button><Link href={BASE}>Xem lộ trình</Link></div></section>}
      {items && <SentenceRunner key={round} items={items} exam onComplete={complete} finishLabel="Làm lại bài này" onFinish={() => { setOutcome(null); setItems(null); setRound((value) => value + 1); }} />}
      {!items && !error && <p className="sld-muted">Đang chọn câu…</p>}
    </div>
  );
}

/** Dashboard card: this week's Dictation lessons against the weekly goal. */
export function DictationWeekCard() {
  const [state, setState] = useState<{ done: number; goal: number; next?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    loadPath().then((data) => {
      if (!alive) return;
      const next = data.lessons.find((lesson) => lesson.audio_ready && !lessonDone(lesson, data.progress) && (!data.placement || stageIndex(skillLabStageOf(lesson)) >= stageIndex(data.placement.stage)));
      setState({ done: lessonsThisWeek(data.progress, data.lessons), goal: data.goal, next: next?.lesson_id });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!state) return null;
  return (
    <div className="card slp-dashboard-card">
      <div className="slp-dashboard-head"><strong>Dictation tuần này</strong><Link href={BASE}>Lộ trình <ArrowRight size={14} /></Link></div>
      <WeeklyGoal done={state.done} goal={state.goal} />
      <div className="slp-actions">{state.next && <Link className="voa-primary-button" href={`${BASE}/${state.next}`}>Học bài tiếp theo</Link>}<Link href="/app/dictation/practice">Luyện nhanh 5 phút</Link></div>
    </div>
  );
}
