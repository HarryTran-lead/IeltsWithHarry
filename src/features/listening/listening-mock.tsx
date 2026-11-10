"use client";
/*
 * IELTS Listening mock tests: list, exam room and review. The exam follows the paper test:
 * reading time before each part, each recording heard once, answers on screen, one submission.
 * Audio is one clip per turn played back to back; answers come from the server after submitting.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Headphones, Info, Pause, Play, Send, X } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { savePracticeResult } from "@/features/learning/practice-results";
import type { MockCatalogEntry, MockResult, PublicMock } from "@/lib/listening-mocks/mocks";
import "./voa-dictation.css";
import "./listening-mock.css";
import { LoadingBlock } from "@/components/layout/loading-block";

const BASE = "/app/listening/mock";
const draftKey = (id: string, part: number) => `listening-mock:v1:${id}${part ? `:part-${part}` : ""}`;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
type Transcript = { part_number: number; turns: { turn_id: string; speaker: string; text_en: string }[] }[];
type Outcome = { correct: number; total: number; results: MockResult[]; transcript: Transcript };
type Draft = { answers: Record<string, string>; outcome?: Outcome | null; startedAt?: number };

function readDraft(id: string, part = 0): Draft | null { try { return JSON.parse(window.localStorage.getItem(draftKey(id, part)) ?? "null") as Draft | null; } catch { return null; } }
function writeDraft(id: string, draft: Draft, part = 0) { try { window.localStorage.setItem(draftKey(id, part), JSON.stringify(draft)); } catch { /* optional */ } }

export function ListeningMock() {
  const id = usePathname().split("/")[4];
  const partValue = Number(useSearchParams().get("part"));
  const selectedPart = Number.isInteger(partValue) && partValue >= 1 && partValue <= 4 ? partValue : 0;
  return id ? <MockExam key={`${id}:${selectedPart}`} testId={decodeURIComponent(id)} selectedPart={selectedPart} /> : <MockList />;
}

function MockList() {
  const router = useRouter();
  const [tests, setTests] = useState<MockCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    void fetch("/api/listening/mocks").then(async (response) => {
      const data = await response.json().catch(() => ({})) as { tests?: MockCatalogEntry[]; error?: string };
      if (!alive) return;
      if (!response.ok || !data.tests) { setError(data.error ?? "Không tải được danh sách đề."); setTests([]); return; }
      setTests(data.tests);
      const scores: Record<string, number> = {};
      for (const test of data.tests) { const draft = readDraft(test.test_id); if (draft?.outcome) scores[test.test_id] = draft.outcome.correct; }
      setDone(scores);
    });
    return () => { alive = false; };
  }, []);
  const ready = (tests ?? []).filter((test) => test.audio_ready);
  const waiting = (tests ?? []).length - ready.length;
  return (
    <div className="voa-lab lm-page">
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><span>Đề Listening thi thử</span></nav>
      <header className="voa-bank-hero"><div><span className="voa-eyebrow">IELTS LISTENING · THI THỬ</span><h1>Đề Listening thi thử</h1>
        <p>Đề gốc 4 phần, 40 câu, theo cấu trúc IELTS Listening. Mỗi phần có thời gian đọc câu hỏi, audio chỉ nghe một lần, nộp bài để xem điểm, đáp án và transcript.</p></div></header>
      <p className="lm-draft"><Info size={15} /> Bản nháp: đề và audio (Gemini TTS) chưa được giáo viên duyệt. Điểm là số câu đúng trên 40, không quy đổi Band IELTS chính thức.</p>
      {error && <p className="sld-error" role="alert">{error}</p>}
      {tests === null ? <p className="lm-muted"><LoadingBlock label="Đang tải…" /></p> : <>
        <div className="lm-grid">
          {ready.map((test) => (
            <button type="button" key={test.test_id} className="lm-card voa-surface" onClick={() => router.push(`${BASE}/${test.test_id}`)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static cover from the package */}
              <img src={test.cover_url} alt="" loading="lazy" />
              <span className="lm-card-body">
                <strong>{test.title}</strong>
                <span>{test.part_titles.map((title, index) => `Part ${index + 1}: ${title}`).join(" · ")}</span>
                <span className="lm-card-foot"><span><Clock3 size={14} /> {clock(test.duration_ms)} audio · 40 câu</span><span>{done[test.test_id] !== undefined ? `Đã làm: ${done[test.test_id]}/40` : "Chưa làm"} <ArrowRight size={15} /></span></span>
              </span>
            </button>
          ))}
        </div>
        {!ready.length && <section className="voa-surface lm-empty"><h2>Đề đầu tiên đang được thu âm</h2><p>Audio cho đề thi thử đang được tạo. Quay lại sau ít phút.</p></section>}
        {waiting > 0 && <p className="lm-muted">{waiting} đề {ready.length ? "khác " : ""}đang chờ thu âm và sẽ mở khi có đủ audio.</p>}
      </>}
    </div>
  );
}

