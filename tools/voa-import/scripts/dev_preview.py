#!/usr/bin/env python3
"""Bounded, resumable VOA audio staging for the isolated learner Preview.

This path does not claim human review or set review flags. It only accepts the
official Level 1/2 conversation MP3s already in the local discovery queue.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from voa_ingest.db import connect
from voa_ingest.fetch import ImportBlocked, PoliteClient
from voa_ingest.parser import valid_mp3_url
from voa_ingest.pipeline import looks_like_mp3

BUCKET = "ieltswithharry-voa-dev"
GROUPS = ("Lets Learn English Level 1", "Lets Learn English Level 2")
MIB = 1024 * 1024


def settings():
    values = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value.strip()
    if values.get("R2_BUCKET") != BUCKET:
        raise SystemExit("Refusing non-development R2 bucket")
    return values


def eligible(row):
    return (row["source_group"] in GROUPS and row["content_kind"] == "conversation"
            and not row["third_party_warning"] and len(row["transcript_candidate"].strip()) >= 30
            and bool(valid_mp3_url(row["audio_url"], row["url"])))


def audio_length_ms(path):
    duration = float(MP3(path).info.length)
    if not 5 <= duration <= 3600:
        raise ValueError("Unexpected MP3 duration")
    return round(duration * 1000)


def download(con, cfg, total_cap_mib):
    contact = cfg.get("ESL_IMPORT_CONTACT_EMAIL", "")
    client = PoliteClient(contact)
    media = ROOT / "data" / "media"
    media.mkdir(parents=True, exist_ok=True)
    cap = total_cap_mib * MIB
    used = con.execute("SELECT COALESCE(SUM(media_bytes),0) FROM articles WHERE status IN ('downloaded','uploaded')").fetchone()[0]
    count = skipped = 0
    for row in con.execute("SELECT * FROM articles WHERE status='needs_review' ORDER BY id").fetchall():
        if not eligible(row):
            skipped += 1
            continue
        if used >= cap:
            print("STOP: local media cap reached")
            break
        if shutil.disk_usage(media).free < 50 * MIB + min(15 * MIB, cap - used):
            print("STOP: disk space safety floor reached")
            break
        try:
            response = client.fetch(row["audio_url"], stream=True)
        except ImportBlocked as error:
            if not str(error).startswith("Network failure:"):
                raise
            print(f"SKIP #{row['id']}: transient source network failure", flush=True)
            skipped += 1
            continue
        target = media / f"voa_{row['id']:07d}.mp3"
        temporary = target.with_suffix(".mp3.part")
        digest = hashlib.sha256()
        size = 0
        try:
            if "text/html" in response.headers.get("Content-Type", "").lower():
                raise ValueError("MP3 endpoint returned HTML")
            with temporary.open("wb") as file:
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > 15 * MIB or used + size > cap:
                        raise ValueError("MP3 exceeds per-file or total cap")
                    digest.update(chunk)
                    file.write(chunk)
            if size < 2000 or not looks_like_mp3(temporary):
                raise ValueError("Invalid MP3 signature")
            audio_length_ms(temporary)
            os.replace(temporary, target)
            con.execute("UPDATE articles SET local_audio_path=?,media_bytes=?,media_sha256=?,status='downloaded',updated_at=CURRENT_TIMESTAMP WHERE id=?",
                        (str(target), size, digest.hexdigest(), row["id"]))
            con.commit()
            used += size
            count += 1
            if count % 10 == 0:
                print(f"Downloaded {count} MP3s ({used / MIB:.1f} MiB staged)", flush=True)
        except (OSError, ValueError) as error:
            temporary.unlink(missing_ok=True)
            print(f"SKIP #{row['id']}: {error}", flush=True)
            skipped += 1
        finally:
            response.close()
    print(f"DOWNLOAD: completed={count}, skipped={skipped}, staged_mib={used / MIB:.2f}")


def bucket_usage(client):
    return sum(int(item["Size"]) for page in client.get_paginator("list_objects_v2").paginate(Bucket=BUCKET)
               for item in page.get("Contents", []))


def upload(con, cfg, bucket_cap_mib):
    account = cfg.get("CLOUDFLARE_ACCOUNT_ID")
    access = cfg.get("R2_ACCESS_KEY_ID")
    secret = cfg.get("R2_SECRET_ACCESS_KEY")
    if not account or not access or not secret:
        raise SystemExit("R2 credentials missing from local .env")
    client = boto3.client("s3", endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                          region_name="auto", aws_access_key_id=access, aws_secret_access_key=secret)
    used = bucket_usage(client)
    cap = bucket_cap_mib * MIB
    if used >= cap:
        raise SystemExit("STOP: R2 bucket cap reached")
    count = reused = skipped = 0
    for row in con.execute("SELECT * FROM articles WHERE status='downloaded' ORDER BY id").fetchall():
        if not eligible(row):
            skipped += 1
            continue
        path = Path(row["local_audio_path"])
        if not path.is_file() or path.stat().st_size != row["media_bytes"]:
            print(f"SKIP #{row['id']}: local MP3 missing or size changed")
            skipped += 1
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != row["media_sha256"]:
            print(f"SKIP #{row['id']}: SHA256 changed")
            skipped += 1
            continue
        try:
            audio_length_ms(path)
        except ValueError as error:
            print(f"SKIP #{row['id']}: {error}")
            skipped += 1
            continue
        key = f"dictation/voa/{digest}.mp3"
        try:
            head = client.head_object(Bucket=BUCKET, Key=key)
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
                raise
            head = None
        if head is None:
            if used + row["media_bytes"] > cap:
                print("STOP: next MP3 would exceed R2 cap")
                break
            client.upload_file(str(path), BUCKET, key,
                               ExtraArgs={"ContentType": "audio/mpeg", "Metadata": {"sha256": digest}})
            used += row["media_bytes"]
            count += 1
        else:
            reused += 1
        head = client.head_object(Bucket=BUCKET, Key=key)
        if int(head["ContentLength"]) != row["media_bytes"] or head.get("Metadata", {}).get("sha256") != digest:
            raise SystemExit(f"STOP: R2 verification failed for #{row['id']}")
        con.execute("UPDATE articles SET r2_key=?,status='uploaded',updated_at=CURRENT_TIMESTAMP WHERE id=?", (key, row["id"]))
        con.commit()
        if (count + reused) % 10 == 0:
            print(f"R2 ready: {count + reused} MP3s ({used / MIB:.1f} MiB in bucket)", flush=True)
    print(f"UPLOAD: new={count}, reused={reused}, skipped={skipped}, bucket_mib={used / MIB:.2f}")


def segments_for(transcript, duration_ms):
    parts = []
    for line in transcript.splitlines():
        line = line.strip()
        if not line:
            continue
        for piece in re.split(r"(?<=\s)(?=[A-Z][A-Za-z .'-]{1,30}:\s)", line):
            piece = piece.strip()
            match = re.match(r"^([A-Za-z][A-Za-z .'-]{0,40}):\s*(.*)$", piece)
            speaker, speech = (match.group(1), match.group(2)) if match else ("", piece)
            if not speech or (speech.startswith("(") and speech.endswith(")")):
                continue
            words = speech.split()
            chunk = []
            for word in words:
                if len(word) > 800:
                    raise ValueError("Transcript contains an oversized word")
                if chunk and (len(chunk) >= 80 or len(" ".join((*chunk, word))) > 800):
                    parts.append((speaker, " ".join(chunk)))
                    chunk = []
                chunk.append(word)
            if chunk:
                parts.append((speaker, " ".join(chunk)))
    if not parts or len(parts) > 3000 or duration_ms < len(parts) * 500:
        raise ValueError("Transcript cannot be divided into timed test segments")
    weights = [max(3, len(re.findall(r"\b\w+\b", text))) for _, text in parts]
    total = sum(weights)
    cursor = 0
    result = []
    for ordinal, ((speaker, text), weight) in enumerate(zip(parts, weights), start=1):
        end = duration_ms if ordinal == len(parts) else round(duration_ms * (cursor + weight) / total)
        start_ms = result[-1]["end_ms"] if result else 0
        if end <= start_ms:
            raise ValueError("Non-increasing timed segment")
        result.append({"ordinal": ordinal, "start_ms": start_ms, "end_ms": end,
                       "reference_text": text, "speaker": speaker})
        cursor += weight
    return result


def export(con, output):
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with target.open("w", encoding="utf-8") as file:
        for row in con.execute("SELECT * FROM articles WHERE status='uploaded' ORDER BY id"):
            if not eligible(row) or not re.fullmatch(r"dictation/voa/[0-9a-f]{64}\.mp3", row["r2_key"]):
                continue
            duration = audio_length_ms(Path(row["local_audio_path"]))
            payload = {key: row[key] for key in ("id", "url", "title", "source_group", "published",
                                                 "audio_url", "transcript_candidate", "media_sha256",
                                                 "media_bytes", "r2_key")}
            payload["duration_ms"] = duration
            payload["segments"] = segments_for(row["transcript_candidate"], duration)
            file.write(json.dumps(payload, ensure_ascii=False) + "\n")
            count += 1
    print(f"EXPORT: {count} unreviewed dev Preview lessons -> {target}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("download", "upload", "export"))
    parser.add_argument("--max-total-mib", type=int, default=256)
    parser.add_argument("--max-r2-mib", type=int, default=512)
    parser.add_argument("--output", default="data/export_dev_preview.jsonl")
    args = parser.parse_args()
    if not 1 <= args.max_total_mib <= 512 or not 1 <= args.max_r2_mib <= 512:
        parser.error("Development caps must be between 1 and 512 MiB")
    cfg = settings()
    con = connect("data/voa_ingest.sqlite")
    try:
        if args.command == "download":
            download(con, cfg, args.max_total_mib)
        elif args.command == "upload":
            upload(con, cfg, args.max_r2_mib)
        else:
            export(con, args.output)
    finally:
        con.close()


if __name__ == "__main__":
    main()
