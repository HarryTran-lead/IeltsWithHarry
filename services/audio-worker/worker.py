"""Private, service-role-only Gemini-first audio worker. No inbound HTTP endpoint."""
from __future__ import annotations

import base64
import hashlib
import io
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
QUESTION_PREVIEW_SECONDS = 30
PART_REVIEW_SECONDS = 20
FINAL_REVIEW_SECONDS = 120
# "Approximately 30 minutes" is a range, not a target filled with artificial silence.
FULL_MIN_SECONDS = 25 * 60
FULL_MAX_SECONDS = 35 * 60
MODEL_ID = os.getenv("KOKORO_MODEL_ID", "hexgrad/Kokoro-82M")
GEMINI_TTS_MODEL = "gemini-3.8-flash-tts"
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
    provider_name = "kokoro"
    model_id = MODEL_ID
    model_sha256 = MODEL_SHA256
    cache_version = MODEL_SHA256

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


class GeminiUnavailable(RuntimeError):
    """Gemini cannot supply a complete audio draft; Kokoro may replace the draft."""


class GeminiProvider:
    provider_name = "gemini"
    model_id = GEMINI_TTS_MODEL
    model_sha256 = None
    cache_version = f"{GEMINI_TTS_MODEL}:ielts-voice-map-v1"
    # Existing voice IDs remain stable in scripts and answer-alignment records.
    voices = {"bf_emma": "Kore", "bm_george": "Charon", "af_heart": "Aoede", "am_michael": "Puck"}

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise GeminiUnavailable("Gemini Free API key is missing")
        self.api_key = api_key
        self.session = requests.Session()

    def list_voices(self) -> list[str]:
        return list(self.voices)

    def capabilities(self) -> dict:
        return {"languages": ["en"], "sample_rate": SAMPLE_RATE, "multi_speaker": True}

    def health(self) -> dict:
        return {"ready": True, "provider": self.provider_name, "model": self.model_id}

    def estimate_usage(self, text: str) -> dict:
        return {"characters": len(text), "estimated_usd": 0}

    def synthesize_segment(self, text: str, voice: str, pace: float) -> np.ndarray:
        if voice not in self.voices:
            raise ValueError(f"Unsupported voice: {voice}")
        style = "Natural IELTS listening voice, clearly articulated, conversational, steady pace"
        style += ", British English accent" if voice.startswith("b") else ", American English accent"
        style += f", approximately {pace:.2f} times normal speaking speed"
        body = {
            "model": self.model_id,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                       "annotations": [{"type": "speech_metadata", "style": style}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": self.voices[voice]}]},
        }
        try:
            response = self.session.post("https://generativelanguage.googleapis.com/v1beta/interactions",
                                         json=body, headers={"x-goog-api-key": self.api_key}, timeout=90)
            if not response.ok:
                raise GeminiUnavailable(f"Gemini TTS HTTP {response.status_code}")
            payload = response.json()
            audio_data = next((item.get("data") for step in reversed(payload.get("steps", []))
                               for item in reversed(step.get("content", []))
                               if item.get("type") == "audio" and item.get("data")), None)
            if not audio_data:
                raise GeminiUnavailable("Gemini TTS returned no audio")
            encoded = base64.b64decode(audio_data, validate=True)
            if encoded.startswith(b"RIFF"):
                audio, sample_rate = sf.read(io.BytesIO(encoded), dtype="float32")
                if sample_rate != SAMPLE_RATE:
                    raise GeminiUnavailable(f"Gemini TTS sample rate {sample_rate} is unsupported")
            else:
                if len(encoded) % 2:
                    raise GeminiUnavailable("Gemini TTS returned invalid PCM")
                audio = np.frombuffer(encoded, dtype="<i2").astype(np.float32) / 32768
            if audio.ndim != 1 or len(audio) == 0 or not np.isfinite(audio).all():
                raise GeminiUnavailable("Gemini TTS returned invalid mono audio")
            return np.asarray(audio, dtype=np.float32)
        except GeminiUnavailable:
            raise
        except (requests.RequestException, ValueError, KeyError, TypeError, sf.LibsndfileError) as exc:
            raise GeminiUnavailable(f"Gemini TTS response failed: {type(exc).__name__}") from exc

    def validate_output(self, audio: np.ndarray) -> dict:
        return inspect_audio(audio, SAMPLE_RATE)


def confirmed_gemini_key() -> str | None:
    if os.getenv("AI_FACTORY_FREE_TIER_ONLY") != "true" or os.getenv("AI_FACTORY_FREE_TIER_CONFIRMED") != "true":
        return None
    return os.getenv("AI_FACTORY_GEMINI_API_KEY") or None


def normalize(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text or len(text) > 1000 or "<" in text or ">" in text:
        raise ValueError("Invalid dialogue turn")
    return text


def inspect_audio(audio: np.ndarray, sample_rate: int, planned_pauses: list[tuple[int, int]] | None = None) -> dict:
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
    tolerance = sample_rate  # TTS can leave up to one second of quiet beside an intentional pause.
    unplanned = [(start, end) for start, end in zip(starts, ends)
                 if not any(start >= pause_start - tolerance and end <= pause_end + tolerance
                            for pause_start, pause_end in (planned_pauses or []))]
    longest_unplanned = max((end - start for start, end in unplanned), default=0) / sample_rate
    passed = sample_rate == SAMPLE_RATE and 0.1 < peak < 0.995 and clipping == 0 and longest_unplanned < 3.0 and duration > 0.5
    return {"sample_rate": sample_rate, "channels": 1, "duration_seconds": round(duration, 3), "peak": round(peak, 5), "clipped_samples": clipping, "longest_silence_seconds": round(longest_silence, 3), "longest_unplanned_silence_seconds": round(longest_unplanned, 3), "passed": passed}


def cached_segment(provider: AudioProvider, text: str, voice: str, pace: float) -> tuple[np.ndarray, str]:
    canonical = normalize(text)
    cache_key = hashlib.sha256(json.dumps([getattr(provider, "cache_version", MODEL_SHA256), voice, pace, canonical], ensure_ascii=False).encode()).hexdigest()
    cache_path = CACHE_DIR / f"{cache_key}.wav"
    if cache_path.exists():
        clip, rate = sf.read(cache_path, dtype="float32")
        if rate != SAMPLE_RATE or not provider.validate_output(clip)["passed"]:
            cache_path.unlink()
            clip = provider.synthesize_segment(canonical, voice, pace)
    else:
        clip = provider.synthesize_segment(canonical, voice, pace)
    if not provider.validate_output(clip)["passed"]:
        if getattr(provider, "provider_name", "kokoro") == "gemini":
            raise GeminiUnavailable("Gemini TTS segment failed technical QA")
        raise ValueError("Technical QA failed for speech segment")
    if not cache_path.exists():
        sf.write(cache_path, clip, SAMPLE_RATE, subtype="PCM_16")
    return clip, cache_key


def part_cues(section_id: str, setting: str | None, full_test: bool) -> tuple[str, str, str, int]:
    match = re.fullmatch(r"part-([1-4])", section_id)
    if not match:
        raise ValueError(f"Invalid Listening section: {section_id}")
    part = int(match.group(1))
    labels = ("one", "two", "three", "four")
    numbers = ("one to ten", "eleven to twenty", "twenty-one to thirty", "thirty-one to forty")
    context = normalize(setting or "a conversation or talk")
    if len(context) > 240:
        raise ValueError(f"{section_id}: setting is too long")
    context = context.rstrip(". ")
    opening = "This is an original IELTS-style Listening practice test. You will hear each recording once only. " if full_test and part == 1 else ""
    before = f"{opening}Part {labels[part - 1]}. You will hear {context}. Now look at questions {numbers[part - 1]}."
    begin = f"Now listen carefully and answer questions {numbers[part - 1]}."
    if full_test and part == 4:
        after = "That is the end of the Listening practice test. You now have two minutes to check your answers."
        return before, begin, after, FINAL_REVIEW_SECONDS
    after = f"That is the end of Part {labels[part - 1]}. You now have some time to check your answers."
    return before, begin, after, PART_REVIEW_SECONDS


def full_duration_report(seconds: float) -> dict:
    return {"duration_seconds": round(seconds, 2), "minimum_seconds": FULL_MIN_SECONDS,
            "maximum_seconds": FULL_MAX_SECONDS, "passed": FULL_MIN_SECONDS <= seconds <= FULL_MAX_SECONDS}


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


def render_job(db: Supabase, provider: AudioProvider, job: dict, token: str, *, fallback_reason: str | None = None) -> None:
    started = time.perf_counter()
    payload = job["payload"]
    grouped = payload.get("sections")
    multi = grouped is not None
    if multi:
        if not isinstance(grouped, list) or len(grouped) != 4 or not all(isinstance(part, dict) for part in grouped) or [part.get("sectionId") for part in grouped] != [
            "part-1", "part-2", "part-3", "part-4"
        ]:
            raise ValueError("Full Listening audio needs four ordered sections")
        sections = grouped
    else:
        sections = [payload]
    voices = {v["id"]: v for v in db.rest("GET", "ai_factory_voices", params={"select": "*", "enabled": "eq.true"})}
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    all_segments: list[dict] = []
    paths: dict[str, str] = {}
    technical_reports: dict[str, dict] = {}
    alignment_reports: dict[str, dict] = {}
    asr_reports: dict[str, dict] = {}
    total_characters = 0
    total_seconds = 0.0
    total_bytes = 0

    for section_index, section in enumerate(sections):
        section_id = section.get("sectionId", f"part-{section_index + 1}")
        turns = section.get("turns")
        if not isinstance(turns, list) or not 2 <= len(turns) <= 100 or not 1 <= len({t.get("speaker") for t in turns}) <= 3:
            raise ValueError(f"{section_id}: script needs 2-100 turns and one to three speakers")
        voice_by_speaker: dict[str, str] = {}
        rendered: list[np.ndarray] = []
        segments: list[dict] = []
        cursor = 0
        planned_pauses: list[tuple[int, int]] = []
        timeline: dict[str, object] = {}

        def append_pause(seconds: float, label: str) -> None:
            nonlocal cursor
            start = cursor
            silence = np.zeros(round(SAMPLE_RATE * seconds), dtype=np.float32)
            rendered.append(silence)
            cursor += len(silence)
            planned_pauses.append((start, cursor))
            timeline[label] = {"start_ms": round(start * 1000 / SAMPLE_RATE),
                               "end_ms": round(cursor * 1000 / SAMPLE_RATE), "seconds": seconds}

        before, begin, after, review_seconds = part_cues(section_id, section.get("setting"), multi)
        narrator_voice = "bf_emma" if "bf_emma" in voices and "bf_emma" in provider.list_voices() else next(
            (voice for voice in provider.list_voices() if voice in voices), None)
        if narrator_voice is None:
            raise ValueError("No enabled narrator voice")
        narrator_pace = float(voices[narrator_voice]["pace"])
        intro, _ = cached_segment(provider, before, narrator_voice, narrator_pace)
        rendered.append(intro)
        cursor += len(intro)
        timeline["introduction"] = {"text": before, "start_ms": 0, "end_ms": round(cursor * 1000 / SAMPLE_RATE)}
        append_pause(QUESTION_PREVIEW_SECONDS, "question_preview")
        begin_start = cursor
        begin_clip, _ = cached_segment(provider, begin, narrator_voice, narrator_pace)
        rendered.append(begin_clip)
        cursor += len(begin_clip)
        timeline["start_cue"] = {"text": begin, "start_ms": round(begin_start * 1000 / SAMPLE_RATE),
                                 "end_ms": round(cursor * 1000 / SAMPLE_RATE)}

        for ordinal, turn in enumerate(turns):
            db.update(job, token, {"lease_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()})
            if turn.get("ordinal") != ordinal:
                raise ValueError(f"{section_id}: missing or reordered dialogue turn")
            speaker, voice = turn["speaker"], turn["voice"]
            if voice not in voices or voice not in provider.list_voices():
                raise ValueError(f"Voice {voice} is not enabled")
            if speaker in voice_by_speaker and voice_by_speaker[speaker] != voice:
                raise ValueError(f"{section_id}: speaker voice changed")
            voice_by_speaker[speaker] = voice
            canonical = normalize(turn["text"])
            pace = float(voices[voice]["pace"])
            clip, cache_key = cached_segment(provider, canonical, voice, pace)
            start = cursor
            rendered.append(clip)
            cursor += len(clip)
            segments.append({"job_id": job["id"], "ordinal": len(all_segments) + ordinal, "speaker_id": speaker, "voice_id": voice,
                             "pace": pace, "canonical_text": canonical, "normalized_text": canonical, "cache_key": cache_key,
                             "start_ms": round(start * 1000 / SAMPLE_RATE), "end_ms": round(cursor * 1000 / SAMPLE_RATE)})
            pause = np.zeros(int(SAMPLE_RATE * (0.42 if canonical.endswith(("?", "!")) else 0.32)), dtype=np.float32)
            rendered.append(pause)
            cursor += len(pause)
        timeline["dialogue"] = {"start_ms": segments[0]["start_ms"], "end_ms": segments[-1]["end_ms"]}
        outro_start = cursor
        outro, _ = cached_segment(provider, after, narrator_voice, narrator_pace)
        rendered.append(outro)
        cursor += len(outro)
        timeline["closing"] = {"text": after, "start_ms": round(outro_start * 1000 / SAMPLE_RATE),
                               "end_ms": round(cursor * 1000 / SAMPLE_RATE)}
        append_pause(review_seconds, "answer_review")
        audio = np.concatenate(rendered)
        peak = float(np.max(np.abs(audio)))
        if peak > 0:
            audio *= min(0.92 / peak, 1.6)
        technical = inspect_audio(audio, SAMPLE_RATE, planned_pauses)
        technical.update({"expected_turns": len(turns), "actual_turns": len(segments),
                          "model_sha256": getattr(provider, "model_sha256", MODEL_SHA256),
                          "timeline": timeline})
        evidence = section.get("evidence", {})
        alignment = {key: {"turns": value, "intervals_ms": [[segments[i]["start_ms"], segments[i]["end_ms"]] for i in value]}
                     for key, value in evidence.items()
                     if isinstance(value, list) and all(isinstance(i, int) and 0 <= i < len(segments) for i in value)}
        alignment_passed = len(alignment) == 10 and all(value["intervals_ms"] for value in alignment.values())
        if not technical["passed"] or not alignment_passed:
            raise ValueError(f"{section_id}: final technical or answer alignment QA failed")
        with tempfile.TemporaryDirectory() as temp:
            wav = Path(temp) / "audio.wav"
            mp3 = Path(temp) / "audio.mp3"
            sf.write(wav, audio, SAMPLE_RATE, subtype="PCM_16")
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                            "-codec:a", "libmp3lame", "-q:a", "4", str(mp3)], check=True, timeout=180)
            decoded_pcm = Path(temp) / "decoded.pcm"
            decoded = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(mp3), "-f", "s16le",
                                      "-ac", "1", "-ar", str(SAMPLE_RATE), str(decoded_pcm)], capture_output=True, timeout=120)
            if decoded.returncode != 0 or mp3.stat().st_size < 1000 or mp3.stat().st_size > 20_000_000:
                raise ValueError(f"{section_id}: final MP3 cannot be decoded or exceeds storage limit")
            encoded_seconds = decoded_pcm.stat().st_size / (2 * SAMPLE_RATE)
            if abs(encoded_seconds - technical["duration_seconds"]) > 1:
                raise ValueError(f"{section_id}: MP3 duration does not match rendered audio")
            technical["encoded_duration_seconds"] = round(encoded_seconds, 3)
            db.update(job, token, {"lease_until": (datetime.now(timezone.utc) + timedelta(minutes=45)).isoformat()})
            asr = asr_report(mp3, " ".join(turn["text"] for turn in turns), section.get("answerPhrases", []))
            path = f"{job['id']}/{section_id}.mp3" if multi else f"{job['id']}/audio.mp3"
            encoded = mp3.read_bytes()
            db.upload(path, encoded)
        all_segments.extend(segments)
        paths[section_id] = path
        technical_reports[section_id] = technical
        alignment_reports[section_id] = {"passed": alignment_passed, "evidence": alignment}
        asr_reports[section_id] = asr
        total_characters += sum(len(turn["text"]) for turn in turns)
        total_seconds += technical["encoded_duration_seconds"]
        total_bytes += len(encoded)

    duration_check = full_duration_report(total_seconds) if multi else None
    if duration_check and not duration_check["passed"]:
        raise ValueError(f"Full Listening audio is {round(total_seconds / 60, 1)} minutes; expected approximately 30 minutes (25–35)")
    db.insert("ai_factory_segments", all_segments)
    if multi:
        technical_result = {"passed": True, "sections": technical_reports, "full_duration": duration_check}
        alignment_result = {"passed": True, "sections": alignment_reports}
        asr_result = {"status": "review_required" if any(item.get("status") != "completed" for item in asr_reports.values()) else "completed",
                      "sections": asr_reports}
        artifact_path = json.dumps(paths)
    else:
        section_id = next(iter(paths))
        technical_result = technical_reports[section_id]
        alignment_result = alignment_reports[section_id]
        asr_result = asr_reports[section_id]
        artifact_path = paths[section_id]
    technical_result["generation"] = {
        "preferred_provider": "gemini", "actual_provider": getattr(provider, "provider_name", "kokoro"),
        "model_id": getattr(provider, "model_id", MODEL_ID),
        "needs_regeneration": getattr(provider, "provider_name", "kokoro") != "gemini",
        "fallback_reason": fallback_reason,
    }
    db.insert("ai_factory_qa", {"job_id": job["id"], "technical": technical_result,
                                "answer_alignment": alignment_result, "asr": asr_result, "passed": True})
    db.insert("ai_factory_usage", {"job_id": job["id"], "provider": getattr(provider, "provider_name", "kokoro"), "characters": total_characters,
                                   "audio_seconds": round(total_seconds, 2), "processing_seconds": round(time.perf_counter() - started, 2),
                                   "storage_bytes": total_bytes, "estimated_usd": 0, "actual_usd": 0})
    db.update(job, token, {"status": "awaiting_review", "artifact_path": artifact_path,
                           "provider": getattr(provider, "provider_name", "kokoro"),
                           "model_id": getattr(provider, "model_id", MODEL_ID),
                           "model_sha256": getattr(provider, "model_sha256", MODEL_SHA256),
                           "lease_token": None, "lease_until": None})


