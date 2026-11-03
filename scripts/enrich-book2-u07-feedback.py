"""Give Book 2 Unit 7 exercises Vietnamese titles, instructions and explanations.

The Unit 7 source shipped exercise IDs as titles, no instructions, and English
explanations that point at book pages learners cannot see. Run after build-book-2.py.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public/book-2/lessons"

EXERCISES = {
    "B2-U07-L-E01": ("Các loại trường ở Anh", "Nghe bài A, chọn loại trường đúng với mô tả rồi điền từ còn thiếu."),
    "B2-U07-L-E02": ("Sơ đồ các bậc học", "Nghe bài B và nhìn sơ đồ: đi theo mũi tên để biết sau mỗi bậc học có thể chọn hướng nào."),
    "B2-U07-L-E03": ("Đăng ký đại học và cuộc sống sinh viên", "Đọc trước câu hỏi, đoán loại từ cần nghe (số, danh từ, tên khóa học) rồi nghe và trả lời."),
    "B2-U07-R-E01": ("Từ vựng đời sống đại học", "Đọc định nghĩa tiếng Anh và viết đúng một từ. Kiểm tra chính tả trước khi bấm Kiểm tra."),
    "B2-U07-R-E02": ("Hoàn thành sơ đồ quy trình", "Đọc bài A theo thứ tự các bước. Mỗi chỗ trống lấy đúng từ trong bài, không thêm từ."),
    "B2-U07-R-E03": ("Động từ khuyết thiếu: nghĩa vụ và lời khuyên", "Chọn câu thể hiện đúng mức độ: should là lời khuyên, must là bắt buộc, must not là cấm."),
    "B2-U07-R-E04": ("Đọc bản đồ khuôn viên", "Đọc bài B, chú ý các cụm chỉ vị trí như next to, behind, in front of."),
    "B2-U07-R-E05": ("Cơ chế của máy đánh chữ", "Đọc bài C theo trình tự hoạt động và điền tên bộ phận được nhắc đến."),
    "B2-U07-R-E06": ("Hiểu phần giải thích trong bài", "Tìm cách bài đọc giải thích từ khó và phân loại thiết bị nhập, xuất, lưu trữ."),
    "B2-U07-R-E07": ("Sơ đồ bằng cấp ở Úc", "Đọc bài D và điền tên bằng cấp hoặc hình thức học khớp với thời lượng."),
    "B2-U07-R-E08": ("Thời lượng và điều kiện của bằng cấp", "Tìm con số và điều kiện trong bài D; cẩn thận phân biệt full-time và part-time."),
    "B2-U07-S-E01": ("Từ vựng nói về giáo dục", "Điền từ phù hợp rồi trả lời 2–3 câu về hệ thống giáo dục của bạn."),
    "B2-U07-S-E02": ("Nguyên nhân và hệ quả", "Mỗi câu nêu một ý, thêm because, so hoặc as a result để nối nguyên nhân với hệ quả."),
    "B2-U07-S-E03": ("Dạng rút gọn và bài nói Part 2–3", "Viết dạng rút gọn, rồi luyện nói tự nhiên với I’d, it’s, I’ll trong câu trả lời."),
    "B2-U07-W-E01": ("Tìm ý và nêu quan điểm", "Phân biệt cách nói và cách viết trang trọng, rồi viết một câu nêu rõ quan điểm của bạn."),
    "B2-U07-W-E02": ("Sắp xếp bài viết", "Ôn chức năng của mở bài, thân bài, kết luận và việc cần kiểm tra khi soát lỗi."),
}

EXPLANATIONS = {
    "B2-U07-L-E01-Q001": "Sixth form college dành cho học sinh từ 16 tuổi học tiếp để chuẩn bị thi vào đại học.",
    "B2-U07-L-E01-Q002": "Further education college thường dạy các khóa hướng nghề (vocational), không chỉ khóa học thuật.",
    "B2-U07-L-E01-Q003": "Nursery school là trường mầm non, dành cho trẻ nhỏ trước tuổi tiểu học.",
    "B2-U07-L-E01-Q004": "Adult education là giáo dục cho người lớn, giúp người đã đi làm quay lại học.",
    "B2-U07-L-E02-Q006": "Với sơ đồ, hãy đi theo mũi tên và đoán loại thông tin cần nghe trước khi audio bắt đầu.",
    "B2-U07-L-E02-Q007": "GCSE là kỳ thi bắt buộc ở Key Stage 4, kết thúc bậc trung học cơ sở ở Anh.",
    "B2-U07-L-E02-Q008": "Sơ đồ cho thấy sau 16 tuổi có thể vừa đi làm vừa học bán thời gian (part-time study).",
    "B2-U07-L-E03-Q001": "Người nói cho biết trên UCAS học sinh thường chọn năm trường đại học.",
    "B2-U07-L-E03-Q002": "Conditional offer là thư mời có điều kiện: học sinh phải đạt điểm (grades) yêu cầu ở kỳ thi cuối.",
    "B2-U07-L-E03-Q003": "Theo người nói, sinh viên nghe bài giảng (lecture) trước, sau đó thảo luận trong seminar.",
    "B2-U07-L-E03-Q004": "Bài nghe nêu hai hình thức đánh giá: bài tập (assignments) và bài thi (exams).",
    "B2-U07-R-E03-Q001": "Biểu đồ liệt kê lớp học và hoạt động theo từng ngày trong tuần, tức là một thời khóa biểu.",
    "B2-U07-R-E03-Q002": "Should dùng để khuyên: nên làm gì, không bắt buộc.",
    "B2-U07-R-E03-Q003": "Must thể hiện nghĩa vụ mạnh, gần như bắt buộc; should chỉ là lời khuyên.",
    "B2-U07-R-E03-Q004": "Biển cấm mang nghĩa must not: không được gian lận trong kỳ thi.",
    "B2-U07-R-E06-Q001": "Từ microchip được giải thích bằng chú thích ở cuối bài (footnote), không giải thích ngay trong câu.",
    "B2-U07-R-E06-Q002": "Thiết bị nhập (input) đưa thông tin vào máy tính; bàn phím là ví dụ rõ nhất.",
    "B2-U07-R-E06-Q003": "Thiết bị xuất (output) hiển thị kết quả cho người dùng; màn hình là thiết bị xuất.",
    "B2-U07-R-E06-Q004": "Thiết bị lưu trữ đi cùng memory stick được gọi là flash memory; đáp án vừa đúng hai từ.",
    "B2-U07-R-E08-Q001": "Bài đọc nói bằng cử nhân phổ biến nhất ở Úc kéo dài ba năm.",
    "B2-U07-R-E08-Q002": "Bài đọc cho biết học thạc sĩ bán thời gian thường mất hai năm.",
    "B2-U07-R-E08-Q003": "Muốn học tiến sĩ cần có bằng cử nhân hoặc thạc sĩ trước đó.",
    "B2-U07-R-E08-Q004": "Honours là năm học thêm ở mức cao hơn sau chương trình cử nhân thông thường.",
    "B2-U07-W-E01-Q001": "Personally, I think… mang tính văn nói; trong bài viết trang trọng nên dùng In my view hoặc I would argue that.",
    "B2-U07-W-E01-Q002": "Đề nghị luận quan điểm là câu hỏi có hai phía để tranh luận, ví dụ có nên phạt học sinh đi muộn không.",
    "B2-U07-W-E01-Q003": "Câu mở bài tốt giới thiệu chủ đề gap year một cách khách quan trước khi nêu quan điểm.",
    "B2-U07-W-E02-Q001": "Kết luận tóm tắt ý chính và nhắc lại quan điểm của người viết.",
    "B2-U07-W-E02-Q002": "Mở bài diễn đạt lại đề bằng từ của bạn, không chép nguyên đề.",
    "B2-U07-W-E02-Q003": "Mỗi đoạn chỉ nên có một ý chính để bài mạch lạc.",
    "B2-U07-W-E02-Q004": "Khi soát lỗi, kiểm tra dấu câu, ngữ pháp và số từ.",
    "B2-U02-L-E04-Q006": "Half past six là sáu giờ ba mươi; đề đã có p.m. nên chỉ cần viết 6:30.",
    "B2-U02-W-E06-Q001": "Cộng hai nhóm: 1.200 + 700 = 1.900.",
}

# British and American spellings are both accepted in IELTS.
ALTERNATIVES = {"B2-U07-R-E01-Q003": ["enroll"]}

lessons = changed = 0
for path in sorted(ROOT.glob("b2-*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    touched = False
    for exercise in data["exercises"]:
        if exercise["id"] in EXERCISES:
            title, instruction = EXERCISES[exercise["id"]]
            exercise["title"] = title
            exercise["instruction"] = {"en": "", "vi": instruction}
            touched = True
        for item in exercise["questions"]:
            if item["question_id"] in EXPLANATIONS:
                if not item.get("explanation_en"):
                    item["explanation_en"] = item.get("explanation_vi", "")
                item["explanation_vi"] = EXPLANATIONS[item["question_id"]]
                touched = True
                changed += 1
            for extra in ALTERNATIVES.get(item["question_id"], []):
                if extra not in item["answer"]["accepted"]:
                    item["answer"]["accepted"].append(extra)
                    touched = True
    if touched:
        lessons += 1
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

print(f"Updated {lessons} lessons, {changed} explanations, {len(EXERCISES)} exercise titles.")
