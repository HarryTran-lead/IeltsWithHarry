# Listening Lab: lộ trình tự học từ nền tảng đến IELTS Listening

## 1. Mục tiêu và ranh giới

Listening Lab dạy người học **hiểu và trả lời từng dạng câu hỏi IELTS Listening**. Dictation tiếp tục là nơi luyện nghe chép chính xác. Hai khu dùng chung audio, transcript, câu hỏi, đáp án và bằng chứng; Listening Lab bổ sung thứ tự học, hướng dẫn chiến lược, bài tập nhỏ, kiểm tra chuyển chặng và ôn theo lỗi. Không sao chép ngân hàng bài hoặc lưu một đáp án thứ hai.

Các nhãn `1.0–7.0+` dưới đây là **mức luyện nội bộ để xếp nội dung**, không phải band IELTS hoặc phép quy đổi từ Dictation F1–S4. Section 1–4 biểu thị vị trí trong bài thi, không phải cấp độ người học. Điểm của một bài nhỏ hay một bài nghe chép không được hiển thị là band IELTS.

Định dạng tham chiếu: [IELTS Academic Listening test format](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening). Bài thi có bốn phần, mỗi phần 10 câu; thứ tự câu hỏi theo audio và audio được nghe một lần. Lộ trình học có thể cho nghe lại trong bài hướng dẫn, sau đó giảm dần hỗ trợ trước khi chuyển sang mô phỏng thi.

## 2. Tài sản có sẵn và mức sẵn sàng

Kiểm kê từ checkout ngày 13/11/2026:

| Nguồn | Số lượng | Dùng trong Listening Lab |
| --- | ---: | --- |
| `content/dictation-skill-lab/lessons/*.json` | 580 bài, 6.218 lượt nói, 6.326 câu hỏi | Nguồn chính cho bài hướng dẫn và luyện theo dạng |
| F1 / F2 / F3 | 56 / 81 / 43 bài | Âm, tên, số, ngày giờ, câu ngắn và hội thoại |
| S1 / S2 / S3 / S4 | 115 / 100 / 100 / 85 bài | Luyện dạng câu hỏi và chuyển sang từng Section |
| `content/dictation-skill-lab/activities/*.json` | 400 hoạt động | Ứng viên cho bài tập nhỏ; hiện chưa có màn học, vẫn là bản nháp |
| `content/listening-mocks/tests/` | 20 đề | Chặng cuối, chỉ mở đề có audio đầy đủ và đã duyệt |

Trong checkout này, cả 580 bài Dictation thỏa điều kiện kỹ thuật `audioReady()`. Điều đó **không xác nhận chất lượng audio**: manifest vẫn có các lượt cần nghe rà soát, và dữ liệu bài vẫn ở trạng thái draft. Người biên tập phải kiểm duyệt nội dung, đáp án, transcript, hình map và audio trước khi chọn bài vào lộ trình chính thức. Tài liệu `DICTATION_SKILL_LAB.md` chỉ mô tả 300 bài M16.2; `LISTENING_MOCKS.md` ghi thêm 280 bài M49L.

Các câu hỏi có `type`, `question_tags`, `evidence_turn_ids`, `explanation_vi` và đáp án ở server. Đây là nền cho việc lọc bài theo dạng và phát lại đúng đoạn làm bằng chứng. Số câu hỏi hiện có ở các dạng lớn: form 546, note 923, MCQ 574, matching 268, map 156, table 119, summary 83, flow chart 42. Số lượng là tồn kho, **không phải số bài đã qua kiểm duyệt**. Chưa thấy kho bài Dictation có dạng chọn nhiều đáp án và gắn nhãn diagram đủ rõ để mở hai chuyên đề đó bằng dữ liệu hiện tại; cần biên soạn/duyệt bổ sung.

## 3. Trải nghiệm học viên

Trang `/app/self-study/listening` có ba cửa vào:

1. **Tiếp tục lộ trình:** bài kế tiếp được chọn theo kết quả đầu vào, chặng đang học và lỗi còn lặp lại.
2. **Luyện theo dạng:** tự chọn Form/Note/Table/Flow chart, Sentence/Summary, Short answer, MCQ, Matching, Map/Plan. Trang này chỉ hiển thị bài đã được duyệt.
3. **Ôn lỗi của tôi:** nghe lại câu sai, xem vị trí bằng chứng, làm một câu tương tự từ bản ghi khác rồi kiểm tra lại sau 2–3 ngày.

