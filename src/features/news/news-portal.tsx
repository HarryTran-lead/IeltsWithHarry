"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Archive, ArrowLeft, ArrowRight, Bookmark, BookOpenText, CalendarDays, CalendarPlus, CheckCircle2, Clock3, ExternalLink, Flame, Headphones, History, Newspaper, Search, Trophy, Volume2, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { celebrateScore } from "@/lib/celebrate";
import { useNotebook } from "@/features/notebook/notebook-store";
import { useDemo } from "@/features/demo/demo-store";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/news/constants";
import { NewsRecommendations } from "./news-recommendations";
import { NewsReadingTools } from "./news-reading-tools";
import { NewsAutoQuiz } from "./news-auto-quiz";
import "./news-masthead.css";

type NewsRow = { id: string; title: string; publisher: string; canonical_url: string; category: NewsCategory; published_at: string; fetched_at: string; attribution_text: string; sensitive: boolean };
type ArchiveRow = NewsRow & { source_id: string; readable: boolean; image_url: string | null; image_alt: string | null; image_credit: string | null; illustration_source_url: string | null; illustration_license: string | null; illustration_license_url: string | null };
type NewsImage = { image_url: string; image_alt: string; image_credit: string };
type NewsBody = { body_text: string; rights_basis: string; source_url: string; image_url: string | null; image_alt: string | null; image_credit: string | null; byline: string | null; ai_generated: boolean };
function newsImage(row: { image_url: string | null; image_alt: string | null; image_credit: string | null } | null | undefined): NewsImage | undefined { return row?.image_url && row.image_alt && row.image_credit ? { image_url: row.image_url, image_alt: row.image_alt, image_credit: row.image_credit } : undefined; }
type LearnRow = { id: string; slug: string; title: string; summary: string; category: NewsCategory; stage_id: string; passage?: string; audio_url: string | null; source_url: string | null; rights_status: string; related_news_id: string | null; created_at: string };
type WordRow = { id: string; word: string; part_of_speech: string; meaning_vi: string; definition: string; phonetic: string; example: string };
type QuestionRow = { id: string; kind: string; prompt: string; options: string[]; supporting_sentence: string };
type AttemptRow = { id: string; article_id: string; score: number; total: number; submitted_at: string };
type Review = { id: string; correctAnswer: string; yourAnswer: string | null; explanation: string };

const stages: Record<string,string> = { foundation: "1.0–2.0 · Foundation", elementary: "2.0–3.0 · Elementary", "pre-ielts": "3.0–4.0 · Pre-IELTS", "ielts-starter": "4.0–5.0 · IELTS Starter", "ielts-builder": "5.0–6.0 · IELTS Builder", "ielts-advanced": "6.0–7.0 · IELTS Advanced", mastery: "7.0+ · Mastery" };
const accents: Record<NewsCategory,string> = { Technology: "#8f72ea", Science: "#34b8c4", Education: "#ffc85e", Health: "#ff6b6b", Environment: "#35b883", Business: "#e9a923", Culture: "#9b81d7", "World News": "#5e9ede" };
function relativeTime(value: string) { const hours = Math.max(0, Math.floor((Date.now() - new Date(value).valueOf()) / 3600000)); return hours < 1 ? "Trong giờ qua" : hours < 24 ? `${hours} giờ trước` : `${Math.floor(hours / 24)} ngày trước`; }
function newsDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function safeExternal(value: string) { try { const u = new URL(value); return ["https:","http:"].includes(u.protocol) ? u.toString() : "#"; } catch { return "#"; } }

export function NewsPortal() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (parts[2] === "learn" && parts[3]) return <LearnReader slug={parts[3]} />;
  if (parts[2] === "learn") return <LearnList />;
  if (parts[2] === "saved") return <SavedNews />;
  if (parts[2] === "history") return <NewsHistory />;
  if (parts[2]) return <NewsDetail key={parts[2]} id={parts[2]} />;
  return <NewsHome />;
}

type Feed = "latest" | "hot" | "today" | "archive";
const feeds: { id: Feed; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "latest", label: "Mới nhất", icon: Clock3, hint: "Tin mới nhất có toàn văn để đọc ngay tại đây." },
  { id: "hot", label: "Nổi bật", icon: Flame, hint: "Tin Việt Nam đang được đọc nhiều trên VnExpress và Tuổi Trẻ, viết lại bằng tiếng Anh." },
  { id: "today", label: "Hôm nay", icon: CalendarDays, hint: "Tin được xuất bản trong ngày hôm nay." },
  { id: "archive", label: "Lưu trữ", icon: Archive, hint: "Chọn nguồn, năm và thứ tự để xem lại tin cũ." },
];
const newsPages = [
  { id: "learn", label: "Learn with News", href: "/app/news/learn", icon: BookOpenText },
  { id: "saved", label: "Đã lưu", href: "/app/news/saved", icon: Bookmark },
  { id: "history", label: "Lịch sử học", href: "/app/news/history", icon: History },
] as const;
type NewsTab = Feed | (typeof newsPages)[number]["id"];

