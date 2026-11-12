"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bookmark, Check, Keyboard, Layers3, ListChecks, Puzzle, Search, Sparkles, Timer, Volume2 } from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { catalog } from "@/lib/vocabulary/catalog";
import { pronounce } from "@/lib/vocabulary/pronounce";
import { useStudiedWords } from "./use-studied-words";
import { useWordSrs } from "./use-word-srs";
import { reviewQueue, wordState, wordStateLabels, MASTERED_DAYS, type WordState } from "@/lib/vocabulary/study-session";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import "./vocabulary-landing.css";
import "./vocabulary-learning-loop.css";

type Counts = { ielts?: number; cefr?: number; studiedIelts?: number; studiedCefr?: number };
type DailyWord = { term: string; pos: string; meaning: string; example: string; topic: string; band: string };
type Tile = { title: string; detail: string; description: string; href: string; sticker: StickerName; tone: string };

const skillSets: Tile[] = [
  { title: "Collocations", detail: "988 cụm từ · A1–C2", description: "Ghép từ cho tự nhiên", href: "/app/vocabulary/collocations", sticker: "puzzle", tone: "peach" },
  { title: "IELTS Listening", detail: "1.200 từ · 35 chủ đề", description: "Nghe, chọn nghĩa, chép chính tả", href: "/app/vocabulary/listening", sticker: "headphones", tone: "aqua" },
  { title: "IELTS Reading", detail: "607 từ · lộ trình 84 ngày", description: "Học từ trong câu đọc thật", href: "/app/reading/vocabulary", sticker: "book", tone: "sky" },
  { title: "Word Families", detail: "300 họ từ", description: "Noun, verb, adjective, adverb", href: "/app/vocabulary/word-formation", sticker: "tree", tone: "lime" },
];

const playModes: { id: string; title: string; detail: string; icon: typeof Layers3; tag?: string }[] = [
  { id: "learn", title: "Học", detail: "Xem → chọn → gõ", icon: Sparkles, tag: "Khuyên dùng" },
  { id: "cards", title: "Thẻ lật", detail: "Lật và tự chấm", icon: Layers3 },
  { id: "choice", title: "Trắc nghiệm", detail: "Chọn nghĩa đúng", icon: ListChecks },
  { id: "type", title: "Gõ từ", detail: "Nhớ lại chính tả", icon: Keyboard },
  { id: "match", title: "Ghép cặp", detail: "Đua với đồng hồ", icon: Timer },
];

const journey: { state: WordState; hint: string }[] = [
  { state: "new", hint: "chưa ôn" },
  { state: "learning", hint: "vừa học" },
  { state: "reviewing", hint: "đang giãn cách" },
  { state: "mastered", hint: `ôn cách ≥ ${MASTERED_DAYS} ngày` },
];

const dayNumber = (time: number) => Math.floor((time - new Date(time).getTimezoneOffset() * 60_000) / 86_400_000);
const percent = (part = 0, whole = 0) => whole ? Math.min(100, (part / whole) * 100) : 0;
const vi = (value?: number) => value === undefined ? "…" : value.toLocaleString("vi-VN");

/** The word of the day: the same word for everyone on a given day, from the Band 5–6 IELTS words. */
function useDailyWord(now: number | null) {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [word, setWord] = useState<DailyWord | null>(null);
  useEffect(() => {
    if (now === null) return;
    const day = dayNumber(now);
    if (!db) {
      const term = catalog[day % catalog.length];
      void Promise.resolve().then(() => setWord({ term: term.word, pos: term.pos, meaning: term.meaning, example: term.example, topic: term.topic, band: term.level }));
      return;
    }
    let alive = true;
    const pool = () => db.from("ielts_vocabulary_entries").select("term,pos_raw,definition_en,examples,topic,band_level", { count: "exact" })
      .eq("published", true).in("band_level", ["5", "6"]).order("source_key");
    void pool().range(0, 0).then(async (first) => {
      if (!alive || first.error || !first.count) return;
      const at = day % first.count;
      const row = at ? (await pool().range(at, at)).data?.[0] : first.data?.[0];
      if (alive && row) setWord({ term: row.term, pos: row.pos_raw, meaning: row.definition_en, example: row.examples?.[0] ?? "", topic: row.topic, band: `Band ${row.band_level}` });
    });
    return () => { alive = false; };
  }, [db, now]);
  return word;
}

