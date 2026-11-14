"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, FileText, FolderTree, GraduationCap, Headphones, Image, Languages, LayoutDashboard, Layers, Mic, PenLine, Newspaper, ScrollText, Plus, Search, Shapes, LibraryBig, UsersRound, AudioLines, ChartNoAxesCombined, type LucideIcon } from "lucide-react";
import { BankAdmin, type BankWorkspace } from "@/features/ielts/bank-admin";
import { AiContentFactory } from "@/features/ai-factory/ai-content-factory";
import { Sticker } from "@/components/stickers/stickers";
import { HeadIcon } from "@/components/ui/head-icon";
import { AdminShell, type AdminNavGroup } from "./admin-shell";
import { AdminCardHead, AdminNotice, AdminTabs, type AdminTabGroup } from "./admin-ui";
import { createClient } from "@/lib/supabase/browser";
import { assertPublishRightsEvidence, type RightsEvidence } from "@/lib/content-rights";
import { LessonContentEditor } from "./lesson-content-editor";
import { MediaLibrary } from "./media-library";
import { skillMaterialSchema, type SkillName } from "@/lib/skill-material";
import { AdminNews } from "./admin-news";
import { AdminRightsEvidence } from "./admin-rights-evidence";
import { VocabularyBank } from "./vocabulary-bank";
import { VocabularyPhase5 } from "./vocabulary-phase5";
import { ViEnTranslationReview } from "./vi-en-translation-review";
import { YoutubeLessonsAdmin } from "./youtube-lessons";
import { VoaDictationAdmin } from "./voa-dictation-admin";
import { AdminAnalytics } from "./admin-analytics";
import { AdminAudit, AdminBroadcast, AdminLearnerDetail, AdminLearners } from "./admin-learners";

type Course = { id: string; stage_id: string; slug: string; title: string; description: string; published: boolean };
type Unit = { id: string; course_id: string; slug: string; title: string; published: boolean };
type Lesson = { id: string; unit_id: string; slug: string; title: string; skill: SkillName; summary: string; published: boolean };
const skillTabs = ["Vocabulary", "Grammar", "Reading", "Listening", "Writing", "Speaking"] as const;
const skillIcons: Record<(typeof skillTabs)[number], LucideIcon> = { Vocabulary: Languages, Grammar: BookOpen, Reading: FileText, Listening: Headphones, Writing: PenLine, Speaking: Mic };

/**
 * Every admin page: `tab` is its label in the page's tab bar, `parent` puts a sub page under one sidebar entry.
 * Feature names (Reading, Daily News…) stay English, everything else is Vietnamese.
 */
