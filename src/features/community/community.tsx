"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Bell, Bookmark, Check, CheckCircle2, ChevronDown,
  Flag, Heart, HelpCircle, Lightbulb, MessageCircle, MessagesSquare, Mic, MoreHorizontal,
  PenLine, Search, Send, ShieldAlert, Sparkles, UsersRound, X,
} from "lucide-react";
import { demoMode } from "@/lib/runtime";
import { AvatarFrame } from "@/components/account/avatar-frame";
import { PageHeader } from "@/components/ui/page-header";
import { Sticker } from "@/components/stickers/stickers";
import { createClient } from "@/lib/supabase/browser";

type PostKind = "discussion" | "question" | "writing_review" | "speaking_review";
type Topic = "IELTS" | "Grammar" | "Vocabulary" | "Writing" | "Speaking" | "Reading" | "Listening";
type AuthorCard = { avatar: string; frame: string; level: number } | null;
type Post = { id: string; author_id: string; author_name: string; author_card?: AuthorCard; kind: PostKind; topic: Topic; title: string; body: string; status: string; accepted_comment_id: string | null; created_at: string; likes: number; comments: number; liked: boolean; saved: boolean };
type Comment = { id: string; post_id: string; parent_id: string | null; author_id: string; author_name: string; author_card?: AuthorCard; body: string; created_at: string };
type Notification = { id: string; actor_name: string; post_id: string; kind: string; read_at: string | null; created_at: string };
type Report = { id: string; post_id: string; reason: string; detail: string; created_at: string };
type FeedResult = { posts: Post[]; hasMore: boolean; userId: string };
type DetailResult = { post: Post; replies: Comment[]; userId: string };
type Draft = { kind: PostKind; title?: string; topic?: Topic };
type Me = { avatar: string; frame: string; name: string } | null;

const samplePosts: Post[] = [
  { id: "sample-1", author_id: "sample", author_name: "Minh Anh", kind: "question", topic: "Grammar", title: "Phân biệt ‘despite’ và ‘although’ như thế nào?", body: "Mình thường nhầm khi làm Writing Task 2. Có ai giải thích giúp mình kèm ví dụ dễ hiểu không? Cảm ơn mọi người!", status: "published", accepted_comment_id: null, created_at: new Date().toISOString(), likes: 0, comments: 0, liked: false, saved: false },
  { id: "sample-2", author_id: "sample", author_name: "Hoàng Nam", kind: "writing_review", topic: "Writing", title: "Nhờ mọi người góp ý bài Writing của mình", body: "Some people believe that studying abroad offers more opportunities than studying in their home country. To what extent do you agree or disagree?", status: "published", accepted_comment_id: null, created_at: new Date().toISOString(), likes: 0, comments: 0, liked: false, saved: false },
  { id: "sample-3", author_id: "sample", author_name: "Lan Chi", kind: "discussion", topic: "Speaking", title: "Cách cải thiện phát âm /θ/ và /ð/?", body: "Mình hay phát âm thành /t/ và /d/. Có bài tập nào giúp luyện hai âm này không ạ?", status: "published", accepted_comment_id: null, created_at: new Date().toISOString(), likes: 0, comments: 0, liked: false, saved: false },
];
const kindTabs = [
  { label: "Tất cả", key: "all" }, { label: "Hỏi đáp", key: "question" },
  { label: "Sửa bài", key: "review" }, { label: "Thảo luận", key: "discussion" },
];
const kinds: { key: PostKind; label: string }[] = [
  { key: "question", label: "Câu hỏi" }, { key: "writing_review", label: "Sửa bài Writing" },
  { key: "speaking_review", label: "Sửa bài Speaking" }, { key: "discussion", label: "Thảo luận" },
];
const kindMeta: Record<PostKind, { label: string; hint: string; tone: string; Icon: typeof HelpCircle }> = {
  question: { label: "Câu hỏi", hint: "Ngữ pháp, từ vựng, chiến lược làm bài", tone: "sky", Icon: HelpCircle },
  writing_review: { label: "Sửa bài Writing", hint: "Nhận góp ý cho Task 1 và Task 2", tone: "lavender", Icon: PenLine },
  speaking_review: { label: "Sửa bài Speaking", hint: "Góp ý ý tưởng, từ vựng, phát âm", tone: "coral", Icon: Mic },
  discussion: { label: "Thảo luận", hint: "Chia sẻ kinh nghiệm và tài liệu học", tone: "teal", Icon: MessagesSquare },
};
const topics: Topic[] = ["IELTS", "Grammar", "Vocabulary", "Writing", "Speaking", "Reading", "Listening"];
const starters: Draft[] = [
  { kind: "question", topic: "Grammar", title: "Khi nào dùng ‘despite’ và khi nào dùng ‘although’?" },
  { kind: "question", topic: "Reading", title: "Làm sao để không bị hết giờ ở Reading Passage 3?" },
  { kind: "discussion", topic: "Vocabulary", title: "Mọi người ôn từ vựng IELTS mỗi ngày như thế nào?" },
];
const rules = [
  "Đặt tiêu đề rõ ràng, nêu đúng phần bạn cần giúp.",
  "Góp ý cụ thể, kèm ví dụ hoặc cách sửa.",
  "Tôn trọng người học khác — ai cũng từng bắt đầu.",
];

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

