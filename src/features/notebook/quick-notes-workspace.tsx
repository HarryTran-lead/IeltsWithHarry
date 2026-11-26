"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Bold, BookOpen, CalendarDays, CheckSquare, ChevronDown, CircleAlert, Copy, Download, Eye, FileText, Hash, Heading2, Highlighter, Italic,
  Link2, List, ListOrdered, Maximize2, Minimize2, MoreHorizontal, PencilLine, Plus, Quote, RotateCcw, Search, SquareStack, Trash2, X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/browser";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { demoMode } from "@/lib/runtime";
import type { WordReview } from "@/lib/news/review";
import { flaggedQuestions } from "@/lib/grammar/schedule";
import { useGrammarProgress } from "@/features/grammar/grammar-progress";
import type { NotebookInput, NoteSkill } from "@/lib/validation/notebook";
import { useNotebook, type NotebookEntry } from "./notebook-store";
import { NoteMarkdown } from "./note-markdown";
import { applyFormat, dateGroup, entryKind, entryKindLabels, noteSnippet, noteStats, noteTags, noteTemplates, reviewDate, reviewDue, toggleTask, type DateGroup, type EntryKind, type NoteTemplate } from "./notes-model";
import "./quick-notes-workspace.css";

export type OldBook = { id: string; title: string; updated_at: string };
type Sort = "updated" | "created" | "title";
type Filter = "all" | "source" | "tasks" | "review";
const REVIEW_COLUMNS = "notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at,fsrs_state";
const kindOrder: EntryKind[] = ["vocab", "mistake", "outline", "free"];
const skillLabels: Record<NoteSkill, string> = { general: "Chung", writing: "Writing", speaking: "Speaking", reading: "Reading", listening: "Listening", vocabulary: "Vocabulary", grammar: "Grammar" };

