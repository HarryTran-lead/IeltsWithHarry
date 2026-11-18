"use client";

import { useEffect, useState } from "react";
import { Link2, Share2, X } from "lucide-react";
import { LoadingBlock } from "@/components/layout/loading-block";

type ShareState = { enabled: boolean; token: string | null };

export function ReadingShare({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const link = share?.enabled && share.token && typeof window !== "undefined" ? `${window.location.origin}/reading/share/${share.token}` : "";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function show() {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/ielts/bank/share?attemptId=${encodeURIComponent(attemptId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không tải được liên kết chia sẻ.");
      setShare(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được liên kết chia sẻ."); }
    finally { setBusy(false); }
  }

  async function toggle() {
    if (!share) return;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/ielts/bank/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, enabled: !share.enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không cập nhật được chia sẻ.");
      setShare(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không cập nhật được chia sẻ."); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setError("Không sao chép được. Bạn có thể chọn và sao chép liên kết trong ô."); }
  }

  return <>
    <button type="button" className="br-share-trigger" onClick={() => void show()}><Share2 size={16} /> Chia sẻ bài làm</button>
    {open && <div className="br-share-layer" role="dialog" aria-modal="true" aria-labelledby="br-share-title">
      <button type="button" className="br-share-backdrop" aria-label="Đóng" onClick={() => setOpen(false)} />
      <section className="br-share-card">
        <header><div><h2 id="br-share-title">Chia sẻ bài Reading</h2><p>Ai có liên kết đều có thể xem bài đọc, câu trả lời và kết quả của bạn.</p></div><button type="button" aria-label="Đóng" onClick={() => setOpen(false)}><X size={18} /></button></header>
        {share && <label className="br-share-toggle"><span><b>Bật chia sẻ</b><small>Tắt để vô hiệu hóa liên kết cũ ngay lập tức.</small></span><input type="checkbox" checked={share.enabled} disabled={busy} onChange={() => void toggle()} /></label>}
        {link && <div className="br-share-link"><Link2 size={17} /><input aria-label="Liên kết chia sẻ" readOnly value={link} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copy()}>{copied ? "Đã sao chép" : "Sao chép"}</button></div>}
        {busy && <p role="status"><LoadingBlock label="Đang tải…" /></p>}
        {error && <p className="br-share-error" role="alert">{error}</p>}
      </section>
    </div>}
  </>;
}
