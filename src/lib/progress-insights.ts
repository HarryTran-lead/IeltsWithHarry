import { roundBand } from "@/lib/ielts-bank/band";
import { addDays, dayDiff, dayTotal, progressSkills, weekOf, type ProgressDay, type ProgressGoals, type ProgressSkill } from "@/lib/study-progress";

/**
 * How much a submitted test tells us about the learner:
 * - `valid`: counts toward bands and question-type accuracy;
 * - `abandoned`: fewer than half the questions answered (or an essay under half the minimum length);
 * - `rushed`: answered faster than anyone can read the questions (under 20 seconds each), usually a retake.
 */
export type AttemptStatus = "valid" | "abandoned" | "rushed";
export type Criterion = { key: string; score: number };

/** One submitted question-bank test, with its band when it can be scored. */
export type InsightAttempt = {
  id: string; title: string; skill: ProgressSkill; format: string; score: number | null; total: number | null;
  band: number | null; partial: boolean; part: string | null; minutes: number; submittedAt: string;
  status?: AttemptStatus; answered?: number | null; wrong?: number | null; skipped?: number | null;
  words?: number | null; task?: 1 | 2 | null; graded?: boolean; criteria?: Criterion[] | null;
};
/** Answers per question type across recent valid Reading/Listening tests; `total` includes skipped questions. */
export type TypeStat = { skill: "Reading" | "Listening"; type: string; kind?: string; correct: number; total: number; wrong?: number; skipped?: number };
/** Speaking practice has no band by design (no fabricated bands), so it is tracked by practice volume. */
export type SpeakingStats = { sessions: number; speakingMinutes: number; coached: number; lastAt: string | null };
export type ProgressInsights = { attempts: InsightAttempt[]; questionTypes: TypeStat[]; speaking?: SpeakingStats | null };

/** True when an answers object holds at least one non-empty answer (essays live in `__response`). */
export function hasAnswer(answers: unknown) {
  if (!answers || typeof answers !== "object") return false;
  return Object.entries(answers as Record<string, unknown>).some(([key, value]) =>
    (key === "__response" || !key.startsWith("__")) && typeof value === "string" && value.trim() !== "");
}

