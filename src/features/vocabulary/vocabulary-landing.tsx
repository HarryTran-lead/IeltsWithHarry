"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Bookmark, Layers3, RotateCcw, Search } from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import "./vocabulary-landing.css";

export function VocabularyLanding() {
  const { entries, ready } = useNotebook();
  const saved = entries.filter((entry) => entry.kind === "word").length;

  return <main className="vocabulary-landing">
    <header className="vocabulary-landing-intro">
      <span className="vocabulary-landing-eyebrow">VOCABULARY · BẮT ĐẦU TẠI ĐÂY</span>
      <h1>Hôm nay học từ nào?</h1>
      <p>Chọn một bộ từ để bắt đầu với thẻ lật. Bạn có thể đổi chủ đề, trình độ và cách luyện trong buổi học.</p>
    </header>

    <section className="vocabulary-landing-collections" aria-label="Chọn bộ từ để học">
      <article className="vocabulary-landing-collection featured">
        <span className="vocabulary-landing-badge">Gợi ý cho người học IELTS</span>
        <span className="vocabulary-landing-icon"><Layers3 size={30} strokeWidth={1.8} /></span>
        <div>
          <span className="vocabulary-landing-step">BỘ TỪ 01</span>
          <h2>Từ vựng IELTS</h2>
          <p>Học theo chủ đề và band gợi ý 1–7+. Bắt đầu bằng thẻ lật, rồi thử trắc nghiệm hoặc ghép cặp.</p>
        </div>
        <div className="vocabulary-landing-card-footer"><span>Band học tập là ước lượng</span><Link href="/app/vocabulary/study?collection=ielts">Bắt đầu học <ArrowRight size={19} /></Link></div>
      </article>

      <article className="vocabulary-landing-collection">
        <span className="vocabulary-landing-icon"><BookOpen size={30} strokeWidth={1.8} /></span>
        <div>
          <span className="vocabulary-landing-step">BỘ TỪ 02</span>
          <h2>Từ vựng A1–C2</h2>
          <p>Xây nền từ vựng theo sáu mức CEFR. Học từng chủ đề và chọn mức phù hợp với bạn.</p>
        </div>
        <div className="vocabulary-landing-card-footer"><span>Từ cơ bản đến nâng cao</span><Link href="/app/vocabulary/study?collection=cefr">Bắt đầu học <ArrowRight size={19} /></Link></div>
      </article>
    </section>

    <section className="vocabulary-landing-next" aria-label="Tiếp tục học từ vựng">
      <div><span className="vocabulary-landing-eyebrow">TIẾP TỤC HỌC</span><h2>Đã học rồi? Ôn lại từ của bạn.</h2><p>{ready ? `${saved} từ đã lưu trong sổ tay` : "Đang tải sổ tay…"}</p></div>
      <Link href="/app/vocabulary/review"><RotateCcw size={19} /> Ôn từ đã lưu <ArrowRight size={18} /></Link>
    </section>

    <nav className="vocabulary-landing-tools" aria-label="Công cụ từ vựng khác">
      <Link href="/app/vocabulary/library"><BookOpen size={18} /> Xem kho từ <ArrowRight size={16} /></Link>
      <Link href="/app/vocabulary/notebook"><Bookmark size={18} /> Từ đã lưu <ArrowRight size={16} /></Link>
      <Link href="/app/vocabulary/explore"><Search size={18} /> Tra từ <ArrowRight size={16} /></Link>
    </nav>
  </main>;
}
