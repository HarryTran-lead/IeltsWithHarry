"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Entry = {
  id: string; word: string; phonetic: string; meaning_vi: string;
  definition: string; example: string; sort_order: number;
};

const blank = { word: "", phonetic: "", meaning_vi: "", definition: "", example: "" };

export function VocabularyEditor({ lessonId }: { lessonId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await supabase.from("vocabulary_entries").select("id,word,phonetic,meaning_vi,definition,example,sort_order")
      .eq("lesson_id", lessonId).order("sort_order");
    if (result.error) setError(result.error.message);
    else setEntries(result.data as Entry[]);
  }, [lessonId, supabase]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function reset() { setEditingId(null); setForm(blank); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const data = {
      word: form.word.trim(), phonetic: form.phonetic.trim(),
      meaning_vi: form.meaning_vi.trim(), definition: form.definition.trim(),
      example: form.example.trim(),
    };
    const result = editingId
      ? await supabase.from("vocabulary_entries").update(data).eq("id", editingId)
      : await supabase.from("vocabulary_entries").insert({
          ...data, lesson_id: lessonId,
          sort_order: Math.max(-1, ...entries.map((entry) => entry.sort_order)) + 1,
        });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else { reset(); await load(); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this vocabulary entry?")) return;
    const result = await supabase.from("vocabulary_entries").delete().eq("id", id);
    if (result.error) setError(result.error.message);
    else await load();
  }
  return <div className="admin-vocabulary">
    <h3>Vocabulary</h3>
    {entries.map((entry) => <div className="admin-row" key={entry.id}>
      <div><strong>{entry.word} · {entry.meaning_vi}</strong><small>{entry.example}</small></div>
      <div><button className="button subtle" onClick={() => { setEditingId(entry.id); setForm({ word: entry.word, phonetic: entry.phonetic, meaning_vi: entry.meaning_vi, definition: entry.definition, example: entry.example }); }}>Edit</button>
        <button className="button subtle" onClick={() => void remove(entry.id)}>Delete</button></div>
    </div>)}
    <form className="admin-content-form" onSubmit={save}>
      <h4>{editingId ? "Edit vocabulary" : "Add vocabulary"}</h4>
      <label>Word or phrase<input required maxLength={100} value={form.word} onChange={(event) => setForm({ ...form, word: event.target.value })} /></label>
      <label>Pronunciation<input maxLength={100} value={form.phonetic} onChange={(event) => setForm({ ...form, phonetic: event.target.value })} /></label>
      <label>Vietnamese meaning<input required maxLength={200} value={form.meaning_vi} onChange={(event) => setForm({ ...form, meaning_vi: event.target.value })} /></label>
      <label>Definition<textarea value={form.definition} onChange={(event) => setForm({ ...form, definition: event.target.value })} /></label>
      <label>Example<textarea value={form.example} onChange={(event) => setForm({ ...form, example: event.target.value })} /></label>
      <div><button className="button primary" disabled={busy}>{busy ? "Saving…" : editingId ? "Save word" : "Add word"}</button>
        {editingId && <button type="button" className="button subtle" onClick={reset}>Cancel edit</button>}</div>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
