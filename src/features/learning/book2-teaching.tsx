"use client";

import { useState } from "react";
import Image from "next/image";
import { BookOpenText, Check, Compass, Eye, Lightbulb, ListChecks, PenLine, TriangleAlert, Volume2, X } from "lucide-react";

/** The C09 teaching layer, normalised by scripts/build-book-2.py from each lesson's self_study_v3 sidecar. */
export type Book2Teaching = {
  title_vi?: string; outcome?: string; why?: string; overview?: string; boundary?: string;
  micro_passage?: string; before_listening?: string;
  steps?: { do: string; why?: string }[];
  concepts?: { title?: string; text?: string; can_do?: string }[];
  visual?: { id?: string; title?: string; image_url?: string; headers?: string[] | null; rows?: (string | number)[][] | null } | null;
  examples?: { question?: string; predict?: string; notice?: string; source?: string; answer?: string; evidence?: string; pattern?: string; why?: string; trap?: string; try?: string }[];
  tips?: { when?: string; do?: string; why?: string; example?: string; limit?: string }[];
  mistakes?: { wrong?: string; right?: string; why?: string; check?: string }[];
  vocabulary?: { term: string; pos?: string; meaning?: string; example?: string; example_vi?: string }[];
  guided?: { title?: string; do?: string; hint?: string; pass?: string; feedback?: string; model?: string }[];
  note_map?: { label?: string; note?: string; sentence?: string }[];
  self_check?: string[];
  coach?: { trigger?: string; stage?: string; message?: string; example?: string }[];
  review_days?: number[];
};

type Speak = (text: string) => void;
export type CoachKind = "help" | "vocab" | "hint" | "wrong" | "review" | "praise";

/** Groups the package's coach triggers into the moments the lesson knows about. */
export function teachingCoach(teaching: Book2Teaching | undefined, kind: CoachKind) {
  const of = (trigger = "") => /vocab/.test(trigger) ? "vocab" : /guided_hint|requests_guided/.test(trigger) ? "hint"
    : /correct_twice/.test(trigger) ? "praise"
      : /wrong|error|mistake|distractor|cannot_locate|missing|wrong_visual/.test(trigger) ? "wrong"
        : /submission|review|after|completes|revision/.test(trigger) ? "review" : "help";
  return (teaching?.coach ?? []).filter((item) => item.message && of(item.trigger) === kind).map((item) => item.example ? `${item.message} Ví dụ: ${item.example}` : item.message!);
}

function Block({ icon: Icon, title, note, children }: { icon: typeof BookOpenText; title: string; note?: string; children: React.ReactNode }) {
  return <section className="b2-block"><h2><span className="b2-block-icon"><Icon size={18} /></span> {title}{note && <small>{note}</small>}</h2>{children}</section>;
}

/** A worked example: think first, then reveal the answer, evidence and the reason it works. */
function ExampleCard({ example, index, speak }: { example: NonNullable<Book2Teaching["examples"]>[number]; index: number; speak: Speak }) {
  const [open, setOpen] = useState(false);
  return <article className={`b2-example ${open ? "is-open" : ""}`}>
    <header><span className="b2-card-number">{index + 1}</span><div><small>VÍ DỤ MẪU</small><strong>{example.question}</strong></div></header>
    {example.predict && <p className="b2-example-predict"><Compass size={15} /> {example.predict}</p>}
    {example.notice && <p className="b2-example-predict"><Eye size={15} /> {example.notice}</p>}
    {example.source && <blockquote className="b2-example-source"><button type="button" className="b2-say" onClick={() => speak(example.source!)} aria-label="Nghe đoạn nguồn"><Volume2 size={15} /></button><span>{example.source}</span></blockquote>}
    {example.answer && !open && <button type="button" className="b2-btn b2-btn-ghost b2-example-reveal" onClick={() => setOpen(true)}>Tự nghĩ đáp án, rồi xem lời giải</button>}
    {open && <div className="b2-example-answer">
      <p className="b2-right"><Check size={16} /> {example.answer}</p>
      {example.pattern && <p className="b2-example-line"><b>Khung:</b> {example.pattern}</p>}
      {example.evidence && <p className="b2-example-line"><b>Bằng chứng:</b> “{example.evidence}”</p>}
      {example.why && <p className="b2-example-line"><b>Vì sao:</b> {example.why}</p>}
      {example.trap && <p className="b2-wrong-note"><TriangleAlert size={15} /> {example.trap}</p>}
      {example.try && <p className="b2-example-line"><b>Thử ngay:</b> {example.try}</p>}
    </div>}
  </article>;
}

