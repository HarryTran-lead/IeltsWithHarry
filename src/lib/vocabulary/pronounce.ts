"use client";

import { useEffect, useState } from "react";

/** A human recording (Wiktionary / Wikimedia Commons via dictionaryapi.dev) and IPA for a word, when the dictionary has them. */
export type Pronunciation = { audio: string; ipa: string };
type DictionaryEntry = { phonetic?: string; phonetics?: { text?: string; audio?: string }[] };

const cache = new Map<string, Promise<Pronunciation>>();
const ready = new Map<string, Pronunciation>();
const empty: Pronunciation = { audio: "", ipa: "" };
// Commons' MP3 transcode stays playable in Safari even when the dictionary media proxy is down.
const knownRecordings: Record<string, Pronunciation> = {
  "a.m.": {
    audio: "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a4/En-us-a.m..ogg/En-us-a.m..ogg.mp3",
    ipa: "/ˌeɪˈɛm/",
  },
};

export function lookupPronunciation(word: string): Promise<Pronunciation> {
  const key = word.trim().toLowerCase();
  // Dictionary headwords include abbreviations such as "a.m." and "p.m.".
  if (!/^[a-z][a-z.' -]{0,40}$/.test(key)) return Promise.resolve(empty);
  if (knownRecordings[key]) {
    ready.set(key, knownRecordings[key]);
    return Promise.resolve(knownRecordings[key]);
  }
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
    .catch(() => empty)
    .then((result) => { ready.set(key, result); return result; });
  cache.set(key, request);
  return request;
}

/** The most natural English voice the device offers. */
function bestVoice() {
  const voices = window.speechSynthesis.getVoices().filter((voice) => /^en[-_]/i.test(voice.lang));
  const rank = (voice: SpeechSynthesisVoice) => (/natural|neural|online/i.test(voice.name) ? 4 : 0) + (/google/i.test(voice.name) ? 2 : 0) + (/en[-_]US/i.test(voice.lang) ? 1 : 0);
  return voices.sort((a, b) => rank(b) - rank(a))[0];
}

/** Reads a sentence (or a word without a recording) with the device voice. */
export function speakText(text: string, rate = 0.92) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  // Spell initialisms instead of letting Safari read "a.m." as the verb "am".
  const spoken = /^[a-z](?:\.[a-z])+\.?$/i.test(text.trim()) ? text.replace(/\./g, " ").trim().toUpperCase() : text;
  const utterance = new SpeechSynthesisUtterance(spoken);
  const voice = bestVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

let playing: HTMLAudioElement | null = null;
const brokenAudio = new Set<string>();

/** Play inside the click handler: Safari can reject audio started after an awaited fetch. */
export function pronounce(word: string) {
  const key = word.trim().toLowerCase();
  const { audio } = ready.get(key) ?? knownRecordings[key] ?? empty;
  // Start the lookup for a later click if the recording has not loaded yet.
  if (!ready.has(key)) void lookupPronunciation(word);
  playing?.pause();
  if (audio && !brokenAudio.has(audio)) {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      playing = new Audio(audio);
      const current = playing;
      void current.play().catch(() => {
        brokenAudio.add(audio);
        if (playing === current) {
          playing = null;
          speakText(word, 0.92);
        }
      });
      return;
    } catch { /* Missing media support: use the device voice. */ }
  }
  speakText(word, 0.92);
}

/** IPA for a word, looked up once and shared across screens; `fallback` is shown while loading. */
export function useIpa(word: string, fallback = "") {
  const [ipa, setIpa] = useState<{ word: string; value: string }>({ word: "", value: "" });
  useEffect(() => {
    if (!word) return;
    let alive = true;
    // Even with a supplied IPA, preload the human recording for the Nghe button.
    void lookupPronunciation(word).then((result) => { if (alive && !fallback) setIpa({ word, value: result.ipa }); });
    return () => { alive = false; };
  }, [word, fallback]);
  return fallback || (ipa.word === word ? ipa.value : "");
}
