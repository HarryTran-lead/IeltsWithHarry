"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { LessonContentEditor } from "./lesson-content-editor";

type Course = { id: string; stage_id: string; slug: string; title: string; description: string; published: boolean };
type Unit = { id: string; course_id: string; slug: string; title: string; published: boolean };
type Lesson = { id: string; unit_id: string; slug: string; title: string; skill: string; summary: string; published: boolean };
export function AdminEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("foundation");
  const [courseId, setCourseId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [skill, setSkill] = useState("Reading");
  const [kind, setKind] = useState<"course" | "unit" | "lesson">("course");

  const load = useCallback(async () => {
    const [courseResult, unitResult, lessonResult] = await Promise.all([
      supabase.from("courses").select("*").order("title"),
      supabase.from("units").select("*").order("title"),
      supabase.from("lessons").select("*").order("title"),
    ]);
    const failure = courseResult.error || unitResult.error || lessonResult.error;
    if (failure) { setError(failure.message); return; }
    setCourses(courseResult.data as Course[]);
    setUnits(unitResult.data as Unit[]);
    setLessons(lessonResult.data as Lesson[]);
  }, [supabase]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    let result;
    if (kind === "course") result = await supabase.from("courses").insert({ stage_id: stage, title: title.trim(), slug: slug.trim(), description: "", published: false });
    else if (kind === "unit") result = await supabase.from("units").insert({ course_id: courseId, title: title.trim(), slug: slug.trim(), published: false });
    else result = await supabase.from("lessons").insert({ unit_id: unitId, title: title.trim(), slug: slug.trim(), skill, summary: "", published: false });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setTitle(""); setSlug(""); await load();
  }

  async function change(table: "courses" | "units" | "lessons", id: string, patch: Record<string, string | boolean>) {
    setError("");
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    if (error) setError(error.message); else await load();
  }
  async function remove(table: "courses" | "units" | "lessons", id: string) {
    if (!window.confirm("Delete this item and its children? This cannot be undone.")) return;
    setError("");
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message); else await load();
  }

  return <main className="admin-panel">
    <div className="admin-heading"><div><span className="eyebrow">ADMIN CMS</span><h1>Curriculum editor</h1><p>Create and publish courses, units and lessons. Drafts stay hidden from learners.</p></div><Link className="button subtle" href="/app/dashboard">Student portal →</Link></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <section className="card admin-create"><h2>Add content</h2>
      <form onSubmit={create}>
        <label>Content type<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="course">Course</option><option value="unit">Unit</option><option value="lesson">Lesson</option></select></label>
        {kind === "course" ? <label>Stage<select value={stage} onChange={(e) => setStage(e.target.value)}>{["foundation","elementary","pre-ielts","ielts-starter","ielts-builder","ielts-advanced","mastery"].map((value) => <option key={value}>{value}</option>)}</select></label> :
          kind === "unit" ? <label>Course<select required value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">Select course</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> :
          <><label>Unit<select required value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">Select unit</option>{units.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Skill<select value={skill} onChange={(e) => setSkill(e.target.value)}>{["Reading","Listening","Writing","Speaking","Vocabulary","Grammar"].map((value) => <option key={value}>{value}</option>)}</select></label></>}
        <label>Title<input required minLength={3} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>URL slug<input required pattern="[a-z0-9-]+" value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
        <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Create draft"}</button>
      </form>
    </section>
    {([
      { title: "Courses", table: "courses" as const, rows: courses },
      { title: "Units", table: "units" as const, rows: units },
      { title: "Lessons", table: "lessons" as const, rows: lessons },
    ]).map((group) => <section key={group.table} className="card admin-list"><h2>{group.title}</h2>{!group.rows.length && <p>No items yet.</p>}
      {group.rows.map((item) => <div className="admin-row" key={item.id}><div><strong>{item.title}</strong><small>/{item.slug} · {item.published ? "Published" : "Draft"}</small></div><div>
        <button className="button subtle" onClick={() => { const name = window.prompt("New title", item.title)?.trim(); if (name) void change(group.table, item.id, { title: name }); }}>Rename</button>
        <button className="button subtle" onClick={() => void change(group.table, item.id, { published: !item.published })}>{item.published ? "Unpublish" : "Publish"}</button>
        <button className="button subtle" onClick={() => void remove(group.table, item.id)}>Delete</button>
      </div></div>)}
    </section>)}
    <LessonContentEditor lessons={lessons} />
  </main>;
}
