"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowLeftRight, ArrowRight, Bell, Bookmark, Check, Eye, EyeOff, Headphones, Highlighter, Menu, MessageSquareText, Play, Send, Volume2, Wifi, X } from "lucide-react";
import type { ExamContent, ExamQuestion } from "@/lib/ielts-bank/schema";
import { RichText, type BankExam } from "./bank-exam";
import { groupQuestions, optionKey, optionLabel, QuestionGroupView, richBlocks, type AnswerProps, type QuestionGroup } from "./bank-questions";
import { HeadingDrop, printedListeningLayout } from "./bank-test";
import { encodeReadingMarks, encodeReadingNotes, rangeAt, savedReadingMarks, savedReadingNotes, textOffset, type ReadingMark, type ReadingNote } from "./reading-highlights";
import "./bank-exam-sheet.css";

type CaretDocument = Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
type Tool = { x: number; y: number; kind: "select" } | { x: number; y: number; kind: "mark"; mark: ReadingMark };
const canPaint = () => typeof window !== "undefined" && "Highlight" in window && Boolean((CSS as unknown as { highlights?: unknown }).highlights);
const sameSpot = (a: ReadingMark, b: ReadingMark) => a.section === b.section && a.pane === b.pane && a.block === b.block && a.start === b.start && a.end === b.end;

/**
 * Reading in the real-test view, laid out like the computer-delivered IELTS
 * test: a plain header with the minutes left, a grey part bar, the passage and
 * questions side by side, a Note/Highlight bar on selected text, a bookmark to
 * flag the current question, the numbered question strip and a tick that leads
 * to the "Click next to continue" screen. Nothing here coaches the learner.
 *
 * Listening uses the same sheet without the passage: the questions fill the
 * screen, the recording plays once from a "click Play" gate, runs on into the
 * next part, and cannot be paused or rewound; the header's "Audio player"
 * chip only opens the volume control.
 */
