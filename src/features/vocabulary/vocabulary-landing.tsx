"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Bookmark, Layers3, RotateCcw, Search, Sparkles } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import { useNotebook } from "@/features/notebook/notebook-store";
import sourceTopics from "@/lib/vocabulary/source-topics.json";
import ieltsTopics from "@/lib/vocabulary/ielts-topics.json";
import ieltsLearningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import { cefrLevels } from "@/lib/vocabulary/cefr-levels";
import { ieltsBands } from "@/lib/vocabulary/ielts-bands";
import "./vocabulary-landing.css";

type Collection = "ielts" | "cefr";
const pageSize = 12;

export function VocabularyLanding() {
  const { entries, ready } = useNotebook();
  const [collection, setCollection] = useState<Collection>("ielts");
  const [level, setLevel] = useState("");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const saved = entries.filter((entry) => entry.kind === "word").length;
  const topics = useMemo(() => collection === "ielts" ? [...ieltsTopics, ...ieltsLearningTopics] : sourceTopics, [collection]);
  const filteredTopics = useMemo(() => topics.filter((topic) => topic.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [topics, query]);
  const levels = collection === "ielts" ? ieltsBands : cefrLevels;
  const studyHref = (topic?: string, mode = "cards") => `/app/vocabulary/study?${new URLSearchParams({ collection, ...(topic ? { topic } : {}), ...(level ? { level } : {}), mode })}`;

  return <main className="vocabulary-landing">
    <header className="vocabulary-landing-hero">
      <div><span className="vocabulary-landing-eyebrow">VOCABULARY · BẮT ĐẦU HỌC</span><h1>Hôm nay <em>bạn muốn học gì?</em></h1><p>Chọn một chủ đề, rồi bắt đầu học ngay. Bạn có thể đổi bộ từ và cách luyện trong buổi học.</p></div>
      <span className="vocabulary-landing-hero-art" aria-hidden="true"><BookOpen size={58} strokeWidth={1.5} /><Sparkles size={23} /></span>
    </header>

    <div className="vocabulary-landing-layout">
      <div className="vocabulary-landing-main">
        <section className="vocabulary-landing-filters" aria-label="Tìm chủ đề học">
          <label><span>Bộ từ</span><select value={collection} onChange={(event) => { setCollection(event.target.value as Collection); setLevel(""); setVisibleCount(pageSize); }}><option value="ielts">Từ IELTS · Band 1–7+</option><option value="cefr">Từ A1–C2</option></select></label>
          <label><span>Trình độ</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">{collection === "ielts" ? "Mọi band gợi ý" : "Mọi mức CEFR"}</option>{levels.map((item) => <option key={item} value={item}>{collection === "ielts" ? `Band ${item}` : item}</option>)}</select></label>
          <label className="vocabulary-landing-search"><span>Tìm chủ đề</span><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(pageSize); }} placeholder="Tên chủ đề…" /></label>
        </section>

        <div className="vocabulary-landing-section-head"><div><span className="vocabulary-landing-eyebrow">CHỌN MỘT CHỦ ĐỀ ĐỂ BẮT ĐẦU</span><h2>{collection === "ielts" ? "Chủ đề IELTS" : "Chủ đề A1–C2"} <small>({filteredTopics.length})</small></h2></div><Link href={studyHref()}>Học mọi chủ đề <ArrowRight size={16} /></Link></div>
        {filteredTopics.length ? <div className="vocabulary-landing-topic-grid">{filteredTopics.slice(0, visibleCount).map((topic) => <article className="vocabulary-landing-topic" key={topic}>
          <TopicArt topic={topic} className="vocabulary-landing-topic-art" badge={false} />
          <div className="vocabulary-landing-topic-content"><h3>{topic}</h3><span>{collection === "ielts" ? "Từ vựng IELTS" : "Từ vựng CEFR"}{level ? ` · ${collection === "ielts" ? "Band " : ""}${level}` : ""}</span><Link href={studyHref(topic)}>Bắt đầu học <ArrowRight size={16} /></Link></div>
        </article>)}</div> : <p className="vocabulary-landing-empty">Không tìm thấy chủ đề phù hợp. Thử một từ khóa khác.</p>}
        {visibleCount < filteredTopics.length && <button className="vocabulary-landing-more" type="button" onClick={() => setVisibleCount((count) => count + pageSize)}>Xem thêm chủ đề <ArrowRight size={16} /></button>}
      </div>

      <aside className="vocabulary-landing-side" aria-label="Công cụ học từ vựng">
        <section><span className="vocabulary-landing-eyebrow">TIẾN ĐỘ CỦA BẠN</span><h2>Từ đã lưu</h2><strong>{ready ? saved : "…"}</strong><p>{saved ? "Ôn lại những từ bạn đã lưu." : "Lưu từ khi học để tạo bộ ôn tập riêng."}</p><Link href="/app/vocabulary/review"><RotateCcw size={17} /> Ôn từ đã lưu <ArrowRight size={16} /></Link></section>
        <section><span className="vocabulary-landing-eyebrow">CÁCH HỌC</span><h2>Chọn cách luyện</h2><Link href={studyHref(undefined, "cards")}><Layers3 size={18} /> Thẻ lật <ArrowRight size={16} /></Link><Link href={studyHref(undefined, "choice")}><BookOpen size={18} /> Trắc nghiệm <ArrowRight size={16} /></Link><Link href={studyHref(undefined, "type")}><Sparkles size={18} /> Gõ từ <ArrowRight size={16} /></Link></section>
        <section className="vocabulary-landing-quick"><span className="vocabulary-landing-eyebrow">CÔNG CỤ KHÁC</span><Link href={`/app/vocabulary/library?collection=${collection}`}><BookOpen size={17} /> Xem kho từ</Link><Link href="/app/vocabulary/notebook"><Bookmark size={17} /> Từ đã lưu</Link><Link href="/app/vocabulary/explore"><Search size={17} /> Tra từ</Link></section>
      </aside>
    </div>
    {collection === "ielts" && <p className="vocabulary-landing-note">Band của bộ IELTS là gợi ý học tập ước lượng, không phải band chính thức của từng từ.</p>}
  </main>;
}
