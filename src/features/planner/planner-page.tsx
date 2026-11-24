"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, ListChecks, Plus, Sparkles, Target, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { HeadIcon } from "@/components/ui/head-icon";
import { type Skill, type StudyTask, skillColors } from "@/lib/demo-data";
import { viDate } from "@/lib/format-date";
import { addDay, byDayOrder, dayCounts, dayLabel, daysBetween, inferSkill, minutesLabel, minutesOf, overdueTasks, plannerSummary, shortDate, tasksForDay, weekOfDay, weekRangeLabel, weekdayName, weekdayShort } from "@/lib/planner/core";
import { buildSuggestions, focusSkills, generateWeekPlan, type TaskDraft } from "@/lib/planner/suggest";
import { useDemo } from "@/features/demo/demo-store";
import { DragHandle, TaskRow, Toast, lessonOpen, plannerSkills, skillLabel, useTaskActions, type RowHandlers, type ToastState } from "./planner-widgets";
import { TaskSheet } from "./task-sheet";
import { usePlannerSignals } from "./use-planner-signals";

type View = "day" | "all";

export function PlannerPage() {
  const { tasks, ready, addTask, addTasks, updateTask, reorderDay, refreshTasks } = useDemo();
  const [toast, setToast] = useState<ToastState>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const { handlers, hidden, today } = useTaskActions(setToast);
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<View>("day");
  const [sheet, setSheet] = useState<{ task?: StudyTask; date: string } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(true);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const signals = usePlannerSignals(today);

  // A task finished elsewhere is ticked by the database; read the list again when the page opens.
  useEffect(() => { void refreshTasks(); }, [refreshTasks]);

  const visible = useMemo(() => tasks.filter((task) => !hidden.has(task.id)), [tasks, hidden]);
  const summary = plannerSummary(visible, today);
  const late = overdueTasks(visible, today);
  const week = weekOfDay(selected);
  const counts = dayCounts(visible, week);
  const dayList = tasksForDay(visible, selected);
  const rowHandlers: RowHandlers = { ...handlers, onEdit: (task) => setSheet({ task, date: task.date }) };
  const examLeft = signals.examDate ? daysBetween(today, signals.examDate) : null;

  async function moveAllLate() {
    const ids = late.map((task) => task.id);
    for (const id of ids) await updateTask(id, { date: today }).catch(() => {});
    setSelected(today);
    setToast({ message: `Đã dời ${ids.length} việc sang hôm nay` });
  }

  function addDraft(draft: TaskDraft) {
    void addTask({ ...draft, time: "", completed: false, priority: draft.priority ?? "Medium" })
      .then(() => setToast({ message: `Đã thêm “${draft.title}” vào ${dayLabel(draft.date, today).toLowerCase()}` }))
      .catch(() => {});
  }

  const description = examLeft !== null && examLeft >= 0
    ? <>Còn <b>{examLeft} ngày</b> tới kỳ thi ({viDate(signals.examDate!)}). Mỗi ngày một ít, đều đặn là đủ.</>
    : <>Biết việc hôm nay, học đúng bài, tự ghi nhận khi học xong. <Link href="/app/progress">Đặt ngày thi</Link> để xem đếm ngược.</>;

  return (
    <div className="content-page planner-page pl-page">
      <PageHeader
        title="Kế hoạch học"
        description={description}
        sticker="calendar"
        actions={<>
          <button type="button" className="button subtle pl-plan-button" onClick={() => setPlanOpen(true)}><Sparkles size={17} /> Lập kế hoạch tuần</button>
          <button type="button" className="button primary" onClick={() => setSheet({ date: selected < today ? today : selected })}><Plus size={18} /> Thêm việc</button>
        </>}
      />

      <div className="pl-stats" role="group" aria-label="Tóm tắt kế hoạch">
        <button type="button" className={`pl-stat${view === "day" && selected === today ? " is-on" : ""}`} onClick={() => { setView("day"); setSelected(today); }}>
          <small>Hôm nay</small><strong>{summary.today.done}/{summary.today.total}</strong><span>{summary.today.total ? `~${minutesLabel(summary.today.minutes)}` : "chưa có việc"}</span>
        </button>
        <button type="button" className="pl-stat" onClick={() => { setView("day"); setSelected(today); }}>
          <small>Tuần này</small><strong>{summary.week.done}/{summary.week.total}</strong>
          <span className="pl-stat-bar" aria-hidden="true"><i style={{ width: `${summary.week.total ? Math.round((summary.week.done / summary.week.total) * 100) : 0}%` }} /></span>
        </button>
        <a href="#qua-han" className={`pl-stat${summary.overdue ? " is-alert" : ""}`} onClick={() => setLateOpen(true)} aria-disabled={!summary.overdue}>
          <small>Quá hạn</small><strong>{summary.overdue}</strong><span>{summary.overdue ? "cần dời hoặc xoá" : "không có việc trễ"}</span>
        </a>
      </div>

      {ready && !visible.length && <section className="card pl-onboard">
        <HeadIcon icon={Target} tone="coral" />
        <div>
          <h2>Bắt đầu kế hoạch đầu tiên</h2>
          <p>Để app đề xuất một tuần học theo thời gian rảnh và kỹ năng bạn muốn lên band, hoặc tự thêm từng việc.</p>
        </div>
        <div className="pl-onboard-actions">
          <button type="button" className="button primary" onClick={() => setPlanOpen(true)}><Sparkles size={17} /> Lập kế hoạch tuần</button>
          <button type="button" className="button subtle" onClick={() => setSheet({ date: today })}><Plus size={17} /> Thêm một việc</button>
        </div>
      </section>}

      <div className="pl-layout">
        <div className="pl-main">
          {late.length > 0 && <section id="qua-han" className="card pl-late" aria-labelledby="pl-late-title">
            <div className="pl-section-head">
              <button type="button" className="pl-collapse" aria-expanded={lateOpen} onClick={() => setLateOpen(!lateOpen)}>
                <AlertTriangle size={17} aria-hidden="true" /><h2 id="pl-late-title">Quá hạn ({late.length})</h2><ChevronDown size={16} aria-hidden="true" />
              </button>
              <button type="button" className="button subtle pl-small-button" onClick={() => void moveAllLate()}>Dời tất cả sang hôm nay</button>
            </div>
            {lateOpen && <div className="pl-list">{late.map((task) => <TaskRow key={task.id} task={task} today={today} handlers={rowHandlers} />)}</div>}
          </section>}

          <section className="card pl-board" aria-label="Lịch học">
            <div className="pl-board-head">
              <div className="pl-view-switch" role="tablist" aria-label="Cách xem">
                <button type="button" role="tab" aria-selected={view === "day"} onClick={() => setView("day")}><CalendarRange size={15} aria-hidden="true" /> Theo ngày</button>
                <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")}><ListChecks size={15} aria-hidden="true" /> Tất cả việc</button>
              </div>
              {view === "day" && <div className="pl-week-nav">
                <button type="button" className="icon-button" aria-label="Tuần trước" onClick={() => setSelected(addDay(selected, -7))}><ChevronLeft size={18} /></button>
                <span>{weekRangeLabel(selected)}</span>
                <button type="button" className="icon-button" aria-label="Tuần sau" onClick={() => setSelected(addDay(selected, 7))}><ChevronRight size={18} /></button>
                {!week.includes(today) && <button type="button" className="button subtle pl-small-button" onClick={() => setSelected(today)}>Tuần này</button>}
              </div>}
            </div>

            {view === "day" ? <>
              <div className="pl-week" role="tablist" aria-label="Chọn ngày">
                {week.map((day, index) => {
                  const count = counts.get(day)!;
                  const pct = count.total ? count.done / count.total : 0;
                  return <button key={day} type="button" role="tab" aria-selected={selected === day} data-drop-day={day}
                    className={`pl-day${day === today ? " is-today" : ""}${day < today ? " is-past" : ""}${hoverDay === day ? " is-drop" : ""}`}
                    onClick={() => setSelected(day)} aria-label={`${dayLabel(day, today)}: ${count.total} việc, xong ${count.done}`}>
                    <small>{weekdayShort[index]}</small>
                    <strong>{shortDate(day)}</strong>
                    <span className="pl-day-dots" aria-hidden="true">{count.total ? <i style={{ "--pct": `${Math.round(pct * 100)}%` } as React.CSSProperties}>{count.total}</i> : <em>·</em>}</span>
                  </button>;
                })}
              </div>

              <div className="pl-day-head">
                <h2>{dayLabel(selected, today)}</h2>
                <span>{dayList.length ? `${dayList.filter((task) => task.completed).length}/${dayList.length} xong · ~${minutesLabel(dayList.reduce((total, task) => total + minutesOf(task), 0))}` : ""}</span>
              </div>
              <DayList key={selected} day={selected} today={today} tasks={dayList} handlers={rowHandlers}
                onReorder={(ids) => void reorderDay(ids).catch(() => setToast({ message: "Chưa lưu được thứ tự mới" }))}
                onMoveDay={(task, day) => handlers.onMove(task, day)} onHoverDay={setHoverDay} />
              {!dayList.length && <div className="pl-empty">
                {selected < today ? "Ngày này không có việc nào." : late.length && selected === today
                  ? <>Hôm nay chưa có việc. Bạn còn <a href="#qua-han">{late.length} việc trễ hạn</a> — dời sang hôm nay hoặc chọn một gợi ý bên cạnh.</>
                  : <>Chưa có việc cho {weekdayName(selected, today)}. Thêm một việc nhỏ, hoặc dùng gợi ý.</>}
              </div>}
              {selected >= today && <QuickAdd day={selected} today={today} onAdd={(title) => {
                const skill = inferSkill(title);
                return addTask({ title, skill, date: selected, time: "", completed: false, priority: "Medium", source: "manual", duration: 20 })
                  .then(() => setToast({ message: `Đã thêm vào ${dayLabel(selected, today).toLowerCase()} · kỹ năng ${skillLabel(skill)}` }));
              }} onMore={() => setSheet({ date: selected })} />}
            </> : <AllTasks tasks={visible} today={today} handlers={rowHandlers} />}
          </section>
        </div>

        <aside className="pl-side">
          <Suggestions today={today} day={selected >= today ? selected : today} tasks={visible} signals={signals} onAdd={addDraft} />
          <WeekBySkill tasks={visible} day={selected} />
          {!planOpen && visible.length > 0 && <button type="button" className="card pl-plan-card" onClick={() => setPlanOpen(true)}>
            <Sparkles size={18} aria-hidden="true" /><span><b>Lập kế hoạch tuần tự động</b><small>Theo thời gian rảnh, ngày thi và kỹ năng cần lên band</small></span><ChevronRight size={16} aria-hidden="true" />
          </button>}
        </aside>
      </div>

      {sheet && <TaskSheet task={sheet.task} defaultDate={sheet.date} onClose={() => setSheet(null)} onDone={(message) => setToast({ message })} />}
      {planOpen && <WeekPlanDialog today={today} weekOf={selected < today ? today : selected} signals={signals} onClose={() => setPlanOpen(false)}
        onSave={async (drafts) => {
          const made = await addTasks(drafts.map((draft) => ({ ...draft, time: "", completed: false, priority: draft.priority ?? "Medium" })));
          setPlanOpen(false);
          if (drafts.length) setSelected(drafts[0].date);
          setToast({ message: made.length ? `Đã thêm ${made.length} việc vào kế hoạch` : "Các việc này đã có trong kế hoạch" });
        }} />}
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}

/** Today's open tasks in the learner's order, draggable by the grip (mouse, touch or arrow keys); done ones below. */
function DayList({ day, today, tasks, handlers, onReorder, onMoveDay, onHoverDay }: {
  day: string; today: string; tasks: StudyTask[]; handlers: RowHandlers;
  onReorder: (ids: string[]) => void; onMoveDay: (task: StudyTask, day: string) => void; onHoverDay: (day: string | null) => void;
}) {
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);
  const [showDone, setShowDone] = useState(true);
  const [drag, setDrag] = useState<{ id: string; dy: number; over: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!refocus.current) return;
    list.current?.querySelector<HTMLElement>(`[data-task-id="${refocus.current}"] .pl-grip`)?.focus();
    refocus.current = null;
  });

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, task: StudyTask) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const rows = [...(list.current?.querySelectorAll<HTMLElement>("[data-open-row]") ?? [])].map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.taskId!, middle: rect.top + rect.height / 2 };
    });
    const from = open.findIndex((item) => item.id === task.id);
    const startY = event.clientY;
    let state = { id: task.id, dy: 0, over: from, dropDay: null as string | null };
    setDrag({ id: task.id, dy: 0, over: from });
    const move = (moveEvent: PointerEvent) => {
      const others = rows.filter((row) => row.id !== task.id);
      const over = others.filter((row) => row.middle < moveEvent.clientY).length;
      // The dragged row sits under the pointer, so look through every layer for a day in the week strip.
      const target = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY)
        .find((node): node is HTMLElement => node instanceof HTMLElement && Boolean(node.dataset.dropDay))?.dataset.dropDay ?? null;
      state = { id: task.id, dy: moveEvent.clientY - startY, over, dropDay: target && target !== day ? target : null };
      setDrag({ id: state.id, dy: state.dy, over: state.over });
      onHoverDay(state.dropDay);
    };
    const finish = (commit: boolean) => () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      setDrag(null);
      onHoverDay(null);
      if (!commit) return;
      if (state.dropDay) { onMoveDay(task, state.dropDay); return; }
      if (state.over === from) return;
      const ids = open.map((item) => item.id).filter((id) => id !== task.id);
      ids.splice(state.over, 0, task.id);
      onReorder(ids);
    };
    const up = finish(true), cancel = finish(false);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
  }

  function keyMove(event: React.KeyboardEvent<HTMLButtonElement>, task: StudyTask) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const from = open.findIndex((item) => item.id === task.id);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= open.length) return;
    const ids = open.map((item) => item.id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    refocus.current = task.id;
    setAnnounce(`Đã chuyển “${task.title}” tới vị trí ${to + 1} trên ${open.length}`);
    onReorder(ids);
  }

  if (!tasks.length) return null;
  return <div className="pl-list" ref={list}>
    {open.map((task, index) => {
      const dragging = drag?.id === task.id;
      const othersBefore = drag ? open.filter((item) => item.id !== drag.id).findIndex((item) => item.id === task.id) : -1;
      return <div key={task.id} data-open-row="" data-task-id={task.id}
        className={`pl-drag-slot${drag && !dragging && othersBefore === drag.over ? " drop-before" : ""}${drag && !dragging && othersBefore === open.length - 2 && drag.over === open.length - 1 && drag.over !== open.findIndex((item) => item.id === drag.id) ? " drop-after" : ""}`}
        style={dragging ? { transform: `translateY(${drag.dy}px)`, zIndex: 5, position: "relative" } : undefined}>
        <TaskRow task={task} today={today} handlers={handlers} dragging={dragging}
          dragHandle={open.length > 1 || day >= today ? <DragHandle label={task.title} onPointerDown={(event) => startDrag(event, task)} onKeyDown={(event) => keyMove(event, task)} /> : undefined} />
        {index === open.length - 1 && <span className="sr-only" aria-live="polite">{announce}</span>}
      </div>;
    })}
    {done.length > 0 && <>
      <button type="button" className="pl-done-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
        {showDone ? "Ẩn" : "Hiện"} {done.length} việc đã xong <ChevronDown size={14} aria-hidden="true" />
      </button>
      {showDone && done.map((task) => <TaskRow key={task.id} task={task} today={today} handlers={handlers} />)}
    </>}
    {drag && <p className="pl-drag-hint" aria-hidden="true">Thả lên một ngày ở dải tuần để dời việc sang ngày đó</p>}
  </div>;
}

