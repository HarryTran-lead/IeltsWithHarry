"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, FileText, FolderTree, GraduationCap, Headphones, Image, Languages, LayoutDashboard, Layers, Mic, PenLine, Newspaper, ListChecks, Rss, ScrollText, Settings2, FilePlus2, Plus, Shapes, LibraryBig, UsersRound, Megaphone, History, MessageSquareText } from "lucide-react";
import { BankAdmin } from "@/features/ielts/bank-admin";
import { AiContentFactory } from "@/features/ai-factory/ai-content-factory";
import { Sticker } from "@/components/stickers/stickers";
import { HeadIcon } from "@/components/ui/head-icon";
import { AdminShell, type AdminNavGroup } from "./admin-shell";
import { createClient } from "@/lib/supabase/browser";
import { LessonContentEditor } from "./lesson-content-editor";
import { MediaLibrary } from "./media-library";
import { skillMaterialSchema, type SkillName } from "@/lib/skill-material";
import { AdminNews } from "./admin-news";
import { VocabularyBank } from "./vocabulary-bank";
import { VocabularyPhase5 } from "./vocabulary-phase5";
import { ViEnTranslationReview } from "./vi-en-translation-review";
import { YoutubeLessonsAdmin } from "./youtube-lessons";
import { AdminAudit, AdminBroadcast, AdminLearnerDetail, AdminLearners } from "./admin-learners";