Mỗi mô-đun có cùng một nhịp:

| Bước | Màn hình | Cách kiểm tra |
| --- | --- | --- |
| 1. Hiểu dạng | Mục tiêu, ví dụ có chú thích, giới hạn từ và lỗi hay gặp | Một câu nhận diện đơn giản |
| 2. Nghe có hướng dẫn | Audio ngắn; đọc câu hỏi, dự đoán loại đáp án, nghe và chọn/điền | Có phát lại, gợi ý và phát sáng vị trí bằng chứng sau khi trả lời |
| 3. Luyện độc lập | Bản ghi khác cùng dạng, không hiện transcript/gợi ý trước khi nộp | Chấm bằng đáp án server; trả lời sai mới mở bằng chứng và lời giải |
| 4. Chuyển giao | Cụm câu trong một Section mới, nghe một lần ở tốc độ bình thường | Nộp cả cụm rồi xem lại |
| 5. Ôn lỗi | Phân loại lỗi và hẹn một câu tương tự | Kiểm tra lại sau 2–3 ngày bằng bản ghi khác |

Ví dụ ở bài `DICT-S1-001`: học viên nhìn bốn ô **loại phòng, ngày đến, giá, giờ ăn sáng** (`Q01–Q04`), dự đoán loại thông tin, nghe đoạn hội thoại, điền từng ô. Sau khi nộp, hệ thống phát lại `T02`, `T03`, `T05` tương ứng; lời giải chỉ rõ thông tin nào trong audio dẫn đến từng đáp án. Nút **Luyện nghe chép đoạn này** mở chính bài Dictation gốc khi người học cần xử lý lỗi nghe âm hoặc số. Một câu hiểu nội dung đúng không tự đánh dấu câu Dictation đã chép đúng, và ngược lại.

## 4. Kiểm tra đầu vào và nhịp học

**Đầu vào Listening Lab** là bài riêng khoảng 15 phút: 4 nhiệm vụ nhận âm/số/tên và 8–12 câu hiểu nội dung trải qua F2, F3, S1–S3. S4 chỉ dùng 1–2 câu ngắn phù hợp để tránh một bài giảng dài chi phối kết quả. Sau khi nộp, trang gợi ý chặng bắt đầu và 2 kỹ năng cần ôn; người học được chọn chặng khác. Bài placement Dictation hiện tại chỉ đo khả năng nghe chép, nên kết quả của nó là tín hiệu bổ sung, không thay thế bài đầu vào Listening Lab.

**Một buổi 20–25 phút:** 3 phút xem mục tiêu và dự đoán → 10–12 phút nghe/làm bài → 5 phút xem bằng chứng và ghi lỗi → 3–5 phút làm câu chuyển giao. Gợi ý 4 buổi/tuần; người học có thể học chậm hơn. Không ép làm hết 580 bài: lộ trình chọn một tập con đa dạng, kho còn lại phục vụ luyện thêm và ôn lỗi.

**Nhịp đề xuất:** một mô-đun học qua 2–4 buổi; một chặng khoảng 2–4 tuần nếu học đều. Người bắt đầu từ chặng đầu có thể cần khoảng 14–28 tuần để đi hết 28 mô-đun, cộng thời gian ôn; người đã có nền tảng bắt đầu ở chặng được gợi ý. Đây là khối lượng học tham khảo, không phải thời hạn để đạt band. Cuối mỗi tuần, trang lộ trình cho người học chọn **tiếp tục**, **ôn lỗi** hoặc **luyện thêm cùng dạng**.

## 5. Chương trình 7 chặng, 28 mô-đun

Mỗi chặng có 4 mô-đun theo thứ tự dưới đây. Mỗi mô-đun nên dùng **ít nhất 3 bản ghi nguồn khác nhau**: một có hướng dẫn, một luyện độc lập, một kiểm tra chuyển giao. Các con số trong cột nguồn là nguồn *ưu tiên để biên tập viên tuyển chọn*, không có nghĩa mọi bài của nguồn đó đã phù hợp hoặc đã được duyệt.

