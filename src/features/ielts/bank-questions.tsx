"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Flag } from "lucide-react";
import type { ExamQuestion } from "@/lib/ielts-bank/schema";

export type AnswerProps = {
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  flags: string[];
  toggleFlag: (id: string) => void;
  /** Number shown to the learner for each question id (1-based, across the whole test). */
  numberOf: (id: string) => number;
};

/** "A — Naysmith" → A, "iii — A short day" → iii, " — B. text" → B, "C. text" → C; the key is what gets scored. */
export function optionKey(option: string) {
  const text = option.trim();
  const dashed = /^([A-Za-z]{1,2}|[ivxlc]{1,6})\s+—/.exec(text);
  if (dashed) return dashed[1];
  const lead = /^—\s*([A-Z])\.\s/.exec(text);
  if (lead) return lead[1];
  const dotted = /^([A-Z])\.\s/.exec(text);
  if (dotted) return dotted[1];
  return text;
}

export function optionLabel(option: string) {
  const text = option.trim();
  return text.replace(/^([A-Za-z]{1,2}|[ivxlc]{1,6})\s+—\s*/, "").replace(/^—\s*[A-Z]\.\s*/, "").replace(/^[A-Z]\.\s+/, "");
}

const GAP = /\{\{gap[^}]*\}\}|_{3,}/;

type Kind = "judge" | "choice" | "many" | "matrix" | "pick" | "gap";
function kindOf(question: ExamQuestion): Kind {
  const type = question.type;
  if (/true[_-]false|yes[_-]no/.test(type)) return "judge";
  if (/multiple[_-]answers/.test(type)) return "many";
  if (!question.options.length) return "gap";
  if (/multiple[_-]choice/.test(type) && !/^[A-Z]$/.test(optionLabel(question.options[0]))) return "choice";
  if (/matching[_-]information|labell?ing|multiple[_-]choice/.test(type)) return "matrix";
  return "pick";
}

export type QuestionGroup = { key: string; kind: Kind; type: string; instructions: string; questions: ExamQuestion[]; options: string[] };

