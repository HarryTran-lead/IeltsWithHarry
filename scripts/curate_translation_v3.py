"""Deterministic data curation, topic normalization, and pedagogical enrichment (v3)
for the 2,040 Band Translation exercises.

Preserves 100% of exercise IDs and versions so learner progress never breaks.
"""

from __future__ import annotations

import collections
import re

DIRECT_TOPIC_MAP: dict[str, str] = {
    "giáo dục": "Giáo dục & Trường học",
    "trường học": "Giáo dục & Trường học",
    "nghiên cứu": "Giáo dục & Trường học",
    "học tập": "Giáo dục & Trường học",
    "thể thao và trường học": "Giáo dục & Trường học",
    "công nghệ": "Công nghệ & Khoa học",
    "công nghệ và công việc": "Công nghệ & Khoa học",
    "sức khỏe": "Sức khỏe & Y tế",
    "y tế": "Sức khỏe & Y tế",
    "thực phẩm và sức khỏe": "Sức khỏe & Y tế",
    "môi trường": "Môi trường & Năng lượng",
    "năng lượng": "Môi trường & Năng lượng",
    "thiên nhiên": "Môi trường & Năng lượng",
    "thời tiết": "Môi trường & Năng lượng",
    "động vật": "Môi trường & Năng lượng",
    "đô thị": "Đô thị & Nhà ở",
    "nhà ở": "Đô thị & Nhà ở",
    "nha ở": "Đô thị & Nhà ở",
    "nhà cửa": "Đô thị & Nhà ở",
    "nhà ở và xã hội": "Đô thị & Nhà ở",
    "công việc": "Công việc & Kinh tế",
    "kinh tế": "Công việc & Kinh tế",
    "mua sắm": "Công việc & Kinh tế",
    "chính sách công": "Xã hội & Chính sách",
    "chính sách": "Xã hội & Chính sách",
    "chính sách công và kinh tế": "Xã hội & Chính sách",
    "xã hội": "Xã hội & Chính sách",
    "đi lại": "Giao thông & Đi lại",
    "giao thông": "Giao thông & Đi lại",
    "văn hóa": "Văn hóa & Du lịch",
    "du lịch": "Văn hóa & Du lịch",
    "văn hóa và du lịch": "Văn hóa & Du lịch",
    "đồ ăn": "Ẩm thực & Dinh dưỡng",
    "ăn uống": "Ẩm thực & Dinh dưỡng",
    "thể thao": "Thể thao & Giải trí",
    "sở thích": "Thể thao & Giải trí",
    "giải trí": "Thể thao & Giải trí",
    "gia đình": "Gia đình & Đời sống",
    "gia đình và thời gian": "Gia đình & Đời sống",
    "bản thân": "Gia đình & Đời sống",
    "thời gian": "Gia đình & Đời sống",
    "cảm xúc": "Gia đình & Đời sống",
    "quan hệ": "Gia đình & Đời sống",
    "thói quen": "Gia đình & Đời sống",
    "kế hoạch": "Gia đình & Đời sống",
    "quá khứ": "Gia đình & Đời sống",
    "đồ dùng": "Gia đình & Đời sống",
    "màu sắc": "Gia đình & Đời sống",
    "đời sống": "Gia đình & Đời sống",
}

