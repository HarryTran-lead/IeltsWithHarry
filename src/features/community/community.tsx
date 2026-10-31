"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Bell, Bookmark, Check, CheckCircle2, ChevronDown,
  Flag, Heart, MessageCircle, MoreHorizontal, PenLine, Plus, Search,
  Send, ShieldAlert, Sparkles, UsersRound, X,
} from "lucide-react";
import { demoMode } from "@/lib/runtime";

type PostKind = "discussion" | "question" | "writing_review" | "speaking_review";
type Topic = "IELTS" | "Grammar" | "Vocabulary" | "Writing" | "Speaking" | "Reading" | "Listening";
type Post = { id: string; author_id: string; author_name: string; kind: PostKind; topic: Topic; title: string; body: string; status: string; accepted_comment_id: string | null; created_at: string; likes: number; comments: number; liked: boolean; saved: boolean };
type Comment = { id: string; post_id: string; parent_id: string | null; author_id: string; author_name: string; body: string; created_at: string };
type Notification = { id: string; actor_name: string; post_id: string; kind: string; read_at: string | null; created_at: string };
type Report = { id: string; post_id: string; reason: string; detail: string; created_at: string };
type FeedResult = { posts: Post[]; hasMore: boolean; userId: string };
type DetailResult = { post: Post; replies: Comment[]; userId: string };

const samplePosts: Post[] = [
  { id: "sample-1", author_id: "sample", author_name: "Minh Anh", kind: "question", topic: "Grammar", title: "Phân biệt ‘despite’ và ‘although’ như thế nào?", body: "Mình thường nhầm khi làm Writing Task 2. Có ai giải thích giúp mình kèm ví dụ dễ hiểu không? Cảm ơn mọi người!", status: "published", accepted_comment_id: null, created_at: new Date().toISOString(), likes: 0, comments: 0, liked: false, saved: false },
  { id: "sample-2", author_id: "sample", author_name: "Hoàng Nam", kind: "writing_review", topic: "Writing", title: "Nhờ mọi người góp ý bài Writing của mình", body: "Some people believe that studying abroad offers more opportunities than studying in their home country. To what extent do you agree or disagree?", status: "published", accepted_comment_id: null, created_at: new Date().toISOString(), likes: 0, comments: 0, liked: false, saved: false },
  { id: "sample-3", author_id: "sample", author_name: "Lan Chi", kind: "discussion", topic: "Speaking", title: "Cách cải thiện phát âm /θ/ và /ð/?", body: "Mình hay phát âm thành /t/ và /d/. Có bài tập nào giúp luyện hai âm này không ạ?", status: "published", accepted_comment_id: null, created_at: new Date().toISOString(), likes: 0, comments: 0, liked: false, saved: false },
];
const tabs = [
  { label: "Tất cả", key: "all" }, { label: "Hỏi đáp", key: "question" },
  { label: "Sửa bài", key: "review" }, { label: "IELTS", key: "IELTS" },
  { label: "Grammar", key: "Grammar" }, { label: "Vocabulary", key: "Vocabulary" },
];
const kinds: { key: PostKind; label: string }[] = [
  { key: "discussion", label: "Bài đăng" }, { key: "question", label: "Câu hỏi" },
  { key: "writing_review", label: "Sửa bài Writing" }, { key: "speaking_review", label: "Sửa bài Speaking" },
];
const topics: Topic[] = ["IELTS", "Grammar", "Vocabulary", "Writing", "Speaking", "Reading", "Listening"];
const kindText: Record<PostKind, string> = { discussion: "Thảo luận", question: "Hỏi đáp", writing_review: "Writing Task", speaking_review: "Speaking" };

