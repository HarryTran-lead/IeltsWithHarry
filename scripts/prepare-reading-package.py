"""Convert the supplied English Skill Lab ZIP into the admin's bulk JSON format.

Usage: python scripts/prepare-reading-package.py INPUT.zip OUTPUT.json
The output includes answer keys and must only be uploaded through the admin page.
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
    "multi_select": "multiple_choice",
}

SUMMARY_03 = (
    "The writer distinguishes the value of a forecast from a causal account. "
    "Predictive claims can be tested against what (33) ______ happens, but performance "
    "may weaken under (34) ______ when new cases no longer resemble those used to "
    "train a model. The writer warns that explanations constructed merely to justify "
    "a model output may be (35) ______. Rather than treating prediction and explanation "
    "as rivals, the conclusion presents them as (36) ______."
)


def options(value):
    if isinstance(value, dict):
        return [f"{key} — {text}" for key, text in value.items()]
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


def normalize(source, teacher, number):
    answers = {item["number"]: item for item in teacher["questions"]}
    groups = {n: group for group in source["question_groups"] for n in group["numbers"]}
    sections = []
    for passage in source["passages"]:
        passage_number = passage["number"]
        questions = []
        for item in source["questions"]:
            if item["passage"] != passage_number:
                continue
            n = item["number"]
            group = groups[n]
            key = answers[n]
            kind = re.sub(r"[\s-]+", "_", item["type"].lower())
            kind = TYPE_NAMES.get(kind, kind)
            choices = options(item.get("options") or group.get("options"))
            if kind == "matching_information" and not choices:
                choices = [paragraph["letter"] for paragraph in passage["paragraphs"]]
            if kind == "matching_features" and not choices:
                choices = [f"{letter} — {label}" for letter, label in re.findall(
                    r"\b([A-D])\s+([^,.;]+?)(?=,\s*[A-D]\s+|\.|$)", group["instructions"]
                )]
            instructions = group["instructions"]
            prompt = item["prompt"]
            if number == 3 and 33 <= n <= 36:
                # The source JSON omitted this shared paragraph; the student DOCX contains it.
                # A numbered carrier renders four editable gaps in the learner interface.
                prompt = re.sub(r"\((3[3-6])\)", r"**\1**", SUMMARY_03) if n == 33 else f"Blank {n}"
            raw_answer = key["answer"]
            answer = raw_answer if isinstance(raw_answer, list) else [str(raw_answer)]
            explanation = key.get("explanation_vi") or key.get("explanation_en") or ""
            question = {
                "id": f"ESL-READING-{number:03d}-Q{n:02d}",
                "number": n,
                "type": kind,
                "prompt": prompt,
                "instructions": instructions,
                "options": choices,
                "answers": [str(value) for value in answer],
                "explanation": explanation,
            }
            if group.get("word_limit"):
                question["wordLimit"] = str(group["word_limit"])
            if item["type"] == "multi_select":
                question["group"] = f"ESL-READING-{number:03d}-Q24-26"
            questions.append(question)
        sections.append({
            "id": f"ESL-READING-{number:03d}-P{passage_number}",
            "title": f"Passage {passage_number}: {passage['title']}",
            "passage": "\n\n".join(f"**{p['letter']}** {p['text']}" for p in passage["paragraphs"]),
            "transcript": "",
            "questions": questions,
        })
    exam = {
        "externalId": f"english-skill-lab-reading-{number:03d}",
        "skill": "Reading",
        "title": f"English Skill Lab · Reading Test {number:02d}",
        "format": "Academic",
        "mode": "synthetic_mock",
        "durationMinutes": 60,
        "sourceUrl": "https://ieltswithharry.vercel.app",
        "license": "All rights reserved",
        "licenseUrl": "https://ieltswithharry.vercel.app",
        "attribution": "English Skill Lab · IELTS-style original practice",
        "content": {"sections": sections, "prompt": ""},
    }
    assert len(sections) == 3
    assert len([q for s in sections for q in s["questions"]]) == 40
    assert all(q["answers"] for s in sections for q in s["questions"])
    assert len({q["id"] for s in sections for q in s["questions"]}) == 40
    return exam


def main():
    archive, destination = map(Path, sys.argv[1:3])
    exams = []
    with zipfile.ZipFile(archive) as package:
        validation = json.loads(package.read("PACKAGE_VALIDATION.json"))
        for number in range(1, 6):
            prefix = f"test_{number:02d}"
            student = json.loads(package.read(f"{prefix}/data/student_full_test.json"))
            teacher = json.loads(package.read(f"{prefix}/server_only/teacher_master.json"))
            exams.append(normalize(student, teacher, number))
    destination.write_text(json.dumps({
        "kind": "ielts-reading-admin-bundle",
        "qualityFlags": [item["publication_status"] for item in validation["tests"]],
        "independentReviewCompleted": validation.get("independent_review_completed", False),
        "exams": exams,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"Prepared {len(exams)} Reading tests and 200 questions: {destination}")


if __name__ == "__main__":
    main()
