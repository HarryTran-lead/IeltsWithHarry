"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Mic, RotateCcw, Save, SkipForward, Square, Volume2 } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { HarryMascot } from "@/components/illustrations/harry";
import { useNotebook } from "@/features/notebook/notebook-store";
import { HarryExaminer, useHarryVoice } from "./harry-examiner";
import { CueCard } from "./bank-speaking";
import { clock, speakingItems, useMic, wordsIn, type SpeakingItem, type Take } from "./speaking-kit";
import "./bank-exam.css";
import "./bank-library.css";
import "./bank-speaking.css";

type MockSet = { part1: { topic: string; questions: string[] }[]; cue: SpeakingItem; part3: string[] };
type Entry = { id: string; part: 1 | 2 | 3; question: string; take: Take | null };
type Stage = { part: 1 | 2 | 3; mode: "speaking" | "listening" | "prep"; text: string; limit?: number; until?: number };
type CatalogRow = { id: string; title: string; practice_type: string; topic?: string | null };

// Used when the question bank cannot be reached (demo mode, offline).
const samples: MockSet[] = [
  {
    part1: [
      { topic: "your hometown", questions: ["Where is your hometown?", "What do you like most about it?", "Has your hometown changed much since you were a child?", "Would you like to live there in the future?"] },
      { topic: "free time", questions: ["What do you usually do in your free time?", "Do you prefer spending free time alone or with friends?", "Did you have more free time when you were younger?", "Is there a new hobby you would like to try?"] },
    ],
    cue: { id: "mock-cue", part: 2, kind: "cue", text: "Describe a place you visited that you really enjoyed", bullets: ["where the place is", "when you went there", "what you did there", "and explain why you enjoyed it so much"] },
    part3: ["Why do you think people like to travel to new places?", "How has tourism changed in your country in recent years?", "Do you think tourism always benefits local communities?", "What can governments do to protect popular tourist sites?"],
  },
  {
    part1: [
      { topic: "your studies or work", questions: ["Do you work or are you a student?", "Why did you choose that subject or job?", "What is the most interesting part of it?", "What would you like to do in the future?"] },
      { topic: "music", questions: ["What kind of music do you like?", "How often do you listen to music?", "Did you learn to play an instrument as a child?", "Is live music popular where you live?"] },
    ],
    cue: { id: "mock-cue", part: 2, kind: "cue", text: "Describe a skill you learned that you are proud of", bullets: ["what the skill is", "when and how you learned it", "who helped you learn it", "and explain why you are proud of it"] },
    part3: ["What skills are most important for young people today?", "Is it better to learn skills at school or from experience?", "Why do some adults stop learning new skills?", "How might technology change the way people learn in the future?"],
  },
];

const shuffle = <T,>(list: T[]) => list.map((value) => ({ value, key: Math.random() })).sort((a, b) => a.key - b.key).map(({ value }) => value);
async function json(url: string) { const response = await fetch(url); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Request failed"); return data; }

/** Two Part 1 topics, a Part 2 cue card and Part 3 questions on the same theme, from the question bank. */
async function loadSet(): Promise<MockSet> {
  try {
    const { exams } = await json("/api/ielts/bank/catalog?skill=Speaking") as { exams: CatalogRow[] };
    const pick = (type: string) => shuffle(exams.filter((exam) => exam.practice_type === type));
    const ones = pick("part1").slice(0, 2), two = pick("part2")[0];
    if (!ones.length || !two) throw new Error("not enough");
    const threes = pick("part3");
    const three = threes.find((exam) => two.topic && exam.topic === two.topic) ?? threes[0];
    const load = async (row: CatalogRow) => { const { exam } = await json(`/api/ielts/bank/library?id=${encodeURIComponent(row.id)}`) as { exam: { content: ExamContent; practice_type?: string } }; return speakingItems(exam.content, exam.practice_type ?? row.practice_type); };
    const [first, second, cueItems, third] = await Promise.all([load(ones[0]), ones[1] ? load(ones[1]) : Promise.resolve([]), load(two), three ? load(three) : Promise.resolve([])]);
    const cue = cueItems.find((item) => item.kind === "cue");
    if (!cue) throw new Error("no cue card");
    const followUps = cueItems.filter((item) => item.part === 3).map((item) => item.text);
    const part3 = (followUps.length ? followUps : third.map((item) => item.text)).slice(0, 5);
    const part1 = [{ topic: ones[0].title, questions: first.map((item) => item.text).slice(0, 4) }, ...(ones[1] && second.length ? [{ topic: ones[1].title, questions: second.map((item) => item.text).slice(0, 4) }] : [])];
    if (!part1[0].questions.length || !part3.length) throw new Error("incomplete");
    return { part1, cue, part3 };
  } catch { return samples[Math.floor(Math.random() * samples.length)]; }
}

const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; };
const topicName = (title: string) => /^[A-Z][a-z]/.test(title) && !/^(I|English)\b/.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title;
const cueTheme = (text: string) => text.replace(/^describe\s+/i, "").replace(/[.?]$/, "");
class Stopped extends Error {}

