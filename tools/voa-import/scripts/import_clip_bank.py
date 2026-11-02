"""Upload verified source-paired clips to R2 and generate an idempotent SQL seed.

The input is an official FSDD checkout or a JSONL manifest with local_path,
bank, source_id, title, transcript, source_url, source_dataset, license_url,
and attribution. Run without --execute to check size and metadata first.
"""
import argparse
import hashlib
import json
import uuid
import wave
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from mutagen.flac import FLAC

MIB = 1024 * 1024
CAP_BYTES = 4500 * MIB


def env_file(path):
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"')
    return values


def file_meta(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(MIB), b""):
            digest.update(block)
    if path.suffix == ".wav":
        with wave.open(str(path)) as audio:
            if audio.getnchannels() != 1 or audio.getframerate() < 8000:
                raise ValueError(f"Invalid WAV: {path.name}")
            duration_ms = round(audio.getnframes() * 1000 / audio.getframerate())
    elif path.suffix == ".flac":
        audio = FLAC(path)
        if audio.info.channels != 1 or audio.info.sample_rate < 8000:
            raise ValueError(f"Invalid FLAC: {path.name}")
        duration_ms = round(audio.info.length * 1000)
    else:
        raise ValueError(f"Unsupported audio format: {path.suffix}")
    if not 100 <= duration_ms <= 30000:
        raise ValueError(f"Clip duration out of bounds: {path.name}")
    return digest.hexdigest(), path.stat().st_size, duration_ms


def fsdd_manifest(root):
    repo = root / "recordings"
    if not (root / "README.md").exists() or not repo.exists():
        raise ValueError("Expected official FSDD v1.0.10 checkout")
    chosen = []
    for digit in range(10):
        files = sorted(repo.glob(f"{digit}_*_*.wav"))
        speakers = sorted({f.name.split("_")[1] for f in files})
        picks = []
        for index in range(2):
            for speaker in speakers:
                candidate = repo / f"{digit}_{speaker}_{index}.wav"
                if candidate.exists():
                    picks.append(candidate)
        if len(picks) < 10:
            raise ValueError(f"Missing digit recordings: {digit}")
        chosen.extend(picks[:10])
    for number, path in enumerate(chosen, 1):
        speaker = path.name.split("_")[1]
        yield {
            "local_path": str(path), "bank": "numbers",
            "source_id": "fsdd:v1.0.10:" + path.stem,
            "title": f"Clip {number:03d} · {speaker}",
            "transcript": path.name.split("_")[0],
            "source_url": "https://github.com/Jakobovski/free-spoken-digit-dataset/tree/v1.0.10",
            "source_dataset": "Free Spoken Digit Dataset v1.0.10",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
            "attribution": f"Free Spoken Digit Dataset · {speaker} · CC BY-SA 4.0",
        }


def bucket_usage(s3, bucket):
    total = count = 0
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for item in page.get("Contents", []):
            total += item["Size"]
            count += 1
    return total, count


