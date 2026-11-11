/**
 * Vietnamese date labels shared by the portal, matching the `vi-VN` medium style the
 * notebook, news and profile pages already use: "26 thg 10, 2026" and "26 thg 10".
 */

/** Plain `YYYY-MM-DD` days are read as local midnight so they never shift a day. */
function toDate(value: string | Date) {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

const full = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });
const dayMonth = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short" });

/** "26 thg 10, 2026" */
export function viDate(value: string | Date) {
  return full.format(toDate(value));
}

/** "26 thg 10" */
export function viDayMonth(value: string | Date) {
  return dayMonth.format(toDate(value));
}