TOPIC_KEYWORDS: list[tuple[str, list[str]]] = [
    ("Giáo dục & Trường học", [
        "học sinh", "sinh viên", "trường", "đại học", "giáo viên", "giảng viên",
        "bài tập", "lớp học", "thư viện", "khóa học", "học bổng", "kỳ thi",
        "nghiên cứu", "chương trình học", "học trực tuyến", "sách giáo khoa",
        "student", "school", "university", "teacher", "classroom", "library",
        "scholarship", "exam", "homework", "course", "curriculum", "research",
    ]),
    ("Công nghệ & Khoa học", [
        "công nghệ", "máy tính", "điện thoại", "phần mềm", "thuật toán", "dữ liệu",
        "trực tuyến", "tự động hóa", "trí tuệ nhân tạo", "mạng xã hội", "ứng dụng",
        "kỹ thuật số", "thiết bị", "internet", "website", "mật khẩu",
        "technology", "digital", "algorithm", "software", "automation", "data",
        "device", "computer", "smartphone", "internet", "online platform",
    ]),
    ("Môi trường & Năng lượng", [
        "môi trường", "rác thải", "ô nhiễm", "khí hậu", "năng lượng", "điện mặt trời",
        "tái chế", "nhựa", "rừng", "cây xanh", "nước sạch", "khí thải", "thời tiết",
        "mưa", "nắng", "sông", "biển", "động vật", "thiên nhiên",
        "environment", "climate", "pollution", "waste", "solar", "renewable",
        "emission", "recycle", "recycling", "plastic", "forest", "weather",
    ]),
    ("Sức khỏe & Y tế", [
        "sức khỏe", "bệnh viện", "bác sĩ", "bệnh nhân", "giấc ngủ", "tập thể dục",
        "khám bệnh", "thuốc", "phòng khám", "căng thẳng", "y tế", "tiêm chủng",
        "điều trị", "chăm sóc sức khỏe",
        "health", "hospital", "doctor", "patient", "medical", "clinic", "sleep",
        "vaccine", "treatment", "stress", "healthcare",
    ]),
    ("Giao thông & Đi lại", [
        "xe buýt", "tàu điện", "ga tàu", "giao thông", "ùn tắc", "đi làm", "xe đạp",
        "sân bay", "chuyến bay", "đường phố", "lái xe", "phương tiện công cộng",
        "traffic", "commute", "commuting", "bus", "train", "station", "bicycle",
        "metro", "airport", "flight", "congestion", "transport",
    ]),
    ("Đô thị & Nhà ở", [
        "đô thị", "thành phố", "nhà ở", "giá thuê", "căn hộ", "khu dân cư",
        "không gian công cộng", "công viên", "tòa nhà", "quy hoạch", "trung tâm",
        "urban", "city", "cities", "housing", "rent", "apartment", "neighbourhood",
        "neighborhood", "public space", "redevelopment",
    ]),
    ("Công việc & Kinh tế", [
        "công việc", "nhân viên", "công ty", "văn phòng", "tiền lương", "thu nhập",
        "ngân sách", "thị trường", "chi phí", "giá cả", "doanh nghiệp", "tuyển dụng",
        "người lao động", "cửa hàng", "siêu thị", "mua sắm", "kinh tế",
        "work", "worker", "employee", "company", "office", "salary", "income",
        "budget", "market", "business", "funding", "cost", "career", "job",
    ]),
    ("Ẩm thực & Dinh dưỡng", [
        "bữa sáng", "bữa trưa", "bữa tối", "nấu ăn", "món ăn", "thực phẩm", "trái cây",
        "cà phê", "trà", "bánh mì", "cơm", "rau", "đường", "nhà hàng", "quán",
        "food", "meal", "breakfast", "lunch", "dinner", "cook", "cooking", "coffee",
        "tea", "fruit", "vegetable", "restaurant", "diet", "sugar",
    ]),
    ("Văn hóa & Du lịch", [
        "du lịch", "bảo tàng", "lễ hội", "di sản", "khách sạn", "chuyến đi", "kỳ nghỉ",
        "âm nhạc", "bộ phim", "nghệ thuật", "văn hóa", "bài hát", "du khách",
        "museum", "tourist", "tourism", "travel", "festival", "heritage", "hotel",
        "holiday", "culture", "cultural", "music", "concert", "film",
    ]),
    ("Thể thao & Giải trí", [
        "thể thao", "bóng đá", "bơi", "chạy bộ", "sân vận động", "trận đấu", "đội tuyển",
        "vận động viên", "câu lạc bộ", "trò chơi", "vườn",
        "sport", "football", "swim", "swimming", "match", "stadium", "athlete", "team",
    ]),
    ("Xã hội & Chính sách", [
        "chính sách", "chính phủ", "cộng đồng", "người dân", "công bằng", "quy định",
        "trợ cấp", "phúc lợi", "bằng chứng", "cơ sở", "nguồn lực", "xã hội",
        "policy", "government", "community", "public", "regulation", "subsidy",
        "evidence", "inequality", "welfare", "citizen",
    ]),
]

