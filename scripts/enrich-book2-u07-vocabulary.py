"""Add short, topic-matched vocabulary sets to Book 2 Unit 7 lessons."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public/book-2/lessons"
WORDS = {
    "b2-u07-l-l07": [("sixth form", "bậc học sau 16 tuổi"), ("vocational", "hướng nghề nghiệp"), ("college", "trường cao đẳng"), ("university entry", "đầu vào đại học")],
    "b2-u07-l-l08": [("Reception", "lớp đầu của bậc tiểu học"), ("key stage", "giai đoạn học"), ("compulsory", "bắt buộc"), ("pathway", "lộ trình học")],
    "b2-u07-l-l09": [("application", "đơn đăng ký"), ("conditional offer", "thư mời có điều kiện"), ("entry requirement", "điều kiện đầu vào"), ("placement", "đợt thực tập")],
    "b2-u07-r-l01": [("campus", "khuôn viên trường"), ("assignment", "bài tập được giao"), ("flow-chart", "sơ đồ quy trình"), ("qualification", "bằng cấp")],
    "b2-u07-r-l02": [("obligation", "nghĩa vụ"), ("advice", "lời khuyên"), ("should", "nên"), ("must", "phải")],
    "b2-u07-r-l03": [("typewriter", "máy đánh chữ"), ("inked ribbon", "ruy băng mực"), ("mechanism", "cơ chế hoạt động"), ("explanation", "lời giải thích")],
    "b2-u07-r-l04": [("bachelor degree", "bằng cử nhân"), ("honours", "chương trình danh dự"), ("qualification", "trình độ được công nhận"), ("duration", "thời lượng")],
    "b2-u07-s-l10": [("strict", "nghiêm khắc"), ("academic style", "văn phong học thuật"), ("homework", "bài tập về nhà"), ("tutor", "giảng viên hướng dẫn")],
    "b2-u07-s-l11": [("cause", "nguyên nhân"), ("effect", "tác động"), ("private education", "giáo dục tư thục"), ("pressure", "áp lực")],
    "b2-u07-s-l12": [("contraction", "dạng viết tắt"), ("pronunciation", "cách phát âm"), ("fluent", "trôi chảy"), ("natural", "tự nhiên")],
    "b2-u07-w-l05": [("opinion", "quan điểm"), ("argument", "lập luận"), ("supporting idea", "ý bổ trợ"), ("formal", "trang trọng")],
    "b2-u07-w-l06": [("introduction", "mở bài"), ("body paragraph", "đoạn thân bài"), ("conclusion", "kết luận"), ("restate", "diễn đạt lại")],
}

for slug, words in WORDS.items():
    path = ROOT / f"{slug}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["lesson"]["vocabulary"] = [
        {"term": term, "meaning_vi": meaning, "example_en": ""} for term, meaning in words
    ]
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

print(f"Enriched {len(WORDS)} Unit 7 lessons with short vocabulary sets.")
