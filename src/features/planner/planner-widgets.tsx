"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  type Skill,
  type StudyTask,
  skillColors,
  todayISO,
} from "@/lib/demo-data";
import { useDemo } from "@/features/demo/demo-store";
import { Button } from "@/components/ui/button";

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
        No tasks here yet. Add one to plan your next step.
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
              if (dragged && dragged !== task.id) reorderTask(dragged, task.id);
              setDragged(null);
            }}
          >
            {sortable && (
              <GripVertical
                size={16}
                className="drag-handle"
                aria-label="Drag to sort"
              />
            )}
            <button
              className={`task-check ${task.completed ? "checked" : ""}`}
              aria-label={`${task.completed ? "Unmark" : "Complete"} ${task.title}`}
              aria-pressed={task.completed}
              onClick={() =>
                updateTask(task.id, { completed: !task.completed })
              }
            >
              {task.completed && <Check size={15} strokeWidth={3} />}
            </button>
            <span
              className="task-color"
              style={{ backgroundColor: skillColors[task.skill] }}
            />
            <div className="task-copy">
              <span>{task.title}</span>
              {editable && (
                <small>
                  {task.skill} · {task.date} · {task.priority} priority
                </small>
              )}
            </div>
            <time>{task.time || "—"}</time>
            {editable && (
              <div className="task-actions">
                <button
                  aria-label={`Edit ${task.title}`}
                  onClick={() => setEditing(task)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Delete ${task.title}`}
                  onClick={() => {
                    if (window.confirm(`Delete “${task.title}”?`))
                      deleteTask(task.id);
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

const skills: Skill[] = [
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
  function submit(e: React.FormEvent) {
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
    if (task) updateTask(task.id, data);
    else addTask(data);
    onClose();
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
            {task ? "Edit study task" : "Add a study task"}
          </h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p>Make your next learning step concrete.</p>
        <form onSubmit={submit}>
          <label>
            Task title
            <input
              autoFocus
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Review new vocabulary"
            />
          </label>
          <div className="form-grid">
            <label>
              Skill
              <select
                value={skill}
                onChange={(e) => setSkill(e.target.value as Skill)}
              >
                {skills.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as StudyTask["priority"])
                }
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Due date
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="button subtle" onClick={onClose}>
              Cancel
            </button>
            <Button type="submit" className="button primary">
              <Plus size={17} />
              {task ? "Save changes" : "Add task"}
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
          Open planner →
        </Link>
      </div>
      <div className="planner-tabbar">
        <button
          className={view === "week" ? "selected" : ""}
          onClick={() => setView("week")}
        >
          This Week
        </button>
        <button
          className={view === "today" ? "selected" : ""}
          onClick={() => setView("today")}
        >
          Today
        </button>
        <span>
          {dates.length
            ? `${new Date(dates[0] + "T00:00").toLocaleDateString("en", { month: "short", day: "numeric" })} – ${new Date(dates[dates.length - 1] + "T00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}`
            : ""}
        </span>
      </div>
      <TaskList tasks={list} />
      <button
        className="button blue wide add-task"
        onClick={() => setModal(true)}
      >
        <Plus size={18} /> Add a Task
      </button>
      {modal && <TaskModal onClose={() => setModal(false)} />}
    </section>
  );
}

function CalendarIcon() {
  return <span className="emoji-icon">🗓️</span>;
}