/** Type a title, press Enter: the fastest way to jot a task, with the skill guessed from the words. */
function QuickAdd({ day, today, onAdd, onMore }: { day: string; today: string; onAdd: (title: string) => Promise<void>; onMore: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const title = value.trim().slice(0, 100);
    if (!title || busy) return;
    setBusy(true);
    try { await onAdd(title); setValue(""); } catch { /* the store shows the error */ } finally { setBusy(false); }
  }
  return <form className="pl-quick" onSubmit={(event) => void submit(event)}>
    <Plus size={17} aria-hidden="true" />
    <input value={value} onChange={(event) => setValue(event.target.value)} maxLength={100} placeholder={`Thêm nhanh việc cho ${weekdayName(day, today)}… (Enter để lưu)`} aria-label={`Thêm nhanh việc cho ${weekdayName(day, today)}`} />
    {value.trim() ? <button type="submit" className="button primary pl-small-button" disabled={busy}>Thêm</button>
      : <button type="button" className="button subtle pl-small-button" onClick={onMore}>Chọn bài…</button>}
  </form>;
}

/** Every task from today on, grouped by day, with a skill filter; finished ones on request. */
function AllTasks({ tasks, today, handlers }: { tasks: StudyTask[]; today: string; handlers: RowHandlers }) {
  const [skill, setSkill] = useState<Skill | "all">("all");
  const [showDone, setShowDone] = useState(false);
  const shown = tasks.filter((task) => (skill === "all" || task.skill === skill) && (showDone ? task.date >= addDay(today, -30) : !task.completed && task.date >= today)).sort(byDayOrder);
  const groups = new Map<string, StudyTask[]>();
  for (const task of shown) groups.set(task.date, [...(groups.get(task.date) ?? []), task]);
  const used = plannerSkills.filter((item) => tasks.some((task) => task.skill === item));
  return <div className="pl-all">
    <div className="pl-all-tools">
      <div className="pl-chips" role="group" aria-label="Lọc theo kỹ năng">
        <button type="button" className={`pl-chip${skill === "all" ? " is-on" : ""}`} aria-pressed={skill === "all"} onClick={() => setSkill("all")}>Tất cả</button>
        {used.map((item) => <button key={item} type="button" className={`pl-chip pl-skill-chip${skill === item ? " is-on" : ""}`} aria-pressed={skill === item} style={{ "--skill": skillColors[item] } as React.CSSProperties} onClick={() => setSkill(item)}>{skillLabel(item)}</button>)}
      </div>
      <label className="pl-toggle"><input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} /> Gồm việc đã xong (30 ngày gần nhất)</label>
    </div>
    {groups.size ? [...groups].map(([day, list]) => <div key={day} className="pl-group">
      <h3>{dayLabel(day, today)} <small>{viDate(day)}</small></h3>
      <div className="pl-list">{list.map((task) => <TaskRow key={task.id} task={task} today={today} handlers={handlers} />)}</div>
    </div>) : <div className="pl-empty">Không có việc nào {skill === "all" ? "sắp tới" : `cho ${skillLabel(skill)}`}. Việc trễ hạn nằm ở khối Quá hạn phía trên.</div>}
  </div>;
}

