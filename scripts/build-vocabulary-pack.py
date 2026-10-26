"""Build an English vocabulary source pack for editorial IELTS topic review.

Inputs are deliberately kept outside the app bundle in deliverables/vocabulary-source-cache.
Install openpyxl, then run: python scripts/build-vocabulary-pack.py
"""

from __future__ import annotations

import collections
import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import date
from pathlib import Path
from urllib.parse import quote

from openpyxl import load_workbook
from wordfreq import zipf_frequency


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "deliverables" / "vocabulary-source-cache"
OUTPUT = ROOT / "deliverables" / "IeltsWithHarry_Vocabulary_Topics_Level_1-7plus.zip"
CEFR_FILE = SOURCE / "CEFRJ_wordlist_ver1.6.zip"
OCTANOVE_FILE = SOURCE / "octanove-vocabulary-profile-c1c2-1.0.csv"
WORDNET_FILE = SOURCE / "english-wordnet-2025-json.zip"
CATALOG_FILE = ROOT / "src" / "lib" / "vocabulary" / "catalog.json"

SOURCE_URLS = {
    "cefr_j": "https://www.cefr-j.org/data/CEFRJ_wordlist_ver1.6.zip",
    "octanove": "https://github.com/openlanguageprofiles/olp-en-cefrj/blob/master/octanove-vocabulary-profile-c1c2-1.0.csv",
    "wordnet": "https://en-word.net/downloads/english-wordnet-2025-json.zip",
    "ielts": "https://ielts.org/organisations/ielts-for-organisations/compare-ielts/ielts-and-the-cefr",
}

# Internal learning sequence. These numbers are not IELTS scores.
STUDY_LEVELS = ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Level 7+"]
STUDY_LANE = {"A1": "Level 1", "A2": "Level 2", "B2": "Level 5", "C1": "Level 6", "C2": "Level 7+"}
B1_COMMON_ZIPF = 4.2


def study_level(headword: str, cefr: str) -> str:
    if cefr == "B1":
        # Split the large B1 source group by English usage frequency. A Zipf score
        # of 4.2 is roughly one occurrence per 63,000 words in the source corpus.
        word = headword.split("/", 1)[0]
        return "Level 3" if zipf_frequency(word, "en") >= B1_COMMON_ZIPF else "Level 4"
    return STUDY_LANE[cefr]
POS_CODE = {"noun": "n", "verb": "v", "adjective": "a", "adverb": "r"}

TOPIC_MAP = {
    "education": "Education & Language",
    "language": "Education & Language",
    "books and literature": "Education & Language",
    "work and jobs": "Work & Careers",
    "health and body care": "Health & Wellbeing",
    "weather": "Environment & Climate",
    "food and drink": "Food & Nutrition",
    "travel": "Travel & Transport",
    "ways of travelling": "Travel & Transport",
    "travel and services vocab": "Travel & Transport",
    "holidays": "Travel & Transport",
    "family life": "Family & Relationships",
    "relations with other people": "Family & Relationships",
    "shopping": "Shopping & Services",
    "services": "Shopping & Services",
    "things in the town, shops and shopping": "Urban Life & Services",
    "objects and rooms": "Home & Objects",
    "house and home, environment": "Home & Housing",
    "news, lifestyles and current affairs": "Media & Society",
    "media": "Media & Society",
    "arts": "Arts & Leisure",
    "film": "Arts & Leisure",
    "free time, entertainment": "Arts & Leisure",
    "hobbies and pastimes": "Arts & Leisure",
    "leisure activities": "Arts & Leisure",
    "hobbies and lifestyles": "Arts & Leisure",
    "nationalities and countries": "World & Culture",
    "places": "World & Culture",
    "scientific development": "Science & Technology",
    "technical and legal language": "Science, Technology & Law",
    "personal identification": "People & Daily Life",
    "personal information": "People & Daily Life",
    "daily life": "People & Daily Life",
    "clothes": "Clothing & Fashion",
    "colours": "Descriptions & Attributes",
    "dimensions": "Descriptions & Attributes",
    "adjectives: personality, description, feelings": "Psychology & Emotions",
    "collocation": "General & Cross-topic",
    "idiomatic expressions": "General & Cross-topic",
}
WORDNET_TOPICS = {
    "noun.animal": "Nature & Wildlife",
    "noun.plant": "Nature & Wildlife",
    "noun.food": "Food & Nutrition",
    "noun.body": "Health & Wellbeing",
    "noun.person": "People & Daily Life",
    "noun.location": "Places & Travel",
    "noun.communication": "Media & Communication",
    "noun.cognition": "Education & Knowledge",
    "noun.group": "Society & Community",
    "noun.feeling": "Psychology & Emotions",
    "noun.motive": "Psychology & Emotions",
    "noun.substance": "Materials & Environment",
    "noun.phenomenon": "Science & Environment",
    "noun.process": "Science & Research",
    "noun.quantity": "Numbers & Data",
    "noun.possession": "Money & Ownership",
    "noun.artifact": "Objects & Technology",
    "noun.attribute": "Descriptions & Attributes",
    "noun.shape": "Descriptions & Attributes",
    "verb.communication": "Media & Communication",
    "verb.cognition": "Education & Knowledge",
    "verb.emotion": "Psychology & Emotions",
    "verb.body": "Health & Wellbeing",
    "verb.weather": "Environment & Climate",
}

