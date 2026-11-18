"""Build private admin files for the owner-supplied five-step Reading explanations.

Usage:
  python -I -X utf8 scripts/prepare-reading-five-step.py SNAPSHOT_DIR EXPLANATIONS_DIR OUTPUT_DIR

SNAPSHOT_DIR      the extracted M00_SOURCE_SNAPSHOTS_SERVER_ONLY.zip (source_snapshots/...)
EXPLANATIONS_DIR  SERVER_ONLY_DO_NOT_UPLOAD_PUBLIC/explanations (TEST01..TEST12/Qnn.json)
OUTPUT_DIR        a private folder outside the repository

Writes two files that contain answer keys. Never commit them; upload them only on
the admin page:
  reading-five-step-attach-01-10.json  explanations for tests 01–10, attached on the
                                       server to the live published versions after
                                       every answer is checked against the live key
  reading-tests-11-12.json             tests 11 and 12 as a Reading admin bundle,
                                       with the five steps on every question

Every check fails closed: a changed student file, an answer that differs from the
teacher key, a missing question or a malformed record stops the whole build.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

TEST_RANGE = range(1, 13)


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def norm(value):
    return re.sub(r"\s+", " ", str(value)).strip().lower()


def plain(text):
    return re.sub(r"\s+", " ", re.sub(r"\*\*[^*]+\*\*", "", text)).strip().lower()


def five_step(record, passage_text):
    """The five steps as the review shows them; only verbatim evidence quotes are highlighted."""
    steps = record["steps"]
    paragraph_text = plain(passage_text)
    quotes = []
    for span in steps["evidence"]["spans"]:
        # Paraphrase anchors are editorial shorthand awaiting review, never highlighted as quotes.
        if span.get("role") == "paraphrase_anchor":
            continue
        quote = span.get("exact_quote", "").strip()
        if not quote:
            continue
        quotes.append({"paragraph": span.get("paragraph_id", ""), "quote": quote, "role": span.get("role", "supports"), "exact": norm(quote) in paragraph_text})
    final = steps["final"]
    answer = record["answer"]["canonical"]
    return {
        "understand": {"en": steps["understand"]["en"], "vi": steps["understand"]["vi"]},
        "wordClass": {"en": steps["word_class"]["en"], "vi": steps["word_class"]["vi"]},
        "paraphrase": {"en": steps["paraphrase"]["en"], "vi": steps["paraphrase"]["vi"], "pairs": [
            {"question": pair["question_expression"], "passage": pair["passage_expression"]}
            for pair in steps["paraphrase"].get("mappings", []) if pair.get("question_expression") and pair.get("passage_expression")
        ]},
        "evidence": {"en": steps["evidence"]["en"], "vi": steps["evidence"]["vi"], "quotes": quotes},
        "final": {
            "en": final["en"], "vi": final["vi"],
            "answer": ", ".join(answer) if isinstance(answer, list) else str(answer),
            "trapEn": final.get("common_trap_en", ""), "trapVi": final.get("common_trap_vi", ""),
            "tipEn": final.get("transfer_tip_en", ""), "tipVi": final.get("transfer_tip_vi", ""),
        },
    }


def records_for(explanations_dir, test_number, student_path):
    folder = Path(explanations_dir) / f"TEST{test_number:02d}"
    student_sha = hashlib.sha256(Path(student_path).read_bytes()).hexdigest()
    records = {}
    for number in range(1, 41):
        record = load(folder / f"Q{number:02d}.json")
        if record.get("question_number") != number or not str(record.get("test_id", "")).endswith(f"{test_number:03d}"):
            raise ValueError(f"Test {test_number:02d} Q{number}: explanation is filed under the wrong question")
        if record["source_lock"]["student_file_sha256"] != student_sha:
            raise ValueError(f"Test {test_number:02d} Q{number}: explanation was written for a different student file")
        for step in ("understand", "word_class", "paraphrase", "evidence", "final"):
            if not record["steps"][step].get("en") or not record["steps"][step].get("vi"):
                raise ValueError(f"Test {test_number:02d} Q{number}: step {step} is missing a language")
        records[number] = record
    return records


def answers_match(record, answers, key=None, records=None):
    """The explanation's answer must be the teacher's. A choose-several set is compared
    with the letters keyed across every question of that set, in any order."""
    canonical = record["answer"]["canonical"]
    wanted = canonical if isinstance(canonical, list) else [canonical]
    have = {norm(value) for value in answers}
    if record["answer"].get("grading_mode") == "UNORDERED_MULTI_SELECT" and key and records:
        members = [number for number, other in records.items() if other["answer"]["canonical"] == canonical]
        have = {norm(value) for number in members for value in key[number]}
        return have == {norm(value) for value in wanted} and len(members) == len(wanted)
    return all(norm(value) in have for value in wanted)


def teacher_answers(test_number, teacher):
    """Question number → accepted answers, from either teacher-key layout."""
    if isinstance(teacher.get("questions"), list):
        out = {}
        for item in teacher["questions"]:
            raw = item["answer"]
            out[item["number"]] = [str(value) for value in (raw if isinstance(raw, list) else [raw])] + [str(value) for value in item.get("acceptable_alternatives", [])]
        return out
    answers = teacher["answers"]
    if isinstance(answers, dict):
        return {value["number"]: [str(value["correct_answer"])] for value in answers.values()}
    return {int(value["id"][1:]): [str(value["answer"])] for value in answers}


# --- Tests 11 and 12 come in their own layouts -----------------------------------------

TYPE_11 = {
    "true_false_not_given": "true_false_not_given", "yes_no_not_given": "yes_no_not_given",
    "note_completion": "note_completion", "sentence_completion": "sentence_completion",
    "matching_headings": "matching_headings", "multiple_choice_single": "multiple_choice",
}
TYPE_12 = {
    "TFNG": "true_false_not_given", "YNNG": "yes_no_not_given", "NOTE": "note_completion",
    "SENTENCE": "sentence_completion", "HEADING": "matching_headings", "MATCH_INFO": "matching_information", "MCQ": "multiple_choice",
}


def instructions_12(kind, passage_number, letters, roman):
    """Test 12 carries no instruction lines; these are the standard IELTS wordings for each task type."""
    if kind == "true_false_not_given":
        return f"Do the following statements agree with the information given in Reading Passage {passage_number}? Write TRUE, FALSE or NOT GIVEN."
    if kind == "yes_no_not_given":
        return "Do the following statements agree with the views of the writer? Write YES, NO or NOT GIVEN."
    if kind == "note_completion":
        return f"Complete the notes. Choose ONE WORD ONLY from Reading Passage {passage_number} for each answer."
    if kind == "sentence_completion":
        return f"Complete each sentence using ONE WORD ONLY from Reading Passage {passage_number}."
    if kind == "matching_information":
        return f"Reading Passage {passage_number} has {len(letters)} paragraphs, {letters[0]}–{letters[-1]}. Which paragraph contains the following information? Write the correct letter, {letters[0]}–{letters[-1]}. NB You may use any letter more than once."
    if kind == "matching_headings":
        return f"Choose the correct heading for each paragraph from the list of headings below. Write the correct number, {roman[0]}–{roman[-1]}. There are more headings than paragraphs."
    return "Choose the correct letter, A, B, C or D."


def convert_new(test_number, student, teacher, records):
    key = teacher_answers(test_number, teacher)
    sections = []
    for index, passage in enumerate(student["passages"], start=1):
        paragraphs = passage["paragraphs"]
        letters = [paragraph.get("letter") or paragraph.get("label") for paragraph in paragraphs]
        passage_text = "\n\n".join(f"**{letter}** {paragraph['text']}" for letter, paragraph in zip(letters, paragraphs))
        own = [item for item in student["questions"] if (item.get("passage_id") == passage["id"] if passage.get("id") else int(item.get("passage", 0)) == index)]
        questions = []
        for item in own:
            number = item.get("number") or int(item["id"][1:])
            if test_number == 11:
                kind = TYPE_11[item["type"]]
                instruction = item["instruction"]
                options = item.get("options") or item.get("heading_options") or {}
                choices = [f"{option_key} — {label}" for option_key, label in options.items()] if isinstance(options, dict) else []
                prompt = item["prompt"]
            else:
                kind = TYPE_12[item["type"]]
                prompt = item["prompt"]
                roman = []
                choices = []
                if kind == "matching_headings":
                    for heading in student["headings_passage_3"]:
                        found = re.match(r"^([ivxl]+)\.\s+(.*)$", heading.strip())
                        if not found:
                            raise ValueError(f"Test 12: unreadable heading {heading!r}")
                        roman.append(found[1])
                        choices.append(f"{found[1]} — {found[2]}")
                elif kind == "matching_information":
                    choices = list(letters)
                elif kind == "multiple_choice":
                    lines = prompt.split("\n")
                    stem = [line for line in lines if not re.match(r"^[A-D]\.\s", line.strip())]
                    choices = [re.sub(r"^([A-D])\.\s+", r"\1 — ", line.strip()) for line in lines if re.match(r"^[A-D]\.\s", line.strip())]
                    if len(choices) != 4:
                        raise ValueError(f"Test 12 Q{number}: expected four options")
                    prompt = "\n".join(stem).strip()
                instruction = instructions_12(kind, index, letters, roman or ["i", "x"])
            if kind == "matching_information" and not choices:
                choices = list(letters)
            answers = key[number]
            record = records[number]
            if not answers_match(record, answers, key, records):
                raise ValueError(f"Test {test_number:02d} Q{number}: explanation answer {record['answer']['canonical']} differs from the teacher key {answers}")
            question = {
                "id": f"ESL-READING-{test_number:03d}-Q{number:02d}",
                "number": number,
                "type": kind,
                "prompt": prompt,
                "instructions": instruction,
                "options": choices,
                "answers": answers,
                "explanation": record["steps"]["final"]["vi"],
                "fiveStep": five_step(record, passage_text),
            }
            if kind in ("note_completion", "sentence_completion"):
                question["wordLimit"] = "ONE WORD ONLY"
            questions.append(question)
        if not questions:
            raise ValueError(f"Test {test_number:02d} Passage {index}: no questions")
        sections.append({
            "id": f"ESL-READING-{test_number:03d}-P{index}",
            "title": f"Passage {index}: {passage['title']}",
            "passage": passage_text,
            "transcript": "",
            "questions": sorted(questions, key=lambda question: question["number"]),
        })
    if sum(len(section["questions"]) for section in sections) != 40:
        raise ValueError(f"Test {test_number:02d}: expected 40 questions")
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
        "attribution": "English Skill Lab",
        "content": {"sections": sections, "prompt": ""},
    }


def attach_items(test_number, student, teacher, records):
    """Explanations for a test already on the site, keyed by its question ids, checked against the teacher key."""
    key = teacher_answers(test_number, teacher)
    passages = {}
    for passage in student["passages"]:
        number = passage.get("number")
        text = " ".join(paragraph["text"] for paragraph in passage["paragraphs"])
        passages[int(number) if number is not None else len(passages) + 1] = text
    items = []
    for number in range(1, 41):
        record = records[number]
        if not answers_match(record, key[number], key, records):
            raise ValueError(f"Test {test_number:02d} Q{number}: explanation answer {record['answer']['canonical']} differs from the teacher key {key[number]}")
        canonical = record["answer"]["canonical"]
        items.append({
            "questionId": f"ESL-READING-{test_number:03d}-Q{number:02d}",
            "number": number,
            "answers": canonical if isinstance(canonical, list) else [canonical],
            "fiveStep": five_step(record, passages.get(record.get("passage_number"), " ".join(passages.values()))),
        })
    return items


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    snapshot_dir, explanations_dir, output_dir = map(Path, sys.argv[1:])
    base = snapshot_dir / "source_snapshots"
    output_dir.mkdir(parents=True, exist_ok=True)
    attach, new_exams = [], []
    for test_number in TEST_RANGE:
        student_path = base / "public_student" / f"TEST{test_number:02d}" / "student.json"
        student = load(student_path)
        teacher = load(base / "server_only" / f"TEST{test_number:02d}" / "teacher_master.json")
        records = records_for(explanations_dir, test_number, student_path)
        if test_number <= 10:
            attach.append({"externalId": f"english-skill-lab-reading-{test_number:03d}", "title": f"English Skill Lab · Reading Test {test_number:02d}", "items": attach_items(test_number, student, teacher, records)})
        else:
            new_exams.append(convert_new(test_number, student, teacher, records))
    attach_file = output_dir / "reading-five-step-attach-01-10.json"
    attach_file.write_text(json.dumps({"kind": "ielts-reading-explanations-bundle", "independentReviewCompleted": False, "exams": attach}, ensure_ascii=False), encoding="utf-8")
    bundle_file = output_dir / "reading-tests-11-12.json"
    bundle_file.write_text(json.dumps({"kind": "ielts-reading-admin-bundle", "qualityFlags": ["STAGING_ONLY · chưa thẩm định độc lập"] * len(new_exams), "independentReviewCompleted": False, "exams": new_exams}, ensure_ascii=False), encoding="utf-8")
    quotes = [quote for exam in attach for item in exam["items"] for quote in item["fiveStep"]["evidence"]["quotes"]] + [quote for exam in new_exams for section in exam["content"]["sections"] for question in section["questions"] for quote in question["fiveStep"]["evidence"]["quotes"]]
    print(f"Attach: {len(attach)} tests, {sum(len(exam['items']) for exam in attach)} explanations -> {attach_file} ({attach_file.stat().st_size // 1024} KB)")
    print(f"New tests: {len(new_exams)}, {sum(len(section['questions']) for exam in new_exams for section in exam['content']['sections'])} questions -> {bundle_file} ({bundle_file.stat().st_size // 1024} KB)")
    print(f"Evidence quotes: {len(quotes)}, verbatim in passage: {sum(1 for quote in quotes if quote['exact'])}")


if __name__ == "__main__":
    main()
