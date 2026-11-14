"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { SpeakingCoachingPanel } from "./speaking-coaching-panel";
import type { SpeakingItem, Take } from "./speaking-kit";

type Saved = { id: string; completed_at: string };

/**
 * Part 2 coaching from the practice room, through the same private pipeline as
 * the mock test: the learner's take is saved as a one-answer Speaking session
 * (marked source "practice"), its audio goes to the private bucket, and the
 * existing queue analyses it under the same 2-per-learner / 10-per-day limits.
 * Sessions are found again by question, so results outlive the attempt.
 */
export function PracticeCoaching({ examId, item, take }: { examId: string; item: SpeakingItem; take?: Take }) {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);
  const [sentTake, setSentTake] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const question = [item.text, ...(item.bullets ?? [])].join("\n").slice(0, 1000);

  const find = useCallback(async (): Promise<Saved | null> => {
    if (!db) return null;
    try {
      const query = db.from("speaking_mock_sessions").select("id,completed_at")
        .contains("answers", [{ source: "practice", question_id: item.id }])
        .order("completed_at", { ascending: false }).limit(1).maybeSingle()
        .then((result) => result.error ? null : (result.data as Saved | null));
      // A stalled session lookup must not hide the panel; the learner can still send a new take.
      return await Promise.race([query, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 6000))]);
    } catch { return null; }
  }, [db, item.id]);

  useEffect(() => {
    if (!db) return;
    let live = true;
    void fetch("/api/ielts/bank/speaking-coaching?available=1", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { available: false })
      .then((data: { available?: boolean }) => { if (live) setAvailable(Boolean(data.available)); })
      .catch(() => { if (live) setAvailable(false); });
    void find().then((value) => { if (live) setSaved(value); });
    return () => { live = false; };
  }, [db, find]);

  const usable = Boolean(take && take.seconds >= 5 && take.seconds <= 125);
  async function send() {
    if (!db || !take || !usable) return;
    setBusy(true); setError("");
    let sessionId = "";
    try {
      const userId = (await db.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Bạn cần đăng nhập để gửi bài phân tích.");
      const blob = await (await fetch(take.url)).blob();
      if (!blob.size) throw new Error("Bản ghi trống, hãy ghi âm lại.");
      sessionId = crypto.randomUUID();
      const seconds = Math.round(take.seconds);
      const inserted = await db.from("speaking_mock_sessions").insert({ id: sessionId, duration_seconds: seconds, speaking_seconds: seconds,
        answers: [{ part: 2, question, seconds, transcript: take.transcript.slice(0, 4000), source: "practice", exam_id: examId, question_id: item.id }] });
      if (inserted.error) throw inserted.error;
      const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      const path = `${userId}/${sessionId}/0.${extension}`;
      const uploaded = await db.storage.from("speaking-recordings").upload(path, blob, { contentType: `audio/${extension}`, upsert: true });
      if (uploaded.error) throw uploaded.error;
      const recorded = await db.from("speaking_mock_recordings").insert({ session_id: sessionId, answer_index: 0, storage_path: path });
      if (recorded.error) throw recorded.error;
      setSentTake(take.url);
      setSaved({ id: sessionId, completed_at: new Date().toISOString() });
      // Queue it straight away; if the daily limit is reached the panel keeps a "send" button for later.
      const queued = await fetch("/api/ielts/bank/speaking-coaching", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      if (!queued.ok) setError((await queued.json().catch(() => ({}))).error || "Chưa thể đưa bài vào hàng đợi.");
    } catch (cause) {
      if (sessionId) { await db.from("speaking_mock_sessions").delete().eq("id", sessionId); setSaved((current) => current?.id === sessionId ? null : current); }
      setError(cause instanceof Error ? cause.message : "Chưa gửi được bản ghi.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!db || !saved) return;
    setBusy(true); setError("");
    try {
      const userId = (await db.auth.getUser()).data.user?.id;
      const listed = userId ? await db.storage.from("speaking-recordings").list(`${userId}/${saved.id}`, { limit: 10 }) : null;
      const paths = (listed?.data ?? []).map((file) => `${userId}/${saved.id}/${file.name}`);
      if (paths.length) { const removed = await db.storage.from("speaking-recordings").remove(paths); if (removed.error) throw removed.error; }
      const deleted = await db.from("speaking_mock_sessions").delete().eq("id", saved.id);
      if (deleted.error) throw deleted.error;
      setSentTake("");
      setSaved(await find());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa xoá được bản ghi."); } finally { setBusy(false); }
  }

  if (!db || !available || saved === undefined) return null;
  const newTake = usable && take && take.url !== sentTake;
  return <div className="spc">
    {saved ? <>
      <SpeakingCoachingPanel key={saved.id} sessionId={saved.id} hasPart2Recording />
      <div className="spc-actions">
        {newTake && <button type="button" className="bx-ghost" disabled={busy} onClick={() => void send()}>{busy ? <Loader2 size={15} className="bw-spin" /> : <Sparkles size={15} />} Phân tích bản ghi mới</button>}
        <button type="button" className="bx-ghost spc-delete" disabled={busy} onClick={() => void remove()}><Trash2 size={14} /> Xoá bản ghi đã gửi</button>
      </div>
    </> : <section className="sc-panel">
      <h3>Phân tích Speaking Part 2</h3>
      <p>Gửi bản ghi cue card này để AI nhận dạng giọng nói và góp ý về mạch ý, từ vựng và ngữ pháp (chưa chấm phát âm hay band tổng). Bản ghi được lưu riêng tư; tối đa 2 lượt/người và 10 lượt toàn hệ thống trong 24 giờ, dùng chung với Thi thử.</p>
      {usable ? <button type="button" className="bx-ghost" disabled={busy} onClick={() => void send()}>{busy ? <Loader2 size={15} className="bw-spin" /> : <Sparkles size={15} />} {busy ? "Đang lưu và gửi…" : "Lưu bản ghi & gửi phân tích"}</button>
        : <p className="spc-hint">{take ? "Bản ghi cần dài từ 5 giây đến hơn 2 phút một chút để phân tích được." : "Ghi âm phần nói Part 2 (ít nhất 5 giây) rồi gửi phân tích ở đây."}</p>}
    </section>}
    {error && <p className="bx-error" role="alert">{error}</p>}
  </div>;
}
