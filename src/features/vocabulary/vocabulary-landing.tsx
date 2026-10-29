"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpen, BookOpenCheck, Bookmark, Brain, CheckCircle2, GraduationCap,
  Headphones, Layers3, Puzzle, RotateCcw, Search, Sparkles, Target,
  type LucideIcon,
} from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { useStudiedWords } from "./use-studied-words";
import "./vocabulary-landing.css";

type Category = "all" | "ielts" | "cefr" | "collocations" | "listening" | "reading" | "families" | "translation" | "personal";
type CollectionCard = {
  title: string;
  detail: string;
  description: string;
  href: string;
  category: Category;
  icon: LucideIcon;
  art: string;
};

const categories: { id: Category; label: string }[] = [
  { id: "all", label: "Tất cả bộ từ" },
  { id: "ielts", label: "IELTS" },
  { id: "cefr", label: "A1–C2" },
  { id: "collocations", label: "Collocations" },
  { id: "listening", label: "IELTS Listening" },
  { id: "reading", label: "IELTS Reading" },
  { id: "families", label: "Word Families" },
  { id: "translation", label: "Luyện dịch câu" },
  { id: "personal", label: "Từ của tôi" },
];

export function VocabularyLanding() {
  const { entries, ready } = useNotebook();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const { studiedCount } = useStudiedWords();
  const [counts, setCounts] = useState<{ ielts?: number; cefr?: number }>({});
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const saved = entries.filter((entry) => entry.kind === "word").length;
  const total = counts.ielts !== undefined && counts.cefr !== undefined ? counts.ielts + counts.cefr : null;
  const progress = total && studiedCount !== null ? Math.min(100, Math.round(studiedCount / total * 100)) : 0;

  useEffect(() => {
    if (!db) return;
    let active = true;
    void Promise.all([
      db.from("ielts_vocabulary_entries").select("source_key", { count: "exact", head: true }).eq("published", true),
      db.from("vocabulary_bank_entries").select("source_id", { count: "exact", head: true }).eq("student_visible", true),
    ]).then(([ielts, cefr]) => {
      if (!active) return;
      setCounts({
        ...(ielts.error ? {} : { ielts: ielts.count ?? 0 }),
        ...(cefr.error ? {} : { cefr: cefr.count ?? 0 }),
      });
    });
    return () => { active = false; };
  }, [db]);

  const cards: CollectionCard[] = [
    { title: "Từ vựng IELTS", detail: `${counts.ielts?.toLocaleString("vi-VN") ?? "…"} từ · 40 chủ đề`, description: "Học từ theo chủ đề và band gợi ý.", href: "/app/vocabulary/study?collection=ielts", category: "ielts", icon: GraduationCap, art: "ielts" },
    { title: "Từ A1–C2", detail: `${counts.cefr?.toLocaleString("vi-VN") ?? "…"} từ · 36 chủ đề`, description: "Đi từ nền tảng đến nâng cao theo CEFR.", href: "/app/vocabulary/study?collection=cefr", category: "cefr", icon: Layers3, art: "cefr" },
    { title: "Collocations A1–C2", detail: "988 cụm từ", description: "Ghép từ tự nhiên, xem ví dụ và ôn đúng hạn.", href: "/app/vocabulary/collocations", category: "collocations", icon: Puzzle, art: "collocations" },
    { title: "Từ vựng IELTS Listening", detail: "1.200 từ · 35 chủ đề", description: "Luyện nghe, chọn nghĩa và chép chính tả.", href: "/app/vocabulary/listening", category: "listening", icon: Headphones, art: "listening" },
    { title: "Từ vựng IELTS Reading", detail: "607 từ · 11 chủ đề", description: "Học theo câu, ôn SRS và theo lộ trình 84 ngày.", href: "/app/reading/vocabulary", category: "reading", icon: BookOpen, art: "reading" },
    { title: "Word Families", detail: "300 họ từ", description: "Học noun, verb, adjective và adverb cùng nhau.", href: "/app/vocabulary/word-formation", category: "families", icon: Brain, art: "families" },
    { title: "Luyện dịch câu Việt → Anh", detail: "40 chủ đề · Speaking & Writing", description: "Viết câu, xem bản mẫu và tự đánh giá. Câu mới mở sau khi biên tập.", href: "/app/vocabulary/translation", category: "translation", icon: BookOpenCheck, art: "reading" },
    { title: "Từ đã lưu", detail: `${ready ? saved.toLocaleString("vi-VN") : "…"} từ của bạn`, description: "Mở sổ tay và học lại các từ đã đánh dấu.", href: "/app/vocabulary/review", category: "personal", icon: Bookmark, art: "saved" },
  ];
  const filteredCards = cards.filter((card) => (category === "all" || card.category === category)
    && `${card.title} ${card.detail} ${card.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <main className="vocabulary-landing">
    <header className="vocabulary-landing-hero">
      <div className="vocabulary-landing-hero-copy">
        <span className="vocabulary-landing-eyebrow">THƯ VIỆN TỪ VỰNG</span>
        <h1>Hôm nay <em>bạn muốn học gì?</em></h1>
        <p>Chọn một bộ từ phù hợp với mục tiêu của bạn, rồi bắt đầu học ngay.</p>
        <div className="vocabulary-landing-hero-stats" aria-label="Tiến độ từ vựng">
          <span><BookOpen size={20} /><strong>{studiedCount === null ? "…" : studiedCount.toLocaleString("vi-VN")}</strong><small>từ đã học</small></span>
          <span><Bookmark size={20} /><strong>{ready ? saved.toLocaleString("vi-VN") : "…"}</strong><small>từ đã lưu</small></span>
          <span><Layers3 size={20} /><strong>6</strong><small>bộ từ để học</small></span>
        </div>
      </div>
      <div className="vocabulary-landing-hero-art" aria-hidden="true"><span className="book book-one">IELTS</span><span className="book book-two">A1–C2</span><span className="book book-three">LISTENING</span><BookOpen size={68} strokeWidth={1.7} /><Sparkles className="spark" size={25} /></div>
    </header>

    <div className="vocabulary-landing-layout">
      <div className="vocabulary-landing-main">
        <div className="vocabulary-landing-toolbar">
          <div className="vocabulary-landing-tabs" role="group" aria-label="Lọc bộ từ">
            {categories.map((item) => <button key={item.id} type="button" className={category === item.id ? "active" : ""} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}
          </div>
          <label className="vocabulary-landing-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm bộ từ vựng…" aria-label="Tìm bộ từ vựng" /></label>
        </div>
        <div className="vocabulary-landing-section-head"><h2>{category === "all" ? "Tất cả bộ từ vựng" : categories.find((item) => item.id === category)?.label} <small>({filteredCards.length})</small></h2></div>
        {filteredCards.length ? <div className="vocabulary-landing-card-grid">
          {filteredCards.map((card) => <Link className="vocabulary-landing-card" href={card.href} key={card.title}>
            <span className={`vocabulary-landing-card-art ${card.art}`}><card.icon size={52} strokeWidth={1.6} /></span>
            <span className="vocabulary-landing-card-copy"><strong>{card.title}</strong><small>{card.detail}</small><span>{card.description}</span></span>
            <span className="vocabulary-landing-card-arrow"><ArrowRight size={18} /></span>
          </Link>)}
        </div> : <p className="vocabulary-landing-empty">Không tìm thấy bộ từ phù hợp.</p>}
        <div className="vocabulary-landing-library-links"><Link href="/app/vocabulary/library?collection=ielts">Khám phá chủ đề IELTS <ArrowRight size={16} /></Link><Link href="/app/vocabulary/library?collection=cefr">Khám phá chủ đề A1–C2 <ArrowRight size={16} /></Link></div>
      </div>

      <aside className="vocabulary-landing-side" aria-label="Tiến độ và gợi ý học">
        <section className="vocabulary-landing-continue"><span className="vocabulary-landing-eyebrow">BẮT ĐẦU NHANH</span><h2>Học từ IELTS hôm nay</h2><p>Chọn chủ đề và band gợi ý, sau đó luyện bằng thẻ hoặc bài tập.</p><Link href="/app/vocabulary/study?collection=ielts">Bắt đầu học <ArrowRight size={17} /></Link></section>
        <section className="vocabulary-landing-progress"><div className="vocabulary-landing-side-heading"><h2>Tiến độ của bạn</h2><Target size={20} /></div><div className="vocabulary-landing-progress-number"><strong>{studiedCount === null ? "…" : studiedCount.toLocaleString("vi-VN")}</strong><span>/ {total === null ? "…" : total.toLocaleString("vi-VN")} từ trong hai kho IELTS và A1–C2</span></div><div className="vocabulary-landing-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến độ học từ IELTS và A1–C2"><span style={{ width: `${progress}%` }} /></div><small>{progress}% đã học</small><div className="vocabulary-landing-progress-saved"><Bookmark size={17} /> Từ đã lưu <b>{ready ? saved : "…"}</b></div><Link href="/app/vocabulary/review">Ôn từ đã lưu <ArrowRight size={16} /></Link></section>
        <section className="vocabulary-landing-suggestion"><span className="vocabulary-landing-eyebrow">GỢI Ý HÔM NAY <Sparkles size={15} /></span><h2>Thử học qua nghe</h2><p>Chọn một trong 35 chủ đề của bộ IELTS Listening và luyện với 1.200 từ.</p><Link href="/app/vocabulary/listening"><Headphones size={18} /> Học IELTS Listening <ArrowRight size={16} /></Link></section>
        <section className="vocabulary-landing-side-actions"><h2>Luyện theo cách của bạn</h2><Link href="/app/vocabulary/study?collection=ielts&mode=cards"><Layers3 size={18} /> Thẻ lật <ArrowRight size={16} /></Link><Link href="/app/vocabulary/study?collection=ielts&mode=choice"><CheckCircle2 size={18} /> Trắc nghiệm <ArrowRight size={16} /></Link><Link href="/app/vocabulary/review"><RotateCcw size={18} /> Ôn tập <ArrowRight size={16} /></Link></section>
      </aside>
    </div>
    <p className="vocabulary-landing-note">Band trong bộ IELTS là gợi ý học tập ước lượng, không phải band chính thức của từng từ.</p>
  </main>;
}
