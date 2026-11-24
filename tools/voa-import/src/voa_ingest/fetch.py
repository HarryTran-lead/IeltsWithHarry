"""Polite network client: robots-aware, bounded, no anti-bot bypass."""
from __future__ import annotations
import os
import time
from urllib.parse import urlsplit, urljoin
from urllib.robotparser import RobotFileParser
import requests

class ImportBlocked(RuntimeError):
    pass

class PoliteClient:
    ALLOWED_HOSTS = frozenset({"learningenglish.voanews.com", "voa-audio.voanews.eu", "voa-audio-english.voanews.eu"})

    def __init__(self, contact_email: str, delay: float = 2.0, timeout: float = 20):
        if not contact_email or "@" not in contact_email:
            raise ValueError("Set an authentic importer contact email via --contact")
        self.agent = f"EnglishSkillLabDictationMetadataImporter/1.0 (+mailto:{contact_email})"
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": self.agent, "Accept": "text/html,application/xml,audio/mpeg,*/*"})
        self.delay = max(1.0, delay)
        self.timeout = timeout
        self.rules = {}
        self.last = {}

    def _check(self, url: str):
        u = urlsplit(url)
        if u.scheme != "https" or u.hostname not in self.ALLOWED_HOSTS or u.port is not None or u.username:
            raise ImportBlocked("URL host or scheme not allowlisted")
        if u.hostname not in self.rules:
            self._pace(u.hostname)
            robots_url = f"https://{u.hostname}/robots.txt"
            try:
                r = self.session.get(robots_url, timeout=self.timeout, allow_redirects=False)
                if r.status_code == 404:
                    self.rules[u.hostname] = None
                elif r.status_code == 200:
                    rule = RobotFileParser(robots_url)
                    rule.parse(r.text.splitlines())
                    self.rules[u.hostname] = rule
                else:
                    raise ImportBlocked(f"robots.txt inaccessible: {r.status_code} ({u.hostname})")
            except requests.RequestException as e:
                raise ImportBlocked(f"robots.txt unavailable for {u.hostname}; stop, do not bypass") from e
        rule = self.rules[u.hostname]
        if rule is not None and not rule.can_fetch(self.agent, url):
            raise ImportBlocked(f"robots.txt disallows {url}")
        return u.hostname

    def _pace(self, host: str):
        elapsed = time.monotonic() - self.last.get(host, -1e9)
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self.last[host] = time.monotonic()

    def fetch(self, url: str, stream: bool = False):
        """Reject redirects outside allowed hosts; never retry 403/429 to evade controls."""
        for _ in range(5):
            host = self._check(url)
            self._pace(host)
            try:
                response = self.session.get(url, timeout=self.timeout, stream=stream, allow_redirects=False)
            except requests.RequestException as e:
                raise ImportBlocked(f"Network failure: {e}") from e
            if response.status_code in (301, 302, 303, 307, 308):
                dest = response.headers.get("Location")
                response.close()
                if not dest:
                    raise ImportBlocked("Redirect without Location")
                url = urljoin(url, dest)
                continue
            if response.status_code in (401, 403, 429):
                response.close()
                raise ImportBlocked(f"Source denied request (HTTP {response.status_code}); stop and contact publisher")
            if response.status_code != 200:
                response.close()
                raise ImportBlocked(f"HTTP {response.status_code} for {url}")
            return response
        raise ImportBlocked("Too many redirects")
