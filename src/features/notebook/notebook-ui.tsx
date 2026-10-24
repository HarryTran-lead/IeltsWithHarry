"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, Clock3, MessageCircleMore, NotebookPen, Plus, Search, X } from "lucide-react";
import { useDemo } from "@/features/demo/demo-store";
import { useNotebook, type NotebookEntry } from "./notebook-store";
import type { NotebookInput } from "@/lib/validation/notebook";

type QuickTab = "note" | "word" | "recent";
const when = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function QuickForm({ kind, onSaved, entry }: { kind: "note" | "word"; onSaved: () => void; entry?: NotebookEntry | null }) {
  const pathname = usePathname();
  const { addEntry, updateEntry, error } = useNotebook();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [meaningVi, setMeaningVi] = useState(entry?.meaningVi ?? "");
  const [example, setExample] = useState(entry?.example ?? "");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input: NotebookInput = kind === "note"
      ? { kind, title, body, meaningVi: "", example: "" }
      : { kind, title, body: "", meaningVi, example };
    setBusy(true);
    try { if (entry) await updateEntry(entry.id, input); else await addEntry(input); setTitle(""); setBody(""); setMeaningVi(""); setExample(""); onSaved(); }
    catch { /* The store displays the save error. */ }
    finally { setBusy(false); }
  }
  return <form className="notebook-form" onSubmit={submit}>
    <label>{kind === "note" ? "Tiêu đề ghi chú" : "Từ hoặc cụm từ"}<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "note" ? "Ví dụ: Cách dùng Present Simple" : "Ví dụ: convenient"} /></label>
    {kind === "note" ? <label>Nội dung<textarea required maxLength={5000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Ghi lại điều bạn vừa học, mẹo nhớ, câu hỏi cần ôn…" /></label> : <><label>Nghĩa tiếng Việt<input required maxLength={200} value={meaningVi} onChange={(event) => setMeaningVi(event.target.value)} placeholder="thuận tiện" /></label><label>Câu ví dụ<input maxLength={500} value={example} onChange={(event) => setExample(event.target.value)} placeholder="Online lessons are convenient." /></label></>}
    <p className="notebook-source">{entry?.sourcePath ? "📍 Giữ liên kết tới trang nguồn" : pathname === "/app/notebook" ? "📍 Ghi trực tiếp trong sổ tay" : "📍 Tự gắn nguồn từ trang bạn đang xem"}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="button primary" disabled={busy}>{busy ? "Đang lưu…" : entry ? "Lưu thay đổi" : kind === "note" ? "Lưu ghi chú" : "Lưu từ mới"}</button>
  </form>;
}

export function NotebookWidget() {
  const pathname = usePathname();
  const { entries, visits, ready } = useNotebook();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<QuickTab>("note");
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open]);
  useEffect(() => { if (!open) return; const handle = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle); }, [open]);
  useEffect(() => { void Promise.resolve().then(() => setOpen(false)); }, [pathname]);
  const recent = [
    ...entries.map((entry) => ({ id: entry.id, title: entry.kind === "word" ? `Từ mới: ${entry.title}` : entry.title, date: entry.createdAt, icon: entry.kind === "word" ? "🔤" : "📝" })),
    ...visits.map((visit) => ({ id: visit.id, title: visit.title, date: visit.visitedAt, icon: "📖" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return <>
    <button type="button" className="notebook-bubble" aria-label="Mở sổ tay nhanh" aria-expanded={open} onClick={() => setOpen(true)}><MessageCircleMore size={27} /><span>Sổ tay</span></button>
    {open && <><button type="button" className="notebook-backdrop" aria-label="Đóng sổ tay" onClick={() => setOpen(false)} /><aside className="notebook-drawer" role="dialog" aria-modal="true" aria-label="Sổ tay nhanh">
      <header className="notebook-drawer-head"><div><span className="eyebrow">CÔNG CỤ HỌC NHANH</span><h2>📒 Sổ tay của bạn</h2><p>Ghi lại ngay, xem lại bất cứ lúc nào.</p></div><button ref={closeButton} type="button" className="icon-button" aria-label="Đóng sổ tay" onClick={() => setOpen(false)}><X size={20} /></button></header>
      <div className="notebook-quick-tabs" role="tablist" aria-label="Công cụ sổ tay"><button type="button" role="tab" aria-selected={tab === "note"} className={tab === "note" ? "active" : ""} onClick={() => setTab("note")}>📝 Ghi chú</button><button type="button" role="tab" aria-selected={tab === "word"} className={tab === "word" ? "active" : ""} onClick={() => setTab("word")}>🔤 Từ mới</button><button type="button" role="tab" aria-selected={tab === "recent"} className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>🕘 Gần đây</button></div>
      <div className="notebook-drawer-body">{!ready ? <p>Đang mở sổ tay…</p> : tab === "recent" ? <div className="notebook-recent">{recent.length ? recent.map((item) => <div key={item.id}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{when(item.date)}</small></div></div>) : <p>Chưa có hoạt động. Mở một bài học hoặc lưu ghi chú đầu tiên.</p>}</div> : <QuickForm key={tab} kind={tab} onSaved={() => setTab("recent")} />}</div>
      <footer><Link href="/app/notebook" onClick={() => setOpen(false)}>Mở sổ tay đầy đủ →</Link></footer>
    </aside></>}
  </>;
}

type TimelineItem = { id: string; type: "note" | "word" | "visit" | "attempt"; title: string; detail: string; date: string; source?: string; entry?: NotebookEntry };

export function NotebookPage() {
  const { entries, visits, ready, error, removeEntry } = useNotebook();
  const { attempts } = useDemo();
  const [filter, setFilter] = useState<"all" | TimelineItem["type"]>("all");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState("");
  const [showForm, setShowForm] = useState<"note" | "word" | null>(null);
  const [editing, setEditing] = useState<NotebookEntry | null>(null);
  const timeline: TimelineItem[] = [
    ...entries.map((entry) => ({ id: entry.id, type: entry.kind, title: entry.title, detail: entry.kind === "word" ? [entry.meaningVi, entry.example].filter(Boolean).join(" · ") : entry.body, date: entry.createdAt, source: entry.sourcePath, entry })),
    ...visits.map((visit) => ({ id: visit.id, type: "visit" as const, title: visit.title, detail: "Đã mở trang học", date: visit.visitedAt, source: visit.path })),
    ...attempts.map((attempt) => ({ id: attempt.id, type: "attempt" as const, title: attempt.lesson.replaceAll("-", " "), detail: `Bài luyện đã nộp · ${attempt.score}/${attempt.total} câu đúng`, date: attempt.submittedAt ?? `${attempt.date}T12:00:00`, source: `/app/lesson/${attempt.lesson}` })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const shown = timeline.filter((item) => (filter === "all" || item.type === filter) && `${item.title} ${item.detail}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  async function remove(id: string) {
    if (!window.confirm("Xóa mục này khỏi sổ tay?")) return;
    setDeleting(id);
    try { await removeEntry(id); } catch { /* The store displays the save error. */ }
    finally { setDeleting(""); }
  }
  function exportNotebook() {
    const file = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries, visits, attempts }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = "english-skill-lab-notebook.json"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="content-page notebook-page"><header className="notebook-page-hero"><span className="eyebrow">HÀNH TRÌNH CỦA BẠN</span><h1>📒 Sổ tay học tập</h1><p>Ghi chú, từ mới và lịch sử học nằm cùng một chỗ. Mục được lưu khi đang học có liên kết về trang nguồn.</p><div><button type="button" className="button primary" onClick={() => { setEditing(null); setShowForm("note"); }}><Plus size={16} /> Ghi chú mới</button><button type="button" className="button subtle" onClick={() => { setEditing(null); setShowForm("word"); }}><Plus size={16} /> Lưu từ mới</button><button type="button" className="button subtle" onClick={exportNotebook}>Xuất JSON</button></div></header>
    {showForm && <section className="card notebook-inline-form"><div className="section-head"><h2>{editing ? "Chỉnh sửa mục đã lưu" : showForm === "note" ? "Ghi chú mới" : "Lưu từ mới"}</h2><button type="button" className="icon-button" aria-label="Đóng biểu mẫu" onClick={() => { setEditing(null); setShowForm(null); }}><X size={18} /></button></div><QuickForm key={editing?.id ?? showForm} kind={showForm} entry={editing} onSaved={() => { setEditing(null); setShowForm(null); }} /></section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="card notebook-history"><div className="notebook-history-head"><div><h2>Dòng thời gian học tập</h2><p>{entries.length} mục đã lưu · {visits.length} lần mở trang học · {attempts.length} bài luyện</p></div><label className="notebook-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm trong sổ tay…" aria-label="Tìm trong sổ tay" /></label></div><div className="notebook-filters" aria-label="Lọc lịch sử">{(["all", "note", "word", "visit", "attempt"] as const).map((kind) => <button type="button" key={kind} className={filter === kind ? "active" : ""} onClick={() => setFilter(kind)}>{{ all: "Tất cả", note: "Ghi chú", word: "Từ vựng", visit: "Đã học", attempt: "Bài luyện" }[kind]}</button>)}</div>
    {!ready ? <p>Đang tải sổ tay…</p> : shown.length ? <div className="notebook-timeline">{shown.map((item) => <article key={`${item.type}-${item.id}`} className="notebook-timeline-item"><span className={`notebook-event-icon ${item.type}`}>{item.type === "word" ? "🔤" : item.type === "note" ? <NotebookPen size={20} /> : item.type === "visit" ? <BookOpenText size={20} /> : <Clock3 size={20} />}</span><div><small>{item.type === "word" ? "TỪ VỰNG" : item.type === "note" ? "GHI CHÚ" : item.type === "visit" ? "ĐÃ MỞ" : "BÀI LUYỆN"} · {item.type === "attempt" ? item.date.slice(0, 10) : when(item.date)}</small><h3>{item.title}</h3><p>{item.detail}</p>{item.source?.startsWith("/app/") && <Link href={item.source}>Mở trang nguồn →</Link>}</div>{item.entry && <div className="notebook-entry-actions"><button type="button" className="button subtle" onClick={() => { setEditing(item.entry!); setShowForm(item.entry!.kind); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Sửa</button><button type="button" className="button subtle" disabled={deleting === item.id} onClick={() => void remove(item.id)}>Xóa</button></div>}</article>)}</div> : <div className="notebook-empty"><BookOpenText size={38} /><h3>Chưa có mục phù hợp</h3><p>Hãy mở một bài học hoặc dùng nút nổi để ghi lại điều bạn muốn nhớ.</p></div>}
    </section>
  </div>;
}
