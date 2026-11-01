"""Staged, repeatable import helpers with strictly bounded local media storage."""
from __future__ import annotations
import hashlib
import json
import os
import shutil
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
from .db import upsert_discovery, set_parsed
from .fetch import PoliteClient, ImportBlocked
from .parser import canonical_url, discover_article_links, discover_feed_urls, parse_feed, parse_article, valid_mp3_url


def _body(client, url):
    r=client.fetch(url)
    try:
        if len(r.content) > 12 * 1024 * 1024:
            raise ValueError("HTML/XML exceeds 12 MB")
        return r.content
    finally:
        r.close()


def _parse_sitemap(xml: bytes):
    """Parse one sitemap page; doesn't auto-follow external references or huge archives."""
    root=ET.fromstring(xml)
    tags=[e.text.strip() for e in root.iter() if e.tag.split('}')[-1]=='loc' and e.text]
    return tags


def discover(con, client: PoliteClient, config: dict, *, max_items=10000, include_sitemap=False):
    """Discover all reachable/indexed items in chosen feeds/pages; NOT guarantee VOA archive completeness."""
    n=0
    for ix in config['index_pages']:
        page=_body(client, ix['url']).decode('utf-8', errors='replace')
        for url in discover_article_links(page,ix['url']):
            upsert_discovery(con,url,group=ix['category'],cefr=ix['cefr_suggestion'])
            n+=1
            if n>=max_items:
                con.commit(); return n
        con.commit()
    # Find official feed endpoints via VOA's own RSS directory.
    rss_catalog=config['rss_catalog']
    html=_body(client,rss_catalog).decode('utf-8', errors='replace')
    feed_urls=discover_feed_urls(html,rss_catalog)
    for feed in feed_urls:
        try:
            feed_items=parse_feed(_body(client,feed))
        except (ValueError, ImportBlocked) as ex:
            print(f"[FEED SKIPPED] {feed}: {ex}")
            continue
        for item in feed_items:
            upsert_discovery(con,item['url'],item['title'],group='VOA RSS')
            n+=1
            if n>=max_items:
                con.commit(); return n
        con.commit()
    for url in config.get('metadata_discovery',{}).get('additional_seed_article_urls',[]):
        valid=canonical_url(url)
        if valid:
            upsert_discovery(con, valid, group='VOA manually seeded')
            n+=1
            if n>=max_items:
                con.commit();return n
    if include_sitemap:
        # Opt-in discovery only. Sitemap indexes can be large, thus explicit URLs and max_items.
        todo=list(config.get('metadata_discovery',{}).get('optional_sitemap_urls',[]))
        seen=set()
        while todo and n<max_items:
            sitemap=todo.pop(0)
            if sitemap in seen: continue
            seen.add(sitemap)
            if urlsplit(sitemap).hostname != 'learningenglish.voanews.com' or urlsplit(sitemap).scheme != 'https':
                continue
            for loc in _parse_sitemap(_body(client,sitemap)):
                if canonical_url(loc):
                    upsert_discovery(con,canonical_url(loc),group='VOA sitemap')
                    n+=1
                    if n>=max_items:break
                elif loc.endswith('.xml') and urlsplit(loc).hostname=='learningenglish.voanews.com' and len(seen)+len(todo)<200:
                    todo.append(loc)
            con.commit()
    con.commit()
    return n


def parse_pending(con, client, *, limit=40):
    entries=con.execute("SELECT url FROM articles WHERE status IN ('discovered','parse_failed') ORDER BY id LIMIT ?", (limit,)).fetchall()
    done=0
    for item in entries:
        try:
            raw=_body(client,item['url']).decode('utf-8',errors='replace')
            article=parse_article(raw,item['url'])
            set_parsed(con,article)
            done+=1
            con.commit()
        except ImportBlocked:
            # Stop immediately on blocks; do not hammer content source.
            raise
        except (ValueError, UnicodeError) as e:
            con.execute("UPDATE articles SET status='parse_failed',review_notes=? WHERE url=?",(str(e)[:400],item['url']))
            con.commit()
    return done


def approve(con, article_id: int, reviewer: str, *, rights: bool, transcript: bool, notes: str):
    if not reviewer or not rights or not transcript or len(notes.strip()) < 10:
        raise ValueError('Requires named human reviewer, rights check, transcript review and notes (10+ chars)')
    row=con.execute("SELECT * FROM articles WHERE id=?",(article_id,)).fetchone()
    if not row or row['status']!='needs_review' or not row['audio_url'] or not row['transcript_candidate']:
        raise ValueError('Only parsed audio+transcript candidates can be approved')
    if row['third_party_warning'] and 'third-party-cleared' not in notes.lower():
        raise ValueError('Third party warning: document clearance or reject this content')
    if not valid_mp3_url(row['audio_url'],row['url']):
        raise ValueError('Invalid audio host or format')
    con.execute("UPDATE articles SET status='approved',rights_verified=1,transcript_verified=1,reviewer=?,review_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",(reviewer,notes,article_id))
    con.commit()


