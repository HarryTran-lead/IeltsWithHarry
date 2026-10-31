import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { communityEnabled, demoMode } from "@/lib/runtime";

export const runtime = "nodejs";

const uuid = z.string().uuid();
const postInput = z.object({
  kind: z.enum(["discussion", "question", "writing_review", "speaking_review"]),
  topic: z.enum(["IELTS", "Grammar", "Vocabulary", "Writing", "Speaking", "Reading", "Listening"]),
  title: z.string().trim().min(8).max(160),
  body: z.string().trim().min(20).max(12000),
});
const commentInput = z.object({ postId: uuid, body: z.string().trim().min(2).max(3000), parentId: uuid.nullable().optional() });

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra";
  const status = message === "Bạn cần đăng nhập" ? 401 : message === "Không có quyền" ? 403 : 400;
  return Response.json({ error: message }, { status });
}

async function context() {
  if (!communityEnabled) throw new Error("Cộng đồng chưa được mở trên hệ thống này.");
  if (demoMode) throw new Error("Bản xem trước không lưu dữ liệu. Hãy đăng nhập để sử dụng Cộng đồng.");
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error("Bạn cần đăng nhập");
  return { db, user: data.user };
}

async function enrich(db: Awaited<ReturnType<typeof createClient>>, userId: string, posts: Record<string, unknown>[]) {
  if (!posts.length) return [];
  const ids = posts.map((post) => String(post.id));
  const [likes, comments, bookmarks] = await Promise.all([
    db.from("community_reactions").select("post_id,user_id").in("post_id", ids),
    db.from("community_comments").select("post_id").in("post_id", ids).eq("status", "published"),
    db.from("community_bookmarks").select("post_id").in("post_id", ids).eq("user_id", userId),
  ]);
  const failure = likes.error || comments.error || bookmarks.error;
  if (failure) throw new Error(failure.message);
  const likeCount = new Map<string, number>(), commentCount = new Map<string, number>();
  const liked = new Set<string>(), saved = new Set<string>();
  for (const row of likes.data ?? []) {
    likeCount.set(row.post_id, (likeCount.get(row.post_id) ?? 0) + 1);
    if (row.user_id === userId) liked.add(row.post_id);
  }
  for (const row of comments.data ?? []) commentCount.set(row.post_id, (commentCount.get(row.post_id) ?? 0) + 1);
  for (const row of bookmarks.data ?? []) saved.add(row.post_id);
  return posts.map((post) => ({ ...post, likes: likeCount.get(String(post.id)) ?? 0, comments: commentCount.get(String(post.id)) ?? 0, liked: liked.has(String(post.id)), saved: saved.has(String(post.id)) }));
}

