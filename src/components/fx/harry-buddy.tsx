"use client";
import { useState } from "react";
import { Sticker } from "@/components/stickers/stickers";

const defaultTips = [
  "Chỉ 10 phút mỗi ngày thôi cũng tạo khác biệt lớn!",
  "Đọc to câu ví dụ để nhớ từ lâu hơn nhé.",
  "Gặp từ hay? Lưu ngay vào Sổ tay!",
  "Sai cũng không sao, đó là cách não học đấy.",
  "Thử một bài Reading ngắn trước khi nghỉ nào?",
  "Bạn đang tiến bộ hơn hôm qua rồi đó!",
];

/** Clickable Harry: each tap makes him hop and say the next tip. */
export function HarryBuddy({ size = 120, tips = defaultTips, className = "" }: { size?: number; tips?: string[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [hop, setHop] = useState(0);
  return (
    <button
      type="button"
      className={`harry-buddy ${className}`.trim()}
      onClick={() => { setIndex((value) => (value + 1) % tips.length); setHop((value) => value + 1); }}
      aria-label={`Harry nói: ${tips[index]} Bấm để nghe mẹo khác.`}
    >
      <span className="harry-buddy-bubble" key={`tip-${index}`} aria-live="polite">{tips[index]}</span>
      <span className={hop ? "harry-buddy-body hop" : "harry-buddy-body"} key={`hop-${hop}`}><Sticker name="harry" size={size} tilt={-4} pop={hop === 0} /></span>
      <small>Bấm vào Harry</small>
    </button>
  );
}
