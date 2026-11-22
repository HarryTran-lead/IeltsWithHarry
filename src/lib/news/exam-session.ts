export type NewsExamSession = {
  id: string;
  article_id: string;
  started_at: string;
  expires_at: string;
  server_now: string;
  answers: Record<string, string | number>;
  revision: number;
  question_version: string;
  stale?: boolean;
};

/** Convert a server timestamp to this device's clock without trusting its date setting. */
export function localExamEpoch(session: NewsExamSession, receivedAt = Date.now()) {
  return receivedAt - Math.max(0, Date.parse(session.server_now) - Date.parse(session.started_at));
}

export function elapsedSeconds(startedAt: number, now = Date.now(), limit = 36000) {
  return Math.min(limit, Math.max(0, Math.floor((now - startedAt) / 1000)));
}

export function recoverExamAnswers(session: NewsExamSession, raw: string | null) {
  try {
    const draft=raw?JSON.parse(raw):null;
    if(draft?.revision===session.revision&&draft.answers&&typeof draft.answers==="object"&&!Array.isArray(draft.answers)
      &&Object.entries(draft.answers).every(([key,value])=>/^[0-9a-f-]{36}$/i.test(key)&&(typeof value==="string"&&value.length<=120||typeof value==="number"&&Number.isInteger(value)&&value>=0&&value<=3)))return draft.answers as Record<string,string|number>;
  }catch{/* An old or damaged device draft never replaces the server copy. */}
  return session.answers;
}
