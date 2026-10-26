"use client";

import { useMemo, useState } from "react";
import { AudioLines } from "lucide-react";
import { defaultStyle, defaultVoices, parseTranscript, speakersOf, ttsVoices } from "@/lib/listening-tts";

/** Lets an admin voice the saved transcript with Gemini TTS, choosing a voice per speaker. */
export function ListeningAudioGenerator({ lessonId, transcript, dirty, onGenerated }: {
  lessonId: string;
  transcript: string;
  dirty: boolean;
  onGenerated: (audioUrl: string) => void;
}) {
  const speakers = useMemo(() => speakersOf(parseTranscript(transcript)), [transcript]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const voices = { ...defaultVoices(speakers), ...chosen };
  const [style, setStyle] = useState(defaultStyle);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/listening-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, voices: Object.fromEntries(speakers.map((speaker) => [speaker, voices[speaker]])), style }),
      });
      const data = await response.json().catch(() => ({})) as { audioUrl?: string; seconds?: number; error?: string };
      if (!response.ok || !data.audioUrl) throw new Error(data.error ?? "Không tạo được âm thanh.");
      onGenerated(data.audioUrl);
      setMessage(`Đã tạo và lưu âm thanh ${data.seconds ?? ""} giây vào bài học.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tạo được âm thanh.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-tts">
    <div className="admin-tts-head"><AudioLines size={18} /><div><h4>Tạo âm thanh bằng Gemini TTS</h4><p>Dòng có dạng <code>Tên: lời thoại</code> được đọc bằng giọng riêng cho từng người. Gemini dùng tối đa hai giọng mỗi đoạn; transcript nhiều người hơn được chia đoạn rồi ghép lại.</p></div></div>
    {speakers.length ? <div className="admin-tts-voices">{speakers.map((speaker) => <label key={speaker}>{speaker}<select value={voices[speaker]} onChange={(event) => setChosen((current) => ({ ...current, [speaker]: event.target.value }))}>{ttsVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label>)}</div> : <p className="admin-muted">Nhập transcript để chọn giọng đọc.</p>}
    <label>Cách đọc (tiếng Anh)<input value={style} maxLength={200} onChange={(event) => setStyle(event.target.value)} /></label>
    {dirty && <p className="admin-muted">Hãy bấm “Lưu dữ liệu bài học” trước: âm thanh được tạo từ transcript đã lưu.</p>}
    <div className="admin-tts-actions"><button type="button" className="button primary" disabled={busy || dirty || !speakers.length} onClick={() => void generate()}>{busy ? "Đang tạo âm thanh… (10–40 giây)" : "Tạo âm thanh"}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}
  </div>;
}
