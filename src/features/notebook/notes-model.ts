/** Plain-text note helpers: templates, #tags, light Markdown and grouping for the notes workspace. */

export type NoteTemplate = { id: string; label: string; hint: string; title: string; body: string };

export const noteTemplates: NoteTemplate[] = [
  {
    id: "vocab", label: "Từ vựng", hint: "Nghĩa, collocation, ví dụ",
    title: "Từ mới: ",
    body: "## Từ / cụm từ\n**word** (n/v/adj) /phiên âm/\n\n## Nghĩa\n- \n\n## Collocation hay đi kèm\n- \n\n## Ví dụ của mình\n- \n\n#vocabulary",
  },
  {
    id: "mistake", label: "Lỗi sai cần nhớ", hint: "Câu sai → câu đúng → lý do",
    title: "Lỗi sai: ",
    body: "## Mình đã viết\n> \n\n## Câu đúng\n> \n\n## Vì sao sai\n- \n\n## Lần sau nhớ\n- [ ] Đọc lại quy tắc\n- [ ] Viết 3 câu tương tự\n\n#mistakes",
  },
  {
    id: "writing", label: "Dàn ý Writing", hint: "Task 2: luận điểm và ví dụ",
    title: "Dàn ý Task 2: ",
    body: "## Đề bài\n> \n\n## Quan điểm (thesis)\n- \n\n## Body 1\n- Ý chính: \n- Giải thích: \n- Ví dụ: \n\n## Body 2\n- Ý chính: \n- Giải thích: \n- Ví dụ: \n\n## Từ vựng ăn điểm\n- \n\n#writing",
  },
  {
    id: "speaking", label: "Ý tưởng Speaking", hint: "Part 2 cue card",
    title: "Speaking Part 2: ",
    body: "## Cue card\n> Describe ...\n\n## Ý chính\n- What: \n- When / where: \n- Who: \n- Why it matters: \n\n## Cụm từ muốn dùng\n- \n\n#speaking",
  },
  {
    id: "lesson", label: "Tóm tắt bài học", hint: "3 điều học được + việc cần làm",
    title: "Tóm tắt: ",
    body: "## 3 điều mình học được\n1. \n2. \n3. \n\n## Còn chưa hiểu\n- \n\n## Việc cần làm\n- [ ] Ôn lại sau 1 ngày\n- [ ] Làm bài luyện liên quan\n\n#lesson",
  },
];

const tagPattern = /(^|\s)#([\p{L}\p{N}_-]{2,30})/gu;

/** Lower-cased #tags in a note body, without the leading #. */
export function noteTags(body: string) {
  return [...new Set([...body.matchAll(tagPattern)].map((match) => match[2].toLocaleLowerCase("vi")))];
}

/** One-line preview without Markdown marks or tags. */
export function noteSnippet(body: string) {
  return body
    .replace(tagPattern, "$1")
    .replace(/^\s*(#{1,3}\s|>\s?|[-*]\s\[[ xX]\]\s|[-*]\s|\d+\.\s)/gm, "")
    .replace(/\*\*|==|`/g, "")
    .replace(/(^|\s)\*(\S[^*\n]*)\*/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function noteStats(body: string) {
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const tasks = [...body.matchAll(/^\s*[-*]\s\[([ xX])\]/gm)];
  return { words, characters: body.length, minutes: Math.max(1, Math.round(words / 200)), tasks: tasks.length, done: tasks.filter((match) => match[1] !== " ").length };
}

/** Flips the n-th checklist item (0-based, in document order). */
export function toggleTask(body: string, index: number) {
  let seen = -1;
  return body.replace(/^(\s*[-*]\s\[)([ xX])(\])/gm, (match, open: string, mark: string, close: string) => {
    seen += 1;
    return seen === index ? `${open}${mark === " " ? "x" : " "}${close}` : match;
  });
}

export type DateGroup = "Hôm nay" | "Hôm qua" | "7 ngày qua" | "30 ngày qua" | "Cũ hơn";
export function dateGroup(iso: string, now = new Date()): DateGroup {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = new Date(iso).getTime();
  if (time >= start) return "Hôm nay";
  if (time >= start - 86400000) return "Hôm qua";
  if (time >= start - 6 * 86400000) return "7 ngày qua";
  if (time >= start - 29 * 86400000) return "30 ngày qua";
  return "Cũ hơn";
}

/** Wraps the selection in `before`/`after`, or prefixes each selected line when `line` is set. */
export function applyFormat(text: string, start: number, end: number, format: { before: string; after?: string; line?: boolean; placeholder?: string }) {
  if (format.line) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = text.indexOf("\n", end) === -1 ? text.length : text.indexOf("\n", end);
    const lines = text.slice(lineStart, lineEnd).split("\n");
    const allSet = lines.every((line) => line.startsWith(format.before));
    const next = lines.map((line) => (allSet ? line.slice(format.before.length) : format.before + line)).join("\n");
    const value = text.slice(0, lineStart) + next + text.slice(lineEnd);
    return { value, start: lineStart, end: lineStart + next.length };
  }
  const after = format.after ?? format.before;
  const selected = text.slice(start, end) || format.placeholder || "";
  const value = text.slice(0, start) + format.before + selected + after + text.slice(end);
  return { value, start: start + format.before.length, end: start + format.before.length + selected.length };
}
