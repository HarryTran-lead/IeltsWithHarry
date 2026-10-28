"""Read-only exact and spelling-variant check for Phase 5 term proposals.

Reports stay outside Git because they include source identifiers and terms.
An alias hit is a review lead. No term is approved automatically.
"""

from __future__ import annotations

import argparse
import collections
import difflib
import importlib.util
import json
from pathlib import Path


def load_audit():
    path = Path(__file__).with_name("vocabulary-v2-phase1-audit.py")
    spec = importlib.util.spec_from_file_location("vocabulary_phase1_audit", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load audit module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def classify_terms(terms: list[str], sources: dict[str, list[dict]], audit) -> list[dict]:
    fields = {"ielts": ("term", "source_key"), "cefr_bank": ("headword", "source_id"),
              "lessons": ("word", "id"), "drafts": ("term", "candidate_key")}
    index: dict[str, list[dict]] = collections.defaultdict(list)
    for collection, rows in sources.items():
        word_field, id_field = fields[collection]
        for row in rows:
            index[audit.normalized(row[word_field])].append({
                "collection": collection, "id": row[id_field], "term": row[word_field]})

    result = []
    for term in terms:
        key = audit.normalized(term)
        exact = index.get(key, [])
        variants = audit.variant_keys(term)
        aliases = [hit for variant in variants for hit in index.get(variant, [])]
        near_keys = difflib.get_close_matches(key, index.keys(), n=5, cutoff=0.88)
        near = [hit for near_key in near_keys if near_key != key and near_key not in variants
                for hit in index[near_key]]
        result.append({"term": term, "status": "exact" if exact else "alias_review" if aliases
                       else "near_review" if near else "candidate",
                       "exact_matches": exact, "alias_leads": aliases, "near_leads": near})
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proposals", type=Path, required=True)
    parser.add_argument("--environment", choices=("development", "production"), required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    out_dir = args.out_dir.resolve()
    if out_dir.is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error("Report output must be outside the repository")
    out_dir.mkdir(parents=True, exist_ok=True)
    audit = load_audit()
    proposals = json.loads(args.proposals.read_text(encoding="utf-8"))
    terms = proposals["terms"]
    if not isinstance(terms, list) or not all(isinstance(term, str) and term.strip() for term in terms):
        parser.error("Proposals must contain nonempty terms")
    if len({audit.normalized(term) for term in terms}) != len(terms):
        parser.error("Duplicate term in proposal list")

    db = audit.ReadOnlyProject(audit.PROJECTS[args.environment])
    sources = {
        "ielts": db.rows("ielts_vocabulary_entries", "source_key,term"),
        "cefr_bank": db.rows("vocabulary_bank_entries", "source_id,headword"),
        "lessons": db.rows("vocabulary_entries", "id,word"),
        "drafts": db.rows("ielts_vocabulary_draft_entries", "candidate_key,term"),
    }
    result = classify_terms(terms, sources, audit)
    counts = dict(sorted(collections.Counter(item["status"] for item in result).items()))
    report = {
        "environment": args.environment,
        "topic": proposals["topic"],
        "source_counts": {name: len(rows) for name, rows in sources.items()},
        "proposal_count": len(result),
        "status_counts": counts,
        "results": result,
        "note": "Exact hits are blocked; alias and near leads require sense-level review before drafting.",
    }
    (out_dir / f"{args.environment}-phase5-dedup.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("environment", "topic", "source_counts", "proposal_count", "status_counts")}, ensure_ascii=True))


if __name__ == "__main__":
    main()
