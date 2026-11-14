#!/usr/bin/env python3
"""Apply every answer/content fix shipped in the Grammar A1–C2 upgrade package.

Sources (copied into qa/grammar-fixes/ from Grammar_A1_C2_Full.zip):
  M04   7 C1-12 MCQ keys that matched no option (already in the zip data; re-checked here)
  M14B  433 P1 fixes: 331 missing VI translations, 103 wrong-answer feedbacks, B1-16-Q050 actor
  M14C  198 C2 rationale/translation rewrites (built on top of M14B)
  M14D  718 P2 explanation/rationale rewrites marked REVIEW_ONLY_EDIT_CANDIDATE
  M14E  20 B2 nonsense distractors ("workinging") re-authored here
  M26AF 3 source defects (A1-09-Q32, A1-09-Q34, A2-20-Q040 "keeped")
  M26AG 200 equivalent-form answers (contractions, needn't...) added to accepted_answers
  M26E  13 M25D passage grammar fixes that do not move any answer key
  Extra C1-12 em-dash spacing that made the right option stand out; C1-12-Q055 VI;
        A1-15-Q15 "a fruit" distractor that was also grammatical.

Every change is checked against the current value first and is skipped (not forced)
when the source has drifted. Questions stay publishable=false: this edits draft
content, it does not approve it. Safe to re-run: a second run changes nothing.

Run from the repo root:  python -I scripts/apply-grammar-editorial-fixes.py
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "src/data/grammar-editorial"
FIXES = ROOT / "qa/grammar-fixes"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
stats: Counter[str] = Counter()
skipped: list[str] = []


def load_bank():
    data = {lv: json.loads((BANK / f"{lv}.json").read_text(encoding="utf-8")) for lv in LEVELS}
    index = {q["id"]: q for lv in data.values() for lesson in lv.values() for q in lesson["questions"]}
    return data, index


def save_bank(data):
    for lv, value in data.items():
        (BANK / f"{lv}.json").write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def jsonl(name):
    return [json.loads(line) for line in (FIXES / name).read_text(encoding="utf-8").splitlines() if line.strip()]


def put(q, field, value, tag):
    if q.get(field) != value:
        q[field] = value
        stats[tag] += 1
        return True
    return False


def add_flag(q, flag):
    flags = q.setdefault("manual_review_flags", [])
    if flag not in flags:
        flags.append(flag)


def rename_option(q, old, new, rationale_vi):
    """Replace one MCQ option text and keep the rationale map keyed by option text."""
    if old not in q.get("options", []):
        return False
    q["options"] = [new if o == old else o for o in q["options"]]
    rationales = q.get("option_rationales_vi")
    if isinstance(rationales, dict):
        q["option_rationales_vi"] = {(new if k == old else k): (rationale_vi if k == old else v) for k, v in rationales.items()}
    return True


# --------------------------------------------------------------------------- M04
def m04(index):
    for r in json.loads((FIXES / "m04-patch-manifest.json").read_text(encoding="utf-8"))["modifications"]:
        q = index[r["question_id"]]
        if q["options"][r["option_index"]] == r["old_option"]:
            rename_option(q, r["old_option"], r["new_option"], q["option_rationales_vi"][r["old_option"]])
            stats["M04 C1-12 key/option sync"] += 1


def c1_12_dash_spacing(data):
    """After M04 only the right option lost the space around '—', which gives it away."""
    for q in data["C1"]["C1-12"]["questions"]:
        opts = q.get("options") or []
        if not any("—" in o for o in opts):
            continue
        fixed = {o: o.replace("— ", "—").replace(" —", "—") for o in opts}
        if all(k == v for k, v in fixed.items()):
            continue
        if q["correct_answer"] not in fixed.values():
            skipped.append(f"dash {q['id']}: key would not match")
            continue
        q["options"] = [fixed[o] for o in opts]
        if isinstance(q.get("option_rationales_vi"), dict):
            q["option_rationales_vi"] = {fixed.get(k, k): v for k, v in q["option_rationales_vi"].items()}
        stats["C1-12 em-dash spacing unified"] += 1


# --------------------------------------------------------------------------- M14B
def m14b(index):
    for r in jsonl("M14B_P1_433_CHANGESET.jsonl"):
        q = index.get(r["question_id"])
        if q is None:
            skipped.append(f"M14B {r['question_id']}: missing")
            continue
        drift = [k for k, v in r["before_values"].items() if k != "manual_review_flags" and q.get(k) != v and q.get(k) != r["after_values"].get(k)]
        if drift:
            skipped.append(f"M14B {r['question_id']}: drift {drift}")
            continue
        changed = False
        for field, value in r["after_values"].items():
            if field == "manual_review_flags":
                for flag in value:
                    add_flag(q, flag)
                continue
            changed |= put(q, field, value, f"M14B field {field}")
        if changed:
            stats["M14B questions"] += 1


# --------------------------------------------------------------------------- M14C
def m14c(index):
    keep = {"id", "lesson_id", "cefr", "stage", "type", "correct_answer", "accepted_answers", "options", "prompt_en", "publishable"}
    for r in jsonl("M14C_C2_198_RATIONALE_CHANGESET.jsonl"):
        q = index.get(r["question_id"])
        cand = r["candidate"]
        if q is None or q.get("correct_answer") != cand.get("correct_answer") or q.get("options") != cand.get("options"):
            skipped.append(f"M14C {r['question_id']}: key/options differ")
            continue
        changed = False
        for field, value in cand.items():
            if field in keep:
                continue
            if field == "manual_review_flags":
                for flag in value:
                    add_flag(q, flag)
                continue
            changed |= put(q, field, value, f"M14C field {field}")
        if changed:
            stats["M14C questions"] += 1


# --------------------------------------------------------------------------- M14D
def m14d(index):
    for r in jsonl("M14D_P2_940_REVIEW_ONLY_CHANGESET.jsonl"):
        if r["disposition"] != "REVIEW_ONLY_EDIT_CANDIDATE" or not r["proposed_changes"]:
            continue
        q = index.get(r["question_id"])
        if q is None or q.get("correct_answer") != r["correct_answer_read_only"]:
            skipped.append(f"M14D {r['question_id']}: key differs")
            continue
        changed = False
        for field, value in r["proposed_changes"].items():
            original = r["original_fields"].get(field)
            if q.get(field) not in (original, value):
                skipped.append(f"M14D {r['question_id']}.{field}: drift")
                continue
            if isinstance(value, dict) and isinstance(q.get(field), dict) and set(value) != set(q[field]):
                skipped.append(f"M14D {r['question_id']}.{field}: option keys differ")
                continue
            changed |= put(q, field, value, f"M14D field {field}")
        if changed:
            stats["M14D questions"] += 1


# --------------------------------------------------------------------------- M14E
def b2_distractors(index):
    """Replace the doubled '-inging' distractor with a plausible wrong form."""
    for r in csv.DictReader((FIXES / "M14E_NEW_B2_20_DISTRACTOR_PROBLEMS.csv").open(encoding="utf-8-sig")):
        q = index[r["question_id"]]
        bad, key = r["defective_distractor"], q["correct_answer"]
        if bad not in q.get("options", []):
            continue
        lesson = r["lesson_id"]
        if lesson == "B2-06":  # might have been + V-ing about a finished past moment
            verb_ing = key.rsplit(" ", 1)[1]
            new = f"might still be {verb_ing}"
            why = f"Sai: “{new}” nói về hiện tại, không khớp mốc quá khứ “when the office closed”. Cần might (still) have been + V-ing để suy đoán việc đang diễn ra trong quá khứ."
        elif lesson == "B2-07":  # how long will ... have been V-ing by next Tuesday
            new = key.replace(" have been ", " be ")
            why = f"Sai: “{new}” là tương lai tiếp diễn, không diễn tả khoảng thời gian kéo dài tới mốc “by next Tuesday”. Cần will + S + have been + V-ing với how long."
        else:  # B2-15 participle clause, the subject does the action
            stem = key[:-3]
            participle = {"Scheduling": "Scheduled", "Proofreading": "Proofread", "Examining": "Examined", "Measuring": "Measured",
                          "Analyzing": "Analyzed", "Approving": "Approved", "Revising": "Revised"}.get(key, stem + "ed")
            new = participle
            why = f"Sai: “{new}” mang nghĩa bị động (được …), nhưng chủ ngữ chính là người trực tiếp thực hiện hành động. Mệnh đề phân từ chủ động dùng V-ing: “{key}”."
        if new in q["options"]:
            skipped.append(f"B2 {q['id']}: replacement already present")
            continue
        rename_option(q, bad, new, why)
        add_flag(q, "M14E_DISTRACTOR_REAUTHORED")
        stats["M14E B2 distractor re-authored"] += 1


# --------------------------------------------------------------------------- M26AF
def m26af(index):
    for p in json.loads((FIXES / "M26AF_3_SOURCE_REPAIR_PROPOSALS_PRIVATE.json").read_text(encoding="utf-8"))["patches"]:
        q = index[p["question_id"]]
        changed = False
        for field, value in p["updates"].items():
            changed |= put(q, field, value, f"M26AF field {field}")
        if changed:
            add_flag(q, "M26AF_SOURCE_REPAIRED")
            stats["M26AF source repairs"] += 1


# --------------------------------------------------------------------------- M26AG
def m26ag(index):
    proposals = json.loads((FIXES / "M26AG_PRIVATE_MACHINE_READABLE_PROPOSALS.json").read_text(encoding="utf-8"))
    for a in proposals["aliases"]:
        q = index[a["question_id"]]
        if not a["source_auto_gradable"] or not q.get("auto_gradable"):
            continue  # open/ungraded items keep self-review only
        accepted = q.setdefault("accepted_answers", [q["correct_answer"]])
        if a["base_answer_teacher_only"] not in accepted:
            skipped.append(f"M26AG {q['id']}: base answer no longer accepted")
            continue
        if a["candidate_answer_teacher_only"] not in accepted:
            accepted.append(a["candidate_answer_teacher_only"])
            add_flag(q, "M26AG_EQUIVALENT_FORM_ADDED")
            stats["M26AG equivalent answers added"] += 1


# --------------------------------------------------------------------------- one-offs from the M14E queue
def one_offs(index):
    # C1-12-Q055's missing "dosage recommendation" translation is fixed by M14D.
    q = index["A1-15-Q15"]
    if rename_option(q, "We bought a fruit for the trip.", "We bought a fruits for the trip.",
                     "Sai: “a” chỉ đi với danh từ số ít; “fruits” là số nhiều. Khi nói trái cây chung chung, dùng “some fruit”."):
        add_flag(q, "M14E_AMBIGUOUS_DISTRACTOR_FIXED")
        stats["A1-15-Q15 ambiguous distractor"] += 1


# --------------------------------------------------------------------------- M26E -> M25D passages
def m25d_passages():
    path = ROOT / "src/data/grammar-context-private/m25d-bank.json"
    bank = json.loads(path.read_text(encoding="utf-8"))
    cases = {c["id"]: c for c in bank["cases"]}
    patches = json.loads((FIXES / "m26e-m25d-source-patch-dry-run.json").read_text(encoding="utf-8"))["patch_candidates"]
    for p in patches:
        c = cases.get(p["case_id"])
        if c is None or p.get("needs_rewrite_question_and_answer_keys"):
            continue
        if p["old_fragment_en"] in c["passage_en"] and c["passage_en"].count(p["old_fragment_en"]) == 1:
            c["passage_en"] = c["passage_en"].replace(p["old_fragment_en"], p["proposed_fragment_en"])
            stats["M26E M25D passage fixes"] += 1
    path.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify(index):
    bad = [q["id"] for q in index.values() if q.get("options") and q.get("auto_gradable") and q["correct_answer"] not in q["options"]]
    dup = [q["id"] for q in index.values() if q.get("options") and len(set(q["options"])) != len(q["options"])]
    defects = {r["question_id"]: r["defective_distractor"] for r in csv.DictReader((FIXES / "M14E_NEW_B2_20_DISTRACTOR_PROBLEMS.csv").open(encoding="utf-8-sig"))}
    nonsense = [qid for qid, bad in defects.items() if bad in (index[qid].get("options") or [])]
    published = [q["id"] for q in index.values() if q.get("publishable") is not False]
    if bad or dup or nonsense or published:
        raise SystemExit(f"[BLOCKED] key-not-in-options={bad[:5]} duplicate-options={dup[:5]} inging={nonsense[:5]} published={published[:5]}")


def main():
    data, index = load_bank()
    m04(index)
    c1_12_dash_spacing(data)
    m14b(index)
    m14c(index)
    m14d(index)
    b2_distractors(index)
    m26af(index)
    m26ag(index)
    one_offs(index)
    verify(index)
    save_bank(data)
    m25d_passages()
    for key, value in sorted(stats.items()):
        print(f"{value:5d}  {key}")
    print(f"skipped: {len(skipped)}")
    for line in skipped[:40]:
        print("   ", line)
    (FIXES / "APPLIED_REPORT.json").write_text(json.dumps({"applied": stats, "skipped": skipped}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
