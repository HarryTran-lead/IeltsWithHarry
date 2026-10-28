// Kept free of app aliases and styles so it can be rendered in tests; styles live in bank-exam.css.
function inline(line: string) {
  // Some sources mark the gap as {{gap}} instead of underscores.
  return line.split(/(\*\*[^*]+\*\*|_{3,}|\{\{gap\}\})/g).map((part, index) => part.startsWith("**") && part.endsWith("**") && part.length > 4
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : /^(_{3,}|\{\{gap\}\})$/.test(part) ? <span key={index} className="bx-blank" aria-label="chỗ trống" /> : part);
}

/** Bold (**text**), line breaks, answer blanks (____ or {{gap}}) and "a | b | c" table rows from source prompts. */
export function RichText({ text, className }: { text: string; className?: string }) {
  // Consecutive rows split by " | " become one grid, like the tables on a printed question paper.
  const runs: (string | string[][])[] = [];
  for (const line of text.split(/\n/)) {
    const cells = line.includes(" | ") ? line.split(" | ") : null;
    const last = runs.at(-1);
    if (cells && Array.isArray(last) && last[0].length === cells.length) last.push(cells);
    else runs.push(cells ? [cells] : line);
  }
  return <span className={className}>{runs.map((run, runIndex) => Array.isArray(run) && run.length > 1
    ? <span key={runIndex} className="bx-table" style={{ gridTemplateColumns: `repeat(${run[0].length}, minmax(0, auto))` }}>
      {run.flatMap((row, rowIndex) => row.map((cell, cellIndex) => <span key={`${rowIndex}-${cellIndex}`} className={rowIndex ? "bx-cell" : "bx-cell is-head"}>{inline(cell)}</span>))}
    </span>
    : <span key={runIndex}>{runIndex > 0 && <br />}{inline(Array.isArray(run) ? run[0].join(" | ") : run)}</span>)}</span>;
}