# Verified bilingual pairs (English term, Vietnamese cue substring, clean Vietnamese meaning)
# Used ONLY when the exercise lacks targetTerm and BOTH English (word-boundary) and Vietnamese match.
VERIFIED_LEXICON: list[tuple[str, str, str]] = [
    ("public transport", "giao thông công cộng", "giao thông công cộng"),
    ("public transport", "phương tiện công cộng", "phương tiện công cộng"),
    ("public libraries", "thư viện công cộng", "thư viện công cộng"),
    ("public library", "thư viện công cộng", "thư viện công cộng"),
    ("online learning", "học trực tuyến", "học trực tuyến"),
    ("online courses", "khóa học trực tuyến", "khóa học trực tuyến"),
    ("working adults", "người đi làm", "người đi làm"),
    ("commuting time", "thời gian đi lại", "thời gian đi lại"),
    ("direct feedback", "phản hồi trực tiếp", "phản hồi trực tiếp"),
    ("city centre", "trung tâm", "trung tâm thành phố"),
    ("night-shift workers", "người làm ca tối", "người làm ca tối"),
    ("viable alternatives", "phương án đi lại thay thế", "phương án thay thế khả thi"),
    ("viable alternatives", "phương án thay thế", "phương án thay thế khả thi"),
    ("allocating resources", "phân bổ nguồn lực", "phân bổ nguồn lực"),
    ("renewable energy", "năng lượng tái tạo", "năng lượng tái tạo"),
    ("affordable housing", "nhà ở giá phải chăng", "nhà ở giá phải chăng"),
    ("housing affordability", "khả năng chi trả nhà ở", "khả năng chi trả nhà ở"),
    ("climate change", "biến đổi khí hậu", "biến đổi khí hậu"),
    ("air pollution", "ô nhiễm không khí", "ô nhiễm không khí"),
    ("air quality", "chất lượng không khí", "chất lượng không khí"),
    ("traffic congestion", "ùn tắc giao thông", "ùn tắc giao thông"),
    ("congestion", "ùn tắc", "tình trạng ùn tắc"),
    ("plastic waste", "rác thải nhựa", "rác thải nhựa"),
    ("reduce waste", "giảm rác thải", "giảm rác thải"),
    ("remote work", "làm việc từ xa", "làm việc từ xa"),
    ("work from home", "làm việc tại nhà", "làm việc tại nhà"),
    ("working from home", "làm việc tại nhà", "làm việc tại nhà"),
    ("rural areas", "vùng nông thôn", "vùng nông thôn"),
    ("low-income", "thu nhập thấp", "thu nhập thấp"),
    ("long-term", "dài hạn", "dài hạn / lâu dài"),
    ("long-term", "lâu dài", "lâu dài"),
    ("short-term", "ngắn hạn", "ngắn hạn"),
    ("unintended consequences", "hệ quả ngoài ý muốn", "hệ quả ngoài ý muốn"),
    ("local communities", "cộng đồng địa phương", "cộng đồng địa phương"),
    ("green spaces", "không gian xanh", "không gian xanh"),
    ("public spaces", "không gian công cộng", "không gian công cộng"),
    ("mental health", "sức khỏe tinh thần", "sức khỏe tinh thần"),
    ("public health", "y tế công cộng", "y tế công cộng"),
    ("public health", "sức khỏe cộng đồng", "sức khỏe cộng đồng"),
    ("critical thinking", "tư duy phản biện", "tư duy phản biện"),
    ("practical skills", "kỹ năng thực tế", "kỹ năng thực tế"),
    ("digital skills", "kỹ năng số", "kỹ năng số"),
    ("job market", "thị trường lao động", "thị trường lao động"),
    ("cost of living", "chi phí sinh hoạt", "chi phí sinh hoạt"),
    ("every morning", "mỗi sáng", "mỗi buổi sáng"),
    ("every day", "mỗi ngày", "mỗi ngày"),
    ("every week", "mỗi tuần", "mỗi tuần"),
    ("every weekend", "mỗi cuối tuần", "mỗi cuối tuần"),
    ("last night", "tối qua", "tối hôm qua"),
    ("last week", "tuần trước", "tuần trước"),
    ("next week", "tuần tới", "tuần tới"),
    ("next month", "tháng tới", "tháng tới"),
    ("yesterday", "hôm qua", "hôm qua"),
    ("tonight", "tối nay", "tối nay"),
    ("tomorrow", "ngày mai", "ngày mai"),
    ("in front of", "trước", "ở phía trước"),
    ("because of", "vì", "bởi vì (cụm danh từ)"),
    ("even though", "mặc dù", "mặc dù"),
    ("although", "mặc dù", "mặc dù"),
    ("however", "tuy nhiên", "tuy nhiên"),
    ("therefore", "vì vậy", "vì vậy / do đó"),
    ("grandmother", "bà", "bà (nội/ngoại)"),
    ("classroom", "lớp học", "lớp học"),
    ("homework", "bài tập về nhà", "bài tập về nhà"),
    ("umbrella", "ô", "chiếc ô / dù"),
    ("museum", "bảo tàng", "bảo tàng"),
    ("hospital", "bệnh viện", "bệnh viện"),
    ("supermarket", "siêu thị", "siêu thị"),
    ("train station", "ga tàu", "nhà ga xe lửa"),
    ("bus stop", "trạm xe buýt", "trạm dừng xe buýt"),
    ("breakfast", "bữa sáng", "bữa ăn sáng"),
    ("lunch", "bữa trưa", "bữa ăn trưa"),
    ("dinner", "bữa tối", "bữa ăn tối"),
    ("library", "thư viện", "thư viện"),
    ("scholarship", "học bổng", "học bổng"),
    ("opportunity", "cơ hội", "cơ hội"),
    ("evidence", "bằng chứng", "bằng chứng"),
    ("funding", "ngân sách", "nguồn kinh phí / ngân sách"),
    ("equipment", "thiết bị", "trang thiết bị"),
    ("schedule", "lịch trình", "lịch trình"),
    ("deadline", "hạn chót", "thời hạn cuối"),
    ("feedback", "phản hồi", "phản hồi / góp ý"),
    ("policy", "chính sách", "chính sách"),
    ("map", "bản đồ", "tấm bản đồ"),
    ("ticket", "vé", "tấm vé"),
    ("birthday card", "thiệp sinh nhật", "thiệp sinh nhật"),
    ("concert", "hòa nhạc", "buổi hòa nhạc"),
    ("fridge", "tủ lạnh", "tủ lạnh"),
    ("forecast", "dự báo", "dự báo thời tiết"),
    ("jacket", "áo khoác", "áo khoác"),
    ("polite reminder", "lời nhắc lịch sự", "lời nhắc lịch sự"),
    ("passengers", "hành khách", "hành khách"),
    ("fluently", "lưu loát", "một cách trôi chảy / lưu loát"),
    ("thick fog", "sương mù dày đặc", "sương mù dày đặc"),
    ("delayed", "hoãn", "bị trì hoãn"),
    ("programming", "lập trình", "lập trình"),
    ("monthly pass", "vé tháng", "vé tháng"),
    ("regular exercise", "tập thể dục thường xuyên", "tập thể dục đều đặn"),
    ("beginners", "người mới bắt đầu", "người mới bắt đầu"),
    ("residents", "cư dân", "cư dân"),
    ("weekdays", "ngày thường", "các ngày trong tuần"),
    ("night shifts", "ca đêm", "ca làm việc ban đêm"),
    ("vocabulary", "vốn từ", "vốn từ vựng"),
    ("significantly", "đáng kể", "một cách đáng kể"),
    ("personal data", "dữ liệu cá nhân", "dữ liệu cá nhân"),
    ("paperwork", "giấy tờ", "thủ tục giấy tờ"),
    ("productivity", "năng suất", "năng suất làm việc"),
    ("urban trees", "cây ở đô thị", "cây xanh đô thị"),
    ("neighbourhoods", "môi trường sống", "khu dân cư"),
    ("missing people", "người mất tích", "người mất tích"),
    ("doctor", "bác sĩ", "bác sĩ"),
    ("children", "bọn trẻ", "trẻ em"),
    ("children", "trẻ em", "trẻ em"),
    ("students", "học sinh", "học sinh / sinh viên"),
    ("students", "sinh viên", "sinh viên"),
    ("teachers", "giáo viên", "giáo viên"),
    ("parents", "phụ huynh", "cha mẹ / phụ huynh"),
    ("parents", "bố mẹ", "bố mẹ"),
    ("employees", "nhân viên", "nhân viên"),
    ("customers", "khách hàng", "khách hàng"),
    ("researchers", "nhà nghiên cứu", "các nhà nghiên cứu"),
    ("scientists", "nhà khoa học", "các nhà khoa học"),
    ("governments", "chính phủ", "các chính phủ"),
    ("authorities", "chính quyền", "cơ quan chức năng / chính quyền"),
    ("universities", "đại học", "các trường đại học"),
    ("companies", "công ty", "các công ty / doanh nghiệp"),
    ("businesses", "doanh nghiệp", "các doanh nghiệp"),
    ("hospitals", "bệnh viện", "các bệnh viện"),
    ("schools", "trường học", "các trường học"),
    ("cities", "thành phố", "các thành phố"),
    ("households", "hộ gia đình", "các hộ gia đình"),
    ("consumers", "người tiêu dùng", "người tiêu dùng"),
    ("patients", "bệnh nhân", "bệnh nhân"),
    ("tourists", "du khách", "khách du lịch"),
    ("commuters", "người đi làm", "người đi lại hằng ngày"),
    ("drivers", "tài xế", "người lái xe"),
    ("cyclists", "người đi xe đạp", "người đi xe đạp"),
    ("pedestrians", "người đi bộ", "người đi bộ"),
    ("volunteers", "tình nguyện viên", "tình nguyện viên"),
    ("budget", "ngân sách", "ngân sách"),
    ("investment", "đầu tư", "khoản đầu tư"),
    ("infrastructure", "hạ tầng", "cơ sở hạ tầng"),
    ("subsidies", "trợ cấp", "khoản trợ cấp"),
    ("regulations", "quy định", "các quy định"),
    ("emissions", "khí thải", "lượng khí thải"),
    ("pollution", "ô nhiễm", "sự ô nhiễm"),
    ("innovation", "đổi mới", "sự đổi mới sáng tạo"),
    ("efficiency", "hiệu quả", "hiệu suất / hiệu quả"),
    ("transparent", "minh bạch", "minh bạch"),
    ("transparency", "minh bạch", "sự minh bạch"),
    ("inequality", "bất bình đẳng", "sự bất bình đẳng"),
    ("sustainable", "bền vững", "bền vững"),
    ("reliable", "đáng tin cậy", "đáng tin cậy"),
    ("flexible", "linh hoạt", "linh hoạt"),
    ("convenient", "thuận tiện", "thuận tiện"),
    ("expensive", "đắt", "đắt đỏ"),
    ("affordable", "phải chăng", "giá cả phải chăng"),
    ("comfortable", "thoải mái", "thoải mái"),
    ("quiet", "yên tĩnh", "yên tĩnh"),
    ("crowded", "đông đúc", "đông đúc"),
    ("healthy", "lành mạnh", "lành mạnh / tốt cho sức khỏe"),
    ("fresh", "tươi", "tươi mới"),
    ("wooden", "gỗ", "bằng gỗ"),
    ("umbrella", "chiếc ô", "chiếc ô"),
    ("notebook", "vở", "quyển vở / sổ tay"),
    ("dictionary", "từ điển", "từ điển"),
    ("kitchen", "bếp", "nhà bếp"),
    ("bedroom", "phòng ngủ", "phòng ngủ"),
    ("window", "cửa sổ", "cửa sổ"),
    ("garden", "khu vườn", "khu vườn"),
    ("garden", "vườn", "khu vườn"),
    ("park", "công viên", "công viên"),
    ("bridge", "cây cầu", "cây cầu"),
    ("river", "con sông", "dòng sông"),
    ("street", "đường phố", "con phố / đường phố"),
    ("market", "chợ", "khu chợ"),
    ("airport", "sân bay", "sân bay"),
    ("flight", "chuyến bay", "chuyến bay"),
    ("hotel", "khách sạn", "khách sạn"),
    ("weather", "thời tiết", "thời tiết"),
    ("morning", "buổi sáng", "buổi sáng"),
    ("morning", "sáng", "buổi sáng"),
    ("afternoon", "buổi chiều", "buổi chiều"),
    ("evening", "buổi tối", "buổi tối"),
    ("weekend", "cuối tuần", "dịp cuối tuần"),
    ("holiday", "kỳ nghỉ", "kỳ nghỉ"),
    ("meeting", "cuộc họp", "cuộc họp"),
    ("report", "báo cáo", "bản báo cáo"),
    ("project", "dự án", "dự án"),
    ("decision", "quyết định", "quyết định"),
    ("solution", "giải pháp", "giải pháp"),
    ("problem", "vấn đề", "vấn đề"),
    ("benefit", "lợi ích", "lợi ích"),
    ("benefits", "lợi ích", "những lợi ích"),
    ("risk", "rủi ro", "rủi ro / nguy cơ"),
    ("risks", "rủi ro", "những rủi ro"),
    ("impact", "tác động", "tác động / ảnh hưởng"),
    ("trust", "niềm tin", "niềm tin"),
    ("quality", "chất lượng", "chất lượng"),
    ("safety", "an toàn", "sự an toàn"),
    ("skills", "kỹ năng", "kỹ năng"),
    ("experience", "kinh nghiệm", "kinh nghiệm"),
    ("knowledge", "kiến thức", "kiến thức"),
    ("information", "thông tin", "thông tin"),
    ("neighbours", "hàng xóm", "những người hàng xóm"),
    ("neighbors", "hàng xóm", "những người hàng xóm"),
]