export function wordCount(text: string | null | undefined) {
  return (text ?? "").trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** The Writing task from an exam title or practice type: Task 1 asks for 150 words, Task 2 for 250. */
export function writingTask(title: string, practiceType?: string | null): 1 | 2 {
  return /task[\s_-]*1/i.test(`${practiceType ?? ""} ${title}`) ? 1 : 2;
}

export function classifyAttempt(input: { skill: ProgressSkill; questions?: number | null; answered?: number | null; seconds?: number | null; words?: number | null; task?: 1 | 2 | null }): AttemptStatus {
  if (input.skill === "Writing") {
    const minimum = input.task === 1 ? 150 : 250;
    return (input.words ?? 0) < minimum / 2 ? "abandoned" : "valid";
  }
  if (input.skill === "Speaking") return "valid";
  const questions = input.questions ?? 0, answered = input.answered ?? 0;
  if (!questions || answered < questions / 2) return "abandoned";
  if (input.seconds !== null && input.seconds !== undefined && input.seconds < answered * 20) return "rushed";
  return "valid";
}

export const isCounted = (attempt: Pick<InsightAttempt, "status">) => (attempt.status ?? "valid") === "valid";

/** Weight in a band estimate: a full test is 1, a single passage/part about a third, a Writing Task 1 half. */
export function attemptWeight(attempt: Pick<InsightAttempt, "skill" | "partial" | "total" | "task">) {
  if (attempt.skill === "Writing") return attempt.task === 1 ? 0.5 : 1;
  return attempt.partial || (attempt.total ?? 40) < 40 ? 0.35 : 1;
}
const isPartialScore = (attempt: Pick<InsightAttempt, "skill" | "partial" | "total">) =>
  (attempt.skill === "Reading" || attempt.skill === "Listening") && (attempt.partial || (attempt.total ?? 40) < 40);

export type SkillSummary = {
  skill: ProgressSkill;
  /** Every submitted test, and those that count toward the band. */
  attempts: number; valid: number;
  current: number | null; previous: number | null;
  /** ± half-width of the estimate, and how many full tests the estimate is worth (capped at 3). */
  margin: number | null; evidence: number;
  /** Full tests still needed before the estimate settles (0 when it already has). */
  needMore: number;
  best: number | null; bestPartial: boolean;
  trend: { at: string; band: number; title: string; partial: boolean }[];
  /** Mean criterion scores across recent graded essays (Writing only). */
  criteria: Criterion[];
};

const EVIDENCE = 3;
type Scored = InsightAttempt & { band: number };

/** Most recent scored attempts until they are worth three full tests (at most eight). */
function recentWindow(scored: Scored[]) {
  const picked: Scored[] = [];
  let weight = 0;
  for (let index = scored.length - 1; index >= 0 && weight < EVIDENCE && picked.length < 8; index -= 1) {
    picked.push(scored[index]);
    weight += attemptWeight(scored[index]);
  }
  return { picked, weight };
}
function weightedMean(list: Scored[]) {
  const total = list.reduce((sum, item) => sum + attemptWeight(item), 0);
  return total ? list.reduce((sum, item) => sum + item.band * attemptWeight(item), 0) / total : null;
}

/**
 * Current band = weighted mean of the latest valid scored tests worth three full tests;
 * `previous` is the same over the tests before them. Abandoned and rushed tests never count.
 */
export function skillSummaries(attempts: InsightAttempt[]): SkillSummary[] {
  return progressSkills.map((skill) => {
    const mine = attempts.filter((item) => item.skill === skill);
    const valid = mine.filter(isCounted);
    const scored = valid.filter((item): item is Scored => item.band !== null).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const recent = recentWindow(scored), before = recentWindow(scored.slice(0, scored.length - recent.picked.length));
    const mean = weightedMean(recent.picked);
    const current = mean === null ? null : roundBand(mean);
    const previous = before.picked.length && before.weight >= 1 ? roundBand(weightedMean(before.picked)!) : null;
    const evidence = Math.min(EVIDENCE, Math.round(recent.weight * 100) / 100);
    let margin: number | null = null;
    if (mean !== null) {
      const spread = Math.sqrt(recent.picked.reduce((sum, item) => sum + attemptWeight(item) * (item.band - mean) ** 2, 0) / recent.weight);
      const base = evidence >= EVIDENCE ? 0.5 : evidence >= 1.5 ? 1 : 1.5;
      margin = Math.min(2, Math.max(base, Math.round(spread * 2) / 2));
    }
    const full = scored.filter((item) => !isPartialScore(item));
    const bestOf = full.length ? full : scored;
    const criteria = skill === "Writing" ? meanCriteria(recent.picked) : [];
    return {
      skill, attempts: mine.length, valid: valid.length, current, previous, margin, evidence,
      needMore: current === null ? EVIDENCE : Math.max(0, Math.ceil(EVIDENCE - recent.weight - 1e-9)),
      best: bestOf.length ? Math.max(...bestOf.map((item) => item.band)) : null, bestPartial: !full.length && scored.length > 0,
      trend: scored.slice(-12).map((item) => ({ at: item.submittedAt, band: item.band, title: item.title, partial: isPartialScore(item) })),
      criteria,
    };
  });
}

function meanCriteria(list: InsightAttempt[]): Criterion[] {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const item of list) for (const criterion of item.criteria ?? []) {
    const key = criterion.key === "TA" ? "TR" : criterion.key;
    const row = sums.get(key) ?? { sum: 0, count: 0 };
    row.sum += criterion.score; row.count += 1;
    sums.set(key, row);
  }
  return ["TR", "CC", "LR", "GRA"].filter((key) => sums.has(key)).map((key) => ({ key, score: roundBand(sums.get(key)!.sum / sums.get(key)!.count) }));
}

/**
 * Overall needs Reading, Listening and Writing. Speaking has no band in this app, so the estimate says so
 * instead of pretending; with fewer skills there is no overall at all.
 */
export function overallBand(summaries: SkillSummary[]): { band: number | null; skills: number; missing: ProgressSkill[]; withoutSpeaking: boolean; margin: number | null } {
  const needed: ProgressSkill[] = ["Reading", "Listening", "Writing"];
  const missing = needed.filter((skill) => summaries.find((item) => item.skill === skill)?.current === null);
  const speaking = summaries.find((item) => item.skill === "Speaking")?.current ?? null;
  const bands = summaries.filter((item) => needed.includes(item.skill) || item.skill === "Speaking").map((item) => item.current).filter((value): value is number => value !== null);
  const known = summaries.filter((item) => item.current !== null).length;
  if (missing.length) return { band: null, skills: known, missing, withoutSpeaking: speaking === null, margin: null };
  const margin: number | null = Math.max(...summaries.filter((item) => item.margin !== null).map((item) => item.margin!));
  return { band: roundBand(bands.reduce((sum, value) => sum + value, 0) / bands.length), skills: bands.length, missing, withoutSpeaking: speaking === null, margin };
}

