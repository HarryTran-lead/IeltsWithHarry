# H71 — Supabase Staging Cutover & Security Acceptance (VI)
**STAGING_ONLY · DBA_APPROVAL_REQUIRED · SECURITY_REVIEW_REQUIRED · RELEASE_NO_GO**

## Bằng chứng có thể xác nhận hiện tại
- H70 CI chạy Next.js/TypeScript/lint/test/build và PostgreSQL 16 trên commit riêng, không phải Supabase thật.
- H71 thử **migration H70** trên database PostgreSQL 16 cô lập với schema thử H58/H68.
- H71 kiểm tra: gate phải tắt; preflight từ chối khi gate mở; lỗi ngay trước COMMIT phải rollback toàn bộ role, quyền, policies và function ownership; migration thành công; từ chối đọc nguồn qua service_role; **trả lại trạng thái baseline chỉ trong CI**; không tạo review/audit. Cần đối chiếu thông tin GitHub Actions theo commit.
- 10 unit tests cho bộ kiểm tra chỉ mục bằng chứng staging; không có chức năng phát hành tự động.

## Quy trình staging bắt buộc — KHÔNG tự động thực hiện
1. Chốt đúng **Supabase project ref** và **Git commit SHA**; phân quyền người phê duyệt DBA, security và chủ sản phẩm, tách biệt.
2. Kiểm kê tất cả ứng dụng/jobs/RPC/Edge Functions/triggers dùng bảng H58 và credential **service_role**. SQL catalog chỉ cho biết phụ thuộc trong database; phải tìm cả code, scripts, scheduled jobs, serverless functions và app connectors bên ngoài. Không suy diễn “không có phụ thuộc” từ GitHub code-search.
3. Chạy query **chỉ đọc** \`sql/h71_readonly_dependency_inventory.sql\` trên staging được ủy quyền; lưu snapshot checksum + commit + project ref. Đánh giá quyền trên từng object, SELECT trên probes/reviews, owner của SECURITY DEFINER và API/PostgREST exposed schemas.
4. Sao lưu logic + schema/role grants + pg_policies và kiểm tra restore trên bản clone **không chứa dữ liệu học viên thật**. Cần có kế hoạch rollback do DBA duyệt; script phục hồi quyền rộng của bộ CI **KHÔNG** được tái sử dụng trên staging.
5. Tắt H68 API và \`r19_h68.release_controls.review_writes_enabled\`; tạm dừng worker H58 và các tác vụ phụ thuộc sau khi có maintenance window; xác nhận không có giao dịch ghi đang chạy.
6. DBA review SQL H70, xem quyền tạo role/ALTER FUNCTION OWNER trên Supabase, review role membership/service_role privilege & PostgREST function exposure. Chỉ chạy migration H70 **sau khi** phê duyệt thay đổi staging.
7. Phát hành mã Next.js H70 staging sau typecheck/build thành công và kiểm tra đúng \`H70_APPROVED_SUPABASE_PROJECT_REF\`. Chưa bật bất cứ cờ ghi nào.
8. Chạy test Supabase Auth **bằng JWT thật** với 3 teacher, outsider, coordinator, owner; xác nhận RLS, quota khi gọi trực tiếp RPC, holdout không xuất đáp án, audit rollback, staging origin, GET/POST unauthorized, DB gate. Sử dụng dữ liệu test có provenance/rights, không dùng nhãn vàng giả.
9. Thu thập **18 bằng chứng H62/H69** theo một commit và project, có source logs, SHA-256, người kiểm chứng độc lập. Chạy \`python scripts/h71_acceptance_gate.py --manifest ...\` để phát hiện thiếu/tamper. Công cụ này chỉ kiểm tra **tính nhất quán nội bộ**, không tự chứng thực người ký hoặc cấp phép GO.
10. Sau DBA, security reviewer và chủ sản phẩm đánh giá độc lập, mới cân nhắc lịch sử nghiệm thu staging. Quyết định phát hành học viên **khác** và vẫn bị chặn đến khi có đủ nhãn giáo viên thật, kiểm định độ tin cậy và chất lượng model.

## Rollback hướng dẫn, không phải migration lệnh chạy ngay
- Khi nghi ngờ quyền bị thiếu: dừng thao tác ghi, giữ gate SQL = false và API = disabled. Thu thập log/chứng cứ; không tự cấp lại quyền rộng.
- DBA chọn restore snapshot đã xác minh **theo quyền thực tế của staging**, đồng thời khôi phục function owner/definer theo baseline phê duyệt. Kiểm tra chuỗi audit append-only, không mất dữ liệu đã commit.
- Kiểm định bất biến và RLS sau khôi phục, test GET/POST unauthorized, kiểm tra health, đối chiếu grants từng bảng và jobs. Không mở lại learner auto-grading.
- Quy trình rollback mô phỏng trong \`scripts/h71_ci_cutover.py\` là **đặc quyền của CI db tạm**; nó tái cấp service_role cũ chỉ để kiểm tra baseline và **không** được phép dùng trên hệ thống thực.

## Rủi ro tồn đọng
- SECURITY DEFINER \`h68_submit_review\` có quyền SELECT nguồn EN/VI dù trả chỉ status. Thẩm tra chức năng và quyền executor là bắt buộc.
- Audit hash chain vẫn nằm trong DB, chưa có external immutable anchor.
- DB quota H70 không đếm request lỗi rollback; cần ingress/WAF trên staging.
- Supabase auth.uid() trong CI được mô phỏng, không phản ánh JWT xác thực thật hoặc RLS của Supabase.
- Owner/role của SQL trên Supabase thật, existing job dependencies, shared role grants và rollback chưa được kiểm chứng.
- **0/18 live staging**, **0 nhãn vàng giáo viên thật**, tự chấm học viên **BLOCKED**.
