"use client";
/*
 * Dictation you can do outside a lesson:
 *  - "Luyện nhanh": a short random set of Skill Lab sentences for one listening skill.
 *  - "Sổ câu sai": sentences not yet passed in Skill Lab, VOA and Quick, practised again until they pass.
 * Both use one sentence runner, so playback, checking and feedback look the same everywhere.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Info, Pause, Play, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { percentPassed } from "@/lib/dictation/pass";
import { correctPrefixWords, maskedAnswer, nextHintCount, wordCount } from "@/lib/dictation-skill-lab/hints";
import { listPracticeResults, savePracticeSnapshot } from "@/features/learning/practice-results";
import { TURN_PREFIX, TURN_SLUG } from "./skill-lab-dictation";
import { ClipProgress, PlaybackControls, useControlReplay, usePlaybackSettings } from "./dictation-playback";
import "./dictation-playback.css";
import "./voa-dictation.css";
import "./skill-lab-dictation.css";
import "./dictation-sessions.css";

type CheckResult = { passed: boolean; accuracy: number; reference: string; translation?: string; explanation?: string; missedFocus?: string[]; focus?: string[] };
export type SentenceItem = {
  key: string; title: string; source: "Skill Lab" | "VOA" | "Quick"; group?: string;
  audio: { src: string; startMs?: number; endMs?: number };
  check: (answer: string) => Promise<CheckResult>;
};

async function checkSkillLab(lessonId: string, turnId: string, answer: string): Promise<CheckResult> {
  const response = await fetch(`/api/dictation/skill-lab/${lessonId}/dictation`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turn_id: turnId, answer }),
  });
  const data = await response.json().catch(() => ({})) as { passed?: boolean; accuracy?: number; reference_text?: string; translation_vi?: string; explanation_vi?: string; missed_focus?: string[]; focus?: string[]; error?: string };
  if (!response.ok || typeof data.reference_text !== "string") throw new Error(data.error ?? "Không kiểm tra được câu này.");
  const passed = Boolean(answer.trim() && data.passed);
  void savePracticeSnapshot(TURN_SLUG(lessonId, turnId), { correct: passed ? 1 : 0, checked: 1, total: 1 }).catch(() => undefined);
  return { passed, accuracy: data.accuracy ?? 0, reference: data.reference_text, translation: data.translation_vi, explanation: data.explanation_vi, missedFocus: data.missed_focus, focus: data.focus };
}

export type RunnerResult = { key: string; group?: string; passed: boolean; accuracy: number };

export const skillLabItem = (lessonId: string, turnId: string, title: string, audioUrl: string, group?: string, startMs?: number, endMs?: number): SentenceItem => ({
  key: `skill:${lessonId}/${turnId}`, title, source: "Skill Lab", audio: { src: audioUrl, startMs, endMs }, group,
  check: (answer) => checkSkillLab(lessonId, turnId, answer),
});

/** Plays one sentence, takes the learner's answer and shows the same feedback in every bank. */
/**
 * `exam`: each sentence plays once, answers are not shown until the end, and `onComplete` receives
 * the results (placement and end-of-stage checks).
 */
