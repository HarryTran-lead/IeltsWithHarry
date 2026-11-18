"""Build the Writing Task 1 Lab content from the F37 owner package.

Usage:
    python scripts/import-writing-task1-f37.py <extracted IELTS_Task1_F37_R84_COMPLETE_OWNER_ALL_DATA folder>

Reads the public-safe inner zip (01_CODEX_SAFE_PUBLIC_FULL_DATA.zip) in place and the private
answer keys from 04_OWNER_PRIVATE_DO_NOT_COMMIT/. Every file used is checked against the package's
own SHA-256 manifests first. Writes:

    content/writing-task1/lessons.json          learner content (37 lessons, no answers)
    content/writing-task1/answers.json          the 8 guided lessons' quiz keys, drill guides and model
                                                answers (published in the package's public data)
    content/writing-task1/private/process-keys.json
                                                the 29 Process lessons' 232 check keys; gitignored, because
                                                the package marks them owner-only and the repo is public
    public/self-study/writing-task1/            the 32 diagrams (3 R67 visuals + 29 Process SVGs)

Learner content and answers are bound by a per-lesson content hash: an answer written for another
version of a lesson is not handed out (the server answers 409 instead).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "content" / "writing-task1"
PRIVATE_DIR = OUT_DIR / "private"
ASSET_DIR = ROOT / "public" / "self-study" / "writing-task1"
ASSET_URL = "/self-study/writing-task1"

PUBLIC_ZIP = "01_CODEX_SAFE_PUBLIC_FULL_DATA.zip"
PUBLIC_FEEDS = {
    "guided": "01_REPOSITORY_PATCH/src/lib/task1-self-study/r67-lessons.json",
    "index": "01_REPOSITORY_PATCH/src/lib/task1-self-study/r69-process-index.json",
    "stages": "02_CURRICULUM_DATA/data/student_public/R68_7_STAGES.json",
    "mcqs": "02_CURRICULUM_DATA/data/student_public/R53_PROCESS_READING_MCQS_116.json",
    "writing": "02_CURRICULUM_DATA/data/student_public/R54_PROCESS_SELF_WRITING_29.json",
}
PRIVATE_FEEDS = {
    "mcq_keys": "04_OWNER_PRIVATE_DO_NOT_COMMIT/R69/data/admin_only/R53_PROCESS_READING_KEYS_116.json",
    "tf_keys": "04_OWNER_PRIVATE_DO_NOT_COMMIT/R69/data/admin_only/R54_PROCESS_ANSWER_KEYS_116.json",
}

# Three chặng over the package's seven learning stages (S01–S07); the band ranges are training targets.
STAGES = {
    "foundation": {"stage_ids": ["S01", "S02", "S03"], "target_range": "1.0–4.0"},
    "developing": {"stage_ids": ["S04", "S05"], "target_range": "4.5–6.0"},
    "advanced": {"stage_ids": ["S06", "S07"], "target_range": "6.5–7.0+"},
}
GUIDED_STAGE = {"foundation": "foundation", "intermediate": "developing", "advanced": "advanced"}
PROCESS_STAGE = {"guided": "foundation", "intermediate": "developing", "advanced": "advanced"}
GROUP_LABELS = {"line": "Line graph", "bar": "Bar chart", "pie": "Pie chart", "table": "Table", "mixed": "Mixed charts", "map": "Map", "process": "Process"}
PROCESS_KIND_VI = {
    "linear": "quy trình một chiều", "cycle": "chu trình khép kín", "branch": "quy trình rẽ nhánh",
    "branch_merge": "rẽ nhánh rồi hợp lại", "dual_output": "hai đầu ra", "feedback_loop": "có vòng phản hồi",
    "multi_decision_loop": "nhiều điểm quyết định, có vòng lặp", "hybrid_loop_dual": "vòng lặp và hai đầu ra", "unspecified": "chuỗi công đoạn",
}
VI = re.compile("[áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]", re.IGNORECASE)
# Steps of the R53 Process lessons shown before writing; "practice" and "revise" are the writing step itself.
PROCESS_LEARN_PHASES = ["observe", "decode", "teach", "overview", "plan"]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def vietnamese(value: str, where: str) -> str:
    if not value or not VI.search(value):
        fail(f"{where} has no Vietnamese text: {value!r}")
    return value.strip()


def process_question(title: str) -> str:
    """An IELTS-style prompt from a Process title: 'Packing Fresh Mushrooms' -> 'shows the process of packing fresh mushrooms'."""
    subject = re.sub(r"\s*\(simplified\)$", "", title.strip()).lower()
    if subject.startswith("life cycle"):
        subject = "the " + subject
    elif subject.split()[0].endswith("ing"):
        subject = "the process of " + subject
    return f"The diagram below shows {subject}. Summarise the information by selecting and reporting the main features, and make comparisons where relevant."


# R67 facts that contradict the lesson's own figure, corrected against the chart data (the Vietnamese was already right).
FACT_FIXES = {
    ("line", "Cycling was the second-largest category in 2025."): "Cycling remained the least used of the three modes in 2025, despite rising to 30,000 journeys.",
}


def lesson_hash(lesson: dict) -> str:
    body = {key: value for key, value in lesson.items() if key != "content_sha256"}
    return sha(json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def load_public(owner: Path) -> tuple[zipfile.ZipFile, dict]:
    path = owner / PUBLIC_ZIP
    if not path.exists():
        fail(f"{PUBLIC_ZIP} not found in {owner}")
    archive = zipfile.ZipFile(path)
    manifest = json.loads(archive.read("04_VALIDATION/SHA256_CONTENT.json"))
    feeds = {}
    for name, inner in PUBLIC_FEEDS.items():
        data = archive.read(inner)
        if inner not in manifest or manifest[inner]["sha256"] != sha(data):
            fail(f"{inner} does not match the public package manifest")
        feeds[name] = json.loads(data.decode("utf-8"))
    return archive, feeds


def load_private(owner: Path) -> dict:
    manifest = json.loads((owner / "05_PROVENANCE_CHECKS" / "SHA256_CONTENT.json").read_text(encoding="utf-8"))
    feeds = {}
    for name, inner in PRIVATE_FEEDS.items():
        data = (owner / inner).read_bytes()
        entry = manifest.get(inner)
        if not entry or entry["sha256"] != sha(data):
            fail(f"{inner} does not match the owner package manifest")
        feeds[name] = json.loads(data.decode("utf-8"))
    return feeds


def copy_assets(archive: zipfile.ZipFile, manifest: dict) -> dict[str, str]:
    """Copies the diagrams into public/ and returns {package path: served URL}."""
    if ASSET_DIR.exists():
        shutil.rmtree(ASSET_DIR)
    served = {}
    for inner in archive.namelist():
        if not inner.startswith("01_REPOSITORY_PATCH/public/") or not inner.lower().endswith(".svg"):
            continue
        data = archive.read(inner)
        if inner not in manifest or manifest[inner]["sha256"] != sha(data):
            fail(f"{inner} does not match the public package manifest")
        text = data.decode("utf-8")
        if re.search(r"<script|\son[a-z]+\s*=|(?:xlink:)?href\s*=\s*\"(?!data:image/|#)", text, re.IGNORECASE):
            fail(f"{inner} contains script, event handlers or external links")
        relative = inner.removeprefix("01_REPOSITORY_PATCH/public/")
        # task1-r67/visuals/olive-oil/diagram_R54.svg -> guided/olive-oil.svg ; task1-r69/process/X.svg -> process/x.svg
        if relative.startswith("task1-r67/visuals/"):
            stem = relative.removeprefix("task1-r67/visuals/").split("/")[0].removesuffix(".svg")
            target = f"guided/{stem}.svg"
        elif relative.startswith("task1-r69/process/"):
            target = f"process/{Path(relative).stem.lower()}.svg"
        else:
            fail(f"unexpected asset {relative}")
        out = ASSET_DIR / target
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        served["/" + relative] = f"{ASSET_URL}/{target}"
    return served


def guided_lessons(rows: list[dict], assets: dict[str, str]) -> tuple[list[dict], dict]:
    lessons, answers = [], {}
    for row in rows:
        lid = row["id"]
        stage = GUIDED_STAGE[row["difficulty"]]
        if "visual" in row:
            visual = {"type": "chart", "spec": row["visual"]}
        else:
            src = assets.get(row["asset"]) or fail(f"{lid}: asset {row['asset']} missing")
            visual = {"type": "image", "src": src, "alt": f"{row['label']}: {row['title']}"}
        checks = []
        for index, quiz in enumerate(row["quiz"], start=1):
            checks.append({"id": f"q{index}", "kind": "mcq", "prompt": quiz["q"], "options": [{"id": f"o{n}", "text": text} for n, text in enumerate(quiz["options"])]})
        facts = [{"en": FACT_FIXES.get((lid, en), en), "vi": vietnamese(vi, f"{lid}.facts_vi")} for en, vi in zip(row["facts"], row["facts_vi"], strict=True)]
        lesson = {
            "id": lid, "kind": "guided", "group": row["group"] if row["group"] in GROUP_LABELS else "process",
            "group_label": row["label"], "subtopic": row.get("subtopic", ""), "stage": stage, "target_range": STAGES[stage]["target_range"],
            "title": row["title"], "question": row["question"], "minutes": 35, "unit": row.get("unit", ""), "visual": visual,
            "facts": facts, "phrases": row.get("phrases", []),
            "mistake": {"en": row["mistake"], "vi": vietnamese(row["mistake_vi"], f"{lid}.mistake_vi")},
            "steps": [],
            "checks": checks,
            "drills": [
                {"id": "intro", "mode": "intro", "question_vi": "Viết câu mở bài: diễn đạt lại đề bằng từ của bạn (không chép nguyên câu đề).", "hint_vi": "Đổi động từ (shows → compares/illustrates) và cụm danh từ; giữ đúng đối tượng, nơi chốn và thời gian."},
                {"id": "overview", "mode": "overview", "question_vi": "Viết Overview 1–2 câu nêu hai đặc điểm nổi bật nhất, không đưa số liệu chi tiết.", "hint_vi": "Bắt đầu bằng “Overall, …”; nêu xu hướng/so sánh lớn nhất, không giải thích nguyên nhân."},
                {"id": "groups", "mode": "groups", "question_vi": "Chia dữ kiện thành hai nhóm cho Body 1 và Body 2. Mỗi nhóm nói về điều gì?", "hint_vi": "Gom theo đối tượng, giai đoạn hoặc điểm giống/khác; mỗi đoạn nên có số liệu dẫn chứng."},
            ],
            "has_model": True,
        }
        lesson["content_sha256"] = lesson_hash(lesson)
        lessons.append(lesson)
        groups_vi = [vietnamese(text, f"{lid}.groups_vi") for text in row["groups_vi"]]
        answers[lid] = {
            "content_sha256": lesson["content_sha256"],
            "checks": {f"q{index}": {"answer": f"o{quiz['correct']}", "explanation_vi": vietnamese(quiz["why_vi"], f"{lid}.quiz.why_vi"), "explanation_en": quiz.get("why", "")} for index, quiz in enumerate(row["quiz"], start=1)},
            "drills": {
                "intro": {"answer_guide": row["intro"], "explanation_vi": "Câu mở bài mẫu đổi cách diễn đạt của đề nhưng giữ đúng đối tượng, nơi chốn và mốc thời gian."},
                "overview": {"answer_guide": row["overview"], "explanation_vi": "Overview nêu đặc điểm chung nổi bật nhất, không liệt kê số liệu chi tiết."},
                "groups": {"answer_guide": " · ".join(row["groups"]), "explanation_vi": "Hai nhóm gợi ý: " + " / ".join(groups_vi) + "."},
            },
            "model": {
                "paragraphs": [row["intro"], row["overview"], row["body1"], row["body2"]],
                "word_count": row["word_count_reference"],
                "outline_vi": " / ".join(groups_vi),
                "explanation_vi": "Bài mẫu đi theo Intro – Overview – Body 1 – Body 2: mở bài diễn đạt lại đề, Overview nêu đặc điểm chính, hai đoạn thân bài nhóm dữ kiện và dẫn số liệu.",
            },
        }
    return lessons, answers


def labels_of(nodes: dict, edge_ids: list[str], edges: dict) -> str:
    order: list[str] = []
    for edge_id in edge_ids:
        edge = edges[edge_id]
        for node in (edge["from"], edge["to"]):
            if nodes[node] not in order:
                order.append(nodes[node])
    return " → ".join(order)


def process_lessons(public: dict, private: dict, assets: dict[str, str], owner: Path, archive: zipfile.ZipFile) -> tuple[list[dict], dict]:
    mcqs: dict[str, list[dict]] = {}
    for row in public["mcqs"]:
        mcqs.setdefault(row["graph_id"], []).append(row)
    writing = {row["graph_id"]: row for row in public["writing"]}
    mcq_keys = {row["question_id"]: row for row in private["mcq_keys"]}
    tf_keys = {row["graph_id"]: {key["item_id"]: key for key in row["keys"]} for row in private["tf_keys"]}
    lessons_dir = "02_CURRICULUM_DATA/data/student_public/process_lessons/"
    manifest = json.loads(archive.read("04_VALIDATION/SHA256_CONTENT.json"))

    lessons, keys = [], {}
    for entry in public["index"]:
        gid = entry["graph_id"]
        inner = f"{lessons_dir}{gid}.json"
        raw = archive.read(inner)
        if inner not in manifest or manifest[inner]["sha256"] != sha(raw):
            fail(f"{inner} does not match the public package manifest")
        source = json.loads(raw.decode("utf-8"))
        nodes = {node["id"]: node["label"] for node in entry["nodes"]}
        edges = {edge["id"]: edge for edge in entry["edges"]}
        stage = PROCESS_STAGE[entry["level"]]
        steps_by_phase = {step["phase"]: step for step in source["learner_steps"]}
        steps = [{"title_vi": vietnamese(steps_by_phase[phase]["title_vi"], f"{gid}.{phase}.title_vi"), "instruction_vi": vietnamese(steps_by_phase[phase]["instructions_vi"], f"{gid}.{phase}.instructions_vi"), "minutes": steps_by_phase[phase]["minutes"]} for phase in PROCESS_LEARN_PHASES if phase in steps_by_phase]

        checks, check_keys = [], {}
        for index, row in enumerate(mcqs.get(gid, []), start=1):
            key = mcq_keys.get(row["id"]) or fail(f"{row['id']} has no answer key")
            check_id = f"m{index}"
            checks.append({"id": check_id, "kind": "mcq", "prompt": row["question_en"], "options": [{"id": option["id"], "text": option["text"]} for option in row["options"]]})
            if key["answer_id"] not in {option["id"] for option in row["options"]}:
                fail(f"{row['id']}: key {key['answer_id']} is not an option")
            check_keys[check_id] = {"answer": key["answer_id"], "explanation_vi": vietnamese(key["explanation_vi"], f"{row['id']}.explanation_vi"), "explanation_en": key.get("explanation_en", "")}
        claims = next(part["claims"] for part in writing[gid]["lesson_order"] if part["part"] == "sequence_check")
        for index, claim in enumerate(claims, start=1):
            key = tf_keys.get(gid, {}).get(claim["item_id"]) or fail(f"{claim['item_id']} has no answer key")
            check_id = f"t{index}"
            checks.append({"id": check_id, "kind": "tf", "prompt": claim["statement_en"], "options": [{"id": "true", "text": "True"}, {"id": "false", "text": "False"}]})
            check_keys[check_id] = {"answer": "true" if key["answer"] else "false", "explanation_vi": vietnamese(key["explanation_vi"], f"{claim['item_id']}.explanation_vi"), "explanation_en": key.get("explanation_en", "")}
        if len(checks) != 8:
            fail(f"{gid} has {len(checks)} checks, expected 8")

        hint = entry["overview_hint"]
        topology = source["topology"]
        plan = steps_by_phase.get("plan", {}).get("evidence", {})
        parts = {part["part"]: part for part in writing[gid]["lesson_order"]}
        kind_vi = PROCESS_KIND_VI.get(entry["kind"], "quy trình")
        features = [f"{topology['node_count']} công đoạn, {topology['edge_count']} mũi tên", f"bắt đầu ở “{hint['start_label']}”", "kết thúc ở " + ", ".join(f"“{label}”" for label in hint["end_labels"])]
        if hint["has_branches"]:
            features.append("có điểm rẽ nhánh")
        if hint["has_cycles"]:
            features.append("có vòng lặp")
        ends = " and ".join(f"'{label}'" for label in hint["end_labels"])
        shape = " The process divides at one point." if hint["has_branches"] else ""
        loop = " Part of the process is repeated." if hint["has_cycles"] else ""
        src = assets.get(entry["visual_uri"]) or fail(f"{gid}: diagram {entry['visual_uri']} missing")
        lid = entry["id"]
        lesson = {
            "id": lid, "kind": "process", "group": "process", "group_label": "Process", "subtopic": kind_vi[0].upper() + kind_vi[1:],
            "stage": stage, "target_range": STAGES[stage]["target_range"], "title": entry["title"],
            "question": process_question(entry["title"]),
            "minutes": 30, "unit": "", "visual": {"type": "image", "src": src, "alt": f"Process diagram: {entry['title']}"},
            "facts": [], "phrases": [], "mistake": None, "steps": steps, "checks": checks,
            "drills": [
                {"id": "observe", "mode": "observe", "question_vi": vietnamese(parts["observation"]["instruction_vi"], f"{gid}.observation") + " " + parts["observation"].get("required_response", ""), "hint_vi": "Ghi bằng tiếng Anh hoặc tiếng Việt: số bước, bước đầu, bước cuối, nhánh và vòng lặp."},
                {"id": "overview", "mode": "overview", "question_vi": vietnamese(parts["overview"]["instruction_vi"], f"{gid}.overview"), "hint_vi": "Overview nêu số công đoạn, điểm bắt đầu và kết thúc; không thêm thiết bị, thời gian hay số liệu không có trên hình."},
                {"id": "plan", "mode": "plan", "question_vi": vietnamese(parts["body_plan"]["instruction_vi"], f"{gid}.body_plan"), "hint_vi": "Viết ngắn: Body 1 gồm các bước nào, Body 2 gồm các bước nào."},
            ],
            "has_model": False,
        }
        lesson["content_sha256"] = lesson_hash(lesson)
        lessons.append(lesson)
        first = labels_of(nodes, plan.get("first_edges", []), edges)
        later = labels_of(nodes, plan.get("later_edges", []), edges)
        keys[lid] = {
            "content_sha256": lesson["content_sha256"],
            "checks": check_keys,
            "drills": {
                "observe": {"answer_guide": "; ".join(features) + ".", "explanation_vi": f"Đây là {kind_vi}. Đối chiếu lại sơ đồ: mỗi điểm quan sát phải chỉ ra được ô hoặc mũi tên tương ứng."},
                "overview": {"answer_guide": f"Overall, the process consists of {topology['node_count']} main stages, beginning with '{hint['start_label']}' and ending with {ends}.{shape}{loop}", "explanation_vi": "Câu gợi ý chỉ là khung; hãy đổi nhãn bước thành câu tự nhiên (bị động, danh từ hóa) thay vì chép nguyên nhãn."},
                "plan": {"answer_guide": f"Body 1: {first}. Body 2: {later}." if first and later else "Chia sơ đồ tại điểm chuyển giai đoạn hoặc rẽ nhánh.", "explanation_vi": "Cách chia gợi ý theo các mũi tên trên sơ đồ; bạn có thể chia khác nếu mỗi đoạn vẫn trọn một giai đoạn."},
            },
        }
    return lessons, keys


def main() -> None:
    if len(sys.argv) != 2:
        fail(__doc__.strip().splitlines()[3].strip())
    owner = Path(sys.argv[1]).resolve()
    archive, public = load_public(owner)
    private = load_private(owner)
    manifest = json.loads(archive.read("04_VALIDATION/SHA256_CONTENT.json"))
    assets = copy_assets(archive, manifest)

    guided, guided_answers = guided_lessons(public["guided"], assets)
    process, process_keys = process_lessons(public, private, assets, owner, archive)
    order = {"foundation": 0, "developing": 1, "advanced": 2}
    lessons = sorted(guided + process, key=lambda lesson: (order[lesson["stage"]], lesson["kind"] != "guided"))
    ids = [lesson["id"] for lesson in lessons]
    if len(ids) != len(set(ids)) or len(ids) != 37:
        fail(f"expected 37 unique lessons, got {len(ids)}")

    stages = [{"id": row["id"], "band": row["band"], "title": row["title"], "learn_goal": row["learn_goal"]} for row in public["stages"]]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    meta = {"package": "IELTS_Task1_F37_R84", "note": "Training material; band ranges are internal targets, not IELTS scores."}
    (OUT_DIR / "lessons.json").write_text(json.dumps({**meta, "stages": stages, "lessons": lessons}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (OUT_DIR / "answers.json").write_text(json.dumps({**meta, "lessons": guided_answers}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (PRIVATE_DIR / "process-keys.json").write_text(json.dumps({**meta, "lessons": process_keys}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    checks = sum(len(lesson["checks"]) for lesson in lessons)
    print(f"lessons: {len(lessons)} ({len(guided)} guided, {len(process)} process) · checks: {checks} · diagrams: {len(assets)}")


if __name__ == "__main__":
    main()
