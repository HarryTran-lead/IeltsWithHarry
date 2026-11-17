# H73/M03 — Kiểm toán xác thực và điều kiện ownership khi dùng service_role

**Chỉ phạm vi kỹ thuật · DRAFT · NO_GO · không chỉnh secret / DB / production**

## Vấn đề đã xác định từ mã nguồn

`bankClient()` dùng Supabase `service_role`, vì vậy các truy vấn phía server không được dựa hoàn toàn vào RLS như client thông thường. Để giảm tác động của lỗi routing, metadata hoặc quan hệ dữ liệu bất thường, những truy vấn nhạy cảm đối với dữ liệu riêng của người dùng phải gắn `user_id` trực tiếp, bao gồm **bước đọc, cập nhật và retry** khi cột đó tồn tại.

### Các thay đổi cụ thể đã thực hiện

| File | Trước | Đã sửa |
|---|---|---|
| `src/lib/ielts-bank/server.ts` | Hàm nộp bài kiểm tra owner khi đọc nhưng UPDATE attempt chỉ lọc `id` + `state` | Bổ sung `user_id = userId` ngay trên UPDATE |
| `src/app/api/ielts/bank/speaking-coaching/route.ts` | Session đã kiểm tra owner; truy vấn job qua session ID chưa gắn user ID | Thêm `user_id = user.id` khi đọc job, kiểm tra job đã tồn tại và lấy lại job sau conflict |
| `src/app/api/ielts/bank/writing-grading/route.ts` | Attempt được kiểm tra owner; một số truy vấn job / result lại dựa trên `attempt_id` / `job_id` | Thêm điều kiện `user_id = user.id` cho GET job và result |
| `src/app/api/ielts/bank/writing-insights/route.ts` | Lookup job đã có owner; deep report, grading result và cập nhật trạng thái được truy vấn bằng job ID/lease token | Thêm owner cho deep-report reads, grade read, success update và cleanup khi thất bại |
| `src/lib/writing-grading/server.ts` | Kiểm tra bài làm thuộc user trước khi enqueue; lookup idempotency và conflict retry dựa trên attempt/pipeline | Gắn `user_id = userId` vào cả hai lookup |

## Kiểm tra định tính đã rà soát

- `viewer()` trong IELTS Bank xác thực người dùng; `viewer(true)` gọi RPC `is_admin` trước đường dữ liệu quản trị. Việc tồn tại lời gọi này **chưa chứng minh** mọi truy vấn trong route luôn tuân thủ quyền.
- `reading/share/[token]/page.tsx` chỉ tra Reading attempt ở trạng thái submitted/expired có token share đang enabled. Trang được **cố tình chia sẻ công khai bằng token**, nên không thêm `user_id` của người xem.
- `notebook/share/[token]/page.tsx` chỉ tra share đang enabled và ràng buộc notebook/pages vào owner trong bản ghi share. Cần test tắt quyền share / token bị thu hồi trên staging.
- `scheduled/route.ts` sử dụng bearer secret cho cron thay cho session người dùng; đây là đường kỹ thuật riêng. Kiểm tra rotation, vận hành cloud, định danh job ngoài repo vẫn còn thiếu.
- `streak-leaderboard/route.ts` tổng hợp thông tin cộng đồng để tạo bảng xếp hạng. Không áp dụng user filter toàn cục, nhưng cần rà chính sách quyền hiển thị tên/ảnh đối với tài khoản opt-out và tài khoản bị đình chỉ.
- `writing-grading/jobs` và `speaking-coaching/jobs` có quota toàn hệ thống; các count **cố ý không lọc theo user** không phải truy vấn trả nội dung cá nhân.

## Kiểm thử hồi quy

- `tests/test_h73_owner_scope.py` kiểm tra *biểu thức mã nguồn* ở bảy nhóm quy tắc: attempt write, speaking job, writing result, deep report, enqueue retry, public-share token và admin access.
- `.github/workflows/h73-privileged-source-ci.yml` chạy tất cả `test_h73_*.py` cùng kiểm toán 32 đường dẫn service-role/`bankClient`.
- Các kiểm thử này có thể phát hiện việc bị xóa nhầm điều kiện owner, nhưng không có mock JWT/DB thực sự; **không phải** bằng chứng chống IDOR, RLS hoặc function grants.

## Phần chưa đóng (không được tự tuyên bố PASS)

1. M03 còn kiểm tra quyền sở hữu bằng tài khoản A/B (đọc ID của B từ A → 403/404, không có nội dung riêng tư) và các case tắt share trên môi trường staging được phê duyệt.
2. M04 tách `GRAMMAR_ASSESSMENT_SECRET` khỏi khóa service-role và xác định xử lý ticket cũ, không đổi production secret trực tiếp.
3. M05 đối chiếu quyền SQL thực tế, Edge Functions, Workers, cron, Supabase service_role, function definer và vận hành backup/rollback.
4. 18/18 staging acceptance vẫn **NOT_TESTED**; không bật auto-grading cho learner, không merge/deploy các nhánh dự thảo trên cơ sở static code tests.

**Gate:** `release_gate = NO_GO` luôn giữ nguyên. Không có kiểm duyệt nội dung học tập hay giáo viên trong mốc kỹ thuật này.