NATURAL_PROMPT_FIXES: dict[str, str] = {
    "band-7.5-040": (
        "Một biện pháp y tế công cộng chỉ hiệu quả bền vững khi cộng đồng tin tưởng vào bằng chứng đứng sau nó. "
        "Ngay cả một chương trình có kết quả thử nghiệm tốt cũng có thể thất bại nếu người dân không hiểu cách dữ liệu được thu thập. "
        "Thẳng thắn nêu rõ những điểm chưa chắc chắn và giải thích quyết định dễ hiểu có thể củng cố niềm tin đó."
    ),
    "band-8.0-exp-012": (
        "Hạn chế nghiêm ngặt quảng cáo thực phẩm siêu chế biến trên truyền hình giúp giảm nhanh lượng đường trẻ em tiêu thụ. "
        "Các lệnh cấm áp dụng quanh khu vực trường học cũng làm giảm tức thì thói quen mua ngẫu hứng nước ngọt có ga. "
        "Dù vậy, nếu chỉ cấm quảng cáo mà không đảm bảo nguồn nông sản tươi giá hợp lý thì khó tạo ra thay đổi dinh dưỡng bền vững. "
        "Mục tiêu sức khỏe cộng đồng dài hạn sẽ vẫn ngoài tầm với trừ khi thành phố trợ giá cho các chợ thực phẩm tươi tại khu vực thu nhập thấp."
    ),
}

