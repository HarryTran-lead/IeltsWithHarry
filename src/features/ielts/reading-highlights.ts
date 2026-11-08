export type ReadingMark = { section: string; pane: "passage" | "questions"; block: number; start: number; end: number; quote?: string };

/** Four-item records are highlights saved before the question pane was supported. */
export function savedReadingMarks(value: string | undefined): ReadingMark[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): ReadingMark[] => {
      if (!Array.isArray(item) || typeof item[0] !== "string") return [];
      const legacy = item.length === 4;
      const pane = legacy ? "passage" : item[1] === "q" ? "questions" : item[1] === "p" ? "passage" : null;
      const [block, start, end] = legacy ? item.slice(1) : item.slice(2);
      if (!pane || ![block, start, end].every((part) => Number.isInteger(part) && part >= 0) || end <= start) return [];
      return [{ section: item[0], pane, block, start, end, quote: !legacy && typeof item[5] === "string" ? item[5] : undefined }];
    });
  } catch { return []; }
}

export function encodeReadingMarks(marks: ReadingMark[]) {
  return JSON.stringify(marks.map(({ section, pane, block, start, end, quote }) => quote ? [section, pane === "passage" ? "p" : "q", block, start, end, quote] : [section, pane === "passage" ? "p" : "q", block, start, end]));
}

export function textOffset(root: Node, node: Node, offset: number) {
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(node, offset);
  return prefix.toString().length;
}

export function rangeAt(root: Node, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let total = 0, began = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!began && start <= total + length) { range.setStart(node, start - total); began = true; }
    if (began && end <= total + length) { range.setEnd(node, end - total); return range; }
    total += length;
  }
  return null;
}
