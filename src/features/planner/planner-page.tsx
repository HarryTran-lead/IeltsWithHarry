"use client";
import { useMemo, useState } from "react";
import { CalendarDays, CircleCheck, ClipboardList, Plus, Search, SlidersHorizontal, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { type Skill, todayISO } from "@/lib/demo-data";
import { useDemo } from "@/features/demo/demo-store";
import { TaskList, TaskModal, skillLabel, plannerSkills } from "./planner-widgets";

type Filter = "today" | "week" | "month" | "all" | "completed" | "overdue";
const filters: { value: Filter; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "month", label: "Tháng này" },
  { value: "all", label: "Tất cả" },
  { value: "completed", label: "Đã xong" },
  { value: "overdue", label: "Quá hạn" },
];
const ALL_SKILLS = "all";

export function PlannerPage() {
  const { tasks } = useDemo();
  const [filter, setFilter] = useState<Filter>("week");
  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState<Skill | typeof ALL_SKILLS>(ALL_SKILLS);
  const [modal, setModal] = useState(false);
  const today = todayISO();
  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        const due = new Date(task.date + "T00:00:00");
        const now = new Date(today + "T00:00:00");
        const days = Math.round((due.getTime() - now.getTime()) / 86400000);
        const matchesFilter =
          filter === "today"
            ? days === 0
            : filter === "week"
              ? days >= 0 && days < 7
              : filter === "month"
                ? due.getMonth() === now.getMonth() &&
                  due.getFullYear() === now.getFullYear()
                : filter === "completed"
                  ? task.completed
                  : filter === "overdue"
                    ? days < 0 && !task.completed
                    : true;
        return (
          matchesFilter &&
          task.title.toLowerCase().includes(search.toLowerCase()) &&
          (skill === ALL_SKILLS || task.skill === skill)
        );
      }),
    [tasks, filter, search, skill, today],
  );
  const completed = tasks.filter((t) => t.completed).length;
  const filterLabel = filters.find((item) => item.value === filter)?.label;
  return (
    <div className="content-page planner-page">
      <PageHeader
        eyebrow="GÓC HỌC TẬP"
        title="Study Planner"
        description="Lên lịch học vừa sức, mỗi lần một việc nhỏ."
        sticker="calendar"
        actions={
          <button className="button primary" onClick={() => setModal(true)}>
            <Plus size={18} /> Thêm nhiệm vụ
          </button>
        }
      />
      <div className="planner-summary">
        <div>
          <span className="summary-icon coral"><ClipboardList size={20} /></span>
          <div>
            <strong>{tasks.length}</strong>
            <small>Tổng nhiệm vụ</small>
          </div>
        </div>
        <div>
          <span className="summary-icon teal"><CircleCheck size={20} /></span>
          <div>
            <strong>{completed}</strong>
            <small>Đã xong</small>
          </div>
        </div>
        <div>
          <span className="summary-icon purple"><Target size={20} /></span>
          <div>
            <strong>
              {tasks.filter((t) => t.date === today && !t.completed).length}
            </strong>
            <small>Đến hạn hôm nay</small>
          </div>
        </div>
      </div>
      <section className="card full-planner">
        <div className="planner-filter-tabs">
          {filters.map((item) => (
            <button
              key={item.value}
              className={filter === item.value ? "active" : ""}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="planner-tools">
          <label className="planner-search">
            <Search size={17} />
            <input
              placeholder="Tìm nhiệm vụ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="skill-filter">
            <SlidersHorizontal size={17} />
            <select value={skill} onChange={(e) => setSkill(e.target.value as Skill | typeof ALL_SKILLS)}>
              <option value={ALL_SKILLS}>Tất cả kỹ năng</option>
              {plannerSkills.map((item) => (
                <option key={item} value={item}>{skillLabel(item)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="planner-list-title">
          <div>
            <CalendarDays size={19} />
            <h2>{filterLabel}</h2>
          </div>
          <span>{visible.length} nhiệm vụ</span>
        </div>
        <TaskList tasks={visible} editable sortable />
        <p className="planner-tip">
          Mẹo: kéo thả để sắp xếp thứ tự nhiệm vụ. Thay đổi được lưu trong trình duyệt này.
        </p>
      </section>
      {modal && <TaskModal onClose={() => setModal(false)} />}
    </div>
  );
}