# For source words without topical tags or a specific WordNet category, match
# concrete cues in the headword/gloss before falling back to a language-function
# bucket. Every assignment remains an automatic suggestion, not editorial review.
DEFINITION_TOPICS = [
    ("Health & Wellbeing", r"\b(?:medical|medicine|doctor|clinic\w*|hospital|disease|illness|injur\w*|surgery|blood|health\w*|therap\w*|symptom|infection)\b"),
    ("Food & Nutrition", r"\b(?:food|meal|cook\w*|eat\w*|drink\w*|taste|tasty|flavo\w*|restaurant|fruit|vegetable|meat|dairy|bread)\b"),
    ("Clothing & Fashion", r"\b(?:dress\w*|fashion\w*|garment|shirt|shoe\w*|wearing|worn|outfit|tracksuit|overalls)\b"),
    ("Nature & Wildlife", r"\b(?:animal|bird|mammal|insect|wildlife|plant|tree|flower|species|forest)\b"),
    ("Environment & Climate", r"\b(?:climate|weather|rain\w*|storm|flood|pollut\w*|ecosystem|carbon|atmosphere|drought)\b"),
    ("Science & Technology", r"\b(?:computer|software|internet|digital|electronic|technology|technological|scientific|experiment|laboratory|chemical|physics|scientist)\b"),
    ("Education & Knowledge", r"\b(?:school|student|teacher|learn\w*|academic|university|curriculum|lesson|education\w*|classroom)\b"),
    ("Work & Careers", r"\b(?:job|workplace|employ\w*|office|career|salary|occupation|profession\w*|worker|colleague)\b"),
    ("Travel & Transport", r"\b(?:travel\w*|journey|vehicle|passenger|aircraft|airplane|train|ship|road|destination|flight|transport\w*|aboard)\b"),
    ("Money & Ownership", r"\b(?:money|payment|price|cost\w*|bank\w*|loan|tax\w*|finance|financial|purchase|selling|sold|buyer)\b"),
    ("Family & Relationships", r"\b(?:family|parent|mother|father|marriage|husband|wife|sibling|daughter|son)\b"),
    ("Media & Communication", r"\b(?:news|article|newspaper|broadcast|publish\w*|photograph|message|communicat\w*|advertis\w*|journal\w*)\b"),
    ("Arts & Leisure", r"\b(?:music\w*|artist|artwork|paint\w*|theat\w*|literature|danc\w*|entertain\w*|game|sport|leisure)\b"),
    ("Home & Housing", r"\b(?:house|housing|home|room|furniture|kitchen|bedroom|bathroom|household)\b"),
    ("World & Culture", r"\b(?:country|nation\w*|culture|international|foreign|ethnic|global|aborigin\w*)\b"),
    ("Society & Community", r"\b(?:government|politic\w*|legal|lawyer|police|crime|community|social|public|citizen|society)\b"),
    ("Psychology & Emotions", r"\b(?:emotion\w*|fear\w*|anger|angry|mood\w*|mental|desire|happiness|sadness|anxiety|attention|motivation)\b"),
    ("Time & Sequence", r"\b(?:time|day|week|month|year|season|period|duration|sequence|chronolog\w*|hour|minute|afternoon|morning)\b"),
    ("Numbers & Data", r"\b(?:number|quantity|amount|measur\w*|count|counts|counted|counting|percentage|ratio|statistics|statistical)\b"),
    ("Places & Travel", r"\b(?:location|region|distance|city|town|street|territory|geograph\w*)\b"),
]

