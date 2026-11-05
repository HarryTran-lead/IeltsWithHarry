"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { DraftWorkspace } from "./draft-workspace";
import "./ai-content-factory.css";

type Settings = { generation_enabled: boolean; paid_provider_enabled: boolean; daily_job_limit: number; max_concurrency: number; daily_paid_limit_usd: number; monthly_paid_limit_usd: number };
type Voice = { id: string; name: string; accent: string; characteristics: string; enabled: boolean; pace: number; sample_url: string | null };
type DraftExam = { title?: string; skill?: string; content?: ExamContent };
type Job = { id: string; kind: string; skill?: string; examTitle?: string | null; examContent?: ExamContent | null; status: string; provider: string; exam_id: string; error: string | null; previewUrl: string | null; previewUrls?: { sectionId: string; url: string }[]; created_at: string; payload?: { exam?: DraftExam; sectionId?: string; sections?: { sectionId: string }[]; evidence?: Record<string, string>; usage?: { inputTokens: number | null; outputTokens: number | null } }; ai_factory_segments: { ordinal: number; speaker_id: string; voice_id: string; canonical_text: string; start_ms: number; end_ms: number }[]; ai_factory_qa: { technical: Record<string, unknown>; answer_alignment: Record<string, unknown>; asr: Record<string, unknown>; passed: boolean } | null };
type Usage = { provider: string; characters: number; audio_seconds: number; processing_seconds: number; storage_bytes: number; actual_usd: number; created_at: string };
type DailySetStatus = { setId: string; completedPieces: number; totalPieces: number; missingPieces: string[]; activeKind: string | null; quotaDay: string | null;
  longRequestsUsed: number; lastModelFailure: { kind: string; model: string; status: number; reason: string; at: string } | null;
  completedAt: string | null; error: string | null };
const tabs = ["Tổng quan", "Tạo Listening", "Tạo Reading", "Tạo Writing", "Tạo Speaking", "Audio Studio", "Voice Library", "QA & duyệt", "Hàng đợi", "Xuất bản", "Chi phí", "Cài đặt"] as const;

function AudioPlayers({ job }: { job: Job }) {
  const files = job.previewUrls?.length ? job.previewUrls : job.previewUrl ? [{ sectionId: "Audio", url: job.previewUrl }] : [];
  return <div><AudioProviderStatus job={job} />{files.map((file) => <div key={file.sectionId}><strong>{file.sectionId}</strong><audio controls preload="none" src={file.url} style={{ display: "block", width: "100%", maxWidth: 600 }} /></div>)}</div>;
}

function needsGeminiRegeneration(job: Job) {
  const generation = job.ai_factory_qa?.technical.generation as { needs_regeneration?: boolean } | undefined;
  return Boolean(job.ai_factory_qa) && (generation?.needs_regeneration ?? job.provider === "kokoro");
}

function AudioProviderStatus({ job }: { job: Job }) {
  if (job.kind !== "listening_audio" || !job.ai_factory_qa) return null;
  const generation = job.ai_factory_qa.technical.generation as { actual_provider?: string; needs_regeneration?: boolean; fallback_reason?: string } | undefined;
  const provider = generation?.actual_provider || job.provider;
  const needsRegeneration = generation?.needs_regeneration ?? provider === "kokoro";
  return <p role="status" style={{ color: needsRegeneration ? "#9a5611" : "#08734e", fontWeight: 700 }}>
    {needsRegeneration ? "Kokoro dự phòng · Cần tạo lại bằng Gemini khi có quota" : "Gemini TTS · Bản nháp ưu tiên"}
    {generation?.fallback_reason && <small style={{ display: "block", fontWeight: 400 }}>Lý do: {/Gemini TTS HTTP 429/i.test(generation.fallback_reason) ? "Gemini Free đã chạm giới hạn lượt gọi (HTTP 429)." : generation.fallback_reason}</small>}
  </p>;
}

