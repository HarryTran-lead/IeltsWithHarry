#!/usr/bin/env python3
"""Full-coverage candidate discovery with bounded approved human-audio import.

Start: python scripts/voa_ingest.py --help
Do not run from serverless request handlers; execute offline on controlled worker.
"""
from __future__ import annotations
import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE/'src'))
from voa_ingest.db import connect, stats, upsert_discovery
from voa_ingest.fetch import PoliteClient, ImportBlocked
from voa_ingest.pipeline import discover, parse_pending, approve, download_approved, export_staging


def make_parser():
    p=argparse.ArgumentParser(description='VOA Learning English metadata-first ingestion, review, and bounded download')
    p.add_argument('--db',default='data/voa_ingest.sqlite')
    p.add_argument('--config',default=str(BASE/'config/voa_sources.json'))
    sub=p.add_subparsers(dest='command',required=True)
    d=sub.add_parser('discover',help='Index + RSS + optional sitemaps; no MP3 downloads')
    d.add_argument('--contact',required=True,help='Real operator contact email for User-Agent')
    d.add_argument('--max-items',type=int,default=10000)
    d.add_argument('--include-sitemaps',action='store_true')
    a=sub.add_parser('parse',help='Fetch discovered HTML into unverified draft queue')
    a.add_argument('--contact',required=True)
    a.add_argument('--limit',type=int,default=40)
    seed=sub.add_parser('seed-manifest',help='Import permitted archive article URLs from your own newline manifest')
    seed.add_argument('--file',required=True)
    sub.add_parser('status',help='Show status counts and usage')
    q=sub.add_parser('queue',help='Show draft review queue; never auto-approve')
    q.add_argument('--limit',type=int,default=40)
    rv=sub.add_parser('approve',help='Human confirmation (rights and audio/text match)')
    rv.add_argument('--id',type=int,required=True)
    rv.add_argument('--reviewer',required=True)
    rv.add_argument('--rights-verified',action='store_true')
    rv.add_argument('--transcript-verified',action='store_true')
    rv.add_argument('--notes',required=True)
    dl=sub.add_parser('download',help='Download approved MP3 only within batch + total caps')
    dl.add_argument('--contact',required=True)
    dl.add_argument('--media-dir',default='data/media')
    dl.add_argument('--batch-mb',type=int,default=None)
    dl.add_argument('--total-mb',type=int,default=None)
    ex=sub.add_parser('export',help='Export local reviewed media metadata (NOT publish)')
    ex.add_argument('--output',default='data/export_verified.jsonl')
    rej=sub.add_parser('reject',help='Reject a candidate after QA')
    rej.add_argument('--id',type=int,required=True)
    rej.add_argument('--notes',required=True)
    return p


def main(args=None):
    a=make_parser().parse_args(args)
    with open(a.config,encoding='utf-8') as f:
        cfg=json.load(f)
    con=connect(a.db)
    try:
        if a.command=='discover':
            client=PoliteClient(a.contact,delay=cfg['metadata_discovery']['request_interval_seconds'])
            print(json.dumps({'discovery_occurrences':discover(con,client,cfg,max_items=a.max_items,include_sitemap=a.include_sitemaps),'status':stats(con)},indent=2))
        elif a.command=='parse':
            client=PoliteClient(a.contact,delay=cfg['metadata_discovery']['request_interval_seconds'])
            print(json.dumps({'parsed':parse_pending(con,client,limit=a.limit),'status':stats(con)},indent=2))
        elif a.command=='seed-manifest':
            from voa_ingest.parser import canonical_url
            count=0
            for line in open(a.file,encoding='utf-8'):
                u=canonical_url(line.strip())
                if u:
                    upsert_discovery(con,u,group='VOA authorized archive manifest');count+=1
            con.commit()
            print(f'Seeded {count} approved-domain article URLs; no media download')
        elif a.command=='status':
            bytes_local=con.execute("SELECT COALESCE(SUM(media_bytes),0) FROM articles WHERE status IN ('downloaded','uploaded','published')").fetchone()[0]
            print(json.dumps({'status':stats(con),'local_media_bytes_recorded':bytes_local,'media_budget_mb':cfg['media']['max_total_megabytes']},indent=2))
        elif a.command=='queue':
            for row in con.execute("SELECT id,title,url,source_group,cefr_suggestion,audio_url,length(transcript_candidate) as transcript_length,third_party_warning,status FROM articles WHERE status IN ('needs_review','parse_failed') ORDER BY id LIMIT ?",(a.limit,)):
                print(json.dumps(dict(row),ensure_ascii=False))
        elif a.command=='approve':
            approve(con,a.id,a.reviewer,rights=a.rights_verified,transcript=a.transcript_verified,notes=a.notes)
            print(f'Approved article #{a.id} for bounded media download; not published')
        elif a.command=='download':
            client=PoliteClient(a.contact,delay=cfg['metadata_discovery']['request_interval_seconds'])
            print(json.dumps(download_approved(con,client,media_dir=a.media_dir,batch_mb=a.batch_mb or cfg['media']['max_batch_megabytes'],total_mb=a.total_mb or cfg['media']['max_total_megabytes'],max_file_mb=cfg['media']['max_file_megabytes']),indent=2))
        elif a.command=='export':
            count=export_staging(con,a.output)
            print(f'Exported {count} reviewed media candidates to {a.output} (NOT published)')
        elif a.command=='reject':
            if len(a.notes.strip())<5:raise ValueError('Rejection reason required')
            con.execute("UPDATE articles SET status='rejected',review_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",(a.notes,a.id));con.commit()
            print(f'Rejected article #{a.id}')
    except ImportBlocked as e:
        print(f'IMPORT STOPPED BY SOURCE OR NETWORK POLICY: {e}',file=sys.stderr)
        return 2
    finally:
        con.close()
    return 0

if __name__=='__main__':
    sys.exit(main())