export function SentenceRunner({ items, onFinish, finishLabel, exam = false, onComplete }: {
  items: SentenceItem[]; onFinish: () => void; finishLabel: string; exam?: boolean; onComplete?: (results: RunnerResult[]) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const boundaryFrame = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<Record<string, CheckResult & { skipped?: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const settings = usePlaybackSettings();
  const replaysLeft = useRef(0);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reveal, setReveal] = useState(false);
  const [revealedWords, setRevealedWords] = useState(0);
  const [checkedAnswer, setCheckedAnswer] = useState("");
  const [error, setError] = useState("");
  const [played, setPlayed] = useState<Record<string, boolean>>({});
  const reported = useRef(false);
  const item = items[index];
  const result = item ? results[item.key] : undefined;
  const done = index >= items.length;
  useControlReplay(() => play(), !exam && !done);
  useEffect(() => {
    if (done) return;
    const timer = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [index, done]);

  function play() {
    if (!audio.current || !item || (exam && played[item.key])) return;
    if (exam) setPlayed((current) => ({ ...current, [item.key]: true }));
    // An exam sentence plays once at normal speed; practice follows the learner's speed and auto-replay.
    cancelReplay();
    replaysLeft.current = exam ? 0 : settings.autoReplay;
    startClip();
  }
  function startClip() {
    const element = audio.current;
    if (!element || !item) return;
    if (!element.src.endsWith(item.audio.src)) element.src = item.audio.src;
    const go = () => { element.currentTime = (item.audio.startMs ?? 0) / 1000; element.playbackRate = exam ? 1 : settings.speed; void element.play().then(watchBoundary).catch(() => setError("Không phát được audio. Bấm phát lại.")); };
    if (element.readyState >= 1) go();
    else {
      element.addEventListener("loadedmetadata", go, { once: true });
      element.load();
    }
  }
  function cancelReplay() {
    replaysLeft.current = 0;
    if (replayTimer.current) clearTimeout(replayTimer.current);
    replayTimer.current = null;
  }
  function clipEnded() {
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    boundaryFrame.current = null;
    audio.current?.pause();
    setPlaying(false);
    if (replaysLeft.current > 0) { replaysLeft.current -= 1; replayTimer.current = setTimeout(startClip, settings.replayDelay * 1000); }
  }
  function watchBoundary() {
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    const tick = () => {
      const player = audio.current;
      if (!player || player.paused) return;
      if (item?.audio.endMs !== undefined && player.currentTime * 1000 >= item.audio.endMs - 15) { clipEnded(); return; }
      boundaryFrame.current = requestAnimationFrame(tick);
    };
    boundaryFrame.current = requestAnimationFrame(tick);
  }
  function onTime() {
    const element = audio.current;
    if (element && item?.audio.endMs !== undefined && !element.paused && element.currentTime * 1000 >= item.audio.endMs) clipEnded();
  }
  async function check(skip = false) {
    if (!item || busy || (!skip && !answer.trim() && exam)) return;
    setBusy(true); setError("");
    try {
      const checked = await item.check(skip ? "" : answer);
      setResults((current) => ({ ...current, [item.key]: { ...checked, passed: !skip && checked.passed, skipped: skip } }));
      setCheckedAnswer(answer);
      if (exam) { next(); return; }
      setReveal(skip || checked.passed);
      if (!skip && !checked.passed) setRevealedWords((count) => nextHintCount(checked.reference, answer, count));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không kiểm tra được câu này."); }
    finally { setBusy(false); }
  }
  function next() {
    cancelReplay();
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    boundaryFrame.current = null;
    audio.current?.pause();
    setIndex((value) => value + 1); setAnswer(""); setReveal(false); setRevealedWords(0); setCheckedAnswer(""); setError("");
    window.setTimeout(() => input.current?.focus(), 0);
  }
  useEffect(() => { if (item && !exam) window.setTimeout(play, 150); /* practice plays each new sentence once */ }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current); if (replayTimer.current) clearTimeout(replayTimer.current); }, []);
  useEffect(() => {
    if (!done || reported.current || !onComplete) return;
    reported.current = true;
    onComplete(items.map((entry) => ({ key: entry.key, group: entry.group, passed: Boolean(results[entry.key]?.passed), accuracy: results[entry.key]?.accuracy ?? 0 })));
  }, [done, items, results, onComplete]);

  if (done) {
    const list = items.map((entry) => ({ entry, result: results[entry.key] }));
    const passed = list.filter(({ result: value }) => value?.passed).length;
    return (
      <section className="dq-summary voa-surface" aria-live="polite">
        <span className="voa-eyebrow">KẾT QUẢ</span>
        <h2>{passed}/{items.length} câu đạt</h2>
        <p className="sld-muted">{exam ? "Đáp án từng câu ở dưới. " : ""}Câu chưa đạt được lưu vào Sổ câu sai để ôn lại sau.</p>
        <ol className="dq-summary-list">{list.map(({ entry, result: value }) => <li key={entry.key} className={value?.passed ? "passed" : "failed"}>
          {value?.passed ? <Check size={15} /> : <X size={15} />}<div><strong>{value?.reference ?? entry.title}</strong><small>{entry.source} · {entry.title}</small></div></li>)}</ol>
        <div className="dq-summary-actions">
          <Link className="button" href="/app/dictation">Về Dictation</Link>
          <button type="button" className="voa-primary-button" onClick={onFinish}>{finishLabel} <ArrowRight size={15} /></button>
        </div>
      </section>
    );
  }

  const verdict = !result ? "" : result.skipped ? "Đã bỏ qua câu này" : result.passed ? "Chính xác!"
    : `Chưa đúng · nghe lại, chép đủ từng từ (${Math.round(result.accuracy * 100)}%)`;
  return (
    <section className="dq-session voa-surface" aria-label={`Câu ${index + 1} trên ${items.length}`}>
      <div className="dq-session-head"><span className="voa-eyebrow">CÂU {index + 1}/{items.length} · {item.source}</span><small className="sld-muted">{item.title}</small></div>
      <div className="dq-dots" aria-hidden>{items.map((entry, position) => <span key={entry.key} className={position === index ? "current" : results[entry.key]?.passed ? "passed" : results[entry.key] ? "failed" : ""} />)}</div>
      <audio ref={audio} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current); boundaryFrame.current = null; }} onEnded={clipEnded} onTimeUpdate={onTime} />
      <div className="dq-player">
        <button type="button" className="dq-play" disabled={exam && played[item.key] && !playing} aria-label={playing ? "Tạm dừng" : "Nghe câu"} onClick={() => { if (playing) { if (!exam) { cancelReplay(); audio.current?.pause(); } } else play(); }}>{playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}</button>
        {exam ? <span className="sld-muted">{played[item.key] ? "Đã nghe (mỗi câu chỉ nghe một lần)" : "Bấm để nghe — mỗi câu chỉ nghe một lần"}</span> : <button type="button" onClick={play}><RotateCcw size={15} /> Nghe lại</button>}
        <PlaybackControls settings={settings} lockSpeed={exam} />
      </div>
      <ClipProgress audio={audio} startMs={item.audio.startMs} endMs={item.audio.endMs} />
      <textarea ref={input} className="sld-dictation-answer" rows={2} value={answer} autoFocus spellCheck={false} autoComplete="off" autoCapitalize="off" placeholder="Gõ câu bạn nghe được…"
        onChange={(event) => { setAnswer(event.target.value); if (result?.passed || result?.skipped) { setResults((current) => { const copy = { ...current }; delete copy[item.key]; return copy; }); setReveal(false); setRevealedWords(0); } }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.ctrlKey) { event.preventDefault(); if (!exam) play(); }
          else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (result && (result.passed || result.skipped)) next();
            else if (result && !exam && answer === checkedAnswer) { setRevealedWords((count) => nextHintCount(result.reference, answer, count)); play(); }
            else void check();
          }
        }} />
      {error && <p className="sld-error" role="alert">{error}</p>}
      {result && <div className={`sld-dictation-feedback ${result.passed ? "correct" : result.skipped ? "skipped" : "wrong"}`} role="status">
        <strong>{verdict}</strong>
        {reveal ? <>
          <p className="sld-reference">{result.reference}</p>
          {result.translation && <small>{result.translation}</small>}
          {result.explanation && <p className="sld-explanation"><Info size={14} /> {result.explanation}</p>}
        </> : <><p>{maskedAnswer(result.reference, Math.max(revealedWords, correctPrefixWords(result.reference, answer)))}</p>
          {Math.max(revealedWords, correctPrefixWords(result.reference, answer)) < wordCount(result.reference)
            ? <button type="button" onClick={() => { setRevealedWords((count) => nextHintCount(result.reference, answer, count)); play(); input.current?.focus(); }}>Gợi ý từ tiếp theo (Enter)</button>
            : <small>Đã gợi ý hết từ. Hãy chép lại cả câu cho đúng.</small>}</>}
      </div>}
      <div className="sld-dictation-actions"><div>
        {result && (result.passed || result.skipped) ? <button type="button" className="voa-primary-button" onClick={next}>{index + 1 < items.length ? "Câu tiếp" : "Xem kết quả"} <ArrowRight size={15} /></button>
          : <button type="button" className="voa-primary-button" disabled={busy || (exam && !answer.trim())} onClick={() => { if (result && !exam && answer === checkedAnswer) { setRevealedWords((count) => nextHintCount(result.reference, answer, count)); play(); } else void check(); }}><Check size={15} /> {busy ? "Đang kiểm tra…" : exam ? "Nộp câu này" : "Gợi ý / Kiểm tra"}</button>}
        {!(result && (result.passed || result.skipped)) && <button type="button" disabled={busy} onClick={() => void check(true)}>{exam ? "Không nghe được · Câu tiếp" : "Bỏ qua · Xem đáp án"}</button>}
        {result && !result.passed && !result.skipped && <button type="button" onClick={next}>Để sau <ArrowRight size={15} /></button>}
      </div><span className="sld-muted sld-shortcuts">{exam ? "Enter nộp câu này và sang câu tiếp" : "Enter: kiểm tra hoặc lộ thêm 1 từ; chép đúng rồi sang câu tiếp · Ctrl nghe lại"}</span></div>
    </section>
  );
}