const skills = ["Listening", "Reading", "Writing", "Speaking"] as const;
function jobSkill(job: Job) { return job.skill || job.payload?.exam?.skill || (job.kind === "listening_audio" ? "Listening" : job.kind[0]?.toUpperCase() + job.kind.slice(1)); }
function statusLabel(status: string) { return ({ awaiting_review: "Chờ duyệt", qa_failed: "QA chưa đạt", approved: "Đã duyệt", queued: "Đang chờ tạo", running: "Đang tạo", rejected: "Đã từ chối", failed: "Lỗi tạo đề" } as Record<string, string>)[status] || status; }
function pieceLabel(kind: string) { return kind.replace("reading_passage", "Reading Passage ").replace("listening_part", "Listening Part ").replaceAll("_", " "); }
function dailyFailureLabel(failure: NonNullable<DailySetStatus["lastModelFailure"]>) {
  const reason = failure.reason === "unavailable" ? "dịch vụ tạm không khả dụng" : failure.reason === "daily_quota" ? "hết hạn mức ngày" : failure.reason === "rate_limit" ? "chạm giới hạn tốc độ hoặc token" : failure.reason === "quota_unknown" ? "giới hạn chưa xác định" : "lỗi yêu cầu";
  return `Lỗi gần nhất: ${pieceLabel(failure.kind)} · ${failure.model} HTTP ${failure.status} (${reason}).`;
}

