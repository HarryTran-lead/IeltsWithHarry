import type { LucideIcon } from "lucide-react";

export type IconTone = "teal" | "coral" | "sun" | "lavender" | "sky" | "mint";

/** Tinted square icon used beside card and section headings. */
export function HeadIcon({ icon: Icon, tone = "teal", size = 18 }: { icon: LucideIcon; tone?: IconTone; size?: number }) {
  return <span className={`head-icon tone-${tone}`} aria-hidden="true"><Icon size={size} strokeWidth={2.2} /></span>;
}