| Mức luyện nội bộ | Mô-đun theo thứ tự | Nguồn ưu tiên | Sản phẩm học viên phải làm được |
| --- | --- | --- | --- |
| **1.0–2.0 · Nghe chính xác** | 01 Âm dễ nhầm; 02 Tên và đánh vần; 03 Số, giá và giờ; 04 Câu ngắn đời sống | F1, F2 | Nhận đúng âm/từ, ghi số hoặc tên, trả lời một thông tin trực tiếp |
| **2.0–3.0 · Theo dõi hội thoại** | 05 Dự đoán loại đáp án; 06 Ai nói gì; 07 Thông tin được sửa lại; 08 Form đơn giản | F2, F3, S1 dễ | Theo một cuộc trao đổi ngắn, chọn thông tin cuối cùng và điền đúng ô |
| **3.0–4.0 · Bước vào đề IELTS** | 09 Form và Short answer; 10 Note completion; 11 MCQ một đáp án; 12 Cụm câu Section 1 | F3, S1 | Đọc yêu cầu, giữ giới hạn từ, làm 5–10 câu liên tiếp theo thứ tự audio |
| **4.0–5.0 · Đời sống và không gian** | 13 Section 1 trọn phần; 14 Chỉ đường và mốc cố định; 15 Map/Plan + Table/Matching; 16 Section 2 trọn phần | S1, S2 | Nghe hội thoại/độc thoại đời sống và xác định đáp án trên sơ đồ hoặc bảng |
| **5.0–6.0 · Thảo luận nhiều người** | 17 Theo dõi người nói; 18 Nhận ra paraphrase; 19 MCQ và Matching có thông tin gây nhiễu; 20 Section 3 trọn phần | S3, một ít S2 | Phân biệt quan điểm, bỏ phương án được nhắc nhưng bị bác bỏ |
| **6.0–7.0 · Bài giảng học thuật** | 21 Dấu hiệu chuyển ý; 22 Note/Table học thuật; 23 Summary/Flow chart/Sentence completion; 24 Section 4 trọn phần | S4 | Theo cấu trúc bài giảng, dự đoán từ loại và điền đúng từ/ngữ cảnh |
| **7.0+ · Áp dụng linh hoạt** | 25 Trộn nhiều dạng và giới hạn từ; 26 Bẫy paraphrase/chọn nhiều đáp án khi đủ dữ liệu; 27 Luân phiên Section 1–4; 28 Full mock và sửa lỗi | S1–S4, đề mock đã duyệt | Làm 40 câu nghe một lần, sau đó phân tích lỗi và luyện lại điểm yếu |

Mức ở bảng **không tự tăng theo điểm của một đề**. Một học viên có thể đang học chặng 6.0–7.0 nhưng vẫn nhận bài ôn tên/số của chặng đầu nếu lỗi đó lặp lại. Bài cấp 7.0+ chỉ có chuyên đề chọn nhiều đáp án khi bộ dữ liệu riêng đã đủ và qua QA; không lấy một MCQ một đáp án để giả làm dạng này.

## 6. Bài tập cụ thể theo dạng

| Dạng | Thao tác trước khi nghe | Thao tác khi nghe và sau khi nộp | Lỗi cần ghi nhận |
| --- | --- | --- | --- |
| Form/Note/Table | Xác định ô cần tên, số, địa điểm, danh từ…; đọc giới hạn từ | Điền ô, kiểm tra chính tả và đơn vị; xem đoạn nói chứa đáp án | Sai loại thông tin, nghe số, chính tả, quá số từ |
| Sentence/Summary/Flow chart | Đọc cả câu và quan hệ giữa các ý, đoán từ loại | Theo thứ tự ý, điền và nghe lại câu làm bằng chứng | Chọn từ đúng âm nhưng sai ngữ cảnh, bỏ mốc chuyển ý |
| Short answer | Gạch câu hỏi *who/where/when/how much* | Ghi câu trả lời ngắn, bỏ thông tin thừa | Dài quá giới hạn, nhầm đối tượng, sai đơn vị |
| MCQ | Đọc khác biệt giữa các phương án trước khi nghe | Đánh dấu phương án nghe thấy, loại phương án bị sửa/phủ định, chọn đáp án cuối | Chọn theo từ khóa, bỏ qua phủ định, nhầm ý chính với chi tiết |
| Matching | Đọc danh sách người/địa điểm và các lựa chọn | Theo người nói, ghép từng nhận định, xem đoạn chứng minh | Gán nhầm người nói, ghép theo một từ giống nhau |
| Map/Plan | Xác định lối vào, hướng bắc, mốc cố định | Theo tuyến đường từng bước, chỉ vị trí trên hình | Đoán theo thứ tự chữ, nhầm trái/phải hoặc mốc xuất phát |

