"""Strict article/feed discovery and cautious transcript candidates.

This parser NEVER labels text as a verified audio transcript. Admin review is required.
"""
from __future__ import annotations
import re
from urllib.parse import urljoin, urlsplit, urlunsplit
from bs4 import BeautifulSoup, Tag
import xml.etree.ElementTree as ET

SOURCE_HOST = "learningenglish.voanews.com"
AUDIO_HOSTS = frozenset(("voa-audio.voanews.eu", "voa-audio-english.voanews.eu"))
ARTICLE = re.compile(r"^/(?:a|amp)/(?:[^?#]+/)?\d+\.html$", re.I)
SPACES = re.compile(r"\s+")


def canonical_url(url: str) -> str | None:
    """Only accept public VOA Learning English article urls; no arbitrary host/URL."""
    try:
        u = urlsplit(url)
        if u.scheme not in ("http", "https") or u.hostname != SOURCE_HOST or u.port is not None:
            return None
        path = u.path.replace("/amp/", "/a/", 1)
        if not ARTICLE.fullmatch(path):
            return None
        return urlunsplit(("https", SOURCE_HOST, path, "", ""))
    except (ValueError, TypeError):
        return None


def normalize_url(url: str, base: str) -> str:
    return urljoin(base, url)


def discover_article_links(html: str, base: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    for a in soup.find_all("a", href=True):
        u = canonical_url(normalize_url(a["href"], base))
        if u:
            links.add(u)
    return sorted(links)


def discover_feed_urls(html: str, base: str) -> list[str]:
    """RSS/Podcast subscribe endpoints only on the official VOA host."""
    soup = BeautifulSoup(html, "html.parser")
    feeds = set()
    for a in soup.find_all(["a", "link"], href=True):
        href = normalize_url(a["href"], base)
        try:
            u = urlsplit(href)
        except ValueError:
            continue
        if u.hostname != SOURCE_HOST or u.scheme not in ("http", "https"):
            continue
        if u.path.startswith("/api/") or u.path.endswith((".rss", ".xml")) or a.get("type", "") in ("application/rss+xml", "application/atom+xml"):
            feeds.add(urlunsplit(("https", SOURCE_HOST, u.path, u.query, "")))
    return sorted(feeds)


def parse_feed(content: bytes) -> list[dict]:
    """Supports both official RSS and Atom XML without heavy dependencies."""
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError("Could not parse VOA XML feed") from exc
    def local(tag: str):
        return tag.split('}')[-1]
    unique = {}
    for item in root.iter():
        if local(item.tag) not in ('item', 'entry'):
            continue
        fields = {}
        for child in item:
            typ = local(child.tag)
            if typ == 'link':
                fields['link'] = child.attrib.get('href') or (child.text or '')
            elif typ in ('title', 'pubDate', 'published', 'updated'):
                fields[typ] = (child.text or '')
        url = canonical_url(fields.get('link', ''))
        if url:
            unique[url] = {
                'url': url,
                'title': SPACES.sub(' ', fields.get('title', '')).strip(),
                'published': fields.get('published') or fields.get('pubDate') or fields.get('updated', '')
            }
    return list(unique.values())


def valid_mp3_url(raw: str, base: str) -> str | None:
    try:
        href = normalize_url(raw, base)
        u = urlsplit(href)
        if u.scheme != "https" or u.hostname not in AUDIO_HOSTS or not u.path.lower().endswith(".mp3") or u.port is not None:
            return None
        return href
    except ValueError:
        return None


def extract_audio_links(soup: BeautifulSoup, base: str) -> list[str]:
    """Select only official explicit MP3 links. Prefer 64 kbps; no video links."""
    matches = []
    for a in soup.find_all("a", href=True):
        src = valid_mp3_url(a["href"], base)
        if src:
            text = a.get_text(" ", strip=True).lower()
            score = 0 if "64 kbps" in text else 1 if "128 kbps" in text else 2
            matches.append((score, src))
    return list(dict.fromkeys(u for _, u in sorted(matches)))


def _get_main(soup: BeautifulSoup):
    return (soup.select_one("div.article-body") or soup.select_one("div.wsw")
            or soup.select_one("article") or soup.select_one("main") or soup.body or soup)


def _transcript_from_conversation(soup: BeautifulSoup) -> str:
    """Conversation heading followed by speech paragraphs; no guaranteed alignment."""
    for head in soup.find_all(re.compile("^h[1-6]$")):
        if head.get_text(" ", strip=True).lower() != "conversation":
            continue
        candidates = []
        # Read sibling block until the next heading; audio embed wrappers skipped.
        for el in head.next_elements:
            if el is head:
                continue
            if isinstance(el, Tag) and re.fullmatch(r"h[1-3]", el.name or "") and el is not head:
                break
            if isinstance(el, Tag) and el.name in ("p", "div") and not el.find(("p", "div")):
                text = el.get_text(" ", strip=True)
                if re.match(r"^[A-Za-z][A-Za-z .'’-]{0,40}:\s*\S", text):
                    if text not in candidates:
                        candidates.append(text)
        if candidates:
            return "\n".join(candidates)
    return ""


def parse_article(html: str, url: str) -> dict:
    """Parse candidate metadata, not actual audio verification or legal clearance."""
    canonical = canonical_url(url)
    if not canonical:
        raise ValueError("Not a canonical VOA article URL")
    soup = BeautifulSoup(html, "html.parser")
    head = soup.find("h1")
    title = head.get_text(" ", strip=True) if head else (soup.title.get_text(" ", strip=True) if soup.title else "")
    og = soup.find("meta", property="article:published_time")
    published = og.get("content", "") if og else ""
    audio = extract_audio_links(soup, canonical)
    transcript = _transcript_from_conversation(soup)
    kind = "conversation" if transcript else "article_candidate"
    if not transcript:
        main = _get_main(soup)
        paragraphs = []
        for p in main.find_all("p"):
            if p.find_parent(["footer", "aside", "nav", "form"]):
                continue
            t = p.get_text(" ", strip=True)
            if len(t) > 35:
                paragraphs.append(t)
        transcript = "\n".join(paragraphs[:150])
    # VOA uses AP/Reuters/etc images/audio in some articles; source-by-source review mandatory.
    third_party_terms = bool(re.search(r"\b(?:Associated Press|Reuters|Agence France-Presse|\bAFP\b|Getty Images)\b", html, re.I))
    return {
        "url": canonical,
        "title": title,
        "published": published,
        "audio_candidates": audio,
        "transcript_candidate": transcript[:100000],
        "content_kind": kind,
        "third_party_warning": third_party_terms,
        "transcript_verified": False,
        "license_verified": False,
        "segment_times_verified": False,
        "cefr_reviewed": False,
    }
