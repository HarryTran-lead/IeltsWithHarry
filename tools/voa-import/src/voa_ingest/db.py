"""Small local SQLite staging queue; never writes to production DB itself."""
from __future__ import annotations
import sqlite3
from pathlib import Path

DDL = """
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  source_group TEXT NOT NULL DEFAULT 'VOA Learning English',
  cefr_suggestion TEXT NOT NULL DEFAULT '',
  published TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'discovered',
  audio_url TEXT NOT NULL DEFAULT '',
  transcript_candidate TEXT NOT NULL DEFAULT '',
  content_kind TEXT NOT NULL DEFAULT '',
  third_party_warning INTEGER NOT NULL DEFAULT 0,
  rights_verified INTEGER NOT NULL DEFAULT 0,
  transcript_verified INTEGER NOT NULL DEFAULT 0,
  media_verified INTEGER NOT NULL DEFAULT 0,
  local_audio_path TEXT NOT NULL DEFAULT '',
  media_sha256 TEXT NOT NULL DEFAULT '',
  media_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL DEFAULT '',
  review_notes TEXT NOT NULL DEFAULT '',
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sync_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT DEFAULT CURRENT_TIMESTAMP,
 source TEXT, found INTEGER DEFAULT 0, state TEXT DEFAULT 'started', error TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS articles_status_idx ON articles(status);
"""

def connect(db_path: str) -> sqlite3.Connection:
    p = Path(db_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(p)
    con.row_factory = sqlite3.Row
    con.executescript(DDL)
    return con


def upsert_discovery(con: sqlite3.Connection, url: str, title: str = "", group: str = "", cefr: str = "") -> None:
    con.execute("""INSERT INTO articles(url,title,source_group,cefr_suggestion)
        VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET
        title = CASE WHEN articles.title='' THEN excluded.title ELSE articles.title END,
        source_group = CASE WHEN articles.source_group='VOA Learning English' THEN excluded.source_group ELSE articles.source_group END,
        cefr_suggestion = CASE WHEN articles.cefr_suggestion='' THEN excluded.cefr_suggestion ELSE articles.cefr_suggestion END,
        updated_at=CURRENT_TIMESTAMP""", (url, title, group or "VOA Learning English", cefr))


def set_parsed(con, parsed: dict):
    con.execute("""UPDATE articles SET title=?, published=?, transcript_candidate=?, audio_url=?,
    content_kind=?, third_party_warning=?, status='needs_review',
    rights_verified=0, transcript_verified=0, media_verified=0,
    updated_at=CURRENT_TIMESTAMP
    WHERE url=? AND status NOT IN ('approved','downloaded','uploaded','published')""", (
       parsed['title'], parsed['published'], parsed['transcript_candidate'],
       parsed['audio_candidates'][0] if parsed['audio_candidates'] else '',
       parsed['content_kind'], int(parsed['third_party_warning']), parsed['url']))


def stats(con):
    return [dict(row) for row in con.execute("SELECT status, COUNT(*) AS count FROM articles GROUP BY status ORDER BY status")]
