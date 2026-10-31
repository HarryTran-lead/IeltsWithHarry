/* eslint-disable @next/next/no-img-element -- Signed private storage URLs are generated for each read-only share visit. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";
import { BookOpen, LockKeyhole } from "lucide-react";
import { documentSchema, IMAGE_BUCKET, PAGE_HEIGHT, PAGE_WIDTH, type PageDocument } from "@/features/notebook/smart-model";
import styles from "./share.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sổ tay được chia sẻ | IeltsWithHarry", robots: { index: false, follow: false } };

function plainText(html: string) {
  const $ = load(`<main>${html}</main>`);
  $("script,style,iframe,object").remove();
  return $("main").text().trim();
}

function Ink({ doc }: { doc: PageDocument }) {
  return <svg className={styles.ink} viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`} aria-hidden="true">{doc.strokes.map((stroke) => <polyline key={stroke.id} points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeOpacity={stroke.tool === "marker" ? 0.35 : 1} strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
}

export default async function SharedNotebookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) notFound();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: share } = await db.from("smart_notebook_shares").select("notebook_id,user_id,enabled").eq("token", token).eq("enabled", true).maybeSingle();
  if (!share) notFound();
  const [{ data: book }, { data: pages }] = await Promise.all([
    db.from("smart_notebooks").select("title,description,cover,deleted_at").eq("id", share.notebook_id).eq("user_id", share.user_id).is("deleted_at", null).maybeSingle(),
    db.from("smart_notebook_pages").select("id,paper,position,document").eq("notebook_id", share.notebook_id).eq("user_id", share.user_id).order("position"),
  ]);
  if (!book || !pages) notFound();

  const imagePaths = [...new Set(pages.flatMap((page) => {
    const parsed = documentSchema.safeParse(page.document);
    return parsed.success ? parsed.data.elements.filter((item) => item.type === "image" && item.path.startsWith(`${share.user_id}/${share.notebook_id}/`)).map((item) => item.type === "image" ? item.path : "") : [];
  }))];
  const signed = new Map<string, string>();
  await Promise.all(imagePaths.map(async (path) => {
    const result = await db.storage.from(IMAGE_BUCKET).createSignedUrl(path, 3600);
    if (result.data?.signedUrl) signed.set(path, result.data.signedUrl);
  }));

  return <main className={styles.main}><header className={styles.header}><Link href="/" className={styles.brand}><BookOpen size={25} /> IeltsWithHarry</Link><span><LockKeyhole size={16} /> Chỉ xem</span></header><div className={styles.intro}><span>SỔ TAY ĐƯỢC CHIA SẺ</span><h1>{book.title}</h1>{book.description && <p>{book.description}</p>}<small>{pages.length} trang</small></div><div className={styles.pages}>{pages.map((page, index) => { const parsed = documentSchema.safeParse(page.document); if (!parsed.success) return null; const doc = parsed.data; return <section key={page.id} className={styles.pageBlock}><h2>Trang {index + 1}</h2><div className={`${styles.sheet} ${styles[page.paper as "blank" | "ruled" | "grid"]}`}>{doc.elements.map((item) => <div key={item.id} className={styles.element} style={{ left: item.x, top: item.y, width: item.width, height: item.height }}>{item.type === "text" ? <div className={styles.text}>{plainText(item.html)}</div> : signed.has(item.path) ? <img src={signed.get(item.path)} alt="Ảnh trong sổ tay" /> : null}</div>)}<Ink doc={doc} /></div></section>; })}</div></main>;
}
