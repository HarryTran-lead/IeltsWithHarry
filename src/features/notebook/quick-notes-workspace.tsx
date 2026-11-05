"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, FileText, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook, type NotebookEntry } from "./notebook-store";
import type { NotebookInput } from "@/lib/validation/notebook";
import "./quick-notes-workspace.css";

type OldBook = { id: string; title: string; updated_at: string };
const noteInput = (title: string, body: string): NotebookInput => ({
  kind: "note",
  title: (title.trim() || body.trim().split("\n")[0] || "Ghi chú mới").slice(0, 100),
  body: body.trim(),
  meaningVi: "",
  example: "",
});
const stamp = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));

export function QuickNotesWorkspace() {
  const { entries, ready, error, addEntry, updateEntry, removeEntry } = useNotebook();
  const db = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<OldBook[]>([]);
  const [booksError, setBooksError] = useState(false);
  const [showBooks, setShowBooks] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [removing, setRemoving] = useState(false);
  const latest = useRef({ title: "", body: "" });
  const activeId = useRef<string | null>(null);
  const lastSaved = useRef("");
  const generation = useRef(0);
  const saving = useRef(false);
  const pending = useRef(false);
  const saveTools = useRef({ addEntry, updateEntry });
  useEffect(() => { saveTools.current = { addEntry, updateEntry }; }, [addEntry, updateEntry]);

  useEffect(() => {
    let alive = true;
    void db.from("smart_notebooks").select("id,title,updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100)
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        if (loadError) setBooksError(true);
        else setBooks((data ?? []) as OldBook[]);
      });
    return () => { alive = false; };
  }, [db]);

  async function saveCurrent() {
    if (saving.current) { pending.current = true; return; }
    const { title: currentTitle, body: currentBody } = latest.current;
    if (!currentBody.trim()) return;
    const input = noteInput(currentTitle, currentBody);
    const fingerprint = JSON.stringify(input);
    if (fingerprint === lastSaved.current) return;
    const version = generation.current;
    const id = activeId.current;
    saving.current = true;
    setStatus("Đang lưu…");
    let failed = false;
    try {
      if (id) await saveTools.current.updateEntry(id, input);
      else {
        const created = await saveTools.current.addEntry(input);
        if (created && version === generation.current) {
          activeId.current = created.id;
          setSelectedId(created.id);
        }
      }
      if (version === generation.current) {
        lastSaved.current = fingerprint;
        setStatus("Đã lưu tự động");
      }
    } catch {
      failed = true;
      if (version === generation.current) setStatus("Chưa lưu được. Nhấn “Lưu ngay” để thử lại.");
    } finally {
      saving.current = false;
      const shouldContinue = pending.current || (!failed && version === generation.current && JSON.stringify(noteInput(latest.current.title, latest.current.body)) !== lastSaved.current);
      pending.current = false;
      if (shouldContinue) window.setTimeout(() => void saveCurrent(), 0);
    }
  }

  useEffect(() => {
    if (!ready || !body.trim() || JSON.stringify(noteInput(title, body)) === lastSaved.current) return;
    const timer = window.setTimeout(() => void saveCurrent(), 900);
    return () => window.clearTimeout(timer);
    // The editor's refs keep the in-flight save on its original note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, selectedId, ready]);

  function openNote(note: NotebookEntry | null, savePrevious = true) {
    if (savePrevious) void saveCurrent();
    generation.current += 1;
    activeId.current = note?.id ?? null;
    setSelectedId(note?.id ?? null);
    const nextTitle = note?.title ?? "";
    const nextBody = note?.body ?? "";
    latest.current = { title: nextTitle, body: nextBody };
    lastSaved.current = note ? JSON.stringify(noteInput(nextTitle, nextBody)) : "";
    setTitle(nextTitle);
    setBody(nextBody);
    setStatus("");
  }

  function changeTitle(value: string) {
    latest.current = { ...latest.current, title: value };
    setTitle(value);
    setStatus("Chưa lưu thay đổi");
  }
  function changeBody(value: string) {
    latest.current = { ...latest.current, body: value };
    setBody(value);
    setStatus("Chưa lưu thay đổi");
  }
  async function deleteSelected() {
    if (!selectedId || !window.confirm("Xóa ghi chú này?")) return;
    setRemoving(true);
    try { await removeEntry(selectedId); openNote(null, false); }
    catch { /* The store displays the error. */ }
    finally { setRemoving(false); }
  }

  const notes = entries.filter((entry) => entry.kind === "note").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown = notes.filter((note) => `${note.title} ${note.body}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selected = notes.find((note) => note.id === selectedId);

  return <div className="content-page quick-notes">
    <header className="quick-notes-header"><div><span className="eyebrow">HỌC VÀ GHI NHỚ</span><h1>Ghi chú học tập</h1><p>Lưu nhanh điều cần nhớ. Ghi chú tạo trong bài học có liên kết trở lại bài đó.</p></div><button type="button" className="button primary" onClick={() => openNote(null)}><Plus size={17} /> Ghi chú mới</button></header>
    <div className="quick-notes-layout">
      <aside className="quick-notes-list" aria-label="Ghi chú đã lưu">
        <label className="quick-notes-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm trong ghi chú…" aria-label="Tìm trong ghi chú" /></label>
        <p className="quick-notes-count">{ready ? `${notes.length} ghi chú` : "Đang tải ghi chú…"}</p>
        <div className="quick-notes-items">{shown.map((note) => <button type="button" key={note.id} className={selectedId === note.id ? "active" : ""} onClick={() => openNote(note)}><strong>{note.title}</strong><span>{note.body}</span><small>{stamp(note.updatedAt)}{note.sourcePath ? " · Có bài nguồn" : ""}</small></button>)}{ready && shown.length === 0 && <p className="quick-notes-empty">{query ? "Không tìm thấy ghi chú phù hợp." : "Chưa có ghi chú. Viết điều đầu tiên ở bên phải."}</p>}</div>
      </aside>
      <section className="quick-notes-editor" aria-label="Soạn ghi chú"><div className="quick-notes-editor-head"><span><FileText size={18} /> {selected ? "Sửa ghi chú" : "Ghi chú mới"}</span><div>{selected && <button type="button" className="quick-notes-delete" disabled={removing} onClick={() => void deleteSelected()} aria-label="Xóa ghi chú"><Trash2 size={17} /></button>}<button type="button" className="button subtle" disabled={!body.trim()} onClick={() => void saveCurrent()}>Lưu ngay</button></div></div>
        <input className="quick-notes-title" maxLength={100} value={title} onChange={(event) => changeTitle(event.target.value)} placeholder="Tiêu đề (có thể để trống)" aria-label="Tiêu đề ghi chú" />
        <textarea className="quick-notes-body" maxLength={100000} value={body} onChange={(event) => changeBody(event.target.value)} placeholder="Điều gì bạn muốn ghi nhớ?" aria-label="Nội dung ghi chú" />
        <footer><span role="status">{status || "Nội dung được lưu tự động khi bạn ngừng gõ."}</span>{selected?.sourcePath?.startsWith("/app/") && <Link href={selected.sourcePath}>Mở bài học nguồn <ArrowRight size={15} /></Link>}</footer>
      </section>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <nav className="quick-notes-links" aria-label="Các mục ôn tập"><Link href="/app/vocabulary/notebook"><BookOpen size={20} /><span><strong>Từ đã lưu</strong><small>Xem và ôn trong Vocabulary</small></span><ArrowRight size={17} /></Link><Link href="/app/grammar/review"><BookOpen size={20} /><span><strong>Sổ lỗi Grammar</strong><small>Ôn lại câu cần luyện thêm</small></span><ArrowRight size={17} /></Link></nav>
    <section className="quick-notes-archive"><button type="button" aria-expanded={showBooks} onClick={() => setShowBooks((value) => !value)}>Sổ tay cũ ({books.length}) <span>{showBooks ? "Thu gọn" : "Xem sổ đã tạo"}</span></button>{showBooks && <div>{books.map((book) => <Link href={`/app/notebook/${book.id}`} key={book.id}><BookOpen size={17} /><span>{book.title}</span><ArrowRight size={15} /></Link>)}{booksError && <p>Chưa tải được danh sách sổ cũ. Hãy tải lại trang.</p>}<Link href="/app/notebook/library"><BookOpen size={17} /><span>Quản lý sổ cũ</span><ArrowRight size={15} /></Link></div>}</section>
  </div>;
}
