"use client";
import { useEffect, useMemo, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { TopicArt } from "@/components/illustrations/topic-art";
import type { NotebookEntry } from "@/features/notebook/notebook-store";
import type { ReviewGrade, WordReview } from "@/lib/news/review";

type Word = Extract<NotebookEntry, { kind: "word" }>;
type Deck = { id: string; name: string };
type Card = { deck_id: string; notebook_entry_id: string };
const key = "english-skill-lab-vocabulary-decks-v1";

export function VocabularyDecks({ saved, due, reviewById, gradeWord }: { saved: Word[]; due: Word[]; reviewById: Map<string, WordReview>; gradeWord: (entry: Word, grade: ReviewGrade) => Promise<boolean> }) {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [wordId, setWordId] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; void (async () => {
    if (demoMode) { try { const value = JSON.parse(localStorage.getItem(key) ?? '{"decks":[],"cards":[]}'); if (alive) { setDecks(value.decks ?? []); setCards(value.cards ?? []); } } catch { if (alive) setError("Could not read decks on this device."); } }
    else { const [deckResult, cardResult] = await Promise.all([db!.from("vocabulary_decks").select("id,name").order("created_at"), db!.from("vocabulary_deck_cards").select("deck_id,notebook_entry_id")]); if (alive) { if (deckResult.error || cardResult.error) setError(deckResult.error?.message ?? cardResult.error!.message); else { setDecks(deckResult.data as Deck[]); setCards(cardResult.data as Card[]); } } }
    if (alive) setLoading(false);
  })(); return () => { alive = false; }; }, [db]);
  function persist(nextDecks: Deck[], nextCards: Card[]) { if (demoMode) localStorage.setItem(key, JSON.stringify({ decks: nextDecks, cards: nextCards })); setDecks(nextDecks); setCards(nextCards); }
  async function create() { const value = name.trim(); if (!value || busy) return; if (decks.some((deck) => deck.name.toLowerCase() === value.toLowerCase())) { setError("A deck with this name already exists."); return; } setBusy(true); setError("");
    if (demoMode) { const next = { id: crypto.randomUUID(), name: value }; persist([...decks, next], cards); setSelected(next.id); setName(""); }
    else { const result = await db!.from("vocabulary_decks").insert({ name: value }).select("id,name").single(); if (result.error) setError(result.error.message); else { setDecks((current) => [...current, result.data as Deck]); setSelected(result.data.id); setName(""); } } setBusy(false); }
  async function rename() { if (!selected || !name.trim() || busy) return; const value = name.trim(); if (decks.some((deck) => deck.id !== selected && deck.name.toLowerCase() === value.toLowerCase())) { setError("A deck with this name already exists."); return; } setBusy(true); setError(""); if (demoMode) { persist(decks.map((deck) => deck.id === selected ? { ...deck, name: value } : deck), cards); setName(""); } else { const result = await db!.from("vocabulary_decks").update({ name: value }).eq("id", selected); if (result.error) setError(result.error.message); else { setDecks((current) => current.map((deck) => deck.id === selected ? { ...deck, name: value } : deck)); setName(""); } } setBusy(false); }
  async function removeDeck() { if (!selected || busy) return; setBusy(true); setError(""); if (demoMode) { persist(decks.filter((deck) => deck.id !== selected), cards.filter((card) => card.deck_id !== selected)); setSelected(""); } else { const result = await db!.from("vocabulary_decks").delete().eq("id", selected); if (result.error) setError(result.error.message); else { setDecks((current) => current.filter((deck) => deck.id !== selected)); setCards((current) => current.filter((card) => card.deck_id !== selected)); setSelected(""); } } setBusy(false); }
  async function add() { if (!selected || !wordId || busy || cards.some((card) => card.deck_id === selected && card.notebook_entry_id === wordId)) return; setBusy(true); setError(""); const card = { deck_id: selected, notebook_entry_id: wordId }; if (demoMode) persist(decks, [...cards, card]); else { const result = await db!.from("vocabulary_deck_cards").insert(card); if (result.error) setError(result.error.message); else setCards((current) => [...current, card]); } setWordId(""); setBusy(false); }
  async function removeWord(id: string) { if (busy) return; setBusy(true); setError(""); if (demoMode) persist(decks, cards.filter((card) => !(card.deck_id === selected && card.notebook_entry_id === id))); else { const result = await db!.from("vocabulary_deck_cards").delete().eq("deck_id", selected).eq("notebook_entry_id", id); if (result.error) setError(result.error.message); else setCards((current) => current.filter((card) => !(card.deck_id === selected && card.notebook_entry_id === id))); } setBusy(false); }
  const ids = new Set(cards.filter((card) => card.deck_id === selected).map((card) => card.notebook_entry_id));
  const words = saved.filter((word) => ids.has(word.id));
  const dueWords = due.filter((word) => ids.has(word.id) && !done.includes(word.id));
  const current = dueWords[0];
  async function rate(grade: ReviewGrade) { if (!current || !revealed || busy) return; setBusy(true); if (await gradeWord(current, grade)) { setDone((items) => [...items, current.id]); setRevealed(false); } setBusy(false); }
  return <section className="vocab-panel vocab-decks"><h2>Bộ thẻ của bạn</h2><p>Nhóm các từ đã lưu từ bài học, tin tức và video. Mọi bộ thẻ dùng chung một lịch FSRS cho từng từ.</p>{error && <p role="alert" className="vocab-error">{error}</p>}{loading ? <p>Đang tải bộ thẻ…</p> : <><div className="vocab-filter-bar"><select aria-label="Chọn bộ thẻ" value={selected} onChange={(event) => { setSelected(event.target.value); setDone([]); setRevealed(false); }}><option value="">Chọn bộ thẻ</option>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select><input aria-label="Tên bộ thẻ" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Tên bộ thẻ" /><button className="vocab-button primary" disabled={busy || !name.trim()} onClick={() => void create()}>Tạo bộ</button>{selected && <><button className="vocab-button soft" disabled={busy || !name.trim()} onClick={() => void rename()}>Đổi tên</button><button className="vocab-button danger" disabled={busy} onClick={() => void removeDeck()}>Xóa bộ (giữ từ)</button></>}</div>
    {selected ? <><div className="vocab-filter-bar"><strong>{words.length} từ · {dueWords.length} đến hạn</strong><select aria-label="Thêm từ đã lưu" value={wordId} onChange={(event) => setWordId(event.target.value)}><option value="">Chọn từ đã lưu</option>{saved.filter((word) => !ids.has(word.id)).map((word) => <option key={word.id} value={word.id}>{word.title} · {word.topic}</option>)}</select><button className="vocab-button soft" disabled={!wordId || busy} onClick={() => void add()}>Thêm từ</button></div><div className="vocab-word-list">{words.map((word) => <article className="vocab-word-row" key={word.id}><TopicArt localOnly topic={word.topic || "General"} word={word.title} className="vocab-row-art" /><div><strong>{word.title}</strong><p>{word.meaningVi} · {word.topic}</p></div><button className="vocab-button danger" disabled={busy} onClick={() => void removeWord(word.id)}>Bỏ khỏi bộ</button></article>)}</div>{current ? <div className="vocab-review"><button className="vocab-flashcard" onClick={() => setRevealed(!revealed)}><span>{revealed ? "MẶT SAU" : "MẶT TRƯỚC"}</span><TopicArt localOnly topic={current.topic || "General"} word={current.title} className="vocab-card-art" /><strong>{current.title}</strong>{revealed && <><b>{current.meaningVi}</b><em>{current.example}</em>{current.partOfSpeech && <small>{current.partOfSpeech}</small>}</>}</button>{revealed && <div className="vocab-rating">{(["again","hard","good","easy"] as const).map((grade) => <button key={grade} disabled={busy} onClick={() => void rate(grade)}>{grade}</button>)}</div>}<small>{reviewById.has(current.id) ? "Ôn tiếp" : "Thẻ mới"}</small></div> : <p>{words.length ? "Không có từ đến hạn trong bộ này." : "Thêm từ đã lưu để bắt đầu."}</p>}</> : <p>{decks.length ? "Chọn bộ thẻ để quản lý và ôn tập." : "Chưa có bộ thẻ. Tạo bộ đầu tiên ở trên."}</p>}</>}
  </section>;
}
