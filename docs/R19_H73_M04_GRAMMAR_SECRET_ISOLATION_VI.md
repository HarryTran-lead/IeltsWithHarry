# H73/M04 — Tách khóa ký Grammar placement khỏi Supabase service role

**DRAFT · CODE ONLY · NO_GO · không thay khóa thật trên Vercel/Supabase**

## Kết quả thay đổi
- Trước đây `src/lib/grammar/placement.ts` ký và xác minh ticket bằng `GRAMMAR_ASSESSMENT_SECRET || SUPABASE_SERVICE_ROLE_KEY`. Nếu thiếu khóa chuyên dụng, ứng dụng vô tình dùng credential database để ký ticket học viên.
- M04 **loại bỏ hoàn toàn fallback này**. `src/lib/grammar/placement.ts` chỉ nhận `GRAMMAR_ASSESSMENT_SECRET` rồi gọi helper tách biệt `src/lib/grammar/assessment-ticket.ts`.
- Helper không đọc `process.env`, không khởi tạo Supabase client và chỉ xử lý HMAC-SHA256. Chế độ live từ chối khóa rỗng, khóa bị thêm khoảng trắng, khóa ngắn hơn 32 byte hoặc demo key. Chế độ demo tiếp tục dùng khóa demo tách biệt, không cập nhật DB.
- Ticket vẫn bị ràng buộc user, target, 20 câu duy nhất và hết hạn 30 phút; xác minh bổ sung kiểm tra độ dài token và thời điểm hết hạn không bất thường.
- Phần **ghi cấp độ** sau khi học viên đạt vẫn giữ Supabase service-role trong `src/app/api/grammar/placement/route.ts`. M04 chỉ tách **khóa ký**, không tuyên bố đã bỏ quyền cao khỏi toàn bộ Grammar.
- `.env.example` bổ sung biến `GRAMMAR_ASSESSMENT_SECRET` dưới dạng server-only, tuyệt đối không có prefix `NEXT_PUBLIC_`.

## Quy trình triển khai được yêu cầu (chưa thực hiện)

1. Trong **staging tách biệt**, tạo chuỗi ngẫu nhiên đủ entropy: ví dụ `openssl rand -hex 32`. Không gửi giá trị thực vào PR, CI logs, báo cáo hoặc chat.
2. Cấu hình `GRAMMAR_ASSESSMENT_SECRET` trong secret manager của từng môi trường cần bật Grammar placement **trước** khi triển khai code M04. Xác nhận phạm vi môi trường staging/preview, không sao chép khóa production hay service-role.
3. Trên staging, dùng người học A gọi GET để lấy ticket (20 câu), POST ticket hợp lệ để xác nhận giải mã/chấm kết quả; người học B không thể dùng ticket của A; token giả, token hết hạn và token của khóa cũ bị từ chối.
4. Khi triển khai phiên bản có khóa mới, **ticket đã phát trước đó bằng khóa fallback cũ sẽ không còn hợp lệ**. Vì ticket cũ có thời hạn 30 phút, chọn thời điểm phù hợp hoặc tạm đóng việc bắt đầu lượt mới tối đa 30 phút để các lượt cũ hết hạn trước lúc chuyển code. Người học có thể phải **bắt đầu lại**; không hứa duy trì ticket cũ bằng service-role.
5. Rollback kỹ thuật: dừng deploy, giữ nguyên khóa chuyên dụng, quay lại bản build an toàn được kiểm tra; không xóa khóa chuyên dụng và không tự động tái kích hoạt fallback database-key. Xác minh lại GET/POST trước khi mở tính năng.

## Kiểm thử mã nguồn/CI

- `tests/grammar-assessment-ticket.test.ts` (7 Vitest cases) kiểm tra khóa độc lập, 32 byte, demo, ticket hợp lệ, token sai người dùng, sai target, đổi khóa, hết hạn, bị sửa, trùng ID, thời hạn tương lai bất thường và không đọc `SUPABASE_SERVICE_ROLE_KEY`.
- H73 static gate phải giảm **11 → 10** đường dẫn runtime/test có dấu hiệu `SERVICE_ROLE_REF`; tập `POSSIBLE_SERVICE_CLIENT` giữ **22**, trong đó **21** đường gọi gián tiếp; hợp của hai tập giảm **32 → 31**.
- 32 đường dẫn thuộc hồ sơ lịch sử H72 vẫn giữ nguyên ở `docs/R19_H72_STATIC_REVIEW_REGISTER_20261117.md`; snapshot hiện tại dùng 31 đường dẫn. **Không sửa số liệu lịch sử** để giả vờ giảm phạm vi ở một SHA cũ.
- Trạng thái M04 chỉ được đánh dấu CI-pass khi workflow chuyên biệt H73 và Quality của **đúng HEAD commit** thành công.

## Chưa xác nhận

- Không có quyền đọc secret manager hoặc cấu hình Vercel live để khẳng định biến chuyên dụng đã được cài đúng, có chất lượng entropy hay chưa.
- Không chạy live Supabase staging/production, không thay khóa, không migration, không kích hoạt chấm tự động.
- **18/18 staging checks NOT_TESTED**, release gate vẫn là **NO_GO**. Hoàn thành phần mã nguồn M04 không đồng nghĩa đã chuyển khóa ngoài thực tế.
