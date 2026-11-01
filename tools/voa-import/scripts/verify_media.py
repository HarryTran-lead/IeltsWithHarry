#!/usr/bin/env python3
"""Decode-check MP3 with ffprobe before any publishing/export."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from voa_ingest.db import connect

def main():
    a=argparse.ArgumentParser()
    a.add_argument('--db',default='data/voa_ingest.sqlite')
    args=a.parse_args()
    if not shutil.which('ffprobe'):
        raise SystemExit('Install ffmpeg/ffprobe first. Fail closed; no synthetic media.')
    con=connect(args.db)
    for row in con.execute("SELECT id,local_audio_path FROM articles WHERE status IN ('downloaded','uploaded') AND media_verified=0"):
        p=Path(row['local_audio_path'])
        if not p.is_file():continue
        try:
            result=subprocess.run(['ffprobe','-v','error','-select_streams','a:0','-show_entries',
                                   'stream=codec_name,sample_rate:format=duration','-of','json',str(p)],
                                   capture_output=True,text=True,timeout=15,check=True)
            meta=json.loads(result.stdout)
            codec=meta['streams'][0]['codec_name']
            duration=float(meta['format']['duration'])
            if codec!='mp3' or duration<1 or duration>3600:raise ValueError(f'Codec/duration unexpected: {codec} {duration}')
            con.execute("UPDATE articles SET media_verified=1,updated_at=CURRENT_TIMESTAMP WHERE id=?",(row['id'],))
            con.commit()
            print(f"PASS #{row['id']}: {duration:.1f}s")
        except Exception as err:
            print(f"REVIEW #{row['id']} media error: {err}")
    con.close()

if __name__=='__main__':main()