export function AiContentFactory() {
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const [settings, setSettings] = useState<Settings | null>(null), [voices, setVoices] = useState<Voice[]>([]), [jobs, setJobs] = useState<Job[]>([]), [usage, setUsage] = useState<Usage[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [note, setNote] = useState(""), [listened, setListened] = useState(false), [answersChecked, setAnswersChecked] = useState(false);
  const [selected, setSelected] = useState("");
  const [audioFailed, setAudioFailed] = useState(false);
  const [reviewSkill, setReviewSkill] = useState<(typeof skills)[number]>("Listening");
  const [topic, setTopic] = useState("Urban life and the environment"), [textProviderReady, setTextProviderReady] = useState(false);
  const [dailySet, setDailySet] = useState<DailySetStatus | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/ai-content-factory", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Cannot load Content Factory");
    setSettings(data.settings); setVoices(data.voices); setJobs(data.jobs); setUsage(data.usage); setDailySet(data.dailySet); setTextProviderReady(Boolean(data.textProviderReady));
  }, []);
  useEffect(() => { void Promise.resolve().then(load).catch((error) => setMessage(String(error))); }, [load]);
  async function command(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/ai-content-factory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");
      setMessage(payload.action === "pilot" ? `Pilot đã vào hàng đợi: ${result.job.id}` : payload.action === "regenerate_audio" ? `Đã xếp hàng tạo lại: ${result.job.id}` : payload.action === "generate" ? result.status === "qa_failed" ? `Bản nháp không đạt QA: ${result.warnings.join(", ")}` : `Bản nháp đang chờ duyệt: ${result.examId}` : "Đã lưu.");
      await load();
      if (payload.action === "review" || payload.action === "review_text") { setSelected(""); setAudioFailed(false); setNote(""); setListened(false); setAnswersChecked(false); }
    } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  }
  const reviewJobs = jobs.filter((job) => jobSkill(job) === reviewSkill && ["awaiting_review", "qa_failed"].includes(job.status));
  const reviewJob = reviewJobs.find((job) => job.id === selected) || reviewJobs[0];
  const audioSectionIds = reviewJob?.payload?.sections?.map((part) => part.sectionId) || (reviewJob?.payload?.sectionId ? [reviewJob.payload.sectionId] : reviewJob?.examContent?.sections.map((part) => part.id) || []);
  const reviewAudioReady = reviewJob?.kind !== "listening_audio" || Boolean(!audioFailed && reviewJob.previewUrl && audioSectionIds.length && audioSectionIds.every((id) => reviewJob.previewUrls?.some((file) => file.sectionId === id) || (audioSectionIds.length === 1 && reviewJob.previewUrls?.length === 1)));
  const counts = (status: string) => jobs.filter((job) => job.status === status).length;
  return <div className="bank-admin factory">
    <section className="card factory-intro"><div><span className="factory-eyebrow">QUẢN LÝ NỘI DUNG IELTS</span><h2>Không gian biên soạn và kiểm duyệt</h2><p>Tạo đề, xem thử trải nghiệm học viên, kiểm tra đáp án và duyệt trước khi xuất bản.</p></div><button type="button" className="button primary" onClick={() => setTab("QA & duyệt")}>Xem đề chờ duyệt ({counts("awaiting_review")})</button></section>
    <section className="factory-navigation" aria-label="Chức năng AI Content Factory"><div className="factory-nav-group"><span>Duyệt & xuất bản</span>{["Tổng quan", "QA & duyệt", "Xuất bản"].map((name) => <button type="button" key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name as (typeof tabs)[number])}>{name}</button>)}</div><div className="factory-nav-group"><span>Biên soạn</span>{["Tạo Listening", "Tạo Reading", "Tạo Writing", "Tạo Speaking"].map((name) => <button type="button" key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name as (typeof tabs)[number])}>{name}</button>)}</div><div className="factory-nav-group"><span>Công cụ & vận hành</span>{["Audio Studio", "Voice Library", "Hàng đợi", "Chi phí", "Cài đặt"].map((name) => <button type="button" key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name as (typeof tabs)[number])}>{name}</button>)}</div></section>
    {tab === "Tổng quan" && <>
      <section className="factory-overview-grid" aria-label="Trạng thái sản xuất"><article><span>Đang chờ tạo</span><strong>{counts("queued")}</strong></article><article><span>Đang tạo</span><strong>{counts("running")}</strong></article><article><span>Chờ duyệt</span><strong>{counts("awaiting_review")}</strong></article><article><span>Đã duyệt</span><strong>{counts("approved")}</strong></article></section>
      <section className="card factory-review-entry"><div className="factory-section-head"><div><span className="factory-eyebrow">BẢN NHÁP CẦN XEM</span><h2>Duyệt theo kỹ năng</h2><p>Mở đề và làm thử trước khi quyết định.</p></div></div><div className="factory-skill-cards">{skills.map((skill) => <button type="button" key={skill} onClick={() => { setReviewSkill(skill); setSelected(""); setAudioFailed(false); setTab("QA & duyệt"); }}><span>{skill}</span><strong>{jobs.filter((job) => jobSkill(job) === skill && ["awaiting_review","qa_failed"].includes(job.status)).length}</strong><small>đề cần xem →</small></button>)}</div></section>
      {dailySet && <section className="card factory-daily-status"><span className="factory-eyebrow">BỘ ĐỀ HẰNG NGÀY</span><h2>{dailySet.setId}</h2><div className="factory-daily-progress"><span style={{ width: `${Math.min(100, Math.round(dailySet.completedPieces / dailySet.totalPieces * 100))}%` }} /></div><p>{dailySet.completedPieces}/{dailySet.totalPieces} phần đã tạo · {dailySet.longRequestsUsed}/20 lượt gọi model dài{dailySet.quotaDay ? ` trong ngày UTC ${dailySet.quotaDay}` : ""}.</p>{dailySet.missingPieces?.length > 0 && <p>Còn thiếu: {dailySet.missingPieces.map(pieceLabel).join(", ")}.</p>}<p className={dailySet.error ? "factory-error" : ""}>{dailySet.completedAt ? "Đã hoàn tất, chờ admin duyệt." : dailySet.lastModelFailure ? dailyFailureLabel(dailySet.lastModelFailure) : dailySet.error || "Đang tạo."}</p></section>}
      <section className="card factory-operational-note"><h2>Trạng thái tạo nội dung</h2><p>Audio ưu tiên Gemini Free. Nếu hết quota hoặc gặp lỗi, worker dùng Kokoro và đánh dấu bản nháp cần tạo lại. Lịch tạo đề chỉ chạy khi project Gemini Free riêng và khóa bí mật đã cấu hình, cùng công tắc trong Cài đặt được bật.</p><p>Nội dung AI là bài luyện tập, không phải đề IELTS chính thức.</p></section>
    </>}
    {tab === "Tạo Listening" && <section className="card admin-list"><h2>Listening Part 1 mới</h2><p>AI tạo hội thoại và 10 câu điền thông tin, đối chiếu đáp án với lời thoại rồi xếp hàng tạo audio Gemini ưu tiên. Bài chỉ xuất bản sau khi admin nghe, kiểm tra đáp án và duyệt.</p><label>Chủ đề <input value={topic} maxLength={100} onChange={(event) => setTopic(event.target.value)} style={{ display: "block", width: "100%", maxWidth: 560 }} /></label><button className="button primary" disabled={busy || !textProviderReady || topic.trim().length < 8} onClick={() => void command({ action: "generate", skill: "Listening", topic: topic.trim() })}>Tạo bản nháp Listening</button>{!textProviderReady && <p>Cần khóa AI Factory riêng từ dự án Gemini Free không bật billing; hiện chưa cấu hình nên chưa tạo đề mới.</p>}<details><summary>Pilot Part 3 đã duyệt</summary><p>Thảo luận sinh thái đô thị, 3 người nói, 20 lượt thoại, 10 câu hỏi.</p></details></section>}
    {(["Tạo Reading", "Tạo Writing", "Tạo Speaking"] as const).includes(tab as "Tạo Reading" | "Tạo Writing" | "Tạo Speaking") && <section className="card admin-list">
      <h2>{tab}</h2><p>Tạo một bài luyện Academic gốc để biên tập viên kiểm tra. Reading gồm một passage và 13 câu hỏi; Writing tạo Task 2; Speaking tạo cue card Part 2 và câu hỏi Part 3. Không bài nào tự xuất bản.</p>
      <label>Chủ đề <input value={topic} maxLength={100} onChange={(event) => setTopic(event.target.value)} style={{ display: "block", width: "100%", maxWidth: 560 }} /></label>
      <button className="button primary" disabled={busy || !textProviderReady || topic.trim().length < 8} onClick={() => void command({ action: "generate", skill: tab.slice(4), topic: topic.trim() })}>Tạo bản nháp</button>
      {!textProviderReady && <p>Chưa cấu hình khóa AI Factory riêng thuộc dự án chỉ dùng hạn mức miễn phí. Tính năng tạo chữ đang tắt để giữ giới hạn 0 USD và không chiếm hạn mức AI của học viên.</p>}
    </section>}
    {tab === "Audio Studio" && <section className="card admin-list"><h2>Bản nghe thử</h2>{jobs.filter((job) => job.previewUrl).map((job) => <div key={job.id}><div className="admin-row"><div><strong>{job.examTitle || job.payload?.exam?.title || job.id.slice(0,8)} · {statusLabel(job.status)}</strong><small>{new Date(job.created_at).toLocaleString("vi-VN")}</small><AudioPlayers job={job} /></div><button className="button subtle" onClick={() => { setReviewSkill("Listening"); setSelected(job.id); setAudioFailed(false); setTab("QA & duyệt"); }}>Mở đề và duyệt</button></div><details><summary>{job.ai_factory_segments?.length || 0} đoạn thoại và mốc thời gian</summary>{(job.ai_factory_segments || []).sort((a,b) => a.ordinal - b.ordinal).map((segment) => <p key={segment.ordinal}><strong>{segment.ordinal + 1}. {segment.speaker_id} ({segment.voice_id})</strong> · {(segment.start_ms/1000).toFixed(1)}–{(segment.end_ms/1000).toFixed(1)} giây<br />{segment.canonical_text}</p>)}</details></div>)}{!jobs.some((job) => job.previewUrl) && <p>Chưa có audio chờ duyệt.</p>}</section>}
    {tab === "Voice Library" && <section className="card admin-list"><h2>Hồ sơ giọng</h2><p>Mỗi hồ sơ dùng giọng Gemini tương ứng khi còn quota, hoặc giọng Kokoro dự phòng. Nghe và xác nhận chất giọng, phát âm trong QA trước khi duyệt.</p>{voices.map((voice) => { const sampleJob = jobs.find((job) => job.previewUrl && job.ai_factory_segments?.some((segment) => segment.voice_id === voice.id)); const sample = sampleJob?.ai_factory_segments.find((segment) => segment.voice_id === voice.id); const sampleUrl = voice.sample_url || (sampleJob?.previewUrl && sample ? `${sampleJob.previewUrl}#t=${(sample.start_ms/1000).toFixed(1)},${(sample.end_ms/1000).toFixed(1)}` : null); return <div className="admin-row" key={voice.id}><div><strong>{voice.name} · {voice.id}</strong><small>{voice.accent} · {voice.characteristics} · tốc độ {voice.pace}</small>{sampleUrl && <audio controls preload="none" src={sampleUrl} style={{ display: "block", maxWidth: "100%" }} />}</div><label><input type="checkbox" checked={voice.enabled} disabled={busy} onChange={(event) => void command({ action: "voice", voiceId: voice.id, enabled: event.target.checked })} /> Bật</label></div>; })}</section>}
    {tab === "QA & duyệt" && <section className="card factory-review">
      <div className="factory-section-head"><div><span className="factory-eyebrow">KIỂM DUYỆT NỘI DUNG</span><h2>Đề chờ duyệt theo kỹ năng</h2><p>Chọn một đề để làm thử như học viên. Sau đó hiện đáp án, đối chiếu audio hoặc passage và ghi nhận quyết định.</p></div><Link className="button subtle" href="/admin/ielts-bank">Ngân hàng IELTS</Link></div>
      <div className="factory-skill-filter" role="group" aria-label="Lọc kỹ năng">{skills.map((skill) => <button type="button" key={skill} className={reviewSkill === skill ? "active" : ""} onClick={() => { setReviewSkill(skill); setSelected(""); setAudioFailed(false); setNote(""); setListened(false); setAnswersChecked(false); }}>{skill}<span>{jobs.filter((job) => jobSkill(job) === skill && ["awaiting_review","qa_failed"].includes(job.status)).length}</span></button>)}</div>
      <div className="factory-review-layout">
        <div className="factory-draft-list" aria-label="Danh sách bản nháp">{reviewJobs.map((job) => <button type="button" key={job.id} className={reviewJob?.id === job.id ? "active" : ""} onClick={() => { setSelected(job.id); setAudioFailed(false); setNote(""); setListened(false); setAnswersChecked(false); }}><strong>{job.examTitle || job.payload?.exam?.title || jobSkill(job)}</strong><span>{statusLabel(job.status)} · {new Date(job.created_at).toLocaleDateString("vi-VN")}</span>{job.error && <small>{job.error}</small>}</button>)}{!reviewJobs.length && <div className="factory-empty">Chưa có bản nháp {reviewSkill} cần duyệt.</div>}</div>
        <div className="factory-review-detail">{reviewJob ? <>
          <div className="factory-review-summary"><span className={`factory-status ${reviewJob.status}`}>{statusLabel(reviewJob.status)}</span><span>Đề {reviewJob.exam_id || "chưa lưu"}</span><span>QA kỹ thuật: {reviewJob.ai_factory_qa?.passed ? "đạt" : "chưa đạt"}</span><button type="button" className="factory-refresh" onClick={() => { setAudioFailed(false); void load().catch((error) => setMessage(String(error))); }}>Tải lại đề / audio</button></div>
          {reviewJob.error && <p className="factory-error" role="alert">{reviewJob.error}</p>}
          {reviewJob.kind === "listening_audio" && <AudioProviderStatus job={reviewJob} />}
          <DraftWorkspace key={reviewJob.id} title={reviewJob.examTitle || reviewJob.payload?.exam?.title || "Bản nháp IELTS"} skill={jobSkill(reviewJob)} content={reviewJob.examContent || reviewJob.payload?.exam?.content || null} audioFiles={reviewJob.previewUrls?.length ? reviewJob.previewUrls : reviewJob.previewUrl ? [{ sectionId: "audio", url: reviewJob.previewUrl }] : []} evidence={reviewJob.payload?.evidence} onAudioFailure={() => setAudioFailed(true)} />
          {reviewJob.kind === "listening_audio" && needsGeminiRegeneration(reviewJob) && <button type="button" className="button subtle" disabled={busy} onClick={() => void command({ action: "regenerate_audio", jobId: reviewJob.id })}>Xếp hàng tạo lại audio bằng Gemini</button>}
          {reviewJob.ai_factory_qa && <details className="factory-technical"><summary>Báo cáo QA kỹ thuật</summary><pre>{JSON.stringify(reviewJob.ai_factory_qa, null, 2)}</pre></details>}
          <div className="factory-review-form"><h3>Quyết định duyệt</h3><p>Kiểm tra toàn bộ nội dung trước khi phê duyệt. Bản nháp chưa được xuất bản cho học viên.</p>
            {reviewJob.kind === "listening_audio" && <label><input type="checkbox" checked={listened} disabled={!reviewAudioReady} onChange={(event) => setListened(event.target.checked)} /> Tôi đã nghe hết audio và đối chiếu lời thoại</label>}
            <label><input type="checkbox" checked={answersChecked} onChange={(event) => setAnswersChecked(event.target.checked)} /> Tôi đã kiểm tra toàn bộ đề và đáp án</label>
            <label className="factory-note-label">Ghi chú kiểm duyệt<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Ghi nhận điểm đã kiểm tra hoặc lý do từ chối" /></label>
            <div className="factory-review-buttons"><button type="button" className="button primary" disabled={busy || reviewJob.status !== "awaiting_review" || !reviewJob.ai_factory_qa?.passed || !(reviewJob.examContent || reviewJob.payload?.exam?.content) || !reviewAudioReady || !answersChecked || (reviewJob.kind === "listening_audio" && !listened) || note.trim().length < 3} onClick={() => void command(reviewJob.kind === "listening_audio" ? { action: "review", jobId: reviewJob.id, decision: "approve", note, listened, answersChecked } : { action: "review_text", jobId: reviewJob.id, decision: "approve", note, answersChecked })}>Duyệt bản nháp</button><button type="button" className="button subtle" disabled={busy || note.trim().length < 3} onClick={() => void command(reviewJob.kind === "listening_audio" ? { action: "review", jobId: reviewJob.id, decision: "reject", note, listened, answersChecked } : { action: "review_text", jobId: reviewJob.id, decision: "reject", note, listened, answersChecked })}>Từ chối</button></div>
          </div>
        </> : <div className="factory-empty">Chọn một bản nháp ở bên trái để xem toàn bộ đề và làm thử.</div>}</div>
      </div>
    </section>}
    {tab === "Hàng đợi" && <section className="card admin-list"><h2>Jobs gần đây</h2>{jobs.map((job) => <div className="admin-row" key={job.id}><div><strong>{job.kind} · {job.status}</strong><small>{job.id} · {new Date(job.created_at).toLocaleString("vi-VN")}</small>{job.error && <small role="alert">{job.error}</small>}<AudioProviderStatus job={job} />{needsGeminiRegeneration(job) && ["awaiting_review", "approved"].includes(job.status) && <button className="button subtle" disabled={busy} onClick={() => void command({ action: "regenerate_audio", jobId: job.id })}>Xếp hàng tạo lại bằng Gemini</button>}</div>{job.status === "queued" && <button className="button subtle" onClick={() => void command({ action: "cancel", jobId: job.id })}>Hủy</button>}</div>)}</section>}
    {tab === "Xuất bản" && <section className="card admin-list"><h2>Publishing Manager</h2><p>Mở Ngân hàng IELTS để kiểm tra đề đã duyệt, đánh dấu sẵn sàng, rồi xuất bản. Chỉ bản đã xuất bản mới xuất hiện cho học viên.</p><Link className="button primary" href="/admin/ielts-bank">Mở ngân hàng IELTS</Link>{jobs.filter((job) => job.status === "approved").map((job) => <div key={job.id}><p>{job.kind} đã duyệt · đề {job.exam_id}</p><AudioProviderStatus job={job} /></div>)}</section>}
    {tab === "Chi phí" && <section className="card admin-list"><h2>Usage & Cost</h2><p>Audio Gemini/Kokoro đã tạo: {usage.reduce((sum, item) => sum + Number(item.audio_seconds), 0).toFixed(0)} giây audio, {usage.reduce((sum, item) => sum + item.characters, 0)} ký tự, {usage.reduce((sum, item) => sum + Number(item.processing_seconds), 0).toFixed(0)} giây xử lý và {(usage.reduce((sum, item) => sum + Number(item.storage_bytes), 0)/1048576).toFixed(1)} MB lưu trữ. Chi phí API đã ghi nhận cho audio: ${usage.reduce((sum, item) => sum + Number(item.actual_usd), 0).toFixed(4)}. Chi phí máy chủ không nằm trong số này.</p><p>Model tạo chữ: {jobs.reduce((sum, job) => sum + Number(job.payload?.usage?.inputTokens || 0), 0)} token đầu vào và {jobs.reduce((sum, job) => sum + Number(job.payload?.usage?.outputTokens || 0), 0)} token đầu ra trong các job đang hiển thị. Số token này không phải hóa đơn; kiểm tra hạn mức và chi phí thực tế trong dự án AI Studio riêng.</p><p>Nhà cung cấp trả phí: {settings?.paid_provider_enabled ? "đang bật" : "tắt"}. Không có tự động chuyển sang TTS trả phí.</p></section>}
    {tab === "Cài đặt" && <section className="card admin-list"><h2>Cài đặt sản xuất</h2><p>Lịch chạy mỗi ngày trên GitHub Actions, tạo tối đa một bộ đề chuẩn gồm Listening, Reading, hai Writing Task và hai Speaking Part nếu khóa Gemini Free riêng đã cấu hình và xác nhận không bật billing. Đề chỉ xuất bản sau khi người quản trị duyệt.</p><label><input type="checkbox" checked={settings?.generation_enabled || false} disabled={busy} onChange={(event) => void command({ action: "settings", generationEnabled: event.target.checked })} /> Cho phép lịch tạo nội dung</label><label>Giới hạn job tạo thủ công/ngày <input type="number" min={0} max={100} defaultValue={settings?.daily_job_limit ?? 2} onBlur={(event) => { const value = Number(event.target.value); if (value !== settings?.daily_job_limit) void command({ action: "settings", dailyJobLimit: value }); }} /></label><p>Giới hạn đồng thời: {settings?.max_concurrency ?? 1}. Paid provider mặc định tắt và không thể bật từ giao diện này.</p></section>}
    {message && <p role="status" className="card" style={{ padding: 16, overflowWrap: "anywhere" }}>{message}</p>}
  </div>;
}