/** Consecutive questions sharing a type, instructions and options form one "Questions 1–7" block. */
export function groupQuestions(questions: ExamQuestion[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  for (const question of questions) {
    const kind = kindOf(question);
    const last = groups[groups.length - 1];
    const sameOptions = last && JSON.stringify(last.options) === JSON.stringify(question.options);
    if (last && last.kind === kind && last.type === question.type && (!question.instructions || question.instructions === last.instructions) && sameOptions) last.questions.push(question);
    else groups.push({ key: question.id, kind, type: question.type, instructions: question.instructions, questions: [question], options: question.options });
  }
  return groups;
}

/** Bold, line breaks, bullet lists and markdown tables, with each gap replaced by `gap(index, numberHint)`. */
function richBlocks(text: string, gap: (key: string, number?: number) => ReactNode): ReactNode {
  let gapIndex = 0;
  const inline = (line: string) => line.split(/(\*\*\d+\*\*\s*(?:\{\{gap[^}]*\}\}|_{3,})?|\{\{gap[^}]*\}\}|_{3,}|\*\*[^*]+\*\*)/g).map((part, index) => {
    const numbered = /^\*\*(\d+)\*\*\s*(\{\{gap[^}]*\}\}|_{3,})?$/.exec(part);
    if (numbered) return <Fragment key={index}>{gap(`n${numbered[1]}`, Number(numbered[1]))}</Fragment>;
    if (GAP.test(part) && /^(\{\{gap[^}]*\}\}|_{3,})$/.test(part)) return <Fragment key={index}>{gap(`g${gapIndex++}`)}</Fragment>;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        const cells = lines[index].trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        index++;
      }
      index--;
      out.push(<div className="bq-table-wrap" key={`t${index}`}><table className="bq-table"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{inline(cell)}</th> : <td key={cellIndex}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
    } else if (/^\s*[-•]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-•]\s+/.test(lines[index])) { items.push(lines[index].replace(/^\s*[-•]\s+/, "")); index++; }
      index--;
      out.push(<ul className="bq-bullets" key={`u${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>);
    } else if (line.trim()) out.push(<p key={`p${index}`}>{inline(line)}</p>);
  }
  return out;
}

function NumberBadge({ number, flagged, onFlag }: { number: number; flagged: boolean; onFlag: () => void }) {
  return <button type="button" className={`bq-no ${flagged ? "is-flagged" : ""}`} onClick={onFlag} title={flagged ? "Bỏ đánh dấu" : "Đánh dấu xem lại"} aria-label={`Câu ${number}${flagged ? ", đã đánh dấu" : ""} — bấm để đánh dấu xem lại`}>{number}{flagged && <Flag size={10} />}</button>;
}

function GapInput({ question, props, badge = true }: { question: ExamQuestion; props: AnswerProps; badge?: boolean }) {
  const number = props.numberOf(question.id);
  return <span className="bq-gap" id={`q-${question.id}`}>
    {badge && <NumberBadge number={number} flagged={props.flags.includes(question.id)} onFlag={() => props.toggleFlag(question.id)} />}
    <input value={props.answers[question.id] || ""} onChange={(event) => props.setAnswer(question.id, event.target.value)} aria-label={`Câu ${number}`} autoComplete="off" spellCheck={false} />
  </span>;
}

/** Gap questions: shared forms/tables carry numbered gaps; the rest put the gap inside their own sentence. */
function GapGroup({ group, props }: { group: QuestionGroup; props: AnswerProps }) {
  const byNumber = new Map(group.questions.map((question) => [props.numberOf(question.id), question]));
  const covered = new Set<string>();
  const carriers = group.questions.filter((question) => (question.prompt.match(/\*\*\d+\*\*/g) ?? []).length >= 2);
  for (const carrier of carriers) for (const match of carrier.prompt.matchAll(/\*\*(\d+)\*\*/g)) { const target = byNumber.get(Number(match[1])); if (target) covered.add(target.id); }
  // Numbers in a source form may be its own numbering; fall back to the order of gaps.
  const carrierBlock = (carrier: ExamQuestion) => {
    let order = group.questions.indexOf(carrier);
    return <div className="bq-sheet" key={carrier.id}>{richBlocks(carrier.prompt, (key, number) => {
      const target = number !== undefined ? byNumber.get(number) ?? group.questions[order++] : group.questions[order++];
      return target ? <GapInput question={target} props={props} /> : <span className="bq-blank" />;
    })}</div>;
  };
  return <div className="bq-gaps">
    {carriers.map(carrierBlock)}
    {group.questions.filter((question) => !covered.has(question.id) && !carriers.includes(question)).map((question) => {
      const hasGap = GAP.test(question.prompt) || /\*\*\d+\*\*/.test(question.prompt);
      const onlyGap = !question.prompt.replace(/\*\*\d+\*\*|\{\{gap[^}]*\}\}|_{3,}/g, "").trim();
      return <div className="bq-gap-row" key={question.id}>
        {hasGap && !onlyGap ? <div className="bq-inline">{richBlocks(question.prompt, () => <GapInput question={question} props={props} />)}</div>
          : <><NumberBadge number={props.numberOf(question.id)} flagged={props.flags.includes(question.id)} onFlag={() => props.toggleFlag(question.id)} /><div className="bq-inline">{!onlyGap && richBlocks(question.prompt, () => null)}<GapInput question={question} props={props} badge={false} /></div></>}
      </div>;
    })}
  </div>;
}

function ChoiceList({ question, props, options, many = false }: { question: ExamQuestion; props: AnswerProps; options: { key: string; label: string }[]; many?: boolean }) {
  const value = props.answers[question.id] || "";
  const picked = many ? value.split(",").filter(Boolean) : [value];
  const number = props.numberOf(question.id);
  return <div className="bq-question" id={`q-${question.id}`}>
    <div className="bq-stem"><NumberBadge number={number} flagged={props.flags.includes(question.id)} onFlag={() => props.toggleFlag(question.id)} /><div>{richBlocks(question.prompt, () => <span className="bq-blank" />)}</div></div>
    <div className="bq-choices" role={many ? "group" : "radiogroup"} aria-label={`Đáp án câu ${number}`}>{options.map((option) => {
      const on = picked.includes(option.key);
      return <label key={option.key} className={on ? "is-on" : ""}>
        <input type={many ? "checkbox" : "radio"} name={`q-${question.id}`} checked={on} onChange={() => props.setAnswer(question.id, many ? (on ? picked.filter((item) => item !== option.key) : [...picked, option.key]).sort().join(",") : option.key)} />
        {option.key !== option.label && <b>{option.key}</b>}<span>{option.label}</span>
      </label>;
    })}</div>
  </div>;
}

/** Matching information / labelling: a grid with one row per question and one column per letter. */
function Matrix({ group, props }: { group: QuestionGroup; props: AnswerProps }) {
  const keys = group.options.map(optionKey);
  const legend = group.options.filter((option) => optionLabel(option) !== optionKey(option) && !/^paragraph\s+[a-z]$/i.test(optionLabel(option)));
  return <div className="bq-matrix-wrap">
    {legend.length > 0 && <ul className="bq-legend">{legend.map((option) => <li key={option}><b>{optionKey(option)}</b> {optionLabel(option)}</li>)}</ul>}
    <div className="bq-table-wrap"><table className="bq-matrix">
      <thead><tr><th />{keys.map((key) => <th key={key}>{key}</th>)}</tr></thead>
      <tbody>{group.questions.map((question) => <tr key={question.id} id={`q-${question.id}`} className={props.answers[question.id] ? "is-answered" : ""}>
        <th><span className="bq-matrix-q"><NumberBadge number={props.numberOf(question.id)} flagged={props.flags.includes(question.id)} onFlag={() => props.toggleFlag(question.id)} /><span>{question.prompt}</span></span></th>
        {keys.map((key) => <td key={key}><label className="bq-cell"><input type="radio" name={`q-${question.id}`} checked={props.answers[question.id] === key} onChange={() => props.setAnswer(question.id, key)} aria-label={`Câu ${props.numberOf(question.id)}: ${key}`} /></label></td>)}
      </tr>)}</tbody>
    </table></div>
  </div>;
}

/** Headings, sentence endings, people or word banks: drag an option onto a slot, or tap an option then a slot. */
function PickGroup({ group, props }: { group: QuestionGroup; props: AnswerProps }) {
  const [held, setHeld] = useState<string | null>(null);
  const options = group.options.map((option) => ({ key: optionKey(option), label: optionLabel(option) }));
  const labelOf = (key: string) => options.find((option) => option.key === key);
  const used = new Set(group.questions.map((question) => props.answers[question.id]).filter(Boolean));
  const place = (questionId: string, key: string) => { props.setAnswer(questionId, key); setHeld(null); };
  return <div className="bq-pick">
    <ol className="bq-slots">{group.questions.map((question) => {
      const chosen = props.answers[question.id] ? labelOf(props.answers[question.id]) : undefined;
      return <li key={question.id} id={`q-${question.id}`}>
        <span className="bq-slot-stem">{richBlocks(question.prompt, () => null)}</span>
        <span
          className={`bq-slot ${chosen ? "is-filled" : ""} ${held ? "is-ready" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); const key = event.dataTransfer.getData("text/plain"); if (key) place(question.id, key); }}
        >
          <NumberBadge number={props.numberOf(question.id)} flagged={props.flags.includes(question.id)} onFlag={() => props.toggleFlag(question.id)} />
          <button type="button" onClick={() => { if (held) place(question.id, held); else if (chosen) props.setAnswer(question.id, ""); }} aria-label={chosen ? `Câu ${props.numberOf(question.id)}: ${chosen.key}. Bấm để bỏ chọn` : `Đặt đáp án vào câu ${props.numberOf(question.id)}`}>
            {chosen ? <><b>{chosen.key}</b> {chosen.label !== chosen.key && chosen.label}</> : <i>{held ? "Bấm để đặt vào đây" : "Kéo đáp án vào đây"}</i>}
          </button>
        </span>
      </li>;
    })}</ol>
    <div className="bq-bank">
      <small>Kéo đáp án thả vào ô trống, hoặc bấm chọn đáp án rồi bấm vào ô trống.</small>
      <div>{options.map((option) => <button
        type="button"
        key={option.key}
        draggable
        onDragStart={(event) => event.dataTransfer.setData("text/plain", option.key)}
        className={`bq-chip ${held === option.key ? "is-held" : ""} ${used.has(option.key) ? "is-used" : ""}`}
        onClick={() => setHeld(held === option.key ? null : option.key)}
        aria-pressed={held === option.key}
      ><b>{option.key}</b>{option.label !== option.key && <span>{option.label}</span>}</button>)}</div>
    </div>
  </div>;
}

