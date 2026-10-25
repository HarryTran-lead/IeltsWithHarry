"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";

export type StudyRoomMessage = { id: string; user_id: string; display_name: string; body: string; created_at: string };
export type RoomStatus = "connecting" | "live" | "offline";
type MessageEvent = "INSERT" | "DELETE";
type MessageListener = (event: MessageEvent, row: StudyRoomMessage) => void;
type PresenceMeta = { active?: boolean };
type StudyPresence = {
  online: number | null;
  status: RoomStatus;
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  studySeconds: number;
  subscribeMessages: (listener: MessageListener) => () => void;
};

const StudyPresenceContext = createContext<StudyPresence>({
  online: null,
  status: "offline",
  sessionActive: false,
  setSessionActive: () => undefined,
  studySeconds: 0,
  subscribeMessages: () => () => undefined,
});

function activeLearners(channel: ReturnType<ReturnType<typeof createClient>["channel"]>) {
  return Object.values(channel.presenceState()).filter((metas) =>
    (metas as PresenceMeta[]).some((meta) => meta.active === true)).length;
}

export function useStudyPresence() {
  return useContext(StudyPresenceContext);
}

export function StudyPresenceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [online, setOnline] = useState<number | null>(demoMode ? 0 : null);
  const [status, setStatus] = useState<RoomStatus>(demoMode ? "offline" : "connecting");
  const [sessionActive, setSessionActive] = useState(false);
  const [studySeconds, setStudySeconds] = useState(0);
  const [sessionUser, setSessionUser] = useState(demoMode ? "demo" : "");
  const inRoom = pathname === "/app/study-together";
  const sessionActiveRef = useRef(sessionActive);
  const syncTrackingRef = useRef<(() => Promise<void>) | null>(null);
  const listeners = useRef(new Set<MessageListener>());

  const subscribeMessages = useCallback((listener: MessageListener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);

  useEffect(() => {
    if (!inRoom) return;
    const frame = window.requestAnimationFrame(() => setSessionActive(true));
    return () => window.cancelAnimationFrame(frame);
  }, [inRoom]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
    void syncTrackingRef.current?.();
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionUser) return;
    const key = `study-room-seconds:${sessionUser}:${new Date().toLocaleDateString("sv-SE")}`;
    const saved = Number(window.localStorage.getItem(key));
    const load = window.setTimeout(() => setStudySeconds(Number.isFinite(saved) && saved > 0 ? saved : 0), 0);
    return () => window.clearTimeout(load);
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionActive || !sessionUser) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const key = `study-room-seconds:${sessionUser}:${new Date().toLocaleDateString("sv-SE")}`;
      const previous = Number(window.localStorage.getItem(key));
      const next = (Number.isFinite(previous) && previous > 0 ? previous : 0) + 1;
      window.localStorage.setItem(key, String(next));
      setStudySeconds(next);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionActive, sessionUser]);

  useEffect(() => {
    if (demoMode || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const db = createClient();
    let active = true;
    let subscribed = false;
    let tracked = false;
    let channel: ReturnType<typeof db.channel> | null = null;
    const { data: authEvents } = db.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) void db.realtime.setAuth(session.access_token);
      if (event === "SIGNED_OUT") { setOnline(null); setStatus("offline"); }
    });

    async function syncTracking() {
      if (!active || !subscribed || !channel) return;
      if (sessionActiveRef.current && !tracked) {
        const result = await channel.track({ active: true, joined_at: new Date().toISOString() });
        tracked = result === "ok";
        if (active && !sessionActiveRef.current && tracked) void syncTracking();
      } else if (!sessionActiveRef.current && tracked) {
        await channel.track({ active: false });
        tracked = false;
        if (active && sessionActiveRef.current) void syncTracking();
      }
    }
    syncTrackingRef.current = syncTracking;

    async function connect() {
      const { data: { session } } = await db.auth.getSession();
      if (!active) return;
      if (!session) { setStatus("offline"); return; }
      setSessionUser(session.user.id);
      await db.realtime.setAuth(session.access_token);
      if (!active) return;
      channel = db.channel("study-together", { config: { private: true, presence: { key: session.user.id } } });
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "study_room_messages" }, (payload) => {
          if (active) for (const listener of listeners.current) listener("INSERT", payload.new as StudyRoomMessage);
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "study_room_messages" }, (payload) => {
          if (active) for (const listener of listeners.current) listener("DELETE", payload.old as StudyRoomMessage);
        })
        .on("presence", { event: "sync" }, () => {
          if (active && channel) setOnline(activeLearners(channel));
        })
        .subscribe((nextStatus) => {
          if (!active) return;
          if (nextStatus === "SUBSCRIBED") {
            subscribed = true;
            setStatus("live");
            setOnline(channel ? activeLearners(channel) : 0);
            void syncTracking();
          } else if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT" || nextStatus === "CLOSED") {
            subscribed = false;
            tracked = false;
            setStatus("offline");
            setOnline(null);
          }
        });
    }

    void connect();
    return () => {
      active = false;
      syncTrackingRef.current = null;
      authEvents.subscription.unsubscribe();
      if (channel) void db.removeChannel(channel);
    };
  }, []);

  return <StudyPresenceContext.Provider value={{ online, status, sessionActive, setSessionActive, studySeconds, subscribeMessages }}>{children}</StudyPresenceContext.Provider>;
}