function Avatar({ name, card, small = false }: { name: string; card?: AuthorCard; small?: boolean }) {
  return card ? <AvatarFrame avatar={card.avatar} frame={card.frame} size={small ? 36 : 44} alt={`Ảnh đại diện của ${name}`} />
    : <span className={`community-avatar${small ? " small" : ""}`} aria-hidden="true">{name.trim().charAt(0).toLocaleUpperCase("vi-VN") || "H"}</span>;
}

function Level({ card }: { card?: AuthorCard }) {
  return card && Number.isFinite(card.level) ? <span className="community-level" title={`Cấp học tập ${card.level}`}>Lv.{card.level}</span> : null;
}

function KindBadge({ kind }: { kind: PostKind }) {
  const { label, tone, Icon } = kindMeta[kind];
  return <span className={`community-kind tone-${tone}`}><Icon size={13} strokeWidth={2.4} /> {label}</span>;
}

function PostCard({ post, onAction, busy, userId, detail = false }: { post: Post; onAction: (action: string, post: Post) => void; busy: boolean; userId: string; detail?: boolean }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu]);
  const href = `/app/community/posts/${post.id}`;
  const bodyContent = <>
    <h2>{post.title}</h2>
    <p className={post.kind === "writing_review" ? "community-quote" : ""}>{post.body}</p>
    {post.accepted_comment_id && <span className="community-solved"><CheckCircle2 size={14} /> Đã giải đáp</span>}
  </>;
  return <article className={`community-post${detail ? " detail" : ""}`}>
    <div className="community-post-head">
      <Avatar name={post.author_name} card={post.author_card} />
      <div className="community-post-author">
        <span className="community-post-name"><strong>{post.author_name}</strong><Level card={post.author_card} /></span>
        <span className="community-post-time">{when(post.created_at)}</span>
      </div>
      <div className="community-post-tags"><KindBadge kind={post.kind} /><span className={`community-topic topic-${post.topic.toLowerCase()}`}>{post.topic}</span></div>
      {!demoMode && <div className="community-menu-wrap" ref={menuRef}>
        <button type="button" className="community-icon" aria-label="Tùy chọn bài viết" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></button>
        {menu && <div className="community-menu" role="menu">
          {post.author_id === userId
            ? <button role="menuitem" className="danger" onClick={() => { onAction("delete", post); setMenu(false); }}><X size={15} /> Xóa bài viết</button>
            : <><button role="menuitem" onClick={() => { onAction("report", post); setMenu(false); }}><Flag size={15} /> Báo cáo</button><button role="menuitem" onClick={() => { onAction("block", post); setMenu(false); }}><ShieldAlert size={15} /> Chặn tác giả</button></>}
        </div>}
      </div>}
    </div>
    {detail ? <div className="community-post-body">{bodyContent}</div> : <Link className="community-post-body" href={href}>{bodyContent}</Link>}
    <div className="community-post-actions">
      <button type="button" className={`community-like${post.liked ? " selected" : ""}`} disabled={busy || demoMode} onClick={() => onAction("like", post)} aria-label={post.liked ? "Bỏ thích" : "Thích bài viết"} aria-pressed={post.liked}><Heart size={17} fill={post.liked ? "currentColor" : "none"} /> {post.likes}</button>
      <Link href={href}><MessageCircle size={17} /> {post.comments}<span className="community-hide-sm"> bình luận</span></Link>
      <button type="button" className={post.saved ? "selected" : ""} disabled={busy || demoMode} onClick={() => onAction("save", post)} aria-pressed={post.saved}><Bookmark size={17} fill={post.saved ? "currentColor" : "none"} /> {post.saved ? "Đã lưu" : "Lưu"}</button>
      {!detail && <Link className="community-action-cta" href={href}>{post.kind === "writing_review" || post.kind === "speaking_review" ? "Góp ý" : post.kind === "question" ? "Trả lời" : "Thảo luận"} <ArrowRight size={15} /></Link>}
    </div>
  </article>;
}

