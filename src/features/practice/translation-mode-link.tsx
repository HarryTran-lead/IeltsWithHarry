import Link from "next/link";
import { ArrowRight, BookOpenText, TrendingUp } from "lucide-react";
import "./translation-mode-link.css";

/**
 * The two Vietnamese→English modes live in different sections: the band route under
 * "Luyện tập" and the IELTS-vocabulary topics under "Từ vựng". Each page points to
 * the other with this card, naming the section so the jump is expected.
 */
const modes = {
  band: {
    href: "/app/practice/translation",
    icon: TrendingUp,
    question: "Muốn luyện tăng dần theo độ khó?",
    target: "Dịch Việt–Anh theo band",
    section: "mục Luyện tập",
  },
  topic: {
    href: "/app/vocabulary/translation",
    icon: BookOpenText,
    question: "Muốn dùng từ IELTS bạn đã học?",
    target: "Dịch câu theo chủ đề",
    section: "mục Từ vựng",
  },
} as const;

export function TranslationModeLink({ to }: { to: keyof typeof modes }) {
  const mode = modes[to];
  const Icon = mode.icon;
  return <Link className="translation-mode-link" href={mode.href}>
    <span className="translation-mode-link-icon" aria-hidden="true"><Icon size={18} /></span>
    <span className="translation-mode-link-copy">
      <strong>{mode.question}</strong>
      <small>{mode.target} · {mode.section}</small>
    </span>
    <ArrowRight size={17} aria-hidden="true" />
  </Link>;
}
