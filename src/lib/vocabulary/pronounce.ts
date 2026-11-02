"use client";

import { useEffect, useState } from "react";

/** A human recording (Wiktionary / Wikimedia Commons via dictionaryapi.dev) and IPA for a word, when the dictionary has them. */
export type Pronunciation = { audio: string; ipa: string };
type DictionaryEntry = { phonetic?: string; phonetics?: { text?: string; audio?: string }[] };

const cache = new Map<string, Promise<Pronunciation>>();
const empty: Pronunciation = { audio: "", ipa: "" };

export function lookupPronunciation(word: string): Promise<Pronunciation> {
  const key = word.trim().toLowerCase();
  if (!/^[a-z][a-z' -]{0,40}$/.test(key)) return Promise.resolve(empty);
  const known = cache.get(key);
  if (known) return known;
  const request = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`)
    .then(async (response) => {
      if (!response.ok) return empty;
      const entries = await response.json() as DictionaryEntry[];
      const phonetics = entries.flatMap((entry) => entry.phonetics ?? []);
      // Prefer the US recording, then the UK one, then any.
      const audio = ["-us.mp3", "-uk.mp3", ".mp3"].map((suffix) => phonetics.find((item) => item.audio?.endsWith(suffix))?.audio).find(Boolean) ?? "";
      const ipa = entries.find((entry) => entry.phonetic)?.phonetic ?? phonetics.find((item) => item.text)?.text ?? "";
      return { audio, ipa };
    })
    .catch(() => empty);
  cache.set(key, request);
  return request;
}

/** The most natural English voice the device offers (Edge/Chrome "Natural"/"Online" voices first). */
function bestVoice() {
  const voices = window.speechSynthesis.getVoices().filter((voice) => /^en[-_]/i.test(voice.lang));
  const rank = (voice: SpeechSynthesisVoice) => (/natural|neural|online/i.test(voice.name) ? 4 : 0) + (/google/i.test(voice.name) ? 2 : 0) + (/en[-_]US/i.test(voice.lang) ? 1 : 0);
  return voices.sort((a, b) => rank(b) - rank(a))[0];
}

/** Reads a sentence (or a word without a recording) with the device voice. */
export function speakText(text: string, rate = 0.92) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = bestVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

let playing: HTMLAudioElement | null = null;

/** Plays a human recording of the word when one exists, otherwise the device voice. */
export async function pronounce(word: string) {
  const { audio } = await lookupPronunciation(word);
  if (audio) {
    try {
      playing?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      playing = new Audio(audio);
      await playing.play();
      return;
    } catch { /* Blocked or missing file: fall back to the device voice. */ }
  }
  speakText(word, 0.85);
}

/** IPA for a word, looked up once and shared across screens; `fallback` is shown while loading. */
export function useIpa(word: string, fallback = "") {
  const [ipa, setIpa] = useState<{ word: string; value: string }>({ word: "", value: "" });
  useEffect(() => {
    if (fallback || !word) return;
    let alive = true;
    void lookupPronunciation(word).then((result) => { if (alive) setIpa({ word, value: result.ipa }); });
    return () => { alive = false; };
  }, [word, fallback]);
  return fallback || (ipa.word === word ? ipa.value : "");
}
