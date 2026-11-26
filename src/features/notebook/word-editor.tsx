"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Languages, Link2, MoreHorizontal, RotateCcw, Trash2, Volume2 } from "lucide-react";
import type { NotebookInput } from "@/lib/validation/notebook";
import type { WordReview } from "@/lib/news/review";
import { pronounce, lookupPronunciation } from "@/lib/vocabulary/pronounce";
import { wordState, wordStateLabels } from "@/lib/vocabulary/study-session";
import type { NotebookEntry } from "./notebook-store";

type WordEntry = Extract<NotebookEntry, { kind: "word" }>;
type Meaning = { pos: string; definition: string; meaningVi: string; example: string };
type Status = { tone: "idle" | "dirty" | "saving" | "saved" | "error"; text: string };

const partsOfSpeech = [
  ["", "Loại từ"], ["noun", "noun · danh từ"], ["verb", "verb · động từ"], ["adjective", "adjective · tính từ"],
  ["adverb", "adverb · trạng từ"], ["phrase", "phrase · cụm từ"], ["idiom", "idiom · thành ngữ"],
] as const;
const shortPos: Record<string, string> = { noun: "n", verb: "v", adjective: "adj", adverb: "adv", phrase: "phr", idiom: "idiom" };
export const posLabel = (value?: string) => (value ? shortPos[value.toLowerCase()] ?? value : "");
const clock = (value: Date) => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(value);
const dayLabel = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short" }).format(new Date(value));

function nextReviewText(review: WordReview | undefined, now: number) {
  if (!review) return "Chưa ôn · có trong phiên ôn tới";
  const due = new Date(review.due_at).getTime();
  if (due <= now) return "Đến hạn ôn hôm nay";
  const days = Math.round((due - now) / 86400000);
  return days <= 1 ? "Ôn tiếp: ngày mai" : `Ôn tiếp: ${dayLabel(review.due_at)}`;
}

/**
 * Structured editor for a saved word. A new word goes straight into the Sổ từ (notebook entry of kind "word"),
 * so it shows up in the vocabulary review queue. Saved words autosave the fields learners may edit
 * (word, meaning, example); IPA, part of speech, topic and definition are set when the word is created.
 */
