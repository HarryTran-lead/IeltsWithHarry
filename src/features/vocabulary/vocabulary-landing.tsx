"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Headphones, Layers3, RotateCcw, Search, Sparkles, Target } from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { useStudiedWords } from "./use-studied-words";
import { useWordSrs } from "./use-word-srs";
import { reviewQueue, wordState, wordStateLabels, type WordState } from "@/lib/vocabulary/study-session";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import "./vocabulary-landing.css";
import "./vocabulary-learning-loop.css";

type Category = "all" | "ielts" | "cefr" | "collocations" | "listening" | "reading" | "families" | "translation" | "personal";
type CollectionCard = {
  title: string;
  detail: string;
  description: string;
  href: string;
  category: Category;
  sticker: StickerName;
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
  const [lookup, setLookup] = useState("");
  const router = useRouter();
  const savedWords = useMemo(() => entries.filter((entry) => entry.kind === "word"), [entries]);
  const saved = savedWords.length;
  const { reviews, loaded: reviewsLoaded } = useWordSrs();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { void Promise.resolve().then(() => setNow(Date.now())); }, []);
  // Today's plan: the review queue (overdue first, capped new words) and ten new words.
  const dueToday = now !== null && ready && reviewsLoaded ? reviewQueue(savedWords, reviews, now).length : null;
  const states = useMemo(() => {
    const counts = { new: 0, learning: 0, reviewing: 0, mastered: 0 } as Record<WordState, number>;
    savedWords.forEach((entry) => { counts[wordState(reviews.get(entry.id))] += 1; });
    return counts;
  }, [savedWords, reviews]);
  const minutes = dueToday === null ? null : Math.max(5, Math.ceil(dueToday * 8 / 60) + 5);

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
    { title: "Từ vựng IELTS", detail: `${counts.ielts?.toLocaleString("vi-VN") ?? "…"} từ · 40 chủ đề`, description: "Học từ theo chủ đề và band gợi ý.", href: "/app/vocabulary/study?collection=ielts", category: "ielts", sticker: "cap", art: "ielts" },
    { title: "Từ A1–C2", detail: `${counts.cefr?.toLocaleString("vi-VN") ?? "…"} từ · 36 chủ đề`, description: "Đi từ nền tảng đến nâng cao theo CEFR.", href: "/app/vocabulary/study?collection=cefr", category: "cefr", sticker: "chart", art: "cefr" },
    { title: "Collocations A1–C2", detail: "988 cụm từ", description: "Ghép từ tự nhiên, xem ví dụ và ôn đúng hạn.", href: "/app/vocabulary/collocations", category: "collocations", sticker: "puzzle", art: "collocations" },
    { title: "Từ vựng IELTS Listening", detail: "1.200 từ · 35 chủ đề", description: "Luyện nghe, chọn nghĩa và chép chính tả.", href: "/app/vocabulary/listening", category: "listening", sticker: "headphones", art: "listening" },
    { title: "Từ vựng IELTS Reading", detail: "607 từ · 11 chủ đề", description: "Học theo câu, ôn SRS và theo lộ trình 84 ngày.", href: "/app/reading/vocabulary", category: "reading", sticker: "book", art: "reading" },
    { title: "Word Families", detail: "300 họ từ", description: "Học noun, verb, adjective và adverb cùng nhau.", href: "/app/vocabulary/word-formation", category: "families", sticker: "tree", art: "families" },
    { title: "Luyện dịch câu Việt → Anh", detail: "40 chủ đề · Speaking & Writing", description: "Viết câu, xem bản mẫu và tự đánh giá. Câu mới mở sau khi biên tập.", href: "/app/vocabulary/translation", category: "translation", sticker: "bubble", art: "reading" },
    { title: "Từ đã lưu", detail: `${ready ? saved.toLocaleString("vi-VN") : "…"} từ của bạn`, description: "Mở Sổ từ: lọc, gắn sao và ôn lại từ đã lưu.", href: "/app/vocabulary/notebook", category: "personal", sticker: "notebook", art: "saved" },
  ];
  const filteredCards = cards.filter((card) => (category === "all" || card.category === category)
    && `${card.title} ${card.detail} ${card.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return <div className="vocabulary-landing">
    <header className="vocabulary-landing-hero vocabulary-today">
      <div className="vocabulary-landing-hero-copy">
        <span className="vocabulary-landing-eyebrow">HÔM NAY</span>
        <h1>{dueToday ? <>Ôn <em>{dueToday} từ</em>, rồi học 10 từ mới</> : <>Bắt đầu với <em>10 từ hôm nay</em></>}</h1>
        <p>{dueToday === null ? "Đang chuẩn bị kế hoạch học hôm nay…" : dueToday ? `Ôn từ đến hạn trước để không quên, sau đó học từ mới. Khoảng ${minutes} phút.` : "Không có từ đến hạn. Học 10 từ mới; chúng sẽ tự vào lịch ôn."}</p>
        <div className="vocabulary-landing-hero-actions">{dueToday ? <><Link href="/app/vocabulary/review">Ôn {dueToday} từ đến hạn <ArrowRight size={17} /></Link><Link href="/app/vocabulary/study?collection=ielts">Học 10 từ mới</Link></> : <><Link href="/app/vocabulary/study?collection=ielts">Học 10 từ IELTS <ArrowRight size={17} /></Link><Link href="/app/vocabulary/study?collection=cefr">Học từ A1–C2</Link></>}</div>
      </div>
      <ol className="vocabulary-today-steps" aria-label="Các bước học hôm nay">
        <li className={dueToday ? "active" : "done"}><Link href="/app/vocabulary/review"><RotateCcw size={18} /><span><b>Ôn tập</b>{dueToday === null ? "…" : dueToday ? `${dueToday} thẻ` : "Không có thẻ"}</span></Link></li>
        <li className={dueToday ? "" : "active"}><Link href="/app/vocabulary/study?collection=ielts"><Sparkles size={18} /><span><b>Học từ mới</b>10 từ · xem, chọn, gõ</span></Link></li>
        <li><CheckCircle2 size={18} /><span><b>Tự vào lịch ôn</b>FSRS nhắc lại đúng lúc</span></li>
      </ol>
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
            <span className={`vocabulary-landing-card-art ${card.art}`}><Sticker name={card.sticker} size={56} tilt={-6} pop={false} /></span>
            <span className="vocabulary-landing-card-copy"><strong>{card.title}</strong><small>{card.detail}</small><span>{card.description}</span></span>
            <span className="vocabulary-landing-card-arrow"><ArrowRight size={18} /></span>
          </Link>)}
        </div> : <p className="vocabulary-landing-empty">Không tìm thấy bộ từ phù hợp.</p>}
        <div className="vocabulary-landing-library-links"><Link href="/app/vocabulary/library?collection=ielts">Khám phá chủ đề IELTS <ArrowRight size={16} /></Link><Link href="/app/vocabulary/library?collection=cefr">Khám phá chủ đề A1–C2 <ArrowRight size={16} /></Link></div>
      </div>

      <aside className="vocabulary-landing-side" aria-label="Tiến độ và gợi ý học">
        <section className="vocabulary-landing-continue"><span className="vocabulary-landing-eyebrow">TRA TỪ</span><h2>Gặp từ lạ?</h2><p>Tra nghĩa, nghe phát âm và lưu vào Sổ từ để ôn.</p><form className="vocabulary-landing-lookup" onSubmit={(event) => { event.preventDefault(); if (lookup.trim()) router.push(`/app/vocabulary/explore?q=${encodeURIComponent(lookup.trim())}`); }}><input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Ví dụ: sustainable" aria-label="Tra từ tiếng Anh" /><button type="submit" disabled={!lookup.trim()}>Tra <ArrowRight size={16} /></button></form></section>
        <section className="vocabulary-landing-progress"><div className="vocabulary-landing-side-heading"><h2>Sổ từ của bạn</h2><Target size={20} /></div><div className="vocabulary-landing-states">{(["new", "learning", "reviewing", "mastered"] as WordState[]).map((state) => <div key={state}><span className={`vocab-state ${state}`}>{wordStateLabels[state]}</span><strong>{ready && reviewsLoaded ? states[state].toLocaleString("vi-VN") : "…"}</strong></div>)}</div><small>{ready ? `${saved.toLocaleString("vi-VN")} từ trong sổ · ${studiedCount === null ? "…" : studiedCount.toLocaleString("vi-VN")} từ đã học qua.` : "…"} “Đã thuộc” là từ có khoảng ôn từ 21 ngày.</small><Link href="/app/vocabulary/progress">Xem tiến độ <ArrowRight size={16} /></Link></section>
        <section className="vocabulary-landing-suggestion"><span className="vocabulary-landing-eyebrow">GỢI Ý HÔM NAY <Sparkles size={15} /></span><h2>Thử học qua nghe</h2><p>Chọn một trong 35 chủ đề của bộ IELTS Listening và luyện với 1.200 từ.</p><Link href="/app/vocabulary/listening"><Headphones size={18} /> Học IELTS Listening <ArrowRight size={16} /></Link></section>
        <section className="vocabulary-landing-side-actions"><h2>Luyện theo cách của bạn</h2><Link href="/app/vocabulary/study?collection=ielts&mode=cards"><Layers3 size={18} /> Thẻ lật <ArrowRight size={16} /></Link><Link href="/app/vocabulary/study?collection=ielts&mode=choice"><CheckCircle2 size={18} /> Trắc nghiệm <ArrowRight size={16} /></Link><Link href="/app/vocabulary/review"><RotateCcw size={18} /> Ôn tập <ArrowRight size={16} /></Link></section>
      </aside>
    </div>
    <p className="vocabulary-landing-note">Band trong bộ IELTS là gợi ý học tập ước lượng, không phải band chính thức của từng từ.</p>
  </div>;
}