export function VocabularyLanding() {
  const { entries, ready, addEntry } = useNotebook();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const { studiedCount } = useStudiedWords();
  const { reviews, loaded: reviewsLoaded } = useWordSrs();
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>({});
  const [lookup, setLookup] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [savingDaily, setSavingDaily] = useState(false);
  useEffect(() => { void Promise.resolve().then(() => setNow(Date.now())); }, []);
  const savedWords = useMemo(() => entries.filter((entry) => entry.kind === "word"), [entries]);
  const loadedAll = ready && reviewsLoaded;
  const queue = useMemo(() => now !== null && loadedAll ? reviewQueue(savedWords, reviews, now) : null, [now, loadedAll, savedWords, reviews]);
  const due = queue?.length ?? null;
  const minutes = due === null ? null : Math.max(5, Math.ceil(due * 8 / 60) + 5);
  const states = useMemo(() => {
    const result = { new: 0, learning: 0, reviewing: 0, mastered: 0 } as Record<WordState, number>;
    savedWords.forEach((entry) => { result[wordState(reviews.get(entry.id))] += 1; });
    return result;
  }, [savedWords, reviews]);
  const daily = useDailyWord(now);
  const dailySaved = Boolean(daily && savedWords.some((entry) => entry.title.trim().toLowerCase() === daily.term.trim().toLowerCase()));

  useEffect(() => {
    if (!db) return;
    let active = true;
    const studied = (collection: "ielts" | "cefr") => db.from("vocabulary_studied_words").select("source_id", { count: "exact", head: true }).eq("collection", collection);
    void Promise.all([
      db.from("ielts_vocabulary_entries").select("source_key", { count: "exact", head: true }).eq("published", true),
      db.from("vocabulary_bank_entries").select("source_id", { count: "exact", head: true }).eq("student_visible", true),
      studied("ielts"), studied("cefr"),
    ]).then(([ielts, cefr, studiedIelts, studiedCefr]) => {
      if (!active) return;
      setCounts({
        ...(ielts.error ? {} : { ielts: ielts.count ?? 0 }), ...(cefr.error ? {} : { cefr: cefr.count ?? 0 }),
        ...(studiedIelts.error ? {} : { studiedIelts: studiedIelts.count ?? 0 }), ...(studiedCefr.error ? {} : { studiedCefr: studiedCefr.count ?? 0 }),
      });
    });
    return () => { active = false; };
  }, [db]);

  async function saveDaily() {
    if (!daily || dailySaved || savingDaily) return;
    setSavingDaily(true);
    try { await addEntry({ kind: "word", title: daily.term, body: "", meaningVi: daily.meaning, example: daily.example, partOfSpeech: daily.pos, topic: daily.topic }, "/app/vocabulary"); }
    finally { setSavingDaily(false); }
  }

  const stack = (queue ?? []).slice(0, 3);
  const steps = [
    { title: "Ôn tập", detail: due === null ? "…" : due ? `${due} thẻ đến hạn` : "Không có thẻ", state: due ? "active" : "done" },
    { title: "Học từ mới", detail: "10 từ · xem, chọn, gõ", state: due ? "next" : "active" },
    { title: "Vào lịch ôn", detail: "FSRS nhắc đúng lúc", state: "next" },
  ];
  const featured = [
    { key: "ielts", title: "Từ vựng IELTS", detail: `${vi(counts.ielts)} từ · 40 chủ đề`, note: "Theo chủ đề và band gợi ý 1–7+", studied: counts.studiedIelts, total: counts.ielts, sticker: "cap" as StickerName, study: "/app/vocabulary/study?collection=ielts", library: "/app/vocabulary/library?collection=ielts" },
    { key: "cefr", title: "Từ A1–C2", detail: `${vi(counts.cefr)} từ · 36 chủ đề`, note: "Từ nền tảng đến nâng cao theo CEFR", studied: counts.studiedCefr, total: counts.cefr, sticker: "chart" as StickerName, study: "/app/vocabulary/study?collection=cefr", library: "/app/vocabulary/library?collection=cefr" },
  ];
  const known = states.reviewing + states.mastered;

  return <div className="vocabulary-landing vocab-home">
    <section className="vh-hero" aria-labelledby="vh-hero-title">
      <div className="vh-hero-copy">
        <span className="vh-eyebrow"><Sparkles size={14} /> HÔM NAY{minutes ? ` · KHOẢNG ${minutes} PHÚT` : ""}</span>
        <h1 id="vh-hero-title">{due ? <>Ôn <em>{due} từ</em>, rồi học 10 từ mới</> : <>Sẵn sàng cho <em>10 từ mới</em></>}</h1>
        <p>{due === null ? "Đang chuẩn bị kế hoạch học hôm nay…" : due ? "Ôn những từ sắp quên trước, sau đó học từ mới. Mỗi từ sẽ tự quay lại đúng lúc." : "Không có thẻ đến hạn. Học 10 từ mới, chúng sẽ tự vào lịch ôn."}</p>
        <ol className="vh-path" aria-label="Các bước học hôm nay">
          {steps.map((step, index) => <li key={step.title} className={`is-${step.state}`}><span className="vh-path-dot">{step.state === "done" ? <Check size={14} /> : index + 1}</span><span><b>{step.title}</b><small>{step.detail}</small></span></li>)}
        </ol>
        <div className="vh-hero-actions">
          {due ? <Link className="vh-button primary" href="/app/vocabulary/review">Bắt đầu ôn {due} thẻ <ArrowRight size={18} /></Link> : <Link className="vh-button primary" href="/app/vocabulary/study?collection=ielts">Học 10 từ IELTS <ArrowRight size={18} /></Link>}
          {due ? <Link className="vh-button ghost" href="/app/vocabulary/study?collection=ielts">Học 10 từ mới</Link> : <Link className="vh-button ghost" href="/app/vocabulary/study?collection=cefr">Học từ A1–C2</Link>}
        </div>
      </div>
      <Link className="vh-stack" href={due ? "/app/vocabulary/review" : "/app/vocabulary/study?collection=ielts"} aria-label={due ? `Ôn ${due} thẻ đến hạn` : "Học 10 từ mới"}>
        <span className="vh-stack-card back" aria-hidden="true" />
        <span className="vh-stack-card middle" aria-hidden="true">{stack[1] && <b>{stack[1].title}</b>}</span>
        <span className="vh-stack-card front">
          {stack[0] ? <><small>Bạn còn nhớ?</small><strong>{stack[0].title}</strong><span className="vh-stack-hint">Lật để xem nghĩa <ArrowRight size={14} /></span></>
            : <><Sticker name="rocket" size={64} tilt={-8} /><strong className="is-empty">10 từ mới</strong><span className="vh-stack-hint">Bắt đầu buổi học <ArrowRight size={14} /></span></>}
        </span>
        {due ? <span className="vh-stack-badge">{due}</span> : null}
      </Link>
    </section>

    <div className="vh-layout">
      <div className="vh-main">
        <section aria-labelledby="vh-paths-title">
          <div className="vh-section-head"><h2 id="vh-paths-title">Lộ trình chính</h2><span>Chọn một bộ, mỗi buổi 10 từ</span></div>
          <div className="vh-featured">
            {featured.map((item) => <article key={item.key} className={`vh-feature ${item.key}`}>
              <div className="vh-feature-copy">
                <h3>{item.title}</h3>
                <p className="vh-feature-detail">{item.detail}</p>
                <p className="vh-feature-note">{item.note}</p>
                <div className="vh-meter" role="img" aria-label={`Đã học ${vi(item.studied)} trên ${vi(item.total)} từ`}><span style={{ width: `${Math.max(item.studied ? 2 : 0, percent(item.studied, item.total))}%` }} /></div>
                <small>Đã học {vi(item.studied)} / {vi(item.total)} từ</small>
                <div className="vh-feature-actions"><Link href={item.study}>{item.studied ? "Học tiếp" : "Bắt đầu học"} <ArrowRight size={16} /></Link><Link href={item.library}>Xem chủ đề</Link></div>
              </div>
              <Sticker name={item.sticker} size={104} tilt={item.key === "ielts" ? -8 : 7} />
            </article>)}
          </div>
        </section>

        <section aria-labelledby="vh-skills-title">
          <div className="vh-section-head"><h2 id="vh-skills-title">Luyện theo kỹ năng</h2><span>Bộ từ gắn với từng phần thi</span></div>
          <div className="vh-tiles">
            {skillSets.map((tile) => <Link key={tile.title} href={tile.href} className={`vh-tile ${tile.tone}`}>
              <Sticker name={tile.sticker} size={52} tilt={-6} pop={false} />
              <strong>{tile.title}</strong>
              <small>{tile.detail}</small>
              <span>{tile.description}</span>
              <ArrowRight size={17} className="vh-tile-arrow" />
            </Link>)}
          </div>
        </section>

        <section aria-labelledby="vh-play-title">
          <div className="vh-section-head"><h2 id="vh-play-title">Chơi với từ</h2><span>Cùng 10 từ IELTS, đổi cách luyện</span></div>
          <div className="vh-modes">
            {playModes.map(({ id, title, detail, icon: Icon, tag }) => <Link key={id} href={`/app/vocabulary/study?collection=ielts&mode=${id}`} className={`vh-mode${tag ? " is-pick" : ""}`}>
              <span className="vh-mode-icon"><Icon size={20} /></span>
              <span><b>{title}</b><small>{detail}</small></span>
              {tag && <em>{tag}</em>}
            </Link>)}
          </div>
        </section>

        <section aria-labelledby="vh-use-title">
          <div className="vh-section-head"><h2 id="vh-use-title">Dùng từ đã học</h2></div>
          <div className="vh-use">
            <Link href="/app/vocabulary/translation" className="vh-use-card"><Sticker name="bubble" size={46} tilt={-6} pop={false} /><span><b>Dịch câu với từ vựng IELTS</b><small>40 chủ đề · 145 mốc · câu Speaking và Writing</small></span><ArrowRight size={18} /></Link>
            <Link href="/app/vocabulary/notebook" className="vh-use-card"><Sticker name="notebook" size={46} tilt={6} pop={false} /><span><b>Sổ từ của bạn</b><small>{ready ? `${vi(savedWords.length)} từ · lọc, gắn sao, ôn lại` : "…"}</small></span><ArrowRight size={18} /></Link>
          </div>
        </section>
      </div>

      <aside className="vh-side" aria-label="Từ của ngày, tiến độ và tra từ">
        <section className="vh-daily" aria-labelledby="vh-daily-title">
          <div className="vh-daily-head"><span className="vh-eyebrow"><Sticker name="star" size={20} pop={false} /> TỪ CỦA NGÀY</span>{daily && <span className="vh-chip">{daily.band}</span>}</div>
          {daily ? <>
            <h2 id="vh-daily-title">{daily.term}</h2>
            <p className="vh-daily-meta">{[daily.pos, daily.topic].filter(Boolean).join(" · ")}</p>
            <p className="vh-daily-meaning">{daily.meaning}</p>
            {daily.example && <blockquote>{daily.example}</blockquote>}
            <div className="vh-daily-actions">
              <button type="button" onClick={() => void pronounce(daily.term)} aria-label={`Nghe phát âm ${daily.term}`}><Volume2 size={17} /> Nghe</button>
              <button type="button" className={dailySaved ? "is-saved" : ""} disabled={dailySaved || savingDaily || !ready} onClick={() => void saveDaily()}>{dailySaved ? <><Check size={17} /> Đã lưu</> : <><Bookmark size={17} /> Lưu vào sổ</>}</button>
            </div>
          </> : <p className="vh-daily-meaning" id="vh-daily-title">Đang chọn từ hôm nay…</p>}
        </section>

        <section className="vh-journey" aria-labelledby="vh-journey-title">
          <div className="vh-daily-head"><h2 id="vh-journey-title">Hành trình ghi nhớ</h2><Link href="/app/vocabulary/progress">Chi tiết</Link></div>
          <div className="vh-journey-bar" role="img" aria-label={journey.map(({ state }) => `${wordStateLabels[state]} ${states[state]}`).join(", ")}>
            {journey.map(({ state }) => <span key={state} className={state} style={{ flexGrow: states[state] || 0.0001 }} />)}
          </div>
          <ol className="vh-journey-steps">
            {journey.map(({ state, hint }) => <li key={state} className={state}><b>{loadedAll ? vi(states[state]) : "…"}</b><span>{wordStateLabels[state]}</span><small>{hint}</small></li>)}
          </ol>
          <p>{!loadedAll ? "…" : known ? `${vi(known)} từ đã qua bước học đầu. Ôn đều mỗi ngày để chúng thành “Đã thuộc”.` : savedWords.length ? "Ôn các từ mới vài lần để chúng sang bước “Đang ôn”." : "Học buổi đầu tiên để bắt đầu hành trình."}{studiedCount ? ` Đã học qua ${vi(studiedCount)} từ.` : ""}</p>
        </section>

        <section className="vh-lookup" aria-labelledby="vh-lookup-title">
          <h2 id="vh-lookup-title">Gặp từ lạ?</h2>
          <p>Tra nghĩa, xem câu trong đề Reading và lưu vào Sổ từ.</p>
          <form onSubmit={(event) => { event.preventDefault(); if (lookup.trim()) router.push(`/app/vocabulary/explore?q=${encodeURIComponent(lookup.trim())}`); }}>
            <Search size={17} aria-hidden="true" />
            <input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Ví dụ: sustainable" aria-label="Tra từ tiếng Anh" />
            <button type="submit" disabled={!lookup.trim()} aria-label="Tra từ"><ArrowRight size={17} /></button>
          </form>
        </section>
      </aside>
    </div>
    <p className="vh-note"><Puzzle size={13} aria-hidden="true" /> Band trong bộ IELTS là gợi ý học tập ước lượng, không phải band chính thức của từng từ.</p>
  </div>;
}
