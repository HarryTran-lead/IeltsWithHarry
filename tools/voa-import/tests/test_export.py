from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from voa_ingest.db import connect
from voa_ingest.pipeline import export_staging


def test_only_uploaded_verified_media_exports_without_local_copy(tmp_path):
    con = connect(str(tmp_path / "queue.sqlite"))
    digest = "a" * 64
    for status in ("downloaded", "uploaded"):
        con.execute("""insert into articles(url,title,status,rights_verified,transcript_verified,
            media_verified,media_sha256,media_bytes,r2_key,transcript_candidate)
            values(?,?,?,1,1,1,?,?,?,?)""", (
            f"https://learningenglish.voanews.com/a/{status}/1234.html", "VOA sample", status,
            digest, 12000, f"dictation/voa/{digest}.mp3", "The approved human transcript."
        ))
    con.commit()
    output = tmp_path / "export.jsonl"
    assert export_staging(con, str(output)) == 1
    row = json.loads(output.read_text(encoding="utf-8"))
    assert row["r2_key"] == f"dictation/voa/{digest}.mp3"
    assert "local_audio_path" not in row
    con.close()