SPELLING_PAIRS: list[tuple[str, str]] = [
    ("programme", "program"),
    ("programmes", "programs"),
    ("centre", "center"),
    ("centres", "centers"),
    ("organisation", "organization"),
    ("organisations", "organizations"),
    ("emphasise", "emphasize"),
    ("emphasises", "emphasizes"),
    ("recognise", "recognize"),
    ("prioritise", "prioritize"),
    ("subsidise", "subsidize"),
    ("analyse", "analyze"),
    ("analysing", "analyzing"),
    ("favourite", "favorite"),
    ("neighbourhood", "neighborhood"),
    ("neighbourhoods", "neighborhoods"),
    ("behaviour", "behavior"),
    ("labour", "labor"),
    ("travelling", "traveling"),
]

CONTRACTION_PAIRS: list[tuple[str, str]] = [
    ("I've ", "I have "),
    ("I'll ", "I will "),
    ("I'm ", "I am "),
    ("don't ", "do not "),
    ("doesn't ", "does not "),
    ("didn't ", "did not "),
    ("can't ", "cannot "),
    ("won't ", "will not "),
    ("isn't ", "is not "),
    ("aren't ", "are not "),
    ("wasn't ", "was not "),
    ("weren't ", "were not "),
]

BOILERPLATE_SENTENCES = re.compile(
    r"(?:Hãy đối chiếu chủ ngữ, dấu hiệu thời gian[^.!?]*[.!?]"
    r"|Kiểm tra chủ ngữ, dấu hiệu thời gian[^.!?]*[.!?]"
    r"|Bản dịch đúng có thể khác đáp án mẫu[.!?]?"
    r"|Tự kiểm tra:\s*[^.!?]*[.!?]"
    r"|Lưu ý chấm:\s*[^.!?]*[.!?]"
    r"|Chỉ đánh giá lỗi trong ngữ cảnh câu Việt đang dịch[.!?]?)",
    re.IGNORECASE,
)

