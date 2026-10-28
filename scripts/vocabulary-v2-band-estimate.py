"""Deterministic *suggested learning band* for the IELTS CSV collection.

This is a frequency-based sorting aid, not an official IELTS word-level band.
Editors can override any suggestion without changing source content.
Requires wordfreq 3.1.1 for reproducible results.
"""

from __future__ import annotations

import importlib.metadata

from wordfreq import zipf_frequency


MODEL = "wordfreq-en-3.1.1-thresholds-v1"
THRESHOLDS = ((5.5, "1"), (5.0, "2"), (4.5, "3"), (4.0, "4"),
              (3.5, "5"), (3.0, "6"))


def suggested_band(term: str) -> tuple[str, float, str]:
    version = importlib.metadata.version("wordfreq")
    if version != "3.1.1":
        raise RuntimeError(f"Expected wordfreq 3.1.1, found {version}")
    score = round(zipf_frequency(term, "en"), 2)
    band = next((label for minimum, label in THRESHOLDS if score >= minimum), "7+")
    return band, score, MODEL
