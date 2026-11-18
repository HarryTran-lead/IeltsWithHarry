"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Bold, BookOpen, Check, CheckSquare, Copy, Download, Eye, FileText, Hash, Heading2, Highlighter, Italic,
  LayoutTemplate, Link2, List, ListOrdered, Maximize2, Minimize2, PencilLine, Plus, Quote, Search, SquareStack, Trash2, X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/browser";
import type { NotebookInput } from "@/lib/validation/notebook";
import { useNotebook, type NotebookEntry } from "./notebook-store";
import { NoteMarkdown } from "./note-markdown";
import { applyFormat, dateGroup, noteSnippet, noteStats, noteTags, noteTemplates, toggleTask, type DateGroup, type NoteTemplate } from "./notes-model";
import "./quick-notes-workspace.css";

export type OldBook = { id: string; title: string; updated_at: string };
type Sort = "updated" | "created" | "title";
type Filter = "all" | "source" | "tasks";

const noteInput = (title: string, body: string): NotebookInput => ({
  kind: "note",
  title: (title.trim() || noteSnippet(body).slice(0, 60) || "Ghi chú mới").slice(0, 100),
  body: body.trim(),
  meaningVi: "",
  example: "",
});
const shortDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short" }).format(new Date(value));
const clock = (value: Date) => new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(value);
const groups: DateGroup[] = ["Hôm nay", "Hôm qua", "7 ngày qua", "30 ngày qua", "Cũ hơn"];
const hasSource = (note?: NotebookEntry | null) => Boolean(note?.sourcePath?.startsWith("/app/") && !note.sourcePath.startsWith("/app/notebook"));
function sourceLabel(path: string) {
  const parts = path.split("/").filter(Boolean);
  const words = (value?: string) => decodeURIComponent(value ?? "").replaceAll("-", " ");
  if (parts[1] === "lesson") return `Bài học · ${words(parts[2])}`;
  if (parts[1] === "news") return `Daily News · ${words(parts.at(-1))}`;
  if (parts[1] === "question-bank") return "Ngân hàng đề";
  return words(parts.slice(1).join(" · ")) || "Trang học";
}

const tools = [
  { id: "h", label: "Tiêu đề mục", icon: Heading2, format: { before: "## ", line: true } },
  { id: "b", label: "In đậm (Ctrl+B)", icon: Bold, format: { before: "**", placeholder: "chữ đậm" } },
  { id: "i", label: "In nghiêng (Ctrl+I)", icon: Italic, format: { before: "*", placeholder: "chữ nghiêng" } },
  { id: "m", label: "Tô sáng", icon: Highlighter, format: { before: "==", placeholder: "điểm quan trọng" } },
  { id: "ul", label: "Danh sách", icon: List, format: { before: "- ", line: true } },
  { id: "ol", label: "Danh sách số", icon: ListOrdered, format: { before: "1. ", line: true } },
  { id: "task", label: "Việc cần làm", icon: CheckSquare, format: { before: "- [ ] ", line: true } },
  { id: "q", label: "Trích dẫn / câu mẫu", icon: Quote, format: { before: "> ", line: true } },
  { id: "tag", label: "Gắn thẻ", icon: Hash, format: { before: " #", after: "", placeholder: "the" } },
] as const;

/** Live account: notes from the notebook store and the learner's older smart notebooks. */
export function QuickNotesWorkspace() {
  const store = useNotebook();
  const db = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<OldBook[]>([]);
  const [booksError, setBooksError] = useState(false);
  useEffect(() => {
    let alive = true;
    void db.from("smart_notebooks").select("id,title,updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setBooksError(true); else setBooks((data ?? []) as OldBook[]);
      });
    return () => { alive = false; };
  }, [db]);
  return <NotesWorkspace entries={store.entries} ready={store.ready} error={store.error} addEntry={store.addEntry} updateEntry={store.updateEntry} removeEntry={store.removeEntry} books={books} booksError={booksError} />;
}

export type NotesWorkspaceProps = {
  entries: NotebookEntry[]; ready: boolean; error: string; books: OldBook[]; booksError: boolean;
  addEntry: (input: NotebookInput) => Promise<NotebookEntry | undefined>;
  updateEntry: (id: string, input: NotebookInput) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
};

