"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Headphones, MessageCircle, Music2, Pause, Play, Send, Trash2, UsersRound, Volume2, VolumeX } from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { Sticker } from "@/components/stickers/stickers";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { LofiPlayer } from "./lofi";
import { liveStreams, savedStream, saveStream, STREAM_EVENT } from "./live-streams";
import { useStudyPresence, type StudyRoomMessage } from "./study-presence";

type Message = StudyRoomMessage;
const pageSize = 60;

function mergeMessage(previous: Message[], incoming: Message) {
  if (previous.some((item) => item.id === incoming.id)) return previous;
  return [...previous, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-180);
}

function StudyScene() {
  return <div className="study-scene" role="img" aria-label="Hoạt cảnh Harry đang học bài bên cửa sổ và nghe nhạc">
    <div className="study-scene-glow" />
    <div className="study-window"><span className="study-moon" /><i /><i /><i /><i /><i /></div>
    <div className="study-scene-stars">✦ <span>✦</span> ✦</div>
    <div className="study-lamp"><span /></div>
    <div className="study-student"><HarryMascot size={165} eager /><span className="study-headphones"><Headphones size={29} /></span></div>
    <div className="study-desk"><div className="study-book"><span /><span /></div><span className="study-pencil" /><div className="study-mug">☕</div></div>
    <div className="study-wave" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
    <span className="study-scene-caption">STUDY WITH HARRY · 24/7 FOCUS VIBES</span>
  </div>;
}

