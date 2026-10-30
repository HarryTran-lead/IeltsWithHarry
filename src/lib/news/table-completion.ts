export type CompletionTable = {
  instruction: string;
  headers: string[];
  rows: string[][];
  gap: { row: number; column: number };
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
