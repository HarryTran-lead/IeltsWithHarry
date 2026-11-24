from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from voa_ingest.parser import canonical_url, discover_article_links, discover_feed_urls, parse_feed, parse_article, valid_mp3_url
FIX=Path(__file__).resolve().parents[1]/'examples'

def test_canonical_voi():
    assert canonical_url('https://learningenglish.voanews.com/amp/example/1234.html?x=1')=='https://learningenglish.voanews.com/a/example/1234.html'
    assert canonical_url('https://learningenglish.voanews.com/a/8007357.html?utm_source=rss')=='https://learningenglish.voanews.com/a/8007357.html'
    assert canonical_url('https://evil.com/a/lesson/1234.html') is None
    assert canonical_url('file:///etc/passwd') is None

def test_discover():
    links=discover_article_links((FIX/'index_fixture.html').read_text(),'https://learningenglish.voanews.com/')
    assert len(links)==2
    assert all(l.startswith('https://learningenglish.voanews.com/a/') for l in links)

def test_feed():
    rows=parse_feed((FIX/'rss_fixture.xml').read_bytes())
    assert len(rows)==2 and rows[0]['title']=='Welcome'
    assert rows[1]['url']=='https://learningenglish.voanews.com/a/8007357.html'

def test_mp3_allowlist():
    assert valid_mp3_url('https://voa-audio.voanews.eu/vle/2020/demo.mp3?download=1','https://learningenglish.voanews.com')
    assert valid_mp3_url('https://evil.org/demo.mp3','https://learningenglish.voanews.com') is None
    assert valid_mp3_url('http://voa-audio.voanews.eu/demo.mp3','https://learningenglish.voanews.com') is None

def test_transcript_candidates_not_verified():
    text=(FIX/'article_fixture.html').read_text()
    row=parse_article(text,'https://learningenglish.voanews.com/a/demo/3111026.html')
    assert 'Where are you going today?' in row['transcript_candidate']
    assert 'What did the speaker do' not in row['transcript_candidate']
    assert row['audio_candidates'] and row['audio_candidates'][0].endswith('download=1')
    assert row['transcript_verified'] is False and row['license_verified'] is False
