export const avatarFrames = [
  { id: "classic", label: "Cơ bản", level: 1, rank: "Mầm học viên" },
  { id: "leaf", label: "Lá non", level: 3, rank: "Mầm học viên" },
  { id: "compass", label: "La bàn", level: 6, rank: "Người khám phá" },
  { id: "flame", label: "Ngọn lửa", level: 11, rank: "Người bền bỉ" },
  { id: "book", label: "Sách mở", level: 16, rank: "Học giả" },
  { id: "mountain", label: "Đỉnh núi", level: 21, rank: "Người chinh phục" },
  { id: "crown", label: "Vương miện", level: 26, rank: "Bậc thầy IELTS" },
] as const;

export type AvatarFrameId = (typeof avatarFrames)[number]["id"];
export function isAvatarFrame(value: unknown): value is AvatarFrameId {
  return avatarFrames.some((frame) => frame.id === value);
}

export function levelProgress(xp: number) {
  let level = 1;
  let earned = Math.max(0, Math.floor(xp));
  let required = 80;
  while (earned >= required) {
    earned -= required;
    level += 1;
    required += 10;
  }
  return { level, earned, required, percent: Math.min(100, Math.round(earned / required * 100)) };
}

export function rankForLevel(level: number) {
  if (level >= 26) return "Bậc thầy IELTS";
  if (level >= 21) return "Người chinh phục";
  if (level >= 16) return "Học giả";
  if (level >= 11) return "Người bền bỉ";
  if (level >= 6) return "Người khám phá";
  return "Mầm học viên";
}
