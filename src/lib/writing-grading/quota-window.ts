const vietnamOffsetMs = 7 * 60 * 60 * 1000;

/** First instant of the current calendar month in Vietnam (UTC+7, no DST). */
export function vietnamMonthStart(now: Date = new Date()) {
  const local = new Date(now.getTime() + vietnamOffsetMs);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - vietnamOffsetMs).toISOString();
}
