"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { activeLearnerCount, studyLearners, type StudyLearner } from "@/lib/learner-presence";

export type StudyRoomMessage = { id: string; user_id: string; display_name: string; body: string; created_at: string; is_admin: boolean };
export type RoomStatus = "connecting" | "live" | "offline";
type MessageEvent = "INSERT" | "DELETE";
type MessageListener = (event: MessageEvent, row: StudyRoomMessage) => void;
type StudyPresence = {
  online: number | null;
  status: RoomStatus;
  sessionActive: boolean;
  setSessionActive: (active: boolean) => void;
  studySeconds: number;
  subscribeMessages: (listener: MessageListener) => () => void;
  /** Everyone in the room right now, the current learner first. */
  learners: StudyLearner[];
  goal: string;
  setGoal: (goal: string) => void;
  hideName: boolean;
  setHideName: (hide: boolean) => void;
};

const STREAK_SECONDS = 300;
const ONLINE_IDLE_MS = 5 * 60 * 1000;

const StudyPresenceContext = createContext<StudyPresence>({
  online: null,
  status: "offline",
  sessionActive: false,
  setSessionActive: () => undefined,
  studySeconds: 0,
  subscribeMessages: () => () => undefined,
  learners: [],
  goal: "",
  setGoal: () => undefined,
  hideName: false,
  setHideName: () => undefined,
});

const GOAL_KEY = "ieltswithharry-study-goal";
const HIDE_NAME_KEY = "ieltswithharry-study-hide-name";
const today = () => new Date().toLocaleDateString("sv-SE");

function activeLearners(channel: ReturnType<ReturnType<typeof createClient>["channel"]>) {
  return activeLearnerCount(channel.presenceState());
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
  const [learners, setLearners] = useState<StudyLearner[]>([]);
  const [goal, setGoalState] = useState("");
  const [hideName, setHideNameState] = useState(false);
  const goalRef = useRef("");
  const hideNameRef = useRef(false);
  const inRoom = pathname === "/app/study-together";
  const sessionActiveRef = useRef(sessionActive);
  const lastInteractionRef = useRef(0);
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

  // The goal is kept per day, so tomorrow starts with a fresh one.
  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(GOAL_KEY) ?? "null") as { day?: string; goal?: string } | null;
        const nextGoal = saved?.day === today() && typeof saved.goal === "string" ? saved.goal.slice(0, 80) : "";
        goalRef.current = nextGoal;
        setGoalState(nextGoal);
        const hidden = window.localStorage.getItem(HIDE_NAME_KEY) === "1";
        hideNameRef.current = hidden;
        setHideNameState(hidden);
      } catch { /* Start without a saved goal. */ }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  const setGoal = useCallback((value: string) => {
    const nextGoal = value.replace(/\s+/g, " ").trim().slice(0, 80);
    goalRef.current = nextGoal;
    setGoalState(nextGoal);
    try { window.localStorage.setItem(GOAL_KEY, JSON.stringify({ day: today(), goal: nextGoal })); } catch { /* Kept for this visit. */ }
    void syncTrackingRef.current?.();
  }, []);

  const setHideName = useCallback((hide: boolean) => {
    hideNameRef.current = hide;
    setHideNameState(hide);
    try { window.localStorage.setItem(HIDE_NAME_KEY, hide ? "1" : "0"); } catch { /* Kept for this visit. */ }
    void syncTrackingRef.current?.();
  }, []);

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
      // Five minutes in the room counts as a learning day for the streak (the server records it once per day).
      if (next === STREAK_SECONDS && !demoMode) void createClient().rpc("record_study_room_activity");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sessionActive, sessionUser]);

  useEffect(() => {
    if (demoMode || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    lastInteractionRef.current = Date.now();
    const db = createClient();
    let active = true;
    let subscribed = false;
    let tracked: string | null = null;
    let displayName = "Learner";
    let selfId = "";
    const since = new Date().toISOString();
    let syncing = false;
    let channel: ReturnType<typeof db.channel> | null = null;
    const { data: authEvents } = db.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) void db.realtime.setAuth(session.access_token);
      if (event === "SIGNED_OUT") { setOnline(null); setStatus("offline"); }
    });

    async function syncTracking() {
      if (!active || !subscribed || !channel || syncing) return;
      syncing = true;
      try {
        while (active && subscribed && channel) {
          const online = document.visibilityState === "visible" && Date.now() - lastInteractionRef.current < ONLINE_IDLE_MS;
          const next = {
            online,
            active: online && sessionActiveRef.current,
            name: hideNameRef.current ? "Người học ẩn danh" : displayName,
            goal: goalRef.current,
            since,
          };
          const key = JSON.stringify(next);
          if (tracked === key) break;
          const result = await channel.track({ ...next, joined_at: new Date().toISOString() });
          if (result !== "ok") break;
          tracked = key;
        }
      } catch {
        tracked = null;
      } finally {
        syncing = false;
      }
    }
    syncTrackingRef.current = syncTracking;
    const markInteraction = () => { lastInteractionRef.current = Date.now(); void syncTracking(); };
    const onVisibility = () => { if (document.visibilityState === "visible") lastInteractionRef.current = Date.now(); void syncTracking(); };
    const idleTimer = window.setInterval(() => void syncTracking(), 30000);
    window.addEventListener("pointerdown", markInteraction);
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("wheel", markInteraction);
    window.addEventListener("focus", markInteraction);
    document.addEventListener("visibilitychange", onVisibility);

    async function connect() {
      const { data: { session } } = await db.auth.getSession();
      if (!active) return;
      if (!session) { setStatus("offline"); return; }
      setSessionUser(session.user.id);
      selfId = session.user.id;
      const metaName = session.user.user_metadata?.display_name;
      if (typeof metaName === "string" && metaName.trim()) displayName = metaName.trim().slice(0, 40);
      const profile = await db.from("profiles").select("display_name").eq("id", session.user.id).maybeSingle();
      const profileName = (profile.data as { display_name?: unknown } | null)?.display_name;
      if (typeof profileName === "string" && profileName.trim()) displayName = profileName.trim().slice(0, 40);
      if (!active) return;
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
          if (!active || !channel) return;
          setOnline(activeLearners(channel));
          setLearners(studyLearners(channel.presenceState(), selfId));
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
            tracked = null;
            setStatus("offline");
            setOnline(null);
            setLearners([]);
          }
        });
    }

    void connect();
    return () => {
      active = false;
      syncTrackingRef.current = null;
      window.clearInterval(idleTimer);
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("wheel", markInteraction);
      window.removeEventListener("focus", markInteraction);
      document.removeEventListener("visibilitychange", onVisibility);
      authEvents.subscription.unsubscribe();
      if (channel) void db.removeChannel(channel);
    };
  }, []);

  return <StudyPresenceContext.Provider value={{ online, status, sessionActive, setSessionActive, studySeconds, subscribeMessages, learners, goal, setGoal, hideName, setHideName }}>{children}</StudyPresenceContext.Provider>;
}
