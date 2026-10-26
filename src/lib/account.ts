export const avatarStickers = ["harry", "star", "rocket", "book", "globe", "headphones", "mic", "coffee", "bulb", "mountain"] as const;
export type AvatarSticker = (typeof avatarStickers)[number];
export function isAvatar(value: unknown): value is AvatarSticker { return avatarStickers.includes(value as AvatarSticker); }

const avatarPhotoPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
export function avatarPhotoUrl(value: unknown) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof value !== "string" || !avatarPhotoPattern.test(value) || !projectUrl) return null;
  return `${projectUrl.replace(/\/$/, "")}/storage/v1/object/public/user-avatars/${value}`;
}

export type StreakDay = { day: string; events: number; kinds: string[] };
export type Streak = { current: number; longest: number; today: string; activeToday: boolean; totalDays: number; days: StreakDay[] };
export type AccountControls = { suspendedUntil: string | null; suspendedReason: string; chatMutedUntil: string | null; chatMutedReason: string };
export type LearnerProfile = { id: string; display_name: string; timezone: string; daily_goal: number; bio: string; target_band: number | null; exam_date: string | null; stage_id: string | null; avatar: string; created_at: string };
export type TimelineItem = { kind: string; at: string; title: string; score?: number; total?: number; link?: string };
export type LearnerOverview = {
  profile: LearnerProfile;
  controls: AccountControls | null;
  streak: Streak;
  stats: { lessons: number; lessonScore: number | null; newsQuizzes: number; newsScore: number | null; newsRead: number; words: number; tasksDone: number; tasksOpen: number; messages: number };
  openTasks: { id: string; title: string; skill: string; due: string; assigned: boolean }[];
  timeline: TimelineItem[];
};

export const activityLabels: Record<string, string> = {
  lesson: "Làm bài học", news_quiz: "Làm quiz Daily News", news_read: "Đọc xong bài báo", word: "Lưu từ mới",
  notebook: "Ghi sổ tay", task: "Hoàn thành nhiệm vụ", study_room: "Học trong phòng cùng học",
};

/** True while an admin control is in force. Permanent controls are stored as 'infinity'. */
export function activeUntil(value: string | null | undefined, now = Date.now()) {
  if (!value) return false;
  if (value === "infinity") return true;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now;
}

export function untilLabel(value: string | null | undefined) {
  if (!value) return "";
  if (value === "infinity") return "vĩnh viễn";
  return `đến ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))}`;
}

function shift(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Monday-first weeks ending with the week of `today`, for an activity calendar. */
export function heatmapWeeks(days: StreakDay[], today: string, weeks = 18) {
  const events = new Map(days.map((item) => [item.day, item.events]));
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = shift(today, -weekday - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, index) => {
    const date = shift(start, week * 7 + index);
    return { date, events: events.get(date) ?? 0, future: date > today };
  }));
}

/** The seven days Monday to Sunday of the week containing `today`, marked when active. */
export function streakWeek(days: StreakDay[], today: string) {
  return heatmapWeeks(days, today, 1)[0];
}
