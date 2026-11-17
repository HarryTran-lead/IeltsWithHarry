# H75/M01 — Cutover và rollback bảo mật theo hướng forward-only

**DRAFT · PG16 LOCAL FIXTURE ONLY · KHÔNG ĐỔI STAGING/PRODUCTION · NO_GO**

## Tại sao có mốc này

Mốc H71 đã có diễn tập migration, rollback giữa transaction và **CI-only reset**. Phần reset của H71 cố ý dựng lại baseline không an toàn (khôi phục cấp quyền `service_role` đọc `r19_h58`) chỉ để kiểm tra fixture ban đầu. Phần đó **không phải runbook rollback triển khai thực tế**.

H75/M01 thêm một bài diễn tập riêng: **khi phiên bản ứng dụng cần rollback, chỉ tắt tính năng và giữ nguyên mọi cải thiện least privilege**. Không gọi script reset H71, không phục hồi database-key grants, không tự động sửa Supabase thật.

## 10 hợp đồng rollback trong PostgreSQL 16 cô lập

1. Khởi tạo fixture H69 trong database localhost riêng `h75_ci`; trạng thái cấm ghi mặc định.
2. Cố tình bật kill switch sai thứ tự, H70 migration phải từ chối, không để lại grant/policy nửa chừng.
3. Tắt gate và thực hiện H70 cutover: `service_role` mất quyền đọc H58, 13 policy và owner RPC least privilege tồn tại.
4. Thử chạy migration lần hai: phải fail-closed do role đã tồn tại, nhưng không phá trạng thái đã hardened.
5. Trong một transaction, giả lập một `GRANT SELECT` nguy hiểm rồi buộc lỗi trước `COMMIT`: PostgreSQL rollback grant.
6. Bật gate trên fixture giả lập, xác nhận thay đổi trạng thái.
7. Với gate bật, `anon`, `authenticated` và `service_role` vẫn bị từ chối SELECT trực tiếp dữ liệu H58.
8. **Rollback theo hướng an toàn:** tắt gate, giữ role `r19_h70_executor`, 13 policy và không cấp lại quyền đọc cho `service_role`.
9. Sau rollback không có review, audit hay idempotency record được tạo.
10. Bộ truy vấn catalog H74 chạy đọc được, báo `NO_GO` và thông tin chủ sở hữu RPC.

`scripts/h75_ci_forward_only_rollback.sh` yêu cầu **đúng cả hai**:
- `H75_ALLOW_EPHEMERAL_DDL=YES_DISPOSABLE_LOCAL_PG16_ONLY`
- `H75_PG_DSN=postgresql://h75_ci_runner:h75_ci_password_only@127.0.0.1:5432/h75_ci`

Nếu dùng DSN external, kết nối đến Supabase, hoặc thiếu opt-in: thoát **2**, không gọi `psql`. Các credentials này chỉ là tài khoản giả lập tự dựng trong GitHub Actions, tuyệt đối không dùng làm mật khẩu staging.

## CI và giới hạn

- Workflow `.github/workflows/h75-forward-only-rollback-ci.yml` khởi chạy PostgreSQL 16 disposable, 8 test Python guard và 10 hợp đồng DB; giữ `reports/h75_forward_only_rehearsal.txt` làm receipt tại đúng commit.
- Mọi bằng chứng ghi trong CI là **PG16 fixture**, không phải RLS/JWT/DB quyền của Supabase đang deploy.
- `evidence/H71_STAGING_EVIDENCE_TEMPLATE.json` vẫn có **18/18 NOT_TESTED**. Script không ghi PASS vào template, không đổi `NO_GO`.
- Không có secret thật, không deploy app, không chạy migration staging/production, không đổi role/ACL trên Supabase.
- Việc bắt buộc giữ quyền least privilege sau rollback là quyết định thiết kế bảo mật; trong triển khai thật, DBA phải xác minh phụ thuộc, bản sao lưu, migration compatibility và quyền thực tế.

## Trình tự staging thực sự — CHƯA THỰC HIỆN

1. Xác nhận **project staging tách biệt** production, môi trường/URL, branch/commit và quyền triển khai.
2. DBA chụp catalog chỉ đọc từ `sql/h74_dba_catalog_READ_ONLY.sql` + `sql/h72_preflight_READ_ONLY.sql`. Soát privilege của `service_role`, function owner, `SECURITY DEFINER`, `search_path` và trạng thái gate.
3. Lập danh sách runtime đang gọi H58/H68 (Cloudflare, Oracle Workers, API, cron). Chỉ có phép triển khai khi tất cả phụ thuộc đã xử lý hoặc có fallback vô hại.
4. Bảo đảm gate OFF, sao lưu có kiểm chứng, migration phiên bản đúng và kế hoạch dừng traffic.
5. Chạy cutover theo một thay đổi được phê duyệt, ghi receipt thực với project ref + timestamp + SHA; **không dùng script CI để tác động staging**.
6. Smoke test xác thực/ownership bằng tài khoản test A/B, rà không thể đọc chéo; gate vẫn OFF nếu thiếu bất kỳ bằng chứng nào.
7. Khi lỗi ứng dụng, rollback bằng cách **tắt gate, ngừng worker và trở lại bản ứng dụng tương thích**; không tái cấp quyền bảng H58 cho service role như script H71 CI-only.
8. Ghi quyết định kỹ thuật và người xác minh độc lập trong hồ sơ staging; tuyệt đối không dán JWT/secret, dữ liệu học viên hoặc kết quả truy vấn nhạy cảm vào CI công khai.

**Release gate hiện tại: NO_GO.** H75/M01 chỉ có thể đạt về mã nguồn và local PG16 CI; trạng thái staging vẫn 0/18 đến khi có bằng chứng live được phê duyệt.
