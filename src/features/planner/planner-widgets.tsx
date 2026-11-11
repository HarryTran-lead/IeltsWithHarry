"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { HeadIcon } from "@/components/ui/head-icon";
import { celebrate } from "@/lib/celebrate";
import {
  type Skill,
  type StudyTask,
  skillColors,
  todayISO,
} from "@/lib/demo-data";
import { useDemo } from "@/features/demo/demo-store";
import { Button } from "@/components/ui/button";
import { viDate, viDayMonth } from "@/lib/format-date";

/** Skill names stay as IELTS terms; only the two non-skill buckets read in Vietnamese. */
export function skillLabel(skill: Skill) {
  return skill === "Review" ? "Ôn tập" : skill === "Personal" ? "Cá nhân" : skill;
}
const priorityLabels: Record<StudyTask["priority"], string> = { Low: "Thấp", Medium: "Vừa", High: "Cao" };

export function TaskList({
  tasks,
  editable = false,
  sortable = false,
}: {
  tasks: StudyTask[];
  editable?: boolean;
  sortable?: boolean;
}) {
  const { updateTask, deleteTask, reorderTask } = useDemo();
  const [editing, setEditing] = useState<StudyTask | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  if (!tasks.length)
    return (
      <div className="empty-state">
        Chưa có nhiệm vụ nào. Thêm một việc nhỏ để lên kế hoạch cho bước tiếp theo.
      </div>
    );
  return (
    <>
      <div className="task-list">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`task-row ${task.completed ? "is-complete" : ""}`}
            draggable={sortable}
            onDragStart={() => setDragged(task.id)}
            onDragOver={(e) => {
              if (sortable) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged && dragged !== task.id) void reorderTask(dragged, task.id).catch(() => {});
              setDragged(null);
            }}
          >
            {sortable && (
              <GripVertical
                size={16}
                className="drag-handle"
                aria-label="Kéo để sắp xếp"
              />
            )}
            <button
              className={`task-check ${task.completed ? "checked" : ""}`}
              aria-label={`${task.completed ? "Bỏ đánh dấu" : "Hoàn thành"} ${task.title}`}
              aria-pressed={task.completed}
              onClick={(event) => {
                if (!task.completed) celebrate(event.currentTarget, { label: "Xong!", pieces: 18 });
                void updateTask(task.id, { completed: !task.completed }).catch(() => {});
              }}
            >
              {task.completed && <Check size={15} strokeWidth={3} />}
            </button>
            <span
              className="task-color"
              style={{ backgroundColor: skillColors[task.skill] }}
            />
            <div className="task-copy">
              {task.lesson === "vocabulary-review" ? <Link href="/app/vocabulary/review">{task.title} →</Link> : task.lesson === "dictation" ? <Link href="/app/dictation">{task.title} →</Link> : task.lesson?.startsWith("ielts:") ? <Link href={`/app/question-bank/exam/${task.lesson.slice(6)}`}>{task.title} →</Link> : <span>{task.title}</span>}
              {editable && (
                <small>
                  {skillLabel(task.skill)} · {viDate(task.date)} · Ưu tiên {priorityLabels[task.priority].toLowerCase()}
                </small>
              )}
            </div>
            <time>{task.time || "—"}</time>
            {editable && (
              <div className="task-actions">
                <button
                  aria-label={`Sửa ${task.title}`}
                  onClick={() => setEditing(task)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Xoá ${task.title}`}
                  onClick={() => {
                    if (window.confirm(`Xoá “${task.title}”?`))
                      void deleteTask(task.id).catch(() => {});
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export const plannerSkills: Skill[] = [
  "Reading",
  "Listening",
  "Writing",
  "Speaking",
  "Vocabulary",
  "Grammar",
  "Review",
  "Personal",
];
export function TaskModal({
  onClose,
  task,
}: {
  onClose: () => void;
  task?: StudyTask;
}) {
  const { addTask, updateTask } = useDemo();
  const [title, setTitle] = useState(task?.title || "");
  const [skill, setSkill] = useState<Skill>(task?.skill || "Reading");
  const [date, setDate] = useState(task?.date || todayISO());
  const [time, setTime] = useState(task?.time || "09:00");
  const [priority, setPriority] = useState<StudyTask["priority"]>(
    task?.priority || "Medium",
  );
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const data = {
      title: title.trim(),
      skill,
      date,
      time,
      priority,
      completed: task?.completed || false,
      lesson: task?.lesson,
    };
    setSaving(true);
    try {
      if (task) await updateTask(task.id, data);
      else await addTask(data);
      onClose();
    } catch { /* The store displays the save error. */ }
    finally { setSaving(false); }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
      >
        <div className="modal-head">
          <h2 id="task-modal-title">
            {task ? "Sửa nhiệm vụ học" : "Thêm nhiệm vụ học"}
          </h2>
          <button className="icon-button" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>
        <p>Biến bước học tiếp theo thành một việc cụ thể.</p>
        <form onSubmit={submit}>
          <label>
            Tên nhiệm vụ
            <input
              autoFocus
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Ôn lại từ vựng mới"
            />
          </label>
          <div className="form-grid">
            <label>
              Kỹ năng
              <select
                value={skill}
                onChange={(e) => setSkill(e.target.value as Skill)}
              >
                {plannerSkills.map((value) => (
                  <option key={value} value={value}>{skillLabel(value)}</option>
                ))}
              </select>
            </label>
            <label>
              Mức ưu tiên
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as StudyTask["priority"])
                }
              >
                {(Object.keys(priorityLabels) as StudyTask["priority"][]).map((value) => (
                  <option key={value} value={value}>{priorityLabels[value]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Ngày hạn
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Giờ
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="button subtle" onClick={onClose}>
              Huỷ
            </button>
            <Button type="submit" className="button primary" disabled={saving}>
              <Plus size={17} />
              {saving ? "Đang lưu…" : task ? "Lưu thay đổi" : "Thêm nhiệm vụ"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PlannerMini() {
  const { tasks } = useDemo();
  const [modal, setModal] = useState(false);
  const [view, setView] = useState<"week" | "today">("week");
  const now = new Date(todayISO() + "T00:00:00");
  const list = tasks
    .filter((t) => {
      const days = Math.round(
        (new Date(t.date + "T00:00:00").getTime() - now.getTime()) / 86400000,
      );
      return view === "today" ? days === 0 : days >= 0 && days < 7;
    })
    .slice(0, 8);
  const dates = tasks.map((t) => t.date).sort();
  return (
    <section className="card planner-mini">
      <div className="card-head">
        <div className="head-title">
          <CalendarIcon />
          <h2>Study Planner</h2>
        </div>
        <Link href="/app/planner" className="text-link">
          Mở Planner →
        </Link>
      </div>
      <div className="planner-tabbar">
        <button
          className={view === "week" ? "selected" : ""}
          onClick={() => setView("week")}
        >
          Tuần này
        </button>
        <button
          className={view === "today" ? "selected" : ""}
          onClick={() => setView("today")}
        >
          Hôm nay
        </button>
        <span>
          {dates.length
            ? `${viDayMonth(dates[0])} – ${viDayMonth(dates[dates.length - 1])}`
            : ""}
        </span>
      </div>
      <TaskList tasks={list} />
      <button
        className="button blue wide add-task"
        onClick={() => setModal(true)}
      >
        <Plus size={18} /> Thêm nhiệm vụ
      </button>
      {modal && <TaskModal onClose={() => setModal(false)} />}
    </section>
  );
}

function CalendarIcon() {
  return <HeadIcon icon={CalendarDays} />;
}
