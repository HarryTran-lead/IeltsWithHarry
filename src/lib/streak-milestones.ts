/**
 * Streak milestones and the celebration shown when a learner's daily streak grows.
 * Pure helpers so the rules can be tested without a browser.
 */

export type StreakTier = {
  /** Smallest streak length that reaches this tier. */
  from: number;
  id: "spark" | "ember" | "blaze" | "inferno" | "cosmic" | "legend";
  name: string;
  /** Outer flame, inner flame, glow. */
  colors: [string, string, string];
};

/** Flame colour climbs with the streak, like a streak icon that "levels up". */
export const streakTiers: StreakTier[] = [
  { from: 0, id: "spark", name: "Đốm lửa", colors: ["#ff8a3d", "#ffd34d", "rgba(255, 138, 61, 0.45)"] },
  { from: 7, id: "ember", name: "Lửa hồng", colors: ["#ff5a36", "#ffc24a", "rgba(255, 90, 54, 0.5)"] },
  { from: 30, id: "blaze", name: "Lửa tím", colors: ["#a855f7", "#f0abfc", "rgba(168, 85, 247, 0.5)"] },
  { from: 100, id: "inferno", name: "Lửa xanh", colors: ["#2f7cf6", "#7dd3fc", "rgba(47, 124, 246, 0.5)"] },
  { from: 200, id: "cosmic", name: "Lửa ngân hà", colors: ["#14b8a6", "#a7f3d0", "rgba(20, 184, 166, 0.5)"] },
  { from: 365, id: "legend", name: "Lửa huyền thoại", colors: ["#f5b301", "#fff3b0", "rgba(245, 179, 1, 0.55)"] },
];

export type StreakMilestone = { days: number; title: string; badge: string };

export const streakMilestones: StreakMilestone[] = [
  { days: 3, title: "Khởi động nóng máy", badge: "3 ngày" },
  { days: 7, title: "Trọn vẹn một tuần", badge: "1 tuần" },
  { days: 14, title: "Hai tuần bền bỉ", badge: "2 tuần" },
  { days: 30, title: "Một tháng kỷ luật", badge: "1 tháng" },
  { days: 50, title: "Nửa trăm ngày", badge: "50 ngày" },
  { days: 100, title: "Câu lạc bộ 100 ngày", badge: "100 ngày" },
  { days: 150, title: "Không gì cản nổi", badge: "150 ngày" },
  { days: 200, title: "Chiến binh 200 ngày", badge: "200 ngày" },
  { days: 365, title: "Tròn một năm!", badge: "1 năm" },
  { days: 500, title: "Huyền thoại 500", badge: "500 ngày" },
  { days: 730, title: "Hai năm rực cháy", badge: "2 năm" },
  { days: 1000, title: "Nghìn ngày bất bại", badge: "1000 ngày" },
];

export function tierFor(days: number) {
  return [...streakTiers].reverse().find((tier) => days >= tier.from) ?? streakTiers[0];
}

/** The exact milestone reached on this day, if any. Past 1000, every 100 days counts. */
export function milestoneAt(days: number): StreakMilestone | null {
  const listed = streakMilestones.find((item) => item.days === days);
  if (listed) return listed;
  if (days > 1000 && days % 100 === 0) return { days, title: `${days} ngày phi thường`, badge: `${days} ngày` };
  return null;
}

export function nextMilestone(days: number): StreakMilestone {
  return streakMilestones.find((item) => item.days > days)
    ?? { days: (Math.floor(days / 100) + 1) * 100, title: "Mốc tiếp theo", badge: "" };
}

/** How far the learner is between the previous milestone and the next, 0..1. */
export function milestoneProgress(days: number) {
  const next = nextMilestone(days);
  const previous = [...streakMilestones].reverse().find((item) => item.days <= days)?.days ?? 0;
  return { next, left: next.days - days, ratio: Math.min(1, Math.max(0, (days - previous) / (next.days - previous))) };
}

export type CelebrationKind = "first" | "daily" | "milestone" | "record" | "restart";

export type Celebration = {
  kind: CelebrationKind;
  from: number;
  to: number;
  longest: number;
  milestone: StreakMilestone | null;
  tier: StreakTier;
  /** The tier went up today (flame changes colour). */
  tierUp: boolean;
  headline: string;
  message: string;
};

/**
 * What the learner saw last time, kept per browser. `pastBest` is the longest
 * run before the current one, so "new record" fires once, on the day it is beaten.
 */
