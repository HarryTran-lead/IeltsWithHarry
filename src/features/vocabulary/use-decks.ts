"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";

export type Deck = { id: string; name: string };
type Card = { deck_id: string; notebook_entry_id: string };
const storageKey = "english-skill-lab-vocabulary-decks-v1";
/** Starred words live in an ordinary deck with this name, so stars need no extra table. */
export const STAR_DECK = "⭐ Đã gắn sao";

/** The learner's decks inside Sổ từ: create, add or remove words, and star words. */
export function useDecks() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!db) {
        try {
          const value = JSON.parse(localStorage.getItem(storageKey) ?? '{"decks":[],"cards":[]}');
          if (alive) { setDecks(value.decks ?? []); setCards(value.cards ?? []); }
        } catch { if (alive) setError("Không đọc được bộ thẻ trên thiết bị này."); }
      } else {
        const [deckResult, cardResult] = await Promise.all([
          db.from("vocabulary_decks").select("id,name").order("created_at"),
          db.from("vocabulary_deck_cards").select("deck_id,notebook_entry_id"),
        ]);
        if (!alive) return;
        if (deckResult.error || cardResult.error) setError(deckResult.error?.message ?? cardResult.error!.message);
        else { setDecks(deckResult.data as Deck[]); setCards(cardResult.data as Card[]); }
      }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [db]);

  const saveLocal = useCallback((nextDecks: Deck[], nextCards: Card[]) => {
    if (!db) try { localStorage.setItem(storageKey, JSON.stringify({ decks: nextDecks, cards: nextCards })); } catch { /* Kept for this visit. */ }
  }, [db]);

  const createDeck = useCallback(async (raw: string) => {
    const name = raw.trim().slice(0, 80);
    if (!name) return null;
    const existing = decks.find((deck) => deck.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    setError("");
    if (!db) {
      const deck = { id: crypto.randomUUID(), name };
      setDecks((current) => { const next = [...current, deck]; saveLocal(next, cards); return next; });
      return deck;
    }
    const result = await db.from("vocabulary_decks").insert({ name }).select("id,name").single();
    if (result.error) { setError(result.error.message); return null; }
    setDecks((current) => [...current, result.data as Deck]);
    return result.data as Deck;
  }, [db, decks, cards, saveLocal]);

  const removeDeck = useCallback(async (deckId: string) => {
    setError("");
    if (db) { const result = await db.from("vocabulary_decks").delete().eq("id", deckId); if (result.error) { setError(result.error.message); return; } }
    const nextDecks = decks.filter((deck) => deck.id !== deckId);
    const nextCards = cards.filter((card) => card.deck_id !== deckId);
    setDecks(nextDecks); setCards(nextCards); saveLocal(nextDecks, nextCards);
  }, [db, decks, cards, saveLocal]);

  const inDeck = useCallback((deckId: string, entryId: string) => cards.some((card) => card.deck_id === deckId && card.notebook_entry_id === entryId), [cards]);

  const toggleCard = useCallback(async (deckId: string, entryId: string) => {
    setError("");
    const present = inDeck(deckId, entryId);
    if (db) {
      const result = present
        ? await db.from("vocabulary_deck_cards").delete().eq("deck_id", deckId).eq("notebook_entry_id", entryId)
        : await db.from("vocabulary_deck_cards").insert({ deck_id: deckId, notebook_entry_id: entryId });
      if (result.error) { setError(result.error.message); return; }
    }
    const nextCards = present ? cards.filter((card) => !(card.deck_id === deckId && card.notebook_entry_id === entryId)) : [...cards, { deck_id: deckId, notebook_entry_id: entryId }];
    setCards(nextCards); saveLocal(decks, nextCards);
  }, [db, cards, decks, inDeck, saveLocal]);

  const starDeck = decks.find((deck) => deck.name === STAR_DECK);
  const starred = useMemo(() => new Set(starDeck ? cards.filter((card) => card.deck_id === starDeck.id).map((card) => card.notebook_entry_id) : []), [cards, starDeck]);
  const toggleStar = useCallback(async (entryId: string) => {
    const deck = starDeck ?? await createDeck(STAR_DECK);
    if (deck) await toggleCard(deck.id, entryId);
  }, [starDeck, createDeck, toggleCard]);

  const deckWords = useCallback((deckId: string) => new Set(cards.filter((card) => card.deck_id === deckId).map((card) => card.notebook_entry_id)), [cards]);

  return { decks, loaded, error, createDeck, removeDeck, toggleCard, inDeck, starred, toggleStar, deckWords, starDeckId: starDeck?.id ?? "" };
}
