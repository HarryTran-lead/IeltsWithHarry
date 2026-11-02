"""Stream a small, source-paired LibriTTS sample into the Quick Dictation manifest."""
import argparse
import json
import tarfile
import wave
from pathlib import Path

import requests

SOURCE = "https://www.openslr.org/resources/60/dev-clean.tar.gz"
SOURCE_PAGE = "https://www.openslr.org/60/"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--count", type=int, default=600)
    args = parser.parse_args()
    if not 1 <= args.count <= 800:
        parser.error("count must be 1..800")
    folder = args.output.parent / "libritts_quick"
    folder.mkdir(parents=True, exist_ok=True)
    transcripts = {}
    pending_audio = {}
    ready = {}
    with requests.get(SOURCE, stream=True, timeout=90) as response:
        response.raise_for_status()
        response.raw.decode_content = False
        with tarfile.open(fileobj=response.raw, mode="r|gz") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                name = Path(member.name).name
                if name.endswith(".normalized.txt"):
                    stem = name.removesuffix(".normalized.txt")
                    content = archive.extractfile(member).read().decode("utf-8").strip()
                    if 3 <= len(content.split()) <= 35 and len(content) <= 800:
                        transcripts[stem] = content
                elif name.endswith(".wav"):
                    stem = name.removesuffix(".wav")
                    path = folder / name
                    with path.open("wb") as destination:
                        source = archive.extractfile(member)
                        for block in iter(lambda: source.read(1024 * 1024), b""):
                            destination.write(block)
                    try:
                        with wave.open(str(path)) as audio:
                            duration = audio.getnframes() / audio.getframerate()
                            valid = audio.getnchannels() == 1 and 0.1 <= duration <= 30
                    except (ValueError, wave.Error):
                        valid = False
                    if valid:
                        pending_audio[stem] = path
                    else:
                        path.unlink()
                stem = name.split(".")[0]
                if stem in transcripts and stem in pending_audio and stem not in ready:
                    ready[stem] = (pending_audio.pop(stem), transcripts.pop(stem))
                if len(ready) >= args.count:
                    break
    records = []
    for number, (stem, (path, transcript)) in enumerate(ready.items(), 1):
        speaker = stem.split("_")[0]
        records.append({
            "local_path": str(path), "bank": "quick",
            "source_id": f"libritts:dev-clean:{stem}",
            "title": f"Clip {number:03d} · voice {speaker}",
            "transcript": transcript,
            "source_url": SOURCE_PAGE,
            "source_dataset": "LibriTTS dev-clean",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "attribution": f"LibriTTS · speaker {speaker} · CC BY 4.0",
        })
    for path in pending_audio.values():
        path.unlink(missing_ok=True)
    if len(records) < args.count:
        raise RuntimeError(f"Only {len(records)} paired clips found; expected {args.count}")
    args.output.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in records) + "\n", encoding="utf-8")
    print(f"paired_clips={len(records)} manifest={args.output}")


if __name__ == "__main__":
    main()
