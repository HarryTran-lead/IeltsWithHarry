"""Repair Book 2 Unit 1 items found in a full learner walkthrough. Run after build-book-2.py.

- Vocabulary questions 13-20 shared the same three distractors, so the answer was the odd one out.
- Several gap fills accepted one word where a synonym is equally correct.
- One prompt asked for ONE OTHER WORD while its key has two words; one key listed "5 pm" for metres.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public/book-2/lessons"

# Distractors from the same lesson word list, chosen to be close in meaning so the learner has to know the term.
DISTRACTORS = {
    "B2-U01-R-E01-Q013": ["maintenance budget", "long-term evaluation", "urban regeneration"],
    "B2-U01-R-E01-Q014": ["measurable impact", "routine maintenance", "public consultation"],
    "B2-U01-R-E01-Q015": ["land use", "residential block", "public amenities"],
    "B2-U01-R-E01-Q016": ["shared facilities", "pedestrian access", "retail activity"],
    "B2-U01-R-E01-Q017": ["travel behaviour", "congestion", "pedestrian corridor"],
    "B2-U01-R-E01-Q018": ["pedestrian corridor", "public amenities", "traffic flow"],
    "B2-U01-R-E01-Q019": ["measurable impact", "insulation", "built environment"],
    "B2-U01-R-E01-Q020": ["maintenance budget", "routine maintenance", "causal relationship"],
}

ALTERNATIVES = {
    "B2-U01-R-E02-Q006": ["areas"],
    "B2-U01-W-E02-Q003": ["gradually", "consistently"],
    "B2-U01-W-E02-Q004": ["fall", "decrease", "drop", "reduction"],
    "B2-U01-W-E02-Q005": ["rose", "grew"],
    "B2-U01-W-E02-Q008": ["minor", "small"],
    "B2-U01-L-E03-Q009": ["ID"],
}

KEYS = {"B2-U01-L-E07-Q003": ["5"]}

PROMPTS = {
    "B2-U01-R-E06-Q005": "Apart from insulation, what mainly decided residents’ energy bills? Write NO MORE THAN TWO WORDS.",
}

# The phrase comes from passage A (previous lesson), so it must not point at passage C.
DETACH_SOURCE = {"B2-U01-R-E10-Q004": "Cụm này nằm trong đoạn D của bài A (bài học trước): kết quả chỉ là “an association”, chưa chứng minh nguyên nhân trực tiếp."}

MINI_REVIEW = {
    "b2-u01-r-l04": [{"en": "Can I explain each answer from its time signal (every Monday, right now, at the moment) or from a state verb?", "vi": "Tôi có giải thích được mỗi đáp án dựa vào dấu hiệu thời gian (every Monday, right now, at the moment) hoặc động từ trạng thái không?"}],
}

changed = 0
for path in sorted(ROOT.glob("b2-u01-*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    before = json.dumps(data, ensure_ascii=False)
    if path.stem in MINI_REVIEW:
        data["lesson"]["mini_review"] = MINI_REVIEW[path.stem]
    # Writing prompts named the chart by its internal ID ("W-HOUSING-01"); learners see the chart's title instead.
    titles = {source["id"]: source.get("title") for source in data["visuals"] if source.get("title")}
    for exercise in data["exercises"]:
        for item in exercise["questions"]:
            qid = item["question_id"]
            for source_id, title in titles.items():
                for key in ("prompt_en", "prompt_vi"):
                    if item.get(key):
                        item[key] = item[key].replace(source_id, f"“{title.strip()}”")
            if item["prompt_en"].startswith("Which term means") and item["prompt_en"].endswith(" in Vietnamese?"):
                item["prompt_en"] = "Which English term means" + item["prompt_en"][len("Which term means"):-len(" in Vietnamese?")] + "?"
            if qid in DISTRACTORS:
                item["options"] = [item["answer"]["accepted"][0], *DISTRACTORS[qid]]
            for extra in ALTERNATIVES.get(qid, []):
                if extra not in item["answer"]["accepted"]:
                    item["answer"]["accepted"].append(extra)
            if qid in KEYS:
                item["answer"]["accepted"] = KEYS[qid]
            if qid in PROMPTS:
                item["prompt_en"] = PROMPTS[qid]
            if qid in DETACH_SOURCE:
                item.pop("passage_id", None)
                item["explanation_vi"] = DETACH_SOURCE[qid]
    if json.dumps(data, ensure_ascii=False) != before:
        changed += 1
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

print(f"Updated {changed} Unit 1 lessons.")
