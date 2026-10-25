"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { strFromU8, unzipSync } from "fflate";
import { createClient } from "@/lib/supabase/browser";
import { parseVocabularyCsv, type VocabularyCsvRow } from "@/lib/vocabulary/import-csv";
import sourceTopics from "@/lib/vocabulary/source-topics.json";
import "@/app/vocabulary-bank.css";

type Row = VocabularyCsvRow;
type Entry = {
  source_id: string; headword: string; pos: string; cefr: string; study_lane: string;
  topics: string[]; definition_en: string; example_en: string; meaning_vi: string;
  source_definition_en: string; source_example_en: string;
  source_name: string; source_url: string; published: boolean; reviewed_topic: string;
};
const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
const pageSize = 24;

export function VocabularyBank() {
  const db = useMemo(() => createClient(), []);
  const [upload, setUpload] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [definition, setDefinition] = useState("");
  const [example, setExample] = useState("");
  const [meaning, setMeaning] = useState("");
  const [reviewedTopic, setReviewedTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    let request = db.from("vocabulary_bank_entries")
      .select("source_id,headword,pos,cefr,study_lane,topics,reviewed_topic,definition_en,example_en,source_definition_en,source_example_en,meaning_vi,source_name,source_url,published", { count: "exact" })
      .order("headword").range(page * pageSize, (page + 1) * pageSize - 1);
    if (query.trim()) request = request.ilike("headword", "%" + query.trim().replace(/[%,]/g, "") + "%");
    if (level !== "all") request = request.eq("cefr", level);
    if (status !== "all") request = request.eq("published", status === "published");
    const [result, count, live] = await Promise.all([
      request,
      db.from("vocabulary_bank_entries").select("source_id", { count: "exact", head: true }),
      db.from("vocabulary_bank_entries").select("source_id", { count: "exact", head: true }).eq("published", true),
    ]);
    if (result.error) setError(result.error.message);
    else { setEntries((result.data ?? []) as Entry[]); setTotal(result.count ?? 0); }
    if (!count.error) setAllCount(count.count ?? 0);
    if (!live.error) setLiveCount(live.count ?? 0);
  }, [db, query, level, status, page]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function choose(file?: File) {
    if (!file) return;
    setFileName(file.name); setUpload([]); setError(""); setNotice("");
    try {
      let csv: string;
      if (file.name.toLowerCase().endsWith(".zip")) {
        const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (item) => item.name === "catalog/vocabulary_all.csv" });
        if (!files["catalog/vocabulary_all.csv"]) throw new Error("ZIP không chứa catalog/vocabulary_all.csv.");
        csv = strFromU8(files["catalog/vocabulary_all.csv"]);
      } else if (file.name.toLowerCase().endsWith(".csv")) csv = await file.text();
      else throw new Error("Hãy chọn ZIP hoặc CSV.");
      const rows = parseVocabularyCsv(csv);
      if (!rows.length) throw new Error("File không có bản ghi.");
      const seen = new Set<string>();
      rows.forEach((row, index) => {
        if (!row.source_id?.trim() || !row.headword?.trim() || !levels.includes(row.cefr) || seen.has(row.source_id))
          throw new Error("Dòng " + (index + 2) + " thiếu source_id/headword/CEFR hợp lệ hoặc trùng ID.");
        seen.add(row.source_id);
      });
      setUpload(rows); setProgress(0);
      setNotice("Đã đọc " + rows.length.toLocaleString("vi-VN") + " dòng. Kiểm tra mẫu rồi nhập vào kho nháp.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không đọc được file."); }
  }

  async function importRows() {
    if (!upload.length || importing) return;
    setImporting(true); setError(""); setNotice("");
    let completed = 0;
    try {
      for (let start = 0; start < upload.length; start += 150) {
        const batch = upload.slice(start, start + 150).map((row) => ({
          source_id: row.source_id.trim(), headword: row.headword.trim(), pos: row.pos,
          cefr: row.cefr, study_lane: row.study_lane,
          topics: row.topics.split(";").map((part) => part.trim()).filter(Boolean),
          topic_basis: row.topic_basis ?? "", source_definition_en: row.definition_en ?? "",
          source_example_en: row.example_en ?? "", source_name: row.source,
          source_url: row.source_url ?? "", definition_source_url: row.definition_source_url ?? "",
          definition_status: row.definition_status ?? "",
        }));
        // Editorial fields are omitted so a repeated import keeps review work intact.
        const result = await db.from("vocabulary_bank_entries").upsert(batch, { onConflict: "source_id" });
        if (result.error) throw result.error;
        completed = start + batch.length;
        setProgress(completed);
      }
      setUpload([]);
      setNotice("Đã nhập " + completed.toLocaleString("vi-VN") + " dòng. Từ mới là bản nháp; từ đã duyệt giữ nguyên trạng thái.");
      await load();
    } catch (cause) {
      setError("Dừng sau " + completed.toLocaleString("vi-VN") + " dòng: " + (cause instanceof Error ? cause.message : "lỗi không rõ") + ". Chọn lại cùng file để tiếp tục.");
    } finally { setImporting(false); }
  }

  async function save(publish: boolean) {
    if (!selected) return;
    if (publish && (!meaning.trim() || !definition.trim() || !reviewedTopic)) { setError("Cần kiểm tra định nghĩa, nghĩa tiếng Việt và topic trước khi xuất bản."); return; }
    setBusy(true); setError("");
    const result = await db.from("vocabulary_bank_entries").update({
      meaning_vi: meaning.trim(), definition_en: definition.trim(), example_en: example.trim(),
      reviewed_topic: reviewedTopic, published: publish,
      updated_at: new Date().toISOString(),
    }).eq("source_id", selected.source_id);
    setBusy(false);
    if (result.error) setError(result.error.message);
    else { setSelected(null); setNotice(publish ? "Đã xuất bản từ." : "Đã lưu bản nháp."); await load(); }
  }

  return <div className="vbank-admin">
    <section className="card vbank-intro"><div><span className="eyebrow">ENGLISH REFERENCE → IELTS EDITORIAL</span><h2>Kho từ vựng tiếng Anh</h2><p>CEFR-J là bộ từ tiếng Anh được biên soạn ở Nhật. Nguồn này không phải danh sách IELTS chính thức. Admin kiểm tra nghĩa theo ngữ cảnh, thêm tiếng Việt rồi mới xuất bản.</p></div><div className="vbank-counts"><span><strong>{allCount.toLocaleString("vi-VN")}</strong> đã nhập</span><span><strong>{liveCount.toLocaleString("vi-VN")}</strong> đã duyệt</span></div></section>
    <section className="card vbank-import"><h2>Nhập / cập nhật</h2><p>Tải ZIP đã nhận hoặc file <code>catalog/vocabulary_all.csv</code>. Nhập lại cùng source_id sẽ cập nhật dữ liệu nguồn và giữ nguyên phần đã biên tập.</p><label className="vbank-file">Chọn ZIP hoặc CSV<input type="file" accept=".zip,.csv" disabled={importing} onChange={(event) => void choose(event.target.files?.[0])} /></label>
      {fileName && <p className="vbank-muted">{fileName} · {upload.length.toLocaleString("vi-VN")} dòng hợp lệ</p>}
      {upload.length > 0 && <><div className="vbank-preview">{upload.slice(0, 3).map((row) => <span key={row.source_id}><strong>{row.headword}</strong> · {row.cefr} · {row.topics}</span>)}</div><button className="button primary" disabled={importing} onClick={() => void importRows()}>{importing ? "Đang nhập " + progress.toLocaleString("vi-VN") + " / " + upload.length.toLocaleString("vi-VN") : "Nhập vào kho nháp"}</button></>}
    </section>
    <section className="card vbank-browser"><div className="vbank-heading"><h2>Rà soát & xuất bản</h2><span>{total.toLocaleString("vi-VN")} kết quả</span></div><div className="vbank-filters"><input aria-label="Tìm từ" placeholder="Tìm headword…" value={query} onChange={(event) => { setPage(0); setQuery(event.target.value); }} /><select aria-label="Lọc CEFR" value={level} onChange={(event) => { setPage(0); setLevel(event.target.value); }}><option value="all">Mọi cấp độ</option>{levels.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Lọc trạng thái" value={status} onChange={(event) => { setPage(0); setStatus(event.target.value); }}><option value="all">Mọi trạng thái</option><option value="draft">Nháp</option><option value="published">Đã xuất bản</option></select></div>
      <div className="vbank-list">{entries.map((entry) => <button className="vbank-row" key={entry.source_id} onClick={() => { setSelected(entry); setDefinition(entry.definition_en || entry.source_definition_en); setExample(entry.example_en || entry.source_example_en); setMeaning(entry.meaning_vi); setReviewedTopic(entry.reviewed_topic || entry.topics.find((topic) => sourceTopics.includes(topic)) || ""); setError(""); }}><span><strong>{entry.headword}</strong><small>{entry.pos} · {entry.cefr} · {entry.reviewed_topic || entry.topics.join(", ") || "General"}</small></span><span className={entry.published ? "status-pill live" : "status-pill draft"}>{entry.published ? "Đã xuất bản" : "Nháp"}</span></button>)}{!entries.length && <p className="vbank-muted">Chưa có từ khớp bộ lọc.</p>}</div><div className="vbank-pages"><button className="button subtle" disabled={page === 0} onClick={() => setPage(page - 1)}>← Trước</button><span>Trang {page + 1} / {Math.max(1, Math.ceil(total / pageSize))}</span><button className="button subtle" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Sau →</button></div>
    </section>
    {selected && <section className="card vbank-editor"><div className="vbank-heading"><div><span className="eyebrow">DUYỆT NGHĨA TRƯỚC KHI ĐĂNG</span><h2>{selected.headword} <small>{selected.pos} · {selected.cefr}</small></h2></div><button className="button subtle" onClick={() => setSelected(null)}>Đóng</button></div><p className="vbank-muted">Nguồn: <a href={selected.source_url} target="_blank" rel="noopener noreferrer">{selected.source_name}</a> · {selected.study_lane}. Đây là cấp độ học tham khảo, không phải band IELTS của từ.</p>{selected.source_definition_en && <p className="vbank-example">Định nghĩa nguồn (cần kiểm tra ngữ cảnh): {selected.source_definition_en}</p>}{selected.source_example_en && <p className="vbank-example">Ví dụ nguồn: {selected.source_example_en}</p>}<label>Định nghĩa tiếng Anh đã kiểm tra<textarea rows={3} value={definition} onChange={(event) => setDefinition(event.target.value)} /></label><label>Nghĩa tiếng Việt do admin biên soạn<input maxLength={300} value={meaning} onChange={(event) => setMeaning(event.target.value)} placeholder="Nghĩa phù hợp với ngữ cảnh" /></label><label>Topic đã kiểm tra<select value={reviewedTopic} onChange={(event) => setReviewedTopic(event.target.value)}><option value="">Chọn topic</option>{sourceTopics.map((topic) => <option key={topic}>{topic}</option>)}</select></label><label>Ví dụ đã kiểm tra<textarea rows={2} value={example} onChange={(event) => setExample(event.target.value)} /></label><div className="vbank-actions"><button className="button subtle" disabled={busy} onClick={() => void save(false)}>Lưu nháp</button><button className="button primary" disabled={busy || !definition.trim() || !meaning.trim() || !reviewedTopic} onClick={() => void save(true)}>{selected.published ? "Lưu & giữ xuất bản" : "Duyệt & xuất bản"}</button></div></section>}
    {notice && <p className="vbank-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
