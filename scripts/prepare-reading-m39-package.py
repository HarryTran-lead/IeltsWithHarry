"""Convert the owner-supplied M39 ZIP to a private seven-test admin import JSON.

Usage: python scripts/prepare-reading-m39-package.py INPUT.zip OUTPUT.json
The output contains answer keys. Keep it out of git and upload it only via admin.
"""

import json
import re
import sys
import zipfile
from pathlib import Path


TYPE_NAMES = {
    "tfng": "true_false_not_given",
    "ynng": "yes_no_not_given",
    "mcq": "multiple_choice",
    "multiple_choice_single": "multiple_choice",
    "multi_select": "multiple_answers",
    "diagram_completion": "diagram_labelling",
}
DIAGRAM_URL = "https://ieltswithharry.vercel.app/images/ielts/reading/m39-canal-lock-diagram.png"


def option_list(value):
    if isinstance(value, dict):
        return [f"{key} — {label}" for key, label in value.items()]
    if isinstance(value, list):
        result = []
        for entry in value:
            if isinstance(entry, dict):
                result.append(f"{entry['label']} — {entry['text']}")
            elif isinstance(entry, list) and len(entry) == 2:
                result.append(f"{entry[0]} — {entry[1]}")
            else:
                result.append(str(entry))
        return result
    return []


def numbers(group):
    return group.get("numbers") or list(range(group["start"], group["end"] + 1))


def convert(source, teacher, test_number):
    if len(source["passages"]) != 3 or len(source["questions"]) != 40 or len(teacher["questions"]) != 40:
        raise ValueError(f"Test {test_number}: expected three passages and 40 questions")
    keyed = {item["number"]: item for item in teacher["questions"]}
    grouped = {number: group for group in source["groups"] for number in numbers(group)}
    if set(keyed) != set(range(1, 41)) or {item["number"] for item in source["questions"]} != set(keyed) or set(grouped) != set(keyed):
        raise ValueError(f"Test {test_number}: incomplete or duplicate question numbering")
    sections = []
    for passage in source["passages"]:
        passage_number = passage["number"]
        questions = []
        for item in source["questions"]:
            if item["passage"] != passage_number:
                continue
            number = item["number"]
            key = keyed[number]
            if item["question_id"] != key["question_id"] or item["type"] != key["type"] or (item.get("prompt") or item.get("stem")) != (key.get("prompt") or key.get("stem")):
                raise ValueError(f"Test {test_number} Q{number}: student and teacher versions differ")
            group = grouped[number]
            kind = re.sub(r"[\s-]+", "_", item["type"].strip().lower())
            kind = TYPE_NAMES.get(kind, kind)
            choices = option_list(item.get("options") or group.get("options"))
            if kind == "matching_information" and not choices:
                choices = [paragraph.get("letter") or paragraph["label"] for paragraph in passage["paragraphs"]]
            if kind == "matching_features" and not choices:
                choices = [f"{letter} — {label.strip(' ,')}" for letter, label in re.findall(
                    r"\b([A-D])\s+([^,.;]+?)(?=,\s*[A-D]\s+|,?\s+or\s+[A-D]\s+|[.;]|$)", group["instructions"]
                )]
            prompt = item.get("prompt") or item.get("stem")
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError(f"Test {test_number} Q{number}: missing question text")
            raw_answer = key["answer"]
            answers = [str(value) for value in (raw_answer if isinstance(raw_answer, list) else [raw_answer])]
            answers += [str(value) for value in key.get("acceptable_alternatives", [])]
            # The passage says "a mechanical defect"; both this two-word phrase and
            # "defect" satisfy Test 06 Q13's NO MORE THAN TWO WORDS instruction.
            if test_number == 6 and number == 13 and "defect" in [value.lower() for value in answers]:
                answers.append("mechanical defect")
            answers = list(dict.fromkeys(answers))
            explanation = key.get("explanation_vi") or key.get("explanation_en") or ""
            if key.get("evidence_quote"):
                explanation += f"\n\nDẫn chứng ({key.get('evidence_paragraph', 'bài đọc')}): “{key['evidence_quote']}”"
            question = {
                "id": f"ESL-READING-{test_number:03d}-Q{number:02d}",
                "number": number,
                "type": kind,
                "prompt": prompt,
                "instructions": group["instructions"],
                "options": choices,
                "answers": answers,
                "explanation": explanation.strip(),
            }
            if group.get("word_limit"):
                question["wordLimit"] = str(group["word_limit"])
            if kind == "multiple_answers":
                question["group"] = f"ESL-READING-{test_number:03d}-{group.get('id') or group.get('group_id') or numbers(group)[0]}"
            if group.get("diagram_asset"):
                if group["diagram_asset"] != "assets/canal_lock_diagram.png":
                    raise ValueError(f"Test {test_number} Q{number}: unknown diagram asset")
                question["mediaUrl"] = DIAGRAM_URL
                question["mediaReference"] = group.get("diagram_alt_text") or "Canal lock diagram"
            questions.append(question)
        sections.append({
            "id": f"ESL-READING-{test_number:03d}-P{passage_number}",
            "title": f"Passage {passage_number}: {passage['title']}",
            "passage": "\n\n".join(f"**{paragraph.get('letter') or paragraph['label']}** {paragraph['text']}" for paragraph in passage["paragraphs"]),
            "transcript": "",
            "questions": questions,
        })
    return {
        "externalId": f"english-skill-lab-reading-{test_number:03d}",
        "skill": "Reading",
        "title": f"English Skill Lab · Reading Test {test_number:02d}",
        "format": "Academic",
        "mode": "practice",
        "durationMinutes": 60,
        "sourceUrl": "https://ieltswithharry.vercel.app",
        "license": "Owner-supplied original IELTS-style practice; not an official IELTS exam",
        "licenseUrl": "https://ieltswithharry.vercel.app",
        "attribution": "English Skill Lab · Bản luyện thử chưa hiệu chuẩn",
        "content": {"sections": sections, "prompt": ""},
    }


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    archive, destination = map(Path, sys.argv[1:])
    with zipfile.ZipFile(archive) as package:
        damaged = package.testzip()
        if damaged:
            raise ValueError(f"Corrupt ZIP entry: {damaged}")
        gate = json.loads(package.read("m39/outputs/M39_GATE_CONSOLE.json"))
        if gate.get("can_publish") is not False:
            raise ValueError("Unexpected M39 release-gate state")
        exams = [convert(
            json.loads(package.read(f"candidate_student_only/TEST{number:02d}_STUDENT_ONLY.json")),
            json.loads(package.read(f"server_only/TEST{number:02d}_TEACHER_MASTER_SERVER_ONLY.json")),
            number,
        ) for number in range(1, 8)]
        if "assets/canal_lock_diagram.png" not in package.namelist():
            raise ValueError("Required diagram asset missing")
    bundle = {
        "kind": "ielts-reading-admin-bundle",
        "qualityFlags": ["M39 STAGING_ONLY · chưa hiệu chuẩn · 69 câu chờ phản biện"] * len(exams),
        "independentReviewCompleted": False,
        "exams": exams,
    }
    destination.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    print(f"Prepared {len(exams)} tests, {sum(len(section['questions']) for exam in exams for section in exam['content']['sections'])} questions: {destination}")


if __name__ == "__main__":
    main()
