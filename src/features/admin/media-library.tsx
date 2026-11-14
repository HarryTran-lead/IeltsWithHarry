"use client";
/* eslint-disable @next/next/no-img-element -- Admin assets can use external hosts chosen by the editor. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { LoadingBlock } from "@/components/layout/loading-block";
import { Image as ImageIcon, Upload } from "lucide-react";
import { AdminCardHead, AdminNotice } from "./admin-ui";

type Asset = { name: string; metadata?: { size?: number; mimetype?: string } | null };

export function MediaLibrary() {
  const supabase = useMemo(() => createClient(), []);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const folders = await supabase.storage.from("lesson-media").list("", { limit: 100 });
    if (folders.error) { setError(folders.error.message); setLoading(false); return; }
    const paths = folders.data?.map((item) => item.name) ?? [];
    const results = await Promise.all(paths.map(async (path) => {
      const result = await supabase.storage.from("lesson-media").list(path, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      return (result.data ?? []).filter((item) => item.id).map((item) => ({ ...item, name: `${path}/${item.name}` }));
    }));
    setAssets(results.flat()); setError("");
    setLoading(false);
  }, [supabase]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) { setError("Tệp tối đa 10 MB."); return; }
    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml", "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"].includes(file.type)) { setError("Định dạng tệp chưa được hỗ trợ."); return; }
    setBusy(true); setError("");
    const name = file.name.toLowerCase().replace(/[^a-z0-9.-]/g, "-").slice(-80);
    const result = await supabase.storage.from("lesson-media").upload(`library/${crypto.randomUUID()}-${name}`, file, { contentType: file.type });
    setBusy(false);
    if (result.error) setError(result.error.message); else await load();
  }

  return <section className="card admin-card"><AdminCardHead title="Hình ảnh & âm thanh" count={loading ? undefined : assets.length} description="JPG, PNG, WebP, SVG, MP3, M4A, WAV, OGG, WebM · tối đa 10 MB mỗi tệp."><label className="button primary admin-file-button"><Upload size={16} /> {busy ? "Đang tải lên…" : "Tải tệp lên"}<input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ""; }} /></label></AdminCardHead>
    {error && <AdminNotice tone="error">{error}</AdminNotice>}
    <div className="admin-assets">{assets.map((asset) => { const url = supabase.storage.from("lesson-media").getPublicUrl(asset.name).data.publicUrl; const isImage = /\.(png|jpe?g|webp|svg)$/i.test(asset.name); return <article key={asset.name} className="admin-asset">{isImage ? <img src={url} alt="" /> : <div className="admin-audio-icon">♫</div>}<strong title={asset.name}>{asset.name.split("/").pop()}</strong><small>{asset.metadata?.size ? `${Math.round(asset.metadata.size / 1024)} KB` : "Media"}</small><button type="button" className="button subtle" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(asset.name); }}>{copied === asset.name ? "Đã sao chép" : "Sao chép URL"}</button></article>; })}</div>
    {loading ? <p role="status"><LoadingBlock label="Đang tải thư viện media…" /></p> : !assets.length && !error && <div className="admin-empty-state"><span className="admin-empty-icon"><ImageIcon size={26} /></span><div><h3>Thư viện đang trống</h3><p>Tải hình hoặc âm thanh lên để dùng lại trong nhiều bài. Bạn cũng có thể tải trực tiếp trong form của từng bài.</p></div></div>}
  </section>;
}