export function StudyRoom({ canManage = false }: { canManage?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUser, setCurrentUser] = useState("");
  const { online, status, sessionActive, setSessionActive, studySeconds, subscribeMessages } = useStudyPresence();
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [videoMode, setVideoMode] = useState<"youtube" | "harry">("youtube");
  const [streamId, setStreamId] = useState<string>(liveStreams[0].id);
  const selectedStream = liveStreams.find((stream) => stream.id === streamId) ?? liveStreams[0];
  // Open with the stream picked last time, here or on the dashboard card.
  useEffect(() => {
    const sync = () => setStreamId(savedStream().id);
    sync();
    window.addEventListener(STREAM_EVENT, sync);
    return () => window.removeEventListener(STREAM_EVENT, sync);
  }, []);
  const [volume, setVolume] = useState(65);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const focusEndsAt = useRef<number | null>(null);
  const player = useRef<LofiPlayer | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const supabase = useRef(!demoMode && process.env.NEXT_PUBLIC_SUPABASE_URL ? createClient() : null);

  useEffect(() => {
    if (demoMode || !supabase.current) return;
    const db = supabase.current;
    let active = true;
    const unsubscribe = subscribeMessages((event, row) => {
      if (!active) return;
      if (event === "INSERT") setMessages((previous) => mergeMessage(previous, row));
      else setMessages((previous) => previous.filter((item) => item.id !== row.id));
    });
    async function connect() {
      const { data: { session }, error: authError } = await db.auth.getSession();
      if (!active) return;
      if (authError || !session) {
        setError("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để vào phòng.");
        return;
      }
      setCurrentUser(session.user.id);
      const result = await db.from("study_room_messages").select("id,user_id,display_name,body,created_at,is_admin")
        .order("created_at", { ascending: false }).limit(pageSize);
      if (!active) return;
      if (result.error) setError(result.error.message);
      else {
        setMessages((previous) => [...(result.data as Message[]).reverse(), ...previous]
          .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
          .sort((a, b) => a.created_at.localeCompare(b.created_at)));
        setHasOlder(result.data.length === pageSize);
      }
    }
    void connect();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [subscribeMessages]);

  useEffect(() => {
    const element = listRef.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 180) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((focusEndsAt.current ?? Date.now()) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        focusEndsAt.current = null;
        setTimerRunning(false);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [timerRunning]);

  useEffect(() => () => { void player.current?.stop(); }, []);

  const toggleMusic = useCallback(async () => {
    try {
      if (musicPlaying) {
        await player.current?.stop();
        player.current = null;
        setMusicPlaying(false);
      } else {
        const next = new LofiPlayer();
        await next.start();
        next.setVolume(volume / 100);
        player.current = next;
        setMusicPlaying(true);
      }
    } catch {
      setError("Trình duyệt chưa cho phép phát âm thanh. Hãy bấm Bật nhạc một lần nữa.");
    }
  }, [musicPlaying, volume]);

  async function selectVideo(mode: "youtube" | "harry") {
    if (mode === "youtube" && musicPlaying) {
      await player.current?.stop();
      player.current = null;
      setMusicPlaying(false);
    }
    setVideoMode(mode);
  }

  async function selectStream(id: string) {
    setStreamId(id);
    saveStream(id);
    await selectVideo("youtube");
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    const db = supabase.current;
    if (!db || !currentUser || !body || sending || body.length > 500) return;
    setSending(true);
    setError("");
    const result = await db.from("study_room_messages").insert({ body })
      .select("id,user_id,display_name,body,created_at,is_admin").single();
    setSending(false);
    if (result.error) {
      setError(result.error.message.includes("wait before") ? "Bạn gửi hơi nhanh. Hãy đợi 2 giây rồi thử lại." : result.error.message);
      return;
    }
    setDraft("");
    setMessages((previous) => mergeMessage(previous, result.data as Message));
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }

  async function loadOlder() {
    const db = supabase.current;
    if (!db || !messages[0] || loadingOlder) return;
    setLoadingOlder(true);
    const result = await db.from("study_room_messages").select("id,user_id,display_name,body,created_at,is_admin")
      .lt("created_at", messages[0].created_at).order("created_at", { ascending: false }).limit(pageSize);
    setLoadingOlder(false);
    if (result.error) { setError(result.error.message); return; }
    setMessages((previous) => [...(result.data as Message[]).reverse(), ...previous]);
    setHasOlder(result.data.length === pageSize);
  }

  async function deleteMessage(id: string) {
    const db = supabase.current;
    if (!db || !window.confirm("Xóa tin nhắn này?")) return;
    const result = await db.from("study_room_messages").delete().eq("id", id);
    if (result.error) setError(result.error.message);
    else setMessages((previous) => previous.filter((item) => item.id !== id));
  }

  return <main className="study-room-page">
    <div className="study-room-heading"><div><span className="study-eyebrow"><span className="study-live-dot" /> PHÒNG HỌC TRỰC TIẾP</span><h1>Cùng học, cùng tiến bộ <Sticker name="coffee" size={38} tilt={-8} /></h1></div><div className="study-room-stats"><div className="study-online"><UsersRound size={18} /><strong>{online ?? "…"}</strong><span>đang học cùng</span></div><div className="study-elapsed"><Clock3 size={18} /><strong>{String(Math.floor(studySeconds / 60)).padStart(2, "0")}:{String(studySeconds % 60).padStart(2, "0")}</strong><span>đã học hôm nay</span></div><button type="button" className="study-session-toggle" onClick={() => setSessionActive(!sessionActive)}>{sessionActive ? <Pause size={15} /> : <Play size={15} />}{sessionActive ? "Dừng học" : "Tiếp tục học"}</button></div></div>
    <section className="study-control-bar" aria-label="Chọn nhạc và cài đặt thời gian">
      <div className="study-control-top"><div className="study-video-tabs" role="group" aria-label="Chọn không gian học">
        <button type="button" className={videoMode === "youtube" ? "selected" : ""} onClick={() => void selectVideo("youtube")} aria-pressed={videoMode === "youtube"}>● YouTube live</button>
        <button type="button" className={videoMode === "harry" ? "selected" : ""} onClick={() => void selectVideo("harry")} aria-pressed={videoMode === "harry"}>Học cùng Harry</button>
      </div><div className="study-focus-compact"><label htmlFor="study-focus-duration">Hẹn giờ</label><select id="study-focus-duration" value={focusMinutes} onChange={(event) => { const minutes = Number(event.target.value); focusEndsAt.current = null; setFocusMinutes(minutes); setTimerRunning(false); setSecondsLeft(minutes * 60); }}><option value={25}>25 phút</option><option value={50}>50 phút</option><option value={90}>90 phút</option></select><strong aria-label={`Còn ${Math.floor(secondsLeft / 60)} phút ${secondsLeft % 60} giây`}>{String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</strong><button type="button" className="study-focus-start" onClick={() => { if (timerRunning) { focusEndsAt.current = null; setTimerRunning(false); return; } const next = secondsLeft === 0 ? focusMinutes * 60 : secondsLeft; if (secondsLeft === 0) setSecondsLeft(next); focusEndsAt.current = Date.now() + next * 1000; setTimerRunning(true); }}>{timerRunning ? "Tạm dừng" : "Bắt đầu"}</button><button type="button" className="study-focus-reset" onClick={() => { focusEndsAt.current = null; setTimerRunning(false); setSecondsLeft(focusMinutes * 60); }}>Đặt lại</button></div></div>
      {videoMode === "youtube" && <div className="study-stream-list" role="group" aria-label="Chọn livestream để cùng học">{liveStreams.map((stream) => <button key={stream.id} type="button" className={`study-stream-option ${stream.color} ${stream.id === selectedStream.id ? "selected" : ""}`} onClick={() => void selectStream(stream.id)} aria-pressed={stream.id === selectedStream.id} title={`${stream.channel} · ${stream.description}`}>
        <span className="study-stream-emoji" aria-hidden="true">{stream.emoji}</span><span className="study-stream-copy"><strong>{stream.title}</strong><small>{stream.channel}</small></span><span className="study-stream-badge"><i /> LIVE</span>
      </button>)}</div>}
      {videoMode === "harry" && <div className="study-music-controls"><Music2 size={18} /><span>Nhạc lofi tạo riêng</span><button type="button" className="study-play" onClick={() => void toggleMusic()} aria-label={musicPlaying ? "Tắt nhạc" : "Bật nhạc"}>{musicPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}{musicPlaying ? "Tạm dừng" : "Bật nhạc"}</button>{volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}<input type="range" aria-label="Âm lượng nhạc" min="0" max="100" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); player.current?.setVolume(value / 100); }} /></div>}
    </section>
    <div className="study-room-grid">
      <div className={`study-room-main ${videoMode === "youtube" ? "has-youtube" : ""}`}>
        <section className="study-visual-card">
          {videoMode === "youtube" ? <div className="study-youtube"><iframe key={selectedStream.id} title={`${selectedStream.title} — ${selectedStream.channel} livestream`} src={`https://www.youtube-nocookie.com/embed/${selectedStream.id}?rel=0`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div> : <StudyScene />}
          <div className="study-visual-footer"><div><span className="study-on-air"><i /> {videoMode === "youtube" ? "YOUTUBE LIVE" : "STUDY SESSION"}</span><strong>{videoMode === "youtube" ? selectedStream.title : "Một góc nhỏ để tập trung mỗi ngày"}</strong><small>{videoMode === "youtube" ? <>{selectedStream.channel} · <a href={`https://www.youtube.com/watch?v=${selectedStream.id}`} target="_blank" rel="noopener noreferrer">Mở livestream trên YouTube ↗</a></> : "Hoạt cảnh và nhạc lặp tạo riêng cho IeltsWithHarry"}</small></div><Sticker name="headphones" size={40} tilt={8} className="study-visual-sparkle" /></div>
        </section>
      </div>
      <section className="study-chat-card" aria-label="Phòng chat cùng học"><header className="study-chat-header"><div className="study-chat-icon"><MessageCircle size={22} /></div><div><strong>Phòng chat chung</strong><span>{demoMode ? "Bản xem trước" : status === "live" ? "Đang kết nối trực tiếp" : status === "connecting" ? "Đang kết nối…" : "Chưa có kết nối trực tiếp"}</span></div><span className={`study-chat-status ${status}`} /></header>
        <div className="study-chat-messages" ref={listRef} aria-live="polite">{hasOlder && <button className="study-older" type="button" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? "Đang tải…" : "Xem tin nhắn cũ"}</button>}{messages.length === 0 && <div className="study-chat-empty"><HarryMascot size={100} /><h2>Chào mừng vào phòng!</h2><p>Chia sẻ mục tiêu học hôm nay hoặc gửi lời chào tới mọi người nhé.</p></div>}{messages.map((item) => <article className={`study-message ${item.user_id === currentUser ? "mine" : ""} ${item.is_admin ? "is-admin" : ""}`} key={item.id}><span className="study-message-avatar">{item.is_admin ? <HarryMascot size={28} /> : item.display_name.slice(0, 1).toUpperCase()}</span><div><div className="study-message-meta">{item.is_admin && <span className="study-message-admin-label">ADMIN</span>}<strong>{item.user_id === currentUser ? "Bạn" : item.display_name}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>{(item.user_id === currentUser || canManage) && <button type="button" onClick={() => void deleteMessage(item.id)} aria-label="Xóa tin nhắn"><Trash2 size={13} /></button>}</div><p>{item.body}</p></div></article>)}</div>
        {error && <p className="study-chat-error" role="alert">{error}</p>}
        {demoMode ? <div className="study-chat-demo">Đăng ký tài khoản để tham gia trò chuyện trực tiếp.</div> : <form className="study-chat-compose" onSubmit={(event) => void sendMessage(event)}><label className="sr-only" htmlFor="study-message">Tin nhắn của bạn</label><input id="study-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Viết lời chào hoặc mục tiêu học tập…" maxLength={500} autoComplete="off" disabled={!currentUser || sending} /><button type="submit" aria-label="Gửi tin nhắn" disabled={!draft.trim() || !currentUser || sending}><Send size={18} /></button></form>}<p className="study-chat-note">Tôn trọng nhau và giữ cuộc trò chuyện phù hợp với việc học.</p>
      </section>
    </div>
  </main>;
}
