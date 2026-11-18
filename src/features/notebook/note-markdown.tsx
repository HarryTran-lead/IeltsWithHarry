"use client";

import type { ReactNode } from "react";

const inlinePattern = /(\*\*[^*\n]+\*\*|==[^=\n]+==|`[^`\n]+`|(?<![\p{L}\p{N}])\*[^*\s][^*\n]*\*|(?<![\p{L}\p{N}#])#[\p{L}\p{N}_-]{2,30}|https?:\/\/[^\s)]+)/gu;

function inline(text: string, onTag?: (tag: string) => void): ReactNode[] {
  return text.split(inlinePattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("==") && part.endsWith("==") && part.length > 4) return <mark key={index}>{part.slice(2, -2)}</mark>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^#[\p{L}\p{N}_-]{2,30}$/u.test(part)) {
      const tag = part.slice(1).toLocaleLowerCase("vi");
      return onTag ? <button key={index} type="button" className="qn-tag" onClick={() => onTag(tag)}>#{tag}</button> : <span key={index} className="qn-tag">#{tag}</span>;
    }
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer noopener">{part}</a>;
    return part;
  });
}

type Block =
  | { kind: "h"; level: 2 | 3 | 4; text: string }
  | { kind: "quote"; lines: string[] }
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "tasks"; items: { text: string; done: boolean; index: number }[] };

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  let task = 0;
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd(), last = blocks.at(-1);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const check = /^\s*[-*]\s\[([ xX])\]\s?(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) { blocks.push({ kind: "p", lines: [] }); continue; }
    if (heading) blocks.push({ kind: "h", level: (heading[1].length + 1) as 2 | 3 | 4, text: heading[2] });
    else if (check) {
      const item = { text: check[2], done: check[1] !== " ", index: task++ };
      if (last?.kind === "tasks") last.items.push(item); else blocks.push({ kind: "tasks", items: [item] });
    } else if (bullet) { if (last?.kind === "ul") last.items.push(bullet[1]); else blocks.push({ kind: "ul", items: [bullet[1]] }); }
    else if (ordered) { if (last?.kind === "ol") last.items.push(ordered[1]); else blocks.push({ kind: "ol", items: [ordered[1]] }); }
    else if (quote) { if (last?.kind === "quote") last.lines.push(quote[1]); else blocks.push({ kind: "quote", lines: [quote[1]] }); }
    else if (last?.kind === "p" && last.lines.length) last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }
  return blocks.filter((block) => block.kind !== "p" || block.lines.length);
}

/** Read view of a note: headings, lists, checklists, quotes and inline marks. Nothing is injected as HTML. */
export function NoteMarkdown({ body, onToggleTask, onTag }: { body: string; onToggleTask?: (index: number) => void; onTag?: (tag: string) => void }) {
  return <div className="qn-doc">{parse(body).map((block, index) => {
    if (block.kind === "h") { const Tag = `h${block.level}` as "h2" | "h3" | "h4"; return <Tag key={index}>{inline(block.text, onTag)}</Tag>; }
    if (block.kind === "quote") return <blockquote key={index}>{block.lines.map((line, row) => <p key={row}>{inline(line, onTag) }</p>)}</blockquote>;
    if (block.kind === "ul") return <ul key={index}>{block.items.map((item, row) => <li key={row}>{inline(item, onTag)}</li>)}</ul>;
    if (block.kind === "ol") return <ol key={index}>{block.items.map((item, row) => <li key={row}>{inline(item, onTag)}</li>)}</ol>;
    if (block.kind === "tasks") return <ul key={index} className="qn-tasks">{block.items.map((item) => <li key={item.index} className={item.done ? "done" : ""}>
      <label><input type="checkbox" checked={item.done} disabled={!onToggleTask} onChange={() => onToggleTask?.(item.index)} /><span>{inline(item.text, onTag)}</span></label>
    </li>)}</ul>;
    return <p key={index}>{block.lines.flatMap((line, row) => (row ? [<br key={`b${row}`} />, ...inline(line, onTag)] : inline(line, onTag)))}</p>;
  })}</div>;
}
