/** Reading/Listening count only time spent inside an attempt. */
export function pausableAttempt(skill: string) { return skill === "Reading" || skill === "Listening"; }
export function elapsedAttemptMs(skill: string, startedAt: string, notes?: Record<string, string> | null, now = Date.now()) {
  if (!pausableAttempt(skill)) return Math.max(0, now - Date.parse(startedAt));
  // Legacy attempts have no reliable active-time history; give them a fresh budget.
  const saved = Number(notes?.__elapsed_ms ?? 0);
  return Number.isFinite(saved) ? Math.max(0, saved) : 0;
}
export function checkpointAttempt(notes: Record<string, string>, elapsedMs?: number) {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) return notes;
  const saved = elapsedAttemptMs("Reading", "", notes);
  return { ...notes, __elapsed_ms: String(Math.max(saved, elapsedMs)) };
}
