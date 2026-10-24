"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenText, CheckCircle2, FilePenLine, LogOut, Upload } from "lucide-react";
import sample from "@/content/demo-pack.json";
import { authoredPackSchema, type AuthoredPack } from "@/lib/authored-content";
import { DEMO_DRAFT_PACK_KEY, DEMO_PUBLISHED_PACK_KEY } from "@/lib/demo-content";

const sampleText = JSON.stringify(sample, null, 2);

export function DemoAdminEditor() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState(sampleText);
  const [published, setPublished] = useState<AuthoredPack | null>(null);
  const [preview, setPreview] = useState<AuthoredPack | null>(authoredPackSchema.parse(sample));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const draft = localStorage.getItem(DEMO_DRAFT_PACK_KEY);
        if (draft) { setJsonText(draft); const parsed = authoredPackSchema.safeParse(JSON.parse(draft)); if (parsed.success) setPreview(parsed.data); }
        const live = localStorage.getItem(DEMO_PUBLISHED_PACK_KEY);
        if (live) { const parsed = authoredPackSchema.safeParse(JSON.parse(live)); if (parsed.success) setPublished(parsed.data); }
      } catch { /* Keep the bundled sample if local demo content is damaged. */ }
    });
  }, []);

  function validate() {
    setError(""); setMessage("");
    try {
      if (jsonText.length > 100_000) throw new Error("Gói dữ liệu tối đa 100 KB.");
      const result = authoredPackSchema.safeParse(JSON.parse(jsonText));
      if (!result.success) { const issue = result.error.issues[0]; throw new Error(`${issue.path.join(".")}: ${issue.message}`); }
      setPreview(result.data);
      return result.data;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "JSON không hợp lệ"); return null; }
  }

  function saveDraft() {
    const pack = validate(); if (!pack) return;
    try { localStorage.setItem(DEMO_DRAFT_PACK_KEY, JSON.stringify(pack, null, 2)); setMessage("Đã lưu nháp trong trình duyệt này."); }
    catch { setError("Không thể lưu nháp. Bộ nhớ trình duyệt có thể đã đầy."); }
  }
  function publish() {
    const pack = validate(); if (!pack) return;
    try {
      localStorage.setItem(DEMO_DRAFT_PACK_KEY, JSON.stringify(pack, null, 2));
      localStorage.setItem(DEMO_PUBLISHED_PACK_KEY, JSON.stringify(pack));
      setPublished(pack);
      setMessage("Đã xuất bản cho Content Lab demo trong trình duyệt này. Đổi sang vai trò học viên để xem.");
    } catch { setError("Không thể xuất bản. Bộ nhớ trình duyệt có thể đã đầy."); }
  }
  function unpublish() {
    localStorage.removeItem(DEMO_PUBLISHED_PACK_KEY);
    setPublished(null);
    setMessage("Đã gỡ bản xuất bản demo. Học viên sẽ thấy gói mẫu mặc định.");
  }
  async function signOut() {
    await fetch("/auth/demo", { method: "DELETE" });
    router.push("/"); router.refresh();
  }

  return <div className="demo-admin"><aside className="demo-admin-sidebar"><Link href="/admin" className="demo-admin-brand">★ English Skill Lab <span>ADMIN</span></Link><nav><a href="#overview">Tổng quan</a><a href="#editor">Biên tập nội dung</a><a href="#preview">Xem trước</a></nav><button type="button" onClick={() => void signOut()}><LogOut size={17} /> Thoát admin demo</button></aside><main>
    <header id="overview" className="demo-admin-hero"><span className="eyebrow">KHU QUẢN TRỊ · BẢN DEMO</span><h1>Quản lý nội dung học</h1><p>Admin soạn gói bài học, lưu nháp và xuất bản. Nội dung xuất bản sẽ xuất hiện ở Content Lab khi chuyển sang vai trò học viên trên cùng trình duyệt.</p><div className="demo-admin-status"><span><FilePenLine size={19} /> Nháp: {preview?.title ?? "Chưa có"}</span><span><CheckCircle2 size={19} /> Xuất bản: {published?.title ?? "Gói mẫu mặc định"}</span></div></header>
    <section id="editor" className="card demo-admin-card"><div className="demo-admin-card-head"><div><span className="eyebrow">CONTENT EDITOR</span><h2>Gói nội dung JSON</h2><p>Gói này chứa từ vựng, câu hỏi, đáp án, bài đọc, kịch bản nghe, đề Writing và Speaking.</p></div><Upload size={30} /></div><textarea aria-label="Gói nội dung JSON" spellCheck={false} value={jsonText} onChange={(event) => setJsonText(event.target.value)} /><div className="demo-admin-actions"><button type="button" className="button subtle" onClick={() => { setJsonText(sampleText); setMessage("Đã tải mẫu vào khung soạn. Nhấn lưu hoặc xuất bản để áp dụng."); }}>Tải nội dung mẫu</button><button type="button" className="button subtle" onClick={saveDraft}>Lưu nháp</button><button type="button" className="button primary" onClick={publish}>Xuất bản demo</button>{published && <button type="button" className="button subtle" onClick={unpublish}>Gỡ xuất bản</button>}</div>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="demo-admin-message" role="status">{message}</p>}</section>
    <section id="preview" className="card demo-admin-card"><div className="demo-admin-card-head"><div><span className="eyebrow">PREVIEW</span><h2>Xem cấu trúc trước khi xuất bản</h2></div><BookOpenText size={30} /></div><button type="button" className="button subtle" onClick={validate}>Kiểm tra JSON và xem trước</button>{preview && <div className="demo-admin-preview"><h3>{preview.title}</h3><p>{preview.level}</p><div><span>{preview.vocabulary.length} từ vựng</span><span>{preview.grammar.questions.length} câu Grammar</span><span>{preview.reading.questions.length} câu Reading</span><span>{preview.listening.questions.length} câu Listening</span><span>1 đề Writing</span><span>1 đề Speaking</span></div></div>}</section>
    <p className="demo-admin-disclaimer">Quyền admin demo chỉ điều khiển dữ liệu trong trình duyệt này. Admin thật cần tài khoản Supabase được cấp quyền; người học không thể tự cấp quyền admin trong chế độ live.</p>
  </main></div>;
}