EMBEDDED_BAD_EXAMPLE = re.compile(
    r"Ví dụ dịch chưa đạt:\s*(.+?)\.\s*Giải thích:\s*(.+?)(?:\.|$)"
)

ROBOTIC_WORD_NOTE = re.compile(
    r"^Từ\s+'([^']+)'\s+trong tiếng Anh có nghĩa xác thực là\s+(.+?)\.?$"
)


def classify_topic(raw_topic: str, prompt_vi: str, answer_en: str) -> tuple[str, str | None]:
    clean_raw = raw_topic.strip()
    direct = DIRECT_TOPIC_MAP.get(clean_raw.lower())
    if direct:
        return direct, None

    # Raw topic is a grammar / rhetorical skill focus from ESL v2.
    haystack = f"{prompt_vi} {answer_en}".lower()
    best_topic = "Gia đình & Đời sống"
    best_score = 0
    for canonical, keywords in TOPIC_KEYWORDS:
        score = sum(2 if " " in kw else 1 for kw in keywords if kw in haystack)
        if score > best_score:
            best_score = score
            best_topic = canonical
    return best_topic, clean_raw


def clean_explanation_and_errors(row: dict) -> None:
    exp = (row.get("explanationVi") or "").strip()
    answer = row["referenceAnswers"][0]
    errors = list(row.get("commonErrors") or [])

    # Extract embedded bad translation example before stripping it from explanationVi.
    match = EMBEDDED_BAD_EXAMPLE.search(exp)
    if match:
        bad_sent = match.group(1).strip()
        if not bad_sent.endswith((".", "!", "?")) and answer.endswith("."):
            bad_sent += "."
        reason = match.group(2).strip().rstrip(".") + "."
        if bad_sent.lower() != answer.lower() and not any(e["incorrect"].lower() == bad_sent.lower() for e in errors):
            errors.append({
                "incorrect": bad_sent,
                "correction": answer,
                "reasonVi": reason,
            })
        exp = EMBEDDED_BAD_EXAMPLE.sub("", exp).strip()

    # Rewrite robotic Band 1.0 notes.
    robot = ROBOTIC_WORD_NOTE.match(exp)
    if robot:
        word, meaning = robot.group(1), robot.group(2)
        vowel = word[0].lower() in "aeiou"
        article = "an" if vowel else "a"
        exp = f"Từ vựng nền tảng '{word}' ({meaning}); khi đếm số ít thường đi kèm '{article} {word}'."

    exp = BOILERPLATE_SENTENCES.sub("", exp)
    exp = re.sub(r"^(?:Phân tích cấu trúc|Phân tích|Điểm cần nắm|Đối chiếu ý chính):\s*", "", exp)
    exp = re.sub(r"\s+", " ", exp).strip()

    if not exp or any(ans in exp for ans in row["referenceAnswers"]):
        term = row.get("targetTerm")
        meaning = row.get("meaningVi")
        if term and meaning:
            exp = f"Chú ý cách dùng '{term}' ({meaning}) đúng ngữ cảnh và trật tự cụm từ tiếng Anh."
        else:
            exp = "Giữ đúng chủ thể, thì của động từ và quan hệ logic giữa các vế câu."

    # Clean boilerplate inside commonErrors.reasonVi as well.
    cleaned_errors = []
    for err in errors:
        if err["incorrect"].strip() == err["correction"].strip():
            continue
        reason = BOILERPLATE_SENTENCES.sub("", err["reasonVi"]).strip()
        reason = re.sub(r"\s+", " ", reason) or err["reasonVi"].strip()
        cleaned_errors.append({
            "incorrect": err["incorrect"].strip(),
            "correction": err["correction"].strip(),
            "reasonVi": reason,
        })

    # Synthesize 1 authentic Vietnamese-learner grammar trap if commonErrors is still empty on phrases/sentences/paragraphs.
    if not cleaned_errors and row["type"] != "word":
        synth = synthesize_common_error(answer)
        if synth:
            cleaned_errors.append(synth)

    row["explanationVi"] = exp
    row["commonErrors"] = cleaned_errors


