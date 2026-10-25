# Nguồn dữ liệu tự cập nhật cho sáu kỹ năng

Kiểm tra ngày 25/10/2026. Đây là kế hoạch nguồn cho bài **luyện theo dạng IELTS do IeltsWithHarry biên soạn**, không phải kho đề thi IELTS chính thức. Dữ liệu bên ngoài chỉ được xuất bản khi có đủ nội dung, nguồn, quyền sử dụng và đáp án đã kiểm tra.

## Nguồn đã kiểm tra

| Nguồn | Dữ liệu và cách cập nhật | Kỹ năng | Quyền sử dụng và giới hạn |
| --- | --- | --- | --- |
| [Open English Wordnet](https://en-word.net/downloads) | Bản JSON theo lần phát hành; đối chiếu phiên bản định kỳ, không phải feed hằng ngày. | Vocabulary: định nghĩa, từ loại, đồng nghĩa. | [CC BY 4.0](https://en-word.net/); cần ghi nguồn. Không có nghĩa tiếng Việt, ví dụ theo ngữ cảnh IELTS hay audio. |
| [Wiktionary](https://en.wiktionary.org/wiki/Wiktionary:FAQ) | Bản dump XML/JSON Wiktextract; so phiên bản định kỳ. | Vocabulary: nghĩa, phiên âm, dạng từ, ví dụ có kiểm tra. | [CC BY-SA](https://en.wiktionary.org/wiki/Wiktionary:Copyrights); riêng âm thanh, hình và câu trích có thể mang giấy phép khác. Chỉ nhập trường đã kiểm tra nguồn và giấy phép. |
| [Tatoeba](https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus) | Kho câu song ngữ để cập nhật ví dụ và câu luyện. | Vocabulary, Grammar. | Câu văn bản mặc định CC BY 2.0 FR, cần ghi tác giả/ID; [audio có điều kiện riêng](https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus), không nhập tự động nếu chưa kiểm tra từng file. Câu do cộng đồng đóng góp cần lọc chất lượng. |
| [VOA Learning English](https://learningenglish.voanews.com/rssfeeds) | RSS theo chủ đề, bài có văn bản và MP3. Dùng làm kho bài, kiểm tra ngày mới nhất trước mỗi lần nhập. | Reading, Listening; Words and Their Stories cho Vocabulary; Everyday Grammar cho Grammar. | [VOA cho phép tái sử dụng nội dung Learning English do họ tạo với ghi nguồn](https://learningenglish.voanews.com/p/6861.html). Loại riêng ảnh, bài và media của AP/Reuters/AFP. Ba RSS thử ngày 25/10/2026 có bài mới nhất từ tháng 3/2025 nên **chưa đủ tin cậy làm nguồn tin mới hằng ngày**. |
| [LibriVox](https://librivox.org/api/info) | API sách/đoạn audio, tham số `since` để chỉ lấy bản mới; giới hạn 500 bản ghi/lần và giãn cách yêu cầu. | Listening: nghe hiểu, chép chính tả, nghe theo đoạn; Reading khi nguồn văn bản hợp lệ. | [Bản ghi LibriVox thuộc public domain](https://librivox.org/pages/about-librivox/). Quyền của sách gốc phải kiểm tra theo nơi phát hành/người học; `url_text_source` chỉ là đường dẫn, không tự bảo đảm quyền văn bản. Sách thường dài, phải chia thành đoạn phù hợp. |
| [Project Gutenberg](https://www.gutenberg.org/ebooks/offline_catalogs.html) | Catalog/RSS/OPDS thay vì crawl trang; nhận sách mới theo ngày/tuần. | Reading dài, ghép với LibriVox nếu bản văn và bản ghi cùng tác phẩm. | [Quyền tác phẩm cần kiểm tra từng sách và lãnh thổ](https://www.gutenberg.org/policy/license); một số sách chỉ được Gutenberg cấp phép phân phối. |
| [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures) | JSON theo mã chỉ số, quốc gia và năm; đồng bộ hàng tuần rồi so năm/số liệu mới. API không cần khóa. | Writing Task 1: dựng biểu đồ/bảng và đề mô tả số liệu; Speaking Part 3: câu hỏi thảo luận theo số liệu. | [Đa số dữ liệu World Bank CC BY 4.0, có ngoại lệ bên thứ ba](https://www.worldbank.org/ext/en/legal/terms-conditions/datasets). Ghi chỉ số, nguồn, năm, ngày lấy và quyền cụ thể. Dữ liệu thường cập nhật theo năm, không hằng ngày. |
| [NASA/NOAA Daily News đang có](../src/lib/news/sync.ts) | RSS và bài toàn văn từ nguồn đã được phép trong hệ thống. | Reading hằng ngày; tách từ xuất hiện trong bài cho Vocabulary; tạo chủ đề Writing/Speaking bằng mẫu câu hỏi do biên soạn. | Giữ nguồn và quyền của từng bài/ảnh. Nội dung của bên thứ ba trong trang nguồn phải bị loại. |

### Kết quả thử endpoint

- RSS `Everyday Grammar`, `Words and Their Stories` và `VOA Learning English Podcast` trả HTTP 200, mỗi feed 20 mục và có enclosure audio; ngày mới nhất lần lượt là 20/03, 15/03 và 31/03/2025. Cần coi chúng là nguồn lưu trữ cho đến khi feed hoạt động mới.
- `https://librivox.org/api/feed/audiobooks/?format=json&limit=1&sort_order=desc` trả một sách tiếng Anh kèm `url_text_source` và `url_rss`.
- `https://api.worldbank.org/v2/country/VNM/indicator/SP.POP.TOTL?format=json&mrnev=2` trả hai mốc dân số, mốc gần nhất là năm 2025. Tần suất dữ liệu phải lấy theo chỉ số thực tế.

## Cách dùng cho từng màn học

| Màn | Dữ liệu tự nhập | Bài tập có đáp án cố định | Phần cần biên soạn/kiểm duyệt |
| --- | --- | --- | --- |
| Vocabulary | Từ rút từ bài đã có quyền + Wordnet/Wiktionary + ví dụ có nguồn. | Thẻ từ, nối nghĩa, điền từ vào chính câu nguồn, ôn cách quãng. | Nghĩa tiếng Việt, CEFR, collocation đúng ngữ cảnh, câu đặt tự do. |
| Grammar | Ngân hàng quy tắc ổn định do admin viết; câu ví dụ Tatoeba/VOA hợp lệ thêm dần. | Chọn dạng đúng, điền từ, sửa lỗi theo mẫu đã xác định. | Gắn chính xác quy tắc với câu; câu có nhiều đáp án phải được loại hoặc thêm đáp án chấp nhận. |
| Reading | Tin toàn văn hiện có, VOA hợp lệ, sách thuộc phạm vi quyền phù hợp. | Tìm từ, nối đoạn, câu hỏi có bằng chứng/đáp án do người soạn. | Câu hỏi suy luận và True/False/Not Given cần biên soạn hoặc duyệt; không suy đáp án từ văn bản một cách mù quáng. |
| Listening | VOA audio đã lọc quyền; LibriVox audio chia đoạn kèm transcript được phép. | Nghe chép chính tả, điền từ từ transcript, chọn thông tin có mốc thời gian. | Chọn đoạn rõ âm, đối chiếu transcript với audio, câu hỏi hiểu ý. |
| Writing | World Bank số liệu mới + bộ mẫu đề Task 1/Task 2 do admin quản lý. | Vẽ biểu đồ, giới hạn thời gian, đếm từ, checklist và lưu lịch sử. | Bài mẫu, nhận xét chất lượng, band và chấm ý/ngữ pháp cần người chấm; số liệu không tự tạo đáp án viết mở. |
| Speaking | Chủ đề từ bài đọc hợp lệ và số liệu World Bank, ghép với câu hỏi mẫu của admin. | Thẻ câu hỏi, đếm giờ, ghi âm/nghe lại, checklist, nhật ký luyện. | Đánh giá phát âm, độ trôi chảy và band cần người chấm; tiêu đề tin chỉ gợi chủ đề, không phải đề thi thật. |

## Thứ tự tích hợp

1. Tạo `content_sources`, `source_items`, `source_assets`, `sync_runs` chung: URL chuẩn, ID từ nguồn, giấy phép/URL giấy phép, tác giả, thời điểm nguồn, thời điểm kiểm tra, checksum, trạng thái `draft/published/rejected` và lỗi. Đồng bộ idempotent theo ID nguồn; giữ bản đã xuất bản khi nguồn tạm lỗi.
2. Thí điểm **Listening + Reading từ LibriVox** và **Writing Task 1 từ World Bank** vì API và dữ liệu đầu vào rõ. Song song mở rộng Vocabulary bằng Wordnet và từ rút từ bài Daily News hiện có.
3. Làm bộ mẫu bài Grammar/Speaking do admin kiểm soát. Dữ liệu mới chỉ đưa bài vào hàng chờ; admin duyệt câu hỏi/đáp án trước khi xuất bản. Tách nhãn “IELTS-style practice” khỏi “official IELTS test”.
4. Trên admin portal hiện nguồn, quyền, bản cập nhật cuối, số bài nháp và lỗi. Trên student portal hiện nguồn/tác giả/ngày dữ liệu; lưu kết quả cá nhân vào Supabase.

Các bộ [IELTS.org sample questions](https://ielts.org/take-a-test/preparation-resources/sample-test-questions) và [British Council practice tests](https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests) nên được dẫn link cho người học luyện trên trang chính thức. Không tự tải và đăng lại đề, audio hoặc đáp án của họ khi chưa có quyền tái sử dụng.

## Bản thử đang chạy trên sáu màn kỹ năng

`/app/vocabulary`, `/app/grammar`, `/app/reading`, `/app/listening`, `/app/writing`, `/app/speaking` dùng chung API đăng nhập `/api/ielts/live`. Endpoint đọc tối đa 12 bài toàn văn **đã xuất bản và không nhạy cảm** trong kho Daily News. Kho này có đồng bộ tự động khoảng 30 phút/lần; mỗi lần mở màn học, danh sách bài được đọc lại từ database. LibriVox API được làm mới tối đa mỗi 6 giờ; kiểm tra liên kết audio bằng HEAD và bỏ file trả lỗi. World Bank API được làm mới tối đa mỗi 7 ngày vì chuỗi chỉ số cập nhật theo năm. Nếu một nguồn lỗi, hai nguồn khác vẫn có thể hoạt động và giao diện hiện cảnh báo nguồn lỗi.

| Màn | Chức năng của bản thử | Chấm và lưu |
| --- | --- | --- |
| Vocabulary | Chọn từ dài xuất hiện trong bài mới, tra định nghĩa/IPA từ endpoint từ điển hiện có, lưu ví dụ có nguồn vào sổ tay. | Không tự chấm nghĩa do người học tự viết; từ lưu trong `notebook_entries`. Kho flashcard cũ ở `/app/vocabulary/overview`. |
| Grammar | Tìm câu thật có từ nối thuộc ngân hàng quy tắc đã xác định; bài điền đúng từ nối gốc. | So khớp một từ, lưu kết quả vào sổ tay. Đây là nhận diện cấu trúc, chưa đo đầy đủ năng lực ngữ pháp IELTS. |
| Reading | Hiện toàn văn đã có quyền; tạo tối đa 5 câu sentence completion bằng cách xóa một từ trong câu nguồn. | So khớp một từ, lưu kết quả vào sổ tay. Chưa phải bài Academic Reading 3 đoạn/40 câu. |
| Listening | Chọn tối đa 4 bản ghi tiếng Anh mới có audio còn truy cập được từ LibriVox, nghe và viết note. | Lưu note; không chấm nghe hiểu tự động vì chưa có transcript khớp audio. |
| Writing | Task 1 từ chuỗi dân số Việt Nam/Thái Lan của World Bank; Task 2 theo chủ đề bài mới. Có giờ tập, đếm từ và lưu bài. | Không chấm band tự động cho câu trả lời mở; lưu bài trong sổ tay. |
| Speaking | Cue card Part 2 từ bài mới, Part 3 follow-up, giờ tập, ghi âm và nghe lại. | Ghi âm chỉ tồn tại trong phiên trình duyệt; phần tự nhận xét lưu ở sổ tay. Chưa chấm phát âm/band. |

Để chuyển bản thử thành kho bài IELTS đầy đủ cần ngân hàng câu hỏi được biên soạn/duyệt (đặc biệt T/F/NG, Listening có transcript đúng thời điểm), nguồn audio theo tình huống thi, lịch sử bài làm chuyên biệt, và quy trình đánh giá Writing/Speaking bởi giáo viên. Dữ liệu bên ngoài được cập nhật tự động **không đồng nghĩa** câu hỏi IELTS chất lượng có thể tạo hay chấm tự động từ mọi bản tin.
