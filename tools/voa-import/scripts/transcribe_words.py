#!/usr/bin/env python3
"""Create offline word timestamps for VOA development audio using faster-whisper."""
import argparse
import json
from pathlib import Path
from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", default="base.en")
    args = parser.parse_args()
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=6)
    segments, _ = model.transcribe(str(args.audio), language="en", beam_size=2,
                                   word_timestamps=True, condition_on_previous_text=False)
    words = [{"start": round(word.start, 3), "end": round(word.end, 3), "word": word.word}
             for segment in segments for word in (segment.words or [])]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    print(f"{args.audio.name}: {len(words)} words -> {args.output}")


if __name__ == "__main__":
    main()
