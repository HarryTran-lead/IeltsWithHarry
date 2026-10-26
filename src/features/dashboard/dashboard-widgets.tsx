"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight, Clock3, Newspaper, Play, UsersRound } from "lucide-react";
import { liveStreams, liveThumbnail, savedStream, saveStream, STREAM_EVENT, type LiveStream } from "@/features/study-room/live-streams";
import { HeadIcon } from "@/components/ui/head-icon";
import { useStudyPresence } from "@/features/study-room/study-presence";
import { createClient } from "@/lib/supabase/browser";
import { liveMode } from "@/lib/runtime";

type NewsRow = { id: string; title: string; publisher: string; category: string; published_at: string; image_url: string | null; image_alt: string | null; image_credit: string | null };
type RoomMessage = { id: string; display_name: string; body: string };

function ago(value: string, now: number) {
  const hours = Math.max(0, Math.floor((now - new Date(value).valueOf()) / 3600000));
  return hours < 1 ? "Vừa đăng" : hours < 24 ? `${hours} giờ trước` : `${Math.floor(hours / 24)} ngày trước`;
}

/** The three newest readable Daily News stories that already have a picture. */
export function LatestNews() {
  const db = useMemo(() => (liveMode ? createClient() : null), []);
  const [rows, setRows] = useState<NewsRow[] | null>(liveMode ? null : []);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    if (!db) return;
    let active = true;
    void db.from("news_archive_catalog").select("id,title,publisher,category,published_at,image_url,image_alt,image_credit")
      .eq("publication_status", "published").eq("sensitive", false).eq("readable", true).not("image_url", "is", null)
      .order("published_at", { ascending: false }).limit(9)
      .then(({ data }) => { if (active) setRows(((data ?? []) as NewsRow[]).filter((row) => row.image_url && row.image_alt && row.image_credit).slice(0, 3)); });
    return () => { active = false; };
  }, [db]);
  if (rows && !rows.length) return null;
  return <section className="card dash-news">
    <div className="card-head">
      <div className="head-title"><HeadIcon icon={Newspaper} tone="sky" /><h2>Daily News mới nhất</h2></div>
      <Link href="/app/news" className="text-link">Xem tất cả <ChevronRight size={14} /></Link>
    </div>
    <div className="dash-news-grid" aria-busy={!rows}>
      {rows ? rows.map((row) => <Link key={row.id} href={`/app/news/${row.id}`} className="dash-news-card">
        <span className="dash-news-img">
          <Image src={row.image_url!} alt={row.image_alt!} fill sizes="(max-width: 700px) 100vw, 280px" unoptimized />
          <small>{row.category}</small>
        </span>
        <strong>{row.title}</strong>
        <span className="dash-news-meta" title={`Ảnh: ${row.image_credit}`}>{ago(row.published_at, now)} · {row.publisher}</span>
      </Link>) : [0, 1, 2].map((key) => <span key={key} className="dash-news-card skeleton" />)}
    </div>
  </section>;
}

/** Live study room at a glance: who is studying, the latest chat lines and a one-tap join. */
export function StudyRoomCard() {
  const { online, status, studySeconds, sessionActive } = useStudyPresence();
  const [stream, setStream] = useState<LiveStream>(liveStreams[0]);
  // A new frame from the broadcast every few minutes while the dashboard is open.
  const [frame, setFrame] = useState(() => Math.floor(Date.now() / 300000));
  useEffect(() => {
    const sync = () => setStream(savedStream());
    const raf = requestAnimationFrame(sync);
    const timer = window.setInterval(() => setFrame(Math.floor(Date.now() / 300000)), 300000);
    window.addEventListener(STREAM_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { cancelAnimationFrame(raf); window.clearInterval(timer); window.removeEventListener(STREAM_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const db = useMemo(() => (liveMode ? createClient() : null), []);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  useEffect(() => {
    if (!db) return;
    let active = true;
    void db.from("study_room_messages").select("id,display_name,body").order("created_at", { ascending: false }).limit(2)
      .then(({ data }) => { if (active) setMessages(((data ?? []) as RoomMessage[]).reverse()); });
    return () => { active = false; };
  }, [db]);
  const minutes = Math.floor(studySeconds / 60);
  return <section className="card dash-room">
    <div className="dash-room-head">
      <span className={`dash-room-live ${status === "live" ? "is-live" : ""}`}><i /> Phòng cùng học</span>
      <span className="dash-room-online"><UsersRound size={15} /> <b>{online ?? "…"}</b> đang học</span>
    </div>
    <Link href="/app/study-together" className="dash-room-stream" aria-label={`Vào phòng học với livestream ${stream.title} của ${stream.channel}`}>
      <Image key={`${stream.id}-${frame}`} src={liveThumbnail(stream.id, frame)} alt="" fill sizes="(max-width: 700px) 100vw, 360px" unoptimized />
      <span className="dash-room-onair"><i /> {sessionActive ? "Đang phát" : "Live"}</span>
      <span className="dash-room-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
      <span className="dash-room-stream-meta"><strong>{stream.emoji} {stream.title}</strong><small>{stream.channel} · {stream.description}</small></span>
    </Link>
    <div className="dash-room-streams" role="group" aria-label="Chọn livestream">
      {liveStreams.map((item) => <button key={item.id} type="button" aria-pressed={item.id === stream.id} title={`${item.channel} · ${item.title}`} onClick={() => saveStream(item.id)}>
        <span aria-hidden="true">{item.emoji}</span>{item.title}</button>)}
    </div>
    {messages.length > 0 && <ul className="dash-room-chat" aria-label="Tin nhắn mới trong phòng">
      {messages.map((item) => <li key={item.id}><span aria-hidden="true">{item.display_name.slice(0, 1).toUpperCase()}</span><p><b>{item.display_name}</b> {item.body}</p></li>)}
    </ul>}
    <div className="dash-room-foot">
      <span><Clock3 size={14} /> Hôm nay: <b>{minutes} phút</b></span>
      <Link href="/app/study-together" className="button primary">Tham gia ngay <ArrowRight size={16} /></Link>
    </div>
  </section>;
}