FALLBACK_LEXICAL_TOPICS = {
    "noun.act": "Actions & Processes",
    "noun.event": "Events & Occurrences",
    "noun.state": "Descriptions & Attributes",
    "noun.time": "Time & Sequence",
    "noun.relation": "Society & Community",
    "noun.object": "Objects & Technology",
    "verb.change": "Actions & Processes",
    "verb.contact": "Actions & Processes",
    "verb.creation": "Actions & Processes",
    "verb.perception": "Actions & Processes",
    "verb.stative": "Actions & Processes",
    "verb.motion": "Actions & Processes",
    "verb.social": "Society & Community",
    "verb.possession": "Actions & Processes",
    "verb.competition": "Actions & Processes",
    "verb.consumption": "Actions & Processes",
    "noun.Tops": "People & Daily Life",
}

FUNCTION_POS = {
    "pronoun", "preposition", "determiner", "conjunction", "modal auxiliary",
    "be-verb", "do-verb", "have-verb", "infinitive-to", "interjection",
}

# The source has a small set of missing glosses or incorrect POS labels. Their
# headwords were inspected individually; keep these corrections reproducible.
TOPIC_CORRECTIONS = {
    "cefrj-1.6-732": "Media & Communication",  # blurt
    "cefrj-1.6-853": "Science & Technology",  # broadband
    "cefrj-1.6-1059": "Numbers & Data",  # centigrade
    "cefrj-1.6-1376": "Media & Communication",  # conferencing
    "cefrj-1.6-1436": "Media & Communication",  # content
    "cefrj-1.6-2136": "Environment & Climate",  # eco
    "cefrj-1.6-2150": "Media & Communication",  # edit
    "cefrj-1.6-2359": "Media & Communication",  # exaggerate
    "cefrj-1.6-2463": "Arts & Leisure",  # extreme sports
    "cefrj-1.6-2478": "Urban Life & Services",  # facilities
    "cefrj-1.6-2921": "Places & Travel",  # glacis
    "cefrj-1.6-3049": "People & Daily Life",  # grown-up
    "cefrj-1.6-3312": "Society & Community",  # human rights
    "cefrj-1.6-3621": "Grammar & Usage",  # inverted commas
    "cefrj-1.6-3964": "Health & Wellbeing",  # liver
    "cefrj-1.6-4030": "Arts & Leisure",  # lyrics
    "cefrj-1.6-4150": "Media & Communication",  # media
    "cefrj-1.6-4158": "World & Culture",  # Mediterranean
    "cefrj-1.6-4201": "Numbers & Data",  # micrometer
    "cefrj-1.6-4309": "Science & Environment",  # moonscape
    "cefrj-1.6-4348": "Nature & Wildlife",  # mountaintop
    "cefrj-1.6-4406": "Science & Technology",  # nano
    "cefrj-1.6-4549": "Media & Communication",  # noticeboard
    "cefrj-1.6-4638": "World & Culture",  # Olympia
    "cefrj-1.6-4787": "Grammar & Usage",  # ow
    "cefrj-1.6-4893": "Descriptions & Attributes",  # patient, adjective
    "cefrj-1.6-4894": "Health & Wellbeing",  # patient, noun
    "cefrj-1.6-5147": "Actions & Processes",  # possess
    "cefrj-1.6-5209": "Science & Research",  # prehuman
    "cefrj-1.6-5573": "Actions & Processes",  # refresh
    "cefrj-1.6-5612": "Descriptions & Attributes",  # relative, adjective
    "cefrj-1.6-5654": "Actions & Processes",  # repaint
    "cefrj-1.6-5800": "Travel & Transport",  # roam
    "cefrj-1.6-6029": "Arts & Leisure",  # semi-final
    "cefrj-1.6-7081": "Clothing & Fashion",  # tracksuit
    "cefrj-1.6-7594": "Psychology & Emotions",  # weep
    "cefrj-1.6-7733": "World & Culture",  # worldview
    "octanove-1.0-29": "Society & Community",  # norms
    "octanove-1.0-309": "Clothing & Fashion",  # overalls
    "octanove-1.0-372": "Education & Knowledge",  # criteria
    "octanove-1.0-471": "Travel & Transport",  # chauffer
    "octanove-1.0-650": "People & Daily Life",  # antics
    "octanove-1.0-674": "Travel & Transport",  # stray, verb
    "octanove-1.0-675": "Descriptions & Attributes",  # stray, adjective
    "octanove-1.0-739": "Science & Technology",  # personalization
    "octanove-1.0-847": "Descriptions & Attributes",  # durable
    "octanove-1.0-902": "Science & Research",  # stimuli
    "octanove-1.0-1033": "Events & Occurrences",  # rustle, noun
    "octanove-1.0-1052": "Descriptions & Attributes",  # quirky
    "octanove-1.0-1099": "Money & Ownership",  # mark-up
    "octanove-1.0-1103": "Shopping & Services",  # wares
    "octanove-1.0-1255": "Arts & Leisure",  # fabulation
    "octanove-1.0-1405": "Science & Research",  # pressurization
    "octanove-1.0-1421": "Education & Knowledge",  # extracurricular
    "octanove-1.0-1439": "Education & Language",  # wordage
    "octanove-1.0-1518": "Actions & Processes",  # procedural
    "octanove-1.0-1520": "Education & Knowledge",  # demystification
    "octanove-1.0-1524": "Environment & Climate",  # floodgates
    "octanove-1.0-1921": "Science & Research",  # emulsification
    "octanove-1.0-2036": "Descriptions & Attributes",  # counterproductive
    "octanove-1.0-2079": "Money & Ownership",  # marketability
    "octanove-1.0-2117": "Arts & Leisure",  # reverb
    "octanove-1.0-2129": "Media & Communication",  # remonstrate (source POS typo)
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(part)
    return digest.hexdigest()


def clean(value: object) -> str:
    return str(value).strip() if value is not None else ""


def cefr_records() -> list[dict[str, str]]:
    with zipfile.ZipFile(CEFR_FILE) as bundle:
        book = load_workbook(io.BytesIO(bundle.read("CEFR-J Wordlist Ver1.6.xlsx")), read_only=True, data_only=True)
    records = []
    for index, row in enumerate(book["ALL"].iter_rows(min_row=2, values_only=True), start=2):
        headword, pos, cefr, core1, core2, threshold = (clean(item) for item in row[:6])
        if not headword or cefr not in (*STUDY_LANE, "B1"):
            continue
        records.append({
            "source_id": f"cefrj-1.6-{index}", "headword": headword, "pos": pos,
            "cefr": cefr, "source": "CEFR-J Wordlist 1.6",
            "source_topics": "; ".join(dict.fromkeys(filter(None, [core1, core2, threshold]))),
            "source_notes": "",
        })
    return records


def advanced_records() -> list[dict[str, str]]:
    with OCTANOVE_FILE.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    return [{
        "source_id": f"octanove-1.0-{index}", "headword": clean(row["headword"]),
        "pos": clean(row["pos"]), "cefr": clean(row["CEFR"]),
        "source": "Octanove Vocabulary Profile C1/C2 1.0",
        "source_topics": "", "source_notes": clean(row["notes"]),
    } for index, row in enumerate(rows, start=2) if clean(row["headword"])]


def wordnet_index() -> tuple[dict, dict]:
    entries: dict = {}
    synsets: dict = {}
    with zipfile.ZipFile(WORDNET_FILE) as bundle:
        for name in bundle.namelist():
            if name.startswith("entries-") and name.endswith(".json"):
                entries.update(json.loads(bundle.read(name)))
            elif name.endswith(".json"):
                category = name.removesuffix(".json")
                for synset_id, value in json.loads(bundle.read(name)).items():
                    synsets[synset_id] = (category, value)
    return entries, synsets


def wordnet_lookup(headword: str, pos: str, entries: dict, synsets: dict) -> tuple[str, str, str, str]:
    if "/" in headword:
        headword = headword.split("/", 1)[0]
    variants = [headword, headword.replace(" ", "_"), headword.lower(), headword.lower().replace(" ", "_")]
    code = POS_CODE.get(pos)
    if not code:
        return "", "", "", ""
    for variant in variants:
        senses = entries.get(variant, {}).get(code, {}).get("sense", [])
        for sense in senses:
            found = synsets.get(sense.get("synset"))
            if found:
                category, value = found
                return (
                    clean((value.get("definition") or [""])[0]),
                    clean((value.get("example") or [""])[0]),
                    category,
                    sense.get("synset", ""),
                )
    return "", "", "", ""


def topic_tags(source_id: str, source_topics: str, lexname: str, headword: str, pos: str, definition: str) -> tuple[str, str]:
    if source_id in TOPIC_CORRECTIONS:
        return TOPIC_CORRECTIONS[source_id], "headword inspected; editorial topic correction"
    tags = []
    for raw in source_topics.split("; "):
        if not raw:
            continue
        matched = TOPIC_MAP.get(raw.lower())
        if matched and matched != "General & Cross-topic" and matched not in tags:
            tags.append(matched)
    if tags:
        return "; ".join(tags), "CEFR-J topical tags; editorial normalization"
    if lexname in WORDNET_TOPICS:
        return WORDNET_TOPICS[lexname], "Open English WordNet lexical category; automatic"
    if pos in FUNCTION_POS:
        return "Grammar & Usage", "part of speech; automatic"
    if pos == "number":
        return "Numbers & Data", "part of speech; automatic"
    for topic, pattern in DEFINITION_TOPICS:
        if re.search(pattern, headword.lower()):
            return topic, "headword semantic cue; automatic"
    for topic, pattern in DEFINITION_TOPICS:
        if re.search(pattern, definition.lower()):
            return topic, "WordNet definition cue; automatic; first sense needs review"
    if lexname in FALLBACK_LEXICAL_TOPICS:
        return FALLBACK_LEXICAL_TOPICS[lexname], "Open English WordNet broad lexical category; automatic"
    if pos == "verb":
        return "Actions & Processes", "verb study category; automatic"
    if pos in ("adjective", "adverb"):
        return "Descriptions & Attributes", "descriptive word study category; automatic"
    if pos == "noun":
        return "Ideas & Concepts", "noun study category; automatic; review priority"
    return "Grammar & Usage", "unrecognized part of speech; automatic; review priority"


FIELDS = [
    "source_id", "headword", "pos", "cefr", "study_lane", "topics", "topic_basis",
    "definition_en", "example_en", "definition_status", "wordnet_synset", "source",
    "source_topics", "source_notes", "source_url", "definition_source_url",
]


def csv_bytes(rows: list[dict], fields: list[str] = FIELDS) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return ("\ufeff" + output.getvalue()).encode("utf-8")


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def main() -> None:
    for path in [CEFR_FILE, OCTANOVE_FILE, WORDNET_FILE, CATALOG_FILE]:
        if not path.is_file():
            raise FileNotFoundError(path)
    entries, synsets = wordnet_index()
    rows = cefr_records() + advanced_records()
    for row in rows:
        definition, example, lexname, synset_id = wordnet_lookup(row["headword"], row["pos"], entries, synsets)
        tags, basis = topic_tags(row["source_id"], row["source_topics"], lexname, row["headword"], row["pos"], definition)
        row.update({
            "study_lane": study_level(row["headword"], row["cefr"]), "topics": tags, "topic_basis": basis,
            "definition_en": definition, "example_en": example,
            "definition_status": "first_sense_needs_review" if definition else "not_available",
            "wordnet_synset": synset_id,
            "source_url": SOURCE_URLS["cefr_j" if row["cefr"] in ("A1", "A2", "B1", "B2") else "octanove"],
            "definition_source_url": f"https://en-word.net/view/lemma/{quote(row['headword'].split('/')[0])}" if definition else "",
        })

    # Preserve source order and source-specific duplicate records. Different parts of speech
    # can genuinely have different CEFR levels, so no lossy deduplication happens here.
    by_level = collections.Counter(row["cefr"] for row in rows)
    by_lane = collections.Counter(row["study_lane"] for row in rows)
    by_topic: dict[str, list[dict]] = collections.defaultdict(list)
    for row in rows:
        for topic in row["topics"].split("; "):
            by_topic[topic].append(row)
    manifest = {
        "title": "IeltsWithHarry English vocabulary source pack",
        "source_language": "English",
        "is_official_ielts_wordlist": False,
        "cefr_j_explanation": "CEFR-J is an English wordlist compiled in Japan; J does not mean Japanese vocabulary.",
        "generated_on": date.today().isoformat(),
        "row_count": len(rows), "unique_headwords": len({row["headword"].lower() for row in rows}),
        "definitions_matched": sum(bool(row["definition_en"]) for row in rows),
        "source_topic_rows": sum(row["topic_basis"].startswith("CEFR-J") for row in rows),
        "general_unclassified_rows": sum(row["topics"] == "General & Cross-topic" for row in rows),
        "topic_assignment_methods": dict(sorted(collections.Counter(row["topic_basis"] for row in rows).items())),
        "missing_definition_rows": sum(not row["definition_en"] for row in rows),
        "topic_count": len(by_topic), "rows_by_cefr": dict(sorted(by_level.items())),
        "rows_by_study_lane": dict(sorted(by_lane.items())),
        "study_level_method": "A1=1, A2=2, B1 Zipf >=4.2=3 and <4.2=4, B2=5, C1=6, C2=7+; internal study sequence, not IELTS band",
        "source_files": {path.name: {"bytes": path.stat().st_size, "sha256": sha256(path)}
                         for path in [CEFR_FILE, OCTANOVE_FILE, WORDNET_FILE]},
        "sources": SOURCE_URLS,
    }
    readme = f"""# IeltsWithHarry — kho nguồn từ vựng tiếng Anh

Tạo ngày {manifest['generated_on']}. Có **{len(rows):,} dòng từ vựng**, **{manifest['unique_headwords']:,} headword**,
**{len(by_topic)} nhóm topic**, **{manifest['definitions_matched']:,} dòng có định nghĩa tiếng Anh**.

**Đây là dữ liệu tiếng Anh, không có từ vựng tiếng Nhật.** Chữ J trong CEFR-J chỉ
nguồn biên soạn ở Nhật. CEFR-J là danh sách tiếng Anh tổng quát, **không phải bộ từ
IELTS chính thức**. Các topic chỉ là ứng viên để admin chọn và biên soạn cho IELTS.

## Dùng file nào

- `catalog/vocabulary_all.csv`: toàn bộ bản ghi; mở trực tiếp bằng Excel (UTF-8 BOM).
- `catalog/vocabulary_all.jsonl`: cùng dữ liệu dạng JSONL để nhập hệ thống.
- `catalog/topical_candidates_for_ielts_review.csv`: các dòng đã gắn topic cụ thể,
  dành cho admin rà soát; chưa được coi là từ IELTS đã kiểm duyệt.
- `by_topic/*.csv`: mỗi topic một file; một từ có thể ở nhiều topic.
- `by_study_lane/*.csv`: Level 1 đến Level 7+.
- `indexes/topics.csv`, `indexes/cefr_levels.csv`, `indexes/study_levels.csv`: bảng số lượng.
- `sources/`: bản gốc đã tải để đối chiếu; `manifest.json` có SHA-256.
- `app_current_catalog.json`: bộ từ đã soạn tiếng Việt đang có trong web, để so sánh; không phải nguồn của 9.9k dòng.
- `build/build-vocabulary-pack.py`: script tái tạo gói từ nguồn gốc (chạy trong repo).

## Cách hiểu cấp độ

CEFR A1/A2/B1/B2 lấy từ **CEFR-J Wordlist 1.6**. C1/C2 lấy từ **Octanove 1.0**.
Các `study_lane` là **Level học nội bộ**: A1 → 1, A2 → 2, B1 phổ biến hơn → 3,
B1 ít gặp hơn → 4, B2 → 5, C1 → 6, C2 → 7+. B1 được tách bằng tần suất tiếng Anh
Zipf 4.2 từ wordfreq 3.1.1 (dữ liệu tần suất tới khoảng 2021); đây chỉ là thứ tự
ôn luyện, **không phải band IELTS của từng từ hoặc quy đổi chính thức CEFR → IELTS**.
IELTS nói rõ hai thang không tương ứng một-một: {SOURCE_URLS['ielts']}

## Topic và định nghĩa

`source_topics` giữ nguyên nhãn có sẵn từ CEFR-J. `topics` chuẩn hóa nhãn đó;
những dòng thiếu topic được phân loại theo nhóm nghĩa WordNet, dấu hiệu trong headword,
định nghĩa tiếng Anh và từ loại. Các trường hợp nguồn thiếu định nghĩa nhưng xác định
được đã được sửa topic thủ công. **Cả {len(rows):,} dòng đều có topic; không còn nhóm
General & Cross-topic.** `topic_basis` ghi cách gán để dễ rà soát. Nhóm như
`Actions & Processes`, `Descriptions & Attributes` và `Grammar & Usage` chứa các từ
liên chủ đề. Topic tự động chỉ là gợi ý, **không coi là đã kiểm duyệt nghĩa IELTS**.
`catalog/topical_candidates_for_ielts_review.csv` ưu tiên các dòng có nhãn nguồn,
nhóm nghĩa WordNet cụ thể hoặc topic đã sửa thủ công.
`definition_en` và `example_en` lấy first sense cùng từ loại từ Open English WordNet;
nghĩa đầu tiên có thể sai ngữ cảnh IELTS. `definition_status` đánh dấu cần biên tập
trước khi đưa vào bài học hoặc tạo câu hỏi chấm điểm. Có {manifest['missing_definition_rows']:,}
dòng không khớp định nghĩa. Không có nghĩa tiếng Việt,
IPA, collocation hoặc câu đặt sẵn cho toàn bộ kho — những trường đó cần biên soạn.

## Quyền sử dụng và trích dẫn

1. **CEFR-J Wordlist Version 1.6**, compiled by Yukio Tono, Tokyo University of
   Foreign Studies, downloaded from {SOURCE_URLS['cefr_j']} on {manifest['generated_on']}.
   TUFS cho phép dùng nghiên cứu và thương mại nếu dẫn nguồn đúng.
2. **Octanove Vocabulary Profile C1/C2 Version 1.0**, Octanove Labs via Open
   Language Profiles, {SOURCE_URLS['octanove']}. **CC BY-SA 4.0**:
   https://creativecommons.org/licenses/by-sa/4.0/.
3. **Open English WordNet 2025**, Open English WordNet Community,
   {SOURCE_URLS['wordnet']}. **CC BY 4.0**:
   https://creativecommons.org/licenses/by/4.0/. Định nghĩa/ví dụ là dữ liệu nguồn,
   không phải nội dung IeltsWithHarry tự viết.
4. **wordfreq 3.1.1**, Robyn Speer, https://github.com/rspeer/wordfreq,
   dùng riêng để chia nhóm B1 theo tần suất tiếng Anh.

Các file biên tập tổng hợp trong gói này được cung cấp theo **CC BY-SA 4.0**
để tương thích điều kiện share-alike của phần Octanove. Khi phát hành hoặc nhập
vào website cần giữ attribution của cả ba nguồn.
"""

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        bundle.writestr("README.md", readme)
        bundle.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        bundle.writestr("catalog/vocabulary_all.csv", csv_bytes(rows))
        bundle.writestr("catalog/vocabulary_all.jsonl", "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
        bundle.writestr("catalog/topical_candidates_for_ielts_review.csv", csv_bytes([
            row for row in rows if row["topic_basis"].startswith("CEFR-J")
            or row["topic_basis"] == "Open English WordNet lexical category; automatic"
            or row["topic_basis"] == "headword inspected; editorial topic correction"
        ]))
        bundle.writestr("app_current_catalog.json", CATALOG_FILE.read_bytes())
        bundle.writestr("build/build-vocabulary-pack.py", Path(__file__).read_bytes())
        bundle.writestr("build/requirements.txt", "openpyxl>=3.1,<4\nwordfreq==3.1.1\n")
        bundle.writestr("indexes/topics.csv", csv_bytes([
            {"topic": topic, "rows": len(items)} for topic, items in sorted(by_topic.items())
        ], ["topic", "rows"]))
        bundle.writestr("indexes/cefr_levels.csv", csv_bytes([
            {"cefr": level, "rows": by_level[level]}
            for level in ["A1", "A2", "B1", "B2", "C1", "C2"]
        ], ["cefr", "rows"]))
        bundle.writestr("indexes/study_levels.csv", csv_bytes([
            {"study_lane": level, "rows": by_lane[level]} for level in STUDY_LEVELS
        ], ["study_lane", "rows"]))
        for topic, items in sorted(by_topic.items()):
            bundle.writestr(f"by_topic/{safe_filename(topic)}.csv", csv_bytes(items))
        for lane, items in sorted(((lane, [r for r in rows if r["study_lane"] == lane]) for lane in set(by_lane))):
            bundle.writestr(f"by_study_lane/{safe_filename(lane)}.csv", csv_bytes(items))
        for path in [CEFR_FILE, OCTANOVE_FILE, WORDNET_FILE]:
            bundle.write(path, f"sources/{path.name}")
    print(json.dumps({"output": str(OUTPUT), "bytes": OUTPUT.stat().st_size, **{key: manifest[key]
          for key in ["row_count", "unique_headwords", "definitions_matched", "source_topic_rows", "topic_count", "rows_by_cefr"]}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
