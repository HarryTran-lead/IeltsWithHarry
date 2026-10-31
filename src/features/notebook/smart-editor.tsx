"use client";
/* eslint-disable @next/next/no-img-element -- Private blob URLs from authenticated downloads cannot use Next's image optimizer. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, FileImage, Highlighter, MousePointer2, Pencil, Plus, Redo2, RotateCcw, Trash2, Type, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { IMAGE_BUCKET, PAGE_HEIGHT, PAGE_WIDTH, clearDraft, documentSchema, draftKey, emptyDocument, readDraft, sanitizeTextHtml, writeDraft, type Book, type ImageElement, type Page, type PageDocument, type Paper, type Point, type Stroke, type TextElement } from "./smart-model";

type PageSummary = Pick<Page, "id" | "position" | "paper" | "revision" | "updated_at">;
type Tool = "select" | "text" | "pen" | "marker" | "eraser";
const pageSort = (a: PageSummary, b: PageSummary) => a.position - b.position || a.id.localeCompare(b.id);
const validImage = (file: File) => ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 3145728;
async function matchesImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (file.type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
const pathFor = (points: Point[]) => points.map((point) => `${point.x},${point.y}`).join(" ");

export function SmartEditor({ bookId }: { bookId: string }) {
  const db = useMemo(() => createClient(), []);
  const [book, setBook] = useState<Book | null>(null);
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [userId, setUserId] = useState("");

  const refresh = useCallback(async () => {
    const [bookResult, pageResult, userResult] = await Promise.all([
      db.from("smart_notebooks").select("*").eq("id", bookId).is("deleted_at", null).maybeSingle(),
      db.from("smart_notebook_pages").select("id,position,paper,revision,updated_at").eq("notebook_id", bookId).order("position"),
      db.auth.getUser(),
    ]);
    if (bookResult.error || pageResult.error || !bookResult.data || !userResult.data.user) {
      setError(bookResult.error?.message ?? pageResult.error?.message ?? "Không tìm thấy sổ tay hoặc phiên đăng nhập đã hết hạn.");
      setReady(true); return;
    }
    setBook(bookResult.data as Book);
    const sorted = (pageResult.data as PageSummary[]).sort(pageSort);
    setPages(sorted);
    setActiveId((current) => sorted.some((page) => page.id === current) ? current : sorted[0]?.id ?? "");
    setUserId(userResult.data.user.id);
    setReady(true);
  }, [db, bookId]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  const loadedBookId = book?.id;
  useEffect(() => { if (loadedBookId) void db.from("smart_notebooks").update({ opened_at: new Date().toISOString() }).eq("id", bookId); }, [db, bookId, loadedBookId]);

  async function addPage() {
    setBusy(true); setError("");
    const result = await db.from("smart_notebook_pages").insert({ notebook_id: bookId, position: pages.length, paper: pages.find((page) => page.id === activeId)?.paper ?? "blank" }).select("id").single();
    if (result.error) setError(result.error.message);
    else { await refresh(); setActiveId(result.data.id); }
    setBusy(false);
  }
  async function duplicatePage() {
    const source = await db.from("smart_notebook_pages").select("paper,document").eq("id", activeId).eq("notebook_id", bookId).single();
    if (source.error || !source.data) { setError(source.error?.message ?? "Không đọc được trang."); return; }
    setBusy(true);
    const created = await db.from("smart_notebook_pages").insert({ notebook_id: bookId, position: pages.length, paper: source.data.paper }).select("id,revision").single();
    if (created.data) {
      const saved = await db.rpc("save_smart_notebook_page", { p_page: created.data.id, p_revision: created.data.revision, p_document: source.data.document, p_paper: source.data.paper });
      if (saved.error) setError(saved.error.message);
      else { await refresh(); setActiveId(created.data.id); }
    } else setError(created.error?.message ?? "Không nhân bản được trang.");
    setBusy(false);
  }
  async function removePage() {
    if (pages.length <= 1) { setError("Sổ tay phải có ít nhất một trang."); return; }
    if (!window.confirm("Xóa trang này? Nội dung và nét bút trên trang sẽ mất.")) return;
    setBusy(true);
    const result = await db.from("smart_notebook_pages").delete().eq("id", activeId).eq("notebook_id", bookId);
    if (result.error) setError(result.error.message);
    else await refresh();
    setBusy(false);
  }
  async function movePage(direction: -1 | 1) {
    const sorted = [...pages].sort(pageSort), index = sorted.findIndex((page) => page.id === activeId), other = sorted[index + direction];
    if (!other) return;
    const current = sorted[index]; setBusy(true);
    const one = await db.from("smart_notebook_pages").update({ position: other.position }).eq("id", current.id);
    const two = await db.from("smart_notebook_pages").update({ position: current.position }).eq("id", other.id);
    if (one.error || two.error) setError(one.error?.message ?? two.error?.message ?? "Không sắp xếp được trang.");
    await refresh(); setBusy(false);
  }
  async function rename() {
    if (!book) return;
    const title = window.prompt("Tên sổ tay", book.title)?.trim();
    if (!title || title.length > 100) return;
    const result = await db.from("smart_notebooks").update({ title }).eq("id", bookId).select("*").single();
    if (result.error) setError(result.error.message); else setBook(result.data as Book);
  }
  async function exportData() {
    const result = await db.from("smart_notebook_pages").select("id,position,paper,document,revision").eq("notebook_id", bookId).order("position");
    if (result.error || !book) { setError(result.error?.message ?? "Không xuất được dữ liệu."); return; }
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), notebook: book, pages: result.data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `${book.title.replace(/[^a-z0-9_-]+/gi, "-") || "notebook"}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function printPdf() {
    if (!book) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setError("Trình duyệt đã chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại."); return; }
    setExporting(true); setError("");
    const result = await db.from("smart_notebook_pages").select("paper,document,position").eq("notebook_id", bookId).order("position");
    if (result.error) { printWindow.close(); setError(result.error.message); setExporting(false); return; }
    const imagePaths = [...new Set((result.data ?? []).flatMap((row) => (row.document as PageDocument).elements.filter((item) => item.type === "image").map((item) => item.path)))];
    const images = new Map<string, string>();
    for (const path of imagePaths) {
      const file = await db.storage.from(IMAGE_BUCKET).download(path);
      if (file.data) images.set(path, URL.createObjectURL(file.data));
    }
    const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    const sheets = (result.data ?? []).map((row) => {
      const doc = documentSchema.safeParse(row.document);
      if (!doc.success) return "";
      const elements = doc.data.elements.map((item) => item.type === "text"
        ? `<div class="text" style="left:${item.x}px;top:${item.y}px;width:${item.width}px;height:${item.height}px">${sanitizeTextHtml(item.html)}</div>`
        : `<img style="left:${item.x}px;top:${item.y}px;width:${item.width}px;height:${item.height}px" src="${escape(images.get(item.path) ?? "")}">`).join("");
      const ink = doc.data.strokes.map((stroke) => `<polyline points="${pathFor(stroke.points)}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${stroke.tool === "marker" ? 0.35 : 1}"/>`).join("");
      return `<section class="sheet ${row.paper}">${elements}<svg viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">${ink}</svg></section>`;
    }).join("");
    printWindow.document.write(`<!doctype html><html><head><title>${escape(book.title)}</title><style>@page{size:A4;margin:0}body{margin:0;font:16px Arial,sans-serif}.sheet{position:relative;width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;break-after:page;overflow:hidden;background:#fff}.sheet.ruled{background:repeating-linear-gradient(#fff 0 31px,#d6e2e9 32px)}.sheet.grid{background:linear-gradient(#dce7eb 1px,transparent 1px),linear-gradient(90deg,#dce7eb 1px,transparent 1px);background-size:25px 25px}.sheet>div,.sheet>img{position:absolute}.sheet svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.text{overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere}.text p{margin:0 0 8px}.text h1,.text h2,.text h3{margin:0 0 8px}@media screen{body{background:#ddd}.sheet{margin:24px auto;box-shadow:0 4px 20px #aaa}}</style></head><body>${sheets}</body></html>`);
    printWindow.document.close();
    printWindow.addEventListener("load", () => { printWindow.focus(); printWindow.print(); setTimeout(() => { for (const url of images.values()) URL.revokeObjectURL(url); }, 60000); }, { once: true });
    setExporting(false);
  }

  if (!ready) return <div className="content-page">Đang mở sổ tay…</div>;
  if (!book) return <div className="content-page"><p className="form-error" role="alert">{error || "Không tìm thấy sổ tay."}</p><Link className="button subtle" href="/app/notebook">Về thư viện</Link></div>;
  const index = pages.findIndex((page) => page.id === activeId);
  return <div className="content-page smart-editor"><header className="smart-editor-head"><div><Link href="/app/notebook" className="smart-back"><ArrowLeft size={18} /> Sổ tay</Link><span aria-hidden="true"> / </span><button className="smart-title" onClick={() => void rename()} title="Đổi tên sổ tay">{book.title}</button></div><div className="smart-head-actions"><button className="button subtle" onClick={() => void exportData()}><Download size={16} /> Xuất dữ liệu</button><button className="button subtle" disabled={exporting} onClick={() => void printPdf()}>{exporting ? "Đang chuẩn bị…" : "In / Lưu PDF"}</button></div></header>
    {error && <p className="form-error" role="alert">{error} <button onClick={() => setError("")}>Đóng</button></p>}
    <div className="smart-workspace"><aside className={`smart-pages ${collapsed ? "collapsed" : ""}`}><button className="smart-collapse" onClick={() => setCollapsed(!collapsed)}>{collapsed ? "Hiện danh sách trang" : "Ẩn danh sách trang"}</button>{!collapsed && <><div className="smart-pages-list">{pages.map((page, position) => <button key={page.id} className={page.id === activeId ? "active" : ""} onClick={() => setActiveId(page.id)}><span className={`smart-page-mini ${page.paper}`}><span>{position + 1}</span></span>Trang {position + 1}</button>)}</div><button className="button subtle" disabled={busy} onClick={() => void addPage()}><Plus size={16} /> Thêm trang</button><div className="smart-page-actions"><button disabled={busy || index <= 0} aria-label="Đưa trang lên" onClick={() => void movePage(-1)}><ArrowUp size={17} /></button><button disabled={busy || index >= pages.length - 1} aria-label="Đưa trang xuống" onClick={() => void movePage(1)}><ArrowDown size={17} /></button><button disabled={busy} aria-label="Nhân bản trang" onClick={() => void duplicatePage()}><Copy size={17} /></button><button disabled={busy || pages.length <= 1} aria-label="Xóa trang" onClick={() => void removePage()}><Trash2 size={17} /></button></div></>}</aside>
      <div className="smart-editor-main">{activeId && userId && <PageCanvas key={activeId} db={db} bookId={bookId} pageId={activeId} userId={userId} zoom={zoom} onChanged={() => void refresh()} />}<footer className="smart-editor-footer"><span>Trang {index + 1} / {pages.length}</span><div><button onClick={() => setZoom((value) => Math.max(0.5, +(value - 0.25).toFixed(2)))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(1.5, +(value + 0.25).toFixed(2)))}>+</button></div></footer></div></div>
  </div>;
}

function PageCanvas({ db, bookId, pageId, userId, zoom, onChanged }: { db: ReturnType<typeof createClient>; bookId: string; pageId: string; userId: string; zoom: number; onChanged: () => void }) {
  const [doc, setDoc] = useState<PageDocument>(emptyDocument);
  const [paper, setPaper] = useState<Paper>("blank");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"saved" | "local" | "saving" | "offline" | "error" | "conflict">("saved");
  const [message, setMessage] = useState("");
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#153a55");
  const [width, setWidth] = useState(3);
  const [selected, setSelected] = useState("");
  const [fingerInk, setFingerInk] = useState(false);
  const [inkPreview, setInkPreview] = useState<Point[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<PageDocument[]>([]);
  const [future, setFuture] = useState<PageDocument[]>([]);
  const pageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const persistRef = useRef<() => Promise<void>>(async () => {});
  const docRef = useRef(doc), paperRef = useRef(paper), revisionRef = useRef(0), dirtyRef = useRef(false), savingRef = useRef(false), generationRef = useRef(0), baseDocRef = useRef<PageDocument>(emptyDocument());
  const drawingRef = useRef<{ id: number; points: Point[] } | null>(null);
  const key = draftKey(userId, pageId);
  useEffect(() => { docRef.current = doc; }, [doc]);
  useEffect(() => { paperRef.current = paper; }, [paper]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await db.from("smart_notebook_pages").select("*").eq("id", pageId).eq("notebook_id", bookId).single();
      if (cancelled) return;
      if (result.error || !result.data) { setMessage(result.error?.message ?? "Không đọc được trang."); setStatus("error"); setReady(true); return; }
      const page = result.data as Page, parsed = documentSchema.safeParse(page.document);
      if (!parsed.success) { setMessage("Dữ liệu trang không hợp lệ. Hãy xuất dữ liệu để kiểm tra."); setStatus("error"); setReady(true); return; }
      revisionRef.current = page.revision; baseDocRef.current = parsed.data;
      try {
        const local = await readDraft(key);
        if (cancelled) return;
        if (local && !documentSchema.safeParse(local.document).success) { setMessage("Bản nháp trên thiết bị không hợp lệ; đang dùng dữ liệu máy chủ."); docRef.current = parsed.data; paperRef.current = page.paper; setDoc(parsed.data); setPaper(page.paper); }
        else if (local && local.baseRevision === page.revision) { docRef.current = local.document; paperRef.current = local.paper; setDoc(local.document); setPaper(local.paper); dirtyRef.current = true; setStatus(navigator.onLine ? "local" : "offline"); }
        else if (local && JSON.stringify(local.document) === JSON.stringify(parsed.data) && local.paper === page.paper) { void clearDraft(key); docRef.current = parsed.data; paperRef.current = page.paper; setDoc(parsed.data); setPaper(page.paper); }
        else if (local) { docRef.current = local.document; paperRef.current = local.paper; setDoc(local.document); setPaper(local.paper); dirtyRef.current = true; setStatus("conflict"); setMessage("Trang đã thay đổi trên thiết bị khác. Bản cục bộ vẫn an toàn trên thiết bị này."); }
        else { docRef.current = parsed.data; paperRef.current = page.paper; setDoc(parsed.data); setPaper(page.paper); }
      } catch { docRef.current = parsed.data; paperRef.current = page.paper; setDoc(parsed.data); setPaper(page.paper); setMessage("Không mở được bộ nhớ bản nháp trên thiết bị."); }
      setReady(true);
    }
    void load();
    return () => { cancelled = true; };
  }, [db, bookId, pageId, key]);

  const persist = useCallback(async () => {
    if (!dirtyRef.current || savingRef.current || status === "conflict") return;
    if (!navigator.onLine) { setStatus("offline"); return; }
    savingRef.current = true; setStatus("saving");
    const snapshot = docRef.current, sheet = paperRef.current, generation = generationRef.current, revision = revisionRef.current;
    const valid = documentSchema.safeParse(snapshot);
    if (!valid.success) { setStatus("error"); setMessage("Nội dung trang vượt giới hạn hoặc không hợp lệ."); savingRef.current = false; return; }
    const result = await db.rpc("save_smart_notebook_page", { p_page: pageId, p_revision: revision, p_document: valid.data, p_paper: sheet });
    savingRef.current = false;
    if (result.error || !result.data) {
      const conflict = /changed or unavailable/i.test(result.error?.message ?? "");
      setStatus(conflict ? "conflict" : "error"); setMessage(conflict ? "Có thay đổi từ thiết bị khác. Bản nháp trên thiết bị này vẫn được giữ." : result.error?.message ?? "Lưu thất bại.");
      return;
    }
    revisionRef.current = result.data.revision;
    if (generationRef.current === generation) {
      dirtyRef.current = false; setStatus("saved"); setMessage("");
      try { await clearDraft(key); } catch { setMessage("Đã lưu lên máy chủ nhưng chưa dọn được bản nháp trên thiết bị."); }
    } else {
      setStatus("local");
      try { await writeDraft({ key, baseRevision: revisionRef.current, document: docRef.current, paper: paperRef.current }); } catch { setStatus("error"); setMessage("Không lưu được bản nháp trên thiết bị."); }
    }
    onChanged();
  }, [db, key, pageId, onChanged, status]);
  useEffect(() => { if (!ready || !dirtyRef.current || status === "conflict" || status === "error") return; const timer = setTimeout(() => { void persist(); }, 900); return () => clearTimeout(timer); }, [ready, doc, paper, status, persist]);
  useEffect(() => { const online = () => { if (dirtyRef.current) void persist(); }; window.addEventListener("online", online); return () => window.removeEventListener("online", online); }, [persist]);
  useEffect(() => { persistRef.current = persist; }, [persist]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") void persistRef.current(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); void persistRef.current(); };
  }, []);

  function change(next: PageDocument, undoable = true) {
    if (undoable) { setHistory((items) => [...items.slice(-39), docRef.current]); setFuture([]); }
    docRef.current = next; setDoc(next); dirtyRef.current = true; generationRef.current++;
    setStatus(navigator.onLine ? "local" : "offline"); setMessage("");
    void writeDraft({ key, baseRevision: revisionRef.current, document: next, paper: paperRef.current }).catch(() => { setStatus("error"); setMessage("Không lưu được bản nháp trên thiết bị."); });
  }
  function changePaper(next: Paper) {
    paperRef.current = next; setPaper(next); dirtyRef.current = true; generationRef.current++;
    setStatus(navigator.onLine ? "local" : "offline");
    void writeDraft({ key, baseRevision: revisionRef.current, document: docRef.current, paper: next }).catch(() => { setStatus("error"); setMessage("Không lưu được bản nháp trên thiết bị."); });
  }
  function undo() { const before = history.at(-1); if (!before) return; setFuture((items) => [...items, docRef.current]); setHistory((items) => items.slice(0, -1)); change(before, false); }
  function redo() { const after = future.at(-1); if (!after) return; setHistory((items) => [...items, docRef.current]); setFuture((items) => items.slice(0, -1)); change(after, false); }
  function localPoint(clientX: number, clientY: number): Point {
    const rect = pageRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(PAGE_WIDTH, Math.round((clientX - rect.left) / zoom))), y: Math.max(0, Math.min(PAGE_HEIGHT, Math.round((clientY - rect.top) / zoom))) };
  }
  function addText(x = 60, y = 70, html = "<p>Nhập nội dung…</p>") {
    const element: TextElement = { id: crypto.randomUUID(), type: "text", x, y, width: 500, height: 160, html };
    change({ ...docRef.current, elements: [...docRef.current.elements, element] }); setSelected(element.id); setTool("text");
  }
  async function addImage(file: File) {
    if (!validImage(file)) { setMessage("Chỉ nhận PNG, JPEG hoặc WebP tối đa 3 MB."); setStatus("error"); return; }
    if (!(await matchesImageSignature(file))) { setMessage("Tệp ảnh không đúng định dạng PNG, JPEG hoặc WebP."); setStatus("error"); return; }
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.type]!;
    const path = `${userId}/${bookId}/${crypto.randomUUID()}.${ext}`;
    const result = await db.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (result.error) { setMessage(result.error.message); setStatus("error"); return; }
    const image: ImageElement = { id: crypto.randomUUID(), type: "image", x: 70, y: 180, width: 360, height: 260, path };
    change({ ...docRef.current, elements: [...docRef.current.elements, image] }); setSelected(image.id); setTool("select");
  }
  useEffect(() => {
    const paths = doc.elements.filter((element): element is ImageElement => element.type === "image").map((element) => element.path);
    let cancelled = false;
    void (async () => { for (const path of paths) {
      if (urls[path] || !path.startsWith(`${userId}/`)) continue;
      const result = await db.storage.from(IMAGE_BUCKET).download(path);
      if (!cancelled && result.data) { const url = URL.createObjectURL(result.data); setUrls((current) => ({ ...current, [path]: url })); }
    } })();
    return () => { cancelled = true; };
  }, [db, doc.elements, userId, bookId, urls]);
  const urlsRef = useRef(urls);
  useEffect(() => { urlsRef.current = urls; }, [urls]);
  useEffect(() => () => { for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url); }, []);

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!["pen", "marker", "eraser"].includes(tool) || (event.pointerType === "touch" && !fingerInk)) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const point = localPoint(event.clientX, event.clientY);
    if (tool === "eraser") {
      const threshold = 15;
      const stroke = [...docRef.current.strokes].reverse().find((item) => item.points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < threshold + item.width));
      if (stroke) change({ ...docRef.current, strokes: docRef.current.strokes.filter((item) => item.id !== stroke.id) });
      return;
    }
    drawingRef.current = { id: event.pointerId, points: [point] }; setInkPreview([point]);
  }
  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drawing = drawingRef.current;
    if (!drawing || drawing.id !== event.pointerId) return;
    const events = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [event.nativeEvent];
    for (const sample of events) drawing.points.push({ ...localPoint(sample.clientX, sample.clientY), pressure: Math.max(0, Math.min(1, sample.pressure || 0.5)) });
    setInkPreview([...drawing.points]);
  }
  function pointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    const drawing = drawingRef.current;
    if (!drawing || drawing.id !== event.pointerId) return;
    drawingRef.current = null; setInkPreview([]);
    const stroke: Stroke = { id: crypto.randomUUID(), tool: tool === "marker" ? "marker" : "pen", color, width: tool === "marker" ? width * 4 : width, points: drawing.points };
    change({ ...docRef.current, strokes: [...docRef.current.strokes, stroke] });
  }
  function moveElement(id: string, event: React.PointerEvent, resize = false) {
    if (tool !== "select") return;
    event.preventDefault(); event.stopPropagation();
    const target = docRef.current.elements.find((item) => item.id === id);
    if (!target) return;
    setSelected(id);
    const startX = event.clientX, startY = event.clientY, origin = { ...target }, before = docRef.current;
    const pointerId = event.pointerId, node = event.currentTarget as HTMLElement;
    node.setPointerCapture(pointerId);
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const dx = (next.clientX - startX) / zoom, dy = (next.clientY - startY) / zoom;
      const revised = resize ? { ...origin, width: Math.max(60, Math.min(PAGE_WIDTH - origin.x, origin.width + dx)), height: Math.max(40, Math.min(PAGE_HEIGHT - origin.y, origin.height + dy)) }
        : { ...origin, x: Math.max(0, Math.min(PAGE_WIDTH - origin.width, origin.x + dx)), y: Math.max(0, Math.min(PAGE_HEIGHT - origin.height, origin.y + dy)) };
      const newDoc = { ...docRef.current, elements: docRef.current.elements.map((item) => item.id === id ? revised : item) };
      docRef.current = newDoc; setDoc(newDoc);
    };
    const end = () => { node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", end); node.removeEventListener("pointercancel", end); if (docRef.current !== before) { setHistory((items) => [...items.slice(-39), before]); setFuture([]); change(docRef.current, false); } };
    node.addEventListener("pointermove", move); node.addEventListener("pointerup", end); node.addEventListener("pointercancel", end);
  }
  async function resolveConflict(mode: "server" | "copy") {
    if (mode === "server") { await clearDraft(key); window.location.reload(); return; }
    const created = await db.from("smart_notebook_pages").insert({ notebook_id: bookId, position: 9999, paper: paperRef.current }).select("id,revision").single();
    if (created.error || !created.data) { setMessage(created.error?.message ?? "Không tạo được bản sao."); return; }
    const saved = await db.rpc("save_smart_notebook_page", { p_page: created.data.id, p_revision: created.data.revision, p_document: docRef.current, p_paper: paperRef.current });
    if (saved.error) { setMessage(saved.error.message); return; }
    await clearDraft(key); setMessage("Đã lưu bản cục bộ vào trang mới. Hãy mở trang mới trong danh sách."); setStatus("saved"); onChanged();
  }

  if (!ready) return <div className="smart-page-loading">Đang tải trang…</div>;
  const labels = { saved: "Đã đồng bộ", local: "Đã lưu trên thiết bị", saving: "Đang lưu…", offline: "Ngoại tuyến — sẽ đồng bộ khi có mạng", error: "Lưu thất bại", conflict: "Xung đột phiên bản" };
  return <><div className="smart-toolbar"><div className="smart-tool-group">{([ ["select", MousePointer2, "Chọn"], ["text", Type, "Văn bản"], ["pen", Pencil, "Bút viết"], ["marker", Highlighter, "Bút đánh dấu"], ["eraser", RotateCcw, "Tẩy nét"] ] as const).map(([name, Icon, label]) => <button key={name} className={tool === name ? "active" : ""} aria-label={label} aria-pressed={tool === name} onClick={() => setTool(name)}><Icon size={17} /> <span>{label}</span></button>)}<button onClick={() => addText()}><Plus size={17} /> Thêm chữ</button><button onClick={() => fileRef.current?.click()}><FileImage size={17} /> Ảnh</button><input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImage(file); event.target.value = ""; }} /></div><div className="smart-tool-group"><button disabled={!history.length} aria-label="Hoàn tác nét hoặc đối tượng" onClick={undo}><Undo2 size={17} /></button><button disabled={!future.length} aria-label="Làm lại nét hoặc đối tượng" onClick={redo}><Redo2 size={17} /></button><input type="color" aria-label="Màu bút" value={color} onChange={(event) => setColor(event.target.value)} /><select aria-label="Độ dày bút" value={width} onChange={(event) => setWidth(Number(event.target.value))}><option value="2">Mảnh</option><option value="3">Vừa</option><option value="6">Đậm</option></select><select aria-label="Loại giấy" value={paper} onChange={(event) => changePaper(event.target.value as Paper)}><option value="blank">Giấy trắng</option><option value="ruled">Giấy kẻ dòng</option><option value="grid">Giấy ô vuông</option></select><label className="smart-finger"><input type="checkbox" checked={fingerInk} onChange={(event) => setFingerInk(event.target.checked)} /> Vẽ bằng ngón tay</label></div></div>
    <div className="smart-save-line"><span role="status" className={`smart-save-${status}`}>{labels[status]}</span>{message && <span role="alert">{message}</span>}{status === "error" && <button onClick={() => void persist()}>Thử lại</button>}{status === "conflict" && <><button onClick={() => void resolveConflict("copy")}>Tạo trang từ bản cục bộ</button><button onClick={() => void resolveConflict("server")}>Dùng bản máy chủ</button></>}</div>
    <div className="smart-canvas-scroll" onPaste={(event) => { const image = event.clipboardData.files[0]; if (image) { event.preventDefault(); void addImage(image); } }} onDrop={(event) => { const image = event.dataTransfer.files[0]; if (image) { event.preventDefault(); void addImage(image); } }} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}><div className="smart-page-spacer" style={{ width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }}><div ref={pageRef} className={`smart-page ${paper}`} style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${zoom})` }} onClick={(event) => { if (tool === "text" && event.target === pageRef.current) { const p = localPoint(event.clientX, event.clientY); addText(p.x, p.y); } }}>
      {doc.elements.map((element) => <div key={element.id} className={`smart-element ${element.type} ${selected === element.id ? "selected" : ""}`} style={{ left: element.x, top: element.y, width: element.width, height: element.height }} onClick={(event) => { event.stopPropagation(); setSelected(element.id); }}><div className="smart-element-handle" onPointerDown={(event) => moveElement(element.id, event)} aria-hidden="true" />{element.type === "text" ? <RichTextBlock element={element} editable={tool === "text"} onChange={(html) => change({ ...docRef.current, elements: docRef.current.elements.map((item) => item.id === element.id ? { ...item, html } : item) }, false)} /> : <img draggable={false} src={urls[element.path] ?? ""} alt="Ảnh trong sổ tay" />}{selected === element.id && <><button className="smart-element-delete" aria-label="Xóa đối tượng" onClick={() => { change({ ...docRef.current, elements: docRef.current.elements.filter((item) => item.id !== element.id) }); setSelected(""); }}>×</button><div className="smart-element-resize" onPointerDown={(event) => moveElement(element.id, event, true)} /></>}</div>)}
      <svg className={`smart-ink ${["pen", "marker", "eraser"].includes(tool) ? "drawing" : ""}`} style={{ touchAction: fingerInk ? "none" : "pan-x pan-y" }} viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}>{doc.strokes.map((stroke) => <polyline key={stroke.id} points={pathFor(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeOpacity={stroke.tool === "marker" ? 0.35 : 1} strokeLinecap="round" strokeLinejoin="round" />)}{inkPreview.length > 0 && <polyline points={pathFor(inkPreview)} fill="none" stroke={color} strokeWidth={tool === "marker" ? width * 4 : width} strokeOpacity={tool === "marker" ? 0.35 : 1} strokeLinecap="round" strokeLinejoin="round" />}</svg>
    </div></div></div>
  </>;
}

function RichTextBlock({ element, editable, onChange }: { element: TextElement; editable: boolean; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && document.activeElement !== ref.current) ref.current.innerHTML = sanitizeTextHtml(element.html); }, [element.html]);
  return <div className="smart-rich-wrap"><div className="smart-rich-tools" hidden={!editable}><button onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("bold")}>B</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("italic")}>I</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("underline")}>U</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("insertUnorderedList")}>• List</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("formatBlock", false, "h2")}>H2</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => { const href = window.prompt("Liên kết https://"); if (href && /^https?:\/\//i.test(href)) document.execCommand("createLink", false, href); }}>Link</button><button onMouseDown={(event) => event.preventDefault()} onClick={() => document.execCommand("insertHTML", false, "<table><tbody><tr><td>Ô 1</td><td>Ô 2</td></tr></tbody></table>")}>Bảng</button></div><div ref={ref} className="smart-rich" contentEditable={editable} suppressContentEditableWarning spellCheck onInput={() => onChange(sanitizeTextHtml(ref.current?.innerHTML ?? ""))} onBlur={() => { if (ref.current) { const safe = sanitizeTextHtml(ref.current.innerHTML); ref.current.innerHTML = safe; onChange(safe); } }} onPaste={(event) => { event.preventDefault(); const html = event.clipboardData.getData("text/html"); const plain = event.clipboardData.getData("text/plain"); document.execCommand("insertHTML", false, html ? sanitizeTextHtml(html) : sanitizeTextHtml(`<p>${plain.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`)); }} /></div>;
}
