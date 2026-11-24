"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Check, Flag, GripVertical, MoreHorizontal, Play, Plus, Repeat, UserRoundCheck } from "lucide-react";
import { HeadIcon } from "@/components/ui/head-icon";
import { celebrate } from "@/lib/celebrate";
import { type Skill, type StudyTask, skillColors, todayISO } from "@/lib/demo-data";
import { lockedLearnerPath } from "@/lib/runtime";
import { addDay, dayLabel, lateDays, minutesLabel, minutesOf, overdueTasks, plannerSummary, tasksForDay } from "@/lib/planner/core";
import { lessonInfo } from "@/lib/planner/links";
import { useDemo } from "@/features/demo/demo-store";
import { TaskSheet } from "./task-sheet";
import "./planner.css";

/** Skill names stay as IELTS terms; only the two non-skill buckets read in Vietnamese. */
export function skillLabel(skill: Skill) {
  return skill === "Review" ? "Ôn tập" : skill === "Personal" ? "Cá nhân" : skill;
}
export const plannerSkills: Skill[] = ["Reading", "Listening", "Writing", "Speaking", "Vocabulary", "Grammar", "Review", "Personal"];

/** The page a task opens, or null when it links nowhere or that part of the app is not open yet. */
export function taskHref(lesson: string | undefined) {
  const href = lessonInfo(lesson)?.href;
  if (!href) return null;
  return lockedLearnerPath(href.split("?")[0]) ? null : href;
}
/** Whether a lesson kind can be offered to learners right now. */
export const lessonOpen = (lesson: string) => taskHref(lesson) !== null;

/** Tells every mounted store copy (and other tabs' listeners) that tasks changed. */
export function announcePlannerChange() {
  window.dispatchEvent(new Event("planner-tasks-changed"));
}

export type RowHandlers = {
  onToggle: (task: StudyTask, origin: HTMLElement) => void;
  onEdit: (task: StudyTask) => void;
  onMove: (task: StudyTask, day: string) => void;
  onDelete: (task: StudyTask) => void;
};

/**
 * One planner task. The title is the main tap target for linked work ("Bắt đầu" opens it);
 * secondary actions live in the ⋯ menu so they never crowd the row on a phone.
 */
