import type { FactoryResult, QuizFailureReason } from "./types";

/**
 * Operating policy for the scheduled V2 quiz worker. The state lives in the existing
 * news_enrichment_attempts rows (a `reason=` token in error_message and the row's retry
 * counter), so no schema change is needed.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const QUIZ_HOLD_MS = 365 * DAY;
/** Automatic retries for one article after a model-quality or truncated reply. */
export const QUIZ_RETRY_LIMIT = 1;
/** Admin alert when the queue has work but no V2 quiz was published for this long. */
export const QUIZ_ALERT_AFTER_MS = 6 * HOUR;
/** quiz rows reuse the per-row counter that photo work keeps; news_claim_enrichment never resets it. */
export const QUIZ_RETRY_COUNT_COLUMN = "photo_attempt_count";

/** Failures caused by Google or configuration rather than the article; they do not use the daily limit. */
const SYSTEMIC = new Set<QuizFailureReason>(["unavailable", "quota", "config"]);
const REASONS = new Set<QuizFailureReason>(["unavailable", "quota", "config", "rejected", "incomplete", "quality", "too_short", "internal"]);

export const quizReasonLabels: Record<QuizFailureReason, string> = {
  unavailable: "Gemini quá tải hoặc mất kết nối",
  quota: "Hết hạn mức Gemini",
  config: "Lỗi cấu hình Gemini (khóa, model, quyền)",
  rejected: "Gemini từ chối request",
  incomplete: "Gemini trả lời bị cắt hoặc hỏng",
  quality: "Không đủ câu đạt kiểm tra chất lượng",
  too_short: "Bài quá ngắn để tạo đủ câu",
  internal: "Lỗi hệ thống",
};

export type QuizAttemptRow = { attempted_at: string; retry_after: string; status: string; error_message: string | null };
export type FailurePlan = { holdMs: number; retriesUsed: number; counted: boolean; final: boolean };
export type QuizBreaker = { open: boolean; reason: QuizFailureReason | null; until: string | null; streak: number };

export function parseQuizReason(message: string | null | undefined): QuizFailureReason | null {
  const match = /(?:^|;\s*)reason=([a-z_]+)/.exec(message ?? "");
  return match && REASONS.has(match[1] as QuizFailureReason) ? match[1] as QuizFailureReason : null;
}

/** Gemini daily (RPD) quotas reset at midnight Pacific time. */
export function msUntilPacificMidnight(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const elapsed = ((part("hour") * 60 + part("minute")) * 60 + part("second")) * 1000 + now.getUTCMilliseconds();
  return DAY - elapsed;
}

/** How long to hold one article after a failed V2 run, and whether the run uses the daily limit. */
export function quizFailurePlan(reason: QuizFailureReason, retriesUsed: number,
  { now = new Date(), quotaDaily = false, retryAfterMs = null }: { now?: Date; quotaDaily?: boolean; retryAfterMs?: number | null } = {}): FailurePlan {
  const keep = (holdMs: number) => ({ holdMs, retriesUsed, counted: !SYSTEMIC.has(reason), final: false });
  switch (reason) {
    case "unavailable": return keep(3 * HOUR);
    case "quota": return keep(quotaDaily ? msUntilPacificMidnight(now) + 5 * MINUTE : Math.max(retryAfterMs ?? 0, 15 * MINUTE));
    case "config": return keep(6 * HOUR);
    case "rejected": case "incomplete": case "quality": {
      if (retriesUsed >= QUIZ_RETRY_LIMIT) return { holdMs: QUIZ_HOLD_MS, retriesUsed, counted: true, final: true };
      const wait = reason === "quality" ? 2 * DAY : reason === "rejected" ? 6 * HOUR : 3 * HOUR;
      return { holdMs: wait, retriesUsed: retriesUsed + 1, counted: true, final: false };
    }
    default: return { holdMs: QUIZ_HOLD_MS, retriesUsed, counted: true, final: true };
  }
}

/**
 * Stops the scheduled worker from claiming new articles while a systemic problem lasts:
 * a configuration error, an exhausted quota, or repeated outages/rejections. When the pause
 * ends one article is tried again; a new failure extends the streak and reopens the pause.
 */
export function quizBreaker(rows: QuizAttemptRow[], now = new Date()): QuizBreaker {
  const done = rows.filter((row) => row.status !== "running")
    .sort((a, b) => Date.parse(b.attempted_at) - Date.parse(a.attempted_at));
  const reason = parseQuizReason(done[0]?.error_message);
  if (!reason) return { open: false, reason: null, until: null, streak: 0 };
  let streak = 0;
  for (const row of done) { if (parseQuizReason(row.error_message) !== reason) break; streak++; }
  const at = Date.parse(done[0].attempted_at);
  const until = reason === "config" ? at + 6 * HOUR
    : reason === "quota" ? Date.parse(done[0].retry_after)
      : reason === "unavailable" && streak >= 2 ? at + (streak >= 3 ? 60 : 30) * MINUTE
        : reason === "rejected" && streak >= 2 ? at + 6 * HOUR : null;
  const open = until !== null && until > now.getTime();
  return { open, reason: open ? reason : null, until: open ? new Date(until).toISOString() : null, streak };
}

/** Runs that count toward daily_quiz_limit: everything except provider, quota and configuration failures. */
export function countedQuizAttempts(rows: Pick<QuizAttemptRow, "error_message">[]) {
  return rows.filter((row) => { const reason = parseQuizReason(row.error_message); return !reason || !SYSTEMIC.has(reason); }).length;
}