export function ExamSheet({ exam, content, scope, answers, setAnswer, flags, setFlags, notes, setNotes, remaining, busy, onSubmit, onExit }: {
  exam: BankExam;
  content: ExamContent;
  scope: string[] | null;
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  flags: string[];
  setFlags: (flags: string[]) => void;
  notes: Record<string, string>;
  setNotes: Dispatch<SetStateAction<Record<string, string>>>;
  remaining: number;
  busy: boolean;
  onSubmit: () => void;
  onExit: () => void;
}) {
  const sections = useMemo(() => content.sections.filter((section) => section.questions.length && (!scope || section.questions.some((question) => scope.includes(question.id)))), [content, scope]);
  const numbers = useMemo(() => new Map(content.sections.flatMap((section) => section.questions).map((question) => [question.id, question.number])), [content]);
  const [part, setPart] = useState(0);
  const [split, setSplit] = useState(50);
  const [current, setCurrent] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [flagTop, setFlagTop] = useState<number | null>(null);
  const passage = useRef<HTMLElement>(null);
  const questionPane = useRef<HTMLDivElement>(null);
  const questionInner = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const listening = exam.skill === "Listening";
  const audio = useRef<HTMLAudioElement>(null);
  const listOf = (key: string) => (notes[key] || "").split(",").filter(Boolean);
  const played = listOf("listening_played"), finished = listOf("listening_finished");
  // The part being heard: the first part whose recording has not finished.
  const playing = Math.max(0, sections.findIndex((item) => !finished.includes(item.id)));
  const heard = sections[playing];
  const allHeard = listening && sections.every((item) => finished.includes(item.id));
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [audioError, setAudioError] = useState("");
  const savedSecond = useRef(0);
  const section = sections[Math.min(part, sections.length - 1)];
  const groups = useMemo(() => groupQuestions(section?.questions ?? []), [section]);
  const marks = useMemo(() => savedReadingMarks(notes.reading_highlights), [notes.reading_highlights]);
  const pinned = useMemo(() => savedReadingNotes(notes.reading_notes), [notes.reading_notes]);
  const setMarks = (next: ReadingMark[]) => { const encoded = encodeReadingMarks(next); if (encoded.length <= 14000) setNotes((value) => ({ ...value, reading_highlights: encoded })); };
  const setPinned = useCallback((next: ReadingNote[]) => { const encoded = encodeReadingNotes(next); if (encoded.length <= 14000) setNotes((value) => ({ ...value, reading_notes: encoded })); }, [setNotes]);

  const scopedPart = Number(notes.__part);
  const partNumber = (index: number) => sections.length === 1 && Number.isInteger(scopedPart) && scopedPart > 0 ? scopedPart : content.sections.indexOf(sections[index]) + 1;
  /** "Choose TWO" pairs share one step on the strip, labelled like "23-24". */
  const stepsFor = useCallback((questions: ExamQuestion[]) => {
    const steps: { ids: string[]; label: string }[] = [];
    for (const question of questions) {
      const last = steps.at(-1);
      if (question.group && last && questions.find((item) => item.id === last.ids[0])?.group === question.group) { last.ids.push(question.id); continue; }
      steps.push({ ids: [question.id], label: "" });
    }
    return steps.map((step) => { const first = numbers.get(step.ids[0]) ?? 0, last = numbers.get(step.ids.at(-1)!) ?? first; return { ...step, label: first === last ? String(first) : `${first}-${last}` }; });
  }, [numbers]);
  const allSteps = useMemo(() => sections.flatMap((item, index) => stepsFor(item.questions).map((step) => ({ ...step, part: index }))), [sections, stepsFor]);
  const answered = (ids: string[]) => ids.some((id) => answers[id]);

  const goTo = useCallback((index: number, id?: string) => {
    const changed = index !== part;
    setPart(index);
    setEnded(false);
    setTool(null);
    setCurrent(id ?? null);
    if (changed) setHeld(null);
    window.setTimeout(() => {
      if (changed) passage.current?.scrollTo({ top: 0 });
      const pane = questionPane.current;
      const target = id ? document.getElementById(`q-${id}`) : null;
      if (!pane) return;
      if (!target) { pane.scrollTo({ top: 0 }); return; }
      pane.scrollTo({ top: target.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - pane.clientHeight / 3, behavior: "smooth" });
      const input = (target.matches("input") ? target : target.querySelector("input:not([type=radio]):not([type=checkbox])")) as HTMLInputElement | null;
      input?.focus({ preventScroll: true });
    }, 40);
  }, [part]);
  const step = (direction: 1 | -1) => {
    // From the end screen, back returns to the last question.
    if (ended) { if (direction < 0 && allSteps.length) { const lastStep = allSteps.at(-1)!; goTo(lastStep.part, lastStep.ids[0]); } return; }
    const at = allSteps.findIndex((item) => current && item.ids.includes(current));
    const next = allSteps[at < 0 ? (direction > 0 ? allSteps.findIndex((item) => item.part === part) : -1) : at + direction];
    if (next) goTo(next.part, next.ids[0]);
  };

  // Paint highlights and noted text, as two highlight colours, without touching the answer controls.
  useEffect(() => {
    if (!canPaint() || !questionPane.current || !section || ended) return;
    const blocks = { passage: passage.current?.querySelectorAll<HTMLElement>("[data-paragraph]") ?? ([] as unknown as NodeListOf<HTMLElement>), questions: questionPane.current.querySelectorAll<HTMLElement>("[data-highlight-block]") };
    const toRanges = (items: ReadingMark[]) => items.filter((item) => item.section === section.id).map((item) => { const block = blocks[item.pane][item.block]; return block ? rangeAt(block, item.start, item.end) : null; }).filter((range): range is Range => Boolean(range));
    const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    const Highlight = (window as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
    registry.set("cd-mark", new Highlight(...toRanges(marks)));
    registry.set("cd-note", new Highlight(...toRanges(showNotes ? pinned : [])));
    return () => { registry.delete("cd-mark"); registry.delete("cd-note"); };
  }, [marks, pinned, showNotes, section, answers, split, ended]);

  // The bookmark sits at the end of the current question's row, inside the scrolling pane.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = current ? document.getElementById(`q-${current}`) : null;
      const row = target?.closest(".bq-question, .bq-gap-row, tr, .bq-many-set, .bq-slot") ?? target;
      const inner = questionInner.current;
      setFlagTop(row && inner ? row.getBoundingClientRect().top - inner.getBoundingClientRect().top + 2 : null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current, answers, split, part, ended]);

  useEffect(() => {
    if (!tool) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".cd-tool")) setTool(null); };
    const panes = [passage.current, questionPane.current];
    const onScroll = () => setTool(null);
    document.addEventListener("mousedown", close);
    panes.forEach((pane) => pane?.addEventListener("scroll", onScroll, { passive: true }));
    return () => { document.removeEventListener("mousedown", close); panes.forEach((pane) => pane?.removeEventListener("scroll", onScroll)); };
  }, [tool]);

  /** The selected text, split into passage paragraphs or question blocks, as saved positions. */
  const captured = (): ReadingMark[] => {
    const chosen = window.getSelection();
    if (!chosen || chosen.isCollapsed || !questionPane.current || !section) return [];
    const range = chosen.getRangeAt(0);
    const pane = passage.current?.contains(range.commonAncestorContainer) ? "passage" : questionPane.current.contains(range.commonAncestorContainer) ? "questions" : null;
    if (!pane) return [];
    const blocks = (pane === "passage" ? passage.current! : questionPane.current).querySelectorAll<HTMLElement>(pane === "passage" ? "[data-paragraph]" : "[data-highlight-block]");
    const out: ReadingMark[] = [];
    blocks.forEach((block, index) => {
      if (!range.intersectsNode(block)) return;
      const whole = document.createRange();
      whole.selectNodeContents(block);
      const portion = range.cloneRange();
      if (portion.compareBoundaryPoints(Range.START_TO_START, whole) < 0) portion.setStart(whole.startContainer, whole.startOffset);
      if (portion.compareBoundaryPoints(Range.END_TO_END, whole) > 0) portion.setEnd(whole.endContainer, whole.endOffset);
      const start = textOffset(block, portion.startContainer, portion.startOffset), end = textOffset(block, portion.endContainer, portion.endOffset);
      if (end > start) out.push({ section: section.id, pane, block: index, start, end, quote: portion.toString().slice(0, 180) });
    });
    return out;
  };

  /** Where a plain click landed: a highlight or a note under the pointer, if any. */
  const hitAt = (x: number, y: number) => {
    if (!questionPane.current || !section) return null;
    const caret = document as CaretDocument;
    const position = caret.caretPositionFromPoint?.(x, y);
    const range = position ? null : caret.caretRangeFromPoint?.(x, y);
    const node = position?.offsetNode ?? range?.startContainer;
    const element = node ? (node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element) : null;
    const inPassage = Boolean(element && passage.current?.contains(element));
    const pane: ReadingMark["pane"] | null = inPassage ? "passage" : element && questionPane.current.contains(element) ? "questions" : null;
    const selector = inPassage ? "[data-paragraph]" : "[data-highlight-block]";
    const block = element?.closest<HTMLElement>(selector);
    if (!node || !pane || !block) return null;
    const index = [...(inPassage ? passage.current! : questionPane.current).querySelectorAll(selector)].indexOf(block);
    const at = textOffset(block, node, position?.offset ?? range?.startOffset ?? 0);
    const inside = (item: ReadingMark) => item.section === section.id && item.pane === pane && item.block === index && at >= item.start && at <= item.end;
    return { note: pinned.find(inside), mark: marks.find(inside) };
  };

  const onPointerUp = (x: number, y: number, target: EventTarget | null) => {
    if ((target as HTMLElement | null)?.closest?.("input,button,label,select,textarea,.bt-heading-drop")) return;
    const chosen = window.getSelection();
    if (chosen && !chosen.isCollapsed) {
      const box = chosen.getRangeAt(0).getBoundingClientRect();
      if (captured().length) setTool({ kind: "select", x: box.left, y: box.bottom + 6 });
      return;
    }
    const hit = hitAt(x, y);
    if (hit?.note) { setNotesOpen(true); setShowNotes(true); setFocusNote(hit.note.id); setTool(null); return; }
    setTool(hit?.mark ? { kind: "mark", mark: hit.mark, x, y: y + 12 } : null);
  };

  const highlight = () => {
    const items = captured();
    if (items.length) setMarks([...marks, ...items.filter((item) => !marks.some((mark) => sameSpot(mark, item)))]);
    window.getSelection()?.removeAllRanges();
    setTool(null);
  };
  const addNote = () => {
    const items = captured();
    if (!items.length) return;
    const id = `n${Date.now().toString(36)}`;
    // A note is anchored to the first paragraph the selection touches; its quote keeps the whole selection.
    setPinned([...pinned, { ...items[0], id, text: "", quote: items.map((item) => item.quote).join(" ").slice(0, 180) }]);
    window.getSelection()?.removeAllRanges();
    setTool(null);
    setNotesOpen(true);
    setShowNotes(true);
    setFocusNote(id);
  };
  // An empty note means nothing: it goes when the panel is put away.
  const closeNotes = () => { setNotesOpen(false); setFocusNote(null); if (pinned.some((item) => !item.text.trim())) setPinned(pinned.filter((item) => item.text.trim())); };

  const resize = (clientX: number) => {
    if (!body.current) return;
    const bounds = body.current.getBoundingClientRect();
    setSplit(Math.round(Math.max(25, Math.min(75, ((clientX - bounds.left) / bounds.width) * 100))));
  };

  const addTo = (key: string, id: string) => setNotes((value) => ({ ...value, [key]: [...new Set([...(value[key] || "").split(",").filter(Boolean), id])].join(",") }));
  const startAudio = () => {
    const element = audio.current;
    if (!element || !heard) return;
    setAudioError("");
    void element.play().then(() => { addTo("listening_played", heard.id); if (part !== playing) goTo(playing); }).catch(() => setAudioError("Audio could not start. Check your speakers and click Play again."));
  };

  if (!section) return null;
  const props: AnswerProps = {
    answers, setAnswer, flags,
    toggleFlag: (id) => setFlags(flags.includes(id) ? flags.filter((item) => item !== id) : [...flags, id]),
    numberOf: (id) => numbers.get(id) ?? 0,
    held, setHeld, examLook: true,
  };
  const slots = new Map<string, ExamQuestion>();
  for (const question of section.questions) {
    const letter = /matching[_-]headings/.test(question.type) ? /^\s*paragraph\s+([A-Z])\s*$/i.exec(question.prompt)?.[1] : undefined;
    if (letter && question.options.length) slots.set(letter.toUpperCase(), question);
  }
  const headingKey = (question: ExamQuestion) => groups.find((group) => group.questions.includes(question))?.key ?? "";
  const heldFor = (question: ExamQuestion) => { const key = headingKey(question); return key && held?.startsWith(`${key}:`) ? held.slice(key.length + 1) : null; };
  const first = numbers.get(section.questions[0].id) ?? 1, last = numbers.get(section.questions.at(-1)!.id) ?? first;
  const currentFlagged = Boolean(current && flags.includes(current));
  const minutes = Math.max(0, Math.ceil(remaining / 60));

  return <div className={`cd-sheet ${notesOpen ? "has-notes" : ""}`} style={{ "--cd-left": `${split}%` } as CSSProperties}>
    <div className="cd-col">
    <header className="cd-header">
      <button type="button" className="cd-brand" onClick={onExit} title="Lưu và rời bài"><span>Ielts</span><b>WithHarry</b></button>
      <div className="cd-title"><strong>{exam.title}</strong><div className="cd-title-row">
        {listening && <div className="cd-audio-chip"><button type="button" onClick={() => setVolumeOpen(!volumeOpen)} aria-expanded={volumeOpen} title="Âm lượng"><Volume2 size={14} /> Audio player</button>
          {volumeOpen && <label className="cd-volume"><span className="sr-only">Volume</span><input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (audio.current) audio.current.volume = value; }} /></label>}
        </div>}
        <span role="timer" aria-live="off">{remaining > 0 ? `${minutes} minute${minutes === 1 ? "" : "s"} remaining` : "Time is up"}</span>
      </div></div>
      <div className="cd-icons"><Wifi size={24} aria-hidden="true" /><Bell size={24} aria-hidden="true" /><button type="button" onClick={() => notesOpen ? closeNotes() : setNotesOpen(true)} aria-label="Ghi chú" aria-pressed={notesOpen}><Menu size={24} /></button></div>
    </header>

    <div className="cd-main">
      {ended ? <div className="cd-end"><span>Click next to continue</span><button type="button" onClick={onSubmit} disabled={busy}><Send size={18} /> {busy ? "Submitting…" : "Next"}</button></div> : <>
        <div className="cd-part"><strong>Part {partNumber(part)}</strong><span>{listening ? "Listen and answer" : "Read the text and answer"} questions {first}-{last}</span></div>
        <div className={`cd-body ${listening ? "is-listening" : ""}`} ref={body}>
          {!listening && <><article className="cd-passage" ref={passage} onMouseUp={(event) => onPointerUp(event.clientX, event.clientY, event.target)}>
            <h2>{section.title}</h2>
            {section.passage.split(/\n\s*\n/).map((paragraph, index) => {
              const letter = /^\s*\*\*([A-Z])\*\*/.exec(paragraph)?.[1];
              const slot = letter ? slots.get(letter) : undefined;
              return <Fragment key={index}>
                {slot && <HeadingDrop question={slot} number={numbers.get(slot.id) ?? 0} value={answers[slot.id] || ""} held={heldFor(slot)} onPlace={(key) => { setAnswer(slot.id, key); setHeld(null); }} onClear={() => setAnswer(slot.id, "")} onLocate={() => goTo(part, slot.id)} />}
                <p data-paragraph={index}><RichText text={paragraph} /></p>
              </Fragment>;
            })}
          </article>
          <div className="cd-divider" role="separator" aria-label="Độ rộng bài đọc" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={split} tabIndex={0}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); resize(event.clientX); }}
            onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }}
            onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit((value) => Math.max(25, Math.min(75, value + (event.key === "ArrowRight" ? 5 : -5)))); } }}>
            <span><ArrowLeftRight size={18} /></span>
          </div></>}
          <div className="cd-questions" ref={questionPane} onMouseUp={(event) => onPointerUp(event.clientX, event.clientY, event.target)}
            onFocus={(event) => { const id = (event.target as HTMLElement).closest("[id^='q-']")?.id.slice(2); if (id) setCurrent(id); }}
            onClick={(event) => { const id = (event.target as HTMLElement).closest("[id^='q-']")?.id.slice(2); if (id) setCurrent(id); }}>
            <div className="cd-q-inner" ref={questionInner}>
              {groups.map((group) => pairedRuns(group) ? <Fragment key={group.key}>{pairedRuns(group)!.map((run) => <ChooseMany key={run[0].id} group={group} questions={run} props={props} />)}</Fragment> : <QuestionGroupView key={group.key} group={group} props={props} printed={listening && (group.kind === "gap" || /flow[_-]?chart[_-]completion/.test(group.type)) ? printedListeningLayout(section.passage, group.questions.map((question) => numbers.get(question.id) ?? question.number), group.kind === "pick") : undefined} />)}
              {current && flagTop !== null && <button type="button" className={`cd-flag ${currentFlagged ? "is-on" : ""}`} style={{ top: flagTop }} onClick={() => props.toggleFlag(current)} aria-pressed={currentFlagged} aria-label={currentFlagged ? "Bỏ đánh dấu xem lại" : "Đánh dấu xem lại"}><Bookmark size={18} fill={currentFlagged ? "currentColor" : "none"} /></button>}
            </div>
          </div>
        </div>
      </>}
    </div>

    {tool && <div className="cd-tool" style={{ left: tool.x, top: tool.y }} role="toolbar" aria-label="Công cụ văn bản">
      {tool.kind === "select" ? <>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={addNote}><MessageSquareText size={18} />Note</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={highlight}><Highlighter size={18} />Highlight</button>
      </> : <button type="button" onClick={() => { setMarks(marks.filter((mark) => !sameSpot(mark, tool.mark))); setTool(null); }}><X size={18} />Clear</button>}
    </div>}

    {listening && heard?.audioUrl && <audio key={heard.id} ref={audio} src={heard.audioUrl} preload="auto"
      onLoadedMetadata={(event) => { const at = Number(notes[`listening_position_${heard.id}`]) || 0; savedSecond.current = at; event.currentTarget.volume = volume; if (played.includes(heard.id) && at > 0) event.currentTarget.currentTime = Math.min(at, Math.max(0, event.currentTarget.duration - 1)); if (played.includes(heard.id)) void event.currentTarget.play().catch(() => undefined); }}
      onTimeUpdate={(event) => { const at = Math.floor(event.currentTarget.currentTime / 5) * 5; if (at > savedSecond.current) { savedSecond.current = at; setNotes((value) => ({ ...value, [`listening_position_${heard.id}`]: String(at) })); } }}
      onEnded={() => { addTo("listening_finished", heard.id); const next = sections[playing + 1]; if (next) { addTo("listening_played", next.id); goTo(playing + 1); } }} />}
    {listening && heard && !played.includes(heard.id) && !allHeard && !ended && <div className="cd-audio-gate" role="dialog" aria-modal="true" aria-labelledby="cd-audio-gate-title">
      <div><Headphones size={64} strokeWidth={1.6} /><p id="cd-audio-gate-title">You will be listening to an audio clip during this test. You will not be permitted to pause or rewind the audio while answering the questions.</p><p>To continue, click Play</p><button type="button" onClick={startAudio}><Play size={18} fill="currentColor" /> Play</button>{audioError && <small role="alert">{audioError}</small>}</div>
    </div>}
    {listening && heard && !heard.audioUrl && <p className="cd-audio-missing" role="status">This part has no recording yet.</p>}

    <div className="cd-arrows">
      <button type="button" className="is-prev" onClick={() => step(-1)} aria-label="Câu trước"><ArrowLeft size={30} /></button>
      <button type="button" className="is-next" onClick={() => step(1)} aria-label="Câu sau"><ArrowRight size={30} /></button>
    </div>

    <footer className="cd-footer">
      <nav className="cd-strip" aria-label="Câu hỏi">{sections.map((item, index) => {
        const steps = stepsFor(item.questions);
        const done = item.questions.filter((question) => answers[question.id]).length;
        if (index !== part || ended) return <button type="button" key={item.id} className="cd-part-fold" onClick={() => goTo(index)}><b>Part {partNumber(index)}</b> <span>{done} of {item.questions.length}</span></button>;
        return <div key={item.id} className="cd-part-open"><b>Part {partNumber(index)}</b>{steps.map((entry) => <button type="button" key={entry.ids[0]}
          className={`${answered(entry.ids) ? "is-answered" : ""} ${entry.ids.some((id) => flags.includes(id)) ? "is-flagged" : ""} ${current && entry.ids.includes(current) ? "is-current" : ""}`}
          onClick={() => goTo(index, entry.ids[0])}
          aria-label={`Câu ${entry.label}${answered(entry.ids) ? ", đã trả lời" : ""}${entry.ids.some((id) => flags.includes(id)) ? ", đã đánh dấu" : ""}`}>{entry.label}</button>)}</div>;
      })}</nav>
      <button type="button" className={`cd-submit ${ended ? "is-on" : ""}`} onClick={() => { setEnded(true); setTool(null); }} aria-label="Kết thúc bài làm"><Check size={24} /></button>
    </footer>
    </div>
      {notesOpen && <aside className="cd-notes" aria-label="Ghi chú">
        <header><span>Note</span><button type="button" onClick={() => setShowNotes(!showNotes)} aria-label={showNotes ? "Ẩn tô ghi chú" : "Hiện tô ghi chú"}>{showNotes ? <Eye size={18} /> : <EyeOff size={18} />}</button><button type="button" onClick={closeNotes} aria-label="Đóng ghi chú"><X size={18} /></button></header>
        {!pinned.length && <p className="cd-notes-empty">Select text in the passage and choose Note.</p>}
        {pinned.map((item) => <div key={item.id} className="cd-note">
          <p><b>Part {partNumber(Math.max(0, sections.findIndex((entry) => entry.id === item.section)))}</b> {item.quote}</p>
          <textarea value={item.text} autoFocus={focusNote === item.id} maxLength={600} onChange={(event) => setPinned(pinned.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry))} />
          <button type="button" onClick={() => setPinned(pinned.filter((entry) => entry.id !== item.id))}>DELETE</button>
        </div>)}
      </aside>}
  </div>;
}