function Suggestions({ today, day, tasks, signals, onAdd }: {
  today: string; day: string; tasks: StudyTask[]; signals: ReturnType<typeof usePlannerSignals>; onAdd: (draft: TaskDraft) => void;
}) {
  const list = buildSuggestions({ today: day, tasks, vocabDue: signals.vocabDue, weakType: signals.weakType, examDate: signals.examDate, available: lessonOpen });
  return <section className="card pl-suggest" aria-labelledby="pl-suggest-title">
    <div className="pl-section-head"><HeadIcon icon={Lightbulb} tone="sun" /><h2 id="pl-suggest-title">Gợi ý cho {day === today ? "hôm nay" : weekdayName(day, today)}</h2></div>
    {list.length ? <ul>{list.map((item) => <li key={item.id}>
      <span><b>{item.title}</b><small>{item.reason} · ~{minutesLabel(item.duration ?? 15)}</small></span>
      <button type="button" className="button subtle pl-small-button" onClick={() => onAdd({ ...item, date: day })} aria-label={`Thêm ${item.title}`}><Plus size={15} /> Thêm</button>
    </li>)}</ul> : <p className="pl-hint">Bạn đã có đủ việc cho ngày này rồi.</p>}
  </section>;
}

/** Planned minutes per skill this week, so a week that is all Reading is easy to spot. */
function WeekBySkill({ tasks, day }: { tasks: StudyTask[]; day: string }) {
  const week = new Set(weekOfDay(day));
  const rows = plannerSkills.map((skill) => {
    const list = tasks.filter((task) => week.has(task.date) && task.skill === skill);
    return { skill, planned: list.reduce((total, task) => total + minutesOf(task), 0), done: list.filter((task) => task.completed).reduce((total, task) => total + minutesOf(task), 0) };
  }).filter((row) => row.planned > 0);
  const max = Math.max(1, ...rows.map((row) => row.planned));
  if (!rows.length) return null;
  return <section className="card pl-skills" aria-labelledby="pl-skills-title">
    <div className="pl-section-head"><h2 id="pl-skills-title">Tuần {weekRangeLabel(day)} theo kỹ năng</h2></div>
    <ul>{rows.map((row) => <li key={row.skill}>
      <span>{skillLabel(row.skill)}</span>
      <span className="pl-skill-bar" style={{ "--skill": skillColors[row.skill] } as React.CSSProperties} aria-hidden="true"><i style={{ width: `${(row.planned / max) * 100}%` }}><b style={{ width: `${row.planned ? (row.done / row.planned) * 100 : 0}%` }} /></i></span>
      <small>{minutesLabel(row.done)} / {minutesLabel(row.planned)}</small>
    </li>)}</ul>
  </section>;
}

