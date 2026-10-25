"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Bookmark, BookOpenText, CalendarPlus, CheckCircle2, Clock3, ExternalLink, Globe2, Headphones, Newspaper, Search, Trophy, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook } from "@/features/notebook/notebook-store";
import { useDemo } from "@/features/demo/demo-store";
import { NEWS_CATEGORIES, type NewsCategory } from "@/lib/news/constants";
import { NewsRecommendations } from "./news-recommendations";
import { NewsReadingTools } from "./news-reading-tools";

type NewsRow = { id: string; title: string; publisher: string; canonical_url: string; category: NewsCategory; published_at: string; fetched_at: string; attribution_text: string; sensitive: boolean };
type ArchiveRow = NewsRow & { source_id: string; readable: boolean; image_url: string | null; image_alt: string | null; image_credit: string | null };
type NewsImage = { image_url: string; image_alt: string; image_credit: string };
type NewsBody = { body_text: string; rights_basis: string; source_url: string; image_url: string | null; image_alt: string | null; image_credit: string | null };
function newsImage(body: NewsBody | null | undefined): NewsImage | undefined { return body?.image_url && body.image_alt && body.image_credit ? { image_url: body.image_url, image_alt: body.image_alt, image_credit: body.image_credit } : undefined; }
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
  if (parts[2]) return <NewsDetail id={parts[2]} />;
  return <NewsHome />;
}

function NewsHero({ compact = false }: { compact?: boolean }) {
  return <header className={`news-hero ${compact ? "compact" : ""}`}><div><span className="eyebrow">✦ IELTSWITHHARRY / DAILY NEWS</span><h1>Daily English News</h1><p>Discover the world. Improve your English every day.</p><div className="news-hero-links"><Link href="/app/news">Tin mới</Link><Link href="/app/news/learn">Learn with News</Link><Link href="/app/news/saved">Đã lưu</Link><Link href="/app/news/history">Lịch sử học</Link></div></div><div className="news-hero-art" aria-hidden="true"><span>🌍</span><span>📰</span><span>✦</span></div></header>;
}

