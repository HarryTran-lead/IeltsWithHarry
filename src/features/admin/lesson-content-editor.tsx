"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { VocabularyEditor } from "./vocabulary-editor";
import { SkillMaterialEditor } from "./skill-material-editor";
import type { SkillName } from "@/lib/skill-material";

type Lesson = { id: string; slug: string; title: string; published: boolean; skill: SkillName };
type Block = { id: string; kind: string; body: string; sort_order: number };
type Question = { id: string; slug: string; prompt: string; options: string[]; sort_order: number; correct_index: number; explanation: string; evidence: string };

export function LessonContentEditor({ lessons, onPublish }: { lessons: Lesson[]; onPublish: (lesson: Lesson) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [lessonId, setLessonId] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [kind, setKind] = useState("paragraph");
  const [body, setBody] = useState("");
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = lessons.find((lesson) => lesson.id === lessonId);

  const load = useCallback(async () => {
    if (!lessonId) { setBlocks([]); setQuestions([]); return; }
    const [blockResult, questionResult] = await Promise.all([
      supabase.from("lesson_blocks").select("id,kind,body,sort_order").eq("lesson_id", lessonId).order("sort_order"),
      supabase.from("exercise_questions").select("id,slug,prompt,options,sort_order").eq("lesson_id", lessonId).order("sort_order"),
    ]);
    if (blockResult.error || questionResult.error) { setError(blockResult.error?.message ?? questionResult.error!.message); return; }
    setBlocks(blockResult.data as Block[]);
    const rows = questionResult.data ?? [];
    const keyResult = rows.length ? await supabase.from("exercise_answer_keys").select("question_id,correct_index,explanation,evidence").in("question_id", rows.map((row) => row.id)) : { data: [], error: null };
    if (keyResult.error) { setError(keyResult.error.message); return; }
    setQuestions(rows.map((row) => {
      const key = keyResult.data?.find((item) => item.question_id === row.id);
      return { ...row, options: Array.isArray(row.options) ? row.options as string[] : [], correct_index: key?.correct_index ?? 0, explanation: key?.explanation ?? "", evidence: key?.evidence ?? "" };
    }));
  }, [lessonId, supabase]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function addBlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const sort_order = Math.max(-1, ...blocks.map((item) => item.sort_order)) + 1;
    const result = await supabase.from("lesson_blocks").insert({ lesson_id: lessonId, kind, body: body.trim(), sort_order });
    setBusy(false);
    if (result.error) setError(result.error.message); else { setBody(""); await load(); }
  }
  async function saveQuestion(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const list = options.split("\n").map((value) => value.trim()).filter(Boolean);
    if (list.length < 2 || list.length > 6 || correct < 0 || correct >= list.length) { setBusy(false); setError("Add 2–6 options and choose a valid correct answer."); return; }
    const result = await supabase.rpc("admin_save_question_with_evidence", {
      p_question_id: questionId, p_lesson_id: lessonId, p_slug: slug.trim(),
      p_prompt: prompt.trim(), p_options: list, p_correct_index: correct,
      p_explanation: explanation.trim(),
      p_evidence: selected?.skill === "Reading" ? evidence.trim() : "",
    });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else { resetQuestion(); await load(); }
  }
  function resetQuestion() { setQuestionId(null); setSlug(""); setPrompt(""); setOptions(""); setCorrect(0); setExplanation(""); setEvidence(""); }
  async function remove(table: "lesson_blocks" | "exercise_questions", id: string) {
    if (!window.confirm("Delete this content?")) return;
    const result = await supabase.from(table).delete().eq("id", id);
    if (result.error) setError(result.error.message); else await load();
  }

  return <section className="card admin-list"><h2>Biên soạn bài học</h2>
    <label className="admin-select">Select lesson<select value={lessonId} onChange={(e) => { setLessonId(e.target.value); resetQuestion(); }}><option value="">Choose lesson</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
    {selected && <><div className="admin-lesson-actions"><span>{selected.published ? "Đã xuất bản" : "Bản nháp"}</span><Link href={`/app/lesson/${selected.slug}`} className="button subtle">Xem trước trang học viên ↗</Link><button type="button" className="button primary" onClick={() => onPublish(selected)}>{selected.published ? "Gỡ xuất bản" : "Xuất bản bài học"}</button></div>
      <SkillMaterialEditor key={selected.id} lessonId={selected.id} skill={selected.skill} />
      <details className="admin-extra"><summary>Khối nội dung bổ sung</summary><h3>Content blocks</h3>
      {blocks.map((block) => <div className="admin-row" key={block.id}><div><strong>{block.kind}</strong><small>{block.body.slice(0, 130)}</small></div><div><button className="button subtle" onClick={async () => { const updated = window.prompt("Edit content", block.body); if (updated === null) return; const result = await supabase.from("lesson_blocks").update({ body: updated }).eq("id", block.id); if (result.error) setError(result.error.message); else await load(); }}>Edit</button><button className="button subtle" onClick={() => void remove("lesson_blocks", block.id)}>Delete</button></div></div>)}
      <form className="admin-content-form" onSubmit={addBlock}><label>Block type<select value={kind} onChange={(e) => setKind(e.target.value)}>{["paragraph","heading","tip","prompt","audio"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Content<textarea required value={body} onChange={(e) => setBody(e.target.value)} /></label><button className="button primary" disabled={busy}>Add block</button></form></details>
      {!["Writing", "Speaking"].includes(selected.skill) && <><h3>Câu hỏi và đáp án</h3><p>Đáp án được lưu riêng và chỉ mở sau khi học viên nộp bài.</p>
      {questions.map((question) => <div className="admin-row" key={question.id}><div><strong>{question.prompt}</strong><small>{question.options.length} options · correct: {question.correct_index + 1}</small></div><div><button className="button subtle" onClick={() => { setQuestionId(question.id); setSlug(question.slug); setPrompt(question.prompt); setOptions(question.options.join("\n")); setCorrect(question.correct_index); setExplanation(question.explanation); setEvidence(question.evidence); }}>Edit</button><button className="button subtle" onClick={() => void remove("exercise_questions", question.id)}>Delete</button></div></div>)}
      <form className="admin-content-form" onSubmit={saveQuestion}><h4>{questionId ? "Sửa câu hỏi" : "Thêm câu hỏi"}</h4><label>Question slug<input required pattern="[a-z0-9-]+" value={slug} onChange={(e) => setSlug(e.target.value)} /></label><label>Câu hỏi<input required minLength={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label><label>Các lựa chọn · mỗi dòng một đáp án<textarea required value={options} onChange={(e) => setOptions(e.target.value)} /></label><label>Đáp án đúng (1–6)<input type="number" min={1} max={6} value={correct + 1} onChange={(e) => setCorrect(Number(e.target.value) - 1)} /></label><label>Giải thích đáp án<textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} /></label>{selected.skill === "Reading" && <label>Bằng chứng trong bài đọc<textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>}<div><button className="button primary" disabled={busy}>{questionId ? "Lưu câu hỏi" : "Thêm câu hỏi"}</button>{questionId && <button type="button" className="button subtle" onClick={resetQuestion}>Hủy sửa</button>}</div></form></>}
      <VocabularyEditor lessonId={lessonId} />
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
