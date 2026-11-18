"""Transcribe one private Part 2 recording on the worker host; emit JSON only."""
import json
import os
import sys


def main() -> None:
    if len(sys.argv) != 2:
        raise ValueError("A recording path is required")
    import av
    from faster_whisper import WhisperModel

    audio_path = sys.argv[1]
    with av.open(audio_path) as container:
        stream = next((item for item in container.streams if item.type == "audio"), None)
        if stream is None:
            raise ValueError("SPEAKING_AUDIO_DURATION_INVALID")
        if container.duration is not None:
            duration = float(container.duration) / av.time_base
        elif stream.duration is not None:
            duration = float(stream.duration * stream.time_base)
        else:
            # Browser WebM recordings can omit duration metadata.
            duration = sum(frame.samples / frame.sample_rate for frame in container.decode(stream))
    if duration < 5 or duration > 130:
        raise ValueError("SPEAKING_AUDIO_DURATION_INVALID")
    model_path = os.environ.get("SPEAKING_ASR_MODEL_PATH", "")
    if not os.path.isdir(model_path):
        raise ValueError("SPEAKING_ASR_MODEL_NOT_INSTALLED")
    model = WhisperModel(model_path, device="cpu", compute_type="int8", cpu_threads=2, num_workers=1)
    segments, _ = model.transcribe(audio_path, language="en", beam_size=1, word_timestamps=True,
                                    vad_filter=True, condition_on_previous_text=False)
    words = []
    text = []
    for segment in segments:
        text.append(segment.text.strip())
        for word in segment.words or []:
            if word.start is not None and word.end is not None:
                words.append({"word": word.word, "start": round(word.start, 2), "end": round(word.end, 2)})
    result = {"text": " ".join(text).strip(), "duration_seconds": duration,
              "words": words, "asr_model": os.environ.get("SPEAKING_ASR_MODEL_ID", "base.en")}
    if len(result["text"].split()) < 8:
        raise ValueError("SPEAKING_TRANSCRIPT_TOO_SHORT")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Never print paths, audio bytes, or transcript fragments to worker logs.
        message = str(exc)
        print(message if message in {"SPEAKING_AUDIO_DURATION_INVALID", "SPEAKING_TRANSCRIPT_TOO_SHORT", "SPEAKING_ASR_MODEL_NOT_INSTALLED"}
              else "SPEAKING_ASR_FAILED", file=sys.stderr)
        sys.exit(1)
