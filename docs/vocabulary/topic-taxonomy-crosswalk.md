# Vocabulary V2 — hai danh mục topic song song

Quyết định của chủ dự án ngày 28/10/2026: giữ **36 nhãn của kho nguồn** và **40 topic học đã biên tập** như hai danh mục riêng. Danh mục học gồm 25 topic từ CSV và 15 topic mới nêu trong `CODEX_MASTER_PROMPT.md`. Một từ có thể nằm ở nhiều topic học, nhưng chỉ được đếm một lần trong tổng lexical entries duy nhất. Không đổi tên hay cập nhật `topics[]` của 9.941 bank records khi tạo danh mục học.

## Quy tắc hiển thị và dữ liệu

- Giao diện ghi rõ **Kho nguồn (36 nhãn)** và **Chủ đề học (40 topic kế hoạch)**. Chỉ hiện số topic học đã xuất bản và số từ đã duyệt thực tế; không dùng 40 hoặc 7.650 làm số liệu DB hiện tại.
- Mỗi taxonomy có ID/slug riêng. Liên hệ giữa hai taxonomy là bảng crosswalk nhiều-nhiều có trạng thái review; không suy ra topic học cho từng từ chỉ từ nhãn nguồn.
- 25 topic CSV được giữ đúng nhãn gốc trong source record. 15 topic mới là kế hoạch nội dung; quota từ mới chỉ tính entry duy nhất sau QA. Các nhãn source rộng hoặc không tương ứng giữ nguyên và vẫn tìm được ở Kho nguồn.
- Bảng dưới đây là **gợi ý điều hướng để biên tập viên duyệt**, không phải mapping được áp dụng cho record hay migration. `Trùng` chỉ có nghĩa nhãn giống nhau; vẫn cần kiểm tra sense trước khi gắn một từ vào topic học.

## Crosswalk nhãn kho nguồn → topic học ứng viên

| Nhãn kho nguồn | Topic học ứng viên | Quan hệ |
| --- | --- | --- |
| Actions & Processes | — | Không có đối ứng trực tiếp; phân loại theo nghĩa từng từ. |
| Arts & Leisure | Entertainment, Films & Music; Hobbies & Free Time | Giao nhau. |
| Clothing & Fashion | Shopping, Fashion & Consumer Choices | Giao nhau. |
| Descriptions & Attributes | Places, Landmarks & Descriptions; Personality, Feelings & Character | Rộng, tùy nghĩa. |
| Education & Knowledge | Education & Learning | Giao nhau. |
| Education & Language | Education & Learning; Language & Communication | Giao nhau. |
| Environment & Climate | Environment & Climate | Trùng nhãn. |
| Events & Occurrences | Festivals, Celebrations & Traditions; Stories, Experiences & Opinions | Rộng, tùy nghĩa. |
| Family & Relationships | Family & Children; Friends & Social Relationships | Giao nhau. |
| Food & Nutrition | Food & Agriculture; Food, Cooking & Dining Out | Giao nhau. |
| Grammar & Usage | — | Không có đối ứng trực tiếp. |
| Health & Wellbeing | Health & Well-being | Gần tên; duyệt phạm vi. |
| Home & Housing | Housing & Communities; Home Life & Household Chores | Giao nhau. |
| Home & Objects | Home Life & Household Chores; Personal Objects, Gifts & Possessions | Giao nhau. |
| Ideas & Concepts | — | Quá rộng để gắn topic học tự động. |
| Materials & Environment | Energy & Resources; Environment & Climate | Giao nhau. |
| Media & Communication | Media & Advertising; Language & Communication | Giao nhau. |
| Media & Society | Media & Advertising; Equality & Social Change | Giao nhau. |
| Money & Ownership | Personal Finance & Household Life; Economy & Consumerism | Giao nhau. |
| Nature & Wildlife | Animals, Wildlife & Pets; Environment & Climate | Giao nhau. |
| Numbers & Data | — | Backlog Writing Task 1 riêng; không ép vào 40 topic. |
| Objects & Technology | Technology & Digital Life; Personal Objects, Gifts & Possessions | Giao nhau. |
| People & Daily Life | Everyday Routines & Habits; Friends & Social Relationships | Rộng, tùy nghĩa. |
| Places & Travel | Tourism & Travel; Places, Landmarks & Descriptions | Giao nhau. |
| Psychology & Emotions | Personality, Feelings & Character | Giao nhau. |
| Science & Environment | Science & Research; Environment & Climate | Giao nhau. |
| Science & Research | Science & Research | Trùng nhãn. |
| Science & Technology | Science & Research; Technology & Digital Life | Giao nhau. |
| Science, Technology & Law | Science & Research; Technology & Digital Life; Crime & Justice | Rộng, tùy nghĩa. |
| Shopping & Services | Shopping, Fashion & Consumer Choices | Giao nhau. |
| Society & Community | Equality & Social Change; Housing & Communities | Giao nhau. |
| Time & Sequence | Everyday Routines & Habits; Stories, Experiences & Opinions | Rộng, tùy nghĩa. |
| Travel & Transport | Tourism & Travel; Transport & Mobility | Giao nhau. |
| Urban Life & Services | Cities & Urban Life | Giao nhau. |
| Work & Careers | Work & Employment | Giao nhau. |
| World & Culture | Culture & Heritage; Globalisation & Trade | Giao nhau. |

## 15 topic học mới và mục tiêu chưa được tính vào DB

| Topic | Mục tiêu entry mới duy nhất sau QA |
| --- | ---: |
| Everyday Routines & Habits | 180 |
| Friends & Social Relationships | 170 |
| Personality, Feelings & Character | 220 |
| Entertainment, Films & Music | 200 |
| Shopping, Fashion & Consumer Choices | 170 |
| Hobbies & Free Time | 170 |
| Weather, Seasons & Outdoor Life | 150 |
| Animals, Wildlife & Pets | 170 |
| Festivals, Celebrations & Traditions | 150 |
| Personal Objects, Gifts & Possessions | 150 |
| Childhood & Personal Memories | 170 |
| Places, Landmarks & Descriptions | 190 |
| Home Life & Household Chores | 170 |
| Food, Cooking & Dining Out | 180 |
| Stories, Experiences & Opinions | 210 |
| **Tổng mục tiêu** | **2.650** |

Crosswalk có thể hỗ trợ gợi ý khi duyệt từng source record. Chỉ sau khi biên tập viên xác nhận nghĩa, độ phù hợp và trạng thái phát hành mới tạo topic link ở danh mục học.