const noteInput = (title: string, body: string, skill: NoteSkill = "general", reviewAt: string | null = null, reviewPrompt = "", reviewCount = 0): NotebookInput => ({
  kind: "note",
  title: (title.trim() || noteSnippet(body).slice(0, 60) || "Ghi chú mới").slice(0, 100),
  body: body.trim(),
  meaningVi: "",
  example: "",
  skill, reviewAt, reviewPrompt, reviewCount,
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

/** Live account: notes and saved words from the notebook store, word review schedule, grammar mistakes and older smart notebooks. */
export function QuickNotesWorkspace() {
  const store = useNotebook();
  const db = useMemo(() => createClient(), []);
  const grammar = useGrammarProgress();
  const [books, setBooks] = useState<OldBook[]>([]);
  const [booksError, setBooksError] = useState(false);
  const [reviews, setReviews] = useState<WordReview[] | null>(demoMode ? [] : null);
  useEffect(() => {
    let alive = true;
    void db.from("smart_notebooks").select("id,title,updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setBooksError(true); else setBooks((data ?? []) as OldBook[]);
      });
    if (!demoMode) void fetchAllRows<WordReview>((from, to) => db.from("user_word_reviews").select(REVIEW_COLUMNS).order("notebook_entry_id").range(from, to))
      .then((result) => { if (alive) setReviews(result.data ?? []); });
    return () => { alive = false; };
  }, [db]);
  const mistakeCount = grammar.ready ? flaggedQuestions(grammar.progress).length : null;
  return <NotesWorkspace entries={store.entries} ready={store.ready} error={store.error} addEntry={store.addEntry} updateEntry={store.updateEntry} removeEntry={store.removeEntry}
    books={books} booksError={booksError} reviews={reviews} mistakeCount={mistakeCount} />;
}

export type NotesWorkspaceProps = {
  entries: NotebookEntry[]; ready: boolean; error: string; books: OldBook[]; booksError: boolean;
  addEntry: (input: NotebookInput) => Promise<NotebookEntry | undefined>;
  updateEntry: (id: string, input: NotebookInput) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  /** Word review schedule (null while loading); omitted in previews. */
  reviews?: WordReview[] | null;
  /** Grammar questions waiting in the mistake log (null while loading). */
  mistakeCount?: number | null;
};

export function NotesWorkspace({ entries, ready, error, books, booksError, addEntry, updateEntry, removeEntry, reviews = [], mistakeCount = null }: NotesWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [skill, setSkill] = useState<NoteSkill>("general");
  const [reviewAt, setReviewAt] = useState<string | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState("");
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [status, setStatus] = useState<{ tone: "idle" | "dirty" | "saving" | "saved" | "error"; text: string }>({ tone: "idle", text: "" });
  const [focus, setFocus] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [showBooks, setShowBooks] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [flash, setFlash] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | EntryKind>("all");
  const [newMenu, setNewMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [noteSession, setNoteSession] = useState(0);
  const [now] = useState(() => Date.now());
  const [weekAgo] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString());
  const editor = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ title: "", body: "", skill: "general" as NoteSkill, reviewAt: null as string | null, reviewPrompt: "", reviewCount: 0 });
  const activeId = useRef<string | null>(null);
  const lastSaved = useRef("");
  const openedInitial = useRef(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const pending = useRef(false);
  const saveTools = useRef({ addEntry, updateEntry });
  useEffect(() => { saveTools.current = { addEntry, updateEntry }; }, [addEntry, updateEntry]);

  async function saveCurrent() {
    if (saving.current) { pending.current = true; return; }
    const { title: currentTitle, body: currentBody, skill: currentSkill, reviewAt: currentReviewAt, reviewPrompt: currentReviewPrompt, reviewCount: currentReviewCount } = latest.current;
    if (!currentBody.trim()) return;
    const input = noteInput(currentTitle, currentBody, currentSkill, currentReviewAt, currentReviewPrompt, currentReviewCount);
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
      const again = pending.current || (!failed && version === generation.current && JSON.stringify(noteInput(latest.current.title, latest.current.body, latest.current.skill, latest.current.reviewAt, latest.current.reviewPrompt, latest.current.reviewCount)) !== lastSaved.current);
      pending.current = false;
      if (again) window.setTimeout(() => void saveCurrent(), 0);
    }
  }

  useEffect(() => {
    if (!ready || !body.trim() || JSON.stringify(noteInput(title, body, skill, reviewAt, reviewPrompt, reviewCount)) === lastSaved.current) return;
    const timer = window.setTimeout(() => void saveCurrent(), 900);
    return () => window.clearTimeout(timer);
    // The editor's refs keep the in-flight save on its original note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, skill, reviewAt, reviewPrompt, reviewCount, selectedId, ready]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(""), 1800);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function openNote(note: NotebookEntry | null, options: { savePrevious?: boolean; template?: NoteTemplate } = {}) {
    openedInitial.current = true;
    if (options.savePrevious !== false) void saveCurrent();
    generation.current += 1;
    setNoteSession((value) => value + 1);
    setNewMenu(false);
    setMoreMenu(false);
    activeId.current = note?.id ?? null;
    setSelectedId(note?.id ?? null);
    const nextTitle = note?.title ?? options.template?.title ?? "";
    const nextBody = note?.body ?? options.template?.body ?? "";
    const templateSkills: Record<string, NoteSkill> = { mistake: "grammar", writing: "writing", task1: "writing", speaking: "speaking", "reading-listening": "reading" };
    const nextSkill = note?.kind === "note" ? note.skill ?? "general" : templateSkills[options.template?.id ?? ""] ?? "general";
    const nextReviewAt = note?.kind === "note" ? note.reviewAt ?? null : null;
    const nextReviewPrompt = note?.kind === "note" ? note.reviewPrompt ?? "" : "";
    const nextReviewCount = note?.kind === "note" ? note.reviewCount ?? 0 : 0;
    latest.current = { title: nextTitle, body: nextBody, skill: nextSkill, reviewAt: nextReviewAt, reviewPrompt: nextReviewPrompt, reviewCount: nextReviewCount };
    lastSaved.current = note ? JSON.stringify(noteInput(nextTitle, nextBody, nextSkill, nextReviewAt, nextReviewPrompt, nextReviewCount)) : "";
    setTitle(nextTitle);
    setBody(nextBody);
    setSkill(nextSkill); setReviewAt(nextReviewAt); setReviewPrompt(nextReviewPrompt); setReviewCount(nextReviewCount);
    setReviewOpen(false); setReviewRevealed(false);
    setMode(note ? "view" : "edit");
    setStatus(note ? { tone: "saved", text: `Sửa lần cuối ${shortDate(note.updatedAt)}` } : { tone: "idle", text: "" });
    setMobileEditor(true);
    if (!note) window.requestAnimationFrame(() => titleInput.current?.focus());
  }

  function startFromTemplate(id: string) {
    const template = noteTemplates.find((item) => item.id === id);
    openNote(null, { template });
  }

  function changeTitle(value: string) { latest.current = { ...latest.current, title: value }; setTitle(value); setStatus({ tone: "dirty", text: "Chưa lưu thay đổi" }); }
  function changeBody(value: string) { latest.current = { ...latest.current, body: value }; setBody(value); setStatus({ tone: "dirty", text: "Chưa lưu thay đổi" }); }
  function changeLearning(next: { skill?: NoteSkill; reviewAt?: string | null; reviewPrompt?: string; reviewCount?: number }) {
    latest.current = { ...latest.current, ...next };
    if (next.skill !== undefined) setSkill(next.skill);
    if (next.reviewAt !== undefined) setReviewAt(next.reviewAt);
    if (next.reviewPrompt !== undefined) setReviewPrompt(next.reviewPrompt);
    if (next.reviewCount !== undefined) setReviewCount(next.reviewCount);
    setStatus({ tone: "dirty", text: "Chưa lưu thay đổi" });
  }

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
      if (event.key === "Escape") { if (reviewOpen) setReviewOpen(false); else if (focus) setFocus(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // saveCurrent reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, reviewOpen]);

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
    const created = await addEntry(noteInput(`${title || "Ghi chú"} (bản sao)`.slice(0, 100), body, skill, reviewAt, reviewPrompt)).catch(() => undefined);
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

  async function finishReview(remembered: boolean) {
    if (!selectedId || status.tone !== "saved" || reviewBusy) return;
    const nextDate = reviewDate(remembered ? 7 : 1);
    const nextCount = reviewCount + 1;
    setReviewBusy(true);
    try {
      await updateEntry(selectedId, noteInput(title, body, skill, nextDate, reviewPrompt, nextCount));
      latest.current = { ...latest.current, reviewAt: nextDate, reviewCount: nextCount };
      setReviewAt(nextDate); setReviewCount(nextCount);
      lastSaved.current = JSON.stringify(noteInput(title, body, skill, nextDate, reviewPrompt, nextCount));
      setStatus({ tone: "saved", text: `Đã lưu lúc ${clock(new Date())}` });
      setReviewOpen(false); setReviewRevealed(false);
      setFlash(remembered ? "Đã nhớ · ôn lại sau 7 ngày" : "Cần ôn · nhắc lại ngày mai");
    } catch { setFlash("Chưa lưu được lịch ôn. Hãy thử lại."); }
    finally { setReviewBusy(false); }
  }

  const notes = useMemo(() => entries.filter((entry) => entry.kind === "note"), [entries]);
  useEffect(() => {
    if (!ready || openedInitial.current) return;
    const recent = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!recent) return;
    const frame = window.requestAnimationFrame(() => {
      if (openedInitial.current || activeId.current || latest.current.title || latest.current.body) return;
      openedInitial.current = true;
      activeId.current = recent.id;
      const recentSkill = recent.skill ?? "general";
      const recentReviewAt = recent.reviewAt ?? null;
      const recentReviewPrompt = recent.reviewPrompt ?? "";
      const recentReviewCount = recent.reviewCount ?? 0;
      latest.current = { title: recent.title, body: recent.body, skill: recentSkill, reviewAt: recentReviewAt, reviewPrompt: recentReviewPrompt, reviewCount: recentReviewCount };
      lastSaved.current = JSON.stringify(noteInput(recent.title, recent.body, recentSkill, recentReviewAt, recentReviewPrompt, recentReviewCount));
      setSelectedId(recent.id);
      setTitle(recent.title);
      setBody(recent.body);
      setSkill(recentSkill); setReviewAt(recentReviewAt); setReviewPrompt(recentReviewPrompt); setReviewCount(recentReviewCount);
      setMode("view");
      setStatus({ tone: "saved", text: `Sửa lần cuối ${shortDate(recent.updatedAt)}` });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, notes]);
  const words = useMemo(() => entries.filter((entry): entry is Extract<NotebookEntry, { kind: "word" }> => entry.kind === "word"), [entries]);
  const reviewById = useMemo(() => new Map((reviews ?? []).map((review) => [review.notebook_entry_id, review])), [reviews]);
  const meta = useMemo(() => new Map(notes.map((entry) => [entry.id,
    { kind: entryKind(entry), tags: noteTags(entry.body), stats: noteStats(entry.body), snippet: noteSnippet(entry.body) }])), [notes]);
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of meta.values()) item.tags.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [meta]);
  const kindCounts = useMemo(() => {
    const counts: Record<EntryKind, number> = { vocab: 0, mistake: 0, outline: 0, free: 0 };
    for (const item of meta.values()) counts[item.kind] += 1;
    return counts;
  }, [meta]);
  const needle = query.trim().toLocaleLowerCase("vi");
  const shown = notes.filter((entry) => {
    const info = meta.get(entry.id)!;
    if (kindFilter !== "all" && info.kind !== kindFilter) return false;
    if (tag && !info.tags.includes(tag)) return false;
    if (filter === "source" && !hasSource(entry)) return false;
    if (filter === "tasks" && !(info.stats.tasks > info.stats.done)) return false;
    if (filter === "review" && !reviewDue(entry.reviewAt)) return false;
    return !needle || `${entry.title} ${entry.body}`.toLocaleLowerCase("vi").includes(needle);
  }).sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title, "vi") : sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)));
  const grouped = sort === "title" ? [{ label: "A → Z", items: shown }] : groups.map((label) => ({ label, items: shown.filter((entry) => dateGroup(sort === "created" ? entry.createdAt : entry.updatedAt) === label) })).filter((group) => group.items.length);
  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const stats = noteStats(body);

  // Review numbers for the summary cards and the "Ôn hôm nay" panel.
  const dueWords = words.filter((entry) => { const review = reviewById.get(entry.id); return review && new Date(review.due_at).getTime() <= now; })
    .sort((a, b) => reviewById.get(a.id)!.due_at.localeCompare(reviewById.get(b.id)!.due_at));
  const reviewsReady = reviews !== null;
  const notesThisWeek = notes.filter((note) => note.updatedAt >= weekAgo).length;
  const dueNotes = notes.filter((note) => reviewDue(note.reviewAt)).length;

  const kindIcon = (kind: EntryKind) => kind === "vocab" ? <b aria-hidden="true">Aa</b> : kind === "mistake" ? <CircleAlert size={16} aria-hidden="true" /> : kind === "outline" ? <List size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />;
  const templateChoices = noteTemplates.map((template) => ({ id: template.id, label: template.label, hint: template.hint, kind: (template.id === "mistake" ? "mistake" : template.id === "lesson" ? "free" : "outline") as EntryKind }));
  const closeOnBlur = (close: () => void) => (event: FocusEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); };

  return <div className={`content-page qn ${focus ? "qn-focus" : ""} ${mobileEditor ? "qn-show-editor" : ""}`}>
    <PageHeader
      className="qn-head"
      title="Ghi chú học tập"
      description="Ghi lại lỗi sai, dàn ý và ý tưởng IELTS để tìm lại khi cần."
      sticker="notebook"
      actions={<>
        <div className="qn-new" onBlur={closeOnBlur(() => setNewMenu(false))} onKeyDown={(event) => { if (event.key === "Escape") setNewMenu(false); }}>
          <button type="button" className="button primary" aria-haspopup="menu" aria-expanded={newMenu} onClick={() => setNewMenu((value) => !value)}><Plus size={17} /> Ghi chú mới <ChevronDown size={15} /></button>
          {newMenu && <div className="qn-menu qn-new-menu" role="menu" onMouseDown={(event) => event.preventDefault()}>
            <button role="menuitem" type="button" onClick={() => openNote(null)}><span className="qn-kind free"><PencilLine size={15} aria-hidden="true" /></span><span><strong>Ghi chú trống</strong><small>Viết tự do</small></span></button>
            {templateChoices.map((item) => <button role="menuitem" type="button" key={item.id} onClick={() => startFromTemplate(item.id)}><span className={`qn-kind ${item.kind}`}>{kindIcon(item.kind)}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}
            <Link role="menuitem" href="/app/vocabulary/notebook"><span className="qn-kind vocab"><b aria-hidden="true">Aa</b></span><span><strong>Thêm từ vựng</strong><small>Mở Sổ từ để lưu và ôn</small></span></Link>
          </div>}
        </div>
      </>}
    />
    {error && <p className="form-error" role="alert">{error}</p>}

    <div className="qn-overview" aria-label="Tổng quan ghi chú">
      <p><strong>{ready ? notes.length : "…"} ghi chú</strong><span>·</span>{ready ? `${notesThisWeek} cập nhật tuần này` : "Đang tải"}{dueNotes > 0 && <><span>·</span><button type="button" className="qn-due-link" onClick={() => { setFilter("review"); setShowFilters(true); setMobileEditor(false); }}>{dueNotes} cần ôn</button></>}</p>
      <nav aria-label="Các sổ ôn tập">
        <Link href="/app/vocabulary/notebook"><BookOpen size={15} /> Sổ từ {ready ? words.length : "…"}</Link>
        {reviewsReady && dueWords.length > 0 && <Link href="/app/vocabulary/review"><RotateCcw size={15} /> Ôn {dueWords.length} từ</Link>}
        <Link href="/app/grammar/review"><CircleAlert size={15} /> Sổ lỗi {mistakeCount ?? "…"}</Link>
        <button type="button" aria-expanded={showBooks} onClick={() => setShowBooks((value) => !value)}><BookOpen size={15} /> Sổ tay cũ ({books.length}) <ChevronDown size={13} className={showBooks ? "open" : ""} /></button>
      </nav>
    </div>
    {showBooks && <div className="qn-archive" aria-label="Sổ tay cũ">{books.map((book) => <Link href={`/app/notebook/${book.id}`} key={book.id}><BookOpen size={14} /><span>{book.title}</span><small>{shortDate(book.updated_at)}</small></Link>)}{booksError && <p>Chưa tải được danh sách sổ cũ. Hãy tải lại trang.</p>}<Link href="/app/notebook/library"><span>Quản lý sổ cũ</span><ArrowRight size={14} /></Link></div>}

    <div className="qn-layout">
      <aside className="qn-side" aria-label="Danh sách ghi chú">
        <div className="qn-side-top">
          <label className="qn-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm ghi chú, #thẻ…" aria-label="Tìm trong ghi chú" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Xóa tìm kiếm"><X size={15} /></button>}</label>
          <div className="qn-kinds" role="group" aria-label="Lọc theo loại">
            <button type="button" aria-pressed={kindFilter === "all"} onClick={() => setKindFilter("all")}>Tất cả <small>{notes.length}</small></button>
            {kindOrder.map((kind) => <button type="button" key={kind} aria-pressed={kindFilter === kind} onClick={() => setKindFilter(kind)}>{entryKindLabels[kind]} {kindCounts[kind] > 0 && <small>{kindCounts[kind]}</small>}</button>)}
          </div>
          <button type="button" className="qn-filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}>Lọc & sắp xếp {(filter !== "all" || tag || sort !== "updated") && <span>Đang lọc</span>} <ChevronDown size={14} className={showFilters ? "open" : ""} /></button>
          {showFilters && <div className="qn-filters">
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Lọc thêm">
              <option value="all">Mọi ghi chú</option><option value="source">Từ bài học</option><option value="tasks">Còn việc chưa xong</option><option value="review">Đến hạn ôn</option>
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sắp xếp">
              <option value="updated">Mới sửa</option><option value="created">Mới tạo</option><option value="title">A → Z</option>
            </select>
          </div>}
          {showFilters && tagCounts.length > 0 && <div className="qn-tag-cloud" aria-label="Thẻ">
            {tagCounts.slice(0, 8).map(([value, count]) => <button key={value} type="button" className={tag === value ? "active" : ""} aria-pressed={tag === value} onClick={() => pickTag(value)}>#{value} <small>{count}</small></button>)}
          </div>}
        </div>
        <div className="qn-list">
          {!ready && <div className="qn-skeleton" aria-label="Đang tải ghi chú">{[0, 1, 2].map((item) => <i key={item} />)}</div>}
          {ready && grouped.map((group) => <section key={group.label}>
            <h3>{group.label} <span>{group.items.length}</span></h3>
            {group.items.map((entry) => {
              const info = meta.get(entry.id)!;
              const active = selectedId === entry.id;
              const label = entry.title;
              return <button type="button" key={entry.id} className={`qn-item ${active ? "active" : ""}`} aria-current={active} aria-label={`${entryKindLabels[info.kind]}: ${label}`} onClick={() => openNote(entry)}>
                <span className={`qn-kind ${info.kind}`}>{kindIcon(info.kind)}</span>
                <span className="qn-item-text">
                  <strong>{label}</strong>
                  <span>{info.snippet || "Chưa có nội dung"}</span>
                  <small>
                    <time dateTime={entry.updatedAt}>{shortDate(entry.updatedAt)}</time>
                    {info.stats.tasks > 0 && <em className={info.stats.done === info.stats.tasks ? "done" : ""}><CheckSquare size={12} /> {info.stats.done}/{info.stats.tasks}</em>}
                    {reviewDue(entry.reviewAt) && <em className="due"><CalendarDays size={12} /> Cần ôn</em>}
                    {hasSource(entry) && <em><Link2 size={12} /> Bài học</em>}
                    {info.tags.slice(0, 2).map((value) => <b key={value}>#{value}</b>)}
                  </small>
                </span>
              </button>;
            })}
          </section>)}
          {ready && !shown.length && <div className="qn-list-empty">
            {notes.length ? <><p>Không có ghi chú phù hợp{tag ? <> với <b>#{tag}</b></> : ""}.</p><button type="button" className="button ghost" onClick={() => { setQuery(""); setTag(null); setFilter("all"); setKindFilter("all"); }}>Bỏ lọc</button></>
              : <p>Chưa có ghi chú nào. Bấm “Ghi chú mới” và chọn một mẫu để bắt đầu nhanh.</p>}
          </div>}
        </div>
      </aside>

      <section className="qn-editor" aria-label="Soạn ghi chú">
        <header className="qn-editor-head">
          <button type="button" className="qn-back" onClick={() => setMobileEditor(false)} aria-label="Về danh sách"><ArrowLeft size={18} /></button>
          {(selected || body.trim()) && <span className={`qn-kind-chip ${entryKind({ kind: "note", title, body })}`}>{entryKindLabels[entryKind({ kind: "note", title, body })]}</span>}
          <span className={`qn-status ${status.tone}`} role="status"><i aria-hidden="true" />{status.text || (selected ? "Đã lưu" : "Tự lưu khi bạn ngừng gõ")}{status.tone === "error" && <button type="button" className="qn-retry" onClick={() => void saveCurrent()}>Thử lại</button>}</span>
          <div className="qn-mode" role="group" aria-label="Chế độ">
            <button type="button" aria-pressed={mode === "edit"} onClick={() => { setMode("edit"); window.requestAnimationFrame(() => editor.current?.focus()); }}><PencilLine size={15} /> Soạn</button>
            <button type="button" aria-pressed={mode === "view"} disabled={!body.trim()} onClick={() => setMode("view")}><Eye size={15} /> Xem</button>
          </div>
          <div className="qn-menu-wrap" onBlur={closeOnBlur(() => setMoreMenu(false))} onKeyDown={(event) => { if (event.key === "Escape") setMoreMenu(false); }}>
            <button type="button" className="qn-icon" aria-label="Thêm thao tác" aria-haspopup="menu" aria-expanded={moreMenu} onClick={() => setMoreMenu((value) => !value)}><MoreHorizontal size={18} /></button>
            {moreMenu && <div className="qn-menu" role="menu" onMouseDown={(event) => event.preventDefault()}>
              <button role="menuitem" type="button" disabled={!body.trim()} onClick={() => { setMoreMenu(false); void copy(); }}><Copy size={15} /> Sao chép nội dung</button>
              <button role="menuitem" type="button" disabled={!body.trim()} onClick={() => { setMoreMenu(false); download(); }}><Download size={15} /> Tải về (.md)</button>
              <button role="menuitem" type="button" disabled={!selected} onClick={() => { setMoreMenu(false); void duplicate(); }}><SquareStack size={15} /> Nhân bản</button>
              <button role="menuitem" type="button" onClick={() => { setMoreMenu(false); setFocus((value) => !value); }}>{focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {focus ? "Thoát toàn màn hình" : "Viết toàn màn hình"}</button>
              <button role="menuitem" type="button" className="danger" disabled={!selected || removing} onClick={() => { setMoreMenu(false); void deleteSelected(); }}><Trash2 size={15} /> Xóa ghi chú</button>
            </div>}
          </div>
        </header>

        <input ref={titleInput} className="qn-title" maxLength={100} value={title} onChange={(event) => changeTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setMode("edit"); window.requestAnimationFrame(() => editor.current?.focus()); } }} placeholder="Tiêu đề ghi chú" aria-label="Tiêu đề ghi chú" />
        {hasSource(selected) && <Link className="qn-source" href={selected!.sourcePath}><Link2 size={14} /> {sourceLabel(selected!.sourcePath)} <ArrowRight size={13} /></Link>}
        <details key={noteSession} className="qn-learning">
          <summary><span><CalendarDays size={15} /> Tùy chọn học tập{reviewAt && <small>Ôn {shortDate(reviewAt)}</small>}</span><ChevronDown size={15} /></summary>
          <div className="qn-learning-fields">
            <label>Kỹ năng<select value={skill} onChange={(event) => changeLearning({ skill: event.target.value as NoteSkill })}>{Object.entries(skillLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Ngày ôn lại<input type="date" value={reviewAt ?? ""} onChange={(event) => changeLearning({ reviewAt: event.target.value || null })} /></label>
            <label className="qn-prompt">Câu hỏi tự kiểm tra<input maxLength={500} value={reviewPrompt} onChange={(event) => changeLearning({ reviewPrompt: event.target.value })} placeholder="Bạn cần nhớ điều gì từ ghi chú này?" /></label>
            <button type="button" className="qn-review-button" disabled={!selected || status.tone !== "saved"} onClick={() => { setReviewRevealed(false); setReviewOpen(true); }}><RotateCcw size={15} /> Tự kiểm tra</button>
          </div>
        </details>

        {mode === "edit" ? <>
          <div className="qn-toolbar" role="toolbar" aria-label="Định dạng">
            {tools.map((tool, index) => { const Icon = tool.icon; return <span key={tool.id} className="qn-tool-wrap">{(index === 1 || index === 4 || index === 7) && <i className="qn-sep" aria-hidden="true" />}<button type="button" title={tool.label} aria-label={tool.label} onMouseDown={(event) => event.preventDefault()} onClick={() => format(tool.id)}><Icon size={16} /></button></span>; })}
          </div>
          <textarea ref={editor} className="qn-body" maxLength={100000} value={body} onChange={(event) => changeBody(event.target.value)} onKeyDown={onEditorKey}
            placeholder={"Viết điều bạn muốn nhớ…\n\nDùng thanh công cụ phía trên để in đậm, tạo danh sách, việc cần làm hoặc gắn #thẻ."} aria-label="Nội dung ghi chú" />
        </> : <div className="qn-view"><NoteMarkdown body={body} onToggleTask={(index) => changeBody(toggleTask(body, index))} onTag={pickTag} /></div>}

        <footer className="qn-foot">
          <span>{stats.words ? `${stats.words} từ · ${stats.minutes} phút đọc` : "Chưa có nội dung"}</span>
          {stats.tasks > 0 && <span className="qn-progress"><CheckSquare size={13} /> {stats.done}/{stats.tasks} việc <i><b style={{ width: `${(stats.done / stats.tasks) * 100}%` }} /></i></span>}
          {reviewAt && <span className="qn-review-foot"><CalendarDays size={13} /> Ôn {shortDate(reviewAt)}{reviewCount > 0 ? ` · ${reviewCount} lần` : ""}</span>}
          <span className="qn-keys"><kbd>Ctrl</kbd>+<kbd>S</kbd> lưu ngay · <kbd>Ctrl</kbd>+<kbd>B</kbd> đậm</span>
        </footer>
        {flash && <p className="qn-flash" role="status">{flash}</p>}
        {reviewOpen && <div className="qn-review-backdrop" role="presentation"><section className="qn-review-dialog" role="dialog" aria-modal="true" aria-label="Tự kiểm tra ghi chú"><button type="button" className="qn-review-close" aria-label="Đóng" onClick={() => setReviewOpen(false)}><X size={18} /></button><span className="qn-review-kicker"><RotateCcw size={16} /> Ôn tập chủ động</span><h2>{reviewPrompt || `Bạn nhớ gì về “${title}”?`}</h2>{!reviewRevealed ? <><p>Thử trả lời trước khi xem lại ghi chú.</p><button type="button" className="button primary" onClick={() => setReviewRevealed(true)}>Hiện ghi chú</button></> : <><div className="qn-review-answer"><NoteMarkdown body={body} /></div><p>Bạn đã nhớ được nội dung này chưa?</p><div className="qn-review-choices"><button type="button" disabled={reviewBusy} onClick={() => void finishReview(false)}>Cần ôn lại ngày mai</button><button type="button" className="button primary" disabled={reviewBusy} onClick={() => void finishReview(true)}>Đã nhớ · sau 7 ngày</button></div></>}</section></div>}
      </section>
    </div>
  </div>;
}
