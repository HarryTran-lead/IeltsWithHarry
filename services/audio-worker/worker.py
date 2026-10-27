"""Private, service-role-only Kokoro worker. No inbound HTTP endpoint."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import uuid
import sys
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import imageio_ffmpeg
import numpy as np
import requests
import soundfile as sf

SAMPLE_RATE = 24000
MODEL_ID = os.getenv("KOKORO_MODEL_ID", "hexgrad/Kokoro-82M")
# Published model-card SHA256 for Kokoro 1.0. Mismatch is a hard failure.
MODEL_SHA256 = "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"
CACHE_DIR = Path(os.getenv("AUDIO_CACHE_DIR", "/worker/cache"))


class AudioProvider(Protocol):
    def list_voices(self) -> list[str]: ...
    def capabilities(self) -> dict: ...
    def health(self) -> dict: ...
    def estimate_usage(self, text: str) -> dict: ...
    def synthesize_segment(self, text: str, voice: str, pace: float) -> np.ndarray: ...
    def validate_output(self, audio: np.ndarray) -> dict: ...


class KokoroProvider:
    def __init__(self) -> None:
        from huggingface_hub import hf_hub_download
        from kokoro import KPipeline

        model_path = hf_hub_download(repo_id=MODEL_ID, filename="kokoro-v1_0.pth")
        with open(model_path, "rb") as model_file:
            digest = hashlib.file_digest(model_file, "sha256").hexdigest()
        if digest != MODEL_SHA256:
            raise RuntimeError(f"Kokoro model hash mismatch: {digest}")
        self.pipelines = {"a": KPipeline(lang_code="a"), "b": KPipeline(lang_code="b")}

    def list_voices(self) -> list[str]:
        return ["af_heart", "am_michael", "bf_emma", "bm_george"]

    def capabilities(self) -> dict:
        return {"languages": ["en"], "accents": ["US", "UK"], "sample_rate": SAMPLE_RATE, "multi_speaker": True}

    def health(self) -> dict:
        return {"ready": True, "provider": "kokoro", "model": MODEL_ID, "model_sha256": MODEL_SHA256}

    def estimate_usage(self, text: str) -> dict:
        return {"characters": len(text), "estimated_usd": 0}

    def synthesize_segment(self, text: str, voice: str, pace: float) -> np.ndarray:
        if voice not in self.list_voices():
            raise ValueError(f"Unsupported voice: {voice}")
        pipeline = self.pipelines[voice[0]]
        chunks = [np.asarray(result.audio, dtype=np.float32) for result in pipeline(text, voice=voice, speed=pace)]
        if not chunks:
            raise ValueError("Kokoro returned no audio")
        return np.concatenate(chunks)

    def validate_output(self, audio: np.ndarray) -> dict:
        return inspect_audio(audio, SAMPLE_RATE)


def normalize(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text or len(text) > 1000 or "<" in text or ">" in text:
        raise ValueError("Invalid dialogue turn")
    return text


def inspect_audio(audio: np.ndarray, sample_rate: int) -> dict:
    if audio.ndim != 1 or len(audio) == 0 or not np.isfinite(audio).all():
        raise ValueError("Invalid or non-mono audio")
    peak = float(np.max(np.abs(audio)))
    duration = len(audio) / sample_rate
    clipping = int(np.count_nonzero(np.abs(audio) >= 0.995))
    # A continuous interval below -45 dB longer than 3 s is suspicious.
    quiet = np.abs(audio) < 0.0056
    changes = np.diff(np.concatenate(([False], quiet, [False])).astype(np.int8))
    starts, ends = np.flatnonzero(changes == 1), np.flatnonzero(changes == -1)
    longest_silence = float(np.max(ends - starts) / sample_rate) if len(starts) else 0.0
    passed = sample_rate == SAMPLE_RATE and 0.1 < peak < 0.995 and clipping == 0 and longest_silence < 3.0 and duration > 0.5
    return {"sample_rate": sample_rate, "channels": 1, "duration_seconds": round(duration, 3), "peak": round(peak, 5), "clipped_samples": clipping, "longest_silence_seconds": round(longest_silence, 3), "passed": passed}


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def word_error_rate(reference: str, hypothesis: str) -> float:
    expected, actual = words(reference), words(hypothesis)
    if not expected:
        return 1.0
    previous = list(range(len(actual) + 1))
    for index, target in enumerate(expected, 1):
        current = [index]
        for offset, heard in enumerate(actual, 1):
            current.append(min(current[-1] + 1, previous[offset] + 1, previous[offset - 1] + (target != heard)))
        previous = current
    return round(previous[-1] / len(expected), 4)


@lru_cache(maxsize=1)
def asr_model():
    from faster_whisper import WhisperModel
    return WhisperModel(os.getenv("ASR_MODEL", "base.en"), device="cpu", compute_type="int8", download_root=str(CACHE_DIR / "asr"))


def asr_report(audio_path: Path, canonical: str, answer_phrases: list[str]) -> dict:
    if os.getenv("ASR_ENABLED", "true").lower() != "true":
        return {"status": "disabled"}
    try:
        chunks, info = asr_model().transcribe(str(audio_path), beam_size=5, language="en", condition_on_previous_text=False)
        heard = " ".join(chunk.text.strip() for chunk in chunks)
        wer = word_error_rate(canonical, heard)
        normalized_heard = " ".join(words(heard))
        missing = [phrase for phrase in answer_phrases if " ".join(words(phrase)) not in normalized_heard]
        return {"status": "review_required" if wer > 0.3 or missing else "completed", "model": os.getenv("ASR_MODEL", "base.en"), "language": info.language, "transcript": heard, "word_error_rate": wer, "missing_answer_phrases": missing}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)[:300]}


@dataclass
class Supabase:
    url: str
    key: str

    def __post_init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"apikey": self.key, "Authorization": f"Bearer {self.key}"})

    def rest(self, method: str, path: str, *, params=None, json_body=None, headers=None):
        response = self.session.request(method, f"{self.url}/rest/v1/{path}", params=params, json=json_body, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json() if response.content else None

    def claim(self, token: str) -> dict | None:
        rows = self.rest("POST", "rpc/ai_factory_claim_job", json_body={"p_token": token})
        return rows[0] if rows else None

    def update(self, job: dict, token: str, patch: dict) -> None:
        rows = self.rest("PATCH", "ai_factory_jobs", params={"id": f"eq.{job['id']}", "lease_token": f"eq.{token}", "status": "eq.running"}, json_body={**patch, "updated_at": utc_now()}, headers={"Prefer": "return=representation"})
        if not rows:
            raise RuntimeError("Job lease lost or cancelled")

    def insert(self, table: str, rows: list[dict] | dict) -> None:
        conflict = {"ai_factory_segments": "job_id,ordinal", "ai_factory_qa": "job_id", "ai_factory_usage": "job_id,provider"}.get(table)
        self.rest("POST", table, params={"on_conflict": conflict} if conflict else None,
                  json_body=rows, headers={"Prefer": "resolution=merge-duplicates,return=minimal" if conflict else "return=minimal"})

    def upload(self, path: str, data: bytes) -> None:
        response = self.session.post(f"{self.url}/storage/v1/object/ai-factory-drafts/{path}", data=data, headers={"Content-Type": "audio/mpeg", "x-upsert": "true"}, timeout=120)
        response.raise_for_status()


def utc_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def render_job(db: Supabase, provider: AudioProvider, job: dict, token: str) -> None:
    started = time.perf_counter()
    payload = job["payload"]
    turns = payload.get("turns")
    if not isinstance(turns, list) or not 3 <= len(turns) <= 100 or len({t.get("speaker") for t in turns}) < 2:
        raise ValueError("Listening script needs 3-100 turns and at least two speakers")
    voices = {v["id"]: v for v in db.rest("GET", "ai_factory_voices", params={"select": "*", "enabled": "eq.true"})}
    voice_by_speaker: dict[str, str] = {}
    rendered: list[np.ndarray] = []
    segments: list[dict] = []
    cursor = 0
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for ordinal, turn in enumerate(turns):
        db.update(job, token, {"lease_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()})
        if turn.get("ordinal") != ordinal:
            raise ValueError("Missing or reordered dialogue turn")
        speaker, voice = turn["speaker"], turn["voice"]
        if voice not in voices or voice not in provider.list_voices():
            raise ValueError(f"Voice {voice} is not enabled")
        if speaker in voice_by_speaker and voice_by_speaker[speaker] != voice:
            raise ValueError("Speaker voice changed within the script")
        voice_by_speaker[speaker] = voice
        canonical = normalize(turn["text"])
        pace = float(voices[voice]["pace"])
        cache_key = hashlib.sha256(json.dumps([MODEL_SHA256, voice, pace, canonical], ensure_ascii=False).encode()).hexdigest()
        cache_path = CACHE_DIR / f"{cache_key}.wav"
        if cache_path.exists():
            clip, rate = sf.read(cache_path, dtype="float32")
            if rate != SAMPLE_RATE or not provider.validate_output(clip)["passed"]:
                cache_path.unlink()
                clip = provider.synthesize_segment(canonical, voice, pace)
        else:
            clip = provider.synthesize_segment(canonical, voice, pace)
        if not provider.validate_output(clip)["passed"]:
            raise ValueError(f"Technical QA failed for turn {ordinal}")
        if not cache_path.exists():
            sf.write(cache_path, clip, SAMPLE_RATE, subtype="PCM_16")
        start = cursor
        rendered.append(clip)
        cursor += len(clip)
        segments.append({"job_id": job["id"], "ordinal": ordinal, "speaker_id": speaker, "voice_id": voice, "pace": pace, "canonical_text": canonical, "normalized_text": canonical, "cache_key": cache_key, "start_ms": round(start * 1000 / SAMPLE_RATE), "end_ms": round(cursor * 1000 / SAMPLE_RATE)})
        pause = np.zeros(int(SAMPLE_RATE * (0.42 if canonical.endswith(("?", "!")) else 0.32)), dtype=np.float32)
        rendered.append(pause)
        cursor += len(pause)
    audio = np.concatenate(rendered)
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio *= min(0.92 / peak, 1.6)
    technical = inspect_audio(audio, SAMPLE_RATE)
    technical["expected_turns"] = len(turns)
    technical["actual_turns"] = len(segments)
    technical["model_sha256"] = MODEL_SHA256
    evidence = payload.get("evidence", {})
    alignment = {key: {"turns": value, "intervals_ms": [[segments[i]["start_ms"], segments[i]["end_ms"]] for i in value]} for key, value in evidence.items() if isinstance(value, list) and all(isinstance(i, int) and 0 <= i < len(segments) for i in value)}
    alignment_passed = len(alignment) == 10 and all(v["intervals_ms"] for v in alignment.values())
    if not technical["passed"] or not alignment_passed:
        raise ValueError("Final technical or answer alignment QA failed")
    with tempfile.TemporaryDirectory() as temp:
        wav = Path(temp) / "audio.wav"
        mp3 = Path(temp) / "audio.mp3"
        sf.write(wav, audio, SAMPLE_RATE, subtype="PCM_16")
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav), "-codec:a", "libmp3lame", "-q:a", "4", str(mp3)], check=True, timeout=180)
        decoded = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(mp3), "-f", "null", "-"], capture_output=True, timeout=120)
        if decoded.returncode != 0 or mp3.stat().st_size < 1000 or mp3.stat().st_size > 20_000_000:
            raise ValueError("Final MP3 cannot be decoded or exceeds storage limit")
        asr = asr_report(mp3, " ".join(turn["text"] for turn in turns), payload.get("answerPhrases", []))
        path = f"{job['id']}/audio.mp3"
        encoded = mp3.read_bytes()
        db.upload(path, encoded)
    db.insert("ai_factory_segments", segments)
    db.insert("ai_factory_qa", {"job_id": job["id"], "technical": technical, "answer_alignment": {"passed": alignment_passed, "evidence": alignment}, "asr": asr, "passed": True})
    db.insert("ai_factory_usage", {"job_id": job["id"], "provider": "kokoro", "characters": sum(len(t["text"]) for t in turns), "audio_seconds": technical["duration_seconds"], "processing_seconds": round(time.perf_counter() - started, 2), "storage_bytes": len(encoded), "estimated_usd": 0, "actual_usd": 0})
    db.update(job, token, {"status": "awaiting_review", "artifact_path": path, "model_sha256": MODEL_SHA256, "lease_token": None, "lease_until": None})


def main() -> None:
    if len(sys.argv) == 4 and sys.argv[1] == "--asr-only":
        payload = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        report = asr_report(Path(sys.argv[3]), " ".join(turn["text"] for turn in payload["turns"]), payload.get("answerPhrases", []))
        Path(sys.argv[3]).with_suffix(".asr.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        qa_file = Path(sys.argv[3]).with_name("ai_factory_qa.json")
        if qa_file.exists():
            qa = json.loads(qa_file.read_text(encoding="utf-8"))
            qa["asr"] = report
            qa_file.write_text(json.dumps(qa, indent=2), encoding="utf-8")
        print(json.dumps({"status": report["status"], "word_error_rate": report.get("word_error_rate"), "missing_answer_phrases": report.get("missing_answer_phrases")}), flush=True)
        return
    if len(sys.argv) == 4 and sys.argv[1] == "--local-pilot":
        payload = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        output = Path(sys.argv[3])
        output.mkdir(parents=True, exist_ok=True)

        class LocalDB:
            def rest(self, method, path, *, params=None):
                if path != "ai_factory_voices":
                    raise ValueError(path)
                return [{"id": voice, "pace": 1.0} for voice in ["bf_emma", "bm_george", "af_heart", "am_michael"]]

            def upload(self, path, data):
                (output / "pilot-part3.mp3").write_bytes(data)

            def insert(self, table, rows):
                (output / f"{table}.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")

            def update(self, job, token, patch):
                (output / "job-result.json").write_text(json.dumps(patch, indent=2), encoding="utf-8")

        job = {"id": str(uuid.uuid4()), "payload": payload}
        render_job(LocalDB(), KokoroProvider(), job, "local")
        print(json.dumps({"audio": str(output / "pilot-part3.mp3"), "status": "awaiting_human_review"}), flush=True)
        return
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db = Supabase(url, key)
    provider: AudioProvider | None = None
    while True:
        token = str(uuid.uuid4())
        try:
            if provider is None:
                provider = KokoroProvider()
            job = db.claim(token)
            if not job:
                time.sleep(5)
                continue
            render_job(db, provider, job, token)
            print(json.dumps({"job": job["id"], "status": "awaiting_review"}), flush=True)
        except KeyboardInterrupt:
            return
        except Exception as exc:
            if "job" in locals() and job:
                try:
                    db.update(job, token, {"status": "qa_failed" if isinstance(exc, ValueError) else "failed", "error": str(exc)[:1000], "lease_token": None, "lease_until": None})
                except Exception:
                    pass
            print(json.dumps({"error": str(exc)[:300]}), flush=True)
            time.sleep(10)
        finally:
            job = None


if __name__ == "__main__":
    main()
