# Cộng đồng — ghi chú triển khai

## Khảo sát source và điểm tái sử dụng

| Hiện có | Sử dụng | Bổ sung |
|---|---|---|
| App Router `src/app/app/[[...slug]]` điều phối bằng `Portal` | Route `/app/community` và các nhánh trong `Portal` | `Community` component, CSS, API route |
| `AppShell` có header/sidebar, mục `Cùng học` và phòng học `/app/study-together` | Giữ nguyên route và mục `Cùng học`; thêm mục **Cộng đồng** riêng | Menu `Cộng đồng` khi feature flag mở |
| Supabase Auth, `getViewerRole`, `is_admin()`, `profiles`, `account_controls` | Xác thực server, tên hiển thị, khóa/tạm cấm, quyền admin | Bảng community và RLS; không mở quyền đọc `profiles` của người khác |
| `user_notifications` cho thông báo chung | Không thay đổi bảng chung | Thông báo gắn bài viết trong `community_notifications` |
| `study_room_messages` và presence | Giữ hoạt động độc lập | Không thay đổi phòng học |

## Route và luồng đã có

- `/app/community`: feed, tìm kiếm, lọc chủ đề/loại bài, phân trang, tạo bài.
- `/app/community/posts/:id`: chi tiết, bình luận và trả lời, tác giả câu hỏi chọn câu trả lời hữu ích nhất.
- `/app/community/saved`, `/app/community/mine`, `/app/community/notifications`.
- `/app/community/moderation`: hàng đợi báo cáo cho admin, ẩn bài hoặc giải quyết báo cáo.
- API `/api/community`: tạo bài, bình luận, thích, lưu, báo cáo, chặn tác giả, xóa mềm và thao tác kiểm duyệt.

Migration additive: `supabase/migrations/202610310005_community.sql`. RLS kiểm tra quyền đọc/ghi ở database; trigger chép tên tác giả từ hồ sơ, giới hạn tần suất đăng và bình luận, dùng trạng thái xóa/ẩn và ghi audit. Dữ liệu demo được gắn nhãn minh họa và không ghi vào database.

## Mở tính năng

Trong local development, Cộng đồng hiển thị để xem giao diện. Với production, áp dụng migration rồi đặt `NEXT_PUBLIC_ENABLE_COMMUNITY=true` và build lại. Ghi lại kết quả migration, build và kiểm tra route trong báo cáo phát hành.

## Phần chưa mở

Các màn hình nhóm học, thử thách, ghép bạn học, chia sẻ sổ tay, hồ sơ cộng đồng và annotation/audio review cần quyền riêng tư và luồng dữ liệu riêng; hiện chưa có nút dẫn tới các màn hình chưa hoàn chỉnh. Bài xin góp ý Writing/Speaking hiện dùng bài viết dạng văn bản và bình luận; chưa có upload hoặc chấm điểm tự động.
