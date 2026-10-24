"use client";
import { useMemo, useState } from "react";
import { CalendarDays, Plus, Search, SlidersHorizontal } from "lucide-react";
import { type Skill, todayISO } from "@/lib/demo-data";
import { useDemo } from "@/features/demo/demo-store";
import { TaskList, TaskModal } from "./planner-widgets";

type Filter =
  "Today" | "This Week" | "This Month" | "All Tasks" | "Completed" | "Overdue";
const filters: Filter[] = [
  "Today",
  "This Week",
  "This Month",
  "All Tasks",
  "Completed",
  "Overdue",
];

export function PlannerPage() {
  const { tasks } = useDemo();
  const [filter, setFilter] = useState<Filter>("This Week");
  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState("All skills");
  const [modal, setModal] = useState(false);
  const today = todayISO();
  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        const due = new Date(task.date + "T00:00:00");
        const now = new Date(today + "T00:00:00");
        const days = Math.round((due.getTime() - now.getTime()) / 86400000);
        const matchesFilter =
          filter === "Today"
            ? days === 0
            : filter === "This Week"
              ? days >= 0 && days < 7
              : filter === "This Month"
                ? due.getMonth() === now.getMonth() &&
                  due.getFullYear() === now.getFullYear()
                : filter === "Completed"
                  ? task.completed
                  : filter === "Overdue"
                    ? days < 0 && !task.completed
                    : true;
        return (
          matchesFilter &&
          task.title.toLowerCase().includes(search.toLowerCase()) &&
          (skill === "All skills" || task.skill === skill)
        );
      }),
    [tasks, filter, search, skill, today],
  );
  const completed = tasks.filter((t) => t.completed).length;
  return (
    <div className="content-page planner-page">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">YOUR STUDY SPACE</span>
          <h1>
            Study Planner <span>✦</span>
          </h1>
          <p>Shape a routine that works for you, one small task at a time.</p>
        </div>
        <button className="button primary" onClick={() => setModal(true)}>
          <Plus size={18} /> Add a Task
        </button>
      </div>
      <div className="planner-summary">
        <div>
          <span className="summary-icon coral">📝</span>
          <div>
            <strong>{tasks.length}</strong>
            <small>Total tasks</small>
          </div>
        </div>
        <div>
          <span className="summary-icon teal">✓</span>
          <div>
            <strong>{completed}</strong>
            <small>Completed</small>
          </div>
        </div>
        <div>
          <span className="summary-icon purple">🎯</span>
          <div>
            <strong>
              {tasks.filter((t) => t.date === today && !t.completed).length}
            </strong>
            <small>Due today</small>
          </div>
        </div>
      </div>
      <section className="card full-planner">
        <div className="planner-filter-tabs">
          {filters.map((value) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="planner-tools">
          <label className="planner-search">
            <Search size={17} />
            <input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="skill-filter">
            <SlidersHorizontal size={17} />
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option>All skills</option>
              {(
                [
                  "Reading",
                  "Listening",
                  "Writing",
                  "Speaking",
                  "Vocabulary",
                  "Grammar",
                  "Review",
                  "Personal",
                ] as Skill[]
              ).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="planner-list-title">
          <div>
            <CalendarDays size={19} />
            <h2>{filter}</h2>
          </div>
          <span>{visible.length} tasks</span>
        </div>
        <TaskList tasks={visible} editable sortable />
        <p className="planner-tip">
          Tip: drag tasks to set your preferred order. Changes are saved in this
          browser.
        </p>
      </section>
      {modal && <TaskModal onClose={() => setModal(false)} />}
    </div>
  );
}