type Course = { id: string; stage_id: string; slug: string; title: string; description: string; published: boolean };
type Unit = { id: string; course_id: string; slug: string; title: string; published: boolean };
type Lesson = { id: string; unit_id: string; slug: string; title: string; skill: SkillName; summary: string; published: boolean };
const skillTabs = ["Vocabulary", "Grammar", "Reading", "Listening", "Writing", "Speaking"] as const;
const nav = [
  { slug: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { slug: "users", label: "Học viên", icon: UsersRound },
  { slug: "users/broadcast", label: "Thông báo & giao bài", icon: Megaphone },
  { slug: "users/audit", label: "Nhật ký admin", icon: History },
  { slug: "curriculum", label: "Lộ trình & bài học", icon: GraduationCap },
  { slug: "vocabulary", label: "Vocabulary", icon: Languages },
  { slug: "vocabulary/library", label: "Kho từ & nhập ZIP", icon: LibraryBig },
  { slug: "vocabulary/ielts-progress", label: "IELTS · tiến độ chủ đề", icon: ListChecks },
  { slug: "vocabulary/translation", label: "Luyện dịch câu · duyệt", icon: Languages },
  { slug: "grammar", label: "Grammar", icon: BookOpen },
  { slug: "reading", label: "Reading", icon: FileText },
  { slug: "listening", label: "Listening", icon: Headphones },
  { slug: "writing", label: "Writing", icon: PenLine },
  { slug: "speaking", label: "Speaking", icon: Mic },
  { slug: "media", label: "Media library", icon: Image },
  { slug: "ielts-bank", label: "Ngân hàng IELTS", icon: LibraryBig },
  { slug: "ai-content-factory", label: "AI Content Factory", icon: Shapes },
  { slug: "news", label: "Daily News", icon: Newspaper },
  { slug: "news/settings", label: "News settings", icon: Settings2 },
  { slug: "news/manual", label: "Add news", icon: FilePlus2 },
  { slug: "news/sources", label: "News sources", icon: Rss },
  { slug: "news/review", label: "News review", icon: ListChecks },
  { slug: "news/articles", label: "Learning articles", icon: BookOpen },
  { slug: "news/meaning-suggestions", label: "Góp ý nghĩa từ", icon: MessageSquareText },
  { slug: "news/sync-logs", label: "Sync logs", icon: ScrollText },
] as const;
const navGroups = [
  { label: "Tổng quan", slugs: ["overview"] },
  { label: "Học viên", slugs: ["users", "users/broadcast", "users/audit"] },
  { label: "Nội dung", slugs: ["curriculum", "media"] },
  { label: "IELTS Management", slugs: ["ielts-bank", "ai-content-factory"] },
  { label: "Kỹ năng", slugs: ["vocabulary", "vocabulary/library", "vocabulary/ielts-progress", "vocabulary/translation", "grammar", "reading", "listening", "writing", "speaking"] },
  { label: "Daily News", slugs: ["news", "news/settings", "news/manual", "news/sources", "news/review", "news/articles", "news/meaning-suggestions", "news/sync-logs"] },
];
const descriptions: Record<string, string> = {
  overview: "Quản lý nội dung học tập theo từng kỹ năng và theo dõi trạng thái xuất bản.",
  curriculum: "Tạo khóa học, unit và bài học trước khi nhập nội dung cho từng kỹ năng.",
  media: "Quản lý hình minh họa và âm thanh dùng trong bài học.",
  users: "Theo dõi hoạt động, streak và kiểm soát tài khoản từng học viên: khóa, cấm chat, giao nhiệm vụ, đặt mục tiêu, gửi thông báo.",
  "users/broadcast": "Gửi thông báo, giao nhiệm vụ và đặt mục tiêu ngày cho cả lớp cùng lúc.",
  "users/audit": "Mọi thao tác của admin trên tài khoản học viên đều được ghi lại ở đây.",
  "vocabulary/ielts-progress": "Theo dõi 40 chủ đề học, mục đã xuất bản và tiến độ biên soạn mới.",
};
function StatusPill({ published }: { published: boolean }) {
  return <span className={published ? "status-pill live" : "status-pill draft"}><i aria-hidden="true" />{published ? "Đã xuất bản" : "Bản nháp"}</span>;
}
export function AdminEditor() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const segment = pathname.split("/").slice(2).join("/") || "overview";
  // /admin/users/<id> opens one learner inside the Học viên section.
  const learnerId = /^users\/[0-9a-f-]{36}$/.test(segment) ? segment.slice("users/".length) : null;
  const section = learnerId ? "users" : nav.some((item) => item.slug === segment) ? segment : "overview";
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

  const groups: AdminNavGroup[] = navGroups.map((group) => ({
    label: group.label,
    items: group.slugs.map((itemSlug) => {
      const item = nav.find((entry) => entry.slug === itemSlug)!;
      return { href: itemSlug === "overview" ? "/admin" : `/admin/${itemSlug}`, label: item.label, icon: item.icon, active: section === itemSlug };
    }),
  }));
  const published = (rows: { published: boolean }[]) => rows.filter((item) => item.published).length;

  return <AdminShell groups={groups} section={sectionLabel} title={sectionLabel} description={descriptions[section] ?? `Biên soạn dữ liệu ${sectionLabel} và xem trước trải nghiệm học viên.`} mode="live" actions={section === "overview" || section === "curriculum" ? <Link className="button primary" href="/admin/curriculum"><Plus size={16} /> Tạo nội dung</Link> : undefined}>
    {error && <p role="alert" className="form-error">{error}</p>}
    {loading ? <section className="card admin-list admin-loading" role="status"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" />Đang tải dữ liệu quản trị…</section> : <>
    {section === "overview" && <><div className="admin-stats stagger">
      <article><HeadIcon icon={FolderTree} /><span>Khóa học</span><strong>{courses.length}</strong><small>{published(courses)} đã xuất bản</small></article>
      <article><HeadIcon icon={Layers} tone="sky" /><span>Units</span><strong>{units.length}</strong><small>{published(units)} đã xuất bản</small></article>
      <article><HeadIcon icon={BookOpen} tone="coral" /><span>Bài học</span><strong>{lessons.length}</strong><small>{published(lessons)} đã xuất bản</small></article>
      <article><HeadIcon icon={Shapes} tone="lavender" /><span>Kỹ năng</span><strong>6</strong><small>Đầu vào chuyên biệt</small></article>
    </div>
    <div className="admin-overview-grid">
      <section className="card admin-overview-card"><div className="admin-section-head"><div><h2>Bắt đầu biên soạn</h2><p>Chọn một kỹ năng để nhập bài đọc, audio, đề viết, câu hỏi hoặc từ vựng. Nội dung nháp chỉ admin xem được.</p></div></div><div className="admin-quick-links">{nav.slice(2, 8).map(({ slug: itemSlug, label, icon: Icon }) => { const rows = lessons.filter((item) => item.skill.toLowerCase() === itemSlug); return <Link key={itemSlug} href={`/admin/${itemSlug}`} className="lift"><span className="admin-quick-icon"><Icon size={19} /></span><span><strong>{label}</strong><small>{rows.length} bài · {published(rows)} xuất bản</small></span><ChevronRight size={17} /></Link>; })}</div></section>
      <section className="card admin-overview-card"><div className="admin-section-head"><div><h2>Phân bố theo kỹ năng</h2><p>Bài đã xuất bản trên tổng số bài.</p></div></div><div className="admin-coverage">{skillTabs.map((name) => { const rows = lessons.filter((item) => item.skill === name); const live = published(rows); return <div className="admin-coverage-row" key={name}><span>{name}</span><div className="admin-coverage-track"><i style={{ width: `${rows.length ? live / rows.length * 100 : 0}%` }} /></div><b>{live}/{rows.length}</b></div>; })}</div></section>
    </div>
    <section className="card admin-overview-card"><div className="admin-section-head"><h2>Bài học gần đây</h2><Link href="/admin/curriculum">Xem lộ trình <ChevronRight size={15} /></Link></div>{lessons.length ? <div className="admin-table">{lessons.slice(0, 6).map((item) => <div className="admin-row" key={item.id}><div><strong>{item.title}</strong><small>{item.skill} · /{item.slug}</small></div><StatusPill published={item.published} /><div><Link href={`/admin/${item.skill.toLowerCase()}`} className="button subtle">Biên soạn</Link></div></div>)}</div> : <div className="admin-empty-state"><Sticker name="pencil" size={64} tilt={-8} /><div><h3>Chưa có bài học nào</h3><p>Tạo khóa học, unit rồi bài học đầu tiên trong mục Lộ trình & bài học.</p></div><Link className="button primary" href="/admin/curriculum">Tạo bài học</Link></div>}</section></>}
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
    ]).map((group) => <section key={group.table} className="card admin-list"><div className="admin-section-head"><h2>{group.title}</h2><span className="admin-count">{group.rows.length}</span></div>{!group.rows.length && <p className="admin-muted">No items yet.</p>}
      {group.rows.map((item) => <div className="admin-row" key={item.id}><div><strong>{item.title}</strong><small>/{item.slug}</small></div><StatusPill published={item.published} /><div>
        <button className="button subtle" onClick={() => { const name = window.prompt("New title", item.title)?.trim(); if (name) void change(group.table, item.id, { title: name }); }}>Rename</button>
        <button className="button subtle" onClick={() => void change(group.table, item.id, { published: !item.published })}>{item.published ? "Unpublish" : "Publish"}</button>
        <button className="button subtle" onClick={() => void remove(group.table, item.id)}>Delete</button>
      </div></div>)}
    </section>)}
    </>}
    {currentSkill && <>{lessons.some((item) => item.skill === currentSkill) ? <LessonContentEditor key={currentSkill} lessons={lessons.filter((item) => item.skill === currentSkill)} onPublish={(lesson) => void change("lessons", lesson.id, { published: !lesson.published })} /> : <section className="card admin-list admin-empty"><Sticker name="book" size={64} tilt={-8} /><h2>Chưa có bài {currentSkill}</h2><p>Tạo một lesson và chọn kỹ năng {currentSkill} trong Lộ trình & bài học, sau đó quay lại đây để nhập dữ liệu.</p><Link className="button primary" href="/admin/curriculum">Tạo bài học →</Link></section>}</>}
    {section === "listening" && <YoutubeLessonsAdmin />}
    {section === "vocabulary/library" && <VocabularyBank />}
    {section === "vocabulary/ielts-progress" && <VocabularyPhase5 />}
    {section === "vocabulary/translation" && <ViEnTranslationReview />}
    {section === "media" && <MediaLibrary />}
    {section === "ielts-bank" && <BankAdmin />}
    {section === "ai-content-factory" && <AiContentFactory />}
    {section.startsWith("news") && <AdminNews section={section} />}
    </>}
    {section === "users" && (learnerId ? <AdminLearnerDetail key={learnerId} id={learnerId} /> : <AdminLearners />)}
    {section === "users/broadcast" && <AdminBroadcast />}
    {section === "users/audit" && <AdminAudit />}
  </AdminShell>;
}
