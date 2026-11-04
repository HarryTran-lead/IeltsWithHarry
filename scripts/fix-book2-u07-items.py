"""Review fixes for the M06 Unit 7 of Book 2, applied after build-book-2.py --publish U07.

Every key was checked against its passage or transcript. This script:
- replaces the templated explanations with one that names the evidence,
- clears "evidence" on NOT GIVEN items, where the package quoted an unrelated opening sentence,
- accepts equivalent answers (Thursday, 14th September, 10 pm, degree),
- attaches the two Task 1 datasets, which the writing items did not reference.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "content/book2/lessons"

EXPLANATIONS = {
    "B2-U07-R-E01-Q001": "Đoạn B: trường có thể yêu cầu một portfolio, tức bộ sưu tập sản phẩm sáng tạo.",
    "B2-U07-R-E01-Q002": "Đoạn C: học bổng dựa vào thành tích học tập hoặc thu nhập hộ gia đình (household income).",
    "B2-U07-R-E01-Q003": "Đoạn E: tutorial là buổi học nhóm nhỏ để chất vấn bằng chứng và nhận phản hồi.",
    "B2-U07-R-E01-Q004": "Đoạn C: điều kiện nhận hỗ trợ khác nhau, nên phải kiểm tra thay vì nghĩ học bổng trả mọi chi phí.",
    "B2-U07-R-E01-Q005": "Đoạn F khuyên so sánh nội dung, hỗ trợ, chi phí và cơ hội rồi mới chọn; không nói kinh nghiệm luôn hơn điểm số.",
    "B2-U07-R-E01-Q006": "Đoạn B nói trường có thể yêu cầu portfolio hoặc phỏng vấn, trái với “never”.",
    "B2-U07-R-E01-Q007": "Đoạn B nói khảo sát không chứng minh chuẩn bị sớm gây ra tỷ lệ đỗ cao hơn, nên “proved” là sai.",
    "B2-U07-R-E01-Q008": "Bài không nói Brookford cấp học bổng cho bao nhiêu học sinh; không có thông tin để xác nhận hay phủ định.",
    "B2-U07-R-E02-Q001": "Đoạn B: họ chuyển một phòng kho không dùng (unused storage room) thành phòng thảo luận.",
    "B2-U07-R-E02-Q002": "Đoạn D: bàn đọc cá nhân ở khu phía bắc (northern section), phòng thảo luận ở phía nam.",
    "B2-U07-R-E02-Q003": "Đoạn C: thủ thư (librarians) giúp học sinh đặt câu hỏi để đánh giá nguồn.",
    "B2-U07-R-E02-Q004": "Đoạn B: học sinh cần chỗ thảo luận mà không làm phiền người khác, nên trường mở phòng có đặt chỗ.",
    "B2-U07-R-E02-Q005": "Đoạn B: số lượt đặt cho thấy nhu cầu nhưng không chứng minh làm việc nhóm giúp điểm thi cao hơn.",
    "B2-U07-R-E02-Q006": "Đoạn B nói nhân viên không bỏ khu đọc yên tĩnh, nên nhận định “removed all” là sai.",
    "B2-U07-R-E02-Q007": "Đoạn E nói một số gia đình không có internet ổn định ở nhà, khớp với nhận định.",
    "B2-U07-R-E02-Q008": "Bài không nhắc việc mua máy tính, càng không có con số năm mươi; không đủ thông tin.",
    "B2-U07-R-E03-Q001": "Đoạn B: Lina ghi lại câu hỏi của cư dân về việc tái chế (recycling).",
    "B2-U07-R-E03-Q002": "Đoạn D: người hướng dẫn gặp Lina mỗi thứ Sáu (each Friday).",
    "B2-U07-R-E03-Q003": "Đoạn C: cuối mỗi tuần Lina viết một bản tường thuật ngắn (a short account).",
    "B2-U07-R-E03-Q004": "Đoạn B: cư dân còn lo về giờ thu gom và khoảng cách tới điểm tái chế, nên Lina hiểu số liệu khoa học là chưa đủ.",
    "B2-U07-R-E03-Q005": "Đoạn D: giá trị học tập phụ thuộc vào phản hồi, không chỉ là thời gian ngồi văn phòng.",
    "B2-U07-R-E03-Q006": "Đoạn A: placement không nhất thiết là việc có lương, trái với “all … paid”.",
    "B2-U07-R-E03-Q007": "Đoạn E: thực tập xa nhà có thể tốn chi phí đi lại, khớp với nhận định.",
    "B2-U07-R-E03-Q008": "Bài không nói Lina được nhận việc lâu dài sau kỳ thực tập.",
    "B2-U07-R-E04-Q001": "Đoạn B: trường Northbridge đưa vào một phiếu phản hồi ngắn (feedback sheet).",
    "B2-U07-R-E04-Q002": "Đoạn B: học sinh có mười phút ở buổi sau để sửa theo nhận xét.",
    "B2-U07-R-E04-Q003": "Đoạn E: rubric mô tả tiêu chí, giúp yêu cầu trở nên rõ ràng.",
    "B2-U07-R-E04-Q004": "Đoạn C: “develop your argument” khó dùng với người mới vì không nói cụ thể phải làm gì.",
    "B2-U07-R-E04-Q005": "Đoạn E: tự đánh giá theo tiêu chí, rồi đối chiếu với phản hồi của giáo viên.",
    "B2-U07-R-E04-Q006": "Đoạn B: nhân viên không khẳng định điểm của mọi học sinh tăng ngay, nên nhận định sai.",
    "B2-U07-R-E04-Q007": "Đoạn A: mỗi hình thức đánh giá cho một loại bằng chứng khác nhau về năng lực.",
    "B2-U07-R-E04-Q008": "Bài không cho biết trường có bao nhiêu giáo viên.",
    "B2-U07-L-E01-Q001": "Khóa từng được quảng cáo ngày 7 nhưng đã dời một tuần; ngày bắt đầu là 14 tháng Chín.",
    "B2-U07-L-E01-Q002": "Trước đây học thứ Hai và thứ Tư, nhưng kỳ này học thứ Ba và thứ Năm (Tuesdays and Thursdays).",
    "B2-U07-L-E01-Q003": "£280 là học phí năm ngoái; học phí hiện tại là £310.",
    "B2-U07-L-E01-Q004": "Máy tính có sẵn, chỉ cần mang USB drive nếu muốn mang bài về.",
    "B2-U07-L-E01-Q005": "Lớp nhận tối đa 18 người; 12 là số chỗ đã xác nhận.",
    "B2-U07-L-E01-Q006": "Văn phòng thường trả lời trong ba ngày làm việc.",
    "B2-U07-L-E01-Q007": "Chỉ thanh toán sau khi nhận email xác nhận, vì email đó có đường dẫn thanh toán.",
    "B2-U07-L-E01-Q008": "Mẫu đăng ký giúp giảng viên chuẩn bị buổi đầu, không quyết định việc nhận học viên.",
    "B2-U07-L-E02-Q001": "Sách đặt trước nhận ở quầy collection counter, bên trái quầy thông tin; không nhầm với hộp trả sách.",
    "B2-U07-L-E02-Q002": "Phòng học nhóm ở tầng một (first floor), phía trên quán cà phê.",
    "B2-U07-L-E02-Q003": "Thư viện mở đến mười giờ tối ngày thường; bảy giờ là giờ đóng của quán cà phê.",
    "B2-U07-L-E02-Q004": "In đen trắng 5 pence một trang, in màu 20 pence.",
    "B2-U07-L-E02-Q005": "Laptop mượn ngắn hạn được tối đa bốn giờ.",
    "B2-U07-L-E02-Q006": "Buổi giới thiệu được dời từ thứ Hai sang thứ Tư.",
    "B2-U07-L-E02-Q007": "Mẫu đăng ký ở mục Events trên website thư viện.",
    "B2-U07-L-E02-Q008": "Bàn kỹ năng học thuật giúp kiểm tra lập luận có rõ không, nhưng không viết bài hộ.",
    "B2-U07-L-E03-Q001": "Thuyết trình mười phút, sau đó hai phút hỏi đáp; mười hai là tổng thời gian.",
    "B2-U07-L-E03-Q002": "Được dùng từ sáu đến tám slide nội dung, nên tối thiểu là sáu.",
    "B2-U07-L-E03-Q003": "Lịch nháp ghi thứ Ba, nhưng giảng viên sửa lại là thứ Năm tuần sau.",
    "B2-U07-L-E03-Q004": "Trường thêm hoạt động sửa bài (revision activity) mười phút sau khi trả nhận xét.",
    "B2-U07-L-E03-Q005": "Nghiên cứu chỉ ghi nhận học sinh sửa bài nhiều hơn, không đo kết quả thi dài hạn.",
    "B2-U07-L-E03-Q006": "Cách chia đầu tiên làm Maya nói hai phần; họ đổi lại: Maya mở bài và case study, Jon công cụ số và kết luận.",
    "B2-U07-L-E03-Q007": "Giảng viên nói sẽ góp ý nhưng không thuyết trình.",
    "B2-U07-L-E03-Q008": "Giảng viên dặn ghi nguồn trên mỗi slide bằng chứng.",
    "B2-U07-L-E04-Q001": "Giảng viên nói nhiều chương trình đại học (degree programmes) đòi hỏi tự đọc nhiều.",
    "B2-U07-L-E04-Q002": "Apprenticeship kết hợp làm việc có lương với đào tạo có cấu trúc.",
    "B2-U07-L-E04-Q003": "Học xa nhà có thể cần chỗ ở (accommodation).",
    "B2-U07-L-E04-Q004": "Bài tập buổi sau: chọn hai lộ trình vào một nghề và so sánh theo bốn tiêu chí.",
    "B2-U07-L-E04-Q005": "Với học nghề, cần kiểm tra nhà tuyển dụng có công nhận bằng cấp không.",
    "B2-U07-L-E04-Q006": "Lựa chọn phụ thuộc vào mục tiêu, tài chính và cách học của mỗi người.",
    "B2-U07-L-E04-Q007": "Giảng viên dặn đừng nghĩ mọi apprenticeship đều kéo dài hai năm.",
    "B2-U07-L-E04-Q008": "Người đi làm trước vẫn có thể quay lại học sau.",
}

ALTERNATIVES = {
    "B2-U07-L-E01-Q001": ["14th September", "September 14th", "14th of September"],
    "B2-U07-L-E02-Q003": ["10 pm", "10:00", "10 o'clock", "ten o'clock"],
    "B2-U07-L-E03-Q003": ["Thursday"],
    "B2-U07-L-E04-Q001": ["degree", "degree programmes", "degrees"],
}

# Task 1 data from unit.json data_visuals, as rows the lesson can draw.
VISUALS = {
    "B2-U07-W-E01-Q001": {"id": "W-TABLE-01", "title": "Study routes chosen by students in three colleges, 2025 (%)", "headers": ["College", "University", "Vocational", "Employment"], "rows": [["College A", 55, 30, 15], ["College B", 42, 38, 20], ["College C", 33, 27, 40]], "image_url": ""},
    "B2-U07-W-E02-Q001": {"id": "W-BAR-02", "title": "Average weekly independent-study hours, 2024 and 2025", "headers": ["Programme", "2024", "2025"], "rows": [["Academic", 12, 15], ["Vocational", 9, 11], ["Part-time", 7, 8]], "image_url": ""},
}

changed = 0
for path in sorted(ROOT.glob("b2-u07-*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    before = json.dumps(data, ensure_ascii=False)
    for exercise in data["exercises"]:
        for item in exercise["questions"]:
            qid = item["question_id"]
            if qid in EXPLANATIONS:
                item["explanation_vi"] = EXPLANATIONS[qid]
            if (item["answer"].get("accepted") or [None])[0] == "NOT GIVEN":
                item["evidence"] = ""
            for extra in ALTERNATIVES.get(qid, []):
                if extra not in item["answer"]["accepted"]:
                    item["answer"]["accepted"].append(extra)
            visual = VISUALS.get(qid)
            if visual:
                item["data_id"] = visual["id"]
                if all(existing["id"] != visual["id"] for existing in data["visuals"]):
                    data["visuals"].append(visual)
    if json.dumps(data, ensure_ascii=False) != before:
        changed += 1
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

print(f"Updated {changed} Unit 7 lessons.")
