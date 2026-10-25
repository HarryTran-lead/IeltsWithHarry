"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HarryMascot } from "@/components/illustrations/harry";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, FileText, GraduationCap, Headphones, Image, Languages, LayoutDashboard, Mic, PenLine, Newspaper, ListChecks, Rss, ScrollText, Settings2, FilePlus2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { LessonContentEditor } from "./lesson-content-editor";
import { MediaLibrary } from "./media-library";
import { skillMaterialSchema, type SkillName } from "@/lib/skill-material";
import { AdminNews } from "./admin-news";

type Course = { id: string; stage_id: string; slug: string; title: string; description: string; published: boolean };
type Unit = { id: string; course_id: string; slug: string; title: string; published: boolean };
type Lesson = { id: string; unit_id: string; slug: string; title: string; skill: SkillName; summary: string; published: boolean };
const skillTabs = ["Vocabulary", "Grammar", "Reading", "Listening", "Writing", "Speaking"] as const;
const nav = [
  { slug: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { slug: "curriculum", label: "Lộ trình & bài học", icon: GraduationCap },
  { slug: "vocabulary", label: "Vocabulary", icon: Languages },
  { slug: "grammar", label: "Grammar", icon: BookOpen },
  { slug: "reading", label: "Reading", icon: FileText },
  { slug: "listening", label: "Listening", icon: Headphones },
  { slug: "writing", label: "Writing", icon: PenLine },
  { slug: "speaking", label: "Speaking", icon: Mic },
  { slug: "media", label: "Media library", icon: Image },
  { slug: "news", label: "Daily News", icon: Newspaper },
  { slug: "news/settings", label: "News settings", icon: Settings2 },
  { slug: "news/manual", label: "Add news", icon: FilePlus2 },
  { slug: "news/sources", label: "News sources", icon: Rss },
  { slug: "news/review", label: "News review", icon: ListChecks },
  { slug: "news/articles", label: "Learning articles", icon: BookOpen },
  { slug: "news/sync-logs", label: "Sync logs", icon: ScrollText },
] as const;
export function AdminEditor() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const segment = pathname.split("/").slice(2).join("/") || "overview";
  const section = nav.some((item) => item.slug === segment) ? segment : "overview";
  const sectionLabel = nav.find((item) => item.slug === section)?.label ?? "Tổng quan";
  const currentSkill = skillTabs.find((item) => item.toLowerCase() === section);
  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (failure) { setError(failure.message); setLoading(false); return; }
    setCourses(courseResult.data as Course[]);
    setUnits(unitResult.data as Unit[]);
    setLessons(lessonResult.data as Lesson[]);
    setLoading(false);
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
    if (table === "lessons" && patch.published === true) {
      const lesson = lessons.find((item) => item.id === id);
      const material = await supabase.from("lesson_materials").select("content").eq("lesson_id", id).maybeSingle();
      const parsed = skillMaterialSchema.safeParse(material.data?.content);
      if (material.error || !parsed.success || parsed.data.skill !== lesson?.skill) { setError("Hãy lưu dữ liệu riêng của kỹ năng trước khi xuất bản bài học."); return; }
      if (["Reading", "Listening", "Grammar"].includes(lesson.skill)) {
        const questions = await supabase.from("exercise_questions").select("id").eq("lesson_id", id).limit(1);
        if (questions.error || !questions.data?.length) { setError("Bài này cần ít nhất một câu hỏi có đáp án trước khi xuất bản."); return; }
      }
      if (lesson.skill === "Vocabulary") {
        const words = await supabase.from("vocabulary_entries").select("id").eq("lesson_id", id).limit(1);
        if (words.error || !words.data?.length) { setError("Bài Vocabulary cần ít nhất một từ trước khi xuất bản."); return; }
      }
    }
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    if (error) setError(error.message); else await load();
  }
  async function remove(table: "courses" | "units" | "lessons", id: string) {
    if (!window.confirm("Delete this item and its children? This cannot be undone.")) return;
    setError("");
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message); else await load();
  }

  return <div className="admin-shell"><aside className="admin-sidebar"><Link href="/admin" className="admin-brand"><span className="admin-brand-mark"><HarryMascot size={39} /></span><span><strong>IeltsWithHarry</strong><small>ADMIN PORTAL</small></span></Link><div className="admin-sidebar-label">QUẢN LÝ NỘI DUNG</div><nav aria-label="Admin navigation">{nav.map(({ slug: itemSlug, label, icon: Icon }) => <Link key={itemSlug} href={itemSlug === "overview" ? "/admin" : `/admin/${itemSlug}`} className={section === itemSlug ? "admin-nav-link active" : "admin-nav-link"} aria-current={section === itemSlug ? "page" : undefined}><Icon size={19} /><span>{label}</span><ChevronRight size={15} className="admin-nav-chevron" /></Link>)}</nav><Link href="/app/dashboard" className="admin-student-link"><GraduationCap size={19} /> Student portal <span>↗</span></Link></aside><main className="admin-panel">
    <div className="admin-heading"><div><span className="eyebrow">ADMIN CMS / {section.toUpperCase()}</span><h1>{sectionLabel}</h1><p>{section === "overview" ? "Quản lý nội dung học tập theo từng kỹ năng và theo dõi trạng thái xuất bản." : section === "curriculum" ? "Tạo khóa học, unit và bài học trước khi nhập nội dung cho từng kỹ năng." : section === "media" ? "Quản lý hình minh họa và âm thanh dùng trong bài học." : `Biên soạn dữ liệu ${sectionLabel} và xem trước trải nghiệm học viên.`}</p></div><Link className="button subtle" href="/app/dashboard">Student portal →</Link></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {loading ? <section className="card admin-list" role="status">Đang tải dữ liệu quản trị…</section> : <>
    {section === "overview" && <><div className="admin-stats"><article><span>Khóa học</span><strong>{courses.length}</strong><small>{courses.filter((item) => item.published).length} đã xuất bản</small></article><article><span>Units</span><strong>{units.length}</strong><small>{units.filter((item) => item.published).length} đã xuất bản</small></article><article><span>Bài học</span><strong>{lessons.length}</strong><small>{lessons.filter((item) => item.published).length} đã xuất bản</small></article><article><span>Kỹ năng</span><strong>6</strong><small>Đầu vào chuyên biệt</small></article></div><section className="card admin-overview-card"><h2>Bắt đầu biên soạn</h2><p>Chọn một kỹ năng để nhập bài đọc, audio, đề viết, câu hỏi hoặc từ vựng. Nội dung nháp chỉ admin xem được.</p><div className="admin-quick-links">{nav.slice(2, 8).map(({ slug: itemSlug, label, icon: Icon }) => <Link key={itemSlug} href={`/admin/${itemSlug}`}><Icon size={22} /><strong>{label}</strong><ChevronRight size={18} /></Link>)}</div></section><section className="card admin-overview-card"><h2>Phân bố bài học theo kỹ năng</h2><p>Số bài đã xuất bản và bản nháp ở mỗi kỹ năng.</p><div className="admin-coverage">{skillTabs.map((name) => { const rows = lessons.filter((item) => item.skill === name); const live = rows.filter((item) => item.published).length; return <div className="admin-coverage-row" key={name}><span>{name}</span><div className="admin-coverage-track"><i style={{ width: `${rows.length ? live / rows.length * 100 : 0}%` }} /></div><b>{live}/{rows.length}</b></div>; })}</div></section><section className="card admin-overview-card"><div className="admin-section-head"><h2>Bài học gần đây</h2><Link href="/admin/curriculum">Xem lộ trình →</Link></div>{lessons.slice(0, 6).map((item) => <div className="admin-row" key={item.id}><div><strong>{item.title}</strong><small>{item.skill} · {item.published ? "Đã xuất bản" : "Bản nháp"}</small></div><Link href={`/admin/${item.skill.toLowerCase()}`} className="button subtle">Biên soạn</Link></div>)}</section></>}
    {section === "curriculum" && <>
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
    </>}
    {currentSkill && <>{lessons.some((item) => item.skill === currentSkill) ? <LessonContentEditor key={currentSkill} lessons={lessons.filter((item) => item.skill === currentSkill)} onPublish={(lesson) => void change("lessons", lesson.id, { published: !lesson.published })} /> : <section className="card admin-list admin-empty"><h2>Chưa có bài {currentSkill}</h2><p>Tạo một lesson và chọn kỹ năng {currentSkill} trong Lộ trình & bài học, sau đó quay lại đây để nhập dữ liệu.</p><Link className="button primary" href="/admin/curriculum">Tạo bài học →</Link></section>}</>}
    {section === "media" && <MediaLibrary />}
    {section.startsWith("news") && <AdminNews section={section} />}
    </>}
  </main></div>;
}
