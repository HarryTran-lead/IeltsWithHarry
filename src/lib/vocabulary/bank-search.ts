/** Search text safe for an `ilike '%…%'` pattern: wildcard and filter-syntax characters are dropped. */
export function bankSearchText(value: string) {
  return value.replace(/[%_\,()*]/g, " ").replace(/\s+/g, " ").trim();
}

const plain = (value: string) => value.toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
const withoutArticle = (value: string) => value.replace(/^(a|an|the|to) /, "");

/** How closely a bank headword matches the looked-up word: 0 exact, 1 exact after "a/an/the/to",
 * 2 starts with it, 3 contains it as a whole word, 4 anywhere else. */
export function matchRank(headword: string, lookup: string) {
  const word = plain(headword);
  const query = plain(lookup);
  if (word === query) return 0;
  if (withoutArticle(word) === withoutArticle(query)) return 1;
  if (withoutArticle(word).startsWith(query)) return 2;
  if (` ${word} `.includes(` ${query} `)) return 3;
  return 4;
}

/** Bank rows ordered best match first, then shorter headwords. */
export function rankMatches<T>(rows: T[], lookup: string, headword: (row: T) => string) {
  return rows.map((row) => ({ row, rank: matchRank(headword(row), lookup) }))
    .sort((a, b) => a.rank - b.rank || headword(a.row).length - headword(b.row).length || headword(a.row).localeCompare(headword(b.row)));
}