function Composer({ me, onCreate }: { me: Me; onCreate: (draft: Draft) => void }) {
  return <section className="community-composer" aria-label="Tạo bài viết">
    <div className="community-composer-main">
      {me ? <AvatarFrame avatar={me.avatar} frame={me.frame} size={44} alt="Ảnh đại diện của bạn" /> : <span className="community-avatar" aria-hidden="true"><UsersRound size={20} /></span>}
      <button type="button" onClick={() => onCreate({ kind: "question" })} className="community-composer-prompt"><span>{me?.name ? `${me.name.split(" ").at(-1)}, bạn` : "Bạn"} đang thắc mắc điều gì về IELTS?</span><span className="community-composer-send"><Send size={16} /></span></button>
    </div>
    <div className="community-composer-types">
      {kinds.map(({ key }) => { const { label, hint, tone, Icon } = kindMeta[key]; return <button type="button" key={key} className={`tone-${tone}`} onClick={() => onCreate({ kind: key })}>
        <span className="community-type-icon"><Icon size={18} strokeWidth={2.2} /></span>
        <span className="community-type-copy"><strong>{label}</strong><small>{hint}</small></span>
      </button>; })}
    </div>
  </section>;
}

function CreateDialog({ draft, onClose, onCreated }: { draft: Draft; onClose: () => void; onCreated: (id: string) => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [kind, setKind] = useState<PostKind>(draft.kind), [topic, setTopic] = useState<Topic>(draft.topic ?? (draft.kind === "writing_review" ? "Writing" : draft.kind === "speaking_review" ? "Speaking" : "IELTS"));
  const [title, setTitle] = useState(draft.title ?? ""), [body, setBody] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLInputElement>(draft.title ? "textarea" : "input")?.focus();
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
  }, [onClose, draft.title]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (demoMode) { setError("Bản xem trước không lưu bài. Hãy đăng nhập vào hệ thống thật để đăng."); return; }
    setBusy(true);
    try { const result = await api<{ id: string }>("POST", { action: "post", kind, topic, title, body }); onCreated(result.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đăng bài"); }
    finally { setBusy(false); }
  }
  const { hint } = kindMeta[kind];
  return <div className="community-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="community-dialog-title" className="community-dialog">
    <header><div><h2 id="community-dialog-title">Tạo bài viết</h2><p>{hint}</p></div><button type="button" className="community-icon" onClick={onClose} aria-label="Đóng"><X size={20} /></button></header>
    <form onSubmit={submit}>
      <div className="community-kind-tabs" role="radiogroup" aria-label="Loại bài viết">{kinds.map((option) => { const { tone, Icon } = kindMeta[option.key]; return <button type="button" role="radio" aria-checked={kind === option.key} key={option.key} className={`tone-${tone}${kind === option.key ? " active" : ""}`} onClick={() => setKind(option.key)}><Icon size={15} /> {option.label}</button>; })}</div>
      <label>Tiêu đề<input required minLength={8} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "question" ? "Ví dụ: Khi nào dùng present perfect trong Task 1?" : kind === "writing_review" ? "Ví dụ: Nhờ góp ý Task 2 – chủ đề Education" : "Đặt tiêu đề rõ ràng cho bài viết"} /><small className="community-count">{title.length}/160</small></label>
      <label>Nội dung<textarea required minLength={20} maxLength={12000} rows={8} value={body} onChange={(event) => setBody(event.target.value)} placeholder={kind === "writing_review" ? "Dán đề bài và bài viết, sau đó nêu phần bạn muốn được góp ý (ý tưởng, từ vựng, ngữ pháp…)" : kind === "speaking_review" ? "Ghi câu hỏi Speaking và câu trả lời của bạn, hoặc mô tả âm bạn khó phát âm…" : "Viết nội dung hoặc câu hỏi của bạn…"} /><small className="community-count">{body.trim().length < 20 ? `Tối thiểu 20 ký tự · ${body.trim().length}/20` : `${body.length}/12000`}</small></label>
      <div className="community-form-row"><label>Chủ đề<select value={topic} onChange={(event) => setTopic(event.target.value as Topic)}>{topics.map((value) => <option key={value}>{value}</option>)}</select></label><div className="community-visibility"><UsersRound size={16} /><span>Công khai với cộng đồng học tập</span></div></div>
      {kind === "speaking_review" && <p className="community-form-note">Tải âm thanh sẽ được mở sau khi luồng lưu trữ riêng tư hoàn tất. Hiện tại hãy mô tả bằng chữ.</p>}
      {error && <p className="community-error" role="alert">{error}</p>}
      <footer><button type="button" className="button subtle" onClick={onClose}>Hủy</button><button type="submit" className="button primary" disabled={busy || title.trim().length < 8 || body.trim().length < 20}><Send size={15} /> {busy ? "Đang đăng…" : "Đăng bài"}</button></footer>
    </form>
  </section></div>;
}

