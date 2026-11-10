"use client";

import { useEffect, useState } from "react";
import "./bank-writing-admin.css";

type Job = { id: string; task_type: string; status: string; error_code: string | null; created_at: string };
type Detail = { job: Job & { prompt_snapshot: string; visual_snapshot: { imageUrl?: string; visual?: unknown } | null; essay_snapshot: string }; result: { id: string; result: { criteria: { key: string; score_display: number; reason_vi: string }[]; task_band_display: number } } | null; reviews: { id: string; criterion_scores: Record<string, number>; rationale: string; created_at: string }[] };
type Source = { version: { id: string; content: { prompt?: string; imageUrl?: string; visual?: unknown } }; verified: { facts: { id: string; claim: string }[]; verified_at: string } | null };

export function WritingGradingAdmin() {
  const [jobs, setJobs] = useState<Job[]>([]), [selected, setSelected] = useState<Detail | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [versionId, setVersionId] = useState(""), [source, setSource] = useState<Source | null>(null);
  const [factsText, setFactsText] = useState("[]"), [confirmed, setConfirmed] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>({}), [rationale, setRationale] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  async function json(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Không tải được dữ liệu."); return data; }
  async function refresh() { const data = await json(await fetch("/api/ielts/bank/writing-review", { cache: "no-store" })); setUnavailable(data.status === "unavailable"); setJobs(data.jobs ?? []); }
  useEffect(() => { void fetch("/api/ielts/bank/writing-review", { cache: "no-store" }).then(json).then((data) => { setUnavailable(data.status === "unavailable"); setJobs(data.jobs ?? []); }).catch(() => setError("Chưa tải được hàng chờ Writing.")); }, []);
  async function openJob(id: string) {
    setError(""); setNotice("");
    try { const data = await json(await fetch(`/api/ielts/bank/writing-review?jobId=${encodeURIComponent(id)}`, { cache: "no-store" })); setSelected(data); setScores(Object.fromEntries((data.result?.result.criteria ?? []).map((item: { key: string; score_display: number }) => [item.key, String(item.score_display)]))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được bài."); }
  }
  async function loadSource() {
    setError(""); setNotice("");
    try { const data = await json(await fetch(`/api/ielts/bank/writing-source-facts?examVersionId=${encodeURIComponent(versionId)}`, { cache: "no-store" })); setSource(data); setFactsText(JSON.stringify(data.verified?.facts ?? [], null, 2)); setConfirmed(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được nguồn."); }
  }
  async function saveFacts() {
    if (!confirmed) return;
    setBusy(true); setError("");
    try {
      const facts = JSON.parse(factsText);
      await json(await fetch("/api/ielts/bank/writing-source-facts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examVersionId: versionId, facts }) }));
      await loadSource(); setNotice("Đã lưu dữ kiện nguồn do admin xác minh.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được dữ kiện."); }
    finally { setBusy(false); }
  }
  async function saveReview() {
    if (!selected?.result) return;
    setBusy(true); setError("");
    try {
      const labels = Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Number(value)]));
      await json(await fetch("/api/ielts/bank/writing-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resultId: selected.result.id, scores: labels, rationale }) }));
      setRationale(""); await openJob(selected.job.id); setNotice("Đã lưu nhận xét của người duyệt.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được nhận xét."); }
    finally { setBusy(false); }
  }
  if (unavailable) return <section className="ba-ops-card"><h2>Chấm Writing</h2><p>Hệ thống chấm tự host chưa sẵn sàng. Bài viết của học viên vẫn được lưu bình thường.</p></section>;
  return <div className="wga-layout">
    {error && <p className="bx-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="ba-ops-card"><h2>Hàng chờ chấm Writing</h2><p>Kết quả model chỉ là ước lượng; các bài cần rà soát được giữ riêng.</p><button type="button" onClick={() => void refresh()}>Tải lại</button>
      {jobs.length ? jobs.map((job) => <button className="wga-job" type="button" key={job.id} onClick={() => void openJob(job.id)}><strong>{job.task_type === "academic_task1" ? "Academic Task 1" : "Academic Task 2"}</strong><span>{job.status} · {new Date(job.created_at).toLocaleString("vi-VN")}</span></button>) : <p>Chưa có job chấm.</p>}
    </section>
    {selected && <section className="ba-ops-card"><h2>Bài cần đánh giá</h2><p>Trạng thái: {selected.job.status}{selected.job.error_code ? ` · ${selected.job.error_code}` : ""}</p><h3>Đề</h3><p>{selected.job.prompt_snapshot}</p>{selected.job.visual_snapshot?.imageUrl && <a href={selected.job.visual_snapshot.imageUrl} target="_blank" rel="noreferrer">Xem hình đề gốc ↗</a>}<h3>Bài học viên</h3><pre className="wga-essay">{selected.job.essay_snapshot}</pre>
      {selected.result ? <><h3>Model: band dự đoán {selected.result.result.task_band_display.toFixed(1)}</h3>{selected.result.result.criteria.map((item) => <label className="wga-label" key={item.key}>{item.key} · {item.reason_vi}<input type="number" min="0" max="9" step="0.5" value={scores[item.key] ?? ""} onChange={(event) => setScores({ ...scores, [item.key]: event.target.value })} /></label>)}<label className="wga-label">Căn cứ người duyệt<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} rows={4} /></label><button className="button primary" type="button" disabled={busy || !rationale.trim()} onClick={() => void saveReview()}>Lưu đánh giá</button>{selected.reviews.map((review) => <p key={review.id}>Đã duyệt {new Date(review.created_at).toLocaleString("vi-VN")}: {review.rationale}</p>)}</> : <p>Chưa có kết quả model. Không gán band tự động.</p>}
    </section>}
    <section className="ba-ops-card"><h2>Xác minh dữ kiện Task 1</h2><p>Chỉ nhập dữ kiện đã đối chiếu trực tiếp với hình/nguồn gốc. Lấy mã phiên bản từ chi tiết đề trong Kho đề.</p><label className="wga-label">Mã phiên bản đề<input value={versionId} onChange={(event) => setVersionId(event.target.value)} placeholder="UUID của phiên bản đề" /></label><button type="button" disabled={!versionId.trim()} onClick={() => void loadSource()}>Xem nguồn</button>
      {source && <><p>{source.version.content.prompt}</p>{source.version.content.imageUrl && <a href={source.version.content.imageUrl} target="_blank" rel="noreferrer">Mở hình nguồn ↗</a>}{source.version.content.visual != null && <pre className="wga-essay">{JSON.stringify(source.version.content.visual, null, 2)}</pre>}<label className="wga-label">Dữ kiện có ID và câu mô tả<textarea value={factsText} onChange={(event) => setFactsText(event.target.value)} rows={8} /></label><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Tôi đã đối chiếu từng dữ kiện với nguồn gốc.</label><button className="button primary" type="button" disabled={!confirmed || busy} onClick={() => void saveFacts()}>Lưu dữ kiện đã xác minh</button></>}
    </section>
  </div>;
}
