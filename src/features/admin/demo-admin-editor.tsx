"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, CheckCircle2, Eye, FileJson, FilePenLine, Headphones, Languages, LayoutDashboard, ListChecks, Upload } from "lucide-react";
import sample from "@/content/demo-pack.json";
import { Sticker } from "@/components/stickers/stickers";
import { HeadIcon } from "@/components/ui/head-icon";
import { authoredPackSchema, type AuthoredPack } from "@/lib/authored-content";
import { DEMO_DRAFT_PACK_KEY, DEMO_PUBLISHED_PACK_KEY } from "@/lib/demo-content";
import { AdminShell } from "./admin-shell";
import { YoutubeLessonsAdmin } from "./youtube-lessons";

const sampleText = JSON.stringify(sample, null, 2);
const sections = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "editor", label: "Biên tập nội dung", icon: FilePenLine },
  { id: "preview", label: "Xem trước", icon: Eye },
  { id: "youtube", label: "YouTube Listening", icon: Headphones },
] as const;

export function DemoAdminEditor() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState(sampleText);
  const [published, setPublished] = useState<AuthoredPack | null>(null);
  const [preview, setPreview] = useState<AuthoredPack | null>(authoredPackSchema.parse(sample));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState<(typeof sections)[number]["id"]>("overview");

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

  const groups = [{ label: "Quản lý nội dung", items: sections.map((item) => ({ href: `#${item.id}`, label: item.label, icon: item.icon, active: active === item.id, onClick: () => setActive(item.id) })) }];
  const lines = jsonText.split("\n").length;
  const sizeKb = (new Blob([jsonText]).size / 1024).toFixed(1);

  return <AdminShell groups={groups} section="Nội dung demo" title="Quản lý nội dung học" description="Admin soạn gói bài học, lưu nháp và xuất bản. Nội dung xuất bản sẽ xuất hiện ở Content Lab khi chuyển sang vai trò học viên trên cùng trình duyệt." mode="demo" onSignOut={() => void signOut()} actions={<button type="button" className="button primary" onClick={publish}><Upload size={16} /> Xuất bản demo</button>}>
    <section id="overview" className="admin-demo-overview">
      <div className="admin-stats stagger">
        <article><HeadIcon icon={Languages} tone="mint" /><span>Từ vựng</span><strong>{preview?.vocabulary.length ?? 0}</strong><small>Thẻ từ trong gói</small></article>
        <article><HeadIcon icon={ListChecks} tone="sky" /><span>Câu Grammar</span><strong>{preview?.grammar.questions.length ?? 0}</strong><small>Có đáp án và giải thích</small></article>
        <article><HeadIcon icon={BookOpenText} tone="coral" /><span>Câu Reading</span><strong>{preview?.reading.questions.length ?? 0}</strong><small>Gắn với bài đọc</small></article>
        <article><HeadIcon icon={Headphones} tone="lavender" /><span>Câu Listening</span><strong>{preview?.listening.questions.length ?? 0}</strong><small>Kèm kịch bản nghe</small></article>
      </div>
      <div className="admin-status-grid">
        <div className="admin-status-card"><span className="status-pill draft"><i aria-hidden="true" />Bản nháp</span><strong>{preview?.title ?? "Chưa có"}</strong><small>{preview?.level ?? "Lưu nháp để giữ gói đang soạn"}</small></div>
        <div className="admin-status-card"><span className="status-pill live"><i aria-hidden="true" />Đang xuất bản</span><strong>{published?.title ?? "Gói mẫu mặc định"}</strong><small>{published ? published.level : "Học viên đang thấy gói mẫu"}</small></div>
        <Sticker name="stamp" label={published ? "LIVE" : "DEMO"} size={86} tilt={-10} className="admin-status-sticker" />
      </div>
    </section>

    <section id="editor" className="card demo-admin-card">
      <div className="demo-admin-card-head"><div><span className="eyebrow">CONTENT EDITOR</span><h2>Gói nội dung JSON</h2><p>Gói này chứa từ vựng, câu hỏi, đáp án, bài đọc, kịch bản nghe, đề Writing và Speaking.</p></div><CheckCircle2 size={22} className={error ? "demo-admin-state invalid" : "demo-admin-state"} /></div>
      <div className="code-editor">
        <div className="code-editor-bar"><span className="code-dots" aria-hidden="true"><i /><i /><i /></span><FileJson size={15} /> demo-pack.json<span className="code-editor-meta">{lines} dòng · {sizeKb} KB</span></div>
        <textarea aria-label="Gói nội dung JSON" spellCheck={false} value={jsonText} onChange={(event) => setJsonText(event.target.value)} />
      </div>
      <div className="demo-admin-actions"><button type="button" className="button subtle" onClick={() => { setJsonText(sampleText); setMessage("Đã tải mẫu vào khung soạn. Nhấn lưu hoặc xuất bản để áp dụng."); }}>Tải nội dung mẫu</button><button type="button" className="button subtle" onClick={saveDraft}>Lưu nháp</button><button type="button" className="button primary" onClick={publish}>Xuất bản demo</button>{published && <button type="button" className="button subtle" onClick={unpublish}>Gỡ xuất bản</button>}</div>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="demo-admin-message" role="status">{message}</p>}
    </section>

    <section id="preview" className="card demo-admin-card">
      <div className="demo-admin-card-head"><div><span className="eyebrow">PREVIEW</span><h2>Xem cấu trúc trước khi xuất bản</h2><p>Kiểm tra JSON để chắc chắn mọi phần đều hợp lệ trước khi học viên nhìn thấy.</p></div><button type="button" className="button subtle" onClick={validate}><Eye size={16} /> Kiểm tra JSON</button></div>
      {preview && <div className="demo-admin-preview"><Sticker name="book" size={58} tilt={-8} /><div><h3>{preview.title}</h3><p>{preview.level}</p><div><span>{preview.vocabulary.length} từ vựng</span><span>{preview.grammar.questions.length} câu Grammar</span><span>{preview.reading.questions.length} câu Reading</span><span>{preview.listening.questions.length} câu Listening</span><span>1 đề Writing</span><span>1 đề Speaking</span></div></div></div>}
    </section>
    <section id="youtube"><YoutubeLessonsAdmin /></section>
    <p className="demo-admin-disclaimer">Quyền admin demo chỉ điều khiển dữ liệu trong trình duyệt này. Admin thật cần tài khoản Supabase được cấp quyền; người học không thể tự cấp quyền admin trong chế độ live.</p>
  </AdminShell>;
}
