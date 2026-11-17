# H74/M01 — Hợp đồng bảo mật Auth, RLS và RPC trên PostgreSQL cô lập

**Kỹ thuật thuần túy · DRAFT · RELEASE NO_GO · không kiểm duyệt dữ liệu học tập / giáo viên**

## Ranh giới

H74/M01 tiếp tục từ H73 `525f7e8356f475056b7a3e3861c3d6368bb36d2f` với hai workflow Quality và H73 static gate đều SUCCESS.

- Mục tiêu là xác minh các **giả định bảo mật PostgreSQL/RPC bằng bản dựng cô lập**, không chạy migration lên Supabase staging hay production.
- `scripts/h74_ci_pg_auth_rls.sh` chỉ kết nối đến đúng DSN `postgresql://h74_ci_runner:...@127.0.0.1:5432/h74_ci`, với opt-in `H74_ALLOW_EPHEMERAL_DDL=YES_ISOLATED_PG16_CI_ONLY`. Nếu thiếu hay sai thì dừng `NOT_TESTED` trước khi gọi `psql`.
- Workflow `.github/workflows/h74-auth-rls-rpc-ci.yml` dựng PostgreSQL 16 disposable, tạo các role `anon`, `authenticated`, `service_role` giả lập bằng bộ H69, rồi áp dụng bản vá least-privilege H70 **chỉ trong database CI**.
- Mô phỏng `SET ROLE authenticated` + `request.jwt.claim.sub` **không xác minh chữ ký JWT**. Supabase Auth, getUser, JWT revocation, deployment secrets, API gateway và project identity thật chưa được kiểm chứng.
- Mỗi test kết thúc với gate write đã tắt; không chấm bài hay làm việc với dữ liệu học tập thực tế.

## 10 kiểm tra bảo mật cô lập

| # | Điều kiện kiểm tra | Bằng chứng dự kiến |
|---|---|---|
| 1 | Cả tám bảng `r19_h58` có `ENABLE` và `FORCE ROW LEVEL SECURITY` | Catalog `pg_class` |
| 2 | 13 policy H70 hiện diện trong hai schema H58/H68 | `pg_policies` |
| 3 | `anon`, `authenticated` và `service_role` không thể SELECT trực tiếp `probes`/ `reviews` | `has_table_privilege` + session với `SET ROLE` |
| 4 | Role `r19_h70_executor` không LOGIN, SUPERUSER hay BYPASSRLS | `pg_roles` |
| 5 | `h68_submit_review` có owner chuyên dụng, `SECURITY DEFINER`, `search_path=pg_catalog` | `pg_proc` |
| 6 | Chỉ `authenticated` có EXECUTE RPC H68 mới; anon và RPC quota cũ bị từ chối | `has_function_privilege` |
| 7 | Kill switch mặc định đóng, ngăn gọi RPC | Session giả lập |
| 8 | Người dùng ngoài phạm vi và người không có assignment bị từ chối, không tạo review/audit | Session giả lập |
| 9 | Trường hợp `auth.uid()` rỗng bị từ chối | Session giả lập |
| 10 | Cuối phiên CI không có bản ghi review/audit, khóa ghi đóng | Catalog + bảng fixture |

Cần chú ý rằng role `authenticated` trên PostgreSQL giả lập không chứng minh JWT hợp lệ trong Supabase. Việc xác minh quyền truy cập chéo tài khoản thật và revoke token sẽ thuộc H74/M02 trên staging được phê duyệt.

## Hàng rào thất bại an toàn

`tests/test_h74_auth_rls_boundaries.py` gồm 8 unit tests kiểm tra:
- Không có opt-in đúng hoặc dùng remote DSN → script trả code 2, không gọi cơ sở dữ liệu.
- Không import `SUPABASE_SERVICE_ROLE_KEY` hay URL thật.
- Mã `viewer()` sử dụng `getUser` và RPC admin; các luồng ghi/đọc dữ liệu cá nhân vẫn chứa ràng buộc `user_id`.
- Bản ghi H71 có đủ **18 điều kiện**, tất cả `NOT_TESTED` và trạng thái `NO_GO`.

`evidence/H71_STAGING_EVIDENCE_TEMPLATE.json` giữ nguyên: **0/18 PASS staging thực tế**. CI đi qua không làm tăng con số này.

## M02 — Những kiểm tra staging chưa tiến hành

- Dùng hai tài khoản học viên giả định A và B trên một **Supabase staging được phê duyệt**, xác minh getUser/session/JWT, bài làm của A không thể bị đọc/sửa bởi B.
- Kiểm tra admin/learner và public share: token sai/hết hạn/đã thu hồi, tài khoản bị đình chỉ.
- DBA kiểm tra H58/H68 `service_role`, RLS, EXECUTE, SECURITY DEFINER, `search_path` trên **catalog thực tế**; không tự động chạy SQL thay đổi quyền.
- Ghi project ref, SHA, timestamp, kết quả và reviewer độc lập; không lưu mật khẩu, token, secret, bài viết hay dữ liệu cá nhân vào artifact.
- Giữ các ràng buộc `NO_GO` và Draft trước khi có evidence staging.

**Chưa có bất kỳ kiểm tra trực tiếp Supabase staging nào thuộc H74/M01.**