def synthesize_common_error(answer: str) -> dict | None:
    # 1. Modal + bare infinitive trap (very common for Vietnamese learners: "can to V", "should to V").
    modal_match = re.search(r"\b(can|should|must|may|might|will|could|would)\s+([a-z]{3,})\b", answer)
    if modal_match and modal_match.group(2) not in {"not", "also", "only", "still", "even", "never", "often", "always", "help"}:
        modal, verb = modal_match.group(1), modal_match.group(2)
        wrong = answer[:modal_match.start()] + f"{modal} to {verb}" + answer[modal_match.end():]
        if wrong != answer:
            return {
                "incorrect": wrong,
                "correction": answer,
                "reasonVi": f"Sau động từ khuyết thiếu '{modal}' dùng động từ nguyên mẫu không có 'to' ({modal} {verb}).",
            }

    # 2. Although / Even though ... + redundant 'but' trap.
    if re.match(r"^(Although|Even though)\s+[^,]+,\s+[a-z]", answer):
        comma_idx = answer.index(",")
        wrong = answer[:comma_idx + 1] + " but" + answer[comma_idx + 1:]
        return {
            "incorrect": wrong,
            "correction": answer,
            "reasonVi": "Tiếng Việt nói 'Mặc dù... nhưng...', còn tiếng Anh đã dùng 'Although / Even though' thì không thêm 'but' ở mệnh đề sau.",
        }

    # 3. Uncountable IELTS nouns pluralized by mistake.
    uncount_match = re.search(r"\b(evidence|information|equipment|research|funding|traffic|waste|knowledge|homework|advice)\b", answer)
    if uncount_match:
        noun = uncount_match.group(1)
        wrong = answer[:uncount_match.start()] + f"{noun}s" + answer[uncount_match.end():]
        return {
            "incorrect": wrong,
            "correction": answer,
            "reasonVi": f"'{noun.capitalize()}' là danh từ không đếm được trong tiếng Anh nên không thêm '-s'.",
        }

    # 4. Preposition + V-ing trap (e.g., "by using" -> "by use").
    prep_ing = re.search(r"\b(by|without|before|after)\s+([a-z]{4,}ing)\b", answer)
    if prep_ing:
        prep, gerund = prep_ing.group(1), prep_ing.group(2)
        stem = gerund[:-3]
        if len(stem) >= 3:
            wrong = answer[:prep_ing.start()] + f"{prep} {stem}" + answer[prep_ing.end():]
            return {
                "incorrect": wrong,
                "correction": answer,
                "reasonVi": f"Sau giới từ '{prep}' động từ phải chia ở dạng V-ing ({prep} {gerund}).",
            }
    return None