export function NotesWorkspace({ entries, ready, error, books, booksError, addEntry, updateEntry, removeEntry }: NotesWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [status, setStatus] = useState<{ tone: "idle" | "dirty" | "saving" | "saved" | "error"; text: string }>({ tone: "idle", text: "" });
  const [focus, setFocus] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [showBooks, setShowBooks] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [flash, setFlash] = useState("");
  const [weekAgo] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString());
  const editor = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ title: "", body: "" });
  const activeId = useRef<string | null>(null);
  const lastSaved = useRef("");
  const generation = useRef(0);
  const saving = useRef(false);
  const pending = useRef(false);
  const saveTools = useRef({ addEntry, updateEntry });
  useEffect(() => { saveTools.current = { addEntry, updateEntry }; }, [addEntry, updateEntry]);

  async function saveCurrent() {
    if (saving.current) { pending.current = true; return; }
    const { title: currentTitle, body: currentBody } = latest.current;
    if (!currentBody.trim()) return;
    const input = noteInput(currentTitle, currentBody);
    const fingerprint = JSON.stringify(input);
    if (fingerprint === lastSaved.current) return;
    const version = generation.current, id = activeId.current;
    saving.current = true;
    setStatus({ tone: "saving", text: "Đang lưu…" });
    let failed = false;
    try {
      if (id) await saveTools.current.updateEntry(id, input);
      else {
        const created = await saveTools.current.addEntry(input);
        if (created && version === generation.current) { activeId.current = created.id; setSelectedId(created.id); }
      }
      if (version === generation.current) { lastSaved.current = fingerprint; setStatus({ tone: "saved", text: `Đã lưu lúc ${clock(new Date())}` }); }
    } catch {
      failed = true;
      if (version === generation.current) setStatus({ tone: "error", text: "Chưa lưu được — nhấn Lưu để thử lại" });
    } finally {
      saving.current = false;
      const again = pending.current || (!failed && version === generation.current && JSON.stringify(noteInput(latest.current.title, latest.current.body)) !== lastSaved.current);
      pending.current = false;
      if (again) window.setTimeout(() => void saveCurrent(), 0);
    }
  }

  useEffect(() => {
    if (!ready || !body.trim() || JSON.stringify(noteInput(title, body)) === lastSaved.current) return;
    const timer = window.setTimeout(() => void saveCurrent(), 900);
    return () => window.clearTimeout(timer);
    // The editor's refs keep the in-flight save on its original note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, selectedId, ready]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(""), 1800);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function openNote(note: NotebookEntry | null, options: { savePrevious?: boolean; template?: NoteTemplate } = {}) {
    if (options.savePrevious !== false) void saveCurrent();
    generation.current += 1;
    activeId.current = note?.id ?? null;
    setSelectedId(note?.id ?? null);
    const nextTitle = note?.title ?? options.template?.title ?? "";
    const nextBody = note?.body ?? options.template?.body ?? "";
    latest.current = { title: nextTitle, body: nextBody };
    lastSaved.current = note ? JSON.stringify(noteInput(nextTitle, nextBody)) : "";
    setTitle(nextTitle);
    setBody(nextBody);
    setMode(note ? "view" : "edit");
    setStatus(note ? { tone: "saved", text: `Sửa lần cuối ${shortDate(note.updatedAt)}` } : { tone: "idle", text: "" });
    setMobileEditor(true);
    if (!note) window.requestAnimationFrame(() => titleInput.current?.focus());
  }

  function changeTitle(value: string) { latest.current = { ...latest.current, title: value }; setTitle(value); setStatus({ tone: "dirty", text: "Chưa lưu thay đổi" }); }
  function changeBody(value: string) { latest.current = { ...latest.current, body: value }; setBody(value); setStatus({ tone: "dirty", text: "Chưa lưu thay đổi" }); }

  function format(id: (typeof tools)[number]["id"]) {
    const tool = tools.find((item) => item.id === id)!;
    const area = editor.current;
    if (mode !== "edit" || !area) { setMode("edit"); return; }
    const next = applyFormat(body, area.selectionStart, area.selectionEnd, tool.format);
    changeBody(next.value);
    window.requestAnimationFrame(() => { area.focus(); area.setSelectionRange(next.start, next.end); });
  }

  function onEditorKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "b") { event.preventDefault(); format("b"); return; }
    if (mod && event.key.toLowerCase() === "i") { event.preventDefault(); format("i"); return; }
    if (event.key !== "Enter" || event.shiftKey || mod) return;
    // Continue lists and checklists on Enter; an empty item ends the list.
    const area = event.currentTarget, at = area.selectionStart;
    const lineStart = body.lastIndexOf("\n", at - 1) + 1, line = body.slice(lineStart, at);
    const match = /^(\s*)([-*] \[[ xX]\] |[-*] |(\d+)\. |> )/.exec(line);
    if (!match) return;
    event.preventDefault();
    if (line.trim() === match[2].trim()) {
      changeBody(body.slice(0, lineStart) + body.slice(at));
      window.requestAnimationFrame(() => area.setSelectionRange(lineStart, lineStart));
      return;
    }
    const prefix = match[1] + (match[3] ? `${Number(match[3]) + 1}. ` : match[2].replace(/\[[xX]\]/, "[ ]"));
    changeBody(`${body.slice(0, at)}\n${prefix}${body.slice(area.selectionEnd)}`);
    const caret = at + 1 + prefix.length;
    window.requestAnimationFrame(() => area.setSelectionRange(caret, caret));
  }

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveCurrent(); }
      if (event.key === "Escape" && focus) setFocus(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // saveCurrent reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  async function deleteSelected() {
    if (!selectedId || !window.confirm("Xóa ghi chú này? Không thể hoàn tác.")) return;
    setRemoving(true);
    try { await removeEntry(selectedId); openNote(null, { savePrevious: false }); setMobileEditor(false); setFlash("Đã xóa ghi chú"); }
    catch { /* The store shows the error. */ }
    finally { setRemoving(false); }
  }
  async function duplicate() {
    if (!body.trim()) return;
    await saveCurrent();
    const created = await addEntry(noteInput(`${title || "Ghi chú"} (bản sao)`.slice(0, 100), body)).catch(() => undefined);
    if (created) { openNote(created, { savePrevious: false }); setFlash("Đã tạo bản sao"); }
  }
  function download() {
    const name = (title.trim() || "ghi-chu").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "ghi-chu";
    const url = URL.createObjectURL(new Blob([`# ${title || "Ghi chú"}\n\n${body}\n`], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${name}.md`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${title ? `${title}\n\n` : ""}${body}`); setFlash("Đã sao chép nội dung"); }
    catch { setFlash("Trình duyệt chặn sao chép"); }
  }
  function pickTag(value: string) { setTag((current) => (current === value ? null : value)); setMobileEditor(false); }

  const notes = useMemo(() => entries.filter((entry) => entry.kind === "note"), [entries]);
  const meta = useMemo(() => new Map(notes.map((note) => [note.id, { tags: noteTags(note.body), stats: noteStats(note.body), snippet: noteSnippet(note.body) }])), [notes]);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of meta.values()) item.tags.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [meta]);
  const needle = query.trim().toLocaleLowerCase("vi");
  const shown = notes.filter((note) => {
    const info = meta.get(note.id)!;
    if (tag && !info.tags.includes(tag)) return false;
    if (filter === "source" && !hasSource(note)) return false;
    if (filter === "tasks" && !(info.stats.tasks > info.stats.done)) return false;
    return !needle || `${note.title} ${note.body}`.toLocaleLowerCase("vi").includes(needle);
  }).sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title, "vi") : sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)));
  const grouped = sort === "title" ? [{ label: "A → Z", items: shown }] : groups.map((label) => ({ label, items: shown.filter((note) => dateGroup(sort === "created" ? note.createdAt : note.updatedAt) === label) })).filter((group) => group.items.length);
  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const stats = noteStats(body);
  const openTasks = [...meta.values()].reduce((sum, item) => sum + item.stats.tasks - item.stats.done, 0);
  const isBlank = !selected && !body.trim() && !title.trim();

  return <div className={`content-page qn ${focus ? "qn-focus" : ""} ${mobileEditor ? "qn-show-editor" : ""}`}>
    <PageHeader
      className="qn-head"
      eyebrow="HỌC VÀ GHI NHỚ"
      title="Ghi chú học tập"
      description="Ghi lại từ mới, lỗi sai, dàn ý và ý tưởng. Gắn #thẻ để tìm lại nhanh; ghi chú tạo trong bài học có liên kết trở lại bài đó."
      sticker="notebook"
      actions={<button type="button" className="button primary" onClick={() => openNote(null)}><Plus size={17} /> Ghi chú mới</button>}
    >
      <dl className="qn-stats">
        <div><dt>Ghi chú</dt><dd>{ready ? notes.length : "…"}</dd></div>
        <div><dt>Tuần này</dt><dd>{ready ? notes.filter((note) => note.updatedAt >= weekAgo).length : "…"}</dd></div>
        <div><dt>Thẻ</dt><dd>{ready ? tagCounts.length : "…"}</dd></div>
        <div><dt>Việc chưa xong</dt><dd>{ready ? openTasks : "…"}</dd></div>
      </dl>
    </PageHeader>
    {error && <p className="form-error" role="alert">{error}</p>}

    <div className="qn-layout">
      <aside className="qn-side" aria-label="Danh sách ghi chú">
        <div className="qn-side-top">
          <label className="qn-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tiêu đề, nội dung, #thẻ…" aria-label="Tìm trong ghi chú" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={15} /></button>}</label>
          <div className="qn-filters">
            <div role="group" aria-label="Lọc ghi chú">
              {([["all", "Tất cả"], ["source", "Từ bài học"], ["tasks", "Còn việc"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
            </div>
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sắp xếp">
              <option value="updated">Mới sửa</option><option value="created">Mới tạo</option><option value="title">A → Z</option>
            </select>
          </div>
          {tagCounts.length > 0 && <div className="qn-tag-cloud" aria-label="Thẻ">
            {tagCounts.slice(0, 10).map(([value, count]) => <button key={value} type="button" className={tag === value ? "active" : ""} aria-pressed={tag === value} onClick={() => pickTag(value)}>#{value} <small>{count}</small></button>)}
          </div>}
        </div>
        <div className="qn-list">
          {!ready && <div className="qn-skeleton" aria-label="Đang tải ghi chú">{[0, 1, 2].map((item) => <i key={item} />)}</div>}
          {ready && grouped.map((group) => <section key={group.label}>
            <h3>{group.label} <span>{group.items.length}</span></h3>
            {group.items.map((note) => {
              const info = meta.get(note.id)!;
              return <button type="button" key={note.id} className={`qn-item ${selectedId === note.id ? "active" : ""}`} aria-current={selectedId === note.id} onClick={() => openNote(note)}>
                <strong>{note.title}</strong>
                <span>{info.snippet || "Chưa có nội dung"}</span>
                <small>
                  <time dateTime={note.updatedAt}>{shortDate(note.updatedAt)}</time>
                  {info.stats.tasks > 0 && <em className={info.stats.done === info.stats.tasks ? "done" : ""}><CheckSquare size={12} /> {info.stats.done}/{info.stats.tasks}</em>}
                  {hasSource(note) && <em><Link2 size={12} /> Bài học</em>}
                  {info.tags.slice(0, 2).map((value) => <b key={value}>#{value}</b>)}
                </small>
              </button>;
            })}
          </section>)}
          {ready && !shown.length && <div className="qn-list-empty">
            {notes.length ? <><p>Không có ghi chú phù hợp{tag ? <> với <b>#{tag}</b></> : ""}.</p><button type="button" className="button ghost" onClick={() => { setQuery(""); setTag(null); setFilter("all"); }}>Bỏ lọc</button></>
              : <p>Chưa có ghi chú nào. Bấm “Ghi chú mới” và chọn một mẫu để bắt đầu nhanh.</p>}
          </div>}
        </div>
      </aside>

      <section className="qn-editor" aria-label="Soạn ghi chú">
        <header className="qn-editor-head">
          <button type="button" className="qn-back" onClick={() => setMobileEditor(false)} aria-label="Về danh sách"><ArrowLeft size={18} /></button>
          <span className={`qn-status ${status.tone}`} role="status"><i aria-hidden="true" />{status.text || (selected ? "Đã lưu" : "Ghi chú mới · tự lưu khi bạn ngừng gõ")}</span>
          <div className="qn-mode" role="group" aria-label="Chế độ">
            <button type="button" aria-pressed={mode === "edit"} onClick={() => { setMode("edit"); window.requestAnimationFrame(() => editor.current?.focus()); }}><PencilLine size={15} /> Soạn</button>
            <button type="button" aria-pressed={mode === "view"} disabled={!body.trim()} onClick={() => setMode("view")}><Eye size={15} /> Xem</button>
          </div>
          <div className="qn-actions">
            <button type="button" title="Sao chép nội dung" aria-label="Sao chép nội dung" disabled={!body.trim()} onClick={() => void copy()}><Copy size={16} /></button>
            <button type="button" title="Tải về (.md)" aria-label="Tải ghi chú về máy" disabled={!body.trim()} onClick={download}><Download size={16} /></button>
            <button type="button" title="Nhân bản" aria-label="Nhân bản ghi chú" disabled={!selected} onClick={() => void duplicate()}><SquareStack size={16} /></button>
            <button type="button" title={focus ? "Thoát toàn màn hình (Esc)" : "Viết toàn màn hình"} aria-label={focus ? "Thoát chế độ tập trung" : "Chế độ tập trung"} onClick={() => setFocus((value) => !value)}>{focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <button type="button" className="danger" title="Xóa" aria-label="Xóa ghi chú" disabled={!selected || removing} onClick={() => void deleteSelected()}><Trash2 size={16} /></button>
            <button type="button" className="button primary qn-save" disabled={!body.trim() || status.tone === "saving"} onClick={() => void saveCurrent()}>{status.tone === "saved" ? <Check size={15} /> : null} Lưu</button>
          </div>
        </header>

        <input ref={titleInput} className="qn-title" maxLength={100} value={title} onChange={(event) => changeTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setMode("edit"); window.requestAnimationFrame(() => editor.current?.focus()); } }} placeholder="Tiêu đề ghi chú" aria-label="Tiêu đề ghi chú" />
        {hasSource(selected) && <Link className="qn-source" href={selected!.sourcePath}><Link2 size={14} /> {sourceLabel(selected!.sourcePath)} <ArrowRight size={13} /></Link>}

        {mode === "edit" ? <>
          <div className="qn-toolbar" role="toolbar" aria-label="Định dạng">
            {tools.map((tool, index) => { const Icon = tool.icon; return <span key={tool.id} className="qn-tool-wrap">{(index === 1 || index === 4 || index === 7) && <i className="qn-sep" aria-hidden="true" />}<button type="button" title={tool.label} aria-label={tool.label} onMouseDown={(event) => event.preventDefault()} onClick={() => format(tool.id)}><Icon size={16} /></button></span>; })}
          </div>
          <textarea ref={editor} className="qn-body" maxLength={100000} value={body} onChange={(event) => changeBody(event.target.value)} onKeyDown={onEditorKey}
            placeholder={"Viết điều bạn muốn nhớ…\n\nMẹo: ## tiêu đề mục · - danh sách · - [ ] việc cần làm · **đậm** · ==tô sáng== · #thẻ"} aria-label="Nội dung ghi chú" />
        </> : <div className="qn-view"><NoteMarkdown body={body} onToggleTask={(index) => changeBody(toggleTask(body, index))} onTag={pickTag} /></div>}

        {isBlank && <div className="qn-templates" aria-label="Bắt đầu từ mẫu">
          <p><LayoutTemplate size={16} /> Bắt đầu nhanh với mẫu</p>
          <div>{noteTemplates.map((template) => <button key={template.id} type="button" onClick={() => openNote(null, { savePrevious: false, template })}><strong>{template.label}</strong><small>{template.hint}</small></button>)}</div>
        </div>}

        <footer className="qn-foot">
          <span>{stats.words ? `${stats.words} từ · ${stats.characters.toLocaleString("vi-VN")} ký tự · ${stats.minutes} phút đọc` : "Chưa có nội dung"}</span>
          {stats.tasks > 0 && <span className="qn-progress"><CheckSquare size={13} /> {stats.done}/{stats.tasks} việc <i><b style={{ width: `${(stats.done / stats.tasks) * 100}%` }} /></i></span>}
          <span className="qn-keys"><kbd>Ctrl</kbd>+<kbd>S</kbd> lưu · <kbd>Ctrl</kbd>+<kbd>B</kbd> đậm</span>
        </footer>
        {flash && <p className="qn-flash" role="status">{flash}</p>}
      </section>
    </div>

    <nav className="qn-links" aria-label="Các mục ôn tập">
      <Link href="/app/vocabulary/notebook"><span className="qn-link-icon mint"><BookOpen size={18} /></span><span><strong>Từ đã lưu</strong><small>Xem và ôn trong Vocabulary</small></span><ArrowRight size={16} /></Link>
      <Link href="/app/grammar/review"><span className="qn-link-icon coral"><FileText size={18} /></span><span><strong>Sổ lỗi Grammar</strong><small>Ôn lại câu cần luyện thêm</small></span><ArrowRight size={16} /></Link>
      <button type="button" aria-expanded={showBooks} onClick={() => setShowBooks((value) => !value)}><span className="qn-link-icon sky"><BookOpen size={18} /></span><span><strong>Sổ tay cũ ({books.length})</strong><small>{showBooks ? "Thu gọn danh sách" : "Xem các sổ đã tạo trước đây"}</small></span><ArrowRight size={16} className={showBooks ? "open" : ""} /></button>
    </nav>
    {showBooks && <section className="qn-archive">{books.map((book) => <Link href={`/app/notebook/${book.id}`} key={book.id}><BookOpen size={16} /><span>{book.title}</span><small>{shortDate(book.updated_at)}</small></Link>)}{booksError && <p>Chưa tải được danh sách sổ cũ. Hãy tải lại trang.</p>}<Link href="/app/notebook/library"><BookOpen size={16} /><span>Quản lý sổ cũ</span><ArrowRight size={14} /></Link></section>}
  </div>;
}
