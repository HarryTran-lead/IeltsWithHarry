#!/usr/bin/env python3
"""Offline technical inspection for consented IELTS Speaking S6 clips.

This is *not* speaker verification, speech recognition, pronunciation grading,
or proof of microphone origin. It only checks whether supported media decodes,
falls within reasonable duration and contains measurable audible energy.
No network calls, no uploads, no audio/transcripts in JSON output.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np

SAMPLE_RATE = 16000
MIN_SECONDS = 1.0
MAX_SECONDS = 180.0
MAX_SOURCE_BYTES = 10 * 1024 * 1024
SUPPORTED = {".webm", ".mp4", ".ogg"}


def evaluate_decoded_pcm(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> dict:
    """Conservative diagnostics, not a speech/no-speech classifier."""
    pcm = np.asarray(samples, dtype=np.float32)
    if sample_rate <= 0 or pcm.ndim != 1 or not np.isfinite(pcm).all():
        return {"status": "INVALID_PCM", "technical_pass": False, "speech_verified": False}
    duration = len(pcm) / sample_rate
    if len(pcm) == 0:
        return {"status": "EMPTY_AUDIO", "technical_pass": False, "speech_verified": False,
                "duration_seconds": 0.0}
    global_rms = float(np.sqrt(np.mean(pcm.astype(np.float64) ** 2)))
    peak = float(np.max(np.abs(pcm)))
    clipped_fraction = float(np.mean(np.abs(pcm) >= 0.995))

    # 100ms frames; measurable sound is not necessarily human speech.
    frame_len = max(1, round(0.1 * sample_rate))
    full = len(pcm) // frame_len
    frames = pcm[:full * frame_len].reshape((full, frame_len)) if full else np.empty((0, frame_len))
    energies = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1)) if full else np.array([])
    active_fraction = float(np.mean(energies >= 0.005)) if len(energies) else 0.0

    if duration < MIN_SECONDS or duration > MAX_SECONDS:
        status = "DURATION_OUT_OF_RANGE"
    elif clipped_fraction >= 0.02:
        status = "POSSIBLE_CLIPPING"
    elif global_rms < 0.002 or active_fraction < 0.05:
        status = "NO_MEASURABLE_SIGNAL"
    else:
        status = "PASS_TECHNICAL"

    return {
        "status": status,
        "technical_pass": status == "PASS_TECHNICAL",
        "speech_verified": False,
        "duration_seconds": round(duration, 3),
        "rms": round(global_rms, 6),
        "peak": round(peak, 6),
        "active_frame_fraction": round(active_fraction, 4),
        "clipped_fraction": round(clipped_fraction, 4),
        "sample_rate": sample_rate
    }


def inspect_local_audio(path: Path, ffmpeg_executable: str | None = None) -> dict:
    path = Path(path)
    if path.suffix.lower() not in SUPPORTED or not path.is_file() or path.is_symlink():
        return {"status": "UNSUPPORTED_INPUT", "technical_pass": False, "speech_verified": False}
    size = path.stat().st_size
    if size < 256 or size > MAX_SOURCE_BYTES:
        return {"status": "INVALID_FILE_SIZE", "technical_pass": False, "speech_verified": False}
    command = [
        ffmpeg_executable or imageio_ffmpeg.get_ffmpeg_exe(),
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", str(path), "-t", "181", "-vn",
        "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=30, check=False)
    except (subprocess.TimeoutExpired, OSError):
        return {"status": "DECODE_UNAVAILABLE", "technical_pass": False, "speech_verified": False}
    if result.returncode or not result.stdout or len(result.stdout) % 4:
        return {"status": "UNDECODABLE", "technical_pass": False, "speech_verified": False}
    pcm = np.frombuffer(result.stdout, dtype="<f4")
    return evaluate_decoded_pcm(pcm, SAMPLE_RATE)


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline technical QA only; never verifies human speech")
    parser.add_argument("file", type=Path, help="Local, consented .webm, .mp4 or .ogg recording")
    args = parser.parse_args()
    verdict = inspect_local_audio(args.file)
    print(json.dumps(verdict, sort_keys=True))
    if not verdict.get("technical_pass"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