def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def sql_for(rows):
    lines = ["-- Source-paired audio clips. Counts come from these inserted rows, not targets."]
    for row in rows:
        clip = row["clip"]
        fields = list(clip)
        values = ",".join(sql_literal(clip[field]) if not isinstance(clip[field], int) else str(clip[field]) for field in fields)
        lines.append("insert into public.dictation_clips (" + ",".join(fields) + ") values (" + values + ") on conflict (source_id) do nothing;")
        lines.append("insert into public.dictation_clip_answers(clip_id,reference_text) values (" +
                     sql_literal(clip["id"]) + "," + sql_literal(row["transcript"]) + ") on conflict (clip_id) do nothing;")
    checks = ",".join("(" + sql_literal(row["clip"]["source_id"]) + "," + sql_literal(row["clip"]["audio_sha256"]) + ")" for row in rows)
    lines.append("do $$ begin if (select count(*) from (values " + checks +
                 ") expected(source_id,sha) join public.dictation_clips c on c.source_id=expected.source_id and c.audio_sha256=expected.sha " +
                 "join public.dictation_clip_answers a on a.clip_id=c.id) <> " + str(len(rows)) +
                 " then raise exception 'Dictation clip seed mismatch'; end if; end $$;")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["fsdd", "manifest"], required=True)
    parser.add_argument("--dataset-path", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--r2-env", type=Path, required=True)
    parser.add_argument("--sql-output", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if args.source == "fsdd":
        if not args.dataset_path:
            parser.error("--dataset-path required for FSDD")
        items = list(fsdd_manifest(args.dataset_path))
    else:
        if not args.manifest:
            parser.error("--manifest required")
        items = [json.loads(line) for line in args.manifest.read_text(encoding="utf-8").splitlines() if line]
    if not items or len({item["source_id"] for item in items}) != len(items):
        raise ValueError("Empty or duplicate source IDs in manifest")
    r2 = env_file(args.r2_env)
    s3 = boto3.client("s3", endpoint_url="https://" + r2["CLOUDFLARE_ACCOUNT_ID"] + ".r2.cloudflarestorage.com",
                      aws_access_key_id=r2["R2_ACCESS_KEY_ID"], aws_secret_access_key=r2["R2_SECRET_ACCESS_KEY"],
                      region_name="auto")
    bucket = r2["R2_BUCKET"]
    used, count = bucket_usage(s3, bucket)
    rows = []
    added = reused = 0
    print(f"clips={len(items)} bucket_objects={count} bucket_mib={used / MIB:.1f} cap_mib={CAP_BYTES / MIB:.0f} execute={args.execute}", flush=True)
    for item in items:
        if item["bank"] not in ("quick", "numbers") or not item["transcript"].strip() or len(item["transcript"]) > 800:
            raise ValueError("Invalid manifest row")
        path = Path(item["local_path"])
        sha, size, duration = file_meta(path)
        object_key = f"dictation/clips/{item['bank']}/{sha}{path.suffix}"
        if args.execute:
            try:
                head = s3.head_object(Bucket=bucket, Key=object_key)
                if head["ContentLength"] != size:
                    raise ValueError("R2 object size mismatch: " + object_key)
                reused += 1
            except ClientError as error:
                if error.response["Error"]["Code"] not in ("404", "NoSuchKey"):
                    raise
                if used + size > CAP_BYTES:
                    raise ValueError("R2 storage cap reached before " + item["source_id"])
                s3.upload_file(str(path), bucket, object_key, ExtraArgs={
                    "ContentType": "audio/wav" if path.suffix == ".wav" else "audio/flac",
                    "CacheControl": "public, max-age=31536000, immutable", "Metadata": {"sha256": sha}})
                head = s3.head_object(Bucket=bucket, Key=object_key)
                if head["ContentLength"] != size:
                    raise ValueError("R2 verification failed: " + object_key)
                used += size
                added += 1
        else:
            if used + size > CAP_BYTES:
                raise ValueError("R2 storage cap would be exceeded")
            used += size
        clip = {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, "dictation:" + item["source_id"]))}
        clip.update({key: item[key] for key in ("bank", "source_id", "title", "source_url", "source_dataset", "license_url", "attribution")})
        clip.update({"audio_object_key": object_key, "audio_sha256": sha, "audio_bytes": size,
                     "duration_ms": duration, "status": "preview", "qa_note": "Source-paired clip; listening QA pending"})
        rows.append({"clip": clip, "transcript": item["transcript"].strip()})
        if args.execute and (added + reused) % 25 == 0:
            print(f"processed={added + reused} uploaded={added} reused={reused}", flush=True)
    if args.execute:
        args.sql_output.parent.mkdir(parents=True, exist_ok=True)
        args.sql_output.write_text(sql_for(rows), encoding="utf-8")
    print(f"done clips={len(rows)} uploaded={added} reused={reused} projected_bucket_mib={used / MIB:.1f} sql_written={args.execute}", flush=True)


if __name__ == "__main__":
    main()
