#!/usr/bin/env python3
"""Align candidate VOA transcript sentences to locally recognized word timestamps.

This is a development preview only: low-confidence sentences are excluded and
all resulting timings still need human listening before publication.
"""
import difflib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data"
MANIFEST = ROOT / "export_dev_preview.jsonl"
OUTPUT = ROOT / "aligned_sentences.jsonl"


def clean(text: str) -> str:
    text = re.sub(r"(?<=[A-Za-z])�(?=[A-Za-z])", "'", text)
    text = text.replace("�", "")
    return re.sub(r"\s+([,.!?;:])", r"\1", text).strip()


def tokenize(text: str) -> list[str]:
    return [word.lower() for word in re.findall(r"[A-Za-z0-9]+", text)]


def sentences(text: str) -> list[str]:
    fragments = re.sub(r"([.!?]+[\"”']?)\s+(?=[A-Z\"“])", lambda match: match.group(1) + "\x00", clean(text)).split("\x00")
    result = []
    for fragment in fragments:
        fragment = fragment.strip()
        if not fragment:
            continue
        if result and re.search(r"\b(?:Mr|Mrs|Ms|Dr|St)\.$", result[-1]):
            result[-1] += " " + fragment
        else:
            result.append(fragment)
    return result


def align(item: dict, asr: list[dict]) -> dict:
    sources = [(part, sentence) for part in item["segments"] for sentence in sentences(part["reference_text"])]
    reference_tokens = []
    spans = []
    for part, sentence in sources:
        start = len(reference_tokens)
        reference_tokens.extend(tokenize(sentence))
        spans.append((start, len(reference_tokens)))
    recognized_tokens, token_to_word = [], []
    for index, word in enumerate(asr):
        for token in tokenize(word["word"]):
            recognized_tokens.append(token)
            token_to_word.append(index)
    matcher = difflib.SequenceMatcher(None, reference_tokens, recognized_tokens, autojunk=False)
    matches = {left + offset: token_to_word[right + offset]
               for left, right, length in matcher.get_matching_blocks()
               for offset in range(length)}
    candidates = []
    for (part, sentence), (first, last) in zip(sources, spans):
        hits = [matches[index] for index in range(first, last) if index in matches]
        count = last - first
        coverage = len(hits) / max(1, count)
        candidates.append({"part": part, "text": sentence, "first": first, "last": last,
                           "hits": hits, "coverage": coverage, "words": count})
    accepted, rejected = [], []
    for index, current in enumerate(candidates):
        hits = current["hits"]
        if not hits or current["coverage"] < 0.45 or len(hits) < min(2, current["words"]):
            rejected.append({"text": current["text"], "coverage": round(current["coverage"], 2)})
            continue
        start_word, end_word = hits[0], hits[-1]
        preceding = next((c["hits"][-1] for c in reversed(candidates[:index]) if c["hits"]), -1)
        following = next((c["hits"][0] for c in candidates[index + 1:] if c["hits"]), len(asr))
        # Extend to short unmatched prefixes/suffixes, bounded by neighbor anchors.
        first_matched = next(i for i in range(current["first"], current["last"]) if i in matches)
        last_matched = next(i for i in range(current["last"] - 1, current["first"] - 1, -1) if i in matches)
        start_word = max(preceding + 1, start_word - min(2, first_matched - current["first"]))
        end_word = min(following - 1, end_word + min(2, current["last"] - last_matched - 1))
        start_ms = max(0, round(asr[start_word]["start"] * 1000) - 80)
        end_ms = min(item["duration_ms"], round(asr[end_word]["end"] * 1000) + 120)
        if end_ms - start_ms < 250 or end_ms - start_ms > max(3000, current["words"] * 1500 + 3000):
            rejected.append({"text": current["text"], "coverage": round(current["coverage"], 2)})
            continue
        accepted.append({"ordinal": len(accepted) + 1, "start_ms": start_ms,
                         "end_ms": end_ms, "reference_text": current["text"],
                         "speaker": current["part"]["speaker"],
                         "confidence": round(current["coverage"], 2)})
    for previous, following in zip(accepted, accepted[1:]):
        if previous["end_ms"] > following["start_ms"]:
            midpoint = (previous["end_ms"] + following["start_ms"]) // 2
            previous["end_ms"] = max(previous["start_ms"] + 1, midpoint)
            following["start_ms"] = max(previous["end_ms"], min(following["end_ms"] - 1, midpoint))
    long_enough = []
    for sentence in accepted:
        if sentence["end_ms"] - sentence["start_ms"] < 250:
            rejected.append({"text": sentence["reference_text"], "coverage": sentence["confidence"]})
        else:
            sentence["ordinal"] = len(long_enough) + 1
            long_enough.append(sentence)
    return {"id": item["id"], "url": item["url"], "title": item["title"],
            "duration_ms": item["duration_ms"], "sentences": long_enough,
            "rejected": rejected,
            "match_rate": round(len(matches) / max(1, len(reference_tokens)), 3)}


def main() -> None:
    items = [json.loads(line) for line in MANIFEST.read_text(encoding="utf-8").splitlines() if line]
    results = []
    for item in items:
        path = ROOT / f"words_{item['id']:07d}.json"
        if not path.exists():
            continue
        asr = json.loads(path.read_text(encoding="utf-8"))
        result = align(item, asr)
        results.append(result)
        print(f"{item['id']}: {len(result['sentences'])} sentences, "
              f"{len(result['rejected'])} rejected, match={result['match_rate']:.1%}")
    OUTPUT.write_text("\n".join(json.dumps(result, ensure_ascii=False) for result in results) + "\n", encoding="utf-8")
    print(f"Aligned {len(results)}/{len(items)} lessons -> {OUTPUT}")


if __name__ == "__main__":
    main()
