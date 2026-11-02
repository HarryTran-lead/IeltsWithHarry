"""Stream paired public-domain LJ Speech clips into a Quick Dictation manifest."""
import argparse
import json
import tarfile
import wave
from pathlib import Path

import requests

SOURCE = "https://data.keithito.com/data/speech/LJSpeech-1.1.tar.bz2"
SOURCE_PAGE = "https://keithito.com/LJ-Speech-Dataset/"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--count", type=int, default=200)
    args = parser.parse_args()
    if not 1 <= args.count <= 500:
        parser.error("count must be 1..500")
    folder = args.output.parent / "ljspeech_quick"
    folder.mkdir(parents=True, exist_ok=True)
    records = []
    metadata = {}
    with requests.get(SOURCE, stream=True, timeout=90) as response:
        response.raise_for_status()
        response.raw.decode_content = True  # The source sends a gzipped bzip2 archive.
        with tarfile.open(fileobj=response.raw, mode="r|bz2") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                name = Path(member.name).name
                if name == "metadata.csv":
                    content = archive.extractfile(member).read().decode("utf-8")
                    for line in content.splitlines():
                        fields = line.split("|", 2)
                        if len(fields) == 3:
                            metadata[fields[0]] = fields[2].strip()
                    continue
                if not name.endswith(".wav"):
                    continue
                stem = name.removesuffix(".wav")
                transcript = metadata.get(stem, "")
                if not (3 <= len(transcript.split()) <= 35 and len(transcript) <= 800):
                    continue
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
                if not valid:
                    path.unlink()
                    continue
                records.append({
                    "local_path": str(path), "bank": "quick",
                    "source_id": f"ljspeech:1.1:{stem}",
                    "title": f"Clip {len(records) + 1:03d} · LJ Speech",
                    "transcript": transcript,
                    "source_url": SOURCE_PAGE,
                    "source_dataset": "LJ Speech 1.1",
                    "license_url": SOURCE_PAGE,
                    "attribution": "LJ Speech Dataset · public domain",
                })
                if len(records) >= args.count:
                    break
    if len(records) < args.count:
        raise RuntimeError(f"Only {len(records)} paired clips found; expected {args.count}")
    args.output.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in records) + "\n", encoding="utf-8")
    print(f"paired_clips={len(records)} manifest={args.output}")


if __name__ == "__main__":
    main()