export async function GET(request: Request) {
  try {
    const { db, user } = await context();
    const params = new URL(request.url).searchParams;
    const view = params.get("view") ?? "feed";
    if (view === "notifications") {
      const { data, error } = await db.from("community_notifications").select("id,actor_name,post_id,kind,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return Response.json({ notifications: data ?? [] });
    }
    if (view === "reports") {
      const { data: admin } = await db.rpc("is_admin");
      if (!admin) throw new Error("Không có quyền");
      const { data, error } = await db.from("community_reports").select("id,post_id,reason,detail,status,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return Response.json({ reports: data ?? [] });
    }
    if (view === "post") {
      const id = uuid.parse(params.get("id"));
      const { data: post, error } = await db.from("community_posts").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      const { data: admin } = await db.rpc("is_admin");
      if (!post || post.status !== "published" && post.author_id !== user.id && !admin) return Response.json({ error: "Bài viết không tồn tại hoặc đã bị ẩn" }, { status: 404 });
      const { data: comments, error: commentsError } = await db.from("community_comments").select("id,post_id,parent_id,author_id,author_name,body,status,created_at").eq("post_id", id).eq("status", "published").order("created_at", { ascending: true });
      if (commentsError) throw new Error(commentsError.message);
      return Response.json({ post: (await enrich(db, user.id, [post]))[0], replies: comments ?? [], userId: user.id });
    }
    const page = Math.min(50, Math.max(0, Number(params.get("page") ?? 0) || 0));
    let query = db.from("community_posts").select("id,author_id,author_name,kind,topic,title,body,status,accepted_comment_id,created_at").eq("status", "published").order("created_at", { ascending: false }).range(page * 12, page * 12 + 12);
    const kind = params.get("kind");
    if (kind === "review") query = query.in("kind", ["writing_review", "speaking_review"]);
    else if (["discussion", "question", "writing_review", "speaking_review"].includes(kind ?? "")) query = query.eq("kind", kind!);
    const topic = params.get("topic");
    if (["IELTS", "Grammar", "Vocabulary", "Writing", "Speaking", "Reading", "Listening"].includes(topic ?? "")) query = query.eq("topic", topic!);
    if (view === "mine") query = query.eq("author_id", user.id);
    const search = (params.get("q") ?? "").trim().slice(0, 80).replace(/[%_,.()]/g, " ");
    if (search) query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    if (view === "saved") {
      const { data: saved, error } = await db.from("community_bookmarks").select("post_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      const ids = (saved ?? []).map((row) => row.post_id);
      if (!ids.length) return Response.json({ posts: [], hasMore: false });
      query = query.in("id", ids);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const posts = await enrich(db, user.id, data ?? []);
    return Response.json({ posts: posts.slice(0, 12), hasMore: posts.length === 13, userId: user.id });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await context();
    const input = await request.json();
    if (input.action === "post") {
      const data = postInput.parse(input);
      const { data: post, error } = await db.from("community_posts").insert({ ...data, author_id: user.id }).select("id").single();
      if (error) throw new Error(error.message);
      return Response.json({ id: post.id }, { status: 201 });
    }
    if (input.action === "comment") {
      const data = commentInput.parse(input);
      const { data: comment, error } = await db.from("community_comments").insert({ post_id: data.postId, body: data.body, parent_id: data.parentId ?? null, author_id: user.id }).select("id").single();
      if (error) throw new Error(error.message);
      return Response.json({ id: comment.id }, { status: 201 });
    }
    if (input.action === "report") {
      const postId = uuid.parse(input.postId), reason = z.enum(["spam", "abuse", "privacy", "other"]).parse(input.reason);
      const detail = z.string().max(500).parse(input.detail ?? "");
      const { error } = await db.from("community_reports").upsert({ post_id: postId, reporter_id: user.id, reason, detail }, { onConflict: "reporter_id,post_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    throw new Error("Thao tác không hợp lệ");
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { db, user } = await context();
    const input = await request.json();
    const id = uuid.parse(input.id);
    if (input.action === "like" || input.action === "save") {
      const table = input.action === "like" ? "community_reactions" : "community_bookmarks";
      const result = input.value
        ? await db.from(table).upsert({ post_id: id, user_id: user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
        : await db.from(table).delete().eq("post_id", id).eq("user_id", user.id);
      if (result.error) throw new Error(result.error.message);
    } else if (input.action === "accept") {
      const commentId = input.commentId ? uuid.parse(input.commentId) : null;
      const { data, error } = await db.from("community_posts").update({ accepted_comment_id: commentId }).eq("id", id).eq("author_id", user.id).eq("kind", "question").select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Không có quyền");
    } else if (input.action === "delete") {
      const { data, error } = await db.from("community_posts").update({ status: "deleted" }).eq("id", id).eq("author_id", user.id).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Không có quyền");
    } else if (input.action === "deleteComment") {
      const { data, error } = await db.from("community_comments").update({ status: "deleted" }).eq("id", id).eq("author_id", user.id).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Không có quyền");
    } else if (input.action === "block") {
      const blockedId = id;
      const { error } = await db.from("community_blocks").upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    } else if (input.action === "read") {
      const { error } = await db.from("community_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
      if (error) throw new Error(error.message);
    } else if (input.action === "moderate" || input.action === "resolve") {
      const { data: admin } = await db.rpc("is_admin");
      if (!admin) throw new Error("Không có quyền");
      if (input.action === "moderate") {
        const status = z.enum(["published", "hidden"]).parse(input.status);
        const { error } = await db.from("community_posts").update({ status }).eq("id", id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("community_reports").update({ status: "resolved", reviewed_by: user.id }).eq("id", id);
        if (error) throw new Error(error.message);
      }
    } else throw new Error("Thao tác không hợp lệ");
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