/** Proposes a week of tasks from free time, study days and the skills furthest from their target band. */
function WeekPlanDialog({ today, weekOf, signals, onClose, onSave }: {
  today: string; weekOf: string; signals: ReturnType<typeof usePlannerSignals>; onClose: () => void; onSave: (drafts: TaskDraft[]) => Promise<void>;
}) {
  const suggestedFocus = signals.goals ? focusSkills({ Reading: signals.goals.Reading ?? signals.goals.overall, Listening: signals.goals.Listening ?? signals.goals.overall, Writing: signals.goals.Writing ?? signals.goals.overall, Speaking: signals.goals.Speaking ?? signals.goals.overall }, signals.current) : [];
  const [which, setWhich] = useState<"this" | "next">(weekOfDay(weekOf)[6] < addDay(today, 2) ? "next" : "this");
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [minutes, setMinutes] = useState(45);
  const [focus, setFocus] = useState<Skill[]>(suggestedFocus.length ? suggestedFocus.slice(0, 2) : ["Writing"]);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const anchor = which === "this" ? today : addDay(weekOfDay(today)[0], 7);
  const drafts = generateWeekPlan({ today, weekOf: anchor, weekdays, minutesPerDay: minutes, focus, examDate: signals.examDate, available: lessonOpen });
  const chosen = drafts.filter((_, index) => !skipped.has(index));
  const byDay = new Map<string, { draft: TaskDraft; index: number }[]>();
  drafts.forEach((draft, index) => byDay.set(draft.date, [...(byDay.get(draft.date) ?? []), { draft, index }]));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pl-sheet pl-plan" role="dialog" aria-modal="true" aria-labelledby="pl-plan-title">
      <header className="pl-sheet-head">
        <div><h2 id="pl-plan-title">Lập kế hoạch tuần</h2><p>App đề xuất các việc cụ thể; bạn bỏ bớt việc không muốn rồi thêm vào kế hoạch.</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
      </header>
      <div className="pl-sheet-body">
        <section className="pl-field"><span className="pl-label">Tuần</span><div className="pl-chips">
          <button type="button" className={`pl-chip${which === "this" ? " is-on" : ""}`} aria-pressed={which === "this"} onClick={() => { setWhich("this"); setSkipped(new Set()); }}>Tuần này ({weekRangeLabel(today)})</button>
          <button type="button" className={`pl-chip${which === "next" ? " is-on" : ""}`} aria-pressed={which === "next"} onClick={() => { setWhich("next"); setSkipped(new Set()); }}>Tuần sau ({weekRangeLabel(addDay(today, 7))})</button>
        </div></section>
        <section className="pl-field"><span className="pl-label">Ngày học</span><div className="pl-chips">
          {weekdayShort.map((label, index) => <button key={label} type="button" className={`pl-chip pl-day-chip${weekdays.includes(index + 1) ? " is-on" : ""}`} aria-pressed={weekdays.includes(index + 1)} onClick={() => { setWeekdays(toggle(weekdays, index + 1)); setSkipped(new Set()); }}>{label}</button>)}
        </div></section>
        <section className="pl-field"><span className="pl-label">Thời gian mỗi ngày</span><div className="pl-chips">
          {[20, 30, 45, 60, 90].map((value) => <button key={value} type="button" className={`pl-chip${minutes === value ? " is-on" : ""}`} aria-pressed={minutes === value} onClick={() => { setMinutes(value); setSkipped(new Set()); }}>{minutesLabel(value)}</button>)}
        </div></section>
        <section className="pl-field"><span className="pl-label">Muốn lên band nhất</span><div className="pl-chips">
          {(["Reading", "Listening", "Writing", "Speaking"] as Skill[]).filter((skill) => lessonOpen(skill.toLowerCase())).map((skill) => <button key={skill} type="button" className={`pl-chip${focus.includes(skill) ? " is-on" : ""}`} aria-pressed={focus.includes(skill)} onClick={() => { setFocus(toggle(focus, skill)); setSkipped(new Set()); }}>{skill}</button>)}
        </div>{suggestedFocus.length > 0 && <small className="pl-hint">Gợi ý theo band mục tiêu và kết quả đề gần đây: {suggestedFocus.join(", ")}.</small>}</section>
        <section className="pl-preview" aria-label="Xem trước kế hoạch">
          <h3>Xem trước · {chosen.length} việc · ~{minutesLabel(chosen.reduce((total, draft) => total + (draft.duration ?? 0), 0))}</h3>
          {drafts.length ? [...byDay].map(([day, items]) => <div key={day} className="pl-preview-day">
            <b>{dayLabel(day, today)}</b>
            {items.map(({ draft, index }) => <label key={index} className={skipped.has(index) ? "is-off" : ""}>
              <input type="checkbox" checked={!skipped.has(index)} onChange={() => setSkipped((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} />
              <span className="pl-skill" style={{ "--skill": skillColors[draft.skill] } as React.CSSProperties}>{skillLabel(draft.skill)}</span>
              {draft.title} <small>{draft.duration} phút</small>
            </label>)}
          </div>) : <p className="pl-hint">Chọn ít nhất một ngày còn lại trong tuần và tối thiểu 20 phút.</p>}
        </section>
      </div>
      <footer className="pl-sheet-foot">
        <span className="pl-spacer" />
        <button type="button" className="button subtle" onClick={onClose}>Huỷ</button>
        <button type="button" className="button primary" disabled={!chosen.length || saving} onClick={() => { setSaving(true); void onSave(chosen).finally(() => setSaving(false)); }}>
          {saving ? "Đang thêm…" : `Thêm ${chosen.length} việc`}
        </button>
      </footer>
    </div>
  </div>;
}