type Phase = { kind: "intro" } | { kind: "reading"; part: number; left: number } | { kind: "playing"; part: number } | { kind: "review" } | { kind: "done" };

function MockExam({ testId, selectedPart }: { testId: string; selectedPart: number }) {
  const router = useRouter();
  const audio = useRef<HTMLAudioElement>(null);
  const queue = useRef<{ part: number; turn: number } | null>(null);
  const [test, setTest] = useState<PublicMock | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [viewPart, setViewPart] = useState(selectedPart || 1);
  const [reviewPlaying, setReviewPlaying] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/listening/mocks/${encodeURIComponent(testId)}`).then(async (response) => {
      const data = await response.json().catch(() => ({})) as { test?: PublicMock; error?: string };
      if (!alive) return;
      if (!response.ok || !data.test) { setError(data.error ?? "Không tải được đề."); return; }
      setTest(data.test);
      const draft = readDraft(testId, selectedPart);
      if (draft) { setAnswers(draft.answers ?? {}); if (draft.outcome) { setOutcome(draft.outcome); setPhase({ kind: "done" }); } }
      setRestored(true);
    });
    return () => { alive = false; };
  }, [testId, selectedPart]);
  useEffect(() => { if (restored) writeDraft(testId, { answers, outcome, startedAt: startedAt ?? undefined }, selectedPart); }, [restored, testId, selectedPart, answers, outcome, startedAt]);
  useEffect(() => {
    if (startedAt === null || phase.kind === "done") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, phase.kind]);
  useEffect(() => () => audio.current?.pause(), []);

  const readingSeconds = (partNumber: number) => {
    const part = test?.parts.find((item) => item.part_number === partNumber);
    return Math.max(20, Math.min(60, part?.groups.reduce((sum, group) => sum + group.pre_read_seconds, 0) ?? 30));
  };
  const questionCount = useMemo(() => test?.parts.filter((part) => !selectedPart || part.part_number === selectedPart)
    .reduce((sum, part) => sum + part.groups.reduce((total, group) => total + group.questions.length, 0), 0) ?? (selectedPart ? 10 : 40), [test, selectedPart]);
  const answered = Object.entries(answers).filter(([number, value]) => value.trim() && (!selectedPart || (Number(number) > (selectedPart - 1) * 10 && Number(number) <= selectedPart * 10))).length;

  function playTurn(partNumber: number, index: number) {
    const part = test?.parts.find((item) => item.part_number === partNumber);
    const turn = part?.turns[index];
    const element = audio.current;
    if (!part || !element) return;
    if (!turn?.audio_url) { finishPart(partNumber); return; }
    queue.current = { part: partNumber, turn: index };
    element.src = turn.audio_url; element.playbackRate = 1;
    void element.play().catch(() => setError("Trình duyệt chặn phát audio. Bấm vào trang rồi thử lại."));
  }
  function onEnded() {
    if (reviewPlaying) { setReviewPlaying(null); return; }
    const position = queue.current;
    if (!position) return;
    // A short natural gap between turns; no seeking or replay during the exam.
    window.setTimeout(() => playTurn(position.part, position.turn + 1), 350);
  }
  function finishPart(partNumber: number) {
    queue.current = null;
    const next = selectedPart ? undefined : test?.parts.find((item) => item.part_number === partNumber + 1);
    if (next) { setViewPart(next.part_number); setPhase({ kind: "reading", part: next.part_number, left: readingSeconds(next.part_number) }); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else setPhase({ kind: "review" });
  }
  function start() {
    const first = selectedPart || 1;
    setStartedAt(Date.now()); setViewPart(first); setError("");
    setPhase({ kind: "reading", part: first, left: readingSeconds(first) });
  }
  async function submit() {
    if (!test || busy) return;
    if (phase.kind !== "review" && phase.kind !== "done" && !window.confirm("Nộp bài ngay? Phần audio còn lại sẽ dừng.")) return;
    audio.current?.pause(); queue.current = null;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/listening/mocks/${test.test_id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers, ...(selectedPart ? { part: selectedPart } : {}) }) });
      const data = await response.json().catch(() => ({})) as Outcome & { error?: string };
      if (!response.ok || !data.results) throw new Error(data.error ?? "Không nộp được bài.");
      setOutcome(data); setPhase({ kind: "done" }); setViewPart(selectedPart || 1); window.scrollTo({ top: 0, behavior: "smooth" });
      void savePracticeResult(`listening-mock:${test.test_id}${selectedPart ? `:part-${selectedPart}` : ""}`, { correct: data.correct, checked: data.total, total: data.total }).catch(() => undefined);
      if (data.correct >= (selectedPart ? 8 : 30)) celebrate(undefined, { label: `${data.correct}/${data.total} câu đúng!` });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không nộp được bài."); }
    finally { setBusy(false); }
  }
  function retake() {
    if (!window.confirm("Làm lại từ đầu? Bài làm và kết quả hiện tại sẽ bị xoá.")) return;
    setAnswers({}); setOutcome(null); setStartedAt(null); setPhase({ kind: "intro" }); setViewPart(selectedPart || 1);
  }
  function playReview(url: string | null, key: string) {
    const element = audio.current;
    if (!element || !url) return;
    if (reviewPlaying === key) { element.pause(); setReviewPlaying(null); return; }
    queue.current = null; element.src = url; setReviewPlaying(key); void element.play().catch(() => setReviewPlaying(null));
  }

  // Reading time counts down, then the part starts (declared after playTurn, which it calls).
  useEffect(() => {
    if (phase.kind !== "reading") return;
    if (phase.left <= 0) { setPhase({ kind: "playing", part: phase.part }); playTurn(phase.part, 0); return; } // eslint-disable-line react-hooks/set-state-in-effect -- reading time ends by starting the part
    const timer = window.setTimeout(() => setPhase((current) => current.kind === "reading" ? { ...current, left: current.left - 1 } : current), 1000);
    return () => window.clearTimeout(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !test) return <div className="voa-lab lm-page"><nav className="voa-breadcrumb"><Link href={BASE}>Đề Listening thi thử</Link></nav><section className="voa-surface lm-empty"><h2>Chưa mở được đề</h2><p>{error}</p></section></div>;
  if (!test) return <div className="voa-lab lm-page"><p className="lm-muted"><LoadingBlock label="Đang tải đề…" /></p></div>;

  const results = new Map((outcome?.results ?? []).map((result) => [String(result.number), result]));
  const part = test.parts.find((item) => item.part_number === viewPart) ?? test.parts[0];
  const live = phase.kind === "reading" || phase.kind === "playing";
  const activePart = phase.kind === "reading" || phase.kind === "playing" ? phase.part : null;
  const partScore = (partNumber: number) => (outcome?.results ?? []).filter((result) => result.part_number === partNumber && result.correct).length;

  return (
    <div className="voa-lab lm-page">
      <audio ref={audio} preload="none" onEnded={onEnded} />
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href={BASE}>Đề Listening thi thử</Link><span>›</span><span>{test.title}{selectedPart ? ` · Section ${selectedPart}` : ""}</span></nav>
      <header className="lm-head">
        <div><span className="voa-eyebrow">IELTS LISTENING · THI THỬ</span><h1>{test.title}{selectedPart ? ` · Section ${selectedPart}` : ""}</h1></div>
        <div className="lm-status">
          {phase.kind === "reading" && <span className="lm-reading"><b>{phase.left}s</b> đọc câu hỏi Part {phase.part} <button type="button" onClick={() => setPhase({ ...phase, left: 0 })}>Nghe ngay</button></span>}
          {phase.kind === "playing" && <span className="lm-live"><Headphones size={15} /> Đang phát Part {phase.part}</span>}
          {phase.kind === "review" && <span className="lm-live"><Clock3 size={15} /> Đã hết audio · kiểm tra lại rồi nộp bài</span>}
          {startedAt !== null && phase.kind !== "done" && <span className="lm-clock">⏱ {clock(now - startedAt)}</span>}
          {outcome && <span className="lm-score"><strong>{outcome.correct}/{outcome.total}</strong> câu đúng</span>}
        </div>
      </header>

      {phase.kind === "intro" && <section className="voa-surface lm-intro">
        <h2>Trước khi bắt đầu</h2>
        <ul>
          <li>{selectedPart ? `Section ${selectedPart} có 10 câu hỏi.` : "Đề có 4 phần, 40 câu."} Trước mỗi phần có thời gian đọc câu hỏi.</li>
          <li>Mỗi đoạn audio chỉ phát <b>một lần</b>, không tua và không đổi tốc độ, giống phòng thi.</li>
          <li>{selectedPart ? "Bạn trả lời ngay trên màn hình trong Section đã chọn." : "Bạn trả lời ngay trên màn hình, chuyển qua lại giữa các phần bất cứ lúc nào."}</li>
          <li>Ô điền từ chấm theo giới hạn số từ của đề. Đáp án, giải thích và transcript hiện sau khi nộp.</li>
        </ul>
        <button type="button" className="voa-primary-button" onClick={start}><Play size={16} /> Bắt đầu làm bài</button>
      </section>}

      {phase.kind !== "intro" && <>
        <nav className="lm-tabs" aria-label="Các phần của đề">
          {test.parts.filter((item) => !selectedPart || item.part_number === selectedPart).map((item) => <button type="button" key={item.part_id} aria-current={viewPart === item.part_number ? "page" : undefined} className={`${viewPart === item.part_number ? "active" : ""}${activePart === item.part_number ? " live" : ""}`} onClick={() => setViewPart(item.part_number)}>
            Part {item.part_number}{outcome ? ` · ${partScore(item.part_number)}/10` : ""}{activePart === item.part_number && <span className="lm-dot" aria-label="đang phát" />}</button>)}
        </nav>
        <section className="lm-part voa-surface">
          <div className="lm-part-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- static cover */}
            <img src={part.cover_url} alt="" />
            <div><span className="voa-eyebrow">PART {part.part_number}</span><h2>{part.title}</h2><p>{part.context}</p></div>
          </div>
          {part.groups.map((group) => (
            <div key={group.group_id} className="lm-group">
              <p className="lm-instructions">{group.instructions}</p>
              {group.heading && <h3>{group.heading}</h3>}
              {group.prompt && <p className="lm-prompt">{group.prompt}</p>}
              {/* eslint-disable-next-line @next/next/no-img-element -- static plan */}
              {group.map_url && <img className="lm-map" src={group.map_url} alt="Sơ đồ cho câu hỏi gắn nhãn" />}
              {group.options && group.type !== "mcq_choose_two" && <ul className="lm-option-list">{group.options.map((option) => <li key={option}>{option}</li>)}</ul>}
              {group.type === "mcq_choose_two" ? (
                <ChooseTwo group={group} answers={answers} locked={Boolean(outcome)} results={results} onChange={(next) => setAnswers((current) => ({ ...current, ...next }))} />
              ) : group.questions.map((question) => {
                const key = String(question.number);
                const result = results.get(key);
                const letters = group.letters ?? group.options?.map((option) => option.slice(0, 1));
                return (
                  <div key={question.question_id} className={`lm-question${result ? (result.correct ? " correct" : " wrong") : ""}`}>
                    <label htmlFor={`lm-${key}`}><span className="lm-number">{question.number}</span> {question.prompt}</label>
                    {question.options ? (
                      <div className="lm-options" role="radiogroup" aria-label={`Câu ${question.number}`}>
                        {question.options.map((option) => <label key={option} className={answers[key] === option.slice(0, 1) ? "chosen" : ""}>
                          <input type="radio" name={`lm-${key}`} disabled={Boolean(outcome)} checked={answers[key] === option.slice(0, 1)} onChange={() => setAnswers((current) => ({ ...current, [key]: option.slice(0, 1) }))} /> {option}</label>)}
                      </div>
                    ) : letters && (group.type === "matching" || group.type === "map_labelling") ? (
                      <select id={`lm-${key}`} value={answers[key] ?? ""} disabled={Boolean(outcome)} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}>
                        <option value="">Chọn chữ cái</option>{letters.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                      </select>
                    ) : (
                      <input id={`lm-${key}`} value={answers[key] ?? ""} disabled={Boolean(outcome)} autoComplete="off" spellCheck={false} placeholder={question.word_limit ? `Tối đa ${question.word_limit} từ và/hoặc một số` : "Câu trả lời"}
                        onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} />
                    )}
                    {result && <Feedback result={result} />}
                  </div>
                );
              })}
            </div>
          ))}
          {outcome && <div className="lm-transcript">
            <h3>Transcript Part {part.part_number}</h3>
            {outcome.transcript.find((item) => item.part_number === part.part_number)?.turns.map((turn) => {
              const clipUrl = part.turns.find((item) => item.turn_id === turn.turn_id)?.audio_url ?? null;
              const key = `${part.part_id}/${turn.turn_id}`;
              return <p key={turn.turn_id}><button type="button" aria-label={`Nghe ${turn.turn_id}`} onClick={() => playReview(clipUrl, key)}>{reviewPlaying === key ? <Pause size={13} /> : <Play size={13} />}</button><b>{turn.speaker}:</b> {turn.text_en}</p>;
            })}
          </div>}
        </section>
        <section className="lm-submit voa-surface">
          {outcome ? <>
            <div><strong>{outcome.correct}/{outcome.total} câu đúng</strong><span className="lm-muted">Điểm thô, chưa quy đổi Band chính thức. Câu sai có giải thích và trích dẫn lời thoại.</span></div>
            <div className="lm-submit-actions"><button type="button" onClick={retake}>Làm lại</button><button type="button" className="voa-primary-button" onClick={() => router.push(BASE)}>Đề khác <ArrowRight size={15} /></button></div>
          </> : <>
            <div><strong>Đã trả lời {answered}/{questionCount} câu</strong><span className="lm-muted">{live ? "Bạn vẫn có thể trả lời trong lúc nghe." : "Kiểm tra lại các câu còn trống trước khi nộp."}</span></div>
            <button type="button" className="voa-primary-button" disabled={busy} onClick={() => void submit()}><Send size={15} /> {busy ? "Đang chấm…" : "Nộp bài"}</button>
          </>}
        </section>
      </>}
      {error && test && <p className="sld-error" role="alert">{error}</p>}
    </div>
  );
}

function ChooseTwo({ group, answers, locked, results, onChange }: {
  group: PublicMock["parts"][number]["groups"][number]; answers: Record<string, string>; locked: boolean; results: Map<string, MockResult>;
  onChange: (next: Record<string, string>) => void;
}) {
  const keys = group.questions.map((question) => String(question.number));
  const chosen = keys.map((key) => answers[key]).filter(Boolean);
  function toggle(letter: string) {
    const next = chosen.includes(letter) ? chosen.filter((item) => item !== letter) : chosen.length < 2 ? [...chosen, letter] : chosen;
    onChange(Object.fromEntries(keys.map((key, index) => [key, next[index] ?? ""])));
  }
  const first = results.get(keys[0]);
  return (
    <div className={`lm-question${first ? (keys.every((key) => results.get(key)?.correct) ? " correct" : " wrong") : ""}`}>
      <p className="lm-choose-label"><span className="lm-number">{keys.join("–")}</span> Chọn HAI đáp án</p>
      <div className="lm-options">
        {(group.options ?? []).map((option) => { const letter = option.slice(0, 1); return <label key={option} className={chosen.includes(letter) ? "chosen" : ""}>
          <input type="checkbox" disabled={locked || (!chosen.includes(letter) && chosen.length >= 2)} checked={chosen.includes(letter)} onChange={() => toggle(letter)} /> {option}</label>; })}
      </div>
      {keys.map((key) => { const result = results.get(key); return result ? <Feedback key={key} result={result} /> : null; })}
    </div>
  );
}

function Feedback({ result }: { result: MockResult }) {
  return (
    <div className="lm-feedback">
      <p className="lm-verdict">{result.correct ? <><Check size={14} /> Câu {result.number}: đúng</> : <><X size={14} /> Câu {result.number}: {result.reason === "word_limit_exceeded" ? `vượt giới hạn số từ (tối đa ${result.allowed_words})` : result.reason === "empty_answer" ? "chưa trả lời" : "chưa đúng"} · Đáp án: <b>{result.accepted_answers.join(" / ")}</b></>}</p>
      <p className="lm-explain">{result.explanation_vi.replace(/\*\*/g, "")}</p>
      {result.evidence[0] && <blockquote>{result.evidence.map((turn) => turn.text_en).join(" ")}</blockquote>}
    </div>
  );
}