type Page = { slug: string; title: string; tab?: string; icon: LucideIcon; parent?: string; description: string };
const pages: Page[] = [
  { slug: "overview", title: "Tổng quan", icon: LayoutDashboard, description: "Tình trạng nội dung theo kỹ năng, bài mới cập nhật và lối tắt tới các khu biên soạn." },
  { slug: "analytics", title: "Lượt truy cập", icon: ChartNoAxesCombined, description: "Lượt xem trang, lượt truy cập, khách và học viên, đăng nhập và học bài theo ngày (giờ Việt Nam)." },
  { slug: "users", title: "Học viên", tab: "Danh sách học viên", icon: UsersRound, description: "Theo dõi hoạt động, streak và quản lý từng tài khoản: khóa, cấm chat, giao nhiệm vụ, đặt mục tiêu." },
  { slug: "users/broadcast", parent: "users", title: "Học viên", tab: "Thông báo & giao bài", icon: UsersRound, description: "Gửi thông báo, giao nhiệm vụ và đặt mục tiêu ngày cho cả lớp cùng lúc." },
  { slug: "users/audit", parent: "users", title: "Học viên", tab: "Nhật ký admin", icon: UsersRound, description: "Mọi thao tác của admin trên tài khoản học viên đều được ghi lại tại đây." },
  { slug: "curriculum", title: "Lộ trình & bài học", icon: GraduationCap, description: "Tạo khóa học, unit và bài học; xuất bản khi nội dung và hồ sơ quyền đã đủ." },
  { slug: "rights", title: "Hồ sơ quyền", icon: ScrollText, description: "Lưu tác giả, chủ sở hữu và văn bản cho phép trước khi xuất bản bất kỳ nội dung nào." },
  { slug: "media", title: "Thư viện media", icon: Image, description: "Hình minh họa và âm thanh dùng trong bài học. Tải lên rồi sao chép URL để gắn vào bài." },
  { slug: "ielts-bank", title: "Ngân hàng IELTS", icon: LibraryBig, description: "Toàn bộ đề luyện thi bốn kỹ năng: kiểm tra đề, đáp án, nguồn và trạng thái xuất bản." },
  { slug: "ai-content-factory", title: "AI Content Factory", icon: Shapes, description: "Tạo đề bằng AI, nghe thử audio, kiểm tra đáp án và duyệt trước khi xuất bản." },
  { slug: "vocabulary", title: "Vocabulary", tab: "Bài học từ vựng", icon: Languages, description: "Bài học từ vựng trong lộ trình, kho từ IELTS, tiến độ chủ đề và câu luyện dịch." },
  { slug: "vocabulary/library", parent: "vocabulary", title: "Vocabulary", tab: "Kho từ & nhập ZIP", icon: Languages, description: "Nhập gói từ vựng đã biên soạn, rà soát từng mục và xuất bản cho học viên." },
  { slug: "vocabulary/ielts-progress", parent: "vocabulary", title: "Vocabulary", tab: "Tiến độ chủ đề", icon: Languages, description: "Theo dõi 40 chủ đề học, số mục đã xuất bản và tiến độ biên soạn mới." },
  { slug: "vocabulary/translation", parent: "vocabulary", title: "Vocabulary", tab: "Duyệt câu dịch", icon: Languages, description: "Duyệt câu luyện dịch Việt → Anh trước khi hiện cho học viên." },
  { slug: "grammar", title: "Grammar", icon: BookOpen, description: "Biên soạn bài ngữ pháp trong lộ trình: lý thuyết, ví dụ và câu hỏi có đáp án." },
  { slug: "reading", title: "Reading", icon: FileText, description: "Kho đề Reading luyện thi và bài Reading trong lộ trình là hai kho riêng." },
  { slug: "listening", title: "Listening", icon: Headphones, description: "Kho đề Listening, bài nghe trong lộ trình và bài nghe qua video YouTube." },
  { slug: "writing", title: "Writing", icon: PenLine, description: "Đề Writing, bài chấm của học viên và bài Writing trong lộ trình." },
  { slug: "speaking", title: "Speaking", icon: Mic, description: "Đề Speaking luyện thi và bài Speaking trong lộ trình." },
  { slug: "dictation", title: "Dictation", icon: AudioLines, description: "Kiểm duyệt bài nghe chép chính tả: transcript, mốc thời gian, CEFR và quyền sử dụng." },
  { slug: "news", title: "Daily News", tab: "Tổng quan", icon: Newspaper, description: "Tin tự đồng bộ, tin thêm tay và bài luyện đọc. Chỉ tin đã duyệt mới hiện cho học viên." },
  { slug: "news/review", parent: "news", title: "Daily News", tab: "Duyệt tin", icon: Newspaper, description: "Kiểm duyệt tin nhập về: xuất bản, ẩn, lưu trữ hoặc xóa." },
  { slug: "news/manual", parent: "news", title: "Daily News", tab: "Thêm tin", icon: Newspaper, description: "Thêm tin thủ công kèm toàn văn, ảnh và hồ sơ quyền." },
  { slug: "news/facts", parent: "news", title: "Daily News", tab: "Bài từ dữ kiện", icon: Newspaper, description: "Viết bài mới từ dữ kiện đã kiểm chứng, có danh sách nguồn đi kèm." },
  { slug: "news/articles", parent: "news", title: "Daily News", tab: "Bài luyện", icon: Newspaper, description: "Bài đọc biên soạn riêng kèm từ vựng và câu hỏi." },
  { slug: "news/sources", parent: "news", title: "Daily News", tab: "Nguồn tin", icon: Newspaper, description: "Nguồn RSS/GDELT, căn cứ quyền và lịch đồng bộ của từng nguồn." },
  { slug: "news/meaning-suggestions", parent: "news", title: "Daily News", tab: "Góp ý nghĩa từ", icon: Newspaper, description: "Góp ý nghĩa từ do học viên gửi khi đọc tin." },
  { slug: "news/sync-logs", parent: "news", title: "Daily News", tab: "Nhật ký", icon: Newspaper, description: "Nhật ký đồng bộ nguồn tin và lượt tạo ảnh, câu hỏi." },
  { slug: "news/settings", parent: "news", title: "Daily News", tab: "Cấu hình & prompt", icon: Newspaper, description: "Lịch tự động, giới hạn hằng ngày và hướng dẫn cho AI." },
];
const navGroups = [
  { label: "Tổng quan", slugs: ["overview", "analytics"] },
  { label: "Học viên", slugs: ["users"] },
  { label: "Nội dung", slugs: ["curriculum", "rights", "media"] },
  { label: "Ngân hàng đề", slugs: ["ielts-bank", "ai-content-factory"] },
  { label: "Kỹ năng", slugs: ["vocabulary", "grammar", "reading", "listening", "writing", "speaking", "dictation"] },
  { label: "Daily News", slugs: ["news"] },
];
const bankWorkspaces: { id: BankWorkspace; label: string }[] = [
  { id: "library", label: "Kho đề" },
  { id: "import", label: "Nhập đề" },
  { id: "sources", label: "Nguồn & đồng bộ" },
  { id: "activity", label: "Lượt làm đề" },
  { id: "grading", label: "Chấm Writing" },
];
const stages = ["foundation", "elementary", "pre-ielts", "ielts-starter", "ielts-builder", "ielts-advanced", "mastery"];