def looks_like_mp3(path: Path):
    """Conservative signature check: audio must be verified by a decoder before publishing."""
    with path.open('rb') as f:
        header=f.read(10)
    return header.startswith(b'ID3') or (len(header)>1 and header[0]==0xff and header[1]&0xe0==0xe0)


def download_approved(con, client, *, media_dir: str, batch_mb=50, total_mb=150, max_file_mb=15):
    root=Path(media_dir);root.mkdir(parents=True,exist_ok=True)
    batch_cap=int(batch_mb*1024*1024); total_cap=int(total_mb*1024*1024); item_cap=int(max_file_mb*1024*1024)
    known_bytes=con.execute("SELECT COALESCE(SUM(media_bytes),0) FROM articles WHERE status IN ('downloaded','uploaded','published')").fetchone()[0]
    if known_bytes>=total_cap:
        return {'count':0,'bytes':0,'message':'Total media budget already reached'}
    available=min(batch_cap,total_cap-known_bytes); result={'count':0,'bytes':0,'skipped':0}
    for row in con.execute("SELECT id,audio_url FROM articles WHERE status='approved' ORDER BY id"):
        if available<128*1024:break
        if shutil.disk_usage(root).free < (50 * 1024 * 1024) + min(available,item_cap):
            result['warning']='Disk space safety floor reached (50MB + next file maximum)'
            break
        if not valid_mp3_url(row['audio_url'],'https://learningenglish.voanews.com'):
            result['skipped']+=1;continue
        res=client.fetch(row['audio_url'],stream=True)
        try:
            declared=int(res.headers.get('Content-Length') or '0')
            ctype=res.headers.get('Content-Type','').lower()
            # servers may label MP3 as octet-stream; reject obvious html responses.
            if ('text/html' in ctype or (declared and declared>min(item_cap,available))):
                result['skipped']+=1;continue
            target=root/f"voa_{row['id']:07d}.mp3"
            tmp=target.with_suffix('.mp3.part')
            sha=hashlib.sha256();size=0
            try:
                with tmp.open('wb') as f:
                    for chunk in res.iter_content(chunk_size=64*1024):
                        if not chunk:continue
                        size+=len(chunk)
                        if size>item_cap or size>available:raise ValueError('Per-item or batch cap reached')
                        sha.update(chunk);f.write(chunk)
                if size<2000 or not looks_like_mp3(tmp):raise ValueError('Downloaded response is not a valid MP3 candidate')
                # Deduplicate identical binary media (reuse path, delete temp).
                existing=con.execute("SELECT local_audio_path FROM articles WHERE media_sha256=? AND local_audio_path!='' LIMIT 1",(sha.hexdigest(),)).fetchone()
                if existing and Path(existing[0]).exists():
                    tmp.unlink(missing_ok=True);audio_path=existing[0]
                else:
                    os.replace(tmp,target);audio_path=str(target)
                con.execute("UPDATE articles SET status='downloaded',local_audio_path=?,media_bytes=?,media_sha256=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",(audio_path,size,sha.hexdigest(),row['id']))
                con.commit();result['count']+=1;result['bytes']+=size;available-=size
            except (ValueError, OSError) as e:
                tmp.unlink(missing_ok=True)
                print(f"[FILE SKIPPED] id={row['id']}: {e}")
                result['skipped']+=1
        finally:
            res.close()
    return result


def export_staging(con, path: str):
    """Export verified data only. This NEVER publishes to the website itself."""
    out=Path(path);out.parent.mkdir(parents=True,exist_ok=True)
    count=0
    with out.open('w',encoding='utf-8') as f:
        for row in con.execute("SELECT * FROM articles WHERE status='uploaded' AND rights_verified=1 AND transcript_verified=1 AND media_verified=1 AND r2_key!=''"):
            payload={k:row[k] for k in ('id','url','title','source_group','cefr_suggestion','published','audio_url','transcript_candidate','reviewer','review_notes','media_sha256','media_bytes','r2_key')}
            payload.update({'source_name':'VOA Learning English','license_status':'human_approved_pending_region_compliance','attribution':'VOA Learning English — learningenglish.voanews.com','publication_ready':False,'segments':[]})
            f.write(json.dumps(payload,ensure_ascii=False)+'\n');count+=1
    return count


def export_catalog(con, path: str):
    """Export minimal discovery metadata; never include unreviewed full text."""
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with out.open('w', encoding='utf-8') as f:
        for row in con.execute("SELECT id,url,title,source_group,published,audio_url,third_party_warning,status FROM articles WHERE title!='' ORDER BY id"):
            payload = {key: row[key] for key in ('id','url','title','source_group','published','audio_url','third_party_warning','status')}
            f.write(json.dumps(payload, ensure_ascii=False) + '\n')
            count += 1
    return count