type SkillSummary = { id: string; label: string; detail: string; sentences: number };

export function DictationQuickPractice() {
  const router = useRouter();
  const params = useSearchParams();
  const skill = params.get("skill") ?? "";
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [items, setItems] = useState<SentenceItem[] | null>(null);
  const [round, setRound] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/dictation/skill-lab/practice").then(async (response) => {
      const data = await response.json().catch(() => ({})) as { skills?: SkillSummary[]; error?: string };
      if (!alive) return;
      if (!response.ok || !data.skills) setError(data.error ?? "Không tải được danh sách kỹ năng.");
      else setSkills(data.skills);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!skill) return;
    let alive = true;
    void fetch(`/api/dictation/skill-lab/practice?skill=${encodeURIComponent(skill)}&n=10`).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { items?: { lesson_id: string; lesson_title: string; turn_id: string; audio_url: string; start_ms: number; end_ms: number }[]; error?: string };
      if (!alive) return;
      if (!response.ok || !data.items) { setError(data.error ?? "Không tải được bộ câu."); return; }
      setItems(data.items.map((entry) => skillLabItem(entry.lesson_id, entry.turn_id, entry.lesson_title, entry.audio_url, undefined, entry.start_ms, entry.end_ms)));
    });
    return () => { alive = false; };
  }, [skill, round]);

  const current = skills?.find((item) => item.id === skill);
  return (
    <div className="voa-lab sld-lab dq-page dq-practice-page">
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span>{skill ? <><Link href="/app/dictation/practice">Luyện nhanh</Link><span>›</span><span>{current?.label ?? "Bộ câu"}</span></> : <span>Luyện nhanh</span>}</nav>
      <header className="voa-bank-hero"><div><span className="voa-eyebrow">LUYỆN NHANH · 5 PHÚT</span><h1>{current ? current.label : "Luyện riêng một kỹ năng nghe"}</h1>
        <p>{current ? `${current.detail}. 10 câu ngẫu nhiên từ các bài IELTS Skill Lab.` : "Chọn một kỹ năng. Mỗi bộ có 10 câu ngẫu nhiên, nghe và chép từng câu, không cần đi theo bài."}</p></div></header>
      {error && <p className="sld-error" role="alert">{error}</p>}
      {!skill ? (
        <div className="dq-skill-grid">
          {skills === null ? <p className="sld-muted">Đang tải…</p> : skills.map((item) => (
            <button type="button" key={item.id} className="dq-skill-card voa-surface" disabled={item.sentences < 5} onClick={() => router.push(`/app/dictation/practice?skill=${item.id}`)}>
              <strong>{item.label}</strong><span>{item.detail}</span><small>{item.sentences} câu có audio</small><ArrowRight size={17} aria-hidden />
            </button>
          ))}
        </div>
      ) : items === null ? <p className="sld-muted">Đang chọn câu…</p> : (
        <SentenceRunner key={round} items={items} finishLabel="Làm bộ 10 câu khác" onFinish={() => { setItems(null); setRound((value) => value + 1); }} />
      )}
      {skill && <p className="dq-back"><Link href="/app/dictation/practice"><ArrowLeft size={14} /> Chọn kỹ năng khác</Link></p>}
    </div>
  );
}

