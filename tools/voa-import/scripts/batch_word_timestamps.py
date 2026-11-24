#!/usr/bin/env python3
"""Timestamp the local development VOA media once, keeping resumable JSON outputs."""
import json
import argparse
from pathlib import Path
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1] / "data"
parser = argparse.ArgumentParser()
parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
args = parser.parse_args()
manifest = [json.loads(line) for line in (ROOT / "export_dev_preview.jsonl").read_text(encoding="utf-8").splitlines() if line]
model = WhisperModel("base.en", device=args.device,
                     compute_type="int8_float16" if args.device == "cuda" else "int8", cpu_threads=6)
for index, item in enumerate(manifest, 1):
    target = ROOT / f"words_{item['id']:07d}.json"
    if target.exists():
        print(f"{index}/{len(manifest)} cached {item['id']}", flush=True)
        continue
    audio = ROOT / "media" / f"voa_{item['id']:07d}.mp3"
    if not audio.exists():
        print(f"{index}/{len(manifest)} missing audio {item['id']}", flush=True)
        continue
    segments, _ = model.transcribe(str(audio), language="en", beam_size=2,
                                   word_timestamps=True, condition_on_previous_text=False)
    words = [{"start": round(word.start, 3), "end": round(word.end, 3), "word": word.word}
             for segment in segments for word in (segment.words or [])]
    target.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    print(f"{index}/{len(manifest)} {item['id']} {len(words)} words", flush=True)
