"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Play, Plus, Target } from "lucide-react";
import { type StudyTask, skillColors } from "@/lib/demo-data";
import { addDay, addMonths, dayLabel, minutesLabel, minutesOf, monthGrid, monthLabel, tasksForDay, weekOfDay, weekRangeLabel, weekdayName, weekdayShort } from "@/lib/planner/core";
import { TaskRow, skillLabel, taskHref, type RowHandlers } from "./planner-widgets";

export type CalendarMode = "month" | "week";

const CHIPS_PER_DAY = 3;
const skillStyle = (task: StudyTask) => ({ "--skill": skillColors[task.skill] }) as React.CSSProperties;

/**
 * The planner as a calendar. Month: a grid of days with one coloured chip per task (skill colour),
 * the selected day's full list underneath. Week: seven columns of task cards. Tasks are dragged
 * between days on a pointer device; on touch screens and keyboards the day list and each task's
 * menu move them instead.
 */
export function CalendarView({ tasks, today, selected, onSelect, mode, onMode, handlers, onAdd, examDate }: {
  tasks: StudyTask[]; today: string; selected: string; onSelect: (day: string) => void;
  mode: CalendarMode; onMode: (mode: CalendarMode) => void; handlers: RowHandlers;
  onAdd: (day: string) => void; examDate?: string | null;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, StudyTask[]>();
    for (const task of tasks) map.set(task.date, [...(map.get(task.date) ?? []), task]);
    for (const [day, list] of map) map.set(day, tasksForDay(list, day));
    return map;
  }, [tasks]);

  const days = mode === "month" ? monthGrid(selected) : weekOfDay(selected);
  const month = selected.slice(0, 7);
  const showsToday = days.includes(today) && (mode === "week" || today.slice(0, 7) === month);
  const skillsShown = [...new Set(days.flatMap((day) => (byDay.get(day) ?? []).map((task) => task.skill)))];

  function step(direction: 1 | -1) {
    if (mode === "week") return onSelect(addDay(selected, 7 * direction));
    const first = addMonths(selected, direction);
    onSelect(first.slice(0, 7) === today.slice(0, 7) ? today : first);
  }

  const dropTarget = (day: string) => ({
    "data-drop-day": day,
    onDragOver: (event: React.DragEvent) => {
      if (!dragId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      if (dropDay !== day) setDropDay(day);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const task = tasks.find((item) => item.id === dragId);
      setDragId(null);
      setDropDay(null);
      if (task && task.date !== day) handlers.onMove(task, day);
    },
  });
  const draggable = (task: StudyTask) => task.completed ? {} : {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      // Firefox only starts a drag that carries data.
      if (event.dataTransfer) {
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
      }
      setDragId(task.id);
    },
    onDragEnd: () => { setDragId(null); setDropDay(null); },
  };
  const dayClass = (day: string, list: StudyTask[]) => [
    day === today && "is-today",
    day < today && "is-past",
    day === selected && "is-selected",
    day === dropDay && "is-drop",
    day === examDate && "is-exam",
    day < today && list.some((task) => !task.completed) && "is-late",
  ].filter(Boolean).join(" ");
  const plannedMinutes = (list: StudyTask[]) => list.reduce((total, task) => total + minutesOf(task), 0);

  const selectedList = byDay.get(selected) ?? [];

  return (
    <div className={`pl-cal is-${mode}${dragId ? " is-dragging" : ""}`}>
      <div className="pl-cal-head">
        <div className="pl-cal-nav">
          <button type="button" className="icon-button" aria-label={mode === "month" ? "Tháng trước" : "Tuần trước"} onClick={() => step(-1)}><ChevronLeft size={18} /></button>
          <h3 aria-live="polite">{mode === "month" ? monthLabel(selected) : weekRangeLabel(selected)}</h3>
          <button type="button" className="icon-button" aria-label={mode === "month" ? "Tháng sau" : "Tuần sau"} onClick={() => step(1)}><ChevronRight size={18} /></button>
          {!showsToday && <button type="button" className="button subtle pl-small-button" onClick={() => onSelect(today)}>Hôm nay</button>}
        </div>
        <div className="pl-view-switch pl-cal-mode" role="tablist" aria-label="Kiểu lịch">
          <button type="button" role="tab" aria-selected={mode === "week"} onClick={() => onMode("week")}>Tuần</button>
          <button type="button" role="tab" aria-selected={mode === "month"} onClick={() => onMode("month")}>Tháng</button>
        </div>
      </div>

      {mode === "month" ? <>
        <div className="pl-cal-grid" role="group" aria-label={`Lịch ${monthLabel(selected)}`}>
          <div className="pl-cal-weekdays" aria-hidden="true">
            {weekdayShort.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="pl-cal-cells">
            {days.map((day) => {
              const list = byDay.get(day) ?? [];
              const minutes = plannedMinutes(list);
              const outside = day.slice(0, 7) !== month;
              return (
                <div key={day} {...dropTarget(day)}
                  className={`pl-cal-cell ${dayClass(day, list)}${outside ? " is-outside" : ""}`}
                  onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a")) onSelect(day); }}>
                  <div className="pl-cal-cell-top">
                    <button type="button" className="pl-cal-date" aria-pressed={day === selected}
                      aria-label={`${dayLabel(day, today)}: ${list.length ? `${list.length} việc` : "chưa có việc"}`} onClick={() => onSelect(day)}>
                      {Number(day.slice(8, 10))}
                    </button>
                    {day === examDate && <span className="pl-cal-exam"><Target size={11} aria-hidden="true" /> Thi</span>}
                    {day >= today && <button type="button" className="pl-cal-add" aria-label={`Thêm việc cho ${weekdayName(day, today)}`} onClick={() => onAdd(day)}><Plus size={14} /></button>}
                  </div>
                  <div className="pl-cal-chips">
                    {list.slice(0, CHIPS_PER_DAY).map((task) => (
                      <button key={task.id} type="button" className={`pl-cal-chip${task.completed ? " is-done" : ""}${dragId === task.id ? " is-dragged" : ""}`}
                        style={skillStyle(task)} {...draggable(task)} onClick={() => handlers.onEdit(task)}
                        title={`${task.title} · ${skillLabel(task.skill)} · ~${minutesLabel(minutesOf(task))}`}>
                        {task.time && <b>{task.time}</b>}<span>{task.title}</span>
                      </button>
                    ))}
                    {list.length > CHIPS_PER_DAY && <button type="button" className="pl-cal-more" onClick={() => onSelect(day)}>+{list.length - CHIPS_PER_DAY} việc</button>}
                  </div>
                  {list.length > 0 && <span className="pl-cal-dots" aria-hidden="true">
                    {list.slice(0, 4).map((task) => <i key={task.id} className={task.completed ? "is-done" : ""} style={skillStyle(task)} />)}
                  </span>}
                  {minutes > 0 && <span className="pl-cal-minutes">{minutesLabel(minutes)}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="pl-cal-day" aria-live="polite">
          <div className="pl-day-head">
            <h2>{dayLabel(selected, today)}</h2>
            <span>{selectedList.length ? `${selectedList.filter((task) => task.completed).length}/${selectedList.length} xong · ~${minutesLabel(plannedMinutes(selectedList))}` : ""}</span>
          </div>
          {selectedList.length
            ? <div className="pl-list">{selectedList.map((task) => <TaskRow key={task.id} task={task} today={today} handlers={handlers} />)}</div>
            : <div className="pl-empty">{selected < today ? "Ngày này không có việc nào." : `Chưa có việc cho ${weekdayName(selected, today)}.`}</div>}
          {selected >= today && <button type="button" className="button subtle pl-small-button pl-cal-day-add" onClick={() => onAdd(selected)}>
            <Plus size={16} /> Thêm việc cho {weekdayName(selected, today)}
          </button>}
        </div>
      </> : (
        <div className="pl-cal-week" role="list" aria-label={`Tuần ${weekRangeLabel(selected)}`}>
          {days.map((day, index) => {
            const list = byDay.get(day) ?? [];
            const minutes = plannedMinutes(list);
            return (
              <section key={day} role="listitem" {...dropTarget(day)} className={`pl-cal-col ${dayClass(day, list)}`} aria-label={`${dayLabel(day, today)}: ${list.length} việc`}>
                <header>
                  <button type="button" className="pl-cal-colhead" aria-pressed={day === selected} onClick={() => onSelect(day)}>
                    <small>{weekdayShort[index]}</small><strong>{Number(day.slice(8, 10))}</strong>
                  </button>
                  {day === examDate && <span className="pl-cal-exam"><Target size={11} aria-hidden="true" /> Thi</span>}
                  {minutes > 0 && <span className="pl-cal-minutes">{minutesLabel(minutes)}</span>}
                </header>
                <div className="pl-cal-cards">
                  {list.map((task) => <WeekCard key={task.id} task={task} today={today} handlers={handlers} dragged={dragId === task.id} drag={draggable(task)} />)}
                  {!list.length && <span className="pl-cal-none">{day < today ? "—" : "Trống"}</span>}
                </div>
                {day >= today && <button type="button" className="pl-cal-add-row" onClick={() => onAdd(day)} aria-label={`Thêm việc cho ${weekdayName(day, today)}`}><Plus size={14} /> Thêm</button>}
              </section>
            );
          })}
        </div>
      )}

      {skillsShown.length > 0 && <div className="pl-cal-legend" aria-label="Màu theo kỹ năng">
        {skillsShown.map((skill) => <span key={skill} className="pl-skill" style={{ "--skill": skillColors[skill] } as React.CSSProperties}>{skillLabel(skill)}</span>)}
        <small>Kéo thả việc sang ngày khác để dời lịch.</small>
      </div>}
    </div>
  );
}

function WeekCard({ task, today, handlers, dragged, drag }: {
  task: StudyTask; today: string; handlers: RowHandlers; dragged: boolean; drag: React.HTMLAttributes<HTMLElement> & { draggable?: boolean };
}) {
  const href = taskHref(task.lesson);
  const late = !task.completed && task.date < today;
  return (
    <article className={`pl-cal-card${task.completed ? " is-done" : ""}${late ? " is-late" : ""}${dragged ? " is-dragged" : ""}`} style={skillStyle(task)} {...drag}>
      <button type="button" className="pl-check" aria-pressed={task.completed}
        aria-label={`${task.completed ? "Bỏ đánh dấu xong" : "Đánh dấu xong"}: ${task.title}`}
        onClick={(event) => handlers.onToggle(task, event.currentTarget)}>
        <span>{task.completed && <Check size={12} strokeWidth={3} />}</span>
      </button>
      <button type="button" className="pl-cal-card-title" onClick={() => handlers.onEdit(task)} aria-label={`Sửa: ${task.title}`}>
        {task.time && <><b>{task.time}</b>{" "}</>}{task.title}
      </button>
      <span className="pl-cal-card-meta">{skillLabel(task.skill)} · ~{minutesLabel(minutesOf(task))}</span>
      {href && !task.completed && <Link href={href} className="pl-cal-start" aria-label={`Bắt đầu: ${task.title}`}><Play size={11} fill="currentColor" aria-hidden="true" /> Bắt đầu</Link>}
    </article>
  );
}
