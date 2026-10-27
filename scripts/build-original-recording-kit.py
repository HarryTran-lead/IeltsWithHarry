"""Prepare a private human-voice recording kit from the owner-supplied pilot ZIP.

This never generates speech or approves the script for publication. Answer keys are
kept in a separate reviewer folder inside the output ZIP.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

STOCK_FILLER = {
    "This detail is important because it affects what people can do next.",
    "That brings us to the end of this part. Please review your notes before continuing.",
}


def words(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_zip", type=Path)
    parser.add_argument("output_zip", type=Path)
    args = parser.parse_args()
    data = args.source_zip.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    rows: list[dict[str, str | int]] = []
    removed_total = 0
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(args.output_zip, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for number in range(1, 6):
            paper_id = f"ESL-L-{number:02}"
            path = f"english-skill-lab-pilot/content/{paper_id}.json"
            paper = json.loads(source.read(path))
            if paper["skill"] != "listening" or len(paper["parts"]) != 4:
                raise ValueError(f"Unexpected Listening paper: {paper_id}")
            for index, part in enumerate(paper["parts"], start=1):
                if part.get("audio"):
                    raise ValueError(f"Audio reference needs separate verification: {paper_id} part {index}")
                retained = [line for line in part["script"] if line["text"].strip() not in STOCK_FILLER]
                removed = len(part["script"]) - len(retained)
                removed_total += removed
                script_text = " ".join(line["text"] for line in retained)
                for question in part["questions"]:
                    evidence = question.get("evidence", "")
                    if question["answer"] != "NOT GIVEN" and evidence and evidence.casefold() not in script_text.casefold():
                        raise ValueError(f"Removing a line would lose the cue for {paper_id} Q{question['number']}")
                speakers = list(dict.fromkeys(line["speaker"] for line in retained))
                script_lines = [
                    f"# {paper_id} · Part {index}: {part['title']}",
                    "",
                    "**EDITORIAL DRAFT — do not record until a human editor approves the dialogue.**",
                    f"Roles: {', '.join(speakers)}. Current spoken text: {words(script_text)} words (about {words(script_text) / 135:.1f} minutes at 135 wpm, before pauses).",
                    f"Stock filler lines removed: {removed}. Check the joins and add natural context without changing the answer cues or their order.",
                    "",
                    "## Recording direction",
                    "",
                    "- Use real consenting performers. Keep speakers distinct but avoid exaggerated accents or character voices.",
                    "- Rehearse as a conversation or talk, with natural breaths, overlap only where intelligible, and no synthetic voice processing.",
                    "- Add preparation pauses during editing. Do not read headings, directions or reviewer answer sheets aloud.",
                    "- Check every name, spelling and number against the separate reviewer sheet after recording.",
                    "- Expand the interaction naturally before calling it a full-length Listening paper; the supplied pilot is short.",
                    "",
                    "## Spoken script (working copy)",
                    "",
                ]
                script_lines += [f"{line_number:02}. **{line['speaker']}:** {line['text']}" for line_number, line in enumerate(retained, start=1)]
                review_lines = [
                    f"# Private reviewer cues · {paper_id} Part {index}",
                    "",
                    "**Do not give this sheet to performers or include it in learner downloads.**",
                    "",
                    "| Q | Type | Answer | Evidence to hear in the final recording |",
                    "| --- | --- | --- | --- |",
                ]
                for question in part["questions"]:
                    safe = lambda value: str(value).replace("|", "\\|").replace("\n", " ")
                    review_lines.append(f"| {question['number']} | {safe(question['type'])} | {safe(question['answer'])} | {safe(question.get('evidence', ''))} |")
                review_lines += [
                    "", "## Sign-off", "", "- [ ] Dialogue copyedited and answer cue order unchanged",
                    "- [ ] Rights and performer consent documented", "- [ ] Every answer cue audible and unambiguous",
                    "- [ ] Names and numbers independently checked", "- [ ] No robotic pacing or noticeable edit joins",
                    "- [ ] Final MP3 duration, loudness and playback reviewed by ear", "",
                ]
                output.writestr(f"actor-scripts/{paper_id}_P{index}.md", "\n".join(script_lines).encode("utf-8"))
                output.writestr(f"private-reviewer-keys/{paper_id}_P{index}_QA.md", "\n".join(review_lines).encode("utf-8"))
                rows.append({
                    "paper": paper_id, "part": index, "scene": part["title"], "speakers": "; ".join(speakers),
                    "questions": len(part["questions"]), "words_after_filler_removal": words(script_text),
                    "estimated_spoken_minutes_at_135_wpm": f"{words(script_text) / 135:.1f}",
                    "removed_stock_lines": removed, "expected_mp3": f"{paper_id}_P{index}.mp3",
                    "status": "EDITORIAL_HOLD_NO_AUDIO",
                })
        if len(rows) != 20 or sum(int(row["questions"]) for row in rows) != 200:
            raise ValueError("Unexpected part or question count")
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        output.writestr("recording-plan.csv", buffer.getvalue().encode("utf-8-sig"))
        readme = f"""# IeltsWithHarry · Human recording kit (editorial draft)

Source ZIP SHA-256: `{digest}`. Five Listening papers, 20 parts and 200 questions. **There are no MP3s in the source or this kit.**

`actor-scripts/` contains a working script for each part. `private-reviewer-keys/` contains answer cues and must be kept away from performers and learners. `recording-plan.csv` lists roles, estimated speaking time and expected MP3 names.

The source repeats generic filler lines. This kit removed {removed_total} exact stock lines while verifying that every non-NOT-GIVEN evidence quote remains in the spoken text. It has **not** rewritten every conversation. A human editor must smooth the joins, correct implausible speaker turns, expand the very short passages, and ensure the final dialogue sounds like real people before recording.

Record with consenting human speakers and written distribution rights. Review each final MP3 by ear against its private cue sheet. Only then upload it to the IELTS audio bucket and attach its URL to the exam draft. Do not use browser TTS or AI-generated voices as substitutes.
"""
        output.writestr("README.md", readme.encode("utf-8"))
    print(json.dumps({"zip": str(args.output_zip), "parts": len(rows), "questions": 200, "removed_stock_lines": removed_total, "source_sha256": digest}))


if __name__ == "__main__":
    main()