function NewsHome() {
  const db = useMemo(() => createClient(), []);
  const [category, setCategory] = useState<string>("All News");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [source, setSource] = useState("all");
  const [mode, setMode] = useState("all");
  const [year, setYear] = useState("all");
  const [sources, setSources] = useState<{id: string; name: string}[]>([]);
  const [oldestYear, setOldestYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(0);
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
    setLoading(true);
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+1);
    let request = db.from("news_archive_catalog").select("id,source_id,title,publisher,canonical_url,category,published_at,fetched_at,attribution_text,sensitive,readable,image_url,image_alt,image_credit", { count: "exact" }).eq("publication_status", "published").eq("sensitive", false);
    if (category !== "All News") request = request.eq("category", category);
    if (source !== "all") request = request.eq("source_id", source);
    if (mode === "readable") request = request.eq("readable", true);
    if (year !== "all") request = request.gte("published_at", `${year}-01-01T00:00:00Z`).lt("published_at", `${Number(year) + 1}-01-01T00:00:00Z`);
    if (search.trim()) request = request.ilike("title", `%${search.trim().replace(/[%_,]/g, "")}%`);
    if (sort === "oldest") request = request.order("published_at", { ascending: true });
    else if (sort === "added") request = request.order("fetched_at", { ascending: false });
    else if (sort === "category") request = request.order("category").order("published_at", { ascending: false });
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
  }, [db, category, search, sort, source, mode, year, page]);
  useEffect(() => { const timer = setTimeout(() => setSearch(query), 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function toggleSave(id: string) {
    const isSaved = saved.includes(id);
    const result = isSaved ? await db.from("user_saved_news").delete().eq("article_id", id) : await db.from("user_saved_news").insert({ article_id: id });
    if (result.error) setError(result.error.message); else setSaved((current) => isSaved ? current.filter((item) => item !== id) : [...current, id]);
  }
  return <div className="content-page news-page"><NewsHero /><div className="news-stats"><div><Newspaper /><span>Today&apos;s news</span><strong>{todayCount}</strong></div><div><Clock3 /><span>Last checked</span><strong>{latest ? relativeTime(latest) : "Chưa đồng bộ"}</strong></div><div><Globe2 /><span>Available articles</span><strong>{count}</strong></div><div><Trophy /><span>Đã học</span><strong>{readToday} tin hôm nay · {completed} bài luyện</strong><small>{xp} XP từ bài luyện</small></div></div>
    {latest && now - new Date(latest).valueOf() > 2 * 3600000 && <p className="news-stale">Tin đã lưu vẫn xem được. Lần đồng bộ gần nhất: {newsDate(latest)}.</p>}
    <section className="news-challenge"><div><span className="eyebrow">DAILY READING CHALLENGE</span><h2>Mỗi ngày một câu chuyện mới ✨</h2><p>Tin từ NASA, NOAA và NSF được tự đồng bộ và lưu lại theo ngày. Lọc bài có thể đọc tại đây hoặc mở bài gốc từ nhà xuất bản.</p></div><div className="news-challenge-actions"><a href="#news-archive" className="button primary">Khám phá kho tin <ArrowRight size={17}/></a><Link href="/app/news/learn" className="button subtle">Luyện câu hỏi</Link></div></section>
    <section className="news-section" id="news-archive"><div className="news-section-heading"><div><span className="eyebrow">KHO BÁO THEO THỜI GIAN</span><h2>Tin mới và tin lưu trữ</h2><p>Chọn năm, nguồn và thứ tự để xem lại tin cũ. Bài đủ điều kiện có toàn văn tại đây; bài khác dẫn tới trang gốc.</p></div><Link href="/app/news/saved">Tin đã lưu →</Link></div>
    <div className="news-categories">{["All News",...NEWS_CATEGORIES].map((item) => <button key={item} className={category === item ? "selected" : ""} onClick={() => { setCategory(item); setPage(0); }}>{item}</button>)}</div>
    <div className="news-toolbar news-archive-toolbar"><label><Search size={18}/><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Tìm theo tiêu đề..." aria-label="Tìm tin" /></label><select aria-label="Nguồn tin" value={source} onChange={(event) => { setSource(event.target.value); setPage(0); }}><option value="all">Mọi nguồn</option>{sources.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Năm xuất bản" value={year} onChange={(event) => { setYear(event.target.value); setPage(0); }}><option value="all">Mọi năm</option>{Array.from({length:Math.max(1,new Date().getFullYear()-oldestYear+1)},(_,i)=>new Date().getFullYear()-i).map((value)=><option key={value} value={value}>{value}</option>)}</select><select aria-label="Cách đọc" value={mode} onChange={(event) => { setMode(event.target.value); setPage(0); }}><option value="all">Tất cả bài</option><option value="readable">Đọc tại đây</option></select><select aria-label="Sắp xếp tin" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="added">Mới thêm</option><option value="category">Danh mục</option></select></div>
    <p className="news-archive-count">{count.toLocaleString("vi-VN")} bài phù hợp · Đã lưu để đọc lại; các năm cũ đang tiếp tục được bổ sung.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{loading ? <p>Đang tải tin…</p> : rows.length ? <div className="news-grid">{rows.map((row) => <NewsCard key={row.id} row={row} saved={saved.includes(row.id)} onSave={() => void toggleSave(row.id)} onSite={row.readable} image={row.image_url && row.image_alt && row.image_credit ? {image_url:row.image_url,image_alt:row.image_alt,image_credit:row.image_credit} : undefined} learnSlug={learn.find((item) => item.related_news_id === row.id)?.slug} />)}</div> : <div className="news-empty"><Newspaper size={42}/><h3>Chưa có tin phù hợp</h3><p>Hãy đổi năm, nguồn hoặc chế độ đọc. Kho tin cũ đang được nhập thêm theo lịch.</p><Link href="/app/news/learn" className="button primary">Learn with News</Link></div>}
    <div className="news-pagination"><button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {page + 1} / {Math.max(1, Math.ceil(count / 12))}</span><button disabled={(page + 1) * 12 >= count} onClick={() => setPage((value) => value + 1)}>Tiếp →</button></div></section>
    <section className="news-section"><div className="news-section-heading"><div><span className="eyebrow">HỌC QUA BÀI ĐỌC GỐC</span><h2>Learn with News</h2><p>Bài đọc và câu hỏi do người biên soạn, có đáp án rõ ràng.</p></div><Link href="/app/news/learn">Xem tất cả →</Link></div><div className="news-grid">{learn.slice(0,3).map((item) => <LearnCard key={item.id} item={item}/>)}</div></section>
    <p className="news-credit">Nguồn: NASA, NOAA, NSF. Mỗi bài đều dẫn tới bản gốc; chỉ nội dung có hồ sơ quyền phù hợp mới hiển thị toàn văn.</p>
  </div>;
}

function NewsCard({ row, saved, onSave, learnSlug, onSite = false, image }: { row: NewsRow; saved: boolean; onSave: () => void; learnSlug?: string; onSite?: boolean; image?: NewsImage }) {
  return <article className="news-card"><div className="news-card-art" style={{ background: `linear-gradient(135deg, ${accents[row.category]}45, #fffaf3)` }}>{image?<Image src={image.image_url} alt={image.image_alt} fill sizes="(max-width: 650px) 100vw, (max-width: 1050px) 50vw, 33vw" unoptimized/>:<span>{row.category === "Technology" ? "💻" : row.category === "Science" ? "🔬" : row.category === "Environment" ? "🌿" : row.category === "Education" ? "📚" : "🌍"}</span>}<small>{row.category}</small></div><div className="news-card-body"><div className="news-card-meta"><span>{row.publisher}</span><span>{relativeTime(row.published_at)}</span></div><h3><Link href={`/app/news/${row.id}`}>{row.title}</Link></h3><p>{newsDate(row.published_at)}</p><div className="news-card-actions"><Link href={`/app/news/${row.id}`} className="button subtle">{onSite ? "Đọc tại đây" : "Chi tiết"} <ArrowRight size={15}/></Link><a href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer" className="button subtle">Read Original <ExternalLink size={15}/></a><button aria-label={saved ? "Remove saved article" : "Save article"} aria-pressed={saved} onClick={onSave} className={saved ? "saved" : ""}><Bookmark size={19} fill={saved ? "currentColor" : "none"}/></button></div>{learnSlug && <Link className="news-learn-link" href={`/app/news/learn/${learnSlug}`}>Learn with News →</Link>}</div></article>;
}
function LearnCard({ item }: { item: LearnRow }) { return <Link href={`/app/news/learn/${item.slug}`} className="news-learn-card"><div className="news-learn-icon" style={{ background: accents[item.category] + "33" }}>{item.category === "Environment" ? "🌱" : item.category === "Technology" ? "💡" : "📖"}</div><span>{item.category} · {stages[item.stage_id] ?? item.stage_id}</span><h3>{item.title}</h3><p>{item.summary}</p><strong>Đọc & luyện tập <ArrowRight size={16}/></strong></Link>; }

function LearnList() {
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LearnRow[]>([]); const [level, setLevel] = useState("all"); const [category, setCategory] = useState("All News"); const [error, setError] = useState("");
  useEffect(() => { let request = db.from("news_learning_articles").select("id,slug,title,summary,category,stage_id,audio_url,source_url,rights_status,related_news_id,created_at").eq("published",true).order("created_at",{ascending:false}).limit(100); if (level !== "all") request = request.eq("stage_id",level); if (category !== "All News") request=request.eq("category",category); void request.then(({data,error})=>{setRows((data??[]) as LearnRow[]);setError(error?.message??"");}); },[db,level,category]);
  return <div className="content-page news-page"><NewsHero compact/><NewsRecommendations/><section className="news-section"><span className="eyebrow">BÀI ĐỌC CÓ BẢN QUYỀN RÕ RÀNG</span><h2>Learn with News</h2><p>Chọn chủ đề và mức độ phù hợp. Đây là bài đọc gốc hoặc đã được cấp phép, không phải toàn văn tin lấy tự động.</p><div className="news-toolbar"><select value={level} onChange={(event)=>setLevel(event.target.value)} aria-label="Choose level"><option value="all">Mọi trình độ</option>{Object.entries(stages).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select value={category} onChange={(event)=>setCategory(event.target.value)} aria-label="Choose category"><option>All News</option>{NEWS_CATEGORIES.map((item)=><option key={item}>{item}</option>)}</select></div>{error&&<p role="alert" className="form-error">{error}</p>}<div className="news-grid">{rows.map((item)=><LearnCard key={item.id} item={item}/>)}</div>{!rows.length&&<div className="news-empty">Chưa có bài học cho bộ lọc này.</div>}</section></div>;
}

function NewsDetail({ id }: { id: string }) {
  const db = useMemo(() => createClient(), []);
  const [row,setRow]=useState<NewsRow|null>(null);
  const [slug,setSlug]=useState<string|null>(null);
  const [saved,setSaved]=useState(false);
  const [body,setBody]=useState<NewsBody|null>(null);
  const [read,setRead]=useState(false);
  const [readError,setReadError]=useState("");
  const [marking,setMarking]=useState(false);
  useEffect(()=>{void (async()=>{const [a,b,c,d,e]=await Promise.all([db.from("news_articles").select("id,title,publisher,canonical_url,category,published_at,fetched_at,attribution_text,sensitive").eq("id",id).eq("publication_status","published").maybeSingle(),db.from("news_learning_articles").select("slug").eq("related_news_id",id).eq("published",true).maybeSingle(),db.from("user_saved_news").select("article_id").eq("article_id",id).maybeSingle(),db.from("news_article_bodies").select("body_text,rights_basis,source_url,image_url,image_alt,image_credit").eq("article_id",id).maybeSingle(),db.from("user_news_article_reads").select("article_id").eq("article_id",id).maybeSingle()]);setRow(a.data as NewsRow|null);setSlug(b.data?.slug??null);setSaved(Boolean(c.data));setBody(d.data);setRead(Boolean(e.data));})();},[db,id]);
  async function toggle(){const result=saved?await db.from("user_saved_news").delete().eq("article_id",id):await db.from("user_saved_news").insert({article_id:id});if(!result.error)setSaved(!saved);}
  async function markRead(){setMarking(true);setReadError("");const result=await db.rpc("news_mark_article_read",{p_article_id:id});setMarking(false);if(result.error)setReadError(result.error.message);else setRead(true);}
  if(!row)return <div className="content-page news-page news-detail-page"><Link href="/app/news">← Daily News</Link><div className="news-empty">Tin không có sẵn hoặc đang chờ duyệt.</div></div>;
  const onSitePublisher = body?.source_url.includes("noaa.gov") ? "NOAA" : "NASA";
  const rightsUrl = onSitePublisher === "NOAA" ? "https://www.noaa.gov/office-education/outreach-communication/faq" : "https://www.nasa.gov/nasa-brand-center/images-and-media/";
  const image = newsImage(body);
  return <div className="content-page news-page news-detail-page"><Link href="/app/news" className="news-back"><ArrowLeft size={17}/> Daily News</Link><article className="news-detail"><header className="news-detail-lead"><div><div className="news-detail-art" style={{background:`linear-gradient(120deg,${accents[row.category]}55,#fffaf3)`}}>{image?<Image src={image.image_url} alt={image.image_alt} fill sizes="(max-width: 950px) 100vw, 48vw" unoptimized/>:"📰"}<span>{row.category}</span></div>{image&&<p className="news-image-credit">Ảnh: {image.image_credit} · <a href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer">Nguồn bài gốc</a></p>}</div><div className="news-detail-intro"><span className="eyebrow">{row.category} · {relativeTime(row.published_at)}</span><h1>{row.title}</h1><p>{row.publisher} · {newsDate(row.published_at)}</p><p className="news-attribution">{row.attribution_text} {row.attribution_text.includes("GDELT")&&<a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">The GDELT Project</a>}</p>{body?<div className="news-rights-note"><BookOpenText size={20}/><p>Nội dung {image?"văn bản và ảnh":"văn bản"} {onSitePublisher} được hiển thị tại đây với ghi nguồn. <a href={rightsUrl} target="_blank" rel="noopener noreferrer">Xem hướng dẫn sử dụng của {onSitePublisher}</a>.</p></div>:<div className="news-rights-note"><BookOpenText size={20}/><p>Nguồn này chưa có quyền hiển thị toàn bài trên IeltsWithHarry. Bạn có thể đọc tại trang nhà xuất bản.</p></div>}</div></header>{body&&<NewsReadingTools articleId={id} paragraphs={body.body_text.split(/\n\n+/)}><div className="news-reading-control"><button disabled={read||marking} onClick={()=>void markRead()}>{read?"✓ Đã hoàn thành bài đọc":marking?"Đang lưu…":"Tôi đã đọc xong ✓"}</button>{read&&<span>Hoạt động đọc đã được ghi vào lịch sử của bạn.</span>}</div>{readError&&<p className="form-error" role="alert">{readError}</p>}</NewsReadingTools>}<div className="news-detail-actions"><a className="button primary" href={safeExternal(row.canonical_url)} target="_blank" rel="noopener noreferrer">Read Original Article <ExternalLink size={17}/></a><button className="button subtle" onClick={()=>void toggle()}><Bookmark size={17} fill={saved?"currentColor":"none"}/> {saved?"Đã lưu":"Lưu tin"}</button>{slug&&<Link className="button subtle" href={`/app/news/learn/${slug}`}>Learn with News →</Link>}</div></article></div>;
}

function SavedNews(){const db=useMemo(()=>createClient(),[]);const [rows,setRows]=useState<NewsRow[]>([]);useEffect(()=>{void db.from("user_saved_news").select("article_id, news_articles(id,title,publisher,canonical_url,category,published_at,fetched_at,attribution_text,sensitive)").order("saved_at",{ascending:false}).limit(100).then(({data})=>setRows((data??[]).flatMap((item)=>item.news_articles?[item.news_articles as unknown as NewsRow]:[])));},[db]);return <div className="content-page news-page"><NewsHero compact/><section className="news-section"><h2>🔖 Tin đã lưu</h2><p>Danh sách riêng của bạn. Mở bài gốc trên trang nhà xuất bản.</p><div className="news-grid">{rows.map((row)=><NewsCard key={row.id} row={row} saved onSave={async()=>{await db.from("user_saved_news").delete().eq("article_id",row.id);setRows((current)=>current.filter((item)=>item.id!==row.id));}}/>)}</div>{!rows.length&&<div className="news-empty">Bạn chưa lưu tin nào. <Link href="/app/news">Khám phá Daily News →</Link></div>}</section></div>;}

function NewsHistory(){
  const db=useMemo(()=>createClient(),[]);
  const [attempts,setAttempts]=useState<AttemptRow[]>([]);
  const [progress,setProgress]=useState<{article_id:string;last_read_at:string;completed_at:string|null;best_score:number|null;best_total:number|null}[]>([]);
  const [titles,setTitles]=useState<Record<string,string>>({});
  const [newsReads,setNewsReads]=useState<{article_id:string;read_at:string}[]>([]);
  const [newsTitles,setNewsTitles]=useState<Record<string,string>>({});
  useEffect(()=>{void (async()=>{
    const [a,p,l,n]=await Promise.all([
      db.from("news_reading_attempts").select("id,article_id,score,total,submitted_at").order("submitted_at",{ascending:false}).limit(100),
      db.from("user_news_progress").select("article_id,last_read_at,completed_at,best_score,best_total").order("last_read_at",{ascending:false}).limit(100),
      db.from("news_learning_articles").select("id,title,slug").eq("published",true).limit(100),
      db.from("user_news_article_reads").select("article_id,read_at").order("read_at",{ascending:false}).limit(100),
    ]);
    setAttempts((a.data??[]) as AttemptRow[]);setProgress((p.data??[]) as typeof progress);
    setTitles(Object.fromEntries((l.data??[]).map((item)=>[item.id,`${item.title}|${item.slug}`])));
    setNewsReads(n.data??[]);
    const ids=(n.data??[]).map((item)=>item.article_id);
    if(ids.length){const headlines=await db.from("news_articles").select("id,title").in("id",ids);setNewsTitles(Object.fromEntries((headlines.data??[]).map((item)=>[item.id,item.title])));}
  })();},[db]);
  return <div className="content-page news-page"><NewsHero compact/><section className="news-section"><h2>📚 Lịch sử học với tin</h2><div className="news-stats"><div><Newspaper/><span>Tin đã đọc xong</span><strong>{newsReads.length}</strong></div><div><BookOpenText/><span>Bài luyện đã mở</span><strong>{progress.length}</strong></div><div><CheckCircle2/><span>Quiz đã nộp</span><strong>{attempts.length}</strong></div></div><h3>Tin đã đọc trực tiếp</h3><div className="news-history-list">{newsReads.map((item)=><article key={item.article_id}><span>{newsDate(item.read_at)}</span><h3>{newsTitles[item.article_id]??"Bài tin"}</h3><Link href={`/app/news/${item.article_id}`}>Đọc lại →</Link></article>)}</div>{!newsReads.length&&<div className="news-empty">Bạn chưa đánh dấu hoàn thành tin nào. <Link href="/app/news#direct-news">Khám phá tin đọc trực tiếp →</Link></div>}<h3>Bài luyện và câu hỏi</h3><div className="news-history-list">{attempts.map((item)=><article key={item.id}><span>{newsDate(item.submitted_at)}</span><h3>{titles[item.article_id]?.split("|")[0]??"Bài đọc"}</h3><p>{item.score}/{item.total} câu đúng · {Math.round(item.score/item.total*100)}%</p>{titles[item.article_id]&&<Link href={`/app/news/learn/${titles[item.article_id].split("|")[1]}`}>Ôn lại →</Link>}</article>)}</div>{!attempts.length&&<div className="news-empty">Bạn chưa hoàn thành bài quiz nào. <Link href="/app/news/learn">Bắt đầu đọc →</Link></div>}</section></div>;
}

function LearnReader({ slug }: { slug: string }) {
  const db=useMemo(()=>createClient(),[]);const {entries,addEntry}=useNotebook();const {addTask}=useDemo();
  const [article,setArticle]=useState<LearnRow|null>(null);const [words,setWords]=useState<WordRow[]>([]);const [questions,setQuestions]=useState<QuestionRow[]>([]);const [answers,setAnswers]=useState<Record<string,string>>({});const [result,setResult]=useState<{score:number;total:number;review:Review[]}|null>(null);const [selected,setSelected]=useState<WordRow|null>(null);const [lookup,setLookup]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [readPercent,setReadPercent]=useState(0);
  useEffect(()=>{void (async()=>{const a=await db.from("news_learning_articles").select("id,slug,title,summary,category,stage_id,passage,audio_url,source_url,rights_status,related_news_id,created_at").eq("slug",slug).eq("published",true).maybeSingle();if(!a.data)return;setArticle(a.data as LearnRow);const [w,q]=await Promise.all([db.from("news_vocabulary").select("id,word,part_of_speech,meaning_vi,definition,phonetic,example").eq("article_id",a.data.id).order("sort_order"),db.from("news_questions").select("id,kind,prompt,options,supporting_sentence").eq("article_id",a.data.id).order("sort_order")]);setWords((w.data??[]) as WordRow[]);setQuestions((q.data??[]) as QuestionRow[]);await db.rpc("news_mark_read",{p_slug:slug});})();},[db,slug]);
  function onSelect(){const text=window.getSelection()?.toString().trim().replace(/^[^a-z]+|[^a-z]+$/gi,"").toLowerCase()??"";if(!text||text.includes(" "))return;setLookup(text);const forms=[text,text.replace(/(ies)$/,"y"),text.replace(/(ing|ed|es|s)$/,""),text.replace(/(ing)$/,"e")];setSelected(words.find((w)=>forms.includes(w.word.toLowerCase()))??null);}
  async function saveWord(word:WordRow){if(entries.some((entry)=>entry.kind==="word"&&entry.title.toLowerCase()===word.word.toLowerCase()))return;try{await addEntry({kind:"word",title:word.word,body:"",meaningVi:word.meaning_vi,example:word.example});}catch(cause){setError(cause instanceof Error?cause.message:"Không thể lưu từ");}}
  async function submit(){setBusy(true);setError("");const response=await db.rpc("news_submit_quiz",{p_slug:slug,p_answers:answers});setBusy(false);if(response.error){setError(response.error.message);return;}setResult(response.data as {score:number;total:number;review:Review[]});}
  async function planner(){if(!article)return;try{await addTask({title:`Read ${article.title.slice(0,60)} — quiz`,skill:"Reading",date:new Date().toISOString().slice(0,10),time:"",completed:false,priority:"Medium",lesson:`news:${slug}`});}catch(cause){setError(cause instanceof Error?cause.message:"Không thể thêm kế hoạch");}}
  async function advanceReading(){const next=Math.min(100,readPercent+25);setReadPercent(next);if(next===100){const response=await db.rpc("news_finish_read",{p_slug:slug});if(response.error)setError(response.error.message);}}
  if(!article)return <div className="content-page news-page"><Link href="/app/news/learn">← Learn with News</Link><div className="news-empty">Bài đọc chưa xuất bản hoặc không tồn tại.</div></div>;
  return <div className="content-page news-page"><Link href="/app/news/learn" className="news-back"><ArrowLeft size={17}/> Learn with News</Link><header className="news-reader-head"><span className="eyebrow">{article.category} · {stages[article.stage_id]??article.stage_id}</span><h1>{article.title}</h1><p>{article.summary}</p><div><span>✍️ {article.rights_status==="ORIGINAL"?"Bài đọc gốc":"Nội dung được cấp phép"}</span><button className="button subtle" onClick={()=>void planner()}><CalendarPlus size={17}/> Add to Study Planner</button></div></header><div className="news-reader-layout"><div><div className="news-read-progress"><span>Tiến độ đọc</span><div><i style={{width:`${readPercent}%`}}/></div><strong>{readPercent}%</strong></div><article className="news-passage" onMouseUp={onSelect} onTouchEnd={onSelect}>{article.passage?.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</article><div className="news-reading-control"><button onClick={()=>void advanceReading()}>Đã đọc phần này ✓</button>{readPercent===100&&<span>🎉 Bạn đã hoàn thành phần đọc!</span>}</div>{article.audio_url&&<section className="news-audio"><h3><Headphones size={19}/> Nghe bài đọc</h3><audio controls src={article.audio_url} preload="none"/><p>Điều chỉnh tốc độ và tua bằng trình phát.</p></section>}
      <section className="news-quiz"><span className="eyebrow">READING PRACTICE</span><h2>Kiểm tra hiểu bài</h2><p>{questions.length} câu hỏi do người biên soạn, chấm theo đáp án cố định.</p>{questions.map((q,index)=><div className="news-question" key={q.id}><strong>Câu {index+1} · {q.kind.replaceAll("_"," ")}</strong><h3>{q.prompt}</h3>{q.options.length?<div className="news-options">{q.options.map((option)=><label key={option} className={answers[q.id]===option?"selected":""}><input type="radio" name={q.id} value={option} checked={answers[q.id]===option} onChange={()=>setAnswers((current)=>({...current,[q.id]:option}))}/>{option}</label>)}</div>:<input aria-label={`Answer question ${index+1}`} value={answers[q.id]??""} onChange={(event)=>setAnswers((current)=>({...current,[q.id]:event.target.value}))} placeholder="Câu trả lời của bạn"/>}{result&&<div className={result.review.find((r)=>r.id===q.id)?.correctAnswer.toLowerCase()===answers[q.id]?.trim().toLowerCase()?"news-answer correct":"news-answer"}><b>Đáp án: {result.review.find((r)=>r.id===q.id)?.correctAnswer}</b><p>{result.review.find((r)=>r.id===q.id)?.explanation}</p>{q.supporting_sentence&&<small>Trong bài: {q.supporting_sentence}</small>}</div>}</div>)}{error&&<p className="form-error" role="alert">{error}</p>}{questions.length>0&&<button className="button primary" disabled={busy||Object.keys(answers).length<questions.length} onClick={()=>void submit()}>{busy?"Đang chấm…":"Nộp bài & xem kết quả"}</button>}{result&&<div className="news-result"><Trophy/><h3>{result.score}/{result.total} câu đúng · {Math.round(result.score/result.total*100)}%</h3><p>{result.score===result.total?"Xuất sắc! Bạn đã hiểu toàn bộ bài đọc.":`Hãy xem lại ${result.total-result.score} câu và ghi nhớ từ mới.`}</p><Link href="/app/news/history">Xem lịch sử học →</Link></div>}</section></div>
    <aside className="news-vocab-panel"><span className="eyebrow">WORD EXPLORER</span><h2><Volume2 size={20}/> Từ vựng</h2><p>Chọn một từ trong bài hoặc mở danh sách bên dưới.</p>{lookup&&<div className="news-lookup">{selected?<><strong>{selected.word} <small>{selected.phonetic}</small></strong><span>{selected.part_of_speech}</span><p>{selected.meaning_vi}</p><p>{selected.definition}</p><em>{selected.example}</em><button onClick={()=>void saveWord(selected)}>{entries.some((entry)=>entry.kind==="word"&&entry.title.toLowerCase()===selected.word.toLowerCase())?"✓ Đã lưu":"☆ Lưu từ"}</button></>:<p>Chưa có từ “{lookup}” trong bộ từ của bài. Chọn một từ được biên soạn bên dưới.</p>}</div>}{words.map((word)=><button key={word.id} className="news-word" onClick={()=>{setSelected(word);setLookup(word.word);}}><strong>{word.word}</strong><span>{word.meaning_vi}</span></button>)}<Link href="/app/notebook">Mở sổ từ vựng →</Link></aside></div></div>;
}