/** One compact header for every Daily News page; the tab row is the section menu and stays pinned while scrolling. */
function NewsMasthead({ active, meta, search }: { active: NewsTab; meta?: React.ReactNode; search?: React.ReactNode }) {
  const today = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const list = useRef<HTMLDivElement>(null);
  // On narrow screens the menu scrolls sideways; keep the open tab in view.
  useEffect(() => {
    const element = list.current;
    const current = element?.querySelector<HTMLElement>(".active");
    if (element && current) element.scrollTo({ left: current.offsetLeft - (element.clientWidth - current.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);
  return <>
    <header className="news-masthead">
      <div className="news-masthead-title"><Sticker name="globe" size={50} tilt={-8} /><div><span className="eyebrow">Daily News · <time suppressHydrationWarning>{today}</time></span><h1>Daily English News</h1></div></div>
      {meta && <div className="news-masthead-meta">{meta}</div>}
    </header>
    <nav className="news-tabs" aria-label="Mục lục Daily News">
      <div className="news-tabs-list" ref={list}>
        {feeds.map(({ id, label, icon: Icon }) => <Link key={id} href={id === "latest" ? "/app/news" : `/app/news?feed=${id}`} scroll={false} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined}><Icon size={16} />{label}</Link>)}
        <span className="news-tabs-divider" aria-hidden="true" />
        {newsPages.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined}><Icon size={16} />{label}</Link>)}
      </div>
      {search}
    </nav>
  </>;
}

function NewsHome() {
  const db = useMemo(() => createClient(), []);
  const params = useSearchParams();
  const feedParam = params.get("feed");
  const feed: Feed = feedParam === "hot" || feedParam === "today" || feedParam === "archive" ? feedParam : "latest";
  const feedInfo = feeds.find((item) => item.id === feed)!;
  const [category, setCategory] = useState<string>("All News");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [source, setSource] = useState("all");
  const [year, setYear] = useState("all");
  const [sources, setSources] = useState<{id: string; name: string}[]>([]);
  const [oldestYear, setOldestYear] = useState(new Date().getFullYear());
  // Paging belongs to one feed, so switching tabs starts again from page one.
  const [paging, setPaging] = useState<{ feed: Feed; page: number }>({ feed, page: 0 });
  const page = paging.feed === feed ? paging.page : 0;
  const setPage = (next: number | ((value: number) => number)) => setPaging({ feed, page: typeof next === "function" ? next(page) : next });
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [count, setCount] = useState(0);
  const [saved, setSaved] = useState<string[]>([]);
  const [readToday, setReadToday] = useState(0);
  const [latest, setLatest] = useState<string | null>(null);
  const [learn, setLearn] = useState<LearnRow[]>([]);
  const [completed, setCompleted] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+1);
    // Hot stories are the Vietnamese stories the rewrite job picked from Most read and Trending lists.
    let hotIds: string[] | null = null;
    if (feed === "hot") {
      const hot = await db.from("news_article_bodies").select("article_id").eq("ai_generated", true).order("ingested_at", { ascending: false }).limit(150);
      if (hot.error) { setError(hot.error.message); setLoading(false); return; }
      hotIds = (hot.data ?? []).map((row) => row.article_id);
    }
    let request = db.from("news_archive_catalog").select("id,source_id,title,publisher,canonical_url,category,published_at,fetched_at,attribution_text,sensitive,readable,image_url,image_alt,image_credit,illustration_source_url,illustration_license,illustration_license_url", { count: "exact" }).eq("publication_status", "published").eq("sensitive", false);
    if (category !== "All News") request = request.eq("category", category);
    // Only articles readable on site are listed; teaser-only items wait until their text arrives.
    request = request.eq("readable", true);
    if (hotIds) request = request.in("id", hotIds.length ? hotIds : ["00000000-0000-0000-0000-000000000000"]);
    if (feed === "today") request = request.gte("published_at", start.toISOString()).lt("published_at", end.toISOString());
    const archive = feed === "archive";
    if (archive && source !== "all") request = request.eq("source_id", source);
    if (archive && year !== "all") request = request.gte("published_at", `${year}-01-01T00:00:00Z`).lt("published_at", `${Number(year) + 1}-01-01T00:00:00Z`);
    if (search.trim()) request = request.ilike("title", `%${search.trim().replace(/[%_,]/g, "")}%`);
    if (archive && sort === "oldest") request = request.order("published_at", { ascending: true });
    else if (archive && sort === "added") request = request.order("fetched_at", { ascending: false });
    else if (archive && sort === "category") request = request.order("category").order("published_at", { ascending: false });
    else request = request.order("published_at", { ascending: false });
    const [articles, saves, freshness, readings, progress, today, recentReads, sourceList, oldest] = await Promise.all([
      request.range(page * 12, page * 12 + 11),
      db.from("user_saved_news").select("article_id").limit(500),
      db.rpc("news_freshness"),
      db.from("news_learning_articles").select("id,slug,title,summary,category,stage_id,audio_url,source_url,rights_status,related_news_id,created_at").eq("published", true).limit(6),
      db.from("user_news_progress").select("article_id,completed_at,xp_awarded").limit(1000),
      db.from("news_articles").select("id",{count:"exact",head:true}).eq("publication_status","published").eq("sensitive",false).gte("published_at",start.toISOString()).lt("published_at",end.toISOString()),
      db.from("user_news_article_reads").select("article_id",{count:"exact",head:true}).gte("read_at",start.toISOString()).lt("read_at",end.toISOString()),
      db.from("news_source_options").select("id,name").order("name"),
      db.from("news_archive_catalog").select("published_at").eq("publication_status","published").eq("sensitive",false).order("published_at",{ascending:true}).limit(1),
    ]);
    if (articles.error) { setError(articles.error.message); setLoading(false); return; }
    setSources((sourceList.data ?? []) as {id:string;name:string}[]);
    if (oldest.data?.[0]?.published_at) setOldestYear(new Date(oldest.data[0].published_at).getUTCFullYear());
    setReadToday(recentReads.count ?? 0);
    setLoading(false);
    setRows((articles.data ?? []) as ArchiveRow[]); setCount(articles.count ?? 0);
    setSaved((saves.data ?? []).map((row) => row.article_id));
    setLatest(freshness.data as string | null);
    setLearn((readings.data ?? []) as LearnRow[]);
    setCompleted((progress.data??[]).filter((item)=>item.completed_at).length);
    setXp((progress.data??[]).reduce((sum,item)=>sum+(item.xp_awarded??0),0));
    setTodayCount(today.count??0);
  }, [db, feed, category, search, sort, source, year, page]);
  useEffect(() => { const timer = setTimeout(() => setSearch(query), 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function toggleSave(id: string) {
    const isSaved = saved.includes(id);
    const result = isSaved ? await db.from("user_saved_news").delete().eq("article_id", id) : await db.from("user_saved_news").insert({ article_id: id });
    if (result.error) setError(result.error.message); else setSaved((current) => isSaved ? current.filter((item) => item !== id) : [...current, id]);
  }
  const yearOptions = Array.from({ length: Math.max(1, new Date().getFullYear() - oldestYear + 1) }, (_, i) => new Date().getFullYear() - i);
  return <div className="content-page news-page news-home">
    <NewsMasthead active={feed}
      meta={<><span><Newspaper /> <b>{todayCount}</b> tin hôm nay</span><span><Clock3 /> Cập nhật {latest ? relativeTime(latest).toLowerCase() : "—"}</span><span title={`${xp} XP từ bài luyện`}><Trophy /> Đã đọc <b>{readToday}</b> hôm nay · <b>{completed}</b> bài luyện</span></>}
      search={<label className="news-tabs-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Tìm theo tiêu đề..." aria-label="Tìm tin" /></label>} />
    {latest && now - new Date(latest).valueOf() > 2 * 3600000 && <p className="news-stale">Tin đã lưu vẫn xem được. Lần đồng bộ gần nhất: {newsDate(latest)}.</p>}
    <section className="news-feed" id="news-archive">
      <div className="news-feed-bar">
        <div className="news-categories">{["All News",...NEWS_CATEGORIES].map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => { setCategory(item); setPage(0); }}>{item}</button>)}</div>
        {feed === "archive" && <div className="news-archive-filters"><select aria-label="Nguồn tin" value={source} onChange={(event) => { setSource(event.target.value); setPage(0); }}><option value="all">Mọi nguồn</option>{sources.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Năm xuất bản" value={year} onChange={(event) => { setYear(event.target.value); setPage(0); }}><option value="all">Mọi năm</option>{yearOptions.map((value)=><option key={value} value={value}>{value}</option>)}</select><select aria-label="Sắp xếp tin" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="added">Mới thêm</option><option value="category">Danh mục</option></select></div>}
      </div>
      <p className="news-feed-count"><feedInfo.icon size={15} /><b>{loading ? "…" : count.toLocaleString("vi-VN")} bài</b><span>{feedInfo.hint}</span></p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="news-grid" aria-busy="true">{[0, 1, 2].map((item) => <div key={item} className="news-card news-card-skeleton"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}</div> : rows.length ? <div className="news-grid stagger">{rows.map((row) => <NewsCard key={row.id} row={row} saved={saved.includes(row.id)} onSave={() => void toggleSave(row.id)} onSite={row.readable} image={row.image_url && row.image_alt && row.image_credit ? {image_url:row.image_url,image_alt:row.image_alt,image_credit:row.image_credit} : undefined} learnSlug={learn.find((item) => item.related_news_id === row.id)?.slug} />)}</div> : <div className="news-empty"><Sticker name={feed === "today" ? "calendar" : feed === "hot" ? "flame" : "newspaper"} size={72} tilt={-6} /><h3>{feed === "today" ? "Hôm nay chưa có tin mới" : feed === "hot" ? "Chưa có tin nổi bật" : "Chưa có tin phù hợp"}</h3><p>{feed === "archive" ? "Hãy đổi năm, nguồn hoặc thứ tự. Kho tin cũ đang được nhập thêm theo lịch." : feed === "latest" ? "Kho tin được đồng bộ theo lịch. Hãy thử danh mục khác." : "Thử danh mục khác hoặc xem tab Mới nhất."}</p>{feed === "latest" ? <Link href="/app/news/learn" className="button primary">Learn with News</Link> : <Link href="/app/news" scroll={false} className="button primary">Xem tin mới nhất</Link>}</div>}
      {count > 12 && <div className="news-pagination"><button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {page + 1} / {Math.ceil(count / 12)}</span><button disabled={(page + 1) * 12 >= count} onClick={() => setPage((value) => value + 1)}>Tiếp →</button></div>}
    </section>
    <section className="news-section"><div className="news-section-heading"><div><span className="eyebrow">HỌC QUA BÀI ĐỌC GỐC</span><h2>Learn with News</h2><p>Bài đọc và câu hỏi do người biên soạn, có đáp án rõ ràng.</p></div><Link href="/app/news/learn">Xem tất cả →</Link></div><div className="news-grid">{learn.slice(0,3).map((item) => <LearnCard key={item.id} item={item}/>)}</div></section>
    <p className="news-credit">Mỗi bài đều dẫn tới bản gốc; chỉ nội dung có hồ sơ quyền phù hợp mới hiển thị toàn văn.</p>
  </div>;
}

function categorySticker(category: string): StickerName {
  return category === "Technology" ? "bulb" : category === "Science" ? "rocket" : category === "Environment" ? "mountain" : category === "Education" ? "book" : "globe";
}

function NewsCard({ row, saved, onSave, learnSlug, onSite = false, image }: { row: NewsRow; saved: boolean; onSave: () => void; learnSlug?: string; onSite?: boolean; image?: NewsImage }) {
  return <article className="news-card"><div className="news-card-art" style={{ background: `linear-gradient(135deg, ${accents[row.category]}45, #fffaf3)` }}>{image?<Image src={image.image_url} alt={image.image_alt} fill sizes="(max-width: 650px) 100vw, (max-width: 1050px) 50vw, 33vw" unoptimized/>:<Sticker name={categorySticker(row.category)} size={64} tilt={-6} />}<small>{row.category}</small></div><div className="news-card-body"><div className="news-card-meta"><span>{row.publisher}</span><span>{relativeTime(row.published_at)}</span></div><h3><Link href={`/app/news/${row.id}`}>{row.title}</Link></h3><p>{newsDate(row.published_at)}</p><div className="news-card-actions"><Link href={`/app/news/${row.id}`} className="button subtle">{onSite ? "Đọc tại đây" : "Chi tiết"} <ArrowRight size={15}/></Link><a href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer" className="button subtle">Read Original <ExternalLink size={15}/></a><button aria-label={saved ? "Remove saved article" : "Save article"} aria-pressed={saved} onClick={onSave} className={saved ? "saved" : ""}><Bookmark size={19} fill={saved ? "currentColor" : "none"}/></button></div>{learnSlug && <Link className="news-learn-link" href={`/app/news/learn/${learnSlug}`}>Learn with News →</Link>}</div></article>;
}
function LearnCard({ item }: { item: LearnRow }) { return <Link href={`/app/news/learn/${item.slug}`} className="news-learn-card"><div className="news-learn-icon" style={{ background: accents[item.category] + "33" }}><Sticker name={categorySticker(item.category)} size={40} tilt={-6} pop={false} /></div><span>{item.category} · {stages[item.stage_id] ?? item.stage_id}</span><h3>{item.title}</h3><p>{item.summary}</p><strong>Đọc & luyện tập <ArrowRight size={16}/></strong></Link>; }

function LearnList() {
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LearnRow[]>([]); const [level, setLevel] = useState("all"); const [category, setCategory] = useState("All News"); const [error, setError] = useState("");
  useEffect(() => { let request = db.from("news_learning_articles").select("id,slug,title,summary,category,stage_id,audio_url,source_url,rights_status,related_news_id,created_at").eq("published",true).order("created_at",{ascending:false}).limit(100); if (level !== "all") request = request.eq("stage_id",level); if (category !== "All News") request=request.eq("category",category); void request.then(({data,error})=>{setRows((data??[]) as LearnRow[]);setError(error?.message??"");}); },[db,level,category]);
  return <div className="content-page news-page"><NewsMasthead active="learn"/><NewsRecommendations/><section className="news-section"><span className="eyebrow">BÀI ĐỌC CÓ BẢN QUYỀN RÕ RÀNG</span><h2>Learn with News</h2><p>Chọn chủ đề và mức độ phù hợp. Đây là bài đọc gốc hoặc đã được cấp phép, không phải toàn văn tin lấy tự động.</p><div className="news-toolbar"><select value={level} onChange={(event)=>setLevel(event.target.value)} aria-label="Choose level"><option value="all">Mọi trình độ</option>{Object.entries(stages).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select value={category} onChange={(event)=>setCategory(event.target.value)} aria-label="Choose category"><option>All News</option>{NEWS_CATEGORIES.map((item)=><option key={item}>{item}</option>)}</select></div>{error&&<p role="alert" className="form-error">{error}</p>}<div className="news-grid">{rows.map((item)=><LearnCard key={item.id} item={item}/>)}</div>{!rows.length&&<div className="news-empty">Chưa có bài học cho bộ lọc này.</div>}</section></div>;
}

function NewsDetail({ id }: { id: string }) {
  const db = useMemo(() => createClient(), []);
  const [row,setRow]=useState<ArchiveRow|null>(null);
  const [slug,setSlug]=useState<string|null>(null);
  const [saved,setSaved]=useState(false);
  const [body,setBody]=useState<NewsBody|null>(null);
  const [read,setRead]=useState(false);
  const [readError,setReadError]=useState("");
  const [marking,setMarking]=useState(false);
  const [answered,setAnswered]=useState<boolean[]>([]);
  useEffect(()=>{void (async()=>{const [a,b,c,d,e]=await Promise.all([db.from("news_archive_catalog").select("id,source_id,title,publisher,canonical_url,category,published_at,fetched_at,attribution_text,sensitive,readable,image_url,image_alt,image_credit,illustration_source_url,illustration_license,illustration_license_url").eq("id",id).eq("publication_status","published").eq("sensitive",false).maybeSingle(),db.from("news_learning_articles").select("slug").eq("related_news_id",id).eq("published",true).maybeSingle(),db.from("user_saved_news").select("article_id").eq("article_id",id).maybeSingle(),db.from("news_article_bodies").select("body_text,rights_basis,source_url,image_url,image_alt,image_credit,byline,ai_generated").eq("article_id",id).maybeSingle(),db.from("user_news_article_reads").select("article_id").eq("article_id",id).maybeSingle()]);setRow(a.data as ArchiveRow|null);setSlug(b.data?.slug??null);setSaved(Boolean(c.data));setBody(d.data);setRead(Boolean(e.data));})();},[db,id]);
  async function toggle(){const result=saved?await db.from("user_saved_news").delete().eq("article_id",id):await db.from("user_saved_news").insert({article_id:id});if(!result.error)setSaved(!saved);}
  async function markRead(){setMarking(true);setReadError("");const result=await db.rpc("news_mark_article_read",{p_article_id:id});setMarking(false);if(result.error)setReadError(result.error.message);else setRead(true);}
  if(!row)return <div className="content-page news-page news-detail-page"><Link href="/app/news">← Daily News</Link><div className="news-empty">Tin không có sẵn hoặc đang chờ duyệt.</div></div>;
  const sourceHost = body ? new URL(body.source_url).hostname : "";
  const onSitePublisher = sourceHost === "noaa.gov" || sourceHost.endsWith(".noaa.gov") ? "NOAA" : sourceHost === "nasa.gov" || sourceHost.endsWith(".nasa.gov") ? "NASA"
    : sourceHost === "globalvoices.org" ? "Global Voices" : sourceHost === "www.gov.uk" ? "GOV.UK" : null;
  const rightsUrls: Record<string, string> = { NOAA: "https://www.noaa.gov/office-education/outreach-communication/faq", NASA: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    "Global Voices": "https://globalvoices.org/about/global-voices-attribution-policy/", "GOV.UK": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" };
  const rightsUrl = onSitePublisher ? rightsUrls[onSitePublisher] : null;
  const image = newsImage(row);
  return <div className="content-page news-page news-detail-page"><Link href="/app/news" className="news-back"><ArrowLeft size={17}/> Daily News</Link><article className="news-detail"><header className="news-detail-lead"><div><div className="news-detail-art" style={{background:`linear-gradient(120deg,${accents[row.category]}55,#fffaf3)`}}>{image?<Image src={image.image_url} alt={image.image_alt} fill sizes="(max-width: 950px) 100vw, 48vw" unoptimized/>:<Sticker name="newspaper" size={96} tilt={-6} />}<span>{row.category}</span></div>{image&&<p className="news-image-credit">{row.illustration_source_url ? <>Ảnh minh họa: {image.image_credit} · <a href={safeExternal(row.illustration_source_url)} target="_blank" rel="noopener noreferrer">{row.illustration_source_url.startsWith("https://images.nasa.gov/") ? "NASA Image Library" : row.illustration_source_url.startsWith("https://www.flickr.com/") ? "Flickr" : "Wikimedia Commons"}</a> · {row.illustration_license_url ? <a href={safeExternal(row.illustration_license_url)} target="_blank" rel="noopener noreferrer">{row.illustration_license}</a> : row.illustration_license}</> : <>Ảnh: {image.image_credit} · <a href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer">Nguồn bài gốc</a></>}</p>}</div><div className="news-detail-intro"><span className="eyebrow">{row.category} · {relativeTime(row.published_at)}</span><h1>{row.title}</h1><p>{row.publisher} · {newsDate(row.published_at)}</p>{body?.byline&&<p className="news-byline">By {body.byline} · <a href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer">Bài gốc trên {row.publisher}</a></p>}<p className="news-attribution">{row.attribution_text} {row.attribution_text.includes("GDELT")&&<a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">The GDELT Project</a>}</p>{body?.ai_generated?<div className="news-rights-note news-ai-note" role="note"><BookOpenText size={20}/><p><strong>Bài do AI viết lại bằng tiếng Anh</strong> từ tin của {row.publisher}. Từng câu đã được đối chiếu tự động với bài gốc, nhưng vẫn có thể có sai sót. <a href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer">Đọc bài gốc để kiểm tra</a>.</p></div>:body?<div className="news-rights-note"><BookOpenText size={20}/><p>Nội dung văn bản {onSitePublisher ?? row.publisher} được hiển thị tại đây với ghi nguồn. {rightsUrl&&<a href={rightsUrl} target="_blank" rel="noopener noreferrer">Xem hướng dẫn sử dụng của {onSitePublisher}</a>}</p></div>:<div className="news-rights-note"><BookOpenText size={20}/><p>Nguồn này chưa có quyền hiển thị toàn bài trên IeltsWithHarry. Bạn có thể đọc tại trang nhà xuất bản.</p></div>}</div></header>{body&&<NewsReadingTools articleId={id} title={row.title} paragraphs={body.body_text.split(/\n\n+/)} practice={{answered,content:<NewsAutoQuiz articleId={id} onProgress={setAnswered}/>}}><div className="news-reading-control"><button disabled={read||marking} onClick={()=>void markRead()}>{read?"✓ Đã hoàn thành bài đọc":marking?"Đang lưu…":"Tôi đã đọc xong ✓"}</button>{read&&<span>Hoạt động đọc đã được ghi vào lịch sử của bạn.</span>}</div>{readError&&<p className="form-error" role="alert">{readError}</p>}</NewsReadingTools>}<div className="news-detail-actions"><a className="button primary" href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer">Read Original Article <ExternalLink size={17}/></a><button className="button subtle" onClick={()=>void toggle()}><Bookmark size={17} fill={saved?"currentColor":"none"}/> {saved?"Đã lưu":"Lưu tin"}</button>{slug&&<Link className="button subtle" href={`/app/news/learn/${slug}`}>Learn with News →</Link>}</div></article></div>;
}

function SavedNews(){
  const db=useMemo(()=>createClient(),[]);
  const [rows,setRows]=useState<ArchiveRow[]>([]);
  useEffect(()=>{void (async()=>{
    const {data}=await db.from("user_saved_news").select("article_id").order("saved_at",{ascending:false}).limit(100);
    const ids=(data??[]).map((item)=>item.article_id);
    if(!ids.length){setRows([]);return;}
    const archive=await db.from("news_archive_catalog").select("id,source_id,title,publisher,canonical_url,category,published_at,fetched_at,attribution_text,sensitive,readable,image_url,image_alt,image_credit,illustration_source_url,illustration_license,illustration_license_url").in("id",ids).eq("publication_status","published").eq("sensitive",false);
    const byId=new Map((archive.data??[]).map((item)=>[item.id,item as ArchiveRow]));
    setRows(ids.flatMap((id)=>byId.has(id)?[byId.get(id)!]:[]));
  })();},[db]);
  return <div className="content-page news-page"><NewsMasthead active="saved"/><section className="news-section"><h2>Tin đã lưu</h2><p>Danh sách riêng của bạn. Mở bài gốc trên trang nhà xuất bản.</p><div className="news-grid">{rows.map((row)=><NewsCard key={row.id} row={row} saved onSite={row.readable} image={newsImage(row)} onSave={async()=>{await db.from("user_saved_news").delete().eq("article_id",row.id);setRows((current)=>current.filter((item)=>item.id!==row.id));}}/>)}</div>{!rows.length&&<div className="news-empty">Bạn chưa lưu tin nào. <Link href="/app/news">Khám phá Daily News →</Link></div>}</section></div>;
}

function NewsHistory(){
  const db=useMemo(()=>createClient(),[]);
  const [attempts,setAttempts]=useState<AttemptRow[]>([]);
  const [autoAttempts,setAutoAttempts]=useState<AttemptRow[]>([]);
  const [progress,setProgress]=useState<{article_id:string;last_read_at:string;completed_at:string|null;best_score:number|null;best_total:number|null}[]>([]);
  const [titles,setTitles]=useState<Record<string,string>>({});
  const [newsReads,setNewsReads]=useState<{article_id:string;read_at:string}[]>([]);
  const [newsTitles,setNewsTitles]=useState<Record<string,string>>({});
  useEffect(()=>{void (async()=>{
    const [a,p,l,n,automatic]=await Promise.all([
      db.from("news_reading_attempts").select("id,article_id,score,total,submitted_at").order("submitted_at",{ascending:false}).limit(100),
      db.from("user_news_progress").select("article_id,last_read_at,completed_at,best_score,best_total").order("last_read_at",{ascending:false}).limit(100),
      db.from("news_learning_articles").select("id,title,slug").eq("published",true).limit(100),
      db.from("user_news_article_reads").select("article_id,read_at").order("read_at",{ascending:false}).limit(100),
      db.from("news_auto_attempts").select("id,article_id,score,total,submitted_at").order("submitted_at",{ascending:false}).limit(100),
    ]);
    setAttempts((a.data??[]) as AttemptRow[]);setAutoAttempts((automatic.data??[]) as AttemptRow[]);setProgress((p.data??[]) as typeof progress);
    setTitles(Object.fromEntries((l.data??[]).map((item)=>[item.id,`${item.title}|${item.slug}`])));
    setNewsReads(n.data??[]);
    const ids=[...new Set([...(n.data??[]).map((item)=>item.article_id),...(automatic.data??[]).map((item)=>item.article_id)])];
    if(ids.length){const headlines=await db.from("news_articles").select("id,title").in("id",ids);setNewsTitles(Object.fromEntries((headlines.data??[]).map((item)=>[item.id,item.title])));}
  })();},[db]);
  return <div className="content-page news-page"><NewsMasthead active="history"/><section className="news-section"><h2>Lịch sử học với tin</h2><div className="news-stats"><div><Newspaper/><span>Tin đã đọc xong</span><strong>{newsReads.length}</strong></div><div><BookOpenText/><span>Bài luyện đã mở</span><strong>{progress.length}</strong></div><div><CheckCircle2/><span>Quiz đã nộp</span><strong>{attempts.length+autoAttempts.length}</strong></div></div><h3>Tin đã đọc trực tiếp</h3><div className="news-history-list">{newsReads.map((item)=><article key={item.article_id}><span>{newsDate(item.read_at)}</span><h3>{newsTitles[item.article_id]??"Bài tin"}</h3><Link href={`/app/news/${item.article_id}`}>Đọc lại →</Link></article>)}</div>{!newsReads.length&&<div className="news-empty">Bạn chưa đánh dấu hoàn thành tin nào. <Link href="/app/news#direct-news">Khám phá tin đọc trực tiếp →</Link></div>}<h3>Câu hỏi tự động từ bài báo</h3><div className="news-history-list">{autoAttempts.map((item)=><article key={item.id}><span>{newsDate(item.submitted_at)}</span><h3>{newsTitles[item.article_id]??"Bài báo"}</h3><p>{item.score}/{item.total} câu đúng · {Math.round(item.score/item.total*100)}%</p><Link href={`/app/news/${item.article_id}`}>Đọc và luyện lại →</Link></article>)}</div>{!autoAttempts.length&&<p>Chưa có bài quiz tự động nào được nộp.</p>}<h3>Bài luyện và câu hỏi</h3><div className="news-history-list">{attempts.map((item)=><article key={item.id}><span>{newsDate(item.submitted_at)}</span><h3>{titles[item.article_id]?.split("|")[0]??"Bài đọc"}</h3><p>{item.score}/{item.total} câu đúng · {Math.round(item.score/item.total*100)}%</p>{titles[item.article_id]&&<Link href={`/app/news/learn/${titles[item.article_id].split("|")[1]}`}>Ôn lại →</Link>}</article>)}</div>{!attempts.length&&<div className="news-empty">Bạn chưa hoàn thành bài quiz nào. <Link href="/app/news/learn">Bắt đầu đọc →</Link></div>}</section></div>;
}

function LearnReader({ slug }: { slug: string }) {
  const db=useMemo(()=>createClient(),[]);const {entries,addEntry}=useNotebook();const {addTask}=useDemo();
  const [article,setArticle]=useState<LearnRow|null>(null);const [words,setWords]=useState<WordRow[]>([]);const [questions,setQuestions]=useState<QuestionRow[]>([]);const [answers,setAnswers]=useState<Record<string,string>>({});const [result,setResult]=useState<{score:number;total:number;review:Review[]}|null>(null);const [selected,setSelected]=useState<WordRow|null>(null);const [lookup,setLookup]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [readPercent,setReadPercent]=useState(0);
  useEffect(()=>{void (async()=>{const a=await db.from("news_learning_articles").select("id,slug,title,summary,category,stage_id,passage,audio_url,source_url,rights_status,related_news_id,created_at").eq("slug",slug).eq("published",true).maybeSingle();if(!a.data)return;setArticle(a.data as LearnRow);const [w,q]=await Promise.all([db.from("news_vocabulary").select("id,word,part_of_speech,meaning_vi,definition,phonetic,example").eq("article_id",a.data.id).order("sort_order"),db.from("news_questions").select("id,kind,prompt,options,supporting_sentence").eq("article_id",a.data.id).order("sort_order")]);setWords((w.data??[]) as WordRow[]);setQuestions((q.data??[]) as QuestionRow[]);await db.rpc("news_mark_read",{p_slug:slug});})();},[db,slug]);
  function onSelect(){const text=window.getSelection()?.toString().trim().replace(/^[^a-z]+|[^a-z]+$/gi,"").toLowerCase()??"";if(!text||text.includes(" "))return;setLookup(text);const forms=[text,text.replace(/(ies)$/,"y"),text.replace(/(ing|ed|es|s)$/,""),text.replace(/(ing)$/,"e")];setSelected(words.find((w)=>forms.includes(w.word.toLowerCase()))??null);}
  async function saveWord(word:WordRow){if(entries.some((entry)=>entry.kind==="word"&&entry.title.toLowerCase()===word.word.toLowerCase()))return;try{await addEntry({kind:"word",title:word.word,body:"",meaningVi:word.meaning_vi,example:word.example,phonetic:word.phonetic,partOfSpeech:word.part_of_speech,definition:word.definition,topic:article?.category??""});}catch(cause){setError(cause instanceof Error?cause.message:"Không thể lưu từ");}}
  async function submit(){setBusy(true);setError("");const response=await db.rpc("news_submit_quiz",{p_slug:slug,p_answers:answers});setBusy(false);if(response.error){setError(response.error.message);return;}const scored=response.data as {score:number;total:number;review:Review[]};setResult(scored);celebrateScore(scored.score,scored.total);}
  async function planner(){if(!article)return;try{await addTask({title:`Read ${article.title.slice(0,60)} — quiz`,skill:"Reading",date:new Date().toISOString().slice(0,10),time:"",completed:false,priority:"Medium",lesson:`news:${slug}`});}catch(cause){setError(cause instanceof Error?cause.message:"Không thể thêm kế hoạch");}}
  async function advanceReading(){const next=Math.min(100,readPercent+25);setReadPercent(next);if(next===100){const response=await db.rpc("news_finish_read",{p_slug:slug});if(response.error)setError(response.error.message);}}
  if(!article)return <div className="content-page news-page"><Link href="/app/news/learn">← Learn with News</Link><div className="news-empty">Bài đọc chưa xuất bản hoặc không tồn tại.</div></div>;
  return <div className="content-page news-page"><Link href="/app/news/learn" className="news-back"><ArrowLeft size={17}/> Learn with News</Link><header className="news-reader-head"><span className="eyebrow">{article.category} · {stages[article.stage_id]??article.stage_id}</span><h1>{article.title}</h1><p>{article.summary}</p><div><span>{article.rights_status==="ORIGINAL"?"Bài đọc gốc":"Nội dung được cấp phép"}</span><button className="button subtle" onClick={()=>void planner()}><CalendarPlus size={17}/> Add to Study Planner</button></div></header><div className="news-reader-layout"><div><div className="news-read-progress"><span>Tiến độ đọc</span><div><i style={{width:`${readPercent}%`}}/></div><strong>{readPercent}%</strong></div><article className="news-passage" onMouseUp={onSelect} onTouchEnd={onSelect}>{article.passage?.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</article><div className="news-reading-control"><button onClick={()=>void advanceReading()}>Đã đọc phần này ✓</button>{readPercent===100&&<span><Sticker name="check" size={26} /> Bạn đã hoàn thành phần đọc!</span>}</div>{article.audio_url&&<section className="news-audio"><h3><Headphones size={19}/> Nghe bài đọc</h3><audio controls src={article.audio_url} preload="none"/><p>Điều chỉnh tốc độ và tua bằng trình phát.</p></section>}
      <section className="news-quiz"><span className="eyebrow">READING PRACTICE</span><h2>Kiểm tra hiểu bài</h2><p>{questions.length} câu hỏi do người biên soạn, chấm theo đáp án cố định.</p>{questions.map((q,index)=><div className="news-question" key={q.id}><strong>Câu {index+1} · {q.kind.replaceAll("_"," ")}</strong><h3>{q.prompt}</h3>{q.options.length?<div className="news-options">{q.options.map((option)=><label key={option} className={answers[q.id]===option?"selected":""}><input type="radio" name={q.id} value={option} checked={answers[q.id]===option} onChange={()=>setAnswers((current)=>({...current,[q.id]:option}))}/>{option}</label>)}</div>:<input aria-label={`Answer question ${index+1}`} value={answers[q.id]??""} onChange={(event)=>setAnswers((current)=>({...current,[q.id]:event.target.value}))} placeholder="Câu trả lời của bạn"/>}{result&&<div className={result.review.find((r)=>r.id===q.id)?.correctAnswer.toLowerCase()===answers[q.id]?.trim().toLowerCase()?"news-answer correct":"news-answer"}><b>Đáp án: {result.review.find((r)=>r.id===q.id)?.correctAnswer}</b><p>{result.review.find((r)=>r.id===q.id)?.explanation}</p>{q.supporting_sentence&&<small>Trong bài: {q.supporting_sentence}</small>}</div>}</div>)}{error&&<p className="form-error" role="alert">{error}</p>}{questions.length>0&&<button className="button primary" disabled={busy||Object.keys(answers).length<questions.length} onClick={()=>void submit()}>{busy?"Đang chấm…":"Nộp bài & xem kết quả"}</button>}{result&&<div className="news-result"><Trophy/><h3>{result.score}/{result.total} câu đúng · {Math.round(result.score/result.total*100)}%</h3><p>{result.score===result.total?"Xuất sắc! Bạn đã hiểu toàn bộ bài đọc.":`Hãy xem lại ${result.total-result.score} câu và ghi nhớ từ mới.`}</p><Link href="/app/news/history">Xem lịch sử học →</Link></div>}</section></div>
    <aside className="news-vocab-panel"><span className="eyebrow">WORD EXPLORER</span><h2><Volume2 size={20}/> Từ vựng</h2><p>Chọn một từ trong bài hoặc mở danh sách bên dưới.</p>{lookup&&<div className="news-lookup">{selected?<><strong>{selected.word} <small>{selected.phonetic}</small></strong><span>{selected.part_of_speech}</span><p>{selected.meaning_vi}</p><p>{selected.definition}</p><em>{selected.example}</em><button onClick={()=>void saveWord(selected)}>{entries.some((entry)=>entry.kind==="word"&&entry.title.toLowerCase()===selected.word.toLowerCase())?"✓ Đã lưu":"☆ Lưu từ"}</button></>:<p>Chưa có từ “{lookup}” trong bộ từ của bài. Chọn một từ được biên soạn bên dưới.</p>}</div>}{words.map((word)=><button key={word.id} className="news-word" onClick={()=>{setSelected(word);setLookup(word.word);}}><strong>{word.word}</strong><span>{word.meaning_vi}</span></button>)}<Link href="/app/notebook">Mở sổ từ vựng →</Link></aside></div></div>;
}