export type SeenStreak = { day: string; count: number; pastBest?: number };

export function nextSeen(streak: { current: number; longest: number; today: string }, seen: SeenStreak | null): SeenStreak {
  const pastBest = streak.longest > streak.current ? streak.longest : seen?.pastBest ?? 0;
  return { day: streak.today, count: streak.current, pastBest };
}

function dayBefore(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const dailyLines = [
  "Lửa vẫn cháy! Mỗi ngày một chút, band điểm sẽ tự lên.",
  "Bạn đang giữ nhịp cực tốt. Đừng để lửa tắt nhé!",
  "Thêm một ngày chăm chỉ. IELTS sợ bạn rồi đấy!",
  "Kỷ luật hôm nay là band 7 ngày mai.",
  "Chuỗi dài thêm rồi! Mai gặp lại nhé.",
];

export type Reminder = {
  kind: "at-risk" | "rekindle";
  /** Streak kept so far (at-risk) or the run that just went out (rekindle). */
  current: number;
  /** What the streak becomes after one activity today. */
  target: number;
  longest: number;
  /** Milestone reached by doing today's activity, if any. */
  milestone: StreakMilestone | null;
  next: StreakMilestone;
};

/**
 * Nudge shown on the first visit of a day before any activity: keep a live
 * streak alive, or relight one that went out. Brand new learners get nothing.
 */
export function reminderFor(
  streak: { current: number; longest: number; today: string; activeToday: boolean; totalDays: number },
  seen: SeenStreak | null,
  remindedDay: string | null,
): Reminder | null {
  if (streak.activeToday || remindedDay === streak.today || streak.totalDays < 1) return null;
  if (streak.current > 0) {
    const target = streak.current + 1;
    return { kind: "at-risk", current: streak.current, target, longest: streak.longest, milestone: milestoneAt(target), next: nextMilestone(streak.current) };
  }
  const lost = seen && seen.count > 1 ? seen.count : streak.longest;
  return { kind: "rekindle", current: lost, target: 1, longest: streak.longest, milestone: null, next: nextMilestone(0) };
}

/** Whole hours and minutes until local midnight, when today's chance to keep the streak ends. */
export function timeLeftToday(now: Date) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const minutes = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 60000));
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60, urgent: minutes < 180 };
}

/**
 * Decide the celebration for today's first activity, or null when there is nothing new.
 * `seen` is what this browser already celebrated; it stops the popup repeating.
 */
export function celebrationFor(
  streak: { current: number; longest: number; today: string; activeToday: boolean },
  seen: SeenStreak | null,
): Celebration | null {
  if (!streak.activeToday || streak.current < 1) return null;
  if (seen && seen.day >= streak.today) return null;

  const to = streak.current;
  const from = Math.max(0, to - 1);
  const milestone = milestoneAt(to);
  const tier = tierFor(to);
  const tierUp = tier.from === to && to > 0;
  // A streak of one after a longer one the learner had seen means the chain broke.
  const broke = to === 1 && seen !== null && seen.count > 1 && seen.day < dayBefore(streak.today);
  const pastBest = seen?.pastBest ?? 0;
  const record = !milestone && pastBest >= 7 && to === pastBest + 1;

  const kind: CelebrationKind = broke ? "restart" : to === 1 ? "first" : milestone ? "milestone" : record ? "record" : "daily";
  const headline = {
    first: "Ngày đầu tiên!",
    restart: "Thắp lại ngọn lửa!",
    milestone: milestone?.title ?? "",
    record: "Kỷ lục mới!",
    daily: `${to} ngày liên tiếp!`,
  }[kind];
  const message = {
    first: "Mọi hành trình band cao đều bắt đầu từ hôm nay. Quay lại ngày mai để giữ chuỗi nhé!",
    restart: `Chuỗi cũ đã tắt, nhưng kỷ lục ${streak.longest} ngày vẫn là của bạn. Bắt đầu lại thôi!`,
    milestone: `Bạn đã học ${to} ngày liền không nghỉ. Thật sự đáng nể!`,
    record: `Đây là chuỗi dài nhất từ trước đến nay của bạn: ${to} ngày!`,
    daily: dailyLines[to % dailyLines.length],
  }[kind];
  return { kind, from, to, longest: Math.max(streak.longest, to), milestone, tier, tierUp, headline, message };
}