async function api<T>(method: "GET" | "POST" | "PATCH", queryOrBody: string | object): Promise<T> {
  const response = await fetch(`/api/community${method === "GET" ? `?${queryOrBody}` : ""}`, {
    method, headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(queryOrBody), cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không thể kết nối Cộng đồng");
  return data as T;
}

function when(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ trước`;
  return new Date(value).toLocaleDateString("vi-VN");
}

function Avatar({ name }: { name: string }) {
  return <span className="community-avatar" aria-hidden="true">{name.trim().charAt(0).toLocaleUpperCase("vi-VN") || "H"}</span>;
}

function PostCard({ post, onAction, busy, userId }: { post: Post; onAction: (action: string, post: Post) => void; busy: boolean; userId: string }) {
  const [menu, setMenu] = useState(false);
  return <article className="community-post">
    <div className="community-post-head">
      <Avatar name={post.author_name} />
      <div className="community-post-author"><strong>{post.author_name}</strong><span>· {when(post.created_at)}</span></div>
      <span className={`community-topic topic-${post.topic.toLowerCase()}`}>{post.topic}</span>
      {!demoMode && <div className="community-menu-wrap"><button type="button" className="community-icon" aria-label="Tùy chọn bài viết" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={19} /></button>{menu && <div className="community-menu">{post.author_id === userId ? <button onClick={() => { onAction("delete", post); setMenu(false); }}><X size={14} /> Xóa bài viết</button> : <><button onClick={() => { onAction("report", post); setMenu(false); }}><Flag size={14} /> Báo cáo</button><button onClick={() => { onAction("block", post); setMenu(false); }}><ShieldAlert size={14} /> Chặn tác giả</button></>}<button onClick={() => setMenu(false)}><X size={14} /> Đóng</button></div>}</div>}
    </div>
    <Link className="community-post-body" href={`/app/community/posts/${post.id}`}>
      {post.kind !== "discussion" && <span className="community-kind">{kindText[post.kind]}</span>}
      <h2>{post.title}</h2>
      <p className={post.kind === "writing_review" ? "community-quote" : ""}>{post.body}</p>
      {post.accepted_comment_id && <span className="community-solved"><CheckCircle2 size={14} /> Đã giải đáp</span>}
    </Link>
    <div className="community-post-actions">
      <button type="button" className={post.liked ? "selected" : ""} disabled={busy || demoMode} onClick={() => onAction("like", post)} aria-label={post.liked ? "Bỏ thích" : "Thích bài viết"}><Heart size={18} fill={post.liked ? "currentColor" : "none"} /> {post.likes}</button>
      <Link href={`/app/community/posts/${post.id}`}><MessageCircle size={18} /> {post.comments} bình luận</Link>
      <button type="button" className={post.saved ? "selected" : ""} disabled={busy || demoMode} onClick={() => onAction("save", post)}><Bookmark size={18} fill={post.saved ? "currentColor" : "none"} /> {post.saved ? "Đã lưu" : "Lưu"}</button>
      <Link className="community-action-cta" href={`/app/community/posts/${post.id}`}>{post.kind === "writing_review" ? "Góp ý bài viết" : "Thảo luận"} <ArrowRight size={16} /></Link>
    </div>
  </article>;
}

function Composer({ onCreate }: { onCreate: (kind?: PostKind) => void }) {
  return <section className="community-composer" aria-label="Tạo bài viết">
    <div className="community-composer-main"><Avatar name="B" /><button onClick={() => onCreate()} className="community-composer-prompt">Bạn muốn chia sẻ điều gì?</button><button className="community-primary" onClick={() => onCreate()}>Đăng bài</button></div>
    <div className="community-composer-types"><button onClick={() => onCreate("question")}><Search size={16} /> Câu hỏi</button><button onClick={() => onCreate("writing_review")}><PenLine size={16} /> Sửa bài Writing</button><button onClick={() => onCreate("speaking_review")}><MessageCircle size={16} /> Sửa bài Speaking</button><button onClick={() => onCreate("discussion")}><Plus size={16} /> Thảo luận</button></div>
  </section>;
}

function CreateDialog({ initialKind, onClose, onCreated }: { initialKind: PostKind; onClose: () => void; onCreated: (id: string) => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [kind, setKind] = useState<PostKind>(initialKind), [topic, setTopic] = useState<Topic>("IELTS");
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (demoMode) { setError("Bản xem trước không lưu bài. Hãy đăng nhập vào hệ thống thật để đăng."); return; }
    setBusy(true);
    try { const result = await api<{ id: string }>("POST", { action: "post", kind, topic, title, body }); onCreated(result.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đăng bài"); }
    finally { setBusy(false); }
  }
  return <div className="community-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="community-dialog-title" className="community-dialog">
    <header><h2 id="community-dialog-title">Tạo bài đăng</h2><button type="button" onClick={onClose} aria-label="Đóng"><X size={20} /></button></header>
    <form onSubmit={submit}><div className="community-kind-tabs" role="group" aria-label="Loại bài viết">{kinds.map((option) => <button type="button" key={option.key} className={kind === option.key ? "active" : ""} onClick={() => setKind(option.key)}>{option.label}</button>)}</div>
      <label>Tiêu đề<input required minLength={8} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "question" ? "Bạn đang thắc mắc điều gì?" : "Đặt tiêu đề rõ ràng cho bài viết"} /></label>
      <label>Nội dung<textarea required minLength={20} maxLength={12000} rows={8} value={body} onChange={(event) => setBody(event.target.value)} placeholder={kind === "writing_review" ? "Dán bài viết và nêu phần bạn muốn nhận góp ý…" : "Viết nội dung hoặc câu hỏi của bạn…"} /></label>
      <div className="community-form-row"><label>Chủ đề<select value={topic} onChange={(event) => setTopic(event.target.value as Topic)}>{topics.map((value) => <option key={value}>{value}</option>)}</select></label><div className="community-visibility"><UsersRound size={16} /><span>Công khai với cộng đồng học tập</span></div></div>
      {kind === "speaking_review" && <p className="community-form-note">Hãy mô tả câu hỏi Speaking hoặc phần phát âm cần góp ý. Tải âm thanh sẽ được mở sau khi luồng lưu trữ riêng tư hoàn tất.</p>}
      {error && <p className="community-error" role="alert">{error}</p>}
      <footer><button type="button" className="community-secondary" onClick={onClose}>Hủy</button><button type="submit" className="community-primary" disabled={busy || !title.trim() || !body.trim()}>{busy ? "Đang đăng…" : "Đăng bài"}</button></footer>
    </form>
  </section></div>;
}

export function Community({ canManage = false }: { canManage?: boolean }) {
  const pathname = usePathname(), router = useRouter();
  const detailId = pathname.startsWith("/app/community/posts/") ? pathname.split("/")[4] : null;
  const special = pathname.split("/")[3] || "";
  const unavailable = Boolean(special && !["posts", "new", "saved", "mine", "notifications", "moderation"].includes(special));
  const [posts, setPosts] = useState<Post[]>([]), [post, setPost] = useState<Post | null>(null), [replies, setReplies] = useState<Comment[]>([]), [userId, setUserId] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]), [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("all"), [query, setQuery] = useState(""), [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [createKind, setCreateKind] = useState<PostKind | null>(null), [comment, setComment] = useState(""), [replyTo, setReplyTo] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<Post | null>(null), [reportReason, setReportReason] = useState("spam");

  const load = useCallback(async (nextPage = 0, append = false) => {
    setLoading(true); setError("");
    if (unavailable || special === "moderation" && !canManage) { setLoading(false); return; }
    if (demoMode) { setPosts(samplePosts.filter((item) => filter === "all" || filter === "review" && item.kind.includes("review") || item.kind === filter || item.topic === filter).filter((item) => !appliedQuery || `${item.title} ${item.body}`.toLowerCase().includes(appliedQuery.toLowerCase()))); setPost(samplePosts.find((item) => item.id === detailId) ?? null); setLoading(false); return; }
    try {
      if (detailId) {
        const result = await api<DetailResult>("GET", new URLSearchParams({ view: "post", id: detailId }).toString());
        setPost(result.post); setReplies(result.replies); setUserId(result.userId);
      } else if (special === "notifications") {
        const result = await api<{ notifications: Notification[] }>("GET", "view=notifications"); setNotifications(result.notifications);
      } else if (special === "moderation") {
        const result = await api<{ reports: Report[] }>("GET", "view=reports"); setReports(result.reports);
      } else {
        const params = new URLSearchParams({ view: special === "saved" ? "saved" : special === "mine" ? "mine" : "feed", page: String(nextPage) });
        if (filter === "review" || ["question", "discussion", "writing_review", "speaking_review"].includes(filter)) params.set("kind", filter);
        else if (topics.includes(filter as Topic)) params.set("topic", filter);
        if (appliedQuery) params.set("q", appliedQuery);
        const result = await api<FeedResult>("GET", params.toString());
        setPosts((current) => append ? [...current, ...result.posts] : result.posts); setHasMore(result.hasMore); setPage(nextPage); setUserId(result.userId);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu"); }
    finally { setLoading(false); }
  }, [detailId, special, filter, appliedQuery, unavailable, canManage]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  async function action(type: string, item: Post) {
    if (type === "report") { setReportPost(item); return; }
    if (type === "block") { if (!window.confirm(`Ẩn bài viết của ${item.author_name}?`)) return; }
    if (type === "delete") { if (!window.confirm("Xóa bài viết này?")) return; }
    setBusy(true); setError("");
    try {
      await api("PATCH", { action: type, id: type === "block" ? item.author_id : item.id, value: type === "like" ? !item.liked : type === "save" ? !item.saved : undefined });
      if (type === "block" || type === "delete") { setNotice(type === "block" ? "Đã chặn tác giả." : "Đã xóa bài viết."); if (type === "delete" && detailId) router.push("/app/community"); else await load(); return; }
      const update = (value: Post) => value.id === item.id ? { ...value, liked: type === "like" ? !value.liked : value.liked, saved: type === "save" ? !value.saved : value.saved, likes: type === "like" ? value.likes + (value.liked ? -1 : 1) : value.likes } : value;
      setPosts((current) => current.map(update)); setPost((current) => current ? update(current) : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể thực hiện thao tác"); }
    finally { setBusy(false); }
  }

  async function sendComment(event: React.FormEvent) {
    event.preventDefault(); if (!post || !comment.trim()) return;
    setBusy(true); setError("");
    try { await api("POST", { action: "comment", postId: post.id, body: comment, parentId: replyTo }); setComment(""); setReplyTo(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể gửi bình luận"); }
    finally { setBusy(false); }
  }

  async function accept(id: string) {
    if (!post) return; setBusy(true); setError("");
    try { await api("PATCH", { action: "accept", id: post.id, commentId: post.accepted_comment_id === id ? null : id }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể chọn câu trả lời"); }
    finally { setBusy(false); }
  }

  async function deleteComment(id: string) {
    if (!window.confirm("Xóa bình luận này?")) return;
    setBusy(true); setError("");
    try { await api("PATCH", { action: "deleteComment", id }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xóa bình luận"); }
    finally { setBusy(false); }
  }

  async function submitReport(event: React.FormEvent) {
    event.preventDefault(); if (!reportPost) return;
    setBusy(true); setError("");
    try { await api("POST", { action: "report", postId: reportPost.id, reason: reportReason }); setReportPost(null); setNotice("Đã gửi báo cáo cho quản trị viên."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể gửi báo cáo"); }
    finally { setBusy(false); }
  }

  async function moderate(item: Report, hide: boolean) {
    setBusy(true); setError("");
    try {
      if (hide) await api("PATCH", { action: "moderate", id: item.post_id, status: "hidden" });
      await api("PATCH", { action: "resolve", id: item.id });
      setNotice(hide ? "Đã ẩn bài viết và xử lý báo cáo." : "Đã xử lý báo cáo.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xử lý báo cáo"); }
    finally { setBusy(false); }
  }

  async function openNotification(item: Notification) {
    setBusy(true); setError("");
    try { if (!item.read_at) await api("PATCH", { action: "read", id: item.id }); router.push(`/app/community/posts/${item.post_id}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể mở thông báo"); }
    finally { setBusy(false); }
  }

  return <div className="community-page">
    {demoMode && <div className="community-demo-note">Bản xem trước · Nội dung minh họa, chưa phải bài đăng thật.</div>}
    {notice && <div className="community-notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Đóng thông báo"><X size={15} /></button></div>}
    {error && <div className="community-error" role="alert">{error}<button onClick={() => { setError(""); void load(); }}>Thử lại</button></div>}
    <div className="community-layout"><main className="community-main">
      {detailId ? <>
        <Link className="community-back" href="/app/community"><ArrowLeft size={16} /> Bảng tin cộng đồng</Link>
        {loading && !post ? <div className="community-skeleton" /> : post ? <>
          <PostCard post={post} onAction={action} busy={busy} userId={userId} />
          <section className="community-comments"><div className="community-section-title"><h2>Câu trả lời ({replies.length})</h2>{post.kind === "question" && post.accepted_comment_id && <span className="community-solved"><CheckCircle2 size={15} /> Đã giải đáp</span>}</div>
            {replies.length ? replies.filter((item) => !item.parent_id).map((item) => <div className="community-comment" key={item.id}><Avatar name={item.author_name} /><div className="community-comment-content"><div><strong>{item.author_name}</strong><span> · {when(item.created_at)}</span>{post.accepted_comment_id === item.id && <em><Check size={13} /> Câu trả lời hữu ích nhất</em>}</div><p>{item.body}</p><div className="community-comment-actions"><button onClick={() => setReplyTo(item.id)}>Trả lời</button>{post.kind === "question" && post.author_id === userId && <button onClick={() => void accept(item.id)} disabled={busy}>{post.accepted_comment_id === item.id ? "Bỏ chọn" : "Chọn hữu ích nhất"}</button>}{item.author_id === userId && <button onClick={() => void deleteComment(item.id)} disabled={busy}>Xóa</button>}</div>{replies.filter((reply) => reply.parent_id === item.id).map((reply) => <div className="community-comment nested" key={reply.id}><Avatar name={reply.author_name} /><div><strong>{reply.author_name}</strong><span> · {when(reply.created_at)}</span><p>{reply.body}</p>{reply.author_id === userId && <button className="community-comment-delete" onClick={() => void deleteComment(reply.id)}>Xóa</button>}</div></div>)}</div></div>) : <p className="community-empty-inline">Chưa có phản hồi. Hãy bắt đầu cuộc thảo luận.</p>}
            {!demoMode && <form onSubmit={sendComment} className="community-comment-form"><label htmlFor="community-comment">Viết bình luận</label>{replyTo && <div className="community-replying">Đang trả lời bình luận <button type="button" onClick={() => setReplyTo(null)}>Hủy</button></div>}<textarea id="community-comment" minLength={2} maxLength={3000} required rows={3} placeholder="Góp ý cụ thể và tôn trọng người học khác…" value={comment} onChange={(event) => setComment(event.target.value)} /><button className="community-primary" disabled={busy || !comment.trim()}><Send size={15} /> Gửi bình luận</button></form>}
          </section>
        </> : !loading && <section className="community-empty">Không tìm thấy bài viết. <Link href="/app/community">Quay về bảng tin</Link></section>}
      </> : special === "notifications" ? <section className="community-panel"><div className="community-section-title"><h1>Thông báo cộng đồng</h1><Bell size={22} /></div>{loading ? <div className="community-skeleton" /> : notifications.length ? notifications.map((item) => <button className={`community-notification ${item.read_at ? "" : "unread"}`} key={item.id} disabled={busy} onClick={() => void openNotification(item)}><MessageCircle size={19} /><span><strong>{item.actor_name}</strong> đã bình luận về bài viết của bạn <small>{when(item.created_at)}</small></span><ArrowRight size={16} /></button>) : <div className="community-empty">Chưa có thông báo mới.</div>}</section>
      : special === "moderation" && canManage ? <section className="community-panel"><div className="community-section-title"><h1>Báo cáo cần xem xét</h1><Flag size={22} /></div>{loading ? <div className="community-skeleton" /> : reports.length ? reports.map((item) => <div className="community-report" key={item.id}><div><strong>{item.reason}</strong><p>{item.detail || "Không có mô tả thêm"}</p><small>{when(item.created_at)}</small></div><div><Link href={`/app/community/posts/${item.post_id}`}>Xem bài</Link><button disabled={busy} onClick={() => void moderate(item, true)}>Ẩn bài</button><button disabled={busy} onClick={() => void moderate(item, false)}>Bỏ qua</button></div></div>) : <div className="community-empty">Không có báo cáo đang chờ.</div>}</section>
      : special === "moderation" || unavailable ? <section className="community-empty"><ShieldAlert size={28} /><h1>{unavailable ? "Chức năng này chưa mở" : "Bạn không có quyền xem trang này"}</h1><p>{unavailable ? "Trang này sẽ xuất hiện khi dữ liệu và quyền riêng tư được hoàn thiện." : "Khu vực kiểm duyệt chỉ dành cho quản trị viên."}</p><Link href="/app/community">Về bảng tin</Link></section>
      : <>
        <div className="community-toolbar"><div className="community-tabs" role="tablist" aria-label="Lọc bảng tin">{tabs.map((tab) => <button role="tab" aria-selected={filter === tab.key} className={filter === tab.key ? "active" : ""} key={tab.key} onClick={() => setFilter(tab.key)}>{tab.label}</button>)}</div><form className="community-search" onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query.trim()); }}><Search size={16} /><input aria-label="Tìm bài viết cộng đồng" placeholder="Tìm bài viết…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="submit" aria-label="Tìm kiếm">→</button></form></div>
        {special === "saved" || special === "mine" ? <div className="community-list-title"><Link href="/app/community"><ArrowLeft size={16} /> Bảng tin</Link><h1>{special === "saved" ? "Bài đã lưu" : "Bài của tôi"}</h1></div> : <Composer onCreate={(kind) => setCreateKind(kind ?? "discussion")} />}
        <div className="community-feed">{loading && !posts.length ? <><div className="community-skeleton" /><div className="community-skeleton" /></> : posts.length ? posts.map((item) => <PostCard key={item.id} post={item} onAction={action} busy={busy} userId={userId} />) : <section className="community-empty"><Sparkles size={30} /><h2>Chưa có bài viết phù hợp</h2><p>Hãy thử chủ đề khác hoặc đặt câu hỏi đầu tiên cho cộng đồng.</p><button className="community-primary" onClick={() => setCreateKind("question")}>Đặt câu hỏi</button></section>}</div>
        {hasMore && <button className="community-more" onClick={() => void load(page + 1, true)} disabled={loading}>{loading ? "Đang tải…" : "Xem thêm bài viết"} <ChevronDown size={16} /></button>}
      </>}
    </main><aside className="community-rail" aria-label="Khám phá cộng đồng">
      <section className="community-rail-card"><h2>Khám phá</h2><Link href="/app/community"><UsersRound size={18} /> Bảng tin <ArrowRight size={15} /></Link><Link href="/app/community/saved"><Bookmark size={18} /> Bài đã lưu <ArrowRight size={15} /></Link><Link href="/app/community/mine"><PenLine size={18} /> Bài của tôi <ArrowRight size={15} /></Link><Link href="/app/community/notifications"><Bell size={18} /> Thông báo <ArrowRight size={15} /></Link>{canManage && <Link href="/app/community/moderation"><Flag size={18} /> Kiểm duyệt <ArrowRight size={15} /></Link>}</section>
      <section className="community-rail-card"><h2>Chủ đề học tập</h2><p>Chọn kỹ năng bạn muốn cùng thảo luận.</p><div className="community-topic-links">{topics.slice(0, 5).map((item) => <button key={item} onClick={() => { router.push("/app/community"); setFilter(item); }}>{item}</button>)}</div></section>
      <section className="community-rail-card community-featured-card"><h2>Bài viết gần đây</h2>{posts.slice(0, 3).length ? posts.slice(0, 3).map((item) => <Link key={item.id} href={`/app/community/posts/${item.id}`}><span>{item.title}<small>{item.author_name}</small></span><ArrowRight size={14} /></Link>) : <p>Bài viết mới sẽ xuất hiện ở đây.</p>}</section>
    </aside></div>
    {(createKind || special === "new") && <CreateDialog initialKind={createKind ?? "discussion"} onClose={() => { setCreateKind(null); if (special === "new") router.push("/app/community"); }} onCreated={(id) => { setCreateKind(null); router.push(`/app/community/posts/${id}`); }} />}
    {reportPost && <div className="community-dialog-backdrop"><form className="community-report-dialog" onSubmit={submitReport} role="dialog" aria-modal="true" aria-label="Báo cáo bài viết"><div className="community-section-title"><h2>Báo cáo bài viết</h2><button type="button" onClick={() => setReportPost(null)} aria-label="Đóng"><X size={19} /></button></div><p>Quản trị viên sẽ xem xét báo cáo của bạn.</p><label>Lý do<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="spam">Spam</option><option value="abuse">Ngôn từ không phù hợp</option><option value="privacy">Thông tin cá nhân</option><option value="other">Khác</option></select></label>{error && <p className="community-error" role="alert">{error}</p>}<button className="community-primary" disabled={busy}>Gửi báo cáo</button></form></div>}
  </div>;
}
