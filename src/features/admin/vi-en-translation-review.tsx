"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import sourceTopics from "@/lib/vocabulary/ielts-topics.json";
import learningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import "./vi-en-translation-review.css";

type Status = "draft" | "approved" | "published" | "rejected";
type Item = {
  id: string; topic: string; term: string; meaning_vi: string; mode: "speaking" | "writing";
  prompt_vi: string; reference_en: string; alternatives: string[]; editor_note: string;
  pattern: string; status: Status; revision: number; source_ref: string;
  canonical_source_key: string | null;
  metadata: Record<string, string>;
};
const pageSize = 25;
const topics = [...sourceTopics, ...learningTopics].sort((a, b) => a.localeCompare(b));

export function ViEnTranslationReview() {
  const db = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [topic, setTopic] = useState("all");
  const [status, setStatus] = useState("draft");
  const [mode, setMode] = useState("all");
  const [tier, setTier] = useState("all");
  const [usage, setUsage] = useState("all");
  const [qa, setQa] = useState("all");
  const [missing, setMissing] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Item | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    let request = db.from("vi_en_translation_exercises")
      .select("id,topic,term,meaning_vi,mode,prompt_vi,reference_en,alternatives,editor_note,pattern,status,revision,source_ref,canonical_source_key,metadata", { count: "exact" })
      .order("topic").order("id").range(page * pageSize, (page + 1) * pageSize - 1);
    if (topic !== "all") request = request.eq("topic", topic);
    if (status !== "all") request = request.eq("status", status);
    if (mode !== "all") request = request.eq("mode", mode);
    if (tier !== "all") request = request.contains("metadata", { context_reuse_tier: tier });
    if (usage !== "all") request = request.contains("metadata", { target_term_usage: usage });
    if (qa !== "all") request = request.contains("metadata", { qa_status: qa });
    if (missing) request = request.eq("meaning_vi", "");
    if (query.trim()) request = request.ilike("term", `%${query.trim().replace(/[%_,]/g, "")}%`);
    const result = await request;
    if (result.error) setError(result.error.message);
    else { setItems((result.data ?? []) as Item[]); setTotal(result.count ?? 0); setError(""); }
  }, [db, topic, status, mode, tier, usage, qa, missing, query, page]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      ...(["draft", "approved", "published", "rejected"] as const).map((key) => db.from("vi_en_translation_exercises").select("id", { count: "exact", head: true }).eq("status", key)),
    ]).then((results) => {
      if (!active) return;
      setCounts(Object.fromEntries(results.map((row, i) => [["draft", "approved", "published", "rejected"][i], row.count ?? 0])));
    });
    return () => { active = false; };
  }, [db, notice]);

  function edit(item: Item) { setSelected({ ...item, alternatives: [...item.alternatives] }); setAcknowledged(false); setNotice(""); setError(""); }
  function field<K extends keyof Item>(key: K, value: Item[K]) { setSelected((old) => old ? { ...old, [key]: value } : old); }
  async function save(nextStatus: Status) {
    if (!selected || busy) return;
    if (!selected.prompt_vi.trim() || !selected.reference_en.trim()) { setError("Cần có câu Việt và câu Anh."); return; }
    if (["approved", "published"].includes(nextStatus) && (!selected.meaning_vi.trim() || !acknowledged)) {
      setError("Bổ sung nghĩa và xác nhận đã đọc, đối chiếu thủ công cả câu Việt lẫn câu Anh."); return;
    }
    if (nextStatus === "published" && selected.status !== "approved") { setError("Hãy duyệt câu trước khi xuất bản."); return; }
    setBusy(true); setError("");
    const user = await db.auth.getUser();
    if (!user.data.user) { setError("Phiên đăng nhập đã hết hạn."); setBusy(false); return; }
    const payload = {
      prompt_vi: selected.prompt_vi.trim(), reference_en: selected.reference_en.trim(),
      meaning_vi: selected.meaning_vi.trim(), alternatives: selected.alternatives.filter(Boolean),
      editor_note: selected.editor_note.trim(), status: nextStatus,
      reviewed_by: ["approved", "published"].includes(nextStatus) ? user.data.user.id : null,
      reviewed_at: ["approved", "published"].includes(nextStatus) ? new Date().toISOString() : null,
    };
    const result = await db.from("vi_en_translation_exercises").update(payload)
      .eq("id", selected.id).eq("revision", selected.revision).select("id");
    if (result.error) setError(result.error.message);
    else if (!result.data?.length) setError("Câu đã được sửa ở phiên khác. Hãy tải lại trước khi lưu.");
    else { setSelected(null); setNotice(`Đã lưu câu ${selected.term} · ${selected.mode} ở trạng thái ${nextStatus}.`); await load(); }
    setBusy(false);
  }

  return <section className="translation-admin">
    <div className="translation-admin-intro"><h2>Luyện dịch câu Việt → Anh</h2><p>6.650 mục theo 40 chủ đề, mỗi mục có câu Speaking và Writing. Chỉ câu đã duyệt rồi xuất bản mới hiện cho học viên.</p><div>{["draft", "approved", "published", "rejected"].map((key) => <span key={key}><b>{counts[key]?.toLocaleString("vi-VN") ?? "…"}</b> {key}</span>)}</div></div>
    <div className="translation-admin-filters">
      <label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}><option value="all">Tất cả</option><option value="draft">Nháp</option><option value="approved">Đã duyệt</option><option value="published">Đã xuất bản</option><option value="rejected">Từ chối</option></select></label>
      <label>Chủ đề<select value={topic} onChange={(event) => { setTopic(event.target.value); setPage(0); }}><option value="all">Tất cả</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Loại câu<select value={mode} onChange={(event) => { setMode(event.target.value); setPage(0); }}><option value="all">Cả hai</option><option value="speaking">Speaking</option><option value="writing">Writing</option></select></label>
      <label>Mức tái sử dụng<select value={tier} onChange={(event) => { setTier(event.target.value); setPage(0); }}><option value="all">Mọi mức</option>{[0,10,20,30,40,50,60,70,80,90].map((value) => <option key={value} value={String(value)}>{value}%</option>)}</select></label>
      <label>Cách dùng từ<select value={usage} onChange={(event) => { setUsage(event.target.value); setPage(0); }}><option value="all">Mọi loại</option><option value="not_direct_application">Chỉ nhắc đến từ</option><option value="contextual_or_metalinguistic">Cần xem ngữ cảnh</option><option value="reused_context">Tái dùng ngữ cảnh</option><option value="direct_application">Dùng trực tiếp</option></select></label>
      <label>QA<select value={qa} onChange={(event) => { setQa(event.target.value); setPage(0); }}><option value="all">Mọi trạng thái</option><option value="structural_pass_editorial_pending">Chờ biên tập</option><option value="">Nguồn cũ chưa đặt</option></select></label>
      <label>Tìm từ<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Từ / cụm từ…" /></label>
      <label className="translation-admin-check"><input type="checkbox" checked={missing} onChange={(event) => { setMissing(event.target.checked); setPage(0); }} /> Thiếu nghĩa</label>
    </div>
    {error && <p role="alert" className="translation-error">{error}</p>}{notice && <p role="status" className="translation-notice">{notice}</p>}
    <p className="translation-admin-total">{total.toLocaleString("vi-VN")} câu phù hợp · trang {page + 1}/{Math.max(1, Math.ceil(total / pageSize))}</p>
    <div className="translation-admin-list">{items.map((item) => <button key={item.id} type="button" onClick={() => edit(item)}><strong>{item.term}</strong><span>{item.mode} · {item.topic}</span><small>{item.prompt_vi}</small><em>{item.meaning_vi ? item.status : "Thiếu nghĩa"}</em></button>)}</div>
    <div className="translation-admin-pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Trước</button><button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Sau →</button></div>
    {selected && <div className="translation-admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="translation-admin-editor" role="dialog" aria-modal="true" aria-label={`Biên tập câu ${selected.term}`}>
      <div className="translation-admin-editor-head"><div><span>{selected.topic} · {selected.mode} · phiên bản {selected.revision}</span><h3>{selected.term}</h3><small>{selected.source_ref} · {selected.canonical_source_key ? "Đã gắn từ gốc" : "Chưa gắn từ gốc"}</small></div><button type="button" onClick={() => setSelected(null)} aria-label="Đóng">×</button></div>
      <div className="translation-admin-flags"><span>Trạng thái: {selected.status}</span><span>QA: {selected.metadata.qa_status || "chưa có"}</span><span>Tái sử dụng: {selected.metadata.context_reuse_tier || "?"}%</span><span>Ứng dụng từ: {selected.metadata.target_term_usage || "chưa rõ"}</span><span>Cờ biên tập: {selected.metadata.editorial_flag || "không"}</span></div>
      <label>Nghĩa tiếng Việt<input value={selected.meaning_vi} onChange={(event) => field("meaning_vi", event.target.value)} /></label>
      <label>Câu gợi ý tiếng Việt<textarea rows={3} value={selected.prompt_vi} onChange={(event) => field("prompt_vi", event.target.value)} /></label>
      <label>Câu mẫu tiếng Anh<textarea rows={3} value={selected.reference_en} onChange={(event) => field("reference_en", event.target.value)} /></label>
      <label>Cách dịch khác (mỗi dòng một câu)<textarea rows={2} value={selected.alternatives.join("\n")} onChange={(event) => field("alternatives", event.target.value.split("\n"))} /></label>
      <label>Ghi chú biên tập<textarea rows={2} value={selected.editor_note} onChange={(event) => field("editor_note", event.target.value)} /></label>
      <div className="translation-admin-preview"><b>Xem trước như học viên</b><p>{selected.prompt_vi}</p><small>Sau khi học viên viết và mở mẫu:</small><strong>{selected.reference_en}</strong></div>
      <label className="translation-admin-confirm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> Tôi đã đối chiếu ý Việt–Anh, cách dùng “{selected.term}” và văn phong {selected.mode}.</label>
      <div className="translation-admin-editor-actions"><button type="button" disabled={busy} onClick={() => void save("draft")}>{selected.status === "published" ? "Thu hồi / lưu nháp" : "Lưu nháp"}</button><button type="button" disabled={busy} onClick={() => void save("rejected")}>Từ chối</button><button type="button" disabled={busy || selected.status === "published"} onClick={() => void save("approved")}>Duyệt câu</button><button type="button" disabled={busy || selected.status !== "approved"} onClick={() => void save("published")}>Xuất bản</button></div>
    </div></div>}
  </section>;
}
