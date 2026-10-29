"""Import learner-facing IELTS Starter U01-U08 materials from the supplied ZIP.

Run: python scripts/import-starter-supplement.py "C:/path/to/English_Skill_Lab_U01-U08_FULL.zip"
Teacher keys, teacher notes, offline HTML and instructions in the archive are not published.
"""

from collections import Counter
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content" / "ielts-starter-4-5-supplement"
PUBLIC = ROOT / "public" / "starter-supplement"
METADATA = ROOT / "src" / "data" / "ielts-starter-supplement.json"

SUMMARIES = {
    "U01": "Đọc về gia đình và các mối quan hệ; viết mô tả quy trình; nghe hội thoại đặt chỗ, số và lựa chọn; luyện Speaking về người thân.",
    "U02": "Đọc về nhà ở và địa điểm; so sánh bản đồ trong Writing Task 1; nghe tên, địa chỉ và chỉ đường; nói về nơi mình sống.",
    "U03": "Đọc về học tập và nghề nghiệp; chọn đặc điểm chính của biểu đồ; nghe thông tin khóa học và việc làm; nói về trải nghiệm cá nhân.",
    "U04": "Đọc về ẩm thực; mô tả biểu đồ và tỷ lệ; nghe tình huống ăn uống với thông tin gây nhiễu; trình bày món ăn yêu thích.",
    "U05": "Đọc về mua sắm và tiêu dùng; lập luận cho Writing Task 2; nghe địa điểm, giá và lựa chọn cuối cùng; thảo luận thói quen mua sắm.",
    "U06": "Đọc về thể thao và thời gian rảnh; phát triển đoạn Writing Task 2; nghe và điền nhãn bản đồ; nói về sở thích.",
    "U07": "Đọc về truyền thông và người nổi tiếng; phát triển luận điểm Task 2; nghe sơ đồ quy trình và quan điểm; luyện Speaking Part 2–3.",
    "U08": "Đọc về thế giới tự nhiên; viết kết luận và bài Task 2 hai câu hỏi; nghe ghi chú về động vật; nói về một loài vật.",
}
SKILLS = {"R": "Reading", "W": "Writing", "L": "Listening", "S": "Speaking"}


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def main(archive_path: Path) -> None:
    with ZipFile(archive_path) as archive:
        if bad := archive.testzip():
            raise ValueError(f"Corrupt archive entry: {bad}")
        names = set(archive.namelist())
        supplied_manifest = json.loads(archive.read("manifest.json"))
        if supplied_manifest.get("file_count") != len(supplied_manifest.get("files", [])):
            raise ValueError("Invalid source manifest")
        for entry in supplied_manifest["files"]:
            name = entry["path"]
            if name not in names or sha256(archive.read(name)).hexdigest() != entry["sha256"]:
                raise ValueError(f"Source integrity check failed: {name}")

        catalog = json.loads(archive.read("catalog.json"))
        if catalog.get("unit_count") != 8 or len(catalog.get("units", [])) != 8:
            raise ValueError("Expected eight units")
        write_bytes(SOURCE / "catalog.json", archive.read("catalog.json"))
        units = []
        for order in range(1, 9):
            unit_id = f"U{order:02d}"
            prefix = f"units/{unit_id}/"
            source_name = f"{prefix}unit.json"
            unit = json.loads(archive.read(source_name))
            catalog_unit = catalog["units"][order - 1]
            if catalog_unit["id"] != unit_id or catalog_unit["title"] != unit["title"]:
                raise ValueError(f"Catalog and unit disagree: {unit_id}")
            activities = unit.get("activities", [])
            counts = Counter(item.get("skill") for item in activities)
            if set(counts) != set(SKILLS) or len(activities) != catalog_unit["exercise_groups"]:
                raise ValueError(f"Activity groups disagree: {unit_id}")
            item_count = sum(len(activity.get("items", [])) for activity in activities)
            if item_count != catalog_unit["items"]:
                raise ValueError(f"Activity items disagree: {unit_id}")
            write_bytes(SOURCE / "units" / unit_id / "unit.json", archive.read(source_name))

            pdf_name = f"{prefix}student.pdf"
            if not archive.read(pdf_name).startswith(b"%PDF-"):
                raise ValueError(f"Invalid learner PDF: {unit_id}")
            pdf_url = f"/starter-supplement/{unit_id}/student.pdf"
            write_bytes(PUBLIC / unit_id / "student.pdf", archive.read(pdf_name))

            audio_names = sorted(name for name in names if name.startswith(f"{prefix}audio/") and name.endswith(".mp3"))
            if not audio_names:
                raise ValueError(f"Missing audio: {unit_id}")
            track_data = unit.get("listening") or unit.get("tracks") or {}
            tracks = []
            for name in audio_names:
                file_name = Path(name).name
                track_key = Path(name).stem.split("_")[-1]
                track = track_data.get(track_key) or track_data.get(f"L-{track_key}") or {}
                url = f"/starter-supplement/{unit_id}/audio/{file_name}"
                write_bytes(PUBLIC / unit_id / "audio" / file_name, archive.read(name))
                tracks.append({"title": track.get("title") or f"Track {track_key}", "url": url})

            for name in sorted(n for n in names if n.startswith(f"{prefix}assets/") and not n.endswith("/")):
                write_bytes(PUBLIC / unit_id / "assets" / Path(name).name, archive.read(name))

            units.append({
                "id": unit_id,
                "order": order,
                "title": unit["title"],
                "summaryVi": SUMMARIES[unit_id],
                "activityCount": len(activities),
                "itemCount": item_count,
                "skills": [
                    {"name": name, "count": counts[code], "examples": [a["title"] for a in activities if a.get("skill") == code][:3]}
                    for code, name in SKILLS.items()
                ],
                "pdfUrl": pdf_url,
                "tracks": tracks,
            })

        METADATA.parent.mkdir(parents=True, exist_ok=True)
        METADATA.write_text(json.dumps({"courseId": catalog["course_id"], "units": units}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Imported {len(units)} units, {sum(u['activityCount'] for u in units)} activities, "
              f"{sum(u['itemCount'] for u in units)} items, {sum(len(u['tracks']) for u in units)} audio files")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Pass the course ZIP as the only argument")
    main(Path(sys.argv[1]).resolve())