const judgeOptions = (type: string) => (/yes[_-]no/.test(type) ? ["YES", "NO", "NOT GIVEN"] : ["TRUE", "FALSE", "NOT GIVEN"]).map((key) => ({ key, label: key }));

export function groupRange(group: QuestionGroup, numberOf: (id: string) => number) {
  const first = numberOf(group.questions[0].id), last = numberOf(group.questions[group.questions.length - 1].id);
  return first === last ? `Question ${first}` : `Questions ${first}–${last}`;
}

/** One "Questions 1–7" block with its instructions and the right answer controls for its type. */
export function QuestionGroupView({ group, props }: { group: QuestionGroup; props: AnswerProps }) {
  return <section className="bq-group" aria-label={groupRange(group, props.numberOf)}>
    <h3>{groupRange(group, props.numberOf)}</h3>
    {group.instructions && <div className="bq-instructions">{richBlocks(group.instructions, () => <span className="bq-blank" />)}</div>}
    {group.kind === "gap" ? <GapGroup group={group} props={props} />
      : group.kind === "matrix" ? <Matrix group={group} props={props} />
      : group.kind === "pick" ? <PickGroup group={group} props={props} />
      : group.questions.map((question) => <ChoiceList key={question.id} question={question} props={props} many={group.kind === "many"} options={group.kind === "judge" ? judgeOptions(question.type) : question.options.map((option) => ({ key: optionKey(option), label: optionLabel(option) }))} />)}
  </section>;
}
