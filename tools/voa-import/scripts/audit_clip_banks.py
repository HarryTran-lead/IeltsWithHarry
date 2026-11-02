"""Audit source-paired dictation clips without modifying the database or R2."""
import argparse
import json
import math
import re
import statistics
import wave
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

from import_clip_bank import fsdd_manifest


def words(text):
    return re.findall(r"[a-z0-9]+", text.lower().replace("'", "").replace("’", ""))


def error_rate(expected, actual):
    a, b = words(expected), words(actual)
    previous = list(range(len(b) + 1))
    for i, left in enumerate(a, 1):
        current = [i]
        for j, right in enumerate(b, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (left != right)))
        previous = current
    return previous[-1] / max(1, len(a))


def sample_evenly(items, count):
    if not items:
        return []
    count = min(count, len(items))
    return [items[min(len(items) - 1, int((i + 0.5) * len(items) / count))] for i in range(count)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    blocked = {
        "libritts:dev-clean:2902_9006_000000_000001",
        "libritts:dev-clean:2902_9006_000006_000000",
        "libritts:dev-clean:2902_9006_000000_000000",
    }
    libri = [json.loads(line) for line in (args.data_dir / "libritts_quick_manifest_600.jsonl").read_text(encoding="utf-8").splitlines()]
    libri = [item for item in libri if item["source_id"] not in blocked]
    libri += [json.loads(line) for line in (args.data_dir / "libritts_quick_replacements.jsonl").read_text(encoding="utf-8").splitlines()]
    lj = [json.loads(line) for line in (args.data_dir / "ljspeech_quick_manifest_200.jsonl").read_text(encoding="utf-8").splitlines()]
    digits = list(fsdd_manifest(args.data_dir / "fsdd"))
    items = libri + lj + digits
    if len(libri) != 600 or len(lj) != 200 or len(digits) != 100:
        raise RuntimeError("Manifest count mismatch")
    if len({item["source_id"] for item in items}) != len(items):
        raise RuntimeError("Duplicate source IDs")
    audio_issues = []
    durations = defaultdict(list)
    for item in items:
        path = Path(item["local_path"])
        with wave.open(str(path)) as stream:
            frames = stream.readframes(stream.getnframes())
            sample_width = stream.getsampwidth()
            duration = stream.getnframes() / stream.getframerate()
            channels = stream.getnchannels()
        if channels != 1 or sample_width != 2:
            audio_issues.append({"source_id": item["source_id"], "reason": "unsupported WAV layout"})
            continue
        samples = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768
        rms = float(np.sqrt(np.mean(samples * samples)))
        peak = float(np.max(np.abs(samples)))
        durations[item["source_dataset"]].append(duration)
        if rms < 0.002 or peak > 0.9999 and float(np.mean(np.abs(samples) > 0.9999)) > 0.01:
            audio_issues.append({"source_id": item["source_id"], "reason": "quiet or clipped", "rms": round(rms, 5), "peak": round(peak, 5)})
    by_speaker = defaultdict(list)
    for item in libri:
        by_speaker[item["source_id"].split(":")[-1].split("_")[0]].append(item)
    chosen = [item for speaker in sorted(by_speaker) for item in sample_evenly(by_speaker[speaker], 6)]
    chosen += sample_evenly(lj, 12)
    model = WhisperModel("base.en", device="cpu", compute_type="int8", local_files_only=True)
    asr = []
    for item in chosen:
        segments, _ = model.transcribe(item["local_path"], language="en", beam_size=3, vad_filter=False)
        heard = " ".join(segment.text.strip() for segment in segments)
        asr.append({"source_id": item["source_id"], "dataset": item["source_dataset"], "expected": item["transcript"], "heard": heard, "wer": round(error_rate(item["transcript"], heard), 3)})
    report = {
        "counts": dict(Counter(item["source_dataset"] for item in items)),
        "audio_issues": audio_issues,
        "duration_seconds": {name: {"min": round(min(values), 2), "median": round(statistics.median(values), 2), "max": round(max(values), 2)} for name, values in durations.items()},
        "asr_sample_count": len(asr),
        "asr_median_wer": round(statistics.median(row["wer"] for row in asr), 3),
        "asr_high_wer": [row for row in asr if row["wer"] > 0.5],
        "asr_samples": asr,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("counts", "audio_issues", "duration_seconds", "asr_sample_count", "asr_median_wer", "asr_high_wer")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
