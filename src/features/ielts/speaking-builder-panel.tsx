"use client";
import { useState } from "react";
import { Check, ClipboardCopy, RotateCcw, Volume2 } from "lucide-react";
import { builderSteps, filled, type Tone } from "./speaking-builder";
import type { SpeakingItem } from "./speaking-kit";

type Pick = { step: string; option: number; words?: string };

const read = (raw?: string): Pick[] => { try { const value = JSON.parse(raw ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };

/**
 * The Speaking Builder panel: the answer's structure, then one step at a time
 * with two or three ideas to choose from. Each choice adds an English sentence;
 * when every step is chosen the learner reads the whole answer aloud, has Harry
 * read it, or copies it into their notes before recording.
 */
export function SpeakingBuilder({ item, topic, saved, onSave, onSpeak, onCopy }: { item: SpeakingItem; topic: string; saved?: string; onSave: (value: string) => void; onSpeak: (text: string) => void; onCopy: (text: string) => void }) {
  const picks = read(saved);
  const [started, setStarted] = useState(picks.length > 0);
  const [draft, setDraft] = useState<{ option: number; words: string } | null>(null);
  const firstStep = builderSteps(item, topic)[0];
  const tone: Tone = picks[0] ? firstStep.options[picks[0].option]?.tone ?? "pos" : "pos";
  const steps = builderSteps(item, topic, tone);
  const chosen = picks.map((entry) => ({ entry, step: steps.find((step) => step.id === entry.step) })).filter((row) => row.step && row.step.options[row.entry.option]);
  const current = steps[chosen.length];
  const answer = chosen.map(({ entry, step }) => filled(step!.options[entry.option], entry.words)).join(" ");
  const save = (next: Pick[]) => { onSave(next.length ? JSON.stringify(next) : ""); setDraft(null); };
  const choose = (option: number, words?: string) => { if (current) save([...picks.slice(0, chosen.length), { step: current.id, option, ...(words ? { words } : {}) }]); };

  return <div className="sb-builder">
    <div className="sb-progress">
      <span>{chosen.length}/{steps.length} bước</span>
      <span className="sb-bars" aria-hidden="true">{steps.map((step, index) => <i key={step.id} className={index < chosen.length ? "is-done" : ""} />)}</span>
      {picks.length > 0 && <button type="button" onClick={() => save([])}><RotateCcw size={13} /> Chọn lại</button>}
    </div>

    {!started && !picks.length ? <div className="sb-intro">
      <h4>Cấu trúc trả lời cho Speaking Builder</h4>
      <ol>{steps.map((step) => <li key={step.id}><span>{step.label}</span></li>)}</ol>
      <button type="button" className="sb-start" onClick={() => setStarted(true)}>Bắt đầu</button>
    </div> : <>
      {chosen.length > 0 && <ol className="sb-answer">{chosen.map(({ entry, step }, index) => <li key={step!.id}>
        <b>{step!.label}</b>
        <span>{filled(step!.options[entry.option], entry.words)}</span>
        <button type="button" onClick={() => save(picks.slice(0, index))} aria-label={`Chọn lại từ bước ${step!.label}`} title="Chọn lại từ bước này"><RotateCcw size={12} /></button>
      </li>)}</ol>}

      {current ? <section className="sb-step" aria-label={current.label}>
        <h4>{current.label}</h4>
        <p>{current.hint}</p>
        <span className="sb-choose">Chọn ý của bạn:</span>
        <div className="sb-options">{current.options.map((option, index) => draft?.option === index
          ? <form key={index} className="sb-option is-blank" onSubmit={(event) => { event.preventDefault(); if (draft.words.trim()) choose(index, draft.words.trim()); }}>
            <span className="sb-letter">{String.fromCharCode(65 + index)}.</span>
            <span className="sb-frame">{option.sentence.split("___").map((part, i, all) => <span key={i}>{part}{i < all.length - 1 && <input autoFocus value={draft.words} onChange={(event) => setDraft({ option: index, words: event.target.value })} placeholder={option.blank} aria-label={option.blank} maxLength={120} />}</span>)}</span>
            <span className="sb-actions"><button type="button" className="bx-ghost" onClick={() => setDraft(null)}>Hủy</button><button type="submit" className="bx-next" disabled={!draft.words.trim()}>Thêm câu</button></span>
          </form>
          : <button type="button" key={index} className="sb-option" onClick={() => option.blank ? setDraft({ option: index, words: "" }) : choose(index)}>
            <span className="sb-letter">{String.fromCharCode(65 + index)}.</span>
            <span><b>{option.vi}</b><small>{option.en}</small></span>
          </button>)}</div>
      </section> : <div className="sb-done" role="status">
        <b><Check size={16} /> Câu trả lời đã hoàn chỉnh!</b>
        <p>Đọc thử 1 lần cho quen, rồi bấm <strong>Bắt đầu ghi âm</strong> để nói bằng lời của bạn nhé!</p>
        <div><button type="button" className="bx-ghost" onClick={() => onSpeak(answer)}><Volume2 size={15} /> Nghe Harry đọc</button><button type="button" className="bx-ghost" onClick={() => onCopy(answer)}><ClipboardCopy size={15} /> Chép vào ghi chú</button></div>
      </div>}
    </>}
  </div>;
}
