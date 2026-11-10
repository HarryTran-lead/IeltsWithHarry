"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BookOpenText, Check, ChevronLeft, ChevronRight, Eye, FileJson2, Headphones, Mic, PenLine, Plus, RefreshCw, Search, Settings2, Trash2, Upload, X } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { BankAdminPreview } from "./bank-admin-preview";
import { WritingGradingAdmin } from "./bank-writing-admin";
import "./bank-admin.css";

type Skill = "Reading" | "Listening" | "Writing" | "Speaking";
type Workspace = "library" | "import" | "sources" | "activity" | "grading";
type DetailTab = "preview" | "content" | "metadata";
type Version = { id: string; content: ExamContent; warnings: string[]; revision: number; upstream_version: string; created_at: string } | null;
type Exam = { id: string; title: string; skill: Skill; status: string; mode: string; format: string; practice_type: string; topic: string | null; difficulty: string | null; duration_minutes: number; source_id: string; attribution: string; license: string; license_url: string; source_url: string; ai_generated: boolean; updated_at: string; current_version_id: string | null; published_version_id: string | null; ielts_exam_versions?: { warnings: string[]; revision: number } | null };
type Detail = { exam: Exam; currentVersion: Version; publishedVersion: Version };
type Source = { id: string; name: string; enabled: boolean; approved: boolean; license: string; sync_hours: number; last_synced_at: string | null };
type Job = { id: string; source_id: string; status: string; inserted: number; updated: number; skipped: number; failed: number; started_at: string };
type Attempt = { id: string; user_id: string; state: string; score: number | null; total: number | null; started_at: string; ielts_exams: { title: string; skill: string } | null };
type Meta = { title: string; topic: string; difficulty: string; format: string; mode: string; durationMinutes: number; attribution: string; license: string; licenseUrl: string; sourceUrl: string };

const skills: { id: Skill; icon: typeof BookOpenText; color: string }[] = [
  { id: "Reading", icon: BookOpenText, color: "teal" },
  { id: "Listening", icon: Headphones, color: "blue" },
  { id: "Writing", icon: PenLine, color: "amber" },
  { id: "Speaking", icon: Mic, color: "coral" },
];
const statusNames: Record<string, string> = { needs_review: "Chờ duyệt", ready: "Đã duyệt", published: "Đã xuất bản", rejected: "Từ chối", archived: "Lưu trữ" };
const statusTabs = [{ value: "", label: "Tất cả đề" }, { value: "public", label: "Học viên đang thấy" }, { value: "needs_review", label: "Chờ duyệt" }, { value: "ready", label: "Đã duyệt" }] as const;
const metaFrom = (exam: Exam): Meta => ({ title: exam.title, topic: exam.topic ?? "", difficulty: exam.difficulty ?? "", format: exam.format, mode: exam.mode, durationMinutes: exam.duration_minutes, attribution: exam.attribution, license: exam.license, licenseUrl: exam.license_url, sourceUrl: exam.source_url });
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);