type Mistake = { item: SentenceItem; at: string };

/** Sentences whose latest attempt did not pass, newest first. VOA and Quick need a signed-in account. */
async function loadMistakes(): Promise<Mistake[]> {
  const found: Mistake[] = [];
  const lessonTitles = new Map<string, string>();
  const turnRows = await listPracticeResults(TURN_PREFIX);
  const catalog = await fetch("/api/dictation/skill-lab").then((response) => response.ok ? response.json() : { lessons: [] }).catch(() => ({ lessons: [] })) as { lessons?: { lesson_id: string; title: string }[] };
  for (const lesson of catalog.lessons ?? []) lessonTitles.set(lesson.lesson_id, lesson.title);
  const lessonIds = [...new Set(Object.keys(turnRows).map((slug) => slug.slice(TURN_PREFIX.length).split("/")[0]).filter(Boolean))];
  const playable = new Map<string, { audio_url: string | null; start_ms: number; end_ms: number | null }>();
  for (let start = 0; start < lessonIds.length; start += 12) {
    await Promise.all(lessonIds.slice(start, start + 12).map(async (id) => {
      const data = await fetch(`/api/dictation/skill-lab/${encodeURIComponent(id)}`).then((response) => response.ok ? response.json() : null).catch(() => null) as { lesson?: { turns?: { turn_id: string; audio_url: string | null; start_ms: number; end_ms: number | null }[] } } | null;
      for (const turn of data?.lesson?.turns ?? []) playable.set(`${id}/${turn.turn_id}`, turn);
    }));
  }
  for (const [slug, row] of Object.entries(turnRows)) {
    if (row.correct) continue;
    const [lessonId, turnId] = slug.slice(TURN_PREFIX.length).split("/");
    if (!lessonId || !turnId) continue;
    const turn = playable.get(`${lessonId}/${turnId}`);
    if (!turn?.audio_url) continue;
    found.push({ at: row.updatedAt ?? "", item: skillLabItem(lessonId, turnId, `${lessonTitles.get(lessonId) ?? lessonId} · ${turnId}`, turn.audio_url, undefined, turn.start_ms, turn.end_ms ?? undefined) });
  }
  if (demoMode) return found;
  const db = createClient();

  const voa = await db.from("voa_dictation_attempts").select("segment_id,accuracy,created_at").order("created_at", { ascending: false }).limit(2000);
  const latestVoa = new Map<string, { accuracy: number; created_at: string }>();
  for (const row of voa.data ?? []) if (!latestVoa.has(row.segment_id)) latestVoa.set(row.segment_id, { accuracy: Number(row.accuracy), created_at: row.created_at });
  const segmentIds = [...latestVoa.keys()];
  for (let start = 0; start < segmentIds.length; start += 100) {
    const { data: segments } = await db.from("voa_dictation_segments").select("id,lesson_id,ordinal,start_ms,end_ms,reference_text").in("id", segmentIds.slice(start, start + 100));
    const lessonIds = [...new Set((segments ?? []).map((segment) => segment.lesson_id))];
    const { data: lessons } = lessonIds.length ? await db.from("voa_dictation_lessons").select("id,title").in("id", lessonIds) : { data: [] };
    const titles = new Map((lessons ?? []).map((lesson) => [lesson.id as string, lesson.title as string]));
    for (const segment of segments ?? []) {
      const latest = latestVoa.get(segment.id)!;
      if (percentPassed(segment.reference_text, latest.accuracy)) continue;
      found.push({ at: latest.created_at, item: {
        key: `voa:${segment.id}`, title: `${titles.get(segment.lesson_id) ?? "VOA"} · câu ${segment.ordinal}`, source: "VOA",
        audio: { src: `/api/voa/audio/${segment.lesson_id}`, startMs: segment.start_ms, endMs: segment.end_ms },
        check: async (answer) => {
          if (!answer.trim()) return { passed: false, accuracy: 0, reference: segment.reference_text };
          const { data: id, error } = await db.rpc("submit_voa_dictation", { p_segment_id: segment.id, p_answer: answer.trim(), p_mode: "type" });
          if (error) throw new Error(error.message);
          const saved = await db.from("voa_dictation_attempts").select("accuracy").eq("id", id).single();
          const accuracy = Number(saved.data?.accuracy ?? 0);
          return { passed: percentPassed(segment.reference_text, accuracy), accuracy: accuracy / 100, reference: segment.reference_text };
        },
      } });
    }
  }

  const clips = await db.from("dictation_clip_attempts").select("clip_id,accuracy,is_skipped,created_at").order("created_at", { ascending: false }).limit(2000);
  const latestClip = new Map<string, { accuracy: number; skipped: boolean; created_at: string }>();
  for (const row of clips.data ?? []) if (!latestClip.has(row.clip_id)) latestClip.set(row.clip_id, { accuracy: Number(row.accuracy), skipped: Boolean(row.is_skipped), created_at: row.created_at });
  // The clip transcript stays on the server until an attempt, so the 80% line decides which clips to bring back.
  const weakClips = [...latestClip.entries()].filter(([, value]) => value.skipped || value.accuracy < 80);
  for (const [clipId, value] of weakClips) {
    found.push({ at: value.created_at, item: {
      key: `clip:${clipId}`, title: "Quick Dictation", source: "Quick", audio: { src: `/api/dictation/clip/${clipId}` },
      check: async (answer) => {
        const { data, error } = answer.trim()
          ? await db.rpc("submit_dictation_clip", { p_clip_id: clipId, p_answer: answer.trim() })
          : await db.rpc("skip_dictation_clip", { p_clip_id: clipId });
        if (error) throw new Error(error.message);
        if (!answer.trim()) return { passed: false, accuracy: 0, reference: String(data) };
        const checked = data as { accuracy: number; reference_text: string };
        return { passed: percentPassed(checked.reference_text, Number(checked.accuracy)), accuracy: Number(checked.accuracy) / 100, reference: checked.reference_text };
      },
    } });
  }
  return found.sort((a, b) => b.at.localeCompare(a.at));
}

