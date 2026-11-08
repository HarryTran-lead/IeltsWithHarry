"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/browser";

type Kind = "ielts_exam" | "course" | "lesson" | "news_article" | "news_learning";
type Asset = "text" | "audio" | "image";
type RecordRow = { id: string; asset_kind: Asset; asset_url: string | null; author_name: string; rights_holder: string; permission_document_ref: string; reviewed_at: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AdminRightsEvidence() {
  const db = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<Kind>("ielts_exam");
  const [id, setId] = useState("");
  const [asset, setAsset] = useState<Asset>("text");
  const [assetUrl, setAssetUrl] = useState("");
  const [packageName, setPackageName] = useState("");
  const [packageHash, setPackageHash] = useState("");
  const [author, setAuthor] = useState("");
  const [holder, setHolder] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [uploading, setUploading] = useState(false);
  const [scope, setScope] = useState("");
  const [web, setWeb] = useState(false);
  const [commercial, setCommercial] = useState(false);
  const [adapt, setAdapt] = useState(false);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function uploadDocument(file: File | undefined) {
    if (!file) return;
    setMessage("");
    if (!uuid.test(id)) { setMessage("Nhập ID nội dung trước khi tải văn bản."); return; }
    const allowed: Record<string, string> = { "application/pdf": "pdf", "text/plain": "txt", "image/png": "png", "image/jpeg": "jpg" };
    const extension = allowed[file.type];
    if (!extension || file.size > 5 * 1024 * 1024) { setMessage("Chỉ nhận PDF, TXT, PNG hoặc JPG tối đa 5 MB."); return; }
    setUploading(true);
    const path = `${kind}/${id}/${crypto.randomUUID()}.${extension}`;
    const result = await db.storage.from("rights-evidence").upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (result.error) { setMessage(`Không tải được văn bản: ${result.error.message}`); return; }
    setDocumentRef(`rights-evidence/${path}`);
    setMessage("Đã lưu văn bản trong kho riêng. Hoàn tất thông tin bên dưới để ghi hồ sơ quyền.");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedKind = params.get("kind");
    const requestedId = params.get("id");
    void Promise.resolve().then(() => {
      if (["ielts_exam", "course", "lesson", "news_article", "news_learning"].includes(requestedKind ?? "")) setKind(requestedKind as Kind);
      if (requestedId && uuid.test(requestedId)) setId(requestedId);
    });
  }, []);

  useEffect(() => {
    if (!uuid.test(id)) { void Promise.resolve().then(() => setRecords([])); return; }
    let active = true;
    void db.from("content_rights_evidence").select("id,asset_kind,asset_url,author_name,rights_holder,permission_document_ref,reviewed_at")
      .eq("content_kind", kind).eq("content_id", id).order("reviewed_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        setRecords((data ?? []) as RecordRow[]);
        if (error) setMessage(`Không đọc được hồ sơ quyền: ${error.message}`);
      });
    return () => { active = false; };
  }, [db, kind, id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!uuid.test(id)) { setMessage("ID nội dung không hợp lệ."); return; }
    if (asset !== "text" && !/^https:\/\//.test(assetUrl)) { setMessage("Audio và ảnh cần URL HTTPS chính xác của tài sản."); return; }
    if (Boolean(packageName) !== Boolean(packageHash) || (packageHash && !/^[0-9a-f]{64}$/.test(packageHash))) { setMessage("Tên gói ZIP và SHA-256 phải đi cùng nhau."); return; }
    if (!web || !commercial || !adapt) { setMessage("Chỉ ghi hồ sơ đủ cả quyền đăng web, thương mại và sửa/dịch."); return; }
    setBusy(true);
    const user = await db.auth.getUser();
    if (!user.data.user) { setMessage("Cần đăng nhập admin."); setBusy(false); return; }
    const result = await db.from("content_rights_evidence").insert({
      content_kind: kind, content_id: id, asset_kind: asset, asset_url: asset === "text" ? null : assetUrl.trim(),
      source_package_name: packageName.trim() || null, source_package_sha256: packageHash.trim() || null,
      author_name: author.trim(), rights_holder: holder.trim(), permission_document_ref: documentRef.trim(), permission_scope: scope.trim(),
      web_publication_allowed: web, commercial_use_allowed: commercial, modification_translation_allowed: adapt, reviewed_by: user.data.user.id,
    }).select("id,asset_kind,asset_url,author_name,rights_holder,permission_document_ref,reviewed_at").single();
    setBusy(false);
    if (result.error || !result.data) { setMessage(result.error?.message ?? "Không lưu được hồ sơ quyền."); return; }
    setRecords((current) => [result.data as RecordRow, ...current]);
    setMessage("Đã lưu bằng chứng quyền. Kiểm tra từng audio/ảnh riêng trước khi xuất bản.");
  }

  return <section className="card admin-news-panel"><h2>Hồ sơ quyền nội dung</h2>
    <p>Mỗi bài hoặc gói đề cần hồ sơ phần chữ. Thêm một hồ sơ riêng cho từng URL audio và ảnh. Tải văn bản cho phép vào kho riêng; URL giấy phép công khai chỉ dùng khi điều khoản cho phép đúng phạm vi bên dưới. Đường dẫn bài báo không phải bằng chứng cho phép.</p>
    <form className="admin-news-form" onSubmit={(event) => void save(event)}>
      <label>Loại nội dung<select value={kind} onChange={(event) => setKind(event.target.value as Kind)}><option value="ielts_exam">Đề IELTS</option><option value="course">Khóa học</option><option value="lesson">Bài học</option><option value="news_article">Tin Daily News</option><option value="news_learning">Bài học Daily News</option></select></label>
      <label>ID nội dung<input required value={id} onChange={(event) => setId(event.target.value.trim())} placeholder="UUID của bản nháp" /></label>
      <label>Loại tài sản<select value={asset} onChange={(event) => setAsset(event.target.value as Asset)}><option value="text">Chữ, đề, đáp án</option><option value="audio">Audio</option><option value="image">Ảnh</option></select></label>
      {asset !== "text" && <label>URL tài sản<input required type="url" value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} /></label>}
      <label>Tên gói ZIP (nếu có)<input value={packageName} onChange={(event) => setPackageName(event.target.value)} /></label>
      <label>SHA-256 gói ZIP<input value={packageHash} onChange={(event) => setPackageHash(event.target.value)} /></label>
      <label>Tác giả<input required minLength={2} value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
      <label>Chủ sở hữu quyền<input required minLength={2} value={holder} onChange={(event) => setHolder(event.target.value)} /></label>
      <label className="wide">Tải văn bản cho phép hoặc giấy tờ chứng minh quyền<input type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" disabled={uploading} onChange={(event) => void uploadDocument(event.target.files?.[0])} /></label>
      <label className="wide">Đường dẫn văn bản đã lưu hoặc URL giấy phép công khai<input required minLength={12} value={documentRef} onChange={(event) => setDocumentRef(event.target.value)} placeholder="rights-evidence/... hoặc https://..." /></label>
      <label className="wide">Phạm vi cho phép<textarea required minLength={20} rows={3} value={scope} onChange={(event) => setScope(event.target.value)} /></label>
      <label className="admin-check"><input type="checkbox" checked={web} onChange={(event) => setWeb(event.target.checked)} /> Cho đăng trên web</label>
      <label className="admin-check"><input type="checkbox" checked={commercial} onChange={(event) => setCommercial(event.target.checked)} /> Cho dùng thương mại</label>
      <label className="admin-check"><input type="checkbox" checked={adapt} onChange={(event) => setAdapt(event.target.checked)} /> Cho sửa và dịch</label>
      <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu hồ sơ quyền"}</button>
    </form>
    {message && <p role="status">{message}</p>}
    <h3>Hồ sơ đã lưu ({records.length})</h3>
    {records.map((record) => <p key={record.id}>{record.asset_kind.toUpperCase()} {record.asset_url ?? ""} · {record.author_name} / {record.rights_holder} · {record.permission_document_ref}</p>)}
  </section>;
}
