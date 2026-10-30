export type CompletionTable = {
  instruction: string;
  headers: string[];
  rows: string[][];
  gap: { row: number; column: number };
};

export type ArrowTable = {
  instruction: string;
  headers: [string, string];
  rows: { label: string; value: string }[];
};

const blank = /_{3,}|\.{3,}|…/;
const divider = /(?:\|\s*)?:?-{3,}:?\s*\|\s*:?-{3,}:?(?:\s*\|)?/;

function cells(line: string) {
  return line.trim().replace(/^\|\s*/, "").replace(/\s*\|$/, "").split(/\s*\|\s*/).map((cell) => cell.trim());
}

// Older AI prompts sometimes lost their row breaks when saved. In a two-column
// table, the next row's capitalized label follows the preceding value.
function flattenedRows(text: string) {
  const parts = cells(text);
  if (parts.length < 2) return [];
  const rows: string[][] = [];
  let label = parts[0];
  for (const part of parts.slice(1, -1)) {
    const boundary = /(?<=[\p{Ll}\p{N}])\s+(?=\p{Lu})/gu.exec(part);
    if (!boundary) return [];
    const value = part.slice(0, boundary.index).trim();
    const nextLabel = part.slice(boundary.index).trim();
    if (!value || !nextLabel) return [];
    rows.push([label, value]);
    label = nextLabel;
  }
  rows.push([label, parts.at(-1)!]);
  return rows;
}

/** Read the small Markdown tables already stored in Table Completion prompts. */
export function parseTableCompletion(prompt: string): CompletionTable | null {
  const source = prompt.replace(/\r\n?/g, "\n").trim();
  const separator = divider.exec(source);
  if (!separator) return null;
  const before = source.slice(0, separator.index).trim().replace(/\|\s*$/, "").trim();
  const after = source.slice(separator.index + separator[0].length).trim();
  const instructionEnd = before.lastIndexOf(".");
  if (instructionEnd < 0) return null;
  const instruction = before.slice(0, instructionEnd + 1).replace(/\*\*/g, "").trim();
  const headers = cells(before.slice(instructionEnd + 1));
  if (!instruction || headers.length < 2 || headers.length > 5 || headers.some((cell) => !cell)) return null;

  const lines = after.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.length > 1
    ? lines.map(cells)
    : headers.length === 2 ? flattenedRows(after) : lines.map(cells);
  if (!rows.length || rows.some((row) => row.length !== headers.length || row.some((cell) => !cell))) return null;
  const gaps = rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) => blank.test(cell) ? [{ row: rowIndex, column: columnIndex }] : []));
  if (gaps.length !== 1) return null;
  return { instruction, headers, rows, gap: gaps[0] };
}

/** Combine the arrow notation used by older AI sets into one shared table. */
export function parseArrowTableCompletion(prompts: string[]): ArrowTable | null {
  if (!prompts.length) return null;
  const parsed = prompts.map((prompt) => {
    const arrows = prompt.split(/\s*(?:->|→)\s*/);
    if (arrows.length !== 3) return null;
    const colon = arrows[0].lastIndexOf(":");
    if (colon < 0) return null;
    return {
      instruction: arrows[0].slice(0, colon + 1).trim(),
      firstHeader: arrows[0].slice(colon + 1).trim(),
      mixed: arrows[1].trim(),
      value: arrows[2].trim(),
    };
  });
  if (parsed.some((item) => !item)) return null;
  const items = parsed as NonNullable<(typeof parsed)[number]>[];
  const { instruction, firstHeader } = items[0];
  if (!instruction || !firstHeader || items.some((item) => item.instruction !== instruction || item.firstHeader !== firstHeader || !item.value || (item.value.match(/_{3,}|\.{3,}|…/g) ?? []).length !== 1)) return null;

  let split = 0;
  if (items.length > 1) {
    const prefix = items.reduce((common, item) => {
      let end = 0;
      while (end < common.length && common[end] === item.mixed[end]) end++;
      return common.slice(0, end);
    }, items[0].mixed);
    split = prefix.lastIndexOf(" ") + 1;
  } else {
    const match = /^(.*\p{Ll})\s+(\p{Lu}.*)$/u.exec(items[0].mixed);
    split = match ? match[1].length + 1 : 0;
  }
  const secondHeader = items[0].mixed.slice(0, split).trim();
  const rows = items.map((item) => ({ label: item.mixed.slice(split).trim(), value: item.value }));
  if (!secondHeader || rows.some((row) => !row.label)) return null;
  return { instruction, headers: [firstHeader, secondHeader], rows };
}
