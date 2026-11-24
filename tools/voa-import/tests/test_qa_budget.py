import sqlite3
import sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from voa_ingest.db import connect, upsert_discovery, set_parsed
from voa_ingest.pipeline import approve, download_approved

def init(tmp_path, third_party=False):
    con=connect(str(tmp_path/'test.sqlite'))
    url='https://learningenglish.voanews.com/a/example/1234.html'
    upsert_discovery(con,url,'Example')
    set_parsed(con,{'url':url,'title':'Example','published':'2026-01-01','transcript_candidate':'Anna: Nice to meet you.',
             'audio_candidates':['https://voa-audio.voanews.eu/vle/demo.mp3'], 'content_kind':'conversation','third_party_warning':third_party})
    con.commit()
    return con

def test_manual_verification_needed(tmp_path):
    con=init(tmp_path)
    with pytest.raises(ValueError): approve(con,1,'editor',rights=False,transcript=True,notes='verified clearly')
    with pytest.raises(ValueError): approve(con,1,'editor',rights=True,transcript=False,notes='verified clearly')
    approve(con,1,'editor',rights=True,transcript=True,notes='I checked each spoken turn and rights')
    assert con.execute('SELECT status FROM articles').fetchone()[0]=='approved'
    con.close()

def test_third_party_requires_clearance(tmp_path):
    con=init(tmp_path,True)
    with pytest.raises(ValueError):approve(con,1,'editor',rights=True,transcript=True,notes='Reviewed source and text')
    con.close()

def test_zero_budget_never_fetches(tmp_path):
    con=init(tmp_path)
    approve(con,1,'editor',rights=True,transcript=True,notes='Checked audio and source license')
    con.execute("UPDATE articles SET status='downloaded',media_bytes=1048576 WHERE id=1");con.commit()
    class FailClient:
        def fetch(self,*a,**k):raise AssertionError('Should never fetch')
    result=download_approved(con,FailClient(),media_dir=str(tmp_path/'media'),total_mb=1)
    assert result['count']==0
    con.close()