function StatusPill({ published }: { published: boolean }) {
  return <span className={published ? "status-pill live" : "status-pill draft"}><i aria-hidden="true" />{published ? "Đã xuất bản" : "Bản nháp"}</span>;
}

export function AdminEditor() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const segment = pathname.split("/").slice(2).join("/") || "overview";
  // /admin/users/<id> opens one learner inside the Học viên section.
  const learnerId = /^users\/[0-9a-f-]{36}$/.test(segment) ? segment.slice("users/".length) : null;
  const section = learnerId ? "users" : pages.some((item) => item.slug === segment) ? segment : "overview";
  const page = pages.find((item) => item.slug === section)!;
  const root = page.parent ?? page.slug;
  const currentSkill = skillTabs.find((item) => item.toLowerCase() === section);
  const bankSkill = currentSkill && (["Reading", "Listening", "Writing", "Speaking"] as string[]).includes(currentSkill) ? currentSkill as "Reading" | "Listening" | "Writing" | "Speaking" : null;
  const [skillView, setSkillView] = useState<BankWorkspace | "lessons" | "youtube">("library");
  // Each section opens on its first tab; reset during render when the route changes.
  const [viewSection, setViewSection] = useState(section);
  if (viewSection !== section) { setViewSection(section); setSkillView("library"); }
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
  const [listKind, setListKind] = useState<"courses" | "units" | "lessons">("courses");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "draft">("all");

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
    const assets: { kind: "audio" | "image"; url: string | null }[] = [];
    if (table === "lessons" && patch.published === true) {
      const lesson = lessons.find((item) => item.id === id);
      const material = await supabase.from("lesson_materials").select("content").eq("lesson_id", id).maybeSingle();
      const parsed = skillMaterialSchema.safeParse(material.data?.content);
      if (material.error || !parsed.success || parsed.data.skill !== lesson?.skill) { setError("Hãy lưu dữ liệu riêng của kỹ năng trước khi xuất bản bài học."); return; }
      if (parsed.data.figure.url) assets.push({ kind: "image", url: parsed.data.figure.url });
      if (parsed.data.skill === "Listening" && parsed.data.audioUrl) assets.push({ kind: "audio", url: parsed.data.audioUrl });
      const blocks = await supabase.from("lesson_blocks").select("kind,body").eq("lesson_id", id).eq("kind", "audio");
      if (blocks.error) { setError(blocks.error.message); return; }
      for (const block of blocks.data ?? []) assets.push({ kind: "audio", url: /^https:\/\//.test(block.body) ? block.body : null });
      if (["Reading", "Listening", "Grammar"].includes(lesson.skill)) {
        const questions = await supabase.from("exercise_questions").select("id").eq("lesson_id", id).limit(1);
        if (questions.error || !questions.data?.length) { setError("Bài này cần ít nhất một câu hỏi có đáp án trước khi xuất bản."); return; }
      }
      if (lesson.skill === "Vocabulary") {
        const words = await supabase.from("vocabulary_entries").select("id").eq("lesson_id", id).limit(1);
        if (words.error || !words.data?.length) { setError("Bài Vocabulary cần ít nhất một từ trước khi xuất bản."); return; }
      }
    }
    if (patch.published === true && table !== "units") {
      const evidence = await supabase.from("content_rights_evidence").select("asset_kind,asset_url,author_name,rights_holder,permission_document_ref,permission_scope,web_publication_allowed,commercial_use_allowed,modification_translation_allowed,source_package_name,source_package_sha256")
        .eq("content_kind", table === "courses" ? "course" : "lesson").eq("content_id", id);
      if (evidence.error) { setError(`Không đọc được hồ sơ quyền: ${evidence.error.message}`); return; }
      try { assertPublishRightsEvidence((evidence.data ?? []) as RightsEvidence[], assets); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Thiếu hồ sơ quyền."); return; }
    }
    const { error } = await supabase.from(table).update(patch).eq("id", id);
    if (error) setError(error.message); else await load();
  }
  async function remove(table: "courses" | "units" | "lessons", id: string) {
    if (!window.confirm("Xóa mục này cùng toàn bộ nội dung con? Không thể hoàn tác.")) return;
    setError("");
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setError(error.message); else await load();
  }

  const groups: AdminNavGroup[] = navGroups.map((group) => ({
    label: group.label,
    items: group.slugs.map((itemSlug) => {
      const item = pages.find((entry) => entry.slug === itemSlug)!;
      return { href: itemSlug === "overview" ? "/admin" : `/admin/${itemSlug}`, label: item.title, icon: item.icon, active: root === itemSlug };
    }),
  }));
  const published = (rows: { published: boolean }[]) => rows.filter((item) => item.published).length;

  // One tab bar under the heading: sibling pages for grouped sections, workspaces for the question banks.
  const family = pages.filter((item) => item.slug === root || item.parent === root);
  let tabGroups: AdminTabGroup[] | null = family.length > 1 ? [{ items: family.map((item) => ({ id: item.slug, label: item.tab ?? item.title, href: `/admin/${item.slug}`, active: section === item.slug })) }] : null;
  if (section === "ielts-bank") tabGroups = [{ items: bankWorkspaces.map((item) => ({ id: item.id, label: item.label, active: skillView === item.id, onClick: () => setSkillView(item.id) })) }];
  if (bankSkill) {
    const lessonsForSkill = lessons.filter((item) => item.skill === bankSkill);
    tabGroups = [
      { label: "Đề luyện thi", items: bankWorkspaces.filter((item) => item.id !== "grading" || bankSkill === "Writing").map((item) => ({ id: item.id, label: item.label, active: skillView === item.id, onClick: () => setSkillView(item.id) })) },
      { label: "Lộ trình", items: [
        { id: "lessons", label: `Bài học ${bankSkill}`, count: lessonsForSkill.length, active: skillView === "lessons", onClick: () => setSkillView("lessons") },
        ...(bankSkill === "Listening" ? [{ id: "youtube", label: "Video YouTube", active: skillView === "youtube", onClick: () => setSkillView("youtube") }] : []),
      ] },
    ];
  }
  const bankView: BankWorkspace = skillView === "lessons" || skillView === "youtube" ? "library" : skillView === "grading" && bankSkill && bankSkill !== "Writing" ? "library" : skillView;
  const showLessons = currentSkill && (!bankSkill || skillView === "lessons");

  const listRows = listKind === "courses" ? courses : listKind === "units" ? units : lessons;
  const parentName = (row: Course | Unit | Lesson) => "course_id" in row ? courses.find((item) => item.id === row.course_id)?.title : "unit_id" in row ? units.find((item) => item.id === row.unit_id)?.title : row.stage_id;
  const filteredRows = (listRows as (Course | Unit | Lesson)[]).filter((row) => (statusFilter === "all" || (statusFilter === "live") === row.published) && (!query.trim() || `${row.title} ${row.slug}`.toLowerCase().includes(query.trim().toLowerCase())));

  return <AdminShell groups={groups} section={page.tab && page.parent ? `${page.title} · ${page.tab}` : page.title} title={page.title} icon={page.icon} description={page.description} mode="live"
    actions={section === "overview" ? <Link prefetch={false} className="button primary" href="/admin/curriculum"><Plus size={16} /> Tạo nội dung</Link> : section === "curriculum" ? <button type="button" className="button primary" onClick={() => { const form = document.getElementById("tao-noi-dung"); form?.scrollIntoView({ behavior: "smooth", block: "center" }); form?.querySelector("input")?.focus({ preventScroll: true }); }}><Plus size={16} /> Tạo nội dung</button> : undefined}
    tabs={tabGroups ? <AdminTabs label={`Mục trong ${page.title}`} groups={tabGroups} /> : undefined}>
    {error && <AdminNotice tone="error">{error}</AdminNotice>}
    {loading ? <section className="card admin-card admin-loading" role="status"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" />Đang tải dữ liệu quản trị…</section> : <>
    {section === "overview" && <><div className="admin-stats stagger">
      <article><HeadIcon icon={FolderTree} /><span>Khóa học</span><strong>{courses.length}</strong><small>{published(courses)} đã xuất bản</small></article>
      <article><HeadIcon icon={Layers} tone="sky" /><span>Unit</span><strong>{units.length}</strong><small>{published(units)} đã xuất bản</small></article>
      <article><HeadIcon icon={BookOpen} tone="coral" /><span>Bài học</span><strong>{lessons.length}</strong><small>{published(lessons)} đã xuất bản</small></article>
      <article><HeadIcon icon={Shapes} tone="lavender" /><span>Bản nháp</span><strong>{lessons.length - published(lessons)}</strong><small>Bài học chưa xuất bản</small></article>
    </div>
    <div className="admin-overview-grid">
      <section className="card admin-card"><AdminCardHead title="Biên soạn theo kỹ năng" description="Mở một kỹ năng để nhập bài đọc, audio, đề viết, câu hỏi hoặc từ vựng. Bản nháp chỉ admin xem được." /><div className="admin-quick-links">{skillTabs.map((name) => { const Icon = skillIcons[name]; const rows = lessons.filter((item) => item.skill === name); return <Link prefetch={false} key={name} href={`/admin/${name.toLowerCase()}`} className="lift"><span className="admin-quick-icon"><Icon size={19} /></span><span><strong>{name}</strong><small>{rows.length} bài · {published(rows)} đã xuất bản</small></span><ChevronRight size={17} /></Link>; })}</div></section>
      <section className="card admin-card"><AdminCardHead title="Tỷ lệ xuất bản" description="Bài đã xuất bản trên tổng số bài của từng kỹ năng." /><div className="admin-coverage">{skillTabs.map((name) => { const rows = lessons.filter((item) => item.skill === name); const live = published(rows); return <div className="admin-coverage-row" key={name}><span>{name}</span><div className="admin-coverage-track"><i style={{ width: `${rows.length ? live / rows.length * 100 : 0}%` }} /></div><b>{live}/{rows.length}</b></div>; })}</div></section>
    </div>
    <section className="card admin-card"><AdminCardHead title="Bài học gần đây"><Link prefetch={false} className="admin-link" href="/admin/curriculum">Xem lộ trình <ChevronRight size={15} /></Link></AdminCardHead>{lessons.length ? <div className="admin-table">{lessons.slice(0, 6).map((item) => <div className="admin-row" key={item.id}><div><strong>{item.title}</strong><small>{item.skill} · /{item.slug}</small></div><StatusPill published={item.published} /><div><Link prefetch={false} href={`/admin/${item.skill.toLowerCase()}`} className="button subtle">Biên soạn</Link></div></div>)}</div> : <div className="admin-empty-state"><Sticker name="pencil" size={64} tilt={-8} /><div><h3>Chưa có bài học nào</h3><p>Tạo khóa học, unit rồi bài học đầu tiên trong Lộ trình & bài học.</p></div><Link prefetch={false} className="button primary" href="/admin/curriculum">Tạo bài học</Link></div>}</section></>}
    {section === "curriculum" && <>
    <section className="card admin-card" id="tao-noi-dung"><AdminCardHead title="Tạo nội dung mới" description="Nội dung mới luôn là bản nháp. Tạo theo thứ tự khóa học → unit → bài học." />
      <form onSubmit={create} className="admin-form admin-form-inline">
        <label>Loại nội dung<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="course">Khóa học</option><option value="unit">Unit</option><option value="lesson">Bài học</option></select></label>
        {kind === "course" ? <label>Chặng<select value={stage} onChange={(e) => setStage(e.target.value)}>{stages.map((value) => <option key={value}>{value}</option>)}</select></label> :
          kind === "unit" ? <label>Thuộc khóa học<select required value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">Chọn khóa học</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> :
          <><label>Thuộc unit<select required value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">Chọn unit</option>{units.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Kỹ năng<select value={skill} onChange={(e) => setSkill(e.target.value)}>{skillTabs.map((value) => <option key={value}>{value}</option>)}</select></label></>}
        <label>Tiêu đề<input required minLength={3} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: A day in a new city" /></label>
        <label>Đường dẫn (slug)<input required pattern="[a-z0-9-]+" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="a-day-in-a-new-city" /></label>
        <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Tạo bản nháp"}</button>
      </form>
    </section>
    <section className="card admin-card">
      <AdminCardHead title="Danh sách nội dung" count={filteredRows.length} />
      <div className="admin-toolbar">
        <div className="admin-segment" role="group" aria-label="Loại nội dung">{([["courses", "Khóa học", courses.length], ["units", "Unit", units.length], ["lessons", "Bài học", lessons.length]] as const).map(([value, label, total]) => <button type="button" key={value} aria-pressed={listKind === value} className={listKind === value ? "active" : ""} onClick={() => setListKind(value)}>{label} <b>{total}</b></button>)}</div>
        <label className="admin-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc slug" aria-label="Tìm nội dung" /></label>
        <div className="admin-chips" role="group" aria-label="Lọc trạng thái">{([["all", "Tất cả"], ["live", "Đã xuất bản"], ["draft", "Bản nháp"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={statusFilter === value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
      </div>
      {!filteredRows.length ? <p className="admin-empty-line">Không có mục nào khớp bộ lọc.</p> : <div className="admin-table-wrap"><table className="admin-data-table">
        <thead><tr><th scope="col">Tên</th><th scope="col">{listKind === "courses" ? "Chặng" : listKind === "units" ? "Khóa học" : "Unit · kỹ năng"}</th><th scope="col">Trạng thái</th><th scope="col" className="is-actions">Thao tác</th></tr></thead>
        <tbody>{filteredRows.map((item) => <tr key={item.id}>
          <td><strong>{item.title}</strong><small>/{item.slug}</small></td>
          <td className="is-muted">{parentName(item) ?? "—"}{"skill" in item ? ` · ${item.skill}` : ""}</td>
          <td><StatusPill published={item.published} /></td>
          <td className="is-actions"><div className="admin-row-actions">
            <button type="button" className="button subtle" onClick={() => { const name = window.prompt("Tên mới", item.title)?.trim(); if (name) void change(listKind, item.id, { title: name }); }}>Đổi tên</button>
            {listKind !== "units" && <Link prefetch={false} className="button subtle" href={`/admin/rights?kind=${listKind === "courses" ? "course" : "lesson"}&id=${item.id}`}>Hồ sơ quyền</Link>}
            <button type="button" className="button subtle" onClick={() => void change(listKind, item.id, { published: !item.published })}>{item.published ? "Gỡ xuất bản" : "Xuất bản"}</button>
            <button type="button" className="button subtle is-danger" onClick={() => void remove(listKind, item.id)}>Xóa</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    </>}
    {(bankSkill && skillView !== "lessons" && skillView !== "youtube") && <BankAdmin skillScope={bankSkill} workspace={bankView} onWorkspaceChange={setSkillView} />}
    {showLessons && (lessons.some((item) => item.skill === currentSkill) ? <LessonContentEditor key={currentSkill} lessons={lessons.filter((item) => item.skill === currentSkill)} onPublish={(lesson) => void change("lessons", lesson.id, { published: !lesson.published })} /> : <section className="card admin-card"><div className="admin-empty-state"><Sticker name="book" size={64} tilt={-8} /><div><h3>Chưa có bài {currentSkill}</h3><p>Tạo một bài học với kỹ năng {currentSkill} trong Lộ trình & bài học, rồi quay lại đây để nhập nội dung.</p></div><Link prefetch={false} className="button primary" href="/admin/curriculum">Tạo bài học</Link></div></section>)}
    {section === "listening" && skillView === "youtube" && <YoutubeLessonsAdmin />}
    {section === "dictation" && <VoaDictationAdmin />}
    {section === "vocabulary/library" && <VocabularyBank />}
    {section === "vocabulary/ielts-progress" && <VocabularyPhase5 />}
    {section === "vocabulary/translation" && <ViEnTranslationReview />}
    {section === "media" && <MediaLibrary />}
    {section === "rights" && <AdminRightsEvidence />}
    {section === "ielts-bank" && <BankAdmin workspace={skillView === "lessons" || skillView === "youtube" ? "library" : skillView} onWorkspaceChange={setSkillView} />}
    {section === "ai-content-factory" && <AiContentFactory />}
    {section.startsWith("news") && <AdminNews section={section} />}
    </>}
    {section === "analytics" && <AdminAnalytics />}
    {section === "users" && (learnerId ? <AdminLearnerDetail key={learnerId} id={learnerId} /> : <AdminLearners />)}
    {section === "users/broadcast" && <AdminBroadcast />}
    {section === "users/audit" && <AdminAudit />}
  </AdminShell>;
}
