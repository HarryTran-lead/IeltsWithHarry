"""Align each written sentence to its existing Skill Lab MP3 clip.

Run after dictation-skill-lab-split.py. Only timestamps are stored: the answer
text stays in the server-side lesson JSON. Re-running skips aligned clips.
"""
from __future__ import annotations

import argparse
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path

import av
import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "content/dictation-skill-lab/audio-manifest.json"
LESSONS = ROOT / "content/dictation-skill-lab/lessons"


def sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+(?=[\"'A-Z0-9])", text.strip()) if part.strip()]


def words(text: str) -> list[str]:
    found = re.findall(r"[a-z0-9]+", text.lower().replace("’", "'"))
    return [part for word in found for part in (["all", "right"] if word == "alright" else [word])]


def align(model: WhisperModel, path: Path, text: str, duration_ms: int) -> list[dict[str, int]]:
    parts = sentences(text)
    if len(parts) == 1:
        return [{"start_ms": 0, "end_ms": duration_ms}]
    segments, _ = model.transcribe(str(path), language="en", beam_size=1, word_timestamps=True,
                                   condition_on_previous_text=False, vad_filter=False)
    heard: list[tuple[str, float, float]] = []
    for segment in segments:
        for word in segment.words or []:
            heard.extend((token, float(word.start), float(word.end)) for token in words(word.word))
    expected = [word for part in parts for word in words(part)]
    if not heard or not expected:
        raise ValueError("no aligned speech")
    matcher = SequenceMatcher(None, expected, [word for word, _, _ in heard], autojunk=False)
    matched = {a + offset: b + offset for a, b, size in matcher.get_matching_blocks() for offset in range(size)}
    boundaries = []
    count = 0
    for part in parts[:-1]:
        count += len(words(part))
        left = next((matched[index] for index in range(count - 1, -1, -1) if index in matched), None)
        right = next((matched[index] for index in range(count, len(expected)) if index in matched), None)
        if left is None or right is None or left >= right:
            raise ValueError(f"no boundary after word {count}")
        # Split inside the pause, never before the last spoken word.
        cut = (heard[left][2] + heard[right][1]) / 2
        boundaries.append(round(cut * 1000))
    cuts = [0, *boundaries, duration_ms]
    if any(b - a < 350 for a, b in zip(cuts, cuts[1:])):
        raise ValueError("sentence segment too short")
    return [{"start_ms": a, "end_ms": b} for a, b in zip(cuts, cuts[1:])]


def align_quiet(path: Path, text: str, duration_ms: int) -> list[dict[str, int]]:
    """Fast fallback: place cuts at the longest pause near each transcript boundary."""
    parts = sentences(text)
    if len(parts) == 1:
        return [{"start_ms": 0, "end_ms": duration_ms}]
    with av.open(str(path)) as source:
        rate = source.streams.audio[0].rate
        samples = np.concatenate([frame.to_ndarray().reshape(-1) for frame in source.decode(audio=0)])
    frame_size = int(rate * .02)
    samples = samples[:len(samples) // frame_size * frame_size]
    energy = np.sqrt(np.mean(samples.reshape(-1, frame_size) ** 2, axis=1))
    threshold = max(.004, min(.015, float(np.percentile(energy, 25)) * 1.7))
    quiet = energy < threshold
    pauses = []
    start = None
    for index, is_quiet in enumerate(list(quiet) + [False]):
        if is_quiet and start is None:
            start = index
        elif not is_quiet and start is not None:
            if index - start >= 4:  # at least 80 ms
                pauses.append(((start + index) * 10, (index - start) * 20))
            start = None
    weights = [max(1, len(words(part))) for part in parts]
    cuts = [0]
    elapsed = 0
    for weight in weights[:-1]:
        elapsed += weight
        target = duration_ms * elapsed / sum(weights)
        previous = cuts[-1]
        max_gap = duration_ms / len(parts) * .6
        choices = [(mid, length) for mid, length in pauses if previous + 350 < mid < duration_ms - 350 and abs(mid - target) <= max_gap]
        if not choices:
            raise ValueError(f"no sentence pause near {round(target)} ms")
        cut = min(choices, key=lambda item: abs(item[0] - target) - min(item[1], 900) * 4)[0]
        cuts.append(round(cut))
    cuts.append(duration_ms)
    if any(b - a < 350 for a, b in zip(cuts, cuts[1:])):
        raise ValueError("sentence segment too short")
    return [{"start_ms": a, "end_ms": b} for a, b in zip(cuts, cuts[1:])]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", help="Only one stage, e.g. S4")
    parser.add_argument("--model", default="base.en")
    parser.add_argument("--fast", action="store_true", help="Use audio pauses for the remaining clips; review failures with ASR")
    parser.add_argument("--refine-fast", action="store_true", help="Replace pause estimates with ASR word alignment")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    model = None if args.fast else WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=2, num_workers=4)
    done = failed = 0
    jobs = []
    for path in sorted(LESSONS.glob("*.json")):
        lesson = json.loads(path.read_text(encoding="utf-8"))
        if args.stage and lesson["lesson_id"][5:7] != args.stage:
            continue
        for turn in lesson["turns"]:
            key = f'{lesson["lesson_id"]}/{turn["turn_id"]}'
            entry = manifest["turns"].get(key)
            if not entry or (entry.get("sentences") and not (args.refine_fast and entry.get("timing_source") == "silence")):
                continue
            audio = ROOT / "public" / entry["file"].lstrip("/")
            if not audio.exists():
                continue
            jobs.append((key, entry, audio, turn["text_en"]))

    def process(job):
        key, entry, audio, text = job
        return key, align_quiet(audio, text, entry["duration_ms"]) if args.fast else align(model, audio, text, entry["duration_ms"])

    def save():
        temporary = MANIFEST.with_suffix(".sentences.tmp")
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        temporary.replace(MANIFEST)

    print(f"{len(jobs)} clips to align", flush=True)
    with ThreadPoolExecutor(max_workers=1 if args.fast else 4) as pool:
        futures = {pool.submit(process, job): job for job in jobs}
        for future in as_completed(futures):
            key, entry, _, text = futures[future]
            try:
                _, timings = future.result()
                entry["sentences"] = timings
                entry["timing_source"] = "silence" if args.fast else "asr" if len(sentences(text)) > 1 else "single_sentence"
                done += 1
            except ValueError as error:
                print(f"REVIEW {key}: {error}", flush=True)
                failed += 1
            if (done + failed) % 25 == 0:
                save()
                print(f"{done}/{len(jobs)} aligned, {failed} need review", flush=True)
    save()
    print(f"Done: {done} aligned, {failed} need review", flush=True)


if __name__ == "__main__":
    main()
