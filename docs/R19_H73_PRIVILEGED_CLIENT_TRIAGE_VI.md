# R19 / H73 — Phân loại 32 đường sử dụng Supabase quyền cao

**Phạm vi:** mã nguồn tĩnh; **chưa kiểm tra staging/production**, **không ký duyệt release**.
**Release:** `NO_GO`. **18/18 điều kiện staging:** `NOT_TESTED`.

## Nguồn bằng chứng
- H72 source SHA: `6782d0b3af36c54e4aee15ca6ad0f1044d32450c`.
- H72 static scan/CI: https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44080904819
- Bản ghi đầy đủ: `evidence/h73_privileged_client_static_triage.json`.
- Các phát hiện dựa trên việc đọc mã nguồn và marker tĩnh; không kết luận quyền Supabase thực tế hoặc hành vi của dịch vụ đã triển khai.
- Các file đã được rà qua thuộc `services/`, `src/app/`, và `src/lib/`. Một kết quả static clean không đồng nghĩa không có gọi gián tiếp, SQL động hay quy trình chạy ngoài repo.

## Tóm tắt 32 đường được H72 phát hiện

| Nhóm | File | Cách xử lý |
|---|---:|---|
| Tạo/dùng credential quyền cao trực tiếp | 7 | Soát đường gọi, giới hạn service role, xác minh môi trường |
| Gián tiếp dùng `bankClient()` | 21 | Soát authentication, authorization, ownership, leakage và các bản ghi liên quan |
| Fixture/test, không phải đường runtime | 2 | Giữ credential giả, ngăn kết nối Supabase thực |
| Kiểm tra cấu hình môi trường | 1 | Kiểm tra deployment secrets, không công bố giá trị |
| Tái sử dụng khóa signing Grammar (đã sửa trong Draft H73) | 1 | Bắt buộc cấu hình secret riêng và kiểm thử rollout |
| **Tổng** | **32** | Tất cả còn `NOT_VERIFIED` trong staging |

## Các điểm đã quan sát trong mã nguồn

1. **Lõi `bankClient()`**: `src/lib/ielts-bank/server.ts` khởi tạo Supabase với `SUPABASE_SERVICE_ROLE_KEY` (dòng 9–12 của snapshot H72). Vì service-role bypass RLS, không được xem `viewer()` hoặc `eq(user_id)` đơn lẻ là bằng chứng toàn bộ endpoint được bảo vệ; phải kiểm thử sở hữu và quyền đối với mọi select/update/insert/RPC.
2. **API học viên**: Reading/Listening attempt, writing grading/insights, speaking coaching, progress và sharing đều dùng `bankClient()` trực tiếp hoặc gián tiếp. Một số đã gọi `viewer()` và lọc `user_id`; đây chỉ là **biện pháp được nhìn thấy trong code**, chưa có test truy cập chéo người dùng trên Supabase thực.
3. **API quản trị**: các route `admin/`, Writing review/facts có `viewer(true)`; hàm này tra `rpc("is_admin")` bằng user-authenticated client. Cần kiểm chứng quyền thực của role/RPC và 403 với tài khoản học viên.
4. **Share công khai**: Reading share có token UUID, owner-only toggle và trạng thái enabled. Notebook share kiểm tra token/enabled, notebook+user_id và ký URL ảnh 3600 giây. Cần negative tests token bị tắt/sai, bị thu hồi, tài khoản khác; rà nguy cơ vô tình lộ đáp án và quyền dùng image signed URLs.
5. **Worker/cron**: Audio worker, Speaking Cloudflare worker, News sync, Writing grading worker giữ secret server-side; route scheduled bảo vệ qua Bearer secret trong mã. Kiểm chứng domain, token scope, quyền DB, retry và service exposure ở môi trường đích.
6. **Grammar placement signing key — đã xử lý bằng code H73**: trước đây `GRAMMAR_ASSESSMENT_SECRET || SUPABASE_SERVICE_ROLE_KEY`; nay chỉ nhận `GRAMMAR_ASSESSMENT_SECRET` ngoài demo. Nếu thiếu khóa, fail-closed. `.env.example` ghi rõ khóa phải độc lập và chỉ đặt server-side. Thay khóa sẽ làm các vé kiểm tra đang phát hành trước đó hết hiệu lực — người học cần bắt đầu lượt mới; không thay production config trong PR này.
7. **Dữ liệu hiển thị cộng đồng**: Streak leaderboard đọc profile người khác có chủ đích; vẫn cần kiểm tra chính sách quyền riêng tư và dữ liệu tối thiểu trước khi công bố.
8. **Lỗi phản hồi**: `requestError()` hiện trả message từ exception; cần kiểm chứng endpoint nào có thể trả thông tin nội bộ không cần thiết. Đây là điểm kiểm tra tiềm năng, chưa chứng minh được lỗ hổng.

## Hành động theo ưu tiên

### H73 — hoàn thiện static remediation (không chạy live)
- Chạy 6 kiểm thử ký vé Grammar bằng giá trị synthetic: nhận khóa riêng, từ chối fallback service role, từ chối rỗng/whitespace, demo key chỉ cho demo, tránh nhắc service role trong signer, kiểm tra env template.
- Chạy lại 27 scanner regressions từ H72.
- Trích xuất hồ sơ 32/32 file; reviewer độc lập phải đối chiếu mỗi đường với runtime deployment trước khi chấp nhận.
- Không chuyển 32 file thành `PASSED` chỉ vì có marker `viewer` hoặc `user_id`.

### H74 — kiểm thử thật trên Supabase staging (cần quyền đã được cấp)
- Xác nhận project identity, snapshot SHA, user/JWT role, `is_admin` RPC, grants trực tiếp/gián tiếp tới H58 và service role.
- Test hai tài khoản learner A/B và admin; từ chối đọc/ghi chéo attempt, grading result, notebook share, progress, coaching jobs; test anonymous và token chia sẻ đã tắt.
- Test cron/worker với secret sai, worker bị tắt, lease/replay/rate-limit, logs không chứa credential.
- Dùng DBA catalog SQL read-only của H72 để xác nhận không còn đường H58 ngoài dự kiến; không sửa dữ liệu thật.

### H75 — 18 điều kiện staging, cutover và rollback
- Cần **18/18 PASS** kèm evidence ID, source SHA, Supabase project identity, thời gian, reviewer và rollback đã kiểm thử.
- Cho đến lúc ấy: không merge, không deploy, không mở learner auto-grade / teacher-gold.

## Yêu cầu cấu hình mới

`GRAMMAR_ASSESSMENT_SECRET` phải là giá trị ngẫu nhiên, độc lập với mọi key Supabase; không tiền tố `NEXT_PUBLIC_`; thiết lập riêng cho từng môi trường thật trước khi bật Grammar placement. Không lưu giá trị trong Git, log, CI artifact hoặc tài liệu. **Đây là thay đổi cần kiểm thử trước rollout**.

## Giới hạn và xác nhận

Tài liệu và JSON kèm theo là **hồ sơ triage tĩnh**; H72/H73 CI PASS chỉ có nghĩa mã nguồn và các unit tests đã chạy như thiết kế. Chưa kiểm tra môi trường deploy thực tế, domain khác, câu lệnh SQL động, cấp quyền DB, RLS thực, nguy cơ CSRF hay hiệu lực của các lời gọi RPC. Mọi mục staging vẫn `NOT_TESTED`; `NO_GO` vẫn bắt buộc.