export function BankAdmin({ skillScope }: { skillScope?: Skill } = {}) {
  const [workspace, setWorkspace] = useState<Workspace>("library");
  const [skill, setSkill] = useState<Skill | "">(skillScope ?? "");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [delayedSearch, setDelayedSearch] = useState("");
  const loadGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const [page, setPage] = useState(0);
  const [exams, setExams] = useState<Exam[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [publishedCounts, setPublishedCounts] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [pausedSkills, setPausedSkills] = useState<Skill[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("preview");
  const [versionView, setVersionView] = useState<"current" | "published">("current");
  const [draft, setDraft] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [manualJson, setManualJson] = useState("");
  const [bulkExams, setBulkExams] = useState<Record<string, unknown>[]>([]);
  const [bulkQuality, setBulkQuality] = useState<string[]>([]);
  const [bulkProgress, setBulkProgress] = useState("");
  const [permission, setPermission] = useState(false);
  const [jobItems, setJobItems] = useState<{ external_id: string; status: string; detail: string }[]>([]);
  const [openJob, setOpenJob] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(false);

  useEffect(() => {
    if (skillScope) { void Promise.resolve().then(() => setSkill(skillScope)); return; }
    const requested = new URLSearchParams(window.location.search).get("skill");
    if (skills.some((item) => item.id === requested)) void Promise.resolve().then(() => setSkill(requested as Skill));
  }, [skillScope]);
  useEffect(() => { const timer = window.setTimeout(() => setDelayedSearch(search), 250); return () => window.clearTimeout(timer); }, [search]);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const params = new URLSearchParams({ page: String(page), skill, status, source_id: source, q: delayedSearch.trim() });
    const response = await fetch(`/api/ielts/bank/admin?${params}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không tải được kho đề");
    if (generation !== loadGeneration.current) return;
    setExams(data.exams ?? []); setTotal(data.total ?? 0); setCounts(data.skillCounts ?? {}); setPublishedCounts(data.publishedCounts ?? {});
    setSelectedIds((ids) => ids.filter((id) => (data.exams ?? []).some((exam: Exam) => exam.id === id && exam.published_version_id)));
    setSchemaReady(data.schemaReady === true);
    setSources(data.sources ?? []); setJobs(data.jobs ?? []); setAttempts(data.attempts ?? []);
    setPausedSkills((data.pausedSkills ?? []).filter((item: { paused: boolean }) => item.paused).map((item: { skill: Skill }) => item.skill));
  }, [page, skill, status, source, delayedSearch]);
  useEffect(() => { let live = true; Promise.resolve().then(() => load()).catch((cause) => { if (live) setError(failure(cause)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    const generation = ++detailGeneration.current;
    const response = await fetch(`/api/ielts/bank/admin?examId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không mở được đề");
    const item = data as Detail;
    if (generation !== detailGeneration.current) return item;
    setDetail(item);
    setDraft(JSON.stringify(item.currentVersion?.content ?? {}, null, 2));
    setMeta(metaFrom(item.exam));
    return item;
  }, []);
  useEffect(() => { if (!selectedId) return; let live = true; Promise.resolve().then(() => loadDetail(selectedId)).catch((cause) => { if (live) setError(failure(cause)); }); return () => { live = false; }; }, [selectedId, loadDetail]);
  useEffect(() => { if (!selectedId) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedId(null); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [selectedId]);

  function open(exam: Exam, tab: DetailTab = "preview") {
    detailGeneration.current++;
    setError(""); setNotice(""); setDetail(null); setSelectedId(exam.id); setDetailTab(tab); setVersionView("current");
  }
  async function command(body: Record<string, unknown>, success = "Đã lưu thay đổi.") {
    setBusy(true); setError(""); setNotice("");
    try {
      let data: Record<string, unknown> = {};
      let unpublished = 0;
      let completed = false;
      for (let batch = 0; batch < (["sync", "unpublishSkill"].includes(String(body.action)) ? 100 : 1); batch++) {
        const response = await fetch("/api/ielts/bank/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        data = await response.json();
        if (!response.ok) throw new Error(String(data.error || "Thao tác thất bại"));
        unpublished += Number(data.unpublished ?? 0);
        if (data.status !== "running") { completed = true; break; }
        if (data.busy) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!completed) throw new Error("Thao tác chưa hoàn tất. Hãy làm mới danh sách và thử lại.");
      await load();
      if (selectedId && !["delete", "deleteSkill"].includes(String(body.action))) await loadDetail(selectedId);
      setNotice(body.action === "deleteSkill" ? `Đã xóa ${data.deleted ?? 0} đề ${body.skill}.` : body.action === "unpublishSkill" ? `Đã gỡ xuất bản ${unpublished} đề ${body.skill}.` : body.action === "unpublishMany" ? `Đã gỡ xuất bản ${unpublished} đề đã chọn.` : success);
      return true;
    } catch (cause) { setError(failure(cause)); await load().catch(() => undefined); return false; }
    finally { setBusy(false); }
  }
  async function deleteExam(exam: Exam) {
    if (!schemaReady) return;
    if (window.prompt(`Xóa vĩnh viễn đề “${exam.title}” cùng lịch sử làm bài? Nhập XÓA để tiếp tục.`) !== "XÓA") return;
    if (await command({ action: "delete", examId: exam.id }, `Đã xóa đề “${exam.title}”.`)) { setSelectedId(null); setDetail(null); }
  }
  async function deleteSkill() {
    if (!skill || !schemaReady) return;
    const confirmation = window.prompt(`Xóa toàn bộ ${counts[skill] ?? 0} đề ${skill}, các bản sửa và lượt làm liên quan? Nhập DELETE ${skill} để tiếp tục.`);
    if (confirmation !== `DELETE ${skill}`) return;
    if (await command({ action: "deleteSkill", skill, confirmation })) { setSelectedId(null); setDetail(null); setPage(0); }
  }
  async function unpublishSelected() {
    if (!selectedIds.length || !window.confirm(`Gỡ xuất bản ${selectedIds.length} đề đã chọn? Học viên sẽ không thấy các đề này nữa.`)) return;
    if (await command({ action: "unpublishMany", examIds: selectedIds })) setSelectedIds([]);
  }
  async function unpublishSkill() {
    if (!skill || !publishedCounts[skill] || !window.confirm(`Gỡ xuất bản toàn bộ ${publishedCounts[skill]} đề ${skill} đang hiển thị cho học viên, kể cả các trang khác?`)) return;
    if (await command({ action: "unpublishSkill", skill })) setSelectedIds([]);
  }
  async function saveContent() {
    if (!detail?.currentVersion) return;
    try { await command({ action: "edit", examId: detail.exam.id, expectedVersionId: detail.currentVersion.id, content: JSON.parse(draft) }, "Đã lưu bản sửa mới vào hàng chờ duyệt."); }
    catch { setError("JSON không hợp lệ."); }
  }
  async function saveMeta() { if (detail && meta) await command({ action: "metadata", examId: detail.exam.id, ...meta }, "Đã cập nhật thông tin đề."); }
  async function loadImportFile(file: File) {
    setError(""); setBulkExams([]); setBulkQuality([]); setBulkProgress("");
    if (file.size > 1_500_000) { setError("Tệp vượt quá 1,5 MB."); return; }
    try {
      const raw = await file.text();
      const data = JSON.parse(raw);
      if (data?.kind === "ielts-reading-admin-bundle" && Array.isArray(data.exams)) {
        if (data.exams.length < 1 || data.exams.length > 20 || data.exams.some((exam: Record<string, unknown>) => exam.skill !== "Reading" || typeof exam.externalId !== "string" || !exam.content)) throw new Error("Gói đề Reading không hợp lệ.");
        setManualJson(""); setBulkExams(data.exams); setBulkQuality(Array.isArray(data.qualityFlags) ? data.qualityFlags.map(String) : []);
      } else { setManualJson(raw); }
    } catch (cause) { setError(failure(cause)); }
  }
  async function importReadingBundle() {
    if (!permission || !bulkExams.length) return;
    setBusy(true); setError(""); setNotice("");
    let published = 0;
    try {
      for (const exam of bulkExams) {
        const title = String(exam.title || exam.externalId);
        setBulkProgress(`Đang nhập ${published + 1}/${bulkExams.length}: ${title}`);
        const send = async (body: Record<string, unknown>) => {
          const response = await fetch("/api/ielts/bank/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const data = await response.json();
          if (!response.ok) throw new Error(String(data.error || `Không lưu được ${title}`));
          return data;
        };
        const imported = await send({ action: "manual", permissionConfirmed: true, exam });
        if (imported.warnings?.length) throw new Error(`${title}: ${imported.warnings.join(", ")}`);
        if (!imported.examId) throw new Error(`${title}: thiếu mã đề sau khi nhập.`);
        await send({ action: "ready", examId: imported.examId });
        await send({ action: "publish", examId: imported.examId });
        published++;
      }
      setBulkProgress(`Đã xuất bản ${published}/${bulkExams.length} bộ đề Reading.`);
      setNotice(`Đã nhập và xuất bản ${published} bộ đề Reading cho học viên.`);
      await load();
    } catch (cause) {
      setError(`Đã xuất bản ${published}/${bulkExams.length} đề. ${failure(cause)}`);
      await load().catch(() => undefined);
    } finally { setBusy(false); }
  }
  async function showJob(id: string) {
    setOpenJob(id); setError("");
    try { const response = await fetch(`/api/ielts/bank/admin?jobId=${id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); setJobItems(data.items ?? []); }
    catch (cause) { setError(failure(cause)); }
  }

  const selectedVersion = versionView === "published" ? detail?.publishedVersion : detail?.currentVersion;
  const selectedExam = detail?.exam;
  const hasPublic = Boolean(selectedExam?.published_version_id);
  const warnings = detail?.currentVersion?.warnings ?? [];
  const canPublish = Boolean(detail?.currentVersion && warnings.length === 0 && ["ready", "published"].includes(selectedExam?.status ?? ""));
  const firstResult = total ? page * 25 + 1 : 0;
  const lastResult = Math.min((page + 1) * 25, total);
  const visiblePublishedIds = exams.filter((exam) => Boolean(exam.published_version_id)).map((exam) => exam.id);
  const allVisibleSelected = visiblePublishedIds.length > 0 && visiblePublishedIds.every((id) => selectedIds.includes(id));

  return <div className="ba-root">
    <div className="ba-topline"><div><span className="ba-eyebrow">QUẢN LÝ KHO ĐỀ</span><p>Kiểm tra đề thực tế, đáp án và trạng thái trước khi học viên nhìn thấy.</p></div><button type="button" className="ba-refresh" onClick={() => void load()}><RefreshCw size={16} /> Làm mới</button></div>
    <nav className="ba-workspaces" aria-label="Khu quản lý ngân hàng IELTS">
      {([ ["library", "Kho đề"], ["import", "Nhập đề"], ["sources", "Nguồn & đồng bộ"], ["activity", "Hoạt động"], ["grading", "Chấm Writing"] ] as const).map(([id, label]) => <button type="button" key={id} className={workspace === id ? "active" : ""} aria-current={workspace === id ? "page" : undefined} onClick={() => setWorkspace(id)}>{label}</button>)}
    </nav>
    {error && <p className="ba-message is-error" role="alert">{error}</p>}
    {notice && <p className="ba-message" role="status"><Check size={16} />{notice}</p>}
    {!loading && !schemaReady && <p className="ba-message is-pending" role="status"><AlertTriangle size={17} /> Chức năng xóa đề và đồng bộ theo kỹ năng đang chờ cập nhật database. Xem, sửa và xuất bản đề vẫn hoạt động.</p>}

    {workspace === "library" && <>
      {!skillScope && <div className="ba-skill-grid"><button type="button" className={`ba-skill-card all ${skill === "" ? "active" : ""}`} onClick={() => { setSkill(""); setPage(0); setSelectedIds([]); }}><span>TẤT CẢ</span><strong>{Object.values(counts).reduce((sum, value) => sum + value, 0)}</strong><small>đề trong kho</small></button>{skills.map(({ id, icon: Icon, color }) => <button type="button" key={id} className={`ba-skill-card ${color} ${skill === id ? "active" : ""}`} onClick={() => { setSkill(id); setPage(0); setSelectedIds([]); }}><Icon size={21} /><span>{id}</span><strong>{counts[id] ?? 0}</strong><small>đề trong kho</small></button>)}</div>}
      <section className="ba-list-card">
        <div className="ba-list-head"><div><span className="ba-eyebrow">KHO ĐỀ LUYỆN THI</span><h2>{skill ? `Đề ${skill}` : "Tất cả đề IELTS"} <small>{total}</small></h2><p>Chọn “Xem bài thi” để làm thử và xem đáp án. Các nút bên phải dùng để duyệt, xuất bản hoặc sửa đề.</p></div><button type="button" className="ba-add" onClick={() => setWorkspace("import")}><Plus size={16} /> Nhập đề đã duyệt</button></div>
        <nav className="ba-status-tabs" aria-label="Lọc đề theo trạng thái">{statusTabs.map((tab) => <button key={tab.value} type="button" className={status === tab.value ? "active" : ""} aria-current={status === tab.value ? "page" : undefined} onClick={() => { setStatus(tab.value); setPage(0); setSelectedIds([]); }}>{tab.label}</button>)}</nav>
        <div className="ba-filters"><label className="ba-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); setSelectedIds([]); }} placeholder="Tìm theo tên đề" aria-label="Tìm theo tên đề" /></label><label className="ba-filter-field">Nguồn đề<select value={source} onChange={(event) => { setSource(event.target.value); setPage(0); setSelectedIds([]); }}><option value="">Tất cả nguồn</option>{sources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="ba-filter-field">Trạng thái khác<select aria-label="Trạng thái khác" value={statusTabs.some((tab) => tab.value === status) ? "" : status} onChange={(event) => { setStatus(event.target.value); setPage(0); setSelectedIds([]); }}><option value="">Chọn trạng thái</option><option value="rejected">Từ chối</option><option value="archived">Lưu trữ</option></select></label></div>
        <div className="ba-bulk-bar">
          <span>{selectedIds.length ? `Đã chọn ${selectedIds.length} đề đang hiển thị` : "Đánh dấu ô để chọn nhiều đề trên trang này."}</span>
          <div>
            {selectedIds.length > 0 && <><button type="button" className="ba-bulk-primary" disabled={busy} onClick={() => void unpublishSelected()}>Gỡ xuất bản {selectedIds.length} đề đã chọn</button><button type="button" disabled={busy} onClick={() => setSelectedIds([])}>Bỏ chọn</button></>}
            {skill && (publishedCounts[skill] ?? 0) > 0 && <button type="button" disabled={busy} onClick={() => void unpublishSkill()}>Gỡ toàn bộ {publishedCounts[skill]} đề {skill} đã xuất bản</button>}
          </div>
        </div>
        {loading ? <p className="ba-empty">Đang tải ngân hàng đề…</p> : exams.length ? <div className="ba-table-scroll"><table className="ba-table"><thead><tr><th scope="col" className="ba-select-cell"><input type="checkbox" aria-label="Chọn tất cả đề đã xuất bản trên trang này" title="Chọn các đề đã xuất bản trên trang này" checked={allVisibleSelected} disabled={busy || visiblePublishedIds.length === 0} onChange={(event) => setSelectedIds(event.target.checked ? visiblePublishedIds : [])} /></th><th scope="col">Tên đề</th>{!skillScope && <th scope="col">Kỹ năng</th>}<th scope="col">Học viên thấy?</th><th scope="col">Biên tập</th><th scope="col">Cập nhật</th><th scope="col">Thao tác</th></tr></thead><tbody>{exams.map((exam) => { const live = Boolean(exam.published_version_id); const changed = live && exam.current_version_id !== exam.published_version_id; const warningCount = exam.ielts_exam_versions?.warnings?.length ?? 0; const canApprove = !["ready", "published"].includes(exam.status) && warningCount === 0; const canRelease = ["ready", "published"].includes(exam.status) && warningCount === 0; return <tr key={exam.id}><td className="ba-select-cell"><input type="checkbox" aria-label={`Chọn đề ${exam.title}`} checked={selectedIds.includes(exam.id)} disabled={!live || busy} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, exam.id] : ids.filter((id) => id !== exam.id))} /></td><td><button type="button" className="ba-name" onClick={() => open(exam)}>{exam.title}</button><span className="ba-subline">{exam.format} · {exam.duration_minutes} phút · {exam.source_id}</span></td>{!skillScope && <td><span className="ba-skill-label">{exam.skill}</span></td>}<td>{live ? <span className="ba-live">Đang hiển thị</span> : <span className="ba-hidden">Chưa hiển thị</span>}{changed && <span className="ba-subline">Có bản sửa chưa xuất bản</span>}</td><td><span className={`ba-status ${exam.status}`}>{statusNames[exam.status] ?? exam.status}</span><span className="ba-subline">Bản {exam.ielts_exam_versions?.revision ?? "—"}{warningCount > 0 ? ` · ${warningCount} lỗi cần sửa` : ""}</span></td><td><span className="ba-date">{new Date(exam.updated_at).toLocaleDateString("vi-VN")}</span></td><td><div className="ba-table-actions"><button type="button" className="ba-view" onClick={() => open(exam)}><Eye size={15} /> Xem bài thi</button><button type="button" onClick={() => open(exam, "content")}>Sửa</button>{canApprove && <button type="button" disabled={busy} onClick={() => void command({ action: "ready", examId: exam.id }, `Đã duyệt đề “${exam.title}”.`)}>Duyệt</button>}{canRelease && (!live || changed) && <button type="button" disabled={busy} onClick={() => void command({ action: "publish", examId: exam.id }, `Đã xuất bản đề “${exam.title}”.`)}>{live ? "Xuất bản bản sửa" : "Xuất bản"}</button>}{live && <button type="button" disabled={busy} onClick={() => void command({ action: "unpublish", examId: exam.id }, `Đã gỡ đề “${exam.title}”.`)}>Gỡ xuất bản</button>}<button type="button" className="ba-delete" disabled={busy || !schemaReady} aria-label={`Xóa đề ${exam.title}`} title="Xóa đề" onClick={() => void deleteExam(exam)}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div> : <div className="ba-empty"><BookOpenText size={30} /><h3>{search || status || source ? "Không có đề phù hợp" : `Kho đề ${skill || "IELTS"} đang trống`}</h3><p>{search || status || source ? "Thử tìm tên khác hoặc đổi bộ lọc." : "Hãy nhập bộ đề đã được kiểm duyệt để bắt đầu."}</p><button type="button" onClick={() => { setStatus(""); setSource(""); setSearch(""); setWorkspace("import"); }}><Plus size={16} /> Nhập đề</button></div>}
        <div className="ba-pagination"><span>Đang xem {firstResult}–{lastResult} trên {total} đề</span><div><button type="button" disabled={page === 0} onClick={() => { setPage(page - 1); setSelectedIds([]); }}><ChevronLeft size={16} /> Trước</button><button type="button" disabled={(page + 1) * 25 >= total} onClick={() => { setPage(page + 1); setSelectedIds([]); }}>Trang {page + 1} <ChevronRight size={16} /></button></div></div>
      </section>
      {skill && <section className="ba-danger"><div><AlertTriangle size={20} /><span><strong>Làm sạch toàn bộ kho {skill}</strong><small>Xóa đề, phiên bản và lượt làm liên quan. Đồng bộ tự động của kỹ năng này sẽ tạm dừng; nhập thủ công vẫn hoạt động.</small></span></div><button type="button" disabled={busy || !schemaReady || !counts[skill]} title={!schemaReady ? "Chờ cập nhật database" : undefined} onClick={() => void deleteSkill()}><Trash2 size={16} /> Xóa {counts[skill] ?? 0} đề {skill}</button></section>}
    </>}

    {workspace === "import" && <section className="ba-ops-card"><div className="ba-ops-head"><Upload size={22} /><div><h2>Nhập đề đã kiểm duyệt</h2><p>Chọn tệp JSON của một đề hoặc gói nhiều đề Reading. Gói Reading được nhập, duyệt và xuất bản lần lượt cho học viên.</p></div></div><div className="ba-import-body"><label className="ba-field">Chọn tệp đề<input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadImportFile(file); }} /></label>{bulkExams.length > 0 ? <div className="ba-bundle-preview"><h3>{bulkExams.length} bộ đề Reading sẵn sàng nhập</h3><ol>{bulkExams.map((exam, index) => <li key={String(exam.externalId)}>{String(exam.title)} · {Array.isArray((exam.content as ExamContent)?.sections) ? (exam.content as ExamContent).sections.reduce((sum, section) => sum + section.questions.length, 0) : 0} câu{bulkQuality[index] && <small> · Gói nguồn: {bulkQuality[index]}</small>}</li>)}</ol><p>Gói nguồn chưa xác nhận đã qua kiểm duyệt độc lập. Đáp án trong tệp chỉ được lưu trên server; học viên làm bài trước khi xem kết quả. Nếu một đề lỗi, quá trình dừng và hiển thị số đề đã xuất bản.</p></div> : <label className="ba-field">Nội dung JSON<textarea value={manualJson} onChange={(event) => setManualJson(event.target.value)} rows={17} spellCheck={false} placeholder='{"externalId":"...","skill":"Reading",...}' /></label>}<label className="ba-check"><input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} /> Tôi xác nhận có quyền tái sử dụng và xuất bản nội dung này.</label>{bulkProgress && <p className="ba-message" role="status">{bulkProgress}</p>}<button type="button" className="button primary" disabled={busy || !permission || (!bulkExams.length && !manualJson.trim())} onClick={() => { if (bulkExams.length) { void importReadingBundle(); return; } try { void command({ action: "manual", permissionConfirmed: true, exam: JSON.parse(manualJson) }, "Đã nhập đề vào hàng chờ duyệt."); } catch { setError("JSON không hợp lệ."); } }}>{bulkExams.length ? `Nhập và xuất bản ${bulkExams.length} đề Reading` : "Nhập vào hàng chờ"}</button></div></section>}

    {workspace === "sources" && <section className="ba-ops-card"><div className="ba-ops-head"><RefreshCw size={22} /><div><h2>Đồng bộ theo kỹ năng</h2><p>Kho vừa làm sạch sẽ không tự nhận lại đề cũ. Bạn vẫn có thể nhập đề đã duyệt thủ công.</p></div></div>{skills.map((item) => <div className="ba-source-row" key={item.id}><div><h3>{item.id}</h3><p>{pausedSkills.includes(item.id) ? "Đang tạm dừng nhập tự động" : "Cho phép nhập tự động từ nguồn đang bật"}</p></div><label><input type="checkbox" checked={!pausedSkills.includes(item.id)} disabled={busy || !schemaReady} title={!schemaReady ? "Chờ cập nhật database" : undefined} onChange={(event) => void command({ action: "pauseSkillSync", skill: item.id, paused: !event.target.checked }, event.target.checked ? `Đã bật đồng bộ ${item.id}.` : `Đã tạm dừng đồng bộ ${item.id}.`)} /> Cho phép đồng bộ</label></div>)}</section>}
    {workspace === "sources" && <><section className="ba-ops-card"><div className="ba-ops-head"><Settings2 size={22} /><div><h2>Nguồn dữ liệu</h2><p>Đồng bộ chỉ lấy nguồn có giấy phép được xác minh. Đề mới phải qua bước duyệt.</p></div></div>{sources.filter((item) => ["bandready", "ielts-ai-dataset"].includes(item.id)).map((item) => <div className="ba-source-row" key={item.id}><div><h3>{item.name}</h3><p>{item.license} · {item.last_synced_at ? `Lần cuối ${new Date(item.last_synced_at).toLocaleString("vi-VN")}` : "Chưa đồng bộ"}</p></div><label><input type="checkbox" checked={item.enabled} disabled={busy} onChange={(event) => void command({ action: "source", sourceId: item.id, enabled: event.target.checked })} /> Bật nguồn</label><label>Chu kỳ <input type="number" min={1} max={720} defaultValue={item.sync_hours} onBlur={(event) => { const value = Number(event.target.value); if (value !== item.sync_hours && value >= 1 && value <= 720) void command({ action: "source", sourceId: item.id, syncHours: value }); }} /> giờ</label><div><button type="button" disabled={busy} onClick={() => void command({ action: "sync", sourceId: item.id, dryRun: true }, "Đã chạy xem trước.")}>Xem trước</button><button type="button" disabled={busy || !item.enabled} onClick={() => void command({ action: "sync", sourceId: item.id }, "Đã đồng bộ nguồn.")}>Đồng bộ</button></div></div>)}</section><section className="ba-ops-card"><h2>Lịch sử đồng bộ</h2>{jobs.map((job) => <div className="ba-job-row" key={job.id}><span><strong>{job.source_id} · {job.status}</strong><small>{new Date(job.started_at).toLocaleString("vi-VN")}</small></span><span>+{job.inserted} · sửa {job.updated} · bỏ qua {job.skipped} · lỗi {job.failed}</span><button type="button" onClick={() => void showJob(job.id)}>Chi tiết</button>{job.status === "running" && <button type="button" onClick={() => void command({ action: "cancel", jobId: job.id })}>Hủy</button>}</div>)}{openJob && <div className="ba-job-details"><h3>100 mục gần nhất</h3>{jobItems.map((item, index) => <p key={`${item.external_id}:${index}`}><b>{item.status}</b> {item.external_id} {item.detail}</p>)}</div>}</section></>}

    {workspace === "activity" && <section className="ba-ops-card"><h2>Lượt làm đề gần đây</h2><p>Lịch sử này cũng bị xóa khi xóa vĩnh viễn đề tương ứng.</p>{attempts.length ? attempts.map((item) => <div className="ba-job-row" key={item.id}><span><strong>{item.ielts_exams?.title ?? "Bài luyện"}</strong><small>{item.ielts_exams?.skill} · học viên {item.user_id.slice(0, 8)} · {new Date(item.started_at).toLocaleString("vi-VN")}</small></span><span>{item.state} · {item.score == null ? "Chờ chấm" : `${item.score}/${item.total}`}</span></div>) : <p className="ba-empty">Chưa có lượt làm đề.</p>}</section>}
    {workspace === "grading" && <WritingGradingAdmin />}

    {selectedId && <div className="ba-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><section className="ba-detail" role="dialog" aria-modal="true" aria-label={`Quản lý đề ${selectedExam?.title ?? ""}`}>
      <header className="ba-detail-head"><button type="button" className="ba-back" onClick={() => setSelectedId(null)}><ArrowLeft size={18} /> Kho đề</button><div><span className="ba-eyebrow">{selectedExam?.skill ?? "ĐANG TẢI"} · {selectedExam?.source_id ?? ""}</span><h2>{selectedExam?.title ?? "Đang tải đề…"}</h2></div><button type="button" className="ba-close" aria-label="Đóng" autoFocus onClick={() => setSelectedId(null)}><X size={20} /></button></header>
      {error && <p className="ba-message is-error" role="alert">{error}</p>}
      {detail && <><div className="ba-detail-meta"><span className={`ba-status ${selectedExam?.status}`}>{statusNames[selectedExam?.status ?? ""] ?? selectedExam?.status}</span>{hasPublic && <span className="ba-live">Học viên đang thấy bản {detail.publishedVersion?.revision}</span>}{hasPublic && detail.currentVersion?.id !== detail.publishedVersion?.id && <span className="ba-draft">Bản sửa {detail.currentVersion?.revision} chưa xuất bản</span>}<span>{selectedExam?.practice_type?.replaceAll("_", " ")} · {selectedExam?.format}</span></div>
        {warnings.length > 0 && <div className="ba-warnings"><AlertTriangle size={18} /><span>Chưa thể duyệt: {warnings.join(", ")}</span></div>}
        <div className="ba-detail-actions"><button type="button" disabled={busy || warnings.length > 0 || selectedExam?.status === "ready"} onClick={() => void command({ action: "ready", examId: selectedId }, "Đề đã sẵn sàng xuất bản.")}><Check size={16} /> Duyệt</button><button type="button" className="primary" disabled={busy || !canPublish} onClick={() => void command({ action: "publish", examId: selectedId }, "Đề đã xuất bản cho học viên.")}>Xuất bản</button><button type="button" disabled={busy || !hasPublic} onClick={() => void command({ action: "unpublish", examId: selectedId }, "Đã gỡ đề khỏi kho học viên.")}>Gỡ xuất bản</button><button type="button" className="danger" disabled={busy || !schemaReady} title={!schemaReady ? "Chờ cập nhật database" : undefined} onClick={() => void deleteExam(detail.exam)}><Trash2 size={16} /> Xóa đề</button></div>
        <nav className="ba-detail-tabs" aria-label="Chế độ xem đề">{([ ["preview", "Xem như học viên", Eye], ["content", "Sửa nội dung", FileJson2], ["metadata", "Thông tin đề", Settings2] ] as const).map(([tab, label, Icon]) => <button type="button" key={tab} className={detailTab === tab ? "active" : ""} onClick={() => setDetailTab(tab)}><Icon size={16} /> {label}</button>)}</nav>
        <div className="ba-detail-body">
          {detailTab === "preview" && <><div className="ba-version-switch"><span>Phiên bản xem trước</span><button type="button" className={versionView === "current" ? "active" : ""} onClick={() => setVersionView("current")}>Bản đang sửa · {detail.currentVersion?.revision ?? "—"}</button><button type="button" disabled={!detail.publishedVersion} className={versionView === "published" ? "active" : ""} onClick={() => setVersionView("published")}>Bản học viên thấy · {detail.publishedVersion?.revision ?? "—"}</button></div>{selectedVersion && <BankAdminPreview key={selectedVersion.id} exam={{ ...detail.exam, content: selectedVersion.content }} content={selectedVersion.content} />}</>}
          {detailTab === "content" && <div className="ba-editor"><div><h3>Nội dung chuẩn hóa · bản {detail.currentVersion?.revision ?? "—"}</h3><p>Lưu tạo một revision mới. Nếu đề đang công khai, học viên vẫn thấy bản đã xuất bản cho đến khi bạn duyệt và xuất bản bản mới.</p></div><label className="ba-field">JSON đề thi<textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={26} spellCheck={false} /></label><button type="button" className="button primary" disabled={busy} onClick={() => void saveContent()}>Lưu bản sửa</button></div>}
          {detailTab === "metadata" && meta && <form className="ba-editor" onSubmit={(event) => { event.preventDefault(); void saveMeta(); }}><div><h3>Thông tin & nguồn đề</h3><p>{hasPublic ? "Gỡ xuất bản trước khi sửa các thông tin học viên nhìn thấy." : "Các thay đổi ở đây cập nhật thông tin hiển thị của đề."}</p></div><div className="ba-meta-grid">{([ ["title", "Tên đề"], ["topic", "Chủ đề"], ["difficulty", "Độ khó"], ["format", "Định dạng"], ["mode", "Chế độ"], ["attribution", "Ghi nguồn"], ["license", "Giấy phép"], ["sourceUrl", "URL nguồn"], ["licenseUrl", "URL giấy phép"] ] as const).map(([key, label]) => <label className="ba-field" key={key}>{label}<input value={meta[key]} disabled={hasPublic} onChange={(event) => setMeta({ ...meta, [key]: event.target.value })} /></label>)}<label className="ba-field">Thời gian (phút)<input type="number" min={1} max={240} value={meta.durationMinutes} disabled={hasPublic} onChange={(event) => setMeta({ ...meta, durationMinutes: Number(event.target.value) })} /></label></div><button type="submit" className="button primary" disabled={busy || hasPublic}>Lưu thông tin</button></form>}
        </div>
      </>}
    </section></div>}
  </div>;
}
