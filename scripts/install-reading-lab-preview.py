"""Extract the S04.1 Reading candidate into a private local preview directory.

Only the known S03 JSON records and raster assets are copied. No archive path is
used as an output path, and nothing is written inside the application repository.
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path


def install(source: Path, destination: Path) -> None:
    with zipfile.ZipFile(source) as outer:
        with zipfile.ZipFile(io.BytesIO(outer.read("S041_FULL_PRIVATE/parent/IELTS_Reading_Codex_Staging_S04_FULL_PRIVATE_Handoff.zip"))) as s04:
            with zipfile.ZipFile(io.BytesIO(s04.read("S04_FULL_PRIVATE/parent/IELTS_Reading_Codex_Staging_S03_FULL_PRIVATE_Handoff.zip"))) as s03:
                if destination.resolve().is_relative_to(Path(__file__).resolve().parents[1]):
                    raise ValueError("Private Reading data must stay outside the repository")
                counts = {"private": 0, "learner": 0, "offsets": 0, "assets": 0}
                for number in range(2, 38):
                    milestone = f"M08_{number:02d}"
                    for kind, suffix in (("private", "CANDIDATE_PRIVATE_S03"), ("learner", "CANDIDATE_LEARNER_S03"), ("offsets", "EVIDENCE_OFFSETS_S03")):
                        filename = f"{milestone}_{suffix}.json"
                        data = s03.read(f"S03_FULL_PRIVATE/data/{kind}/{filename}")
                        json.loads(data)
                        target = destination / kind / filename
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(data)
                        counts[kind] += 1
                with zipfile.ZipFile(io.BytesIO(s03.read("S03_FULL_PRIVATE/parent/IELTS_Reading_M08_38_Final_Audit_Codex_LEARNER_SAFE.zip"))) as safe:
                    prefix = "M08_38_Final_Handoff/assets/"
                    for name in safe.namelist():
                        if not name.startswith(prefix) or not name.lower().endswith((".png", ".jpg")):
                            continue
                        relative = Path(name.removeprefix(prefix))
                        if len(relative.parts) != 2 or not relative.parts[0].startswith("M08_"):
                            raise ValueError(f"Unexpected asset path: {name}")
                        target = destination / "assets" / relative
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(safe.read(name))
                        counts["assets"] += 1
    print(json.dumps({"destination": str(destination), "counts": counts}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python scripts/install-reading-lab-preview.py S041_FULL_PRIVATE.zip OUTSIDE_REPO_DIRECTORY")
    install(Path(sys.argv[1]), Path(sys.argv[2]))