def enrich_target_term(row: dict) -> None:
    if row.get("targetTerm"):
        return
    answer = row["referenceAnswers"][0]
    answer_lower = answer.lower().rstrip(".!?")
    prompt_lower = row["promptVi"].lower()
    for en_term, vi_cue, vi_meaning in VERIFIED_LEXICON:
        if en_term.lower() == answer_lower:
            continue
        if vi_cue not in prompt_lower:
            continue
        pattern = re.compile(r"\b" + re.escape(en_term) + r"\b", re.IGNORECASE)
        found = pattern.search(answer)
        if found:
            # Preserve exact substring from referenceAnswers[0] (lowercased unless proper/"I")
            matched_text = found.group(0)
            row["targetTerm"] = matched_text if matched_text.startswith("I ") or matched_text == "I" else matched_text.lower()
            row["meaningVi"] = vi_meaning
            return


def expand_reference_answers(row: dict) -> None:
    existing = list(row["referenceAnswers"])
    exp_text = row.get("explanationVi") or ""
    candidates: list[str] = []

    for base in list(existing):
        # UK <-> US spelling alternatives
        for uk, us in SPELLING_PAIRS:
            uk_pat = re.compile(r"\b" + re.escape(uk) + r"\b")
            us_pat = re.compile(r"\b" + re.escape(us) + r"\b")
            if uk_pat.search(base):
                candidates.append(uk_pat.sub(us, base))
            elif us_pat.search(base):
                candidates.append(us_pat.sub(uk, base))

        # Contraction <-> full form alternatives
        for short, full in CONTRACTION_PAIRS:
            if short in base:
                candidates.append(base.replace(short, full, 1))
            elif full in base:
                candidates.append(base.replace(full, short, 1))

        # Safe discourse / opener synonyms for sentences & paragraphs
        if base.startswith("Although "):
            candidates.append("Even though " + base[len("Although "):])
        elif base.startswith("Even though "):
            candidates.append("Although " + base[len("Even though "):])
        if base.startswith("I believe "):
            candidates.append("I think " + base[len("I believe "):])
        elif base.startswith("I think "):
            candidates.append("I believe " + base[len("I think "):])
        if ". Even so, " in base:
            candidates.append(base.replace(". Even so, ", ". However, ", 1))
        elif ". However, " in base:
            candidates.append(base.replace(". However, ", ". Even so, ", 1))
        if ". Therefore, " in base:
            candidates.append(base.replace(". Therefore, ", ". As a result, ", 1))

    seen = {ans.strip().lower() for ans in existing}
    for cand in candidates:
        key = cand.strip().lower()
        if key not in seen and cand not in exp_text:
            existing.append(cand)
            seen.add(key)
        if len(existing) >= 4:
            break
    row["referenceAnswers"] = existing


def curate_exercise(row: dict) -> dict:
    if row["id"] in NATURAL_PROMPT_FIXES:
        row["promptVi"] = NATURAL_PROMPT_FIXES[row["id"]]

    canonical_topic, skill_focus = classify_topic(row["topic"], row["promptVi"], row["referenceAnswers"][0])
    row["topic"] = canonical_topic
    if skill_focus:
        row["skillFocus"] = skill_focus

    enrich_target_term(row)
    clean_explanation_and_errors(row)
    expand_reference_answers(row)
    return row


def topic_counts_for_items(items: list[dict]) -> dict[str, int]:
    counts = collections.Counter(item["topic"] for item in items)
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))