/** "Choose TWO" items stored as one letter per question, grouped by their shared `group`; null for any other block. */
function pairedRuns(group: QuestionGroup) {
  if (group.questions.length < 2 || !group.questions.every((question) => question.group && question.options.length)) return null;
  const runs: ExamQuestion[][] = [];
  for (const question of group.questions) {
    const last = runs.at(-1);
    if (last && last[0].group === question.group) last.push(question); else runs.push([question]);
  }
  return runs.every((run) => run.length > 1) ? runs : null;
}

/**
 * One "Choose TWO" item as the test prints it: a single numbered stem ("25-26")
 * over a list of checkboxes. Each tick fills the next free question of the
 * pair, so scoring still sees one letter per question.
 */
function ChooseMany({ group, questions, props }: { group: QuestionGroup; questions: ExamQuestion[]; props: AnswerProps }) {
  const ids = questions.map((question) => question.id);
  const picked = ids.map((id) => props.answers[id]).filter(Boolean);
  const first = props.numberOf(ids[0]), last = props.numberOf(ids.at(-1)!);
  const toggle = (key: string) => {
    const holder = ids.find((id) => props.answers[id] === key);
    if (holder) { props.setAnswer(holder, ""); return; }
    const free = ids.find((id) => !props.answers[id]);
    if (free) props.setAnswer(free, key);
  };
  return <section className="bq-group cd-many" aria-label={`Questions ${first} and ${last}`}>
    <h3 data-highlight-block>Questions {first} and {last}</h3>
    {group.instructions && <div className="bq-instructions">{richBlocks(group.instructions, () => <span className="bq-blank" />)}</div>}
    <div className={`bq-question ${picked.length ? "is-answered" : ""}`} id={`q-${ids[0]}`}>
      <div className="bq-stem"><span className="bq-no">{first}-{last}</span><div><p data-highlight-block>{questions[0].prompt}</p></div></div>
      <div className="bq-many-options" role="group" aria-label={`Chọn ${ids.length} đáp án cho câu ${first}-${last}`}>{questions[0].options.map((option) => {
        const key = optionKey(option), on = picked.includes(key);
        return <label key={key} className={on ? "is-on" : ""}><input type="checkbox" checked={on} disabled={!on && picked.length >= ids.length} onChange={() => toggle(key)} /><span>{optionLabel(option)}</span></label>;
      })}</div>
    </div>
  </section>;
}