export function WordEditor({ entry, review, sourceLabel, addEntry, updateEntry, removeEntry, onSaved, onBack }: {
  entry: WordEntry | null;
  review?: WordReview;
  sourceLabel?: string;
  addEntry: (input: NotebookInput) => Promise<NotebookEntry | undefined>;
  updateEntry: (id: string, input: NotebookInput) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  onSaved: (entry: NotebookEntry) => void;
  onBack: () => void;
}) {
  const [word, setWord] = useState(entry?.title ?? "");
  const [meaning, setMeaning] = useState(entry?.meaningVi ?? "");
  const [example, setExample] = useState(entry?.example ?? "");
  const [pos, setPos] = useState(entry?.partOfSpeech ?? "");
  const [ipa, setIpa] = useState(entry?.phonetic ?? "");
  const [topic, setTopic] = useState(entry?.topic ?? "");
  const [definition, setDefinition] = useState(entry?.definition ?? "");
  const [status, setStatus] = useState<Status>(entry ? { tone: "saved", text: "Đã lưu trong Sổ từ" } : { tone: "idle", text: "Từ mới · lưu vào Sổ từ để ôn" });
  const [meanings, setMeanings] = useState<Meaning[] | null>(null);
  const [lookupState, setLookupState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const [menu, setMenu] = useState(false);
  const [now] = useState(() => Date.now());
  const wordInput = useRef<HTMLInputElement>(null);
  const saved = useRef(JSON.stringify([entry?.title ?? "", entry?.meaningVi ?? "", entry?.example ?? ""]));

  useEffect(() => { if (!entry) window.requestAnimationFrame(() => wordInput.current?.focus()); }, [entry]);

  // New words: fill the IPA from the pronunciation dictionary once the learner pauses typing.
  useEffect(() => {
    if (entry || ipa || !/^[a-z][a-z' -]{1,59}$/i.test(word.trim())) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void lookupPronunciation(word.trim()).then((result) => { if (alive && result.ipa) setIpa((current) => current || result.ipa); }).catch(() => undefined);
    }, 600);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [word, ipa, entry]);

  const input = (): NotebookInput => ({
    kind: "word", title: word.trim().replace(/\s+/g, " ").slice(0, 100), body: "", meaningVi: meaning.trim().slice(0, 200), example: example.trim().slice(0, 500),
    ...(!entry && { phonetic: ipa.trim().slice(0, 100), partOfSpeech: pos.slice(0, 50), topic: topic.trim().slice(0, 100), definition: definition.trim().slice(0, 500) }),
  });
  const valid = word.trim().length > 0 && meaning.trim().length > 0;

  // Saved words autosave like notes.
  useEffect(() => {
    if (!entry || !valid) return;
    const fingerprint = JSON.stringify([word.trim(), meaning.trim(), example.trim()]);
    if (fingerprint === saved.current) return;
    const timer = window.setTimeout(() => {
      setStatus({ tone: "saving", text: "Đang lưu…" });
      updateEntry(entry.id, input())
        .then(() => { saved.current = fingerprint; setStatus({ tone: "saved", text: `Đã lưu lúc ${clock(new Date())}` }); })
        .catch(() => setStatus({ tone: "error", text: "Chưa lưu được. Từ có thể đã có trong Sổ từ." }));
    }, 900);
    return () => window.clearTimeout(timer);
    // input() reads the same fields listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, meaning, example, entry, valid]);

  function edit(setter: (value: string) => void) {
    return (value: string) => { setter(value); if (entry) setStatus({ tone: "dirty", text: "Chưa lưu thay đổi" }); };
  }

  async function create() {
    if (!valid || status.tone === "saving") return;
    setStatus({ tone: "saving", text: "Đang lưu vào Sổ từ…" });
    try {
      const created = await addEntry(input());
      if (!created) { setStatus({ tone: "error", text: "Từ này đang được lưu, thử lại sau giây lát." }); return; }
      onSaved(created);
    } catch { setStatus({ tone: "error", text: "Chưa lưu được. Kiểm tra lại từ và nghĩa." }); }
  }

  async function lookup() {
    const query = word.trim().toLowerCase();
    if (!query) { wordInput.current?.focus(); return; }
    setLookupState({ busy: true, error: "" });
    try {
      const response = await fetch(`/api/vocabulary/lookup?word=${encodeURIComponent(query)}`);
      const data = await response.json() as { error?: string; ipa?: string; meanings?: Meaning[] };
      if (!response.ok) throw new Error(data.error ?? "Chưa tra được từ này.");
      if (data.ipa && !ipa) setIpa(data.ipa);
      setMeanings((data.meanings ?? []).slice(0, 4));
      setLookupState({ busy: false, error: data.meanings?.length ? "" : "Từ điển chưa có nghĩa cho từ này." });
    } catch (cause) { setLookupState({ busy: false, error: cause instanceof Error ? cause.message : "Chưa tra được từ này." }); }
  }

  function pick(item: Meaning) {
    const known = partsOfSpeech.some(([value]) => value === item.pos.toLowerCase());
    if (item.pos) setPos(known ? item.pos.toLowerCase() : item.pos);
    if (item.definition) setDefinition(item.definition);
    if (item.meaningVi && !meaning.trim()) setMeaning(item.meaningVi.split(";")[0].trim());
    if (item.example && !example.trim()) setExample(item.example);
    setMeanings(null);
  }

  async function remove() {
    setMenu(false);
    if (!entry || !window.confirm(`Bỏ “${entry.title}” khỏi Sổ từ? Lịch ôn của từ này cũng bị xoá.`)) return;
    try { await removeEntry(entry.id); onBack(); } catch { setStatus({ tone: "error", text: "Chưa xoá được từ này." }); }
  }

  const state = wordState(review);
  return <div className="qn-word">
    <header className="qn-editor-head">
      <button type="button" className="qn-back" onClick={onBack} aria-label="Về danh sách"><ArrowLeft size={18} /></button>
      <span className="qn-kind-chip vocab">Từ vựng</span>
      {sourceLabel && entry && <Link className="qn-source" href={entry.sourcePath}><Link2 size={13} /> {sourceLabel}</Link>}
      <span className={`qn-status ${status.tone}`} role="status"><i aria-hidden="true" />{status.text}</span>
      {entry && <div className="qn-menu-wrap">
        <button type="button" className="qn-icon" aria-label="Thêm thao tác" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((value) => !value)}><MoreHorizontal size={18} /></button>
        {menu && <div className="qn-menu" role="menu" onKeyDown={(event) => { if (event.key === "Escape") setMenu(false); }}>
          <Link role="menuitem" href={`/app/vocabulary/explore?q=${encodeURIComponent(entry.title)}`}><BookOpen size={15} /> Xem chi tiết trong Sổ từ</Link>
          <button role="menuitem" type="button" className="danger" onClick={() => void remove()}><Trash2 size={15} /> Bỏ khỏi Sổ từ</button>
        </div>}
      </div>}
    </header>

    <section className="qn-word-card" aria-label="Thẻ từ">
      <div className="qn-word-main">
        <div className="qn-word-line">
          <input ref={wordInput} className="qn-word-input" value={word} maxLength={100} onChange={(event) => edit(setWord)(event.target.value)} placeholder="Nhập từ hoặc cụm từ…" aria-label="Từ hoặc cụm từ" spellCheck={false} />
          {entry ? (pos && <span className="qn-pos">{pos}</span>) : <select className="qn-pos-select" value={pos} onChange={(event) => setPos(event.target.value)} aria-label="Loại từ">
            {partsOfSpeech.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            {pos && !partsOfSpeech.some(([value]) => value === pos) && <option value={pos}>{pos}</option>}
          </select>}
        </div>
        <div className="qn-word-sound">
          <button type="button" className="qn-speak" aria-label={`Nghe phát âm ${word || "từ"}`} disabled={!word.trim()} onClick={() => void pronounce(word.trim())}><Volume2 size={16} /></button>
          {entry ? <span className="qn-ipa">{ipa || "—"}</span> : <input className="qn-ipa-input" value={ipa} maxLength={100} onChange={(event) => setIpa(event.target.value)} placeholder="/phiên âm/ · tự điền" aria-label="Phiên âm IPA" />}
          {!entry && <button type="button" className="button subtle qn-lookup" disabled={!word.trim() || lookupState.busy} onClick={() => void lookup()}><Languages size={15} /> {lookupState.busy ? "Đang tra…" : "Tra từ điển"}</button>}
        </div>
      </div>
      <div className="qn-word-state">
        <span className={`qn-state ${entry ? state : "draft"}`}>{entry ? `${wordStateLabels[state]} · trong Sổ từ` : "Chưa lưu"}</span>
        {entry && <small>{nextReviewText(review, now)}</small>}
      </div>
    </section>

    {lookupState.error && <p className="qn-hint error" role="alert">{lookupState.error}</p>}
    {meanings && meanings.length > 0 && <div className="qn-meanings" role="group" aria-label="Chọn nghĩa từ từ điển">
      <p>Chọn nghĩa phù hợp với ngữ cảnh bạn gặp:</p>
      {meanings.map((item, index) => <button type="button" key={`${item.pos}-${index}`} onClick={() => pick(item)}>
        <b>{item.pos}</b><span>{item.definition}</span>{item.meaningVi && <em>{item.meaningVi}</em>}
      </button>)}
      <button type="button" className="qn-meanings-close" onClick={() => setMeanings(null)}>Bỏ qua</button>
    </div>}

    <div className="qn-fields">
      <label><span>Nghĩa tiếng Việt <i aria-hidden="true">*</i></span><input value={meaning} maxLength={200} onChange={(event) => edit(setMeaning)(event.target.value)} placeholder="Nghĩa theo ngữ cảnh bạn gặp" required /></label>
      <label><span>Chủ đề IELTS</span>{entry ? <input value={topic || "—"} readOnly aria-readonly="true" /> : <input value={topic} maxLength={100} onChange={(event) => setTopic(event.target.value)} placeholder="VD: Environment, Education…" />}</label>
      <label className="wide"><span>Định nghĩa tiếng Anh</span>{entry ? <p className="qn-readonly">{definition || "—"}</p> : <textarea value={definition} maxLength={500} rows={2} onChange={(event) => setDefinition(event.target.value)} placeholder="Tự điền khi tra từ điển, hoặc tự viết" />}</label>
      <label className="wide"><span>Ví dụ của mình</span><textarea value={example} maxLength={500} rows={3} onChange={(event) => edit(setExample)(event.target.value)} placeholder="Tự đặt một câu dùng từ này, tốt nhất là câu bạn có thể nói trong Speaking" /></label>
    </div>

    <footer className="qn-word-foot">
      {entry ? <>
        <span>Thêm ngày {dayLabel(entry.createdAt)}</span>
        <Link className="button subtle" href={`/app/vocabulary/explore?q=${encodeURIComponent(entry.title)}`}>Chi tiết <ArrowRight size={15} /></Link>
        <Link className="button primary" href="/app/vocabulary/review"><RotateCcw size={15} /> Ôn ngay</Link>
      </> : <>
        <span>Lưu xong, từ có trong Sổ từ và phiên ôn tập.</span>
        <button type="button" className="button primary" disabled={!valid || status.tone === "saving"} onClick={() => void create()}>Lưu vào Sổ từ</button>
      </>}
    </footer>
  </div>;
}
