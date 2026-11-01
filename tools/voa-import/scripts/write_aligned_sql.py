#!/usr/bin/env python3
"""Generate SQL that replaces estimated preview segments in the isolated dev DB."""
import argparse
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data"
DEV_PROJECT = "bhactqaxcvusmpeooxwi"


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", type=int, nargs="*", default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    results = [json.loads(line) for line in (ROOT / "aligned_sentences.jsonl").read_text(encoding="utf-8").splitlines() if line]
    if args.ids:
        results = [result for result in results if result["id"] in args.ids]
    if not results:
        raise ValueError("No aligned lessons selected")
    sql = [f"-- Development project only: {DEV_PROJECT}", "begin;"]
    for result in results:
        if not result["sentences"] or result["match_rate"] < 0.7:
            raise ValueError(f"Unusable alignment: {result['id']}")
        marker = str(uuid.uuid5(uuid.NAMESPACE_URL, result["url"] + "#sentence-1"))
        values = []
        previous_end = -1
        for sentence in result["sentences"]:
            if sentence["start_ms"] < previous_end or sentence["end_ms"] <= sentence["start_ms"]:
                raise ValueError(f"Overlapping or empty segment: {result['id']}")
            previous_end = sentence["end_ms"]
            sentence_id = str(uuid.uuid5(uuid.NAMESPACE_URL, result["url"] + f"#sentence-{sentence['ordinal']}"))
            values.append(f"({literal(sentence_id)}::uuid, v_lesson, {sentence['ordinal']}, "
                          f"{sentence['start_ms']}, {sentence['end_ms']}, "
                          f"{literal(sentence['reference_text'])}, {literal(sentence['speaker'])})")
        sql.extend([
            "do $voa$ declare v_lesson uuid; begin",
            "  select id into v_lesson from public.voa_dictation_lessons",
            f"  where source_url = {literal(result['url'])} and status = 'uploaded' for update;",
            f"  if v_lesson is null then raise exception 'Dev uploaded lesson {result['id']} missing'; end if;",
            f"  if not exists (select 1 from public.voa_dictation_segments where lesson_id = v_lesson and id = {literal(marker)}::uuid) then",
            "    delete from public.voa_dictation_segments where lesson_id = v_lesson;",
            "    insert into public.voa_dictation_segments(id,lesson_id,ordinal,start_ms,end_ms,reference_text,speaker) values",
            "      " + ",\n      ".join(values) + ";",
            "    update public.voa_dictation_lessons set timings_verified = false,",
            "      review_notes = 'Dev Preview: word-level ASR alignment; transcript and boundaries need human review.'",
            "    where id = v_lesson;",
            "  end if;",
            "end $voa$;",
        ])
    sql.append("commit;")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(sql) + "\n", encoding="utf-8")
    print(f"Wrote {len(results)} development lessons to {args.output}")


if __name__ == "__main__":
    main()
