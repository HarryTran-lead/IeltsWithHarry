"use client";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, Captions, CaptionsOff, Check, Lightbulb, Mic, RotateCcw, Square, Timer, Volume2, VolumeX } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import type { BankExam } from "./bank-exam";
import { Lookup } from "./bank-writing";
import { HarryExaminer, useHarryVoice } from "./harry-examiner";
import { clock, hintSteps, speakingItems, useMic, type SpeakingItem, type Take } from "./speaking-kit";
import "./bank-speaking.css";

const readyLine = "All right? Remember, you have one to two minutes for this. Can you start speaking now, please?";
const askLine = (item: SpeakingItem) => item.kind === "cue" ? `I'm going to give you a topic, and I'd like you to talk about it for one to two minutes. ${item.text}.` : item.text;
const limitFor = (item: SpeakingItem) => item.kind === "cue" ? 120 : item.part === 3 ? 90 : 60;

/** The cue card as it is printed in the exam: topic, then "You should say" points. */
export function CueCard({ item }: { item: SpeakingItem }) {
  return <div className="bs-cue">
    <b>{item.text}</b>
    {Boolean(item.bullets?.length) && <><span>You should say:</span><ul>{item.bullets!.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></>}
  </div>;
}

/**
 * Speaking practice with Harry as the examiner: he asks each question aloud,
 * the learner records an answer (transcribed where the browser can), and a
 * side panel walks through an answer step by step or looks up a word. Part 2
 * adds a cue card with a timed minute of preparation or free notes.
 */
export function SpeakingStudio({ exam, content, answers, setAnswer, notes, setNotes, onFinish }: { exam: BankExam; content: ExamContent; answers: Record<string, string>; setAnswer: (id: string, value: string) => void; notes: Record<string, string>; setNotes: (notes: Record<string, string>) => void; onFinish: () => void }) {
  const items = useMemo(() => speakingItems(content, exam.practice_type), [content, exam.practice_type]);
  const voice = useHarryVoice();
  const mic = useMic();
  const [index, setIndex] = useState(0);
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const [subtitles, setSubtitles] = useState(true);
  const [panel, setPanel] = useState<"start" | "hints" | "lookup">("start");
  const [step, setStep] = useState(0);
  const [prepMode, setPrepMode] = useState<"timed" | "free">("timed");
  const [prepLeft, setPrepLeft] = useState<number | null>(null);
  const item = items[index] ?? items[0];
  const steps = useMemo(() => item ? hintSteps(item) : [], [item]);
  const limit = item ? limitFor(item) : 60;

  const { speak, stop: hush } = voice;
  const { start: startMic, stop: stopMic } = mic;
  const { release: releaseTake } = mic;
  const record = useCallback(async () => { hush(); setPrepLeft(null); await startMic(); }, [hush, startMic]);
  const finishTake = useCallback(async () => {
    const take = await stopMic();
    if (!take || !item) return;
    setTakes((current) => { if (current[item.id]) releaseTake(current[item.id].url); return { ...current, [item.id]: take }; });
    if (take.transcript) setAnswer(item.id, take.transcript);
  }, [item, stopMic, setAnswer, releaseTake]);
  const goTo = (next: number) => {
    if (mic.recording) void finishTake();
    setIndex(next); setPanel("start"); setStep(0); setPrepLeft(null);
    void voice.speak(askLine(items[next]));
  };

  // Harry asks the first question as soon as the studio opens (the start click allows audio).
  const asked = useRef(false);
  useEffect(() => { if (asked.current || !items[0]) return; asked.current = true; void speak(askLine(items[0])); }, [items, speak]);
  // A recording stops by itself at the time limit.
  const atLimit = useEffectEvent(() => { void finishTake(); });
  useEffect(() => { if (!mic.recording || mic.paused) return; const timer = window.setTimeout(atLimit, Math.max(0, limit - mic.seconds) * 1000); return () => window.clearTimeout(timer); }, [mic.recording, mic.paused, mic.seconds, limit]);
  // The minute of preparation counts down, then Harry asks the learner to start.
  useEffect(() => {
    if (prepLeft === null) return;
    const timer = window.setTimeout(() => {
      if (prepLeft > 1) { setPrepLeft(prepLeft - 1); return; }
      setPrepLeft(null);
      void speak(readyLine).then(() => void startMic());
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [prepLeft, speak, startMic]);

  if (!item) return <p className="bx-error">Đề này chưa có câu hỏi.</p>;
  const take = takes[item.id];
  const mood = voice.speaking ? "speaking" : mic.recording ? "listening" : prepLeft !== null ? "thinking" : "idle";
  const done = (entry: SpeakingItem) => Boolean(answers[entry.id] || takes[entry.id]);
  const partOf = (entry: SpeakingItem) => entry.kind === "cue" ? "Part 2" : `Part ${entry.part}`;
  const appendNote = (text: string) => setNotes({ ...notes, [item.id]: `${notes[item.id] ? `${notes[item.id].trimEnd()} ` : ""}${text}` });

  return <div className="bs-studio">
    <section className="bs-main" aria-label="Phòng nói với Harry">
      <div className="bs-top">
        {items.length > 1 ? <nav className="bs-pills" aria-label="Chọn câu hỏi">{items.map((entry, i) => <button key={entry.id} type="button" aria-current={i === index ? "step" : undefined} className={done(entry) ? "is-done" : ""} onClick={() => goTo(i)} title={`${partOf(entry)} · ${entry.text}`}>{entry.kind === "cue" ? "Cue" : i + 1}{done(entry) && <Check size={11} />}</button>)}</nav> : <span className="bs-part-chip">{partOf(item)}</span>}
        <div className="bs-switches">
          <button type="button" aria-pressed={subtitles} onClick={() => setSubtitles(!subtitles)} title="Hiện chữ câu hỏi">{subtitles ? <Captions size={16} /> : <CaptionsOff size={16} />}<span>Phụ đề</span></button>
          <button type="button" aria-pressed={!voice.muted} onClick={() => { voice.stop(); voice.setMuted(!voice.muted); }} title="Giọng Harry">{voice.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}<span>Giọng Harry</span></button>
        </div>
      </div>

      <div className="bs-harry"><HarryExaminer mood={mood} level={mic.level} recording={mic.recording} /></div>

      <div className="bs-bubble">
        <button type="button" className="bs-replay" onClick={() => void voice.speak(askLine(item))} aria-label="Nghe lại câu hỏi"><Volume2 size={18} /></button>
        {item.kind === "cue" ? <CueCard item={item} /> : subtitles ? <p>{item.text}</p> : <p className="bs-hidden-q">Harry đang hỏi bằng lời — bật <b>Phụ đề</b> nếu muốn xem chữ.</p>}
      </div>

      {item.kind === "cue" && <div className="bs-prep">
        <div className="bs-prep-head">
          <div className="bs-seg" role="group" aria-label="Cách chuẩn bị">
            <button type="button" aria-pressed={prepMode === "timed"} onClick={() => { setPrepMode("timed"); }}><Timer size={14} /> Chuẩn bị 1 phút</button>
            <button type="button" aria-pressed={prepMode === "free"} onClick={() => { setPrepMode("free"); setPrepLeft(null); }}>Ghi chú tự do</button>
          </div>
          {prepMode === "timed" && (prepLeft !== null
            ? <span className={`bs-count ${prepLeft <= 10 ? "is-low" : ""}`} role="timer"><Timer size={15} /> {clock(prepLeft)}</span>
            : !mic.recording && <button type="button" className="bx-ghost" onClick={() => { voice.stop(); setPrepLeft(60); }}>Bắt đầu đếm 1 phút</button>)}
        </div>
        <textarea value={notes.__cue_notes || ""} onChange={(event) => setNotes({ ...notes, __cue_notes: event.target.value })} rows={4} placeholder={"Ghi từ khóa cho từng ý:\n• who / what…\n• when / where…\n• why it matters…"} aria-label="Ghi chú chuẩn bị Part 2" />
        <small>{prepMode === "timed" ? "Như phòng thi: 1 phút ghi chú, hết giờ Harry mời bạn nói và máy tự ghi âm tối đa 2 phút." : "Ghi chú thoải mái, khi sẵn sàng bấm ghi âm để nói (tối đa 2 phút)."}</small>
      </div>}

      <div className="bs-record">
        {mic.recording ? <>
          <div className="bs-live"><span className="bs-meter" style={{ width: `${Math.min(100, mic.level * 400)}%` }} /><b>Đang ghi · {clock(mic.seconds)}</b><small>còn {clock(limit - mic.seconds)}</small></div>
          {mic.transcript && <p className="bs-transcript-live">{mic.transcript}</p>}
          <button type="button" className="bx-ghost" onClick={mic.paused ? mic.resume : mic.pause}>{mic.paused ? "Tiếp tục" : "Tạm dừng"}</button>
          <button type="button" className="bs-rec is-live" onClick={() => void finishTake()}><Square size={16} /> Dừng ghi âm</button>
        </> : <button type="button" className="bs-rec" onClick={() => void record()}>{take ? <RotateCcw size={17} /> : <Mic size={17} />} {take ? "Ghi âm lại" : "Bắt đầu ghi âm"}</button>}
        {mic.error && <small className="bs-error" role="alert">{mic.error}</small>}
      </div>

      {(take || answers[item.id]) && !mic.recording && <div className="bs-take">
        {take && <><audio controls src={take.url} aria-label="Bản ghi của bạn" /><button type="button" className="bx-ghost" onClick={() => { mic.release(take.url); setTakes((current) => { const next = { ...current }; delete next[item.id]; return next; }); setAnswer(item.id, ""); }}>Xóa bản ghi</button></>}
        <label><span>{mic.canTranscribe ? "Lời bạn nói (tự nhận dạng, có thể sửa)" : "Tóm tắt ý bạn đã nói"}</span>
          <textarea rows={3} value={answers[item.id] || ""} onChange={(event) => setAnswer(item.id, event.target.value)} placeholder="Trình duyệt này chưa nhận dạng được giọng nói — ghi lại ý chính bạn đã nói." /></label>
      </div>}

      <div className="bs-steps">
        <button type="button" className="bx-ghost" disabled={!index} onClick={() => goTo(index - 1)}>← Câu trước</button>
        {index >= items.length - 1 ? <button type="button" className="bx-submit" onClick={() => { if (mic.recording) void finishTake(); onFinish(); }}>Xem lại & nộp</button> : <button type="button" className="bx-next" onClick={() => goTo(index + 1)}>Câu tiếp →</button>}
      </div>
    </section>

    <aside className="bs-side" aria-label="Gợi ý">
      {panel === "start" ? <div className="bs-start">
        <h3>Chưa biết nói gì? Bắt đầu từ đây!</h3>
        <p>Harry sẽ hướng dẫn bạn từng bước để xây dựng một câu trả lời hoàn chỉnh:</p>
        <button type="button" onClick={() => setPanel("hints")}><Lightbulb size={17} /> Xem gợi ý từng bước</button>
        <span className="bs-or">hoặc</span>
        <button type="button" onClick={() => setPanel("lookup")}><BookOpenText size={17} /> Tra từ vựng</button>
        <small>Nếu bạn đã có idea nhưng cần từ vựng</small>
      </div> : <div className="bs-panel">
        <button type="button" className="bs-back" onClick={() => setPanel("start")}><ArrowLeft size={15} /> Quay lại</button>
        {panel === "lookup" ? <><h3>Tra từ vựng</h3><Lookup /></> : <>
          <h3>Gợi ý từng bước <small>{Math.min(step + 1, steps.length)}/{steps.length}</small></h3>
          <ol className="bs-hints">{steps.slice(0, step + 1).map((hint, i) => <li key={hint.title} className={i === step ? "is-current" : ""}>
            <b>{hint.title}</b>
            <button type="button" className="bs-probe" onClick={() => void voice.speak(hint.probe)}><Volume2 size={14} /> <span>Harry hỏi: “{hint.probe}”</span></button>
            <div className="bs-starters">{hint.starters.map((starter) => <button key={starter} type="button" onClick={() => appendNote(starter)} title="Thêm vào ghi chú">{starter}</button>)}</div>
          </li>)}</ol>
          <div className="bs-hint-actions">{step < steps.length - 1 ? <><button type="button" className="bx-next" onClick={() => setStep(step + 1)}>Bước tiếp</button><button type="button" className="bx-ghost" onClick={() => setStep(steps.length - 1)}>Xem tất cả</button></> : <span>Giờ thử nói cả câu trả lời nhé!</span>}</div>
        </>}
      </div>}
      <label className="bs-notes"><span>Ghi chú của bạn</span><textarea rows={4} value={notes[item.id] || ""} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} placeholder="Bấm vào mẫu câu ở gợi ý để thêm vào đây, hoặc tự ghi ý…" /></label>
      <p className="bs-privacy">Bản ghi âm chỉ nằm trong trình duyệt của bạn; phần chữ và ghi chú được lưu cùng bài làm.</p>
    </aside>
  </div>;
}