def render_preferred_job(db: Supabase, job: dict, token: str, kokoro: AudioProvider | None = None) -> AudioProvider | None:
    key = confirmed_gemini_key()
    fallback_reason = "Gemini Free chưa được cấu hình hoặc xác nhận"
    if key:
        try:
            gemini = GeminiProvider(key)
            render_job(db, gemini, job, token)
            return kokoro
        except GeminiUnavailable as exc:
            fallback_reason = str(exc)
            print(json.dumps({"job": job["id"], "gemini_fallback": fallback_reason}), flush=True)
    kokoro = kokoro or KokoroProvider()
    render_job(db, kokoro, job, token, fallback_reason=fallback_reason)
    return kokoro


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
    if len(sys.argv) > 2 or (len(sys.argv) == 2 and sys.argv[1] != "--once"):
        raise SystemExit("Usage: worker.py [--once | --local-pilot INPUT OUTPUT | --asr-only INPUT AUDIO]")
    once = len(sys.argv) == 2
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    db = Supabase(url, key)
    provider: AudioProvider | None = None
    while True:
        token = str(uuid.uuid4())
        job = None
        try:
            job = db.claim(token)
            if not job:
                if once:
                    print(json.dumps({"status": "idle"}), flush=True)
                    return
                time.sleep(5)
                continue
            provider = render_preferred_job(db, job, token, provider)
            print(json.dumps({"job": job["id"], "status": "awaiting_review"}), flush=True)
            if once:
                return
        except KeyboardInterrupt:
            return
        except Exception as exc:
            if job:
                try:
                    db.update(job, token, {"status": "qa_failed" if isinstance(exc, ValueError) else "failed", "error": str(exc)[:1000], "lease_token": None, "lease_until": None})
                except Exception:
                    pass
            print(json.dumps({"error": str(exc)[:300]}), flush=True)
            if once:
                raise SystemExit(1) from exc
            time.sleep(10)
        finally:
            job = None


if __name__ == "__main__":
    main()