Với một câu sai, lời giải tối thiểu phải có: **đáp án đúng → phát lại đúng đoạn → transcript của đoạn → vì sao đúng → vì sao đáp án học viên chọn sai → mã lỗi → một bài tương tự để luyện lại**. Đối với MCQ/Matching, biên tập viên cần bổ sung lời giải cho từng phương án gây nhiễu nếu dữ liệu gốc mới chỉ giải thích đáp án đúng.

## 7. Điều kiện hoàn thành và tiến độ

- **Bài có hướng dẫn** tính là đã học khi làm xong; lượt nghe lại hoặc xem transcript không dùng để tính mức thành thạo.
- **Mô-đun đạt:** ít nhất 8/10 câu độc lập đúng trên tối thiểu hai bản ghi khác nhau, không mở gợi ý trước khi nộp. Với mô-đun nền tảng, thay 10 câu bằng 10 nhiệm vụ nhận âm/số/tên tương ứng.
- **Chặng đạt:** hoàn thành bốn mô-đun và một bài chuyển giao mới đạt ít nhất 75%. Nếu bài chỉ có 10 câu, cần ít nhất 8/10 để tránh làm tròn mơ hồ. Với bài mock 40 câu, hiện raw score; không tự đổi sang band.
- **Ôn sau 2–3 ngày:** một bộ câu mới ở đúng nhóm lỗi, mục tiêu ít nhất 75%. Không đạt thì gợi ý quay lại mô-đun cần thiết, không khóa cứng các bài sau.
- **Tiến độ tách hai trục:** `nghe chép chính xác` (Dictation) và `trả lời câu hỏi` (Listening Lab). Dashboard Listening cho thấy độ đúng theo dạng, Section, lỗi và số bản ghi đã luyện. Một lần làm không được cộng hai lần vào cùng chỉ số.

Các ngưỡng trên là **quy tắc vận hành đề xuất của sản phẩm**; sau pilot cần xem tỷ lệ hoàn thành và độ khó thực tế để điều chỉnh. Lộ trình luôn cho người học mở bài khác nếu được hướng dẫn; kết quả kiểm tra dùng để *gợi ý*, không tuyên bố năng lực IELTS chính thức.

## 8. Dữ liệu cần soạn thêm: một lớp chỉ mục, không chép bài gốc

Mỗi mô-đun cần một bản ghi nội dung gồm:

| Trường | Ý nghĩa |
| --- | --- |
| `module_id`, `order`, `practice_level`, `title`, `objective_vi` | Vị trí và mục tiêu học |
| `question_type`, `micro_skills`, `error_tags` | Lọc bài và ôn theo lỗi |
| `guide_vi`, `worked_example` | Hướng dẫn và ví dụ có lời giải |
| `guided_refs`, `independent_refs`, `transfer_refs` | Các cặp `lesson_id` + `question_id` hoặc `turn_id` từ kho gốc; không chứa đáp án |
| `explanation_overrides` | Chỉ lưu lời giải bổ sung cho bẫy cụ thể; được quản lý cùng phiên bản nội dung |
| `required_audio_review`, `editorial_status`, `version` | QA, xuất bản và bảo toàn tiến độ sau khi sửa bài |

Ví dụ một liên kết nội dung: `module_id: LISTEN-09-FORM`, `guided_refs: [{lesson_id: DICT-S1-001, question_ids: [Q01, Q02]}]`, `independent_refs` lấy từ một bài S1 *khác*. Dữ liệu `correct_answers`, transcript và giải thích gốc vẫn chỉ ở server; chỉ trả chúng sau khi học viên nộp theo chế độ tương ứng. Không dùng lại cùng câu ở cả phần hướng dẫn và bài kiểm tra chuyển giao.

## 9. Thứ tự biên soạn và tiêu chí mở học liệu