export function quizFailureMessage(output: Pick<FactoryResult, "state" | "audit">, reason: QuizFailureReason, plan: FailurePlan) {
  const base = `V2 ${output.state}; reason=${reason}; retry=${plan.retriesUsed}/${QUIZ_RETRY_LIMIT}; requests=${output.audit.requests}; hash=${output.audit.fingerprint.slice(0, 16)}`;
  // For provider failures keep Google's own message (status, text, wait) for diagnosis.
  const provider = reason === "unavailable" || reason === "rejected" || reason === "config" || reason === "quota"
    ? output.audit.issues.find((issue) => issue.startsWith("Gemini")) : undefined;
  return provider ? `${base}; detail=${provider}`.slice(0, 300) : base;
}
export function quizSuccessMessage(output: Pick<FactoryResult, "questions" | "audit">) {
  const tokens = (output.audit.generation_tokens?.total ?? 0) + (output.audit.qa_tokens?.total ?? 0);
  return `V2 READY; questions=${output.questions.length}; requests=${output.audit.requests}; tokens=${tokens}; hash=${output.audit.fingerprint.slice(0, 16)}`;
}

export type QuizHealthAlert = { tone: "error" | "warning" | "info"; code: string; message: string };
export type HeldQuizArticle = { article_id: string; title: string; attempted_at: string; reason: QuizFailureReason | null; error_message: string | null };
export type QuizHealth = {
  status: "ok" | "warning" | "error";
  alerts: QuizHealthAlert[];
  factory: { v2Enabled: boolean; freeTierReady: boolean; model: string; autoEnrich: boolean };
  breaker: QuizBreaker;
  today: { counted: number; limit: number; failures: Partial<Record<QuizFailureReason, number>> };
  lastV2Success: string | null;
  backlog: number;
  waitingRetry: number;
  held: HeldQuizArticle[];
  /** Added by the admin route: today's AI-written articles (Vietnam day). */
  articles?: { written: number; limit: number; hotReserve: number; hot: number; complete: number };
};

const clock = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export function quizHealth(input: {
  now: Date; v2Enabled: boolean; freeTierReady: boolean; model: string; autoEnrich: boolean; dailyLimit: number;
  recent: QuizAttemptRow[]; lastV2Success: string | null; backlog: number; waitingRetry: number; held: HeldQuizArticle[];
}): QuizHealth {
  const startOfDay = new Date(input.now); startOfDay.setUTCHours(0, 0, 0, 0);
  const todayRows = input.recent.filter((row) => Date.parse(row.attempted_at) >= startOfDay.getTime());
  const failures: Partial<Record<QuizFailureReason, number>> = {};
  for (const row of todayRows) { const reason = parseQuizReason(row.error_message); if (reason) failures[reason] = (failures[reason] ?? 0) + 1; }
  const breaker = quizBreaker(input.recent, input.now);
  const counted = countedQuizAttempts(todayRows);
  const alerts: QuizHealthAlert[] = [];
  if (!input.freeTierReady) alerts.push({ tone: "error", code: "free_tier", message: "Thiếu cấu hình Gemini Free Tier nên hệ thống không tạo quiz." });
  if (!input.autoEnrich) alerts.push({ tone: "warning", code: "schedule_off", message: "Lịch tự tìm ảnh và tạo quiz đang tắt." });
  if (breaker.open && breaker.until) {
    const until = clock(breaker.until);
    alerts.push(breaker.reason === "config"
      ? { tone: "error", code: "breaker_config", message: `Gemini báo lỗi cấu hình (khóa, model hoặc quyền). Đã tạm dừng tạo quiz đến ${until}. Kiểm tra AI_FACTORY_GEMINI_API_KEY và NEWS_QUESTION_FACTORY_V2_MODEL.` }
      : breaker.reason === "rejected"
        ? { tone: "error", code: "breaker_rejected", message: `Gemini từ chối ${breaker.streak} request liên tiếp, có thể do prompt hoặc schema. Đã tạm dừng đến ${until}.` }
        : breaker.reason === "quota"
          ? { tone: "warning", code: "breaker_quota", message: `Đã hết hạn mức Gemini. Tạm dừng tạo quiz đến ${until}.` }
          : { tone: "warning", code: "breaker_unavailable", message: `Gemini quá tải ${breaker.streak} lần liên tiếp. Tạm dừng tạo quiz đến ${until}, sau đó tự thử lại.` });
  }
  if (input.v2Enabled && input.backlog > 0) {
    const silentFor = input.lastV2Success ? input.now.getTime() - Date.parse(input.lastV2Success) : Infinity;
    if (silentFor > QUIZ_ALERT_AFTER_MS) alerts.push({ tone: "error", code: "no_quiz", message: input.lastV2Success
      ? `Đã ${Math.floor(silentFor / HOUR)} giờ chưa có quiz V2 mới, trong khi còn ${input.backlog} bài chờ.`
      : `Chưa có quiz V2 nào được xuất bản, trong khi còn ${input.backlog} bài chờ.` });
  }
  if (input.held.length) alerts.push({ tone: "warning", code: "held", message: `${input.held.length} bài bị dừng tạo quiz và cần xem lại. Có thể mở khóa ngay bên dưới.` });
  if (counted >= input.dailyLimit) alerts.push({ tone: "info", code: "daily_limit", message: `Đã dùng hết hạn mức ${input.dailyLimit} lượt hôm nay. Hạn mức đặt lại lúc 07:00.` });
  const status = alerts.some((alert) => alert.tone === "error") ? "error" : alerts.some((alert) => alert.tone === "warning") ? "warning" : "ok";
  return {
    status, alerts, breaker, lastV2Success: input.lastV2Success, backlog: input.backlog, waitingRetry: input.waitingRetry, held: input.held,
    factory: { v2Enabled: input.v2Enabled, freeTierReady: input.freeTierReady, model: input.model, autoEnrich: input.autoEnrich },
    today: { counted, limit: input.dailyLimit, failures },
  };
}