function Skeleton() {
  return <div className="community-skeleton" aria-hidden="true"><div><i className="circle" /><i className="line short" /></div><i className="line" /><i className="line" /><i className="line half" /></div>;
}

export function Community({ canManage = false }: { canManage?: boolean }) {
  const pathname = usePathname(), router = useRouter();
  const detailId = pathname.startsWith("/app/community/posts/") ? pathname.split("/")[4] : null;
  const special = pathname.split("/")[3] || "";
  const unavailable = Boolean(special && !["posts", "new", "saved", "mine", "notifications", "moderation"].includes(special));
  const [posts, setPosts] = useState<Post[]>([]), [post, setPost] = useState<Post | null>(null), [replies, setReplies] = useState<Comment[]>([]), [userId, setUserId] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]), [reports, setReports] = useState<Report[]>([]);
  const [kindFilter, setKindFilter] = useState("all"), [topicFilter, setTopicFilter] = useState<Topic | "">(""), [query, setQuery] = useState(""), [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null), [comment, setComment] = useState(""), [replyTo, setReplyTo] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<Post | null>(null), [reportReason, setReportReason] = useState("spam");
  const [me, setMe] = useState<Me>(null);
  const filtered = kindFilter !== "all" || Boolean(topicFilter) || Boolean(appliedQuery);
  const feedView = !detailId && !special;

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    void (async () => {
      const db = createClient();
      const { data: auth } = await db.auth.getUser();
      if (!auth.user) return;
      const { data } = await db.from("profiles").select("avatar,avatar_frame,display_name").eq("id", auth.user.id).maybeSingle();
      if (active) setMe({ avatar: data?.avatar || "harry", frame: data?.avatar_frame || "classic", name: data?.display_name && data.display_name.trim() !== "Learner" ? data.display_name.trim() : "" });
    })();
    return () => { active = false; };
  }, []);

  const load = useCallback(async (nextPage = 0, append = false) => {
    setLoading(true); setError("");
    if (unavailable || special === "moderation" && !canManage) { setLoading(false); return; }
    if (demoMode) {
      setPosts(samplePosts.filter((item) => kindFilter === "all" || kindFilter === "review" && item.kind.includes("review") || item.kind === kindFilter).filter((item) => !topicFilter || item.topic === topicFilter).filter((item) => !appliedQuery || `${item.title} ${item.body}`.toLowerCase().includes(appliedQuery.toLowerCase())));
      setPost(samplePosts.find((item) => item.id === detailId) ?? null); setLoading(false); return;
    }
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
        if (kindFilter !== "all") params.set("kind", kindFilter);
        if (topicFilter) params.set("topic", topicFilter);
        if (appliedQuery) params.set("q", appliedQuery);
        const result = await api<FeedResult>("GET", params.toString());
        setPosts((current) => append ? [...current, ...result.posts] : result.posts); setHasMore(result.hasMore); setPage(nextPage); setUserId(result.userId);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu"); }
    finally { setLoading(false); }
  }, [detailId, special, kindFilter, topicFilter, appliedQuery, unavailable, canManage]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  function clearFilters() { setKindFilter("all"); setTopicFilter(""); setQuery(""); setAppliedQuery(""); }
  function pickTopic(item: Topic) { if (special) router.push("/app/community"); setTopicFilter((current) => current === item ? "" : item); }

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

  const navLinks = [
    { href: "/app/community", key: "", label: "Bảng tin", Icon: UsersRound },
    { href: "/app/community/saved", key: "saved", label: "Bài đã lưu", Icon: Bookmark },
    { href: "/app/community/mine", key: "mine", label: "Bài của tôi", Icon: PenLine },
    { href: "/app/community/notifications", key: "notifications", label: "Thông báo", Icon: Bell },
    ...(canManage ? [{ href: "/app/community/moderation", key: "moderation", label: "Kiểm duyệt", Icon: Flag }] : []),
  ];
  const activeNav = detailId ? "posts" : special;

  const emptyFeed = special === "saved" ? <section className="community-empty"><Sticker name="star" size={64} tilt={-6} /><h2>Chưa có bài nào được lưu</h2><p>Nhấn <Bookmark size={13} /> Lưu ở bài viết hữu ích để đọc lại sau.</p><Link className="button primary" href="/app/community">Khám phá bảng tin <ArrowRight size={15} /></Link></section>
    : special === "mine" ? <section className="community-empty"><Sticker name="pencil" size={64} tilt={-6} /><h2>Bạn chưa đăng bài nào</h2><p>Đặt câu hỏi đầu tiên hoặc nhờ cộng đồng góp ý bài viết của bạn.</p><button className="button primary" onClick={() => setDraft({ kind: "question" })}><HelpCircle size={16} /> Đặt câu hỏi</button></section>
    : filtered ? <section className="community-empty"><Sticker name="globe" size={64} tilt={-6} /><h2>Không có bài viết khớp bộ lọc</h2><p>Thử bỏ bớt bộ lọc, hoặc là người đầu tiên mở chủ đề này.</p><div className="community-empty-actions"><button className="button subtle" onClick={clearFilters}><X size={15} /> Xóa bộ lọc</button><button className="button primary" onClick={() => setDraft({ kind: kindFilter === "review" ? "writing_review" : kindFilter === "all" ? "question" : kindFilter as PostKind, topic: topicFilter || undefined })}><Sparkles size={15} /> Tạo bài viết</button></div></section>
    : <section className="community-empty welcome"><Sticker name="bubble" size={72} tilt={-6} /><h2>Hãy mở đầu cuộc trò chuyện!</h2><p>Bảng tin đang chờ bài viết đầu tiên. Một câu hỏi nhỏ của bạn cũng có thể giúp nhiều người khác.</p>
      <div className="community-starters"><span><Lightbulb size={15} /> Gợi ý để bắt đầu</span>{starters.map((item) => <button type="button" key={item.title} onClick={() => setDraft(item)}><KindBadge kind={item.kind} /><strong>{item.title}</strong><ArrowRight size={16} /></button>)}</div>
      <div className="community-empty-actions"><button className="button primary" onClick={() => setDraft({ kind: "question" })}><HelpCircle size={16} /> Đặt câu hỏi</button><button className="button subtle" onClick={() => setDraft({ kind: "writing_review" })}><PenLine size={16} /> Nhờ sửa Writing</button></div></section>;

  return <div className="community-page">
    {demoMode && <div className="community-demo-note">Bản xem trước · Nội dung minh họa, chưa phải bài đăng thật.</div>}
    {feedView && <PageHeader className="community-head" eyebrow="Cộng đồng học tập" title="Hỏi nhanh, sửa bài, cùng tiến bộ" description="Đặt câu hỏi IELTS, nhờ góp ý Writing – Speaking và học cùng những người có chung mục tiêu." sticker="bubble" actions={<button type="button" className="button primary" onClick={() => setDraft({ kind: "question" })}><PenLine size={16} /> Tạo bài viết</button>} />}
    {notice && <div className="community-notice" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Đóng thông báo"><X size={15} /></button></div>}
    {error && <div className="community-error" role="alert"><ShieldAlert size={17} /><span>{error}</span><button onClick={() => { setError(""); void load(); }}>Thử lại</button></div>}
    <div className="community-layout"><main className="community-main">
      {detailId ? <>
        <Link className="community-back" href="/app/community"><ArrowLeft size={16} /> Bảng tin cộng đồng</Link>
        {loading && !post ? <Skeleton /> : post ? <>
          <PostCard post={post} onAction={action} busy={busy} userId={userId} detail />
          <section className="community-comments"><div className="community-section-title"><h2>Câu trả lời <span className="community-count-pill">{replies.length}</span></h2>{post.kind === "question" && post.accepted_comment_id && <span className="community-solved"><CheckCircle2 size={15} /> Đã giải đáp</span>}</div>
            {replies.length ? replies.filter((item) => !item.parent_id).map((item) => <div className={`community-comment${post.accepted_comment_id === item.id ? " accepted" : ""}`} key={item.id}><Avatar name={item.author_name} card={item.author_card} small /><div className="community-comment-content"><div className="community-comment-meta"><strong>{item.author_name}</strong><Level card={item.author_card} /><span>{when(item.created_at)}</span>{post.accepted_comment_id === item.id && <em><Check size={13} /> Hữu ích nhất</em>}</div><p>{item.body}</p><div className="community-comment-actions"><button onClick={() => { setReplyTo(item.id); document.getElementById("community-comment")?.focus(); }}>Trả lời</button>{post.kind === "question" && post.author_id === userId && <button onClick={() => void accept(item.id)} disabled={busy}>{post.accepted_comment_id === item.id ? "Bỏ chọn" : "Chọn hữu ích nhất"}</button>}{item.author_id === userId && <button onClick={() => void deleteComment(item.id)} disabled={busy}>Xóa</button>}</div>{replies.filter((reply) => reply.parent_id === item.id).map((reply) => <div className="community-comment nested" key={reply.id}><Avatar name={reply.author_name} card={reply.author_card} small /><div className="community-comment-content"><div className="community-comment-meta"><strong>{reply.author_name}</strong><Level card={reply.author_card} /><span>{when(reply.created_at)}</span></div><p>{reply.body}</p>{reply.author_id === userId && <div className="community-comment-actions"><button onClick={() => void deleteComment(reply.id)}>Xóa</button></div>}</div></div>)}</div></div>) : <div className="community-empty-inline"><MessageCircle size={20} /> Chưa có phản hồi. Hãy là người đầu tiên góp ý!</div>}
            {!demoMode && <form onSubmit={sendComment} className="community-comment-form"><label htmlFor="community-comment">Viết bình luận</label>{replyTo && <div className="community-replying">Đang trả lời {replies.find((item) => item.id === replyTo)?.author_name ?? "bình luận"} <button type="button" onClick={() => setReplyTo(null)}>Hủy</button></div>}<textarea id="community-comment" minLength={2} maxLength={3000} required rows={3} placeholder="Góp ý cụ thể và tôn trọng người học khác…" value={comment} onChange={(event) => setComment(event.target.value)} /><button className="button primary" disabled={busy || !comment.trim()}><Send size={15} /> Gửi bình luận</button></form>}
          </section>
        </> : !loading && <section className="community-empty"><Sticker name="globe" size={64} tilt={-6} /><h2>Không tìm thấy bài viết</h2><p>Bài viết có thể đã bị xóa hoặc ẩn.</p><Link className="button primary" href="/app/community">Quay về bảng tin</Link></section>}
      </> : special === "notifications" ? <section className="community-panel"><div className="community-section-title"><h1><Bell size={20} /> Thông báo cộng đồng</h1></div>{loading ? <Skeleton /> : notifications.length ? notifications.map((item) => <button className={`community-notification ${item.read_at ? "" : "unread"}`} key={item.id} disabled={busy} onClick={() => void openNotification(item)}><span className="community-notification-icon"><MessageCircle size={17} /></span><span><strong>{item.actor_name}</strong> đã bình luận về bài viết của bạn <small>{when(item.created_at)}</small></span><ArrowRight size={16} /></button>) : <div className="community-empty bare"><Sticker name="bubble" size={60} tilt={-6} /><h2>Chưa có thông báo mới</h2><p>Khi có người bình luận bài viết của bạn, thông báo sẽ xuất hiện ở đây.</p></div>}</section>
      : special === "moderation" && canManage ? <section className="community-panel"><div className="community-section-title"><h1><Flag size={20} /> Báo cáo cần xem xét</h1></div>{loading ? <Skeleton /> : reports.length ? reports.map((item) => <div className="community-report" key={item.id}><div><strong>{item.reason}</strong><p>{item.detail || "Không có mô tả thêm"}</p><small>{when(item.created_at)}</small></div><div><Link href={`/app/community/posts/${item.post_id}`}>Xem bài</Link><button disabled={busy} onClick={() => void moderate(item, true)}>Ẩn bài</button><button disabled={busy} onClick={() => void moderate(item, false)}>Bỏ qua</button></div></div>) : <div className="community-empty bare"><Sticker name="stamp" size={60} tilt={-6} /><h2>Không có báo cáo đang chờ</h2></div>}</section>
      : special === "moderation" || unavailable ? <section className="community-empty"><ShieldAlert size={30} /><h1>{unavailable ? "Chức năng này chưa mở" : "Bạn không có quyền xem trang này"}</h1><p>{unavailable ? "Trang này sẽ xuất hiện khi dữ liệu và quyền riêng tư được hoàn thiện." : "Khu vực kiểm duyệt chỉ dành cho quản trị viên."}</p><Link className="button primary" href="/app/community">Về bảng tin</Link></section>
      : <>
        {special === "saved" || special === "mine" ? <div className="community-list-title"><Link href="/app/community"><ArrowLeft size={16} /> Bảng tin</Link><h1>{special === "saved" ? "Bài đã lưu" : "Bài của tôi"}</h1></div> : <Composer me={me} onCreate={setDraft} />}
        <div className="community-toolbar">
          <div className="community-toolbar-row">
            <div className="community-tabs" role="tablist" aria-label="Loại bài viết">{kindTabs.map((tab) => <button role="tab" aria-selected={kindFilter === tab.key} className={kindFilter === tab.key ? "active" : ""} key={tab.key} onClick={() => setKindFilter(tab.key)}>{tab.label}</button>)}</div>
            <form className="community-search" role="search" onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query.trim()); }}><Search size={16} /><input aria-label="Tìm bài viết cộng đồng" placeholder="Tìm bài viết…" value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value) setAppliedQuery(""); }} />{query && <button type="button" className="community-search-clear" aria-label="Xóa tìm kiếm" onClick={() => { setQuery(""); setAppliedQuery(""); }}><X size={14} /></button>}<button type="submit" className="community-search-go" aria-label="Tìm kiếm"><ArrowRight size={15} /></button></form>
          </div>
          <div className="community-topic-row" role="group" aria-label="Lọc theo chủ đề"><button className={!topicFilter ? "active" : ""} aria-pressed={!topicFilter} onClick={() => setTopicFilter("")}>Mọi chủ đề</button>{topics.map((item) => <button key={item} className={`topic-${item.toLowerCase()}${topicFilter === item ? " active" : ""}`} aria-pressed={topicFilter === item} onClick={() => setTopicFilter(topicFilter === item ? "" : item)}>{item}</button>)}</div>
        </div>
        {filtered && !loading && posts.length > 0 && <div className="community-filter-summary"><span>{posts.length}{hasMore ? "+" : ""} bài viết{appliedQuery && <> cho “<strong>{appliedQuery}</strong>”</>}</span><button onClick={clearFilters}><X size={13} /> Xóa bộ lọc</button></div>}
        <div className="community-feed" aria-busy={loading}>{loading && !posts.length ? <><Skeleton /><Skeleton /></> : posts.length ? posts.map((item) => <PostCard key={item.id} post={item} onAction={action} busy={busy} userId={userId} />) : emptyFeed}</div>
        {hasMore && <button className="community-more" onClick={() => void load(page + 1, true)} disabled={loading}>{loading ? "Đang tải…" : "Xem thêm bài viết"} <ChevronDown size={16} /></button>}
      </>}
    </main><aside className="community-rail" aria-label="Khám phá cộng đồng">
      <section className="community-rail-card"><h2>Khám phá</h2><nav className="community-rail-nav">{navLinks.map(({ href, key, label, Icon }) => <Link key={href} href={href} className={activeNav === key ? "active" : ""} aria-current={activeNav === key ? "page" : undefined}><span className="community-rail-icon"><Icon size={17} /></span>{label}<ArrowRight size={15} /></Link>)}</nav></section>
      <section className="community-rail-card"><h2>Chủ đề học tập</h2><p>Lọc nhanh theo kỹ năng bạn quan tâm.</p><div className="community-topic-links">{topics.map((item) => <button key={item} className={`topic-${item.toLowerCase()}${topicFilter === item ? " active" : ""}`} aria-pressed={topicFilter === item} onClick={() => pickTopic(item)}>{item}</button>)}</div></section>
      {posts.length > 0 && feedView && <section className="community-rail-card community-featured-card"><h2>Bài viết gần đây</h2>{posts.slice(0, 3).map((item) => <Link key={item.id} href={`/app/community/posts/${item.id}`}><span>{item.title}<small>{item.author_name} · {when(item.created_at)}</small></span><ArrowRight size={14} /></Link>)}</section>}
      <section className="community-rail-card community-rules"><h2><Sparkles size={16} /> Để nhận góp ý tốt</h2><ol>{rules.map((item) => <li key={item}>{item}</li>)}</ol></section>
    </aside></div>
    {(draft || special === "new") && <CreateDialog key={`${draft?.kind}-${draft?.title ?? ""}`} draft={draft ?? { kind: "discussion" }} onClose={() => { setDraft(null); if (special === "new") router.push("/app/community"); }} onCreated={(id) => { setDraft(null); router.push(`/app/community/posts/${id}`); }} />}
    {reportPost && <div className="community-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportPost(null); }}><form className="community-report-dialog" onSubmit={submitReport} role="dialog" aria-modal="true" aria-label="Báo cáo bài viết"><div className="community-section-title"><h2>Báo cáo bài viết</h2><button type="button" className="community-icon" onClick={() => setReportPost(null)} aria-label="Đóng"><X size={19} /></button></div><p>Quản trị viên sẽ xem xét báo cáo của bạn.</p><label>Lý do<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="spam">Spam</option><option value="abuse">Ngôn từ không phù hợp</option><option value="privacy">Thông tin cá nhân</option><option value="other">Khác</option></select></label>{error && <p className="community-error" role="alert">{error}</p>}<div className="community-report-actions"><button type="button" className="button subtle" onClick={() => setReportPost(null)}>Hủy</button><button className="button primary" disabled={busy}><Flag size={15} /> Gửi báo cáo</button></div></form></div>}
  </div>;
}