1. **Rà soát ngân hàng:** lọc theo `type`, stage, độ dài, audio, `question_tags`; loại bài trùng quá gần; giáo viên duyệt transcript, đáp án, word limit, hình và audio. Ưu tiên nghe lại 244 lượt audio có `asr_check: review` trong manifest. Điền hoặc ẩn hợp lý 100 bản dịch tiếng Việt còn thiếu ở Section 2.
2. **Làm bản pilot:** mô-đun 05–08 và 09–12 trước, vì Form/Note/MCQ ở S1 có dữ liệu dày. Chọn tối thiểu 3 bản ghi khác nhau mỗi mô-đun, biên soạn chiến lược và giải thích bẫy.
3. **Mở các chặng nền và Section 2–4:** thêm map, matching, bài giảng; kiểm tra người học ở nhiều trình độ để sửa độ khó và ngưỡng đạt.
4. **Bổ sung dạng còn thiếu:** chọn nhiều đáp án, diagram labelling và các bài transfer mới khi kho hiện có chưa đủ. Chỉ sau đó mở toàn bộ mô-đun 26.
5. **Mở full mock:** chỉ các đề đủ audio và qua QA; giữ chế độ nghe một lần và lưu raw score. Bài mock xong mới có thể mở hoạt động post-test tương ứng trong 400 hoạt động đang lưu nháp.

Điều kiện xuất bản của một mô-đun: mọi tham chiếu tồn tại, audio mở được, không lộ đáp án trước khi nộp, lời giải khớp transcript, có ít nhất một bài độc lập chưa xuất hiện trong ví dụ, bản ghi nguồn và quyền sử dụng được xác nhận, và có người duyệt nội dung/audio. Mô-đun chưa đạt điều kiện vẫn ở trạng thái soạn thảo trong Listening Lab.

## 10. Bản triển khai kỹ thuật hiện tại

- Trang `/app/self-study/listening` hiển thị 28 mô-đun, lọc theo chặng và dạng câu hỏi, có cửa vào kiểm tra đầu vào 12 câu và ôn lỗi. Mỗi mô-đun có ba bước dùng các bản ghi khác nhau. Mô-đun 28 có bộ chuyển giao 40 câu, lấy 10 câu mỗi Section; đây là **bộ tổng hợp từ nhiều bản ghi**, chưa phải một đề mock IELTS chính thức.
- `content/listening-lab/modules.json` là lớp dữ liệu mục tiêu/chiến lược để biên tập. Mỗi bản ghi có `id`, `level`, `title`, `objective`, `strategy`, `stages`, `types` và tùy chọn `sourceFrom`/`sourceTo` cho nhóm FND2. `plan.ts` chọn câu dựa trên stage, loại câu hỏi, audio hiện có và lời giải. Nó chưa có danh sách bản ghi do giáo viên duyệt riêng cho từng mô-đun. Không suy ra rằng câu được chọn tự động đã khớp hoàn toàn mục tiêu sư phạm.
- Đáp án, transcript và lời giải vẫn ở API Dictation phía server. Giao diện chỉ nhận đáp án/bằng chứng sau khi nộp. Bài FND2 dùng chế độ chấm luyện tập vì nguồn này không đặt giới hạn từ theo IELTS; các bài completion còn lại phải có `word_limit` để được chọn và chấm theo chế độ IELTS. Điểm Listening Lab và lỗi được lưu dưới khóa riêng trong `package_practice_results`; điểm nghe chép Dictation không được cộng chung.
- Nhịp ôn lỗi hiện ghi lại câu sai, cho xem đáp án/đoạn bằng chứng, hiển thị mốc hai ngày và dẫn đến bước có bản ghi khác. Chưa có bộ sinh bài ôn mới theo mã lỗi chi tiết hay xác nhận ngưỡng 75% sau ôn. Kiểm tra đầu vào đưa gợi ý chặng theo nhóm câu và lưu chặng đề xuất để nút Tiếp tục dùng lại trên các thiết bị; không ước lượng band.
- Production vẫn khóa mục này trừ khi `NEXT_PUBLIC_ENABLE_LISTENING_LAB=true`; khi mở cờ này cần chắc chắn kho Dictation cũng cho học viên truy cập. Chỉ bật sau khi giáo viên duyệt audio, transcript, đáp án, hình map, lời giải và tham chiếu câu của từng mô-đun. Các kỹ năng tự học khác tiếp tục khóa.
