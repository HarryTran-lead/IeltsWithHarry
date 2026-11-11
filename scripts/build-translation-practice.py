"""Build the internally aligned VI→EN core and retain pattern rows as candidates.

Usage: python scripts/build-translation-practice.py
The generated JSON is deterministic; learner progress IDs remain stable.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/translation-practice/starter-51.json"
DEST = ROOT / "src/data/translation/band-exercises.json"
ADDITIONAL = ROOT / "data/translation-practice/level-authored-34.json"
EXPANDED = ROOT / "data/translation-practice/level-authored-expanded.json"
ADVANCED_PARAGRAPHS = ROOT / "data/translation-practice/advanced-starter-paragraphs.json"
RUBRIC = ROOT / "data/translation-practice/level-rubric.json"
CANDIDATES = ROOT / "data/translation-practice/pattern-candidates.json"
RUBRIC_DEST = ROOT / "src/data/translation/level-rubric.json"

# Isolated vocabulary and short phrases support the entry levels. The practice
# numbers are curriculum labels, not claims of an IELTS test score.
WORDS = [
    ("Bản thân", "tôi", "I"), ("Gia đình", "bố", "father"),
    ("Gia đình", "chị gái", "sister"), ("Gia đình", "em bé", "baby"),
    ("Trường học", "bút", "pen"), ("Trường học", "bàn", "desk"),
    ("Trường học", "giáo viên", "teacher"), ("Nhà cửa", "nhà", "house"),
    ("Nhà cửa", "cửa", "door"), ("Nhà cửa", "ghế", "chair"),
    ("Ăn uống", "cơm", "rice"), ("Ăn uống", "sữa", "milk"),
    ("Ăn uống", "bánh mì", "bread"), ("Ăn uống", "trứng", "egg"),
    ("Thiên nhiên", "mặt trời", "sun"), ("Thiên nhiên", "mưa", "rain"),
    ("Thiên nhiên", "cây", "tree"), ("Động vật", "mèo", "cat"),
    ("Động vật", "chó", "dog"), ("Động vật", "chim", "bird"),
    ("Màu sắc", "đỏ", "red"), ("Màu sắc", "xanh dương", "blue"),
    ("Màu sắc", "vàng", "yellow"), ("Thời gian", "hôm nay", "today"),
    ("Thời gian", "ngày mai", "tomorrow"), ("Cảm xúc", "buồn", "sad"),
    ("Cảm xúc", "vui", "happy"),
]

PHRASES = [
    ("Bản thân", "tên của tôi", "my name"), ("Gia đình", "mẹ của tôi", "my mother"),
    ("Gia đình", "hai người bạn", "two friends"), ("Trường học", "một cuốn sách", "a book"),
    ("Trường học", "ba cây bút", "three pens"), ("Nhà cửa", "căn nhà lớn", "a big house"),
    ("Nhà cửa", "cửa màu đỏ", "a red door"), ("Ăn uống", "một quả táo", "an apple"),
    ("Ăn uống", "hai quả trứng", "two eggs"), ("Ăn uống", "một tách trà", "a cup of tea"),
    ("Thời gian", "sáng hôm nay", "this morning"), ("Thời gian", "tối mai", "tomorrow evening"),
    ("Thời gian", "mỗi ngày", "every day"), ("Thời tiết", "trời nắng", "sunny weather"),
    ("Thời tiết", "ngày mưa", "a rainy day"), ("Sở thích", "một bài hát hay", "a good song"),
    ("Sở thích", "một trận bóng đá", "a football match"), ("Sở thích", "cuốn sách yêu thích", "a favourite book"),
    ("Du lịch", "một chiếc xe buýt", "a bus"), ("Du lịch", "ga tàu", "the train station"),
    ("Du lịch", "một tấm vé", "a ticket"), ("Cảm xúc", "rất mệt", "very tired"),
    ("Cảm xúc", "hơi đói", "a little hungry"), ("Cảm xúc", "thật vui", "really happy"),
    ("Sức khỏe", "nước sạch", "clean water"), ("Sức khỏe", "đồ ăn lành mạnh", "healthy food"),
    ("Công việc", "một công việc mới", "a new job"),
]

# Pattern cross-products are retained only as editorial candidates. Repeated
# frames do not establish the claimed practice level of a finished exercise.
PACKS: dict[str, dict] = {
    "2.0": {
        "items": [("Ăn uống", "nước", "water"), ("Ăn uống", "cơm", "rice"), ("Ăn uống", "sữa", "milk"), ("Ăn uống", "bánh mì", "bread"), ("Ăn uống", "trái cây", "fruit"), ("Ăn uống", "cà phê", "coffee"), ("Ăn uống", "trà", "tea"), ("Ăn uống", "trứng", "eggs"), ("Trường học", "sách", "books")],
        "patterns": [
            ("Tôi thích {vi}.", "I like {en}.", "present-simple"),
            ("Bạn có {vi} không?", "Do you have {en}?", "present-simple-question"),
            ("Chúng tôi cần {vi}.", "We need {en}.", "present-simple"),
        ],
    },
    "2.5": {
        "items": [("Sở thích", "đọc sách", "read books"), ("Sở thích", "hát", "sing"), ("Ăn uống", "nấu ăn", "cook"), ("Sở thích", "bơi", "swim"), ("Sở thích", "nhảy", "dance"), ("Sở thích", "vẽ", "draw"), ("Trường học", "học tiếng Anh", "study English"), ("Sức khỏe", "đi bộ", "walk"), ("Du lịch", "đi du lịch", "travel")],
        "patterns": [
            ("Tôi thích {vi}.", "I like to {en}.", "like-to-infinitive"),
            ("Cô ấy có thể {vi}.", "She can {en}.", "modal-can"),
            ("Chúng tôi muốn {vi} hôm nay.", "We want to {en} today.", "want-to-infinitive"),
        ],
    },
    "3.0": {
        "items": [("Đô thị", "thư viện", "library"), ("Văn hóa", "bảo tàng", "museum"), ("Đô thị", "ngân hàng", "bank"), ("Đô thị", "bưu điện", "post office"), ("Giải trí", "rạp chiếu phim", "cinema"), ("Mua sắm", "siêu thị", "supermarket"), ("Mua sắm", "hiệu sách", "bookshop"), ("Sức khỏe", "hiệu thuốc", "pharmacy"), ("Ăn uống", "quán cà phê", "café")],
        "patterns": [
            ("Tôi đã đến {vi} hôm qua.", "I went to the {en} yesterday.", "past-simple"),
            ("Chúng tôi sẽ gặp nhau ở {vi}.", "We will meet at the {en}.", "future-will"),
            ("Cô ấy đang tìm {vi}.", "She is looking for the {en}.", "present-continuous"),
        ],
    },
    "3.5": {
        "items": [("Du lịch", "một tấm bản đồ", "a map"), ("Du lịch", "một tấm vé", "a ticket"), ("Du lịch", "một chiếc ba lô", "a backpack"), ("Du lịch", "một chiếc áo mưa", "a raincoat"), ("Du lịch", "một chiếc máy ảnh", "a camera"), ("Du lịch", "một chiếc va li", "a suitcase"), ("Du lịch", "một cuốn sách hướng dẫn", "a guidebook"), ("Du lịch", "một chai nước", "a bottle of water"), ("Du lịch", "một đôi giày", "a pair of shoes")],
        "patterns": [
            ("Tôi đã mua {vi} hôm qua.", "I bought {en} yesterday.", "past-simple-irregular"),
            ("Tôi cần {vi} cho chuyến đi.", "I need {en} for the trip.", "purpose-phrase"),
            ("Cô ấy tìm thấy {vi} sáng nay.", "She found {en} this morning.", "past-simple-irregular"),
        ],
    },
    "4.0": {
        "items": [("Giáo dục", "tiếng Anh của tôi", "my English"), ("Giáo dục", "kỹ năng viết của tôi", "my writing skills"), ("Giáo dục", "kỹ năng nói của tôi", "my speaking skills"), ("Giáo dục", "kỹ năng đọc của tôi", "my reading skills"), ("Giáo dục", "phát âm của tôi", "my pronunciation"), ("Giáo dục", "kỹ năng nghe của tôi", "my listening skills"), ("Học tập", "trí nhớ của tôi", "my memory"), ("Sức khỏe", "thể lực của tôi", "my fitness"), ("Học tập", "khả năng tập trung của tôi", "my concentration")],
        "patterns": [
            ("Tôi muốn cải thiện {vi}.", "I want to improve {en}.", "want-to-infinitive"),
            ("Tôi dành thời gian mỗi ngày để cải thiện {vi}.", "I spend time every day improving {en}.", "spend-time-gerund"),
            ("Luyện tập thường xuyên đã giúp tôi cải thiện {vi}.", "Regular practice has helped me improve {en}.", "present-perfect"),
        ],
    },
    "4.5": {
        "items": [("Đô thị", "giao thông công cộng", "public transport"), ("Giáo dục", "lớp học trực tuyến", "online classes"), ("Giáo dục", "thư viện trường học", "school libraries"), ("Sức khỏe", "phòng khám địa phương", "local clinics"), ("Sức khỏe", "cơ sở thể thao", "sports facilities"), ("Xã hội", "trung tâm cộng đồng", "community centres"), ("Đô thị", "làn đường xe đạp", "bike lanes"), ("Môi trường", "công viên", "parks"), ("Giáo dục", "khóa học buổi tối", "evening courses")],
        "patterns": [
            ("Nhiều người sử dụng {vi} mỗi tuần.", "Many people use {en} every week.", "frequency-adverbial"),
            ("Thành phố nên đầu tư thêm vào {vi}.", "Cities should invest more in {en}.", "modal-should"),
            ("Tiếp cận {vi} có thể cải thiện cuộc sống hằng ngày.", "Access to {en} can improve daily life.", "noun-phrase-subject"),
        ],
    },
    "5.0": {
        "items": [("Giáo dục", "giáo dục", "education"), ("Đô thị", "giao thông công cộng", "public transport"), ("Môi trường", "năng lượng tái tạo", "renewable energy"), ("Sức khỏe", "chăm sóc sức khỏe dự phòng", "preventive healthcare"), ("Công nghệ", "kỹ năng số", "digital skills"), ("Đô thị", "nhà ở giá phải chăng", "affordable housing"), ("Du lịch", "du lịch địa phương", "local tourism"), ("Môi trường", "tái chế", "recycling"), ("Công việc", "đào tạo nghề", "vocational training")],
        "patterns": [
            ("Đầu tư vào {vi} có thể mang lại lợi ích lâu dài.", "Investing in {en} can bring long-term benefits.", "gerund-subject"),
            ("Chính phủ nên hỗ trợ {vi} ở các cộng đồng còn thiếu nguồn lực.", "Governments should support {en} in under-resourced communities.", "modal-should"),
            ("Thiếu {vi} có thể hạn chế cơ hội của nhiều người.", "A lack of {en} can limit opportunities for many people.", "cause-effect"),
        ],
    },
    "5.5": {
        "items": [("Công việc", "làm việc tại nhà", "working from home"), ("Đô thị", "sử dụng phương tiện công cộng", "using public transport"), ("Môi trường", "ăn ít thịt hơn", "eating less meat"), ("Giáo dục", "du học", "studying abroad"), ("Giáo dục", "học trực tuyến", "learning online"), ("Môi trường", "tái chế rác sinh hoạt", "recycling household waste"), ("Sức khỏe", "đi bộ đến chỗ làm", "walking to work"), ("Xã hội", "tham gia tình nguyện tại địa phương", "volunteering locally"), ("Gia đình", "chia sẻ việc chăm sóc trẻ", "sharing childcare")],
        "patterns": [
            ("Nhiều người cân nhắc {vi} vì họ thấy cách đó hữu ích.", "Many people consider {en} because they find it useful.", "because-clause"),
            ("Mặc dù việc {vi} có lợi ích, cách này cũng có những hạn chế.", "Although {en} has benefits, it also has limitations.", "concession-clause"),
            ("Thái độ đối với việc {vi} đã thay đổi trong những năm gần đây.", "Attitudes towards {en} have changed in recent years.", "present-perfect"),
        ],
    },
    "6.0": {
        "items": [("Môi trường", "ô nhiễm không khí", "air pollution"), ("Đô thị", "ùn tắc giao thông", "traffic congestion"), ("Môi trường", "rác thải nhựa", "plastic waste"), ("Công việc", "thất nghiệp ở thanh niên", "youth unemployment"), ("Công nghệ", "sự loại trừ về kỹ thuật số", "digital exclusion"), ("Xã hội", "mất an ninh lương thực", "food insecurity"), ("Môi trường", "khan hiếm nước", "water scarcity"), ("Đô thị", "thiếu nhà ở", "housing shortages"), ("Giáo dục", "tỷ lệ bỏ học", "school dropout rates")],
        "patterns": [
            ("Giải quyết {vi} đòi hỏi sự hợp tác giữa nhiều cơ quan.", "Addressing {en} requires cooperation between several agencies.", "gerund-subject"),
            ("Nếu {vi} bị bỏ qua, chi phí xã hội có thể tăng lên.", "If {en} is ignored, social costs may rise.", "conditional"),
            ("Các chính sách nhằm giảm {vi} cần dựa trên bằng chứng.", "Policies aimed at reducing {en} should be based on evidence.", "reduced-relative-clause"),
        ],
    },
    "6.5": {
        "items": [("Đô thị", "quy hoạch đô thị", "urban planning"), ("Giáo dục", "đào tạo giáo viên", "teacher training"), ("Sức khỏe", "chăm sóc sức khỏe dự phòng", "preventive healthcare"), ("Môi trường", "năng lượng tái tạo", "renewable energy"), ("Đô thị", "giao thông công cộng", "public transport"), ("Công nghệ", "hiểu biết kỹ thuật số", "digital literacy"), ("Đô thị", "nhà ở giá phải chăng", "affordable housing"), ("Môi trường", "quản lý chất thải", "waste management"), ("Công việc", "đào tạo lại người lao động", "job retraining")],
        "patterns": [
            ("Một cách tiếp cận phối hợp đối với {vi} có thể tạo ra kết quả bền vững hơn.", "A coordinated approach to {en} can produce more sustainable outcomes.", "complex-noun-phrase"),
            ("Hiệu quả của chính sách về {vi} phụ thuộc vào việc thực hiện ở cấp địa phương.", "The effectiveness of policies on {en} depends on local implementation.", "dependent-preposition"),
            ("Thay vì chỉ tăng chi tiêu cho {vi}, chính phủ nên đo lường kết quả.", "Rather than simply increasing spending on {en}, governments should measure outcomes.", "rather-than-clause"),
        ],
    },
    "7.0": {
        "items": [("Công việc", "làm việc từ xa", "remote work"), ("Công nghệ", "tự động hóa", "automation"), ("Môi trường", "định giá carbon", "carbon pricing"), ("Giáo dục", "quyền lựa chọn trường học", "school choice"), ("Đô thị", "tái thiết đô thị", "urban redevelopment"), ("Sức khỏe", "khám chữa bệnh từ xa", "telemedicine"), ("Giáo dục", "học trực tuyến", "online learning"), ("Du lịch", "tăng trưởng du lịch", "tourism growth"), ("Xã hội", "trợ cấp thực phẩm", "food subsidies")],
        "patterns": [
            ("Mặc dù {vi} có thể mang lại lợi ích, tác động của nó không đồng đều giữa các nhóm.", "Although {en} can bring benefits, its effects are uneven across groups.", "concession-nuance"),
            ("Đánh giá {vi} đòi hỏi phải xem xét cả lợi ích dự kiến lẫn hệ quả ngoài ý muốn.", "Evaluating {en} requires consideration of both intended benefits and unintended consequences.", "balanced-evaluation"),
            ("Chính sách liên quan đến {vi} nên được điều chỉnh theo bối cảnh địa phương.", "Policies concerning {en} should be adapted to local contexts.", "passive-modal"),
        ],
    },
    "7.5": {
        "items": [("Đô thị", "khả năng chi trả nhà ở", "housing affordability"), ("Môi trường", "an ninh năng lượng", "energy security"), ("Giáo dục", "bất bình đẳng giáo dục", "educational inequality"), ("Xã hội", "niềm tin của công chúng", "public trust"), ("Công việc", "tính cơ động của lao động", "labour mobility"), ("Công nghệ", "quyền riêng tư kỹ thuật số", "digital privacy"), ("Sức khỏe", "khả năng tiếp cận y tế", "healthcare access"), ("Môi trường", "thích ứng với khí hậu", "climate adaptation"), ("Xã hội", "sự gắn kết xã hội", "social cohesion")],
        "patterns": [
            ("Bất kỳ cải cách nào liên quan đến {vi} đều cần xem xét tác động đối với nhóm dễ bị tổn thương.", "Any reform concerning {en} must consider its impact on vulnerable groups.", "qualified-policy-claim"),
            ("Dữ liệu tổng hợp về {vi} có thể che khuất khác biệt đáng kể giữa các địa phương.", "Aggregate data on {en} may conceal substantial differences between local areas.", "hedged-inference"),
            ("Tranh luận về {vi} thường bỏ qua cách chi phí và lợi ích được phân chia.", "Debates about {en} often overlook how costs and benefits are distributed.", "embedded-clause"),
        ],
    },
    "8.0": {
        "items": [("Công nghệ", "trách nhiệm giải trình của thuật toán", "algorithmic accountability"), ("Xã hội", "bất bình đẳng giữa các thế hệ", "intergenerational inequality"), ("Xã hội", "công bằng phân bổ", "distributional justice"), ("Kinh tế", "tính bền vững tài khóa", "fiscal sustainability"), ("Xã hội", "niềm tin vào thể chế", "institutional trust"), ("Môi trường", "ngoại tác môi trường", "environmental externalities"), ("Công việc", "sự thay thế lao động", "workforce displacement"), ("Chính sách", "tính nhất quán chính sách", "policy coherence"), ("Xã hội", "thay đổi nhân khẩu học", "demographic change")],
        "patterns": [
            ("Chỉ tập trung vào {vi} có nguy cơ làm lu mờ các yếu tố thể chế rộng hơn.", "A narrow focus on {en} risks obscuring broader institutional factors.", "nuanced-causation"),
            ("Phân tích {vi} đòi hỏi phải phân biệt kết quả ngắn hạn với thay đổi mang tính cấu trúc.", "Analysing {en} requires a distinction between short-term outcomes and structural change.", "abstract-comparison"),
            ("Nếu {vi} được xem xét tách rời, các biện pháp đề xuất có thể giải quyết sai vấn đề.", "If {en} is considered in isolation, the proposed measures may address the wrong problem.", "conditional-critique"),
        ],
    },
    "8.5": {
        "items": [("Nghiên cứu", "suy luận nhân quả", "causal inference"), ("Nghiên cứu", "phân tích phản thực tế", "counterfactual analysis"), ("Chính sách", "tác động phân bổ", "distributional impact"), ("Chính sách", "năng lực thể chế", "institutional capacity"), ("Môi trường", "khả năng chống chịu dài hạn", "long-term resilience"), ("Chính sách", "hiệu ứng lan tỏa của chính sách", "policy spillovers"), ("Nghiên cứu", "thiên lệch đo lường", "measurement bias"), ("Chính sách", "mức độ thực hiện đúng thiết kế", "implementation fidelity"), ("Xã hội", "tính chính danh trước công chúng", "public legitimacy")],
        "patterns": [
            ("Tranh luận về {vi} đòi hỏi bằng chứng có thể chịu được sự kiểm tra độc lập.", "Debates about {en} require evidence that can withstand independent scrutiny.", "evidence-qualification"),
            ("Hiểu {vi} một cách đáng tin cậy đòi hỏi phải nêu rõ các giả định nền tảng.", "Understanding {en} reliably requires the underlying assumptions to be made explicit.", "methodological-precision"),
            ("Nếu bỏ qua {vi}, kết luận có vẻ thuyết phục vẫn có thể dẫn đến chính sách sai lệch.", "If {en} is overlooked, seemingly persuasive conclusions may still lead to misguided policy.", "qualified-conditional"),
        ],
    },
    "9.0": {
        "items": [("Xã hội", "bất bình đẳng mang tính cấu trúc", "structural inequality"), ("Nghiên cứu", "sự bất định về tri thức", "epistemic uncertainty"), ("Chính sách", "tính chính danh của thể chế", "institutional legitimacy"), ("Chính sách", "sự phụ thuộc vào lộ trình trước đó", "path dependence"), ("Chính sách", "những đánh đổi về chuẩn mực", "normative trade-offs"), ("Chính sách", "sự phụ thuộc lẫn nhau giữa các chính sách", "policy interdependence"), ("Nghiên cứu", "thiên lệch chọn mẫu", "selection bias"), ("Xã hội", "sự bất đối xứng trong phân bổ", "distributional asymmetry"), ("Nghiên cứu", "giá trị áp dụng trong bối cảnh thực", "ecological validity")],
        "patterns": [
            ("Bỏ qua {vi} có thể khiến những kết luận tưởng như vững chắc không đứng vững khi bị xem xét kỹ hơn.", "Ignoring {en} can cause apparently robust conclusions to collapse under closer scrutiny.", "epistemic-qualification"),
            ("Chỉ khi {vi} được làm rõ, các cách diễn giải cạnh tranh mới có thể được đánh giá công bằng.", "Only when {en} is made explicit can competing interpretations be assessed fairly.", "inversion-and-focus"),
            ("Trong bối cảnh chính sách phức tạp, {vi} hiếm khi là vấn đề bên lề; nó định hình cả bằng chứng lẫn giải pháp được chấp nhận.", "In complex policy settings, {en} is rarely a peripheral concern; it shapes both the evidence considered and the remedies deemed acceptable.", "nuanced-argument"),
        ],
    },
}

EXPLANATIONS = {
    "isolated-word": "Ghi nhớ nghĩa và cách viết của từ riêng lẻ trước khi ghép câu.",
    "short-phrase": "Chú ý trật tự từ trong cụm tiếng Anh.",
    "present-simple": "Dùng thì hiện tại đơn để nói sở thích, nhu cầu hoặc thói quen.",
    "present-simple-question": "Câu hỏi hiện tại đơn với you dùng trợ động từ do.",
    "like-to-infinitive": "Sau like có thể dùng to và động từ nguyên mẫu.",
    "modal-can": "Sau can dùng động từ nguyên mẫu không có to.",
    "want-to-infinitive": "Sau want dùng to và động từ nguyên mẫu.",
    "past-simple": "Dùng quá khứ đơn cho một việc đã xảy ra hôm qua.",
    "past-simple-irregular": "Bought và found là dạng quá khứ bất quy tắc của buy và find.",
    "future-will": "Dùng will và động từ nguyên mẫu để nói kế hoạch tương lai.",
    "present-continuous": "Dùng is và động từ thêm -ing cho hành động đang diễn ra.",
    "purpose-phrase": "For the trip diễn đạt mục đích sử dụng đồ vật.",
    "spend-time-gerund": "Sau spend time dùng động từ thêm -ing.",
    "present-perfect": "Dùng hiện tại hoàn thành để nối thay đổi trước đây với hiện tại.",
    "frequency-adverbial": "Every week nêu tần suất; đặt ở cuối câu trong mẫu này.",
    "modal-should": "Should nêu lời khuyên hoặc đề xuất chính sách.",
    "noun-phrase-subject": "Cụm danh từ ở đầu câu có thể đóng vai trò chủ ngữ.",
    "gerund-subject": "Động từ thêm -ing có thể đứng đầu câu và làm chủ ngữ.",
    "cause-effect": "A lack of nêu sự thiếu hụt và can limit nêu hệ quả có thể xảy ra.",
    "because-clause": "Because nối lựa chọn với lý do; consider đi với động từ thêm -ing.",
    "concession-clause": "Although mở đầu mệnh đề nhượng bộ; mệnh đề sau nêu giới hạn.",
    "reduced-relative-clause": "Aimed at reducing bổ nghĩa cho policies mà không cần mệnh đề quan hệ đầy đủ.",
    "conditional": "If nêu điều kiện; may diễn đạt hệ quả có khả năng xảy ra.",
    "complex-noun-phrase": "A coordinated approach to là cụm danh từ nêu cách tiếp cận.",
    "dependent-preposition": "Policies on nêu lĩnh vực chính sách; depends on nối với yếu tố quyết định.",
    "rather-than-clause": "Rather than đối chiếu hành động ít phù hợp với đề xuất chính.",
    "concession-nuance": "Although nhượng bộ lợi ích trước khi nêu sự phân bố tác động không đồng đều.",
    "balanced-evaluation": "Both ... and ... giúp cân bằng lợi ích dự kiến với hệ quả ngoài ý muốn.",
    "passive-modal": "Should be adapted là cấu trúc bị động để nêu khuyến nghị.",
    "qualified-policy-claim": "Any reform concerning giới hạn phạm vi khẳng định về cải cách.",
    "hedged-inference": "May conceal diễn đạt khả năng, tránh khẳng định quá chắc chắn.",
    "embedded-clause": "How costs and benefits are distributed là mệnh đề danh từ sau overlook.",
    "nuanced-causation": "Risks obscuring nêu rủi ro của một góc nhìn quá hẹp.",
    "abstract-comparison": "Distinction between ... and ... giúp phân biệt hai loại kết quả.",
    "conditional-critique": "If ... is considered in isolation nêu điều kiện dẫn tới đánh giá sai.",
    "evidence-qualification": "That can withstand independent scrutiny bổ nghĩa cho evidence.",
    "methodological-precision": "Made explicit nhấn mạnh việc công khai các giả định nền tảng.",
    "qualified-conditional": "Seemingly và may giữ sắc thái thận trọng trong lập luận.",
    "epistemic-qualification": "Apparently robust và under closer scrutiny tạo sắc thái đánh giá thận trọng.",
    "inversion-and-focus": "Only when ở đầu câu dẫn tới đảo ngữ can ... be assessed.",
    "nuanced-argument": "Dấu chấm phẩy nối hai ý có quan hệ giải thích chặt chẽ.",
}


def item(identifier: str, band: str, kind: str, topic: str, term: str,
         meaning: str, prompt: str, answer: str, tag: str, source: str) -> dict:
    return {
        "id": identifier, "practiceLevel": band, "type": kind, "topic": topic,
        "targetTerm": term, "meaningVi": meaning, "promptVi": prompt,
        "referenceAnswers": [answer], "grammarTags": [tag] if tag else [],
        "explanationVi": EXPLANATIONS.get(tag, f"Cách diễn đạt tham khảo dùng {term} ({meaning})."),
        "commonErrors": [], "editorialStatus": "pilot", "source": source,
        "version": 1,
    }


def build() -> list[dict]:
    rows = json.loads(SOURCE.read_text(encoding="utf-8"))
    next_number = 52
    for band, kind, pairs in (("1.0", "word", WORDS), ("1.5", "phrase", PHRASES)):
        for topic, vi, en in pairs:
            rows.append(item(f"band-{band}-{next_number:03d}", band, kind, topic,
                             en, vi, vi, en, "isolated-word" if kind == "word" else "short-phrase", "original-pattern"))
            next_number += 1
    for band, pack in PACKS.items():
        for pattern_number, (vi_pattern, en_pattern, tag) in enumerate(pack["patterns"], 1):
            for topic, vi, en in pack["items"]:
                rows.append(item(f"band-{band}-{next_number:03d}", band, "sentence", topic,
                                 en, vi, vi_pattern.format(vi=vi),
                                 en_pattern.format(en=en), tag, f"original-pattern-{band}-{pattern_number}"))
                next_number += 1
    return rows


if __name__ == "__main__":
    rows = build()
    rubric_rows = json.loads(RUBRIC.read_text(encoding="utf-8"))
    rubrics = {entry["level"]: entry for entry in rubric_rows}
    core = rows[:51]
    advanced_extensions = {
        entry["id"]: entry
        for entry in json.loads(ADVANCED_PARAGRAPHS.read_text(encoding="utf-8"))
    }
    assert len(advanced_extensions) == 15
    for row in core:
        extension = advanced_extensions.get(row["id"])
        if extension:
            row["type"] = "paragraph"
            row["promptVi"] += " " + extension["vi"]
            row["referenceAnswers"] = [
                answer + " " + extension["en"] for answer in row["referenceAnswers"]
            ]
            row["explanationVi"] = extension["note"]
            row["version"] += 1
        if row["id"] in {"band-8.0-043", "band-8.5-047"}:
            row["version"] += 1  # Target term changed after the previous publication.
        row["calibrationStatus"] = "internal_review"
        row["rationaleVi"] = f"{rubrics[row['practiceLevel']]['focusVi']} Bài này luyện: {row['explanationVi']}"
    for path, prefix, origin in (
        (ADDITIONAL, "cal", "original-level-authored"),
        (EXPANDED, "exp", "ai-assisted-level-draft"),
    ):
        added_counts = {}
        for source in json.loads(path.read_text(encoding="utf-8")):
            band = source["level"]
            added_counts[band] = added_counts.get(band, 0) + 1
            core.append({
                "id": f"band-{band}-{prefix}-{added_counts[band]:0{2 if prefix == 'cal' else 3}d}",
                "practiceLevel": band, "type": source["type"],
                "topic": source["topic"], "targetTerm": source["term"],
                "meaningVi": source["meaning"], "promptVi": source["prompt"],
                "referenceAnswers": [source["answer"]],
                "grammarTags": [source["tag"]], "explanationVi": source["explanation"],
                "rationaleVi": source["rationale"], "commonErrors": [],
                "calibrationStatus": "internal_review", "editorialStatus": "pilot",
                "source": origin, "version": 1,
            })
    candidates = []
    for row in rows[51:]:
        candidate = dict(row)
        candidate["suggestedLevel"] = candidate.pop("practiceLevel")
        candidate["editorialStatus"] = "candidate"
        candidates.append(candidate)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(core, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    RUBRIC_DEST.write_text(json.dumps(rubric_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    CANDIDATES.write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(core)} internally aligned exercises and {len(candidates)} uncalibrated pattern candidates")
