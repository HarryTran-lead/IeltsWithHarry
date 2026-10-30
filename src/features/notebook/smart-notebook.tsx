"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookCopy, BookOpen, Grid2X2, Heart, List, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { NotebookPage } from "./notebook-ui";
import type { NotebookEntry } from "./notebook-store";
import { SmartEditor } from "./smart-editor";
import { covers, documentSchema, papers, type Book, type Cover, type PageDocument, type Paper, type TextElement } from "./smart-model";
import "./smart-notebook.css";

type BookWithCount = Book & { count: number };
const coverLabels: Record<Cover, string> = { teal: "Xanh ngọc", blue: "Xanh lam", lavender: "Tím nhạt", coral: "San hô", sand: "Màu cát" };
const paperLabels: Record<Paper, string> = { blank: "Giấy trắng", ruled: "Giấy kẻ dòng", grid: "Giấy ô vuông" };

export function SmartNotebook() {
  const pathname = usePathname();
  const id = pathname.split("/")[3];
  return id ? <SmartEditor bookId={id} /> : <Library />;
}

function Library() {
  const db = useMemo(() => createClient(), []);
  const router = useRouter();
  const [books, setBooks] = useState<BookWithCount[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "recent" | "favorite" | "trash">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<Cover>("teal");
  const [paper, setPaper] = useState<Paper>("blank");
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
    if (tab === "trash") return Boolean(book.deleted_at) && `${book.title} ${book.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    if (book.deleted_at || (tab === "favorite" && !book.favorite)) return false;
    return `${book.title} ${book.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }).sort((a, b) => (tab === "recent" ? (b.opened_at ?? "").localeCompare(a.opened_at ?? "") : b.updated_at.localeCompare(a.updated_at)));

  async function create() {
    if (!title.trim() || title.trim().length > 100) { setError("Vui lòng nhập tên sổ tay từ 1 đến 100 ký tự."); return; }
    setBusy(true); setError("");
    const result = await db.from("smart_notebooks").insert({ title: title.trim(), description: description.trim().slice(0, 300), cover }).select("id").single();
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
    const made = await db.from("smart_notebooks").insert({ title: `${book.title} (bản sao)`.slice(0, 100), description: book.description, cover: book.cover }).select("id").single();
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
      const made = await db.from("smart_notebooks").insert({ title: `${input.notebook.title.slice(0, 88)} (đã nhập)`, description: (input.notebook.description ?? "").slice(0, 300), cover: covers.includes(input.notebook.cover as Cover) ? input.notebook.cover : "teal" }).select("id").single();
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

  return <div className="content-page smart-library">
    <header className="smart-library-hero"><div><span className="eyebrow">MY WORKSPACE</span><h1>Sổ tay của tôi</h1><p>Không gian riêng để ghi chép, viết tay và lưu kiến thức.</p></div><div className="smart-hero-actions"><button className="button subtle" disabled={busy} onClick={() => importRef.current?.click()}>Nhập dữ liệu</button><input ref={importRef} type="file" hidden accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = ""; }} /><button className="button primary" onClick={() => setCreating(true)}><Plus size={18} /> Tạo sổ tay</button></div></header>
    {word && <section className="card smart-word-picker" aria-label="Đưa từ vào vở"><h2>Đưa “{word.title}” vào vở</h2>{books.some((item) => !item.deleted_at) ? <><label>Chọn sổ tay<select value={targetBook} onChange={(event) => { setTargetBook(event.target.value); void loadWordPages(event.target.value); }}>{books.filter((item) => !item.deleted_at).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Chọn trang<select value={targetPage} onChange={(event) => setTargetPage(event.target.value)}>{wordPages.map((item, index) => <option key={item.id} value={item.id}>Trang {index + 1}</option>)}</select></label><div><button className="button subtle" onClick={() => setWord(null)}>Hủy</button><button className="button primary" disabled={busy || !targetPage} onClick={() => void saveWord()}>Lưu và mở sổ tay</button></div></> : <><p>Hãy tạo sổ tay trước khi đưa từ vào vở.</p><button className="button primary" onClick={() => { setWord(null); setCreating(true); }}>Tạo sổ tay</button></>}</section>}
    {creating && <section className="card smart-create" aria-label="Tạo sổ tay mới"><h2>Tạo sổ tay mới</h2><div className="smart-create-fields"><label>Tên sổ tay<input autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Mô tả (không bắt buộc)<input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Màu bìa<select value={cover} onChange={(event) => setCover(event.target.value as Cover)}>{covers.map((item) => <option key={item} value={item}>{coverLabels[item]}</option>)}</select></label><label>Loại giấy<select value={paper} onChange={(event) => setPaper(event.target.value as Paper)}>{papers.map((item) => <option key={item} value={item}>{paperLabels[item]}</option>)}</select></label></div><div className="smart-create-actions"><button className="button subtle" onClick={() => setCreating(false)}>Hủy</button><button className="button primary" disabled={busy} onClick={() => void create()}>{busy ? "Đang tạo…" : "Tạo sổ tay"}</button></div></section>}
    {error && <div className="form-error" role="alert">{error} <button onClick={() => void refresh()}>Tải lại</button></div>}
    <div className="smart-library-tools"><label className="smart-search"><Search size={18} /><input aria-label="Tìm kiếm sổ tay" placeholder="Tìm kiếm sổ tay..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="smart-tabs" role="group" aria-label="Lọc sổ tay">{(["all", "recent", "favorite", "trash"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{{ all: "Tất cả", recent: "Gần đây", favorite: "Yêu thích", trash: "Thùng rác" }[item]}</button>)}</div><div className="smart-views"><button aria-label="Xem dạng lưới" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={18} /></button><button aria-label="Xem dạng danh sách" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={18} /></button></div></div>
    {!ready ? <p>Đang tải sổ tay…</p> : shown.length ? <div className={`smart-book-list ${view}`}>{shown.map((book) => <article className="smart-book" key={book.id}><Link href={`/app/notebook/${book.id}`} className={`smart-book-cover ${book.cover}`} aria-label={`Mở ${book.title}`}><BookOpen size={36} strokeWidth={1.5} /><span>{book.title}</span></Link><div className="smart-book-info"><h2><Link href={`/app/notebook/${book.id}`}>{book.title}</Link></h2>{book.description && <p>{book.description}</p>}<small>{book.count} trang · Cập nhật {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(book.updated_at))}</small><div className="smart-book-actions">{book.deleted_at ? <button disabled={busy} onClick={() => void update(book, { deleted_at: null })}><RotateCcw size={15} /> Khôi phục</button> : <><button disabled={busy} aria-label={book.favorite ? "Bỏ yêu thích" : "Yêu thích"} onClick={() => void update(book, { favorite: !book.favorite })}><Heart size={16} fill={book.favorite ? "currentColor" : "none"} /></button><button disabled={busy} onClick={() => { const name = window.prompt("Đổi tên sổ tay", book.title)?.trim(); if (name && name.length <= 100) void update(book, { title: name }); }}>Đổi tên</button><button disabled={busy} onClick={() => { const next = covers[(covers.indexOf(book.cover) + 1) % covers.length]; void update(book, { cover: next }); }}>Đổi bìa</button><button disabled={busy} onClick={() => void duplicate(book)}><BookCopy size={15} /> Sao chép</button><button disabled={busy} onClick={() => { if (window.confirm(`Chuyển “${book.title}” vào thùng rác?`)) void update(book, { deleted_at: new Date().toISOString() }); }}><Trash2 size={15} /> Xóa</button></>}</div></div></article>)}</div> : <div className="smart-empty"><BookOpen size={42} /><h2>{query ? "Không tìm thấy sổ tay phù hợp." : tab === "trash" ? "Thùng rác đang trống" : "Sổ tay của bạn đang trống"}</h2><p>{!query && tab !== "trash" ? "Tạo cuốn vở đầu tiên để bắt đầu ghi chép." : ""}</p>{!query && tab !== "trash" && <button className="button primary" onClick={() => setCreating(true)}>Tạo sổ tay</button>}</div>}
    <NotebookPage compact onImportWord={(entry) => void chooseWord(entry)} />
  </div>;
}