/** Vocabulary card with part of speech, meaning, an example and its Vietnamese translation. */
function TermCard({ item, speak }: { item: NonNullable<Book2Teaching["vocabulary"]>[number]; speak: Speak }) {
  const [flipped, setFlipped] = useState(false);
  return <div className={`b2-word ${flipped ? "is-flipped" : ""}`}>
    <button type="button" className="b2-word-face" onClick={() => setFlipped((value) => !value)} aria-pressed={flipped}>
      {flipped ? <><span className="b2-word-meaning">{item.meaning}</span>{item.example && <small>{item.example}</small>}{item.example_vi && <small className="b2-word-vi">{item.example_vi}</small>}</>
        : <><strong>{item.term}</strong>{item.pos && <em className="b2-word-pos">{item.pos}</em>}<small>Bấm để xem nghĩa và ví dụ</small></>}
    </button>
    <button type="button" className="b2-word-say" onClick={() => speak(item.example && flipped ? item.example : item.term)} aria-label={`Nghe ${item.term}`}><Volume2 size={16} /></button>
  </div>;
}

/** Learn-step blocks for a lesson that has the C09 teaching layer. */
export function TeachingLearn({ teaching, speak, guidedDone, toggleGuided }: { teaching: Book2Teaching; speak: Speak; guidedDone: (index: number) => boolean; toggleGuided: (index: number) => void }) {
  const [shownFeedback, setShownFeedback] = useState<Record<number, boolean>>({});
  const vocabularyPages = Array.from({ length: Math.ceil((teaching.vocabulary?.length ?? 0) / 8) }, (_, index) => teaching.vocabulary!.slice(index * 8, (index + 1) * 8));
  return <>
    {(teaching.overview || teaching.steps?.length) && <Block icon={ListChecks} title="Cách làm từng bước">
      {teaching.overview && <p className="b2-lead">{teaching.overview}</p>}
      {teaching.steps?.length ? <ol className="b2-steps-list">{teaching.steps.map((item, index) => <li key={index}><span>{index + 1}</span><div><strong>{item.do}</strong>{item.why && <small>{item.why}</small>}</div></li>)}</ol> : null}
    </Block>}

    {teaching.concepts?.length ? <Block icon={BookOpenText} title="Hiểu sâu"><div className="b2-cards">{teaching.concepts.map((item, index) => <article className="b2-card" key={index}><span className="b2-card-number">{index + 1}</span>{item.title && <h3>{item.title}</h3>}<p>{item.text}</p>{item.can_do && <p className="b2-can-do"><Check size={15} /> {item.can_do}</p>}</article>)}</div></Block> : null}

    {teaching.boundary && <p className="b2-callout"><TriangleAlert size={18} /> <span><b>Lưu ý:</b> {teaching.boundary}</span></p>}

    {teaching.visual && <Block icon={PenLine} title="Biểu đồ dùng trong phần học" note="Số liệu mô phỏng để luyện tập">
      <div className="book2-card">{teaching.visual.image_url && <Image className="book2-visual" src={teaching.visual.image_url} alt={teaching.visual.title ?? "Biểu đồ luyện tập"} width={900} height={520} unoptimized />}
        {teaching.visual.rows?.length ? <div className="book2-table-wrap"><table><thead><tr>{teaching.visual.headers?.map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{teaching.visual.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : null}</div>
    </Block>}

    {(teaching.micro_passage || teaching.before_listening) && <p className="b2-callout is-info"><Compass size={18} /> <span>{teaching.before_listening ? <><b>Trước khi nghe:</b> {teaching.before_listening}</> : <><b>Đoạn đọc ngắn để thử:</b> {teaching.micro_passage}</>}</span></p>}

    {teaching.examples?.length ? <Block icon={Eye} title="Ví dụ mẫu" note="Tự nghĩ trước, rồi mới mở lời giải"><div className="b2-examples">{teaching.examples.map((item, index) => <ExampleCard key={index} example={item} index={index} speak={speak} />)}</div></Block> : null}

    {teaching.note_map?.length ? <Block icon={PenLine} title="Ghi chú một phút cho Part 2"><div className="b2-notes">{teaching.note_map.map((item, index) => <article key={index}><small>{item.label}</small><strong>{item.note}</strong>{item.sentence && <p>{item.sentence}</p>}</article>)}</div></Block> : null}

    {teaching.tips?.length ? <Block icon={Lightbulb} title="Mẹo làm bài"><ol className="b2-tips">{teaching.tips.map((item, index) => <li key={index}>{item.when && <small className="b2-tip-when">{item.when}</small>}<strong>{item.do}</strong>{item.why && <span>{item.why}</span>}{item.example && <em>{item.example}</em>}{item.limit && <span className="b2-tip-limit">Không dùng khi: {item.limit}</span>}</li>)}</ol></Block> : null}

    {teaching.mistakes?.length ? <Block icon={TriangleAlert} title="Lỗi thường gặp"><div className="b2-mistakes">{teaching.mistakes.map((item, index) => <article key={index}>{item.wrong && <p className="b2-wrong"><X size={16} /> {item.wrong}</p>}{item.right && <p className="b2-right"><Check size={16} /> {item.right}</p>}{item.why && <small>{item.why}</small>}{item.check && <small className="b2-mistake-check">Tự kiểm tra: {item.check}</small>}</article>)}</div></Block> : null}

    {teaching.vocabulary?.length ? <Block icon={Volume2} title="Từ và cụm từ cần dùng" note={`${teaching.vocabulary.length} thẻ · bấm để lật`}>{vocabularyPages.map((items, page) => <details className="b2-deck" key={page} open={page === 0}><summary>Bộ thẻ {page + 1} · {items.length} từ</summary><div className="b2-words">{items.map((item) => <TermCard key={item.term} item={item} speak={speak} />)}</div></details>)}</Block> : null}

    {teaching.guided?.length ? <Block icon={ListChecks} title="Luyện có hướng dẫn" note={`${teaching.guided.filter((_, index) => guidedDone(index)).length}/${teaching.guided.length} bước`}>
      <ol className="b2-guided">{teaching.guided.map((item, index) => <li key={index} className={guidedDone(index) ? "is-done" : ""}>
        <button type="button" className="b2-guided-check" aria-pressed={guidedDone(index)} onClick={() => toggleGuided(index)} aria-label={guidedDone(index) ? "Bỏ đánh dấu bước này" : "Đánh dấu đã làm bước này"}>{guidedDone(index) ? <Check size={16} strokeWidth={3} /> : index + 1}</button>
        <div>{item.title && <small>{item.title}</small>}<strong>{item.do}</strong>{item.hint && <span>{item.hint}</span>}{item.pass && <span className="b2-guided-pass">Đạt khi: {item.pass}</span>}
          {(item.feedback || item.model) && (shownFeedback[index] ? <div className="b2-guided-feedback">{item.model && <p>{item.model}</p>}{item.feedback && <p>{item.feedback}</p>}</div> : <button type="button" className="b2-coach-link" onClick={() => setShownFeedback((value) => ({ ...value, [index]: true }))}>Xem phản hồi mẫu</button>)}
        </div>
      </li>)}</ol>
    </Block> : null}
  </>;
}