export function TaskRow({ task, today, handlers, dragHandle, dragging = false, compact = false }: {
  task: StudyTask; today: string; handlers: RowHandlers;
  dragHandle?: React.ReactNode; dragging?: boolean; compact?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const href = taskHref(task.lesson);
  const late = !task.completed && task.date < today ? lateDays(task, today) : 0;
  const minutes = minutesOf(task);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [menu]);
  const act = (run: () => void) => () => { setMenu(false); run(); };
  return (
    <div className={`pl-row${task.completed ? " is-done" : ""}${late ? " is-late" : ""}${dragging ? " is-dragging" : ""}${compact ? " is-compact" : ""}`} data-task-id={task.id}>
      {dragHandle}
      <button type="button" className="pl-check" aria-pressed={task.completed}
        aria-label={`${task.completed ? "Bỏ đánh dấu xong" : "Đánh dấu xong"}: ${task.title}`}
        onClick={(event) => handlers.onToggle(task, event.currentTarget)}>
        <span>{task.completed && <Check size={14} strokeWidth={3} />}</span>
      </button>
      <div className="pl-row-body">
        {href && !task.completed ? <Link href={href} className="pl-row-title">{task.title}</Link> : <span className="pl-row-title">{task.title}</span>}
        <div className="pl-row-meta">
          <span className="pl-skill" style={{ "--skill": skillColors[task.skill] } as React.CSSProperties}>{skillLabel(task.skill)}</span>
          <span>~{minutesLabel(minutes)}</span>
          {task.time && <span><CalendarClock size={13} aria-hidden="true" /> {task.time}</span>}
          {task.priority === "High" && <span className="pl-flag"><Flag size={12} aria-hidden="true" /> Ưu tiên</span>}
          {task.assigned && <span className="pl-badge"><UserRoundCheck size={12} aria-hidden="true" /> Harry giao</span>}
          {task.seriesId && <span title="Việc lặp lại"><Repeat size={12} aria-label="Việc lặp lại" /></span>}
          {late > 0 && <span className="pl-late-tag"><AlertTriangle size={12} aria-hidden="true" /> Trễ {late} ngày</span>}
          {task.completed && lessonInfo(task.lesson)?.auto && <span className="pl-auto">Tự ghi nhận khi học xong</span>}
        </div>
      </div>
      {late > 0 && <button type="button" className="pl-row-quick" onClick={() => handlers.onMove(task, today)}>Dời sang hôm nay</button>}
      {href && !task.completed && !late && <Link href={href} className="pl-start" aria-label={`Bắt đầu: ${task.title}`}><Play size={13} fill="currentColor" aria-hidden="true" /><span>Bắt đầu</span></Link>}
      <div className="pl-menu-wrap" ref={menuRef}>
        <button type="button" className="pl-menu-button" aria-label={`Tuỳ chọn cho ${task.title}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <MoreHorizontal size={18} />
        </button>
        {menu && <div className="pl-menu" role="menu">
          <button type="button" role="menuitem" onClick={act(() => handlers.onEdit(task))}>Sửa</button>
          {task.date !== today && <button type="button" role="menuitem" onClick={act(() => handlers.onMove(task, today))}>Dời sang hôm nay</button>}
          <button type="button" role="menuitem" onClick={act(() => handlers.onMove(task, addDay(task.date < today ? today : task.date, 1)))}>{task.date <= today ? "Dời sang ngày mai" : "Lùi thêm 1 ngày"}</button>
          <button type="button" role="menuitem" className="is-danger" onClick={act(() => handlers.onDelete(task))}>Xoá</button>
        </div>}
      </div>
    </div>
  );
}

/** Drag handle: a real button so it can be focused and moved with the arrow keys. */
export function DragHandle({ label, onPointerDown, onKeyDown }: { label: string; onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void; onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void }) {
  return <button type="button" className="pl-grip" aria-label={`Kéo để sắp xếp: ${label}. Dùng phím mũi tên lên xuống để đổi chỗ`} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
    <GripVertical size={16} aria-hidden="true" />
  </button>;
}

export type ToastState = { message: string; action?: { label: string; run: () => void }; href?: { label: string; to: string } } | null;

/** One short status line at the bottom of the screen, with an optional Undo or link. */
export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => close.current(), toast.action ? 5200 : 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  if (!toast) return null;
  return <div className="pl-toast" role="status">
    <span>{toast.message}</span>
    {toast.action && <button type="button" onClick={() => { toast.action!.run(); onClose(); }}>{toast.action.label}</button>}
    {toast.href && <Link href={toast.href.to} onClick={onClose}>{toast.href.label}</Link>}
  </div>;
}

/**
 * Task actions shared by the Planner page and the Dashboard card: ticking a task (with a small
 * celebration), moving it, and deleting it with a five-second Undo before anything is removed.
 */
export function useTaskActions(setToast: (toast: ToastState) => void) {
  const { tasks, updateTask, deleteTask } = useDemo();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const pending = useRef(new Map<string, number>());
  const remove = useRef(deleteTask);
  useEffect(() => { remove.current = deleteTask; }, [deleteTask]);
  useEffect(() => {
    const timers = pending.current;
    // Leaving the page commits any delete still waiting for its Undo window.
    return () => { for (const [id, timer] of timers) { window.clearTimeout(timer); void remove.current(id).catch(() => {}); } timers.clear(); };
  }, []);
  const today = todayISO();
  const handlers: RowHandlers = {
    onToggle: (task, origin) => {
      const finishing = !task.completed;
      if (finishing) {
        const left = tasks.filter((item) => item.date === today && !item.completed && item.id !== task.id).length;
        celebrate(origin, { label: task.date === today && left === 0 ? "Xong kế hoạch hôm nay!" : "Xong!", pieces: left === 0 ? 40 : 18 });
      }
      void updateTask(task.id, { completed: finishing }).catch(() => {});
    },
    onEdit: () => {},
    onMove: (task, day) => {
      const from = task.date;
      void updateTask(task.id, { date: day }).then(() => setToast({
        message: `Đã dời sang ${dayLabel(day, today).toLowerCase()}`,
        action: { label: "Hoàn tác", run: () => void updateTask(task.id, { date: from }).catch(() => {}) },
      })).catch(() => {});
    },
    onDelete: (task) => {
      setHidden((current) => new Set(current).add(task.id));
      const timer = window.setTimeout(() => {
        pending.current.delete(task.id);
        void remove.current(task.id).catch(() => setHidden((current) => { const next = new Set(current); next.delete(task.id); return next; }));
      }, 5000);
      pending.current.set(task.id, timer);
      setToast({
        message: `Đã xoá “${task.title.slice(0, 40)}”`,
        action: { label: "Hoàn tác", run: () => {
          window.clearTimeout(pending.current.get(task.id));
          pending.current.delete(task.id);
          setHidden((current) => { const next = new Set(current); next.delete(task.id); return next; });
        } },
      });
    },
  };
  return { handlers, hidden, today };
}

/**
 * Dashboard card: everything the Planner wants the learner to see today in one place —
 * late tasks first, then today's, each with its "Bắt đầu" link, plus a one-tap add.
 */
export function TodayPlanCard() {
  const { tasks, ready } = useDemo();
  const [toast, setToast] = useState<ToastState>(null);
  const [sheet, setSheet] = useState<StudyTask | "new" | null>(null);
  const { handlers, hidden, today } = useTaskActions(setToast);
  const rowHandlers = { ...handlers, onEdit: (task: StudyTask) => setSheet(task) };
  const visible = tasks.filter((task) => !hidden.has(task.id));
  const late = overdueTasks(visible, today);
  const todays = tasksForDay(visible, today);
  const summary = plannerSummary(visible, today);
  const pct = summary.today.total ? Math.round((summary.today.done / summary.today.total) * 100) : 0;
  const shown = [...late.slice(0, 3), ...todays].slice(0, 6);
  return (
    <section className="card pl-today-card" aria-labelledby="pl-today-title">
      <div className="card-head">
        <div className="head-title">
          <HeadIcon icon={CalendarDays} tone="coral" />
          <div>
            <h2 id="pl-today-title">Hôm nay</h2>
            <p>{!ready ? "Đang tải kế hoạch…" : summary.today.total ? `${summary.today.done}/${summary.today.total} việc · ~${minutesLabel(summary.today.minutes)}` : "Chưa có việc nào cho hôm nay"}</p>
          </div>
        </div>
        <Link href="/app/planner" className="text-link">Mở kế hoạch <ArrowRight size={14} /></Link>
      </div>
      {summary.today.total > 0 && <div className="pl-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Tiến độ hôm nay"><i style={{ width: `${pct}%` }} /></div>}
      {late.length > 0 && <Link href="/app/planner#qua-han" className="pl-late-banner"><AlertTriangle size={15} aria-hidden="true" /> {late.length} việc trễ hạn — xem và dời sang hôm nay</Link>}
      {shown.length ? <div className="pl-list">{shown.map((task) => <TaskRow key={task.id} task={task} today={today} handlers={rowHandlers} compact />)}</div>
        : ready && <p className="pl-empty-inline">Thêm một việc nhỏ, hoặc mở kế hoạch để dùng gợi ý cho hôm nay.</p>}
      <button type="button" className="button subtle wide pl-add-inline" onClick={() => setSheet("new")}><Plus size={17} /> Thêm việc cho hôm nay</button>
      {sheet && <TaskSheet task={sheet === "new" ? undefined : sheet} defaultDate={today} onClose={() => setSheet(null)} onDone={(message) => setToast({ message, href: { label: "Xem kế hoạch", to: "/app/planner" } })} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </section>
  );
}