export function DictationReview() {
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null);
  const [session, setSession] = useState<SentenceItem[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    loadMistakes().then((found) => { if (alive) setMistakes(found); }).catch((failure: unknown) => { if (alive) { setError(failure instanceof Error ? failure.message : "Không tải được Sổ câu sai."); setMistakes([]); } });
    return () => { alive = false; };
  }, [reload]);

  const counts = useMemo(() => ({
    "Skill Lab": mistakes?.filter((entry) => entry.item.source === "Skill Lab").length ?? 0,
    VOA: mistakes?.filter((entry) => entry.item.source === "VOA").length ?? 0,
    Quick: mistakes?.filter((entry) => entry.item.source === "Quick").length ?? 0,
  }), [mistakes]);

  return (
    <div className="voa-lab sld-lab dq-page">
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><span>Sổ câu sai</span></nav>
      <header className="voa-bank-hero"><div><span className="voa-eyebrow">ÔN TẬP</span><h1>Sổ câu sai</h1>
        <p>Các câu bạn chưa đạt ở IELTS Skill Lab, VOA và Quick Dictation. Chép lại cho đến khi đạt thì câu tự rời khỏi sổ.</p></div>
        {mistakes && mistakes.length > 0 && !session && <button type="button" className="voa-primary-button" onClick={() => setSession(mistakes.slice(0, 10).map((entry) => entry.item))}>Ôn {Math.min(10, mistakes.length)} câu <ArrowRight size={17} /></button>}
      </header>
      {error && <p className="sld-error" role="alert">{error}</p>}
      {session ? <SentenceRunner items={session} finishLabel="Cập nhật Sổ câu sai" onFinish={() => { setSession(null); setMistakes(null); setReload((value) => value + 1); }} />
        : mistakes === null ? <p className="sld-muted">Đang gom các câu cần ôn…</p>
          : !mistakes.length ? <section className="voa-surface sld-empty"><h2>Chưa có câu nào cần ôn</h2><p>Câu nào chưa đạt khi bạn nghe chép sẽ xuất hiện ở đây.</p><Link className="voa-primary-button" href="/app/dictation/practice">Luyện nhanh 5 phút</Link></section>
            : <>
              <div className="dq-review-counts">{(Object.entries(counts) as [string, number][]).map(([source, count]) => <span key={source}><strong>{count}</strong> {source}</span>)}</div>
              <ol className="dq-review-list">{mistakes.slice(0, 60).map((entry) => <li key={entry.item.key} className="voa-surface"><span className="dq-source">{entry.item.source}</span><span>{entry.item.title}</span>
                <button type="button" onClick={() => setSession([entry.item])}>Ôn câu này</button></li>)}</ol>
              {mistakes.length > 60 && <p className="sld-muted">Và {mistakes.length - 60} câu khác.</p>}
              {demoMode && <p className="sld-muted">Chế độ demo chỉ có câu của IELTS Skill Lab.</p>}
            </>}
    </div>
  );
}