/** Fraction of questions right that the published tables need for `band` (out of 40). */
export function accuracyForBand(skill: "Reading" | "Listening", band: number, format = "Academic") {
  const tables: Record<string, [number, number][]> = {
    Listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
    Academic: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]],
    General: [[40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5]],
  };
  const table = skill === "Listening" ? tables.Listening : /general/i.test(format) ? tables.General : tables.Academic;
  const row = [...table].reverse().find(([, value]) => value >= band) ?? table[0];
  return row[0] / 40;
}

/** At least this many answered questions before a question type is judged. */
export const TYPE_MIN_ANSWERED = 10;

/**
 * Weak question types: enough answers, and accuracy under what the target band needs
 * (or, with no target, at least 10 points under the learner's own average).
 */
export function weakTypes(rows: TypeStat[], skill: "Reading" | "Listening", target: number | null) {
  const answered = (row: TypeStat) => row.total - (row.skipped ?? 0);
  const judged = rows.filter((row) => answered(row) >= TYPE_MIN_ANSWERED);
  const all = rows.reduce((acc, row) => ({ right: acc.right + row.correct, answered: acc.answered + answered(row) }), { right: 0, answered: 0 });
  const average = all.answered ? all.right / all.answered : 0;
  const threshold = target !== null ? accuracyForBand(skill, target) : average - 0.1;
  return {
    threshold, byTarget: target !== null,
    weak: judged.filter((row) => row.correct / answered(row) < threshold).sort((a, b) => a.correct / answered(a) - b.correct / answered(b)).map((row) => row.type),
  };
}

export type WeekRow = Record<ProgressSkill, number> & { start: string; end: string; other: number; minutes: number; activeDays: number; total: number };

/** Monday-first weeks ending with the week of `today`. */
export function weeklyRows(days: ProgressDay[], today: string, weeks = 12): WeekRow[] {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const lastMonday = weekOf(today)[0];
  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(lastMonday, (index - weeks + 1) * 7);
    const row: WeekRow = { start, end: addDays(start, 6), Reading: 0, Listening: 0, Writing: 0, Speaking: 0, other: 0, minutes: 0, activeDays: 0, total: 0 };
    for (let offset = 0; offset < 7; offset += 1) {
      const day = byDay.get(addDays(start, offset));
      if (!day || day.day > today) continue;
      progressSkills.forEach((skill) => { row[skill] += day[skill]; });
      row.other += day.other; row.minutes += day.minutes; row.total += dayTotal(day);
      if (day.active) row.activeDays += 1;
    }
    return row;
  });
}

/** Totals for the `length` days ending today and the same span before it, for "vs. previous period" deltas. */
export function periodTotals(days: ProgressDay[], today: string, length = 28) {
  const sum = (from: string, to: string) => days.filter((day) => day.day >= from && day.day <= to).reduce((acc, day) => ({
    exercises: acc.exercises + dayTotal(day), minutes: acc.minutes + day.minutes, activeDays: acc.activeDays + (day.active ? 1 : 0),
  }), { exercises: 0, minutes: 0, activeDays: 0 });
  const start = addDays(today, -(length - 1));
  return { current: sum(start, today), previous: sum(addDays(start, -length), addDays(start, -1)), length };
}

/** Rough coaching rule: about six valid scored tests (with review) per half band gained. */
export const TESTS_PER_HALF_BAND = 6;

export type ExamPlan =
  | { status: "no-exam" | "past" }
  | { status: "no-target" | "no-band"; daysLeft: number }
  | { status: "reached"; daysLeft: number; target: number; current: number }
  | { status: "on-track" | "behind"; daysLeft: number; target: number; current: number; gap: number; perWeekNeeded: number; perWeekNow: number; focus: ProgressSkill | "overall" };

/**
 * Links target, exam date and pace: how many valid tests a week the remaining gap needs,
 * against how many the learner did in the last four weeks.
 */
export function examPlan(goals: ProgressGoals, summaries: SkillSummary[], attempts: InsightAttempt[], today: string): ExamPlan {
  if (!goals.examDate) return { status: "no-exam" };
  const daysLeft = dayDiff(today, goals.examDate);
  if (daysLeft < 0) return { status: "past" };
  const overall = overallBand(summaries);
  // Prefer the overall gap; otherwise the widest gap among skills with both a target and a band.
  const skillGaps = summaries.filter((item) => item.current !== null && goals[item.skill] !== null)
    .map((item) => ({ focus: item.skill as ProgressSkill | "overall", target: goals[item.skill]!, current: item.current! }));
  const candidates = overall.band !== null && goals.overall !== null ? [{ focus: "overall" as const, target: goals.overall, current: overall.band }] : skillGaps;
  const hasTarget = goals.overall !== null || progressSkills.some((skill) => goals[skill] !== null);
  if (!hasTarget) return { status: "no-target", daysLeft };
  if (!candidates.length) return { status: "no-band", daysLeft };
  const pick = candidates.reduce((wide, item) => (item.target - item.current > wide.target - wide.current ? item : wide));
  const gap = pick.target - pick.current;
  if (gap <= 0) return { status: "reached", daysLeft, target: pick.target, current: pick.current };
  const weeksLeft = Math.max(1, daysLeft / 7);
  const perWeekNeeded = Math.ceil(((gap / 0.5) * TESTS_PER_HALF_BAND) / weeksLeft);
  const since = addDays(today, -27);
  const recent = attempts.filter((item) => isCounted(item) && item.submittedAt.slice(0, 10) >= since && (item.band !== null || item.skill === "Writing"));
  const perWeekNow = Math.round((recent.reduce((sum, item) => sum + attemptWeight(item), 0) / 4) * 10) / 10;
  return { status: perWeekNow >= perWeekNeeded ? "on-track" : "behind", daysLeft, target: pick.target, current: pick.current, gap, perWeekNeeded, perWeekNow, focus: pick.focus };
}

