# H69 — Supabase Auth, RLS & Teacher Workflow Validation (VN)
**Nhánh dự thảo; không chạy migration lên staging hoặc production.**

1. CI PostgreSQL 16 tạo cấu trúc bảng H58 với khóa ngoại, 3 vị trí A/B/C, 3 giảng viên khác nhau, trigger bất biến, rồi chạy migration H68 trên database tạm. Auth trong CI được mô phỏng qua \`request.jwt.claim.sub\`, **không phải Supabase Auth thật**.
2. \`src/app/api/admin/r19/h68/review/route.h69.test.ts\` kiểm thử ranh giới HTTP; không thực hiện request Supabase thật.
3. \`scripts/h69_supabase_staging_readonly.mjs\` chỉ hoạt động khi thiết lập \`H69_ALLOW_READ_ONLY_PROBE=YES_AUTHORIZED_STAGING\`. Phải có \`H69_SUPABASE_PROJECT_REF\`, \`H69_SUPABASE_URL\`, \`H69_SUPABASE_ANON_KEY\`, \`H69_TEACHER_EMAIL\`, \`H69_TEACHER_PASSWORD\`, \`H69_OUTSIDER_EMAIL\`, \`H69_OUTSIDER_PASSWORD\` từ kho secrets bảo mật. Không đưa secrets vào issue, logs hoặc ZIP.
4. Công cụ staging **chỉ đọc** có ba yêu cầu: xác thực thực qua Supabase Auth \`getUser\`, tài khoản thường không đọc được r19_h58, và RPC H68 bị khóa bởi database. Yêu cầu RPC sử dụng probe chắc chắn không tồn tại nên không thể tạo review; nếu SQL trả phản hồi khác \`H68_DB_DISABLED\` thì báo FAIL.
5. \`sql/h69_dba_readonly_inventory.sql\` cho DBA kiểm tra thực tế role, RLS, SECURITY DEFINER ownership và DB gate; không tự động chạy.
6. Để làm bước **three-teacher staging write test**, phải có quyết định phê duyệt riêng và fixture với quyền sử dụng rõ ràng, ba tài khoản xác minh, rollback/backup và bằng chứng cho 18 hạng mục. **H69 không tự bật gate và không tạo tài khoản.**
7. Hiện H58 vẫn cấp quyền SELECT cho \`service_role\`; chỉ thêm RLS hoặc FORCE RLS không xóa quyền BYPASSRLS. Đây là vấn đề tồn đọng; cần H61/DBA least-privilege cutover độc lập.
8. Không có mô hình chấm speaking/writing, không có nhãn vàng thật, không chấm điểm học viên. Student release = BLOCKED.

## Phân biệt bằng chứng
- \`postgres_ci_pass\`: SQL hoạt động trên PG16 độc lập, giả lập JWT.
- \`next_quality_pass\`: TypeScript/build/HTTP unit test trên commit GitHub xác minh.
- \`supabase_staging_pass\`: chỉ khi chạy thật có project ref đúng, credentials teacher và outsider, evidence.
- \`teacher_gold_ready\`: yêu cầu nhãn thật, 3 người độc lập, rights approval, kappa đủ mẫu, QA; hiện **không đạt**.
