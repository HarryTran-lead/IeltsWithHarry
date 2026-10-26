"use client";
/* eslint-disable @next/next/no-img-element -- Admin previews can use external hosts chosen by the editor. */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { emptySkillMaterial, skillMaterialSchema, type SkillMaterial, type SkillName } from "@/lib/skill-material";
import { ListeningAudioGenerator } from "./listening-audio-generator";

export function SkillMaterialEditor({ lessonId, skill }: { lessonId: string; skill: SkillName }) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<SkillMaterial>(() => emptySkillMaterial(skill));
  // Last version stored in the database, so the audio generator only reads saved text.
  const [saved, setSaved] = useState<SkillMaterial | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.from("lesson_materials").select("content").eq("lesson_id", lessonId).maybeSingle().then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) { setError(loadError.message); setLoadFailed(true); setLoading(false); return; }
      const parsed = skillMaterialSchema.safeParse(data?.content);
      setDraft(parsed.success && parsed.data.skill === skill ? parsed.data : emptySkillMaterial(skill));
      setSaved(parsed.success && parsed.data.skill === skill ? parsed.data : null);
      setError(""); setMessage("");
      setLoading(false);
    });
    return () => { active = false; };
  }, [lessonId, skill, supabase]);

  function patch(value: Partial<SkillMaterial>) { setDraft((current) => ({ ...current, ...value }) as SkillMaterial); setMessage(""); }
  function patchFigure(value: Partial<SkillMaterial["figure"]>) { setDraft((current) => ({ ...current, figure: { ...current.figure, ...value } } as SkillMaterial)); setMessage(""); }

  async function upload(file: File, target: "figure" | "audio") {
    setError(""); setMessage("");
    if (file.size > 10 * 1024 * 1024) { setError("Tệp tối đa 10 MB."); return; }
    if (target === "figure" ? !["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type) : !["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"].includes(file.type)) {
      setError("Định dạng tệp chưa được hỗ trợ."); return;
    }
    setBusy(true);
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]/g, "-").slice(-80);
    const path = `${lessonId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("lesson-media").upload(path, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (uploadError) { setError(uploadError.message); return; }
    const { data } = supabase.storage.from("lesson-media").getPublicUrl(path);
    if (target === "figure") patchFigure({ url: data.publicUrl });
    else patch({ audioUrl: data.publicUrl } as Partial<SkillMaterial>);
    setMessage("Tệp đã tải lên. Bấm Lưu dữ liệu bài học để gắn vào bài.");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const parsed = skillMaterialSchema.safeParse(draft);
    if (!parsed.success) { const issue = parsed.error.issues[0]; setError(`${issue.path.join(".")}: ${issue.message}`); return; }
    if (draft.figure.url && !draft.figure.alt.trim()) { setError("Hình minh họa cần mô tả alt."); return; }
    setBusy(true);
    const result = await supabase.from("lesson_materials").upsert({ lesson_id: lessonId, content: parsed.data, updated_at: new Date().toISOString() });
    setBusy(false);
    if (result.error) setError(result.error.message); else { setSaved(parsed.data); setMessage("Đã lưu dữ liệu bài học."); }
  }

  if (loading) return <div className="admin-material-form" role="status">Đang tải dữ liệu bài học…</div>;
  if (loadFailed) return <p className="form-error" role="alert">Không tải được dữ liệu bài học: {error}</p>;

  return <form className="admin-material-form" onSubmit={save}>
    <div className="admin-section-head"><div><span className="eyebrow">{skill.toUpperCase()} INPUT</span><h3>Dữ liệu riêng cho kỹ năng</h3><p>Nhập nội dung ở đây, sau đó thêm câu hỏi và đáp án bên dưới nếu bài có trắc nghiệm.</p></div></div>
    {draft.skill === "Vocabulary" && <label>Giới thiệu chủ đề<textarea value={draft.introduction} onChange={(e) => patch({ introduction: e.target.value })} /></label>}
    {draft.skill === "Grammar" && <><label>Quy tắc ngữ pháp<textarea required value={draft.rule} onChange={(e) => patch({ rule: e.target.value })} /></label><label>Câu ví dụ<textarea required value={draft.example} onChange={(e) => patch({ example: e.target.value })} /></label></>}
    {draft.skill === "Reading" && <label>Bài đọc / passage<textarea required rows={12} value={draft.passage} onChange={(e) => patch({ passage: e.target.value })} /></label>}
    {draft.skill === "Listening" && <><label>Transcript / kịch bản<textarea required rows={8} value={draft.transcript} onChange={(e) => patch({ transcript: e.target.value })} /></label><label>URL âm thanh<input type="url" value={draft.audioUrl} onChange={(e) => patch({ audioUrl: e.target.value } as Partial<SkillMaterial>)} /></label><label className="admin-upload">Tải âm thanh lên<input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, "audio"); e.target.value = ""; }} /></label>{draft.audioUrl && <audio controls src={draft.audioUrl} />}<ListeningAudioGenerator lessonId={lessonId} transcript={draft.transcript} dirty={JSON.stringify(saved) !== JSON.stringify(draft)} onGenerated={(audioUrl) => { const next = { ...draft, audioUrl }; setDraft(next); setSaved(next); }} /></>}
    {draft.skill === "Writing" && <><label>Đề bài<textarea required value={draft.prompt} onChange={(e) => patch({ prompt: e.target.value } as Partial<SkillMaterial>)} /></label><label>Số từ tối thiểu<input type="number" min={1} max={5000} value={draft.minWords} onChange={(e) => patch({ minWords: Number(e.target.value) } as Partial<SkillMaterial>)} /></label><label>Bài mẫu tham khảo<textarea required rows={9} value={draft.modelAnswer} onChange={(e) => patch({ modelAnswer: e.target.value } as Partial<SkillMaterial>)} /></label><label>Checklist · mỗi dòng một ý<textarea value={draft.checklist.join("\n")} onChange={(e) => patch({ checklist: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean) } as Partial<SkillMaterial>)} /></label></>}
    {draft.skill === "Speaking" && <><label>Câu hỏi / cue card<textarea required value={draft.prompt} onChange={(e) => patch({ prompt: e.target.value } as Partial<SkillMaterial>)} /></label><label>Thời gian chuẩn bị (giây)<input type="number" min={0} max={120} value={draft.preparationSeconds} onChange={(e) => patch({ preparationSeconds: Number(e.target.value) } as Partial<SkillMaterial>)} /></label><label>Câu trả lời mẫu<textarea required rows={9} value={draft.modelAnswer} onChange={(e) => patch({ modelAnswer: e.target.value } as Partial<SkillMaterial>)} /></label><label>Checklist · mỗi dòng một ý<textarea value={draft.checklist.join("\n")} onChange={(e) => patch({ checklist: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean) } as Partial<SkillMaterial>)} /></label></>}
    <div className="admin-figure-input"><h4>Hình minh họa</h4><div className="admin-form-grid"><label>URL hình<input type="url" value={draft.figure.url} onChange={(e) => patchFigure({ url: e.target.value })} /></label><label>Mô tả hình (alt)<input value={draft.figure.alt} onChange={(e) => patchFigure({ alt: e.target.value })} /></label></div><label className="admin-upload">Tải hình lên<input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file, "figure"); e.target.value = ""; }} /></label>{draft.figure.url && <img src={draft.figure.url} alt={draft.figure.alt || "Hình xem trước"} className="admin-figure-preview" />}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}
    <button type="submit" className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu dữ liệu bài học"}</button>
  </form>;
}