export type BehaviorInsight = { id: string; tone: "warn" | "info" | "good"; text: string; action?: { label: string; href: string } };

/** Short observations from how the learner actually studies, most useful first (at most four). */
export function behaviorInsights(input: { attempts: InsightAttempt[]; days: ProgressDay[]; today: string; speaking?: SpeakingStats | null }): BehaviorInsight[] {
  const { attempts, days, today, speaking } = input;
  const out: BehaviorInsight[] = [];
  const tests = attempts.filter((item) => item.skill === "Reading" || item.skill === "Listening");
  const abandoned = tests.filter((item) => item.status === "abandoned");
  if (tests.length >= 3 && abandoned.length / tests.length >= 0.3) {
    const quick = abandoned.filter((item) => item.minutes <= 2).length;
    out.push({ id: "abandoned", tone: "warn", text: `Bạn bỏ dở ${abandoned.length}/${tests.length} đề Reading/Listening${quick ? `, ${quick} đề dừng trong 2 phút đầu` : ""}. Thử chọn một passage lẻ 20 phút thay vì full test để làm trọn vẹn.`, action: { label: "Chọn passage lẻ", href: "/app/reading?type=passage" } });
  }
  const rushed = tests.filter((item) => item.status === "rushed").length;
  if (rushed >= 2) out.push({ id: "rushed", tone: "info", text: `${rushed} bài được nộp quá nhanh (dưới 20 giây/câu), thường là làm lại sau khi xem đáp án. Các bài này không được tính vào band.` });
  const lastTest = attempts.filter(isCounted).map((item) => item.submittedAt.slice(0, 10)).sort().at(-1);
  if (lastTest) {
    const gap = dayDiff(lastTest, today);
    if (gap >= 7) out.push({ id: "no-test", tone: "warn", text: `Đã ${gap} ngày bạn chưa làm đề nào được tính điểm. Một passage hôm nay giúp band ước tính không bị cũ.`, action: { label: "Làm đề Reading", href: "/app/reading" } });
  }
  const ungraded = attempts.filter((item) => item.skill === "Writing" && isCounted(item) && !item.graded).length;
  if (ungraded) out.push({ id: "ungraded", tone: "info", text: `${ungraded} bài Writing đã đủ dài nhưng chưa được chấm. Mở bài và bấm "Chấm bài" để có band và nhận xét 4 tiêu chí.`, action: { label: "Xem bài Writing", href: "#lich-su" } });
  const practiced = new Set(attempts.filter(isCounted).map((item) => item.skill));
  const listeningDays = days.filter((day) => day.Listening > 0).length;
  if (!practiced.has("Listening") && attempts.length >= 3) out.push({ id: "no-listening", tone: "info", text: listeningDays ? `Bạn đã luyện nghe ${listeningDays} ngày (dictation, lab) nhưng chưa làm đề Listening nào, nên chưa có band Listening.` : "Bạn chưa làm đề Listening nào, nên chưa có band Listening và Overall.", action: { label: "Làm đề Listening", href: "/app/listening" } });
  if (!speaking?.sessions && attempts.length >= 3) out.push({ id: "no-speaking", tone: "info", text: "Bạn chưa có buổi luyện Speaking nào. Thử một lượt Part 2 trong 2 phút để bắt đầu.", action: { label: "Luyện Speaking", href: "/app/speaking" } });
  const recent = days.filter((day) => day.day > addDays(today, -7) && day.day <= today);
  const activeWeek = recent.filter((day) => day.active).length;
  if (activeWeek >= 5) out.push({ id: "steady", tone: "good", text: `Tuần này bạn học ${activeWeek}/7 ngày. Nhịp này rất tốt, giữ tiếp nhé!` });
  return out.slice(0, 4);
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}
