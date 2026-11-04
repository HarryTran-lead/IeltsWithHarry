"""Split Gemini TTS batches into one MP3 per Skill Lab dictation turn and check each clip.

scripts/dictation-skill-lab-tts.mjs stores each TTS reply (several turns read by one voice) in
.cache/dictation-skill-lab/batches/. This script transcribes a batch with faster-whisper word
timestamps, aligns the recognised words to the known turn texts, cuts at the quiet point between
consecutive turns and writes public/dictation-skill-lab/audio/<lesson>/<turn>.mp3 plus a manifest
entry with the real duration and a word error rate (WER) check:

  pass    WER <= 0.15
  review  WER <= 0.40, kept but flagged for a teacher to listen first
  reject  higher, or the turn could not be located; not saved, so the TTS script asks again
          (after two rejections the clip is kept as "review").

  python scripts/dictation-skill-lab-split.py [--model base.en] [--verify-existing]

The WER check is an automatic screen, not human verification.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import re
import wave
from difflib import SequenceMatcher
from pathlib import Path

import av
import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
BATCHES = ROOT / ".cache/dictation-skill-lab/batches"
REJECTIONS = ROOT / ".cache/dictation-skill-lab/rejections.json"
MANIFEST = ROOT / "content/dictation-skill-lab/audio-manifest.json"
PUBLIC = ROOT / "public"
RATE = 24000
PASS, REVIEW = 0.10, 0.30

UNITS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine".split())}
TEENS = {w: i + 10 for i, w in enumerate("ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split())}
TENS = {w: (i + 2) * 10 for i, w in enumerate("twenty thirty forty fifty sixty seventy eighty ninety".split())}
ORDINALS = {"first": "one", "second": "two", "third": "three", "fifth": "five", "eighth": "eight", "ninth": "nine", "twelfth": "twelve"}
FILLER = {"and", "oh", "o", "a", "the", "uh", "um", "dash", "hyphen"}


def _ordinal(word: str) -> str:
    if word in ORDINALS:
        return ORDINALS[word]
    if word.endswith("ieth") and word[:-4] + "y" in TENS:
        return word[:-4] + "y"
    if word.endswith("th") and (word[:-2] in UNITS or word[:-2] in TEENS):
        return word[:-2]
    return word


def _numbers(words: list[str]) -> list[str]:
    """Number words become digit strings ("twenty eighteen" -> 20, 18; "four hundred and five" -> 405)."""
    out: list[str] = []
    value, last = None, None

    def flush():
        nonlocal value, last
        if value is not None:
            out.append(str(value))
        value, last = None, None

    for raw in words:
        word = _ordinal(raw)
        kind = "unit" if word in UNITS else "teen" if word in TEENS else "tens" if word in TENS else word if word in ("hundred", "thousand") else None
        if kind is None:
            if not (raw == "and" and last == "hundred"):
                flush()
                out.append(raw)
            continue
        number = UNITS.get(word, TEENS.get(word, TENS.get(word)))
        if value is None:
            if kind in ("hundred", "thousand"):
                out.append(word)
            else:
                value, last = number, kind
        elif kind == "hundred" and last in ("unit", "teen", "tens") and value < 100:
            value, last = value * 100, "hundred"
        elif kind == "thousand" and value < 1000:
            value, last = value * 1000, "thousand"
        elif kind == "unit" and last in ("tens", "hundred", "thousand") and value % 10 == 0 and number:
            value, last = value + number, "unit"
        elif kind in ("teen", "tens") and last in ("hundred", "thousand") and value % 100 == 0:
            value, last = value + number, kind
        else:
            flush()
            value, last = number, kind
    flush()
    return out


def tokens(text: str) -> list[str]:
    """Comparable tokens: numbers as single digits whether spoken or written, symbols as words, filler dropped."""
    t = text.lower().replace("’", "'")
    t = re.sub(r"£\s?(\d+(?:\.\d+)?)", r"\1 pounds", t)
    t = re.sub(r"\$\s?(\d+(?:\.\d+)?)", r"\1 dollars", t)
    t = re.sub(r"(\d)\s?%", r"\1 percent", t)
    t = re.sub(r"(\d)[:.,](?=\d)", r"\1", t)
    t = re.sub(r"(\d+)(st|nd|rd|th)\b", r"\1", t)
    t = re.sub(r"(?<=[a-z0-9])\.(?=[a-z0-9])", " dot ", t)
    t = t.replace("@", " at ").replace("_", " underscore ").replace("&", " and ")
    t = re.sub(r"(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])", " ", t)
    t = re.sub(r"[^a-z0-9' -]+", " ", t)
    words: list[str] = []
    for word in t.split():
        word = word.strip("'-").replace("'", "")
        if not word:
            continue
        parts = word.split("-")
        words += parts if any(part in UNITS or part in TEENS or part in TENS or _ordinal(part) in UNITS for part in parts) else ["".join(parts)]
    result: list[str] = []
    for word in _numbers(words):
        if word.isdigit():
            result += list(word)
        elif word not in FILLER:
            result.append(word)
    return result


def error_rate(expected: list[str], heard: list[str]) -> float:
    """Character error rate over the joined tokens, so "lower-case"/"lowercase" or "4 16"/"416" do not count."""
    a, b = "".join(expected), "".join(heard)
    if not a:
        return 1.0
    previous = list(range(len(b) + 1))
    for i, target in enumerate(a, 1):
        current = [i]
        for j, char in enumerate(b, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (target != char)))
        previous = current
    return round(previous[-1] / len(a), 3)


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path)) as source:
        if source.getframerate() != RATE or source.getnchannels() != 1 or source.getsampwidth() != 2:
            raise ValueError(f"{path.name}: expected 24 kHz mono 16-bit audio")
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").copy()


def quiet_point(samples: np.ndarray, start: float, end: float) -> int:
    """Middle of the longest quiet stretch between two times (seconds); the quietest frame otherwise."""
    a, b = max(0, int(start * RATE)), min(len(samples), int(end * RATE))
    if b - a < RATE // 50:
        return (a + b) // 2
    frame = RATE // 100
    peaks = np.array([np.abs(samples[i:i + frame]).max() for i in range(a, b, frame)])
    quiet = peaks < 500
    best, best_len, run_start = None, 0, None
    for index, flag in enumerate(list(quiet) + [False]):
        if flag and run_start is None:
            run_start = index
        elif not flag and run_start is not None:
            if index - run_start > best_len:
                best, best_len = (run_start + index) // 2, index - run_start
            run_start = None
    return a + (best if best is not None else int(np.argmin(peaks))) * frame


def trim(samples: np.ndarray) -> np.ndarray:
    loud = np.flatnonzero(np.abs(samples) >= 400)
    if not len(loud):
        return samples[:0]
    return samples[max(0, loud[0] - int(0.12 * RATE)): min(len(samples), loud[-1] + int(0.25 * RATE))]


def mp3(samples: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    with av.open(buffer, "w", format="mp3") as out:
        stream = out.add_stream("libmp3lame", rate=RATE, layout="mono")
        stream.bit_rate = 48_000
        frame = av.AudioFrame.from_ndarray(samples.reshape(1, -1), format="s16", layout="mono")
        frame.sample_rate = RATE
        for packet in stream.encode(frame):
            out.mux(packet)
        for packet in stream.encode(None):
            out.mux(packet)
    return buffer.getvalue()


def transcribe(model: WhisperModel, audio) -> list[tuple[str, float, float]]:
    segments, _ = model.transcribe(audio, language="en", beam_size=5, word_timestamps=True, condition_on_previous_text=False, vad_filter=False)
    found = []
    for segment in segments:
        for word in segment.words or []:
            for token in tokens(word.word):
                found.append((token, float(word.start), float(word.end)))
    return found


def split_batch(model: WhisperModel, wav_path: Path, jobs: list[dict]):
    """Returns [(job, clip, wer)] where clip is None for a turn that could not be located."""
    samples = read_wav(wav_path)
    # A file path lets faster-whisper resample to 16 kHz; a raw 24 kHz array would skew every timestamp.
    heard = transcribe(model, str(wav_path))
    expected, owner = [], []
    for index, job in enumerate(jobs):
        words = tokens(job["text"])
        expected += words
        owner += [index] * len(words)
    matcher = SequenceMatcher(None, expected, [w for w, _, _ in heard], autojunk=False)
    located: list[list[int]] = [[] for _ in jobs]
    for a, b, size in matcher.get_matching_blocks():
        for k in range(size):
            located[owner[a + k]].append(b + k)
    spans = [(heard[min(idx)][1], heard[max(idx)][2]) if idx else None for idx in located]
    cuts = [0]
    for index in range(len(jobs) - 1):
        left = next((spans[i] for i in range(index, -1, -1) if spans[i]), None)
        right = next((spans[i] for i in range(index + 1, len(jobs)) if spans[i]), None)
        if not left or not right or right[0] <= left[1] - 0.05:
            cuts.append(None)
            continue
        cuts.append(quiet_point(samples, left[1], right[0]))
    cuts.append(len(samples))
    results = []
    for index, job in enumerate(jobs):
        a, b = cuts[index], cuts[index + 1]
        if a is None or b is None or spans[index] is None or b - a < int(0.5 * RATE):
            results.append((job, None, 1.0))
            continue
        heard_here = [w for w, s, e in heard if a / RATE <= (s + e) / 2 < b / RATE]
        results.append((job, trim(samples[a:b]), error_rate(tokens(job["text"]), heard_here)))
    return results


def load_json(path: Path, fallback):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else fallback


def save_manifest(manifest: dict) -> None:
    manifest["turns"] = dict(sorted(manifest["turns"].items()))
    manifest["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    manifest.setdefault("status", "generated_needs_human_QA")
    temp = MANIFEST.with_suffix(".tmp")
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    temp.replace(MANIFEST)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="base.en")
    parser.add_argument("--verify-existing", action="store_true", help="also WER-check manifest clips that have no ASR result")
    args = parser.parse_args()
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    manifest = load_json(MANIFEST, {"version": 1, "status": "generated_needs_human_QA", "turns": {}})
    rejections = load_json(REJECTIONS, {})
    totals = {"pass": 0, "review": 0, "reject": 0}
    for record_path in sorted(BATCHES.glob("*.json")):
        record = json.loads(record_path.read_text(encoding="utf-8"))
        if record.get("split_at"):
            continue
        outcome = {}
        for job, clip, score in split_batch(model, record_path.with_suffix(".wav"), record["jobs"]):
            tries = rejections.get(job["key"], 0)
            verdict = "pass" if clip is not None and score <= PASS else "review" if clip is not None and (score <= REVIEW or tries >= 2) else "reject"
            totals[verdict] += 1
            outcome[job["key"]] = {"verdict": verdict, "wer": score}
            if verdict == "reject":
                rejections[job["key"]] = tries + 1
                continue
            data = mp3(clip)
            target = PUBLIC / job["file"].lstrip("/")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            words = len(job["text"].split())
            seconds = len(clip) / RATE
            manifest["turns"][job["key"]] = {
                "file": job["file"], "duration_ms": round(seconds * 1000), "voice": job["voice"], "accent": job["accent"], "style": job["style"],
                "model": record["model"], "batch": record["id"], "batch_size": len(record["jobs"]), "text_sha256": job["text_sha256"],
                "audio_sha256": hashlib.sha256(data).hexdigest(), "words_per_second": round(words / max(seconds, 0.01), 2),
                "asr_model": args.model, "asr_wer": score, "asr_check": verdict, "generated_at": record["created_at"],
            }
        record["split_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        record["outcome"] = outcome
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        save_manifest(manifest)
        REJECTIONS.write_text(json.dumps(rejections, indent=1), encoding="utf-8")
        print(f"{record['id']}: {len(record['jobs'])} turns · " + " ".join(f"{k}={sum(1 for o in outcome.values() if o['verdict'] == k)}" for k in totals), flush=True)
    if args.verify_existing:
        lessons_dir = ROOT / "content/dictation-skill-lab/lessons"
        texts = {}
        for path in lessons_dir.glob("*.json"):
            lesson = json.loads(path.read_text(encoding="utf-8"))
            for turn in lesson["turns"]:
                texts[f"{lesson['lesson_id']}/{turn['turn_id']}"] = turn["text_en"]
        for key, entry in manifest["turns"].items():
            if entry.get("asr_check") or key not in texts:
                continue
            heard = [w for w, _, _ in transcribe(model, str(PUBLIC / entry["file"].lstrip("/")))]
            score = error_rate(tokens(texts[key]), heard)
            entry.update({"asr_model": args.model, "asr_wer": score, "asr_check": "pass" if score <= PASS else "review"})
            totals[entry["asr_check"]] += 1
        save_manifest(manifest)
    print("done:", totals, flush=True)


if __name__ == "__main__":
    main()
