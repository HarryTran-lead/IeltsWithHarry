"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookCopy, BookOpen, BookOpenText, Clock3, CloudUpload, Download, FileText, Folder, Grid2X2, History, List, Mic, MoreVertical, NotebookPen, Pencil, Plus, RotateCcw, Search, Sparkles, Star, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useDemo } from "@/features/demo/demo-store";
import { NotebookPage, QuickForm } from "./notebook-ui";
import { useNotebook, type NotebookEntry } from "./notebook-store";
import { SmartEditor } from "./smart-editor";
import { SmartCoverPicker, SmartCreateDialog } from "./smart-create-dialog";
import { covers, documentSchema, papers, type Book, type Cover, type PageDocument, type Paper, type TextElement } from "./smart-model";
import "./smart-notebook.css";

type BookWithCount = Book & { count: number };

function bookIcon(title: string) {
  const name = title.toLocaleLowerCase();
  if (name.includes("grammar") || name.includes("ngữ pháp")) return FileText;
  if (name.includes("writing") || name.includes("viết")) return Pencil;
  if (name.includes("speaking") || name.includes("nói")) return Mic;
  return BookOpen;
}

function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "gần đây";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "hôm nay";
  if (days === 1) return "1 ngày trước";
  if (days < 7) return `${days} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric", year: "numeric" }).format(date);
}

function activityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "GẦN ĐÂY";
  const day = relativeTime(value).toLocaleUpperCase();
  return `${day} · ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date)}`;
}

export function SmartNotebook() {
  const pathname = usePathname();
  const id = pathname.split("/")[3];
  return id ? <SmartEditor bookId={id} /> : <Library />;
}

function Library() {
  const db = useMemo(() => createClient(), []);
  const { entries, visits } = useNotebook();
  const { attempts } = useDemo();
  const router = useRouter();
  const [books, setBooks] = useState<BookWithCount[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "recent" | "favorite" | "trash">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [creating, setCreating] = useState(false);
  const [quickNote, setQuickNote] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [menuBookId, setMenuBookId] = useState<string | null>(null);
  const [coverBook, setCoverBook] = useState<BookWithCount | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<Cover>("teal");
  const [paper, setPaper] = useState<Paper>("blank");
  const [folder, setFolder] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [word, setWord] = useState<NotebookEntry | null>(null);
  const [targetBook, setTargetBook] = useState("");
  const [targetPage, setTargetPage] = useState("");
  const [wordPages, setWordPages] = useState<{ id: string; position: number }[]>([]);

  const refresh = useCallback(async () => {
    const { data, error: bookError } = await db.from("smart_notebooks").select("*").order("updated_at", { ascending: false }).limit(200);
    setError("");
    if (bookError) { setError(bookError.message); setReady(true); return; }
    const { data: pages, error: pageError } = await db.from("smart_notebook_pages").select("notebook_id").limit(5000);
    if (pageError) { setError(pageError.message); setReady(true); return; }
    const counts = new Map<string, number>();
    for (const page of pages ?? []) counts.set(page.notebook_id, (counts.get(page.notebook_id) ?? 0) + 1);
    setBooks((data as Book[]).map((book) => ({ ...book, count: counts.get(book.id) ?? 0 })));
    setReady(true);
  }, [db]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const shown = books.filter((book) => {
    if (tab === "trash") return Boolean(book.deleted_at) && `${book.title} ${book.description} ${book.folder}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    if (book.deleted_at || (tab === "favorite" && !book.favorite)) return false;
    if (folderFilter && book.folder !== folderFilter) return false;
    return `${book.title} ${book.description} ${book.folder}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }).sort((a, b) => (tab === "recent" ? (b.opened_at ?? "").localeCompare(a.opened_at ?? "") : b.updated_at.localeCompare(a.updated_at)));

  async function create() {
    if (!title.trim() || title.trim().length > 100) { setError("Vui lòng nhập tên sổ tay từ 1 đến 100 ký tự."); return; }
    setBusy(true); setError("");
    const result = await db.from("smart_notebooks").insert({ title: title.trim(), description: description.trim().slice(0, 300), cover, folder: folder.trim().slice(0, 60) }).select("id").single();
    if (result.error || !result.data) { setError(result.error?.message ?? "Không tạo được sổ tay."); setBusy(false); return; }
    if (paper !== "blank") {
      const { data: first } = await db.from("smart_notebook_pages").select("id,revision,document").eq("notebook_id", result.data.id).single();
      if (first) await db.rpc("save_smart_notebook_page", { p_page: first.id, p_revision: first.revision, p_document: first.document, p_paper: paper });
    }
    router.push(`/app/notebook/${result.data.id}`);
  }
  async function update(book: Book, changes: Record<string, unknown>) {
    setBusy(true); setError("");
    const { error: saveError } = await db.from("smart_notebooks").update(changes).eq("id", book.id);
    if (saveError) setError(saveError.message);
    else await refresh();
    setBusy(false);
  }
  async function duplicate(book: Book) {
    setBusy(true); setError("");
    const original = await db.from("smart_notebook_pages").select("paper,document,position").eq("notebook_id", book.id).order("position");
    if (original.error) { setError(original.error.message); setBusy(false); return; }
    const made = await db.from("smart_notebooks").insert({ title: `${book.title} (bản sao)`.slice(0, 100), description: book.description, cover: book.cover, folder: book.folder }).select("id").single();
    if (made.error || !made.data) { setError(made.error?.message ?? "Không sao chép được."); setBusy(false); return; }
    const first = await db.from("smart_notebook_pages").select("id,revision").eq("notebook_id", made.data.id).single();
    for (const [index, page] of (original.data ?? []).entries()) {
      const target = index === 0 ? first.data : (await db.from("smart_notebook_pages").insert({ notebook_id: made.data.id, position: index }).select("id,revision").single()).data;
      if (!target) { setError("Bản sao chưa hoàn chỉnh. Hãy kiểm tra trước khi sử dụng."); break; }
      const saved = await db.rpc("save_smart_notebook_page", { p_page: target.id, p_revision: target.revision, p_document: page.document, p_paper: page.paper });
      if (saved.error) { setError("Bản sao chưa hoàn chỉnh: " + saved.error.message); break; }
    }
    await refresh(); setBusy(false);
  }
  async function importData(file: File) {
    if (file.size > 20 * 1024 * 1024) { setError("Tệp dữ liệu vượt quá 20 MB."); return; }
    setBusy(true); setError("");
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!data || typeof data !== "object" || !("notebook" in data) || !("pages" in data)) throw new Error("Tệp không đúng định dạng sổ tay.");
      const input = data as { notebook: Partial<Book>; pages: { paper: Paper; document: PageDocument }[] };
      if (typeof input.notebook?.title !== "string" || !Array.isArray(input.pages) || !input.pages.length || input.pages.length > 100 || input.pages.some((page) => !papers.includes(page.paper) || !documentSchema.safeParse(page.document).success)) throw new Error("Tệp có trang hoặc nội dung không hợp lệ.");
      const made = await db.from("smart_notebooks").insert({ title: `${input.notebook.title.slice(0, 88)} (đã nhập)`, description: (input.notebook.description ?? "").slice(0, 300), cover: covers.includes(input.notebook.cover as Cover) ? input.notebook.cover : "teal", folder: typeof input.notebook.folder === "string" ? input.notebook.folder.slice(0, 60) : "" }).select("id").single();
      if (made.error || !made.data) throw new Error(made.error?.message ?? "Không tạo được sổ tay.");
      const first = await db.from("smart_notebook_pages").select("id,revision").eq("notebook_id", made.data.id).single();
      for (const [index, page] of input.pages.entries()) {
        const target = index === 0 ? first.data : (await db.from("smart_notebook_pages").insert({ notebook_id: made.data.id, position: index }).select("id,revision").single()).data;
        if (!target) throw new Error("Đã tạo vở nhưng chưa nhập đủ trang. Hãy kiểm tra vở mới.");
        const saved = await db.rpc("save_smart_notebook_page", { p_page: target.id, p_revision: target.revision, p_document: page.document, p_paper: page.paper });
        if (saved.error) throw new Error("Đã tạo vở nhưng chưa nhập đủ trang: " + saved.error.message);
      }
      await refresh(); router.push(`/app/notebook/${made.data.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không nhập được dữ liệu."); }
    finally { setBusy(false); }
  }
  async function chooseWord(entry: NotebookEntry) {
    setWord(entry);
    const first = books.find((item) => !item.deleted_at);
    setTargetBook(first?.id ?? "");
    if (first) await loadWordPages(first.id);
  }
  async function loadWordPages(id: string) {
    const result = await db.from("smart_notebook_pages").select("id,position").eq("notebook_id", id).order("position");
    if (result.error) { setError(result.error.message); return; }
    setWordPages(result.data ?? []); setTargetPage(result.data?.[0]?.id ?? "");
  }
  async function saveWord() {
    if (!word || !targetBook || !targetPage) return;
    setBusy(true); setError("");
    const page = await db.from("smart_notebook_pages").select("id,document,revision,paper").eq("id", targetPage).eq("notebook_id", targetBook).single();
    if (page.error || !page.data) { setError(page.error?.message ?? "Không mở được trang."); setBusy(false); return; }
    const parsed = documentSchema.safeParse(page.data.document);
    if (!parsed.success) { setError("Trang có dữ liệu không hợp lệ."); setBusy(false); return; }
    if (parsed.data.elements.some((item) => item.type === "text" && item.sourceId === word.id)) { setBusy(false); setWord(null); router.push(`/app/notebook/${targetBook}`); return; }
    const safe = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const html = `<p><strong>${safe(word.title)}</strong> — ${safe(word.meaningVi)}</p>${word.example ? `<p><em>${safe(word.example)}</em></p>` : ""}${word.sourcePath.startsWith("/app/") ? `<p><a href="${window.location.origin}${safe(word.sourcePath)}">Mở trang nguồn</a></p>` : ""}`;
    const bottom = Math.min(900, Math.max(60, ...parsed.data.elements.map((item) => item.y + item.height + 16)));
    const element: TextElement = { id: crypto.randomUUID(), type: "text", x: 60, y: bottom, width: 600, height: 150, html, sourceId: word.id };
    const saved = await db.rpc("save_smart_notebook_page", { p_page: targetPage, p_revision: page.data.revision, p_document: { ...parsed.data, elements: [...parsed.data.elements, element] }, p_paper: page.data.paper });
    if (saved.error) setError(saved.error.message);
    else { setWord(null); router.push(`/app/notebook/${targetBook}`); }
    setBusy(false);
  }

  const activeBooks = books.filter((book) => !book.deleted_at);
  const recentActivities = [
    ...activeBooks.map((book) => ({ id: `book-${book.id}`, date: book.updated_at, title: `Cập nhật sổ tay ${book.title}`, detail: `${book.count} trang trong sổ tay`, kind: "book", href: `/app/notebook/${book.id}` })),
    ...entries.map((entry) => ({ id: `entry-${entry.id}`, date: entry.updatedAt, title: entry.kind === "word" ? `Lưu từ mới ${entry.title}` : `Thêm ghi chú ${entry.title}`, detail: entry.kind === "word" ? entry.meaningVi : entry.body, kind: entry.kind, href: entry.sourcePath.startsWith("/app/") ? entry.sourcePath : "/app/notebook" })),
    ...visits.map((visit) => ({ id: `visit-${visit.id}`, date: visit.visitedAt, title: `Mở ${visit.title}`, detail: "Đã xem nội dung học tập", kind: "visit", href: visit.path })),
    ...attempts.map((attempt) => ({ id: `attempt-${attempt.id}`, date: attempt.submittedAt ?? `${attempt.date}T12:00:00`, title: `Hoàn thành ${attempt.lesson.replaceAll("-", " ")}`, detail: `${attempt.score}/${attempt.total} câu đúng`, kind: "attempt", href: `/app/lesson/${attempt.lesson}` })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  function exportLegacyData() {
    const file = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries, visits, attempts }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ieltswithharry-notebook.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className={`content-page smart-library${ready && activeBooks.length === 0 && tab === "all" && !query ? " is-empty" : ""}`}>
    <header className="smart-library-hero">
      <div className="smart-hero-copy"><span className="eyebrow">MY WORKSPACE</span><h1>Sổ tay của tôi</h1><p>Không gian riêng để ghi chép, viết tay và lưu kiến thức học tập.</p></div>
      <span className="smart-hero-art" aria-hidden="true" />
      <div className="smart-hero-actions"><button className="button subtle" onClick={() => setQuickNote((value) => !value)}><Pencil size={18} /> Ghi chú nhanh</button><button className="button primary" onClick={() => setCreating(true)}><Plus size={20} /> Tạo sổ tay</button></div>
    </header>
    {quickNote && <section className="card smart-quick-note"><div className="smart-panel-heading"><h2>Ghi chú nhanh</h2><button type="button" aria-label="Đóng ghi chú" onClick={() => setQuickNote(false)}><X size={18} /></button></div><QuickForm kind="note" onSaved={() => setQuickNote(false)} /></section>}
    {word && <section className="card smart-word-picker" aria-label="Đưa từ vào vở"><h2>Đưa “{word.title}” vào vở</h2>{books.some((item) => !item.deleted_at) ? <><label>Chọn sổ tay<select value={targetBook} onChange={(event) => { setTargetBook(event.target.value); void loadWordPages(event.target.value); }}>{books.filter((item) => !item.deleted_at).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Chọn trang<select value={targetPage} onChange={(event) => setTargetPage(event.target.value)}>{wordPages.map((item, index) => <option key={item.id} value={item.id}>Trang {index + 1}</option>)}</select></label><div><button className="button subtle" onClick={() => setWord(null)}>Hủy</button><button className="button primary" disabled={busy || !targetPage} onClick={() => void saveWord()}>Lưu và mở sổ tay</button></div></> : <><p>Hãy tạo sổ tay trước khi đưa từ vào vở.</p><button className="button primary" onClick={() => { setWord(null); setCreating(true); }}>Tạo sổ tay</button></>}</section>}
    {creating && <SmartCreateDialog title={title} description={description} folder={folder} cover={cover} paper={paper} busy={busy} onTitle={setTitle} onDescription={setDescription} onFolder={setFolder} onCover={setCover} onPaper={setPaper} onCancel={() => setCreating(false)} onCreate={() => void create()} />}
    {coverBook && <SmartCoverPicker current={coverBook.cover} onCancel={() => setCoverBook(null)} onSelect={(next) => { void update(coverBook, { cover: next }); setCoverBook(null); }} />}
    {error && <div className="form-error" role="alert">{error} <button onClick={() => void refresh()}>Tải lại</button></div>}
    <div className="smart-library-tools"><label className="smart-search"><Search size={20} /><input aria-label="Tìm kiếm sổ tay" placeholder="Tìm kiếm sổ tay của bạn..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="smart-tabs" role="group" aria-label="Lọc sổ tay">{(["all", "recent", "favorite"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{{ all: "Tất cả", recent: "Gần đây", favorite: "Yêu thích" }[item]}</button>)}</div><label className="smart-folder-filter"><Folder size={16} /><select aria-label="Lọc theo thư mục" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}><option value="">Thư mục</option>{[...new Set(books.filter((item) => !item.deleted_at).map((item) => item.folder).filter(Boolean))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></label><div className="smart-views"><button aria-label="Xem dạng lưới" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={19} /></button><button aria-label="Xem dạng danh sách" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={19} /></button></div></div>
    <div className="smart-library-columns"><div className="smart-library-main">
      <div className="smart-section-heading"><h2>{tab === "trash" ? "Thùng rác" : "Các sổ tay của tôi"} <span>{shown.length} sổ tay</span></h2>{tab === "trash" && <button onClick={() => setTab("all")}>← Quay lại</button>}</div>
      {!ready ? <p>Đang tải sổ tay…</p> : shown.length ? <div className={`smart-book-list ${view}`}>{shown.map((book) => { const Icon = bookIcon(book.title); return <article className="smart-book" key={book.id}>
        <div className={`smart-book-cover ${book.cover}`}><span className="smart-spiral" aria-hidden="true" /><Link href={`/app/notebook/${book.id}`} className="smart-cover-link" aria-label={`Mở ${book.title}`}><Icon size={36} strokeWidth={1.7} /><strong>{book.title}</strong><small>My Notebook</small></Link><button className="smart-book-menu-trigger" aria-label={`Tùy chọn ${book.title}`} aria-expanded={menuBookId === book.id} onClick={() => setMenuBookId(menuBookId === book.id ? null : book.id)}><MoreVertical size={20} /></button>{menuBookId === book.id && <div className="smart-book-menu">{book.deleted_at ? <button disabled={busy} onClick={() => { setMenuBookId(null); void update(book, { deleted_at: null }); }}><RotateCcw size={15} /> Khôi phục</button> : <><button onClick={() => { setMenuBookId(null); router.push(`/app/notebook/${book.id}`); }}><BookOpen size={15} /> Mở sổ tay</button><button disabled={busy} onClick={() => { setMenuBookId(null); const name = window.prompt("Đổi tên sổ tay", book.title)?.trim(); if (name && name.length <= 100) void update(book, { title: name }); }}><Pencil size={15} /> Đổi tên</button><button disabled={busy} onClick={() => { setMenuBookId(null); setCoverBook(book); }}><Sparkles size={15} /> Đổi bìa</button><button disabled={busy} onClick={() => { setMenuBookId(null); const next = window.prompt("Chuyển vào thư mục (để trống nếu bỏ thư mục)", book.folder)?.trim(); if (next !== undefined && next.length <= 60) void update(book, { folder: next }); }}><Folder size={15} /> Chuyển thư mục</button><button disabled={busy} onClick={() => { setMenuBookId(null); void duplicate(book); }}><BookCopy size={15} /> Sao chép</button><button disabled={busy} onClick={() => { setMenuBookId(null); if (window.confirm(`Chuyển “${book.title}” vào thùng rác?`)) void update(book, { deleted_at: new Date().toISOString() }); }}><Trash2 size={15} /> Xóa</button></>}</div>}</div>
        <div className="smart-book-info"><div className="smart-book-title-line"><h3><Link href={`/app/notebook/${book.id}`}>{book.title}</Link></h3>{!book.deleted_at && <button disabled={busy} aria-label={book.favorite ? `Bỏ yêu thích ${book.title}` : `Yêu thích ${book.title}`} onClick={() => void update(book, { favorite: !book.favorite })}><Star size={19} fill={book.favorite ? "currentColor" : "none"} /></button>}</div><p title={book.description || book.folder}>{book.description || book.folder || "Ghi chép của tôi"}</p><small><Clock3 size={15} /> {book.count} trang · {relativeTime(book.updated_at)}</small></div>
      </article>; })}</div> : <div className="smart-empty"><span className="smart-empty-art" aria-hidden="true" /><h2>{query ? "Không tìm thấy sổ tay phù hợp." : tab === "trash" ? "Thùng rác đang trống" : "Bạn chưa có sổ tay nào"}</h2><p>{!query && tab !== "trash" ? "Hãy tạo sổ tay đầu tiên để bắt đầu ghi chép, viết tay và lưu giữ kiến thức của bạn." : ""}</p>{!query && tab !== "trash" && <><button className="button primary" onClick={() => setCreating(true)}><Plus size={17} /> Tạo sổ tay</button><span className="smart-empty-or">hoặc</span><button className="button subtle" onClick={() => setQuickNote(true)}><Pencil size={17} /> Ghi chú nhanh</button><div className="smart-empty-features"><span><Pencil size={23} /> Viết tay tự nhiên</span><span><FileText size={23} /> Soạn thảo văn bản</span><span><CloudUpload size={23} /> Lưu trữ an toàn</span></div></>}</div>}
      <div className="smart-library-bottom-actions"><button className="button subtle" disabled={busy} onClick={() => importRef.current?.click()}><Upload size={18} /> Nhập dữ liệu</button><input ref={importRef} type="file" hidden accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = ""; }} /><button className="button subtle" onClick={exportLegacyData}><Download size={18} /> Xuất dữ liệu cũ</button><button className="smart-trash-link" onClick={() => setTab(tab === "trash" ? "all" : "trash")}><Trash2 size={15} /> {tab === "trash" ? "Trở lại" : "Thùng rác"}</button></div>
    </div><aside className="smart-benefits"><div className="smart-benefits-heading"><Sparkles size={25} /><h2>Không gian học tập<br />của riêng bạn</h2></div><p>Ghi chú bằng bàn phím hoặc viết tay, lưu trữ tài liệu học tập và đồng bộ trên mọi thiết bị.</p><div className="smart-benefit"><span><Pencil size={23} /></span><div><strong>Ghi chú linh hoạt</strong><small>Gõ phím hoặc viết tay</small></div></div><div className="smart-benefit"><span><CloudUpload size={23} /></span><div><strong>Lưu trữ an toàn</strong><small>Tự động đồng bộ trên mọi thiết bị</small></div></div><div className="smart-benefit"><span><Folder size={23} /></span><div><strong>Tổ chức dễ dàng</strong><small>Phân loại theo chủ đề, gắn thẻ</small></div></div><span className="smart-benefits-art" aria-hidden="true" /></aside></div>
    <section className="smart-recent"><div className="smart-recent-head"><div><h2>Hoạt động gần đây</h2><p>{recentActivities.length} hoạt động gần nhất của bạn</p></div><button onClick={() => setShowHistory((value) => !value)}>{showHistory ? "Thu gọn" : "Xem tất cả"} <span aria-hidden="true">→</span></button></div>{recentActivities.length ? <div className="smart-recent-grid">{recentActivities.map((item) => <Link href={item.href} key={item.id} className="smart-recent-item"><span className={`smart-recent-icon ${item.kind}`}>{item.kind === "book" ? <BookOpenText size={26} /> : item.kind === "note" ? <NotebookPen size={26} /> : item.kind === "word" ? <FileText size={26} /> : item.kind === "visit" ? <History size={26} /> : <Pencil size={26} />}</span><span><small>{activityTime(item.date)}</small><strong>{item.title}</strong><em>{item.detail}</em></span></Link>)}</div> : <p className="smart-recent-empty">Chưa có hoạt động. Hãy tạo sổ tay hoặc ghi chú đầu tiên.</p>}</section>
    {showHistory && <NotebookPage compact onImportWord={(entry) => void chooseWord(entry)} />}
  </div>;
}
