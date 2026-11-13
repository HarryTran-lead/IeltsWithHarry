// Raw score out of 40 → band, from the published IELTS conversion tables.
const bandTables: Record<string, [number, number][]> = {
  Listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
  Academic: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
  General: [[40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5]],
};
/** Band for a Reading/Listening result; partial tests are scaled to 40 questions and marked as an estimate. */
export function estimateBand(skill: string, format: string, score: number, total: number) {
  if (!total || (skill !== "Reading" && skill !== "Listening")) return null;
  const table = skill === "Listening" ? bandTables.Listening : /general/i.test(format) ? bandTables.General : bandTables.Academic;
  const raw = Math.round((score / total) * 40);
  return table.find(([minimum]) => raw >= minimum)?.[1] ?? (raw > 0 ? 2 : 0);
}

/** IELTS overall rounding: averages ending in .25 go up to .5 and .75 go up to the next whole band. */
export function roundBand(value: number) {
  const whole = Math.floor(value), fraction = value - whole;
  return fraction < 0.25 ? whole : fraction < 0.75 ? whole + 0.5 : whole + 1;
}
