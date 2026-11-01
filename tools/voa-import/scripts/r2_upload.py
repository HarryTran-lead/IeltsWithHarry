#!/usr/bin/env python3
"""Idempotent, storage-bounded upload of rights-reviewed VOA audio to Cloudflare R2.

Only approved + downloaded + verified media are eligible. Checks actual bucket size via
ListObjectsV2, and refuses to upload if soft cap would be exceeded. No public publishing.
This limits stored bytes only; pricing also includes operation/request charges.
"""
from __future__ import annotations
import argparse
import hashlib
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from voa_ingest.db import connect


def client_for(account_id: str):
    return boto3.client(
        's3',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        region_name='auto',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
    )


def bucket_usage(s3, bucket: str):
    size = 0
    count = 0
    pages = s3.get_paginator('list_objects_v2').paginate(Bucket=bucket)
    for page in pages:
        for obj in page.get('Contents', []):
            size += int(obj['Size'])
            count += 1
    return size, count


def hash_file(path: Path):
    sha = hashlib.sha256()
    with path.open('rb') as fp:
        for part in iter(lambda: fp.read(1024 * 1024), b''):
            sha.update(part)
    return sha.hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--db', default='data/voa_ingest.sqlite')
    p.add_argument('--bucket', default=os.getenv('R2_BUCKET'))
    p.add_argument('--account-id', default=os.getenv('CLOUDFLARE_ACCOUNT_ID'))
    p.add_argument('--max-r2-mib', type=int, default=8000,
                   help='Absolute soft cap in MiB for all objects in this bucket')
    p.add_argument('--batch-mib', type=int, default=50,
                   help='Maximum new bytes uploaded in one execution')
    p.add_argument('--execute', action='store_true', help='Without flag, show a dry-run plan')
    p.add_argument('--purge-local-on-success', action='store_true',
                   help='Optional: remove staging MP3 only after R2 verification')
    a = p.parse_args()
    if not a.account_id or not a.bucket:
        p.error('Set CLOUDFLARE_ACCOUNT_ID and R2_BUCKET or pass explicit arguments')
    if not os.getenv('R2_ACCESS_KEY_ID') or not os.getenv('R2_SECRET_ACCESS_KEY'):
        p.error('Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY')
    if a.batch_mib <= 0 or a.max_r2_mib <= 0:
        p.error('Caps must be positive')

    s3 = client_for(a.account_id)
    used, count = bucket_usage(s3, a.bucket)
    cap = a.max_r2_mib * 1024 * 1024
    batch = a.batch_mib * 1024 * 1024
    print(f'R2 bucket {a.bucket}: {count} objects, {used:,} bytes. Soft cap {cap:,} bytes.')
    if used >= cap:
        raise SystemExit('STOP: R2 software storage cap reached. Nothing uploaded.')
    available = min(cap - used, batch)
    con = connect(a.db)
    planned_bytes = uploaded = already = skipped = 0
    try:
        sql = """SELECT * FROM articles
                 WHERE status='downloaded' AND rights_verified=1
                   AND transcript_verified=1 AND media_verified=1
                 ORDER BY id"""
        for row in con.execute(sql).fetchall():
            path = Path(row['local_audio_path'] or '')
            if not path.is_file():
                print(f"SKIP #{row['id']}: no staging audio")
                skipped += 1
                continue
            size = path.stat().st_size
            digest = row['media_sha256']
            if not digest or hash_file(path) != digest:
                print(f"SKIP #{row['id']}: SHA256 mismatch")
                skipped += 1
                continue
            key = f'dictation/voa/{digest}.mp3'
            try:
                head = s3.head_object(Bucket=a.bucket, Key=key)
            except ClientError as e:
                if e.response.get('ResponseMetadata', {}).get('HTTPStatusCode') != 404:
                    raise
                head = None
            if head is not None:
                if int(head['ContentLength']) != size or head.get('Metadata', {}).get('sha256') != digest:
                    raise SystemExit(f'STOP: existing {key} has different size or unverified SHA256 metadata')
                print(f"REUSE #{row['id']}: R2 object already exists")
                if a.execute:
                    con.execute("UPDATE articles SET r2_key=?,status='uploaded' WHERE id=?", (key, row['id']))
                    con.commit()
                    if a.purge_local_on_success:
                        path.unlink(missing_ok=True)
                already += 1
                continue
            if size > available:
                print(f"STOP BATCH: next item #{row['id']} exceeds remaining budget")
                break
            print(f"{'UPLOAD' if a.execute else 'DRY RUN'} #{row['id']}: {key} ({size:,} bytes)")
            if a.execute:
                s3.upload_file(str(path), a.bucket, key, ExtraArgs={'ContentType': 'audio/mpeg', 'CacheControl': 'public, max-age=31536000, immutable', 'Metadata': {'sha256': digest}})
                check = s3.head_object(Bucket=a.bucket, Key=key)
                if int(check['ContentLength']) != size or check.get('Metadata', {}).get('sha256') != digest:
                    raise SystemExit(f'STOP: uploaded size/SHA256 metadata check failed for {key}')
                con.execute("UPDATE articles SET r2_key=?,status='uploaded' WHERE id=?", (key, row['id']))
                con.commit()
                if a.purge_local_on_success:
                    path.unlink(missing_ok=True)
                uploaded += 1
            planned_bytes += size
            available -= size
        print(f"SUMMARY: uploaded={uploaded}, existing_reused={already}, skipped={skipped}, planned_new_bytes={planned_bytes:,}")
        print('This script does not make content public. Export/publish only through review gates.')
    finally:
        con.close()


if __name__ == '__main__':
    main()
