# Cấp học và khung avatar

Migration: `supabase/migrations/202611060002_learner_levels_frames.sql`. Áp dụng sau các migration Daily News, Vocabulary, IELTS bank, YouTube Listening Lab và Community. Giao diện Cộng đồng cần migration này để đọc thẻ tác giả.

## Cấp độ

XP cần cho cấp kế tiếp bắt đầu ở 80 và tăng 10 cho mỗi cấp. Từ cấp 1 tới cấp 30 cần 6.380 XP. XP không phải IELTS band.

`learner_total_xp` tổng hợp kết quả học đã lưu: đọc báo, quiz báo, bài học, đề IELTS, ôn từ, luyện từ, Speaking mock, dictation và đăng nhập ngày mới. Phần Learn with News giữ nguyên XP đã cấp trong `user_news_progress`; không cộng đúp với quiz của cùng bài. Các kết quả chỉ tự đánh giá, ghi chú, mở trang và nhiệm vụ đánh dấu thủ công chưa cấp XP. Một bài hoặc câu dictation chỉ nhận thưởng hoàn thành một lần; ôn từ và luyện từ giới hạn theo ngày.

Lần đăng nhập đầu tiên mỗi ngày theo múi giờ trong hồ sơ nhận 5 XP. Database đối chiếu `auth.users.last_sign_in_at` với ngày hiện tại và dùng khóa duy nhất `(user_id, local_day)` để chặn cộng trùng. Một phiên cũ được giữ qua ngày mới không tự nhận XP đăng nhập.

Dictation của Listening Lab lưu lần kiểm tra đầu theo học viên, bài và câu. Chỉ 10 câu đầu của mỗi bài được 3 XP/câu. Âm thanh và câu trả lời không được lưu vào bảng XP.

## Khung

Khung cơ bản mở từ cấp 1; Lá non cấp 3; La bàn cấp 6; Ngọn lửa cấp 11; Sách mở cấp 16; Đỉnh núi cấp 21; Vương miện cấp 26. Học viên chọn khung trong hồ sơ. Trigger database kiểm tra cấp trước khi lưu, nên không thể chọn khung khóa bằng cách sửa request.

Trong Cộng đồng, bài viết và bình luận hiển thị avatar có khung cùng nhãn `Lv.N`. API chỉ trả avatar, khung và cấp của tác giả có nội dung công khai mà người xem không chặn. Không trả tổng XP, email, mục tiêu học hoặc dữ liệu hồ sơ riêng tư.
