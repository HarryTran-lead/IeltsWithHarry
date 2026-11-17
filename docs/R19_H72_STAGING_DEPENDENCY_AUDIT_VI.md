# H72 — Staging Dependency Audit & Verified Security Evidence (VI)

**STAGING_ONLY • REVIEW_ONLY • DBA_APPROVAL_REQUIRED • RELEASE_NO_GO**

## Mục tiêu mới của H72
H70 đã chứng minh migration và quota ở PostgreSQL CI; H71 đã chứng minh rollback trên DB CI tạm. Chúng **không chứng minh** các API, Edge Functions, cron, jobs hay ứng dụng khác sẽ tiếp tục hoạt động sau khi thu hồi \`service_role\` trên H58 trong Supabase staging thật.

H72 chạy một công cụ dò tìm toàn bộ **file mã nguồn được Git theo dõi tại đúng commit SHA**:
- \`r19_h58.*\`, \`schema("r19_h58")\` → dấu hiệu phụ thuộc trực tiếp schema H58.
- \`SUPABASE_SERVICE_ROLE_KEY\`, \`service_role\`, \`bankClient(...)\` → dấu hiệu có thể sử dụng client quyền cao. **Đây không tự động là phụ thuộc H58.**
- \`h68_submit_review\`, \`h68_rate_limit_review\` → kiểm tra đường RPC hiện hành và đường rate-limit cũ.
- Chia kết quả thành \`APPLICATION_RUNTIME\`, \`DB_MIGRATION_HISTORY\`, \`MILESTONE_OR_OPERATIONAL\`, \`CI_WORKFLOW\`. Báo cáo chỉ chứa file/line/tên loại rủi ro, **không sao chép code hoặc secrets**.
- Các file nguồn dung lượng lớn/chưa đọc được được liệt kê trong \`coverage.skipped\`, không được tự xem là đã kiểm tra.
- Không thể phát hiện truy vấn ghép chuỗi ở runtime, các job nằm ngoài repo, quyền grant thực tế, Cloudflare Workers, Supabase Edge Functions chưa được checkout, hay dịch vụ dùng secret từ nơi khác.

## Quy trình DBA trước khi cân nhắc cutover staging
1. Đóng băng commit và branch, xác minh đúng staging project ID, GitHub Actions run ID, bản sao lưu và quyền người phê duyệt.
2. Chạy công cụ quét repo H72 trên commit đúng và kiểm tra từng file ở \`application_direct_h58_reference_paths\` và \`application_service_role_or_client_paths\`. Kiểm tra riêng các job phụ thuộc \`bankClient\` và \`SUPABASE_SERVICE_ROLE_KEY\`.
3. So sánh kết quả với Supabase Dashboard: Auth, database grants, exposed PostgREST schemas, Edge Functions, scheduled jobs, cron, custom integrations và Vercel env. Repo-only scan **không đủ**.
4. DBA chạy \`sql/h72_preflight_READ_ONLY.sql\` trên **staging được duyệt**; ghi snapshot audit quyền H58/H68, RLS FORCE, function owner \`SECURITY DEFINER\`, các view/functions tham chiếu H58. Script này không thay đổi dữ liệu.
5. Xác minh quyền \`service_role\` và dependencies trước/sau H70 trên database clone. So sánh endpoint health, cron/job tests trước và sau khi chuyển quyền.
6. Thực hiện kế hoạch cutover/rollback với DBA, security và chủ sản phẩm ký duyệt. Tuyệt đối **không dùng script restore CI H71** trên staging; nó tạm cấp lại quyền rộng nhằm đối chiếu synthetic baseline, không có kiểm soát nghiệp vụ thật.
7. Mọi probe HTTP/JWT với ba teacher, outsider, coordinator, owner phải dùng **tài khoản staging riêng**, được phê duyệt. Không log JWT/secrets. H69 read-only probe còn cần xem xét response mã lỗi; một lời báo \`PASS\` tự khai báo không đủ.
8. Đóng 18 kiểm tra bằng bằng chứng xuất từ hệ thống thật cùng commit+project, hash SHA-256 và người kiểm chứng **độc lập**. H71 evidence gate chỉ xác minh cấu trúc và hash cục bộ, **không cấp quyền GO**.

## Quy định trạng thái và bảo vệ dữ liệu
- \`CI_DEPENDENCY_INVENTORY\`: chỉ là báo cáo static, có thể chỉ ra các điểm cần rà soát; không phải xác nhận không có phụ thuộc.
- \`CI_POSTGRES_CONTRACT\`: H70/H71 đã đạt trên DB tạm; không được chuyển thành \`SUPABASE_STAGING_PASS\`.
- \`SUPABASE_STAGING_LIVE\`: hiện **0/18**, vì chưa có project & tài khoản staging được xác thực trong lượt làm việc này.
- \`HUMAN_TEACHER_GOLD\`: **0**; không dùng dữ liệu giả để huấn luyện/chấm.
- \`LEARNER_AUTO_GRADING\`: **BLOCKED**, dù tất cả CI đều PASS.
- **Mọi PR H67–H72 vẫn DRAFT/UNMERGED.** Không chạy migration, không bật cờ H68/SQL, không deploy production.

## Tái kiểm tra từ GitHub Actions
Workflow \`.github/workflows/h72-dependency-evidence-ci.yml\`:
- Chạy 13 unit tests scanner.
- Chạy scan theo \`GITHUB_SHA\` và tạo \`reports/h72_dependency_inventory.json/.md\`.
- Xác nhận H71 evidence gate không báo GO khi dữ liệu staging còn thiếu.
- Đóng artifact gồm mã nguồn, báo cáo và \`h72_ci_receipt.json\` có SHA-256 của báo cáo.
- Báo cáo \`release_gate=NO_GO\` không đổi cho đến khi có quy trình duyệt độc lập.

**Điểm cần DBA kiểm tra thủ công:** \`src/lib/ielts-bank/server.ts\` sử dụng \`SUPABASE_SERVICE_ROLE_KEY\` cho question bank. Đây là quyền cao đang tồn tại trong code, nhưng **chưa có chứng cứ nó truy cập bảng H58**. Phải phân biệt việc sử dụng \`service_role\` ở module khác với phụ thuộc trực tiếp vào H58 trước khi thay quyền trong staging.