/**
 * A full Speaking test run by Harry without breaks: introduction, Part 1 on two
 * topics, the Part 2 cue card with a minute to prepare, and a Part 3
 * discussion. Each answer is recorded; when the learner goes quiet Harry moves
 * on, as an examiner would.
 */
export function SpeakingMock() {
  const voice = useHarryVoice();
  const mic = useMic();
  const { addEntry } = useNotebook();
  const [phase, setPhase] = useState<"setup" | "loading" | "exam" | "done">("setup");
  const [subtitles, setSubtitles] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [cue, setCue] = useState<SpeakingItem | null>(null);
  const [cueNotes, setCueNotes] = useState("");
  const [log, setLog] = useState<Entry[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState(false);
  const run = useRef(0);
  const advance = useRef<((reason: "done" | "repeat") => void) | null>(null);
  const { speak, stop: hush } = voice;
  const { start: startMic, stop: stopMic, open: openMic } = mic;

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  // Leaving the page ends the test.
  useEffect(() => () => { run.current += 1; advance.current?.("done"); }, []);

  const begin = useCallback(async () => {
    const id = ++run.current;
    const alive = () => { if (run.current !== id) throw new Stopped(); };
    setPhase("loading"); setLog([]); setSaved(false); setCueNotes("");
    await openMic();
    const set = await loadSet();
    alive();
    setCue(set.cue); setStartedAt(Date.now()); setPhase("exam");
    const say = async (part: Stage["part"], text: string) => { setStage({ part, mode: "speaking", text }); await speak(text); alive(); };
    const answer = async (part: Stage["part"], text: string, options: { limit: number; silenceMs: number; silent?: boolean }) => {
      for (;;) {
        if (!options.silent) await say(part, text);
        options.silent = false;
        setStage({ part, mode: "listening", text, limit: options.limit, until: Date.now() + options.limit * 1000 });
        const reason = await new Promise<"done" | "repeat">((resolve) => {
          const timer = window.setTimeout(() => resolve("done"), options.limit * 1000);
          advance.current = (value) => { window.clearTimeout(timer); resolve(value); };
          void startMic({ silenceMs: options.silenceMs, onSilence: () => advance.current?.("done") });
        });
        advance.current = null;
        const take = await stopMic();
        alive();
        if (reason === "repeat") continue;
        setLog((current) => [...current, { id: `${part}-${current.length}`, part, question: text, take }]);
        return;
      }
    };
    try {
      await say(1, `${greeting()}. My name is Harry, and I'll be your examiner today.`);
      await answer(1, "Could you tell me your full name, please?", { limit: 20, silenceMs: 1500 });
      await answer(1, "And can you tell me where you're from?", { limit: 25, silenceMs: 1800 });
      for (const [index, topic] of set.part1.entries()) {
        await say(1, index ? `Now let's move on to talk about ${topicName(topic.topic)}.` : `Thank you. Now, in this first part of the test, I'd like to ask you some questions about yourself. Let's talk about ${topicName(topic.topic)}.`);
        for (const question of topic.questions) await answer(1, question, { limit: 45, silenceMs: 2200 });
      }
      await say(2, "Thank you. Now, I'm going to give you a topic, and I'd like you to talk about it for one to two minutes. Before you talk, you'll have one minute to think about what you're going to say. You can make some notes if you wish. Here is your topic.");
      setStage({ part: 2, mode: "prep", text: set.cue.text, until: Date.now() + 60_000 });
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 60_000);
        advance.current = () => { window.clearTimeout(timer); resolve(); };
      });
      advance.current = null;
      alive();
      await say(2, "All right? Remember, you have one to two minutes for this, so don't worry if I stop you. I'll tell you when the time is up. Can you start speaking now, please?");
      await answer(2, set.cue.text, { limit: 120, silenceMs: 8000, silent: true });
      await say(2, "Thank you.");
      await say(3, `We've been talking about ${cueTheme(set.cue.text)}, and I'd like to discuss with you one or two more general questions related to this.`);
      for (const question of set.part3) await answer(3, question, { limit: 75, silenceMs: 3000 });
      await say(3, "Thank you very much. That is the end of the speaking test.");
      setStage(null); setPhase("done");
    } catch (error) { if (!(error instanceof Stopped)) throw error; }
  }, [openMic, speak, startMic, stopMic]);

  const quit = () => { run.current += 1; advance.current?.("done"); hush(); setStage(null); setPhase(log.length ? "done" : "setup"); };
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const left = stage?.until ? Math.max(0, Math.ceil((stage.until - now) / 1000)) : 0;
  const mood = voice.speaking ? "speaking" : stage?.mode === "listening" ? "listening" : stage?.mode === "prep" ? "thinking" : "idle";

  if (phase === "done") {
    const spoken = log.reduce((sum, entry) => sum + (entry.take?.seconds ?? 0), 0);
    const words = log.reduce((sum, entry) => sum + wordsIn(entry.take?.transcript ?? ""), 0);
    const save = async () => {
      const body = log.map((entry) => `[Part ${entry.part}] ${entry.question}\n→ ${entry.take?.transcript || "(không có bản chữ)"}`).join("\n\n").slice(0, 4900);
      await addEntry({ kind: "note", title: `Thi thử Speaking với Harry · ${new Date().toLocaleDateString("vi-VN")}`, body: body || "Bài thi thử Speaking", meaningVi: "", example: "" });
      setSaved(true);
    };
    return <main className="sm-page bl-tone-speaking">
      <header className="sm-bar"><h1>Kết quả thi thử Speaking</h1><span className="sm-time">Thời gian thi {clock(elapsed)}</span></header>
      <div className="sm-result">
        <div className="sm-stats">
          <div><b>{log.length}</b><span>câu đã trả lời</span></div>
          <div><b>{clock(spoken)}</b><span>thời gian bạn nói</span></div>
          <div><b>{words || "—"}</b><span>từ nhận dạng được</span></div>
          <div><b>{words && spoken ? Math.round(words / (spoken / 60)) : "—"}</b><span>từ / phút (chuẩn 110–150)</span></div>
        </div>
        <div className="sm-actions">
          <button type="button" className="bx-submit" onClick={() => void begin()}><RotateCcw size={16} /> Thi lại đề khác</button>
          <button type="button" className="bx-ghost" disabled={saved || !log.length} onClick={() => void save()}><Save size={16} /> {saved ? "Đã lưu vào Sổ tay" : "Lưu vào Sổ tay"}</button>
          <Link className="bx-ghost" href="/app/speaking">Về Speaking</Link>
        </div>
        <p className="bs-privacy">Nghe lại từng câu để tự đánh giá độ trôi chảy, phát âm và độ dài câu trả lời. Bản ghi âm chỉ nằm trong trình duyệt này và sẽ mất khi bạn rời trang.</p>
        <div className="sm-log">{([1, 2, 3] as const).map((part) => {
          const entries = log.filter((entry) => entry.part === part);
          return entries.length ? <section key={part} className="sm-log"><h2>Part {part}</h2>{entries.map((entry) => <article key={entry.id} className="sm-entry">
            <b>{entry.question}</b>
            {entry.take && <audio controls src={entry.take.url} aria-label={`Bản ghi: ${entry.question}`} />}
            <p>{entry.take?.transcript || <i>Trình duyệt không nhận dạng được lời nói — hãy nghe lại bản ghi.</i>}</p>
            <small>{entry.take ? `${clock(entry.take.seconds)} · ${wordsIn(entry.take.transcript)} từ` : "Không có bản ghi"}</small>
          </article>)}</section> : null;
        })}</div>
      </div>
    </main>;
  }

  if (phase === "setup" || phase === "loading") return <main className="sm-page bl-tone-speaking">
    <div className="sm-hero">
      <HarryExaminer mood={mic.level > 0.03 ? "listening" : "idle"} level={mic.level} />
      <section className="sm-intro">
        <h1>Thi thử Speaking với Harry</h1>
        <p>Harry là giám khảo: hỏi bằng giọng nói và dẫn bạn đi liền mạch qua cả 3 part, giống phòng thi thật (khoảng 11–14 phút).</p>
        <ul>
          <li><b>Part 1</b> — giới thiệu và câu hỏi về 2 chủ đề quen thuộc.</li>
          <li><b>Part 2</b> — cue card: 1 phút chuẩn bị (được ghi chú), nói tối đa 2 phút.</li>
          <li><b>Part 3</b> — thảo luận sâu hơn về chủ đề Part 2.</li>
          <li>Khi bạn ngừng nói vài giây, Harry tự chuyển câu. Cần thì bấm “Trả lời xong” hoặc “Nghe lại câu hỏi”.</li>
        </ul>
        <div className="sm-check">
          <div className="sm-check-row"><button type="button" className="bx-ghost" onClick={() => void openMic()}><Mic size={16} /> Kiểm tra micro</button><span className="sm-level" aria-label="Âm lượng micro"><i style={{ width: `${Math.min(100, mic.level * 400)}%` }} /></span></div>
          <small>{mic.error || (mic.level > 0.03 ? "Micro đang nhận tiếng — sẵn sàng!" : "Bấm kiểm tra rồi nói thử vài từ, thanh xanh sẽ chạy.")}</small>
          <div className="sm-toggles">
            <label><input type="checkbox" checked={subtitles} onChange={(event) => setSubtitles(event.target.checked)} /> Hiện chữ câu hỏi (thi thật không có)</label>
            <label><input type="checkbox" checked={!voice.muted} onChange={(event) => voice.setMuted(!event.target.checked)} /> Giọng Harry</label>
          </div>
        </div>
        <button type="button" className="bx-start sm-start" disabled={phase === "loading"} onClick={() => void begin()}>{phase === "loading" ? "Đang chọn đề…" : "Bắt đầu thi"} <ArrowRight size={18} /></button>
      </section>
    </div>
  </main>;

  return <main className="sm-page bl-tone-speaking">
    <header className="sm-bar">
      <h1>Thi thử Speaking</h1>
      <div className="sm-parts">{([1, 2, 3] as const).map((part) => <span key={part} className={stage?.part === part ? "is-on" : stage && stage.part > part ? "is-past" : ""}>Part {part}</span>)}</div>
      <span className="sm-time">{clock(elapsed)}</span>
      <button type="button" className="bx-ghost" onClick={quit}><Square size={15} /> Dừng thi</button>
    </header>
    <div className="sm-room">
      <HarryExaminer mood={mood} level={mic.level} recording={mic.recording} />
      <section className="sm-panel" aria-live="polite">
        <div className={`sm-status is-${stage?.mode ?? "speaking"}`}><i />{stage?.mode === "listening" ? <>Đang nghe bạn trả lời · {clock(mic.seconds)}</> : stage?.mode === "prep" ? <>Thời gian chuẩn bị · {clock(left)}</> : "Harry đang nói…"}</div>
        {stage?.part === 2 && cue ? <CueCard item={cue} /> : subtitles && stage?.text ? <div className="bs-bubble"><p>{stage.text}</p></div> : <p className="bs-privacy">Hãy nghe Harry như trong phòng thi. Bấm “Nghe lại câu hỏi” nếu chưa nghe rõ.</p>}
        {stage?.part === 2 && <div className="bs-prep"><textarea value={cueNotes} onChange={(event) => setCueNotes(event.target.value)} rows={5} placeholder={"Ghi từ khóa cho từng ý…"} aria-label="Ghi chú Part 2" /><small>{stage.mode === "prep" ? "Bạn có 1 phút để ghi chú." : "Nhìn ghi chú khi nói. Harry sẽ dừng bạn ở 2 phút."}</small></div>}
        {stage?.mode === "listening" && <div className="bs-live"><span className="bs-meter" style={{ width: `${Math.min(100, mic.level * 400)}%` }} /><b>Đang ghi âm</b><small>tối đa {clock(left)}</small></div>}
        {stage?.mode === "listening" && mic.transcript && <p className="bs-transcript-live">{mic.transcript}</p>}
        <div className="sm-actions">
          {stage?.mode === "listening" && <><button type="button" className="bx-next" onClick={() => advance.current?.("done")}><SkipForward size={16} /> Trả lời xong</button>{stage.part !== 2 && <button type="button" className="bx-ghost" onClick={() => advance.current?.("repeat")}><Volume2 size={16} /> Nghe lại câu hỏi</button>}</>}
          {stage?.mode === "prep" && <button type="button" className="bx-next" onClick={() => advance.current?.("done")}><SkipForward size={16} /> Bắt đầu nói luôn</button>}
        </div>
        {mic.error && <p className="bs-error" role="alert">{mic.error}</p>}
      </section>
    </div>
  </main>;
}

/** Entry card on the Speaking page. */
export function SpeakingMockCta() {
  return <Link className="sm-cta" href="/app/speaking/mock">
    <HarryMascot size={64} />
    <div><b>Thi thử Speaking với Harry</b><small>Giám khảo Harry hỏi bằng giọng nói, dẫn bạn liền mạch qua Part 1 → 2 → 3 như phòng thi thật.</small></div>
    <span>Vào phòng thi <ArrowRight size={16} /></span>
  </Link>;
}
