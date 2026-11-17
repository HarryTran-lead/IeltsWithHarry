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

## H74/M02 — Bộ chạy hai tài khoản trên staging (chuẩn bị, chưa thực thi live)

- `scripts/h74_staging_two_user_readonly.mjs` là công cụ **tùy chọn**, bình thường trả `NOT_TESTED` mà không gọi mạng. Chỉ chạy khi `H74_ALLOW_READONLY_STAGING=YES_AUTHORIZED_STAGING_TWO_USER_READONLY` và có **bảy cấu hình staging** riêng: project ref, URL, publishable key, JWT A/B, UUID attempt A/B.
- Trước kết nối, công cụ kiểm tra `H74_STAGING_URL` đúng `https://<staging-ref>.supabase.co/`, không có path/query/credentials; lấy production ref từ `src/lib/deployment-environment.ts` để **từ chối production**.
- Chỉ dùng **GET**, không import service-role và không ghi thông tin nhận dạng, token, response body hay bài viết vào logs. Gọi `/auth/v1/user` xác nhận hai JWT của tài khoản staging khác nhau; đòi hỏi cả hai tài khoản phải nhìn thấy bài làm thử **của chính mình**.
- Tiếp đó thử A đọc bài B, B đọc bài A, anonymous đọc bài B và JWT sai đọc bài A. Chỉ ghi mã check không chứa PII. Nếu bài làm không tồn tại, không thể đọc cả own row hoặc JWT không hợp lệ thì **FAIL**, tránh false-positive “không lộ dữ liệu”.
- Dù đạt PASS ở staging, công cụ vẫn trả `release_gate=NO_GO` và `h71_live_checks_approved=0` cho đến khi evidence được gắn SHA/DB project, người kiểm chứng độc lập được xác nhận.
- `tests/test_h74_staging_preflight.py` thêm **7** unit tests không gọi mạng: mặc định từ chối, thiếu credentials, production ref, URL sai, token/training IDs trùng và HTTP chỉ GET. H74 CI chạy tổng **15 unit tests** (8 M01 + 7 M02) và **10 hợp đồng PG16 cô lập**.
- Để thực thi thật, chỉ dùng tài khoản/bài làm thử được cấp phép trên **staging riêng**; không sử dụng tài khoản học viên thực hoặc token production. **Chưa thực hiện** ở lượt này.

## H74/M03 — DBA catalog chỉ đọc cho thực tế Supabase (chuẩn bị)

- `sql/h74_dba_catalog_READ_ONLY.sql` là bộ truy vấn **catalog-only**, không tạo/sửa/xóa record và không đụng vào dữ liệu bài viết. Nó trả về nhãn `NO_GO` dù có thể chạy thành công.
- Liệt kê RLS/force RLS/owner trên `ielts_attempts`, `writing_grading_jobs`, `writing_grading_results`, `writing_deep_reports`, `speaking_coaching_jobs`, `speaking_mock_sessions`, `profiles` và các bảng H58/H68.
- Liệt kê quyền schema, SELECT, INSERT, UPDATE, DELETE cho `anon`, `authenticated`, `service_role`, `r19_h70_executor`; nếu bảng không tồn tại, kết quả ghi `MISSING` thay vì lặng lẽ PASS.
- Liệt kê các RPC `is_admin`, H68, Writing và Speaking (owner, `SECURITY DEFINER`, `search_path`, privilege EXECUTE) và policy tương ứng. **Không** kết luận một RPC là an toàn chỉ nhờ có `security_definer`; reviewer phải đọc điều kiện nội bộ và kiểm tra dữ liệu thật.
- CI H74 chạy syntax/smoke SQL này trên PG16 disposable **sau khi áp dụng fixture H69/H70**, không chạy trên staging. Kiểm thử Python bổ sung 3 điều kiện tĩnh: không có lệnh SQL mutate, có danh sách bảng/RPC chính, không đọc trực tiếp hàng dữ liệu riêng tư từ H58.
- Tổng kiểm thử Python H74 đã soạn là **18** (8 M01 + 7 M02 + 3 M03), cộng **10** kiểm tra DB cô lập. Các con số này khác và **không thay thế 18 mục staging acceptance** của H71.
- Muốn chạy trên staging cần DBA xác nhận bằng chứng project khác production và quyền truy vấn chỉ đọc; đầu ra chỉ lưu trong kho bằng chứng được kiểm soát, không in token hay thông tin học viên.

## H74/M04 — Kiểm thử handler hai tài khoản (mô phỏng có kiểm soát)

- `tests/h74-api-owner-isolation.test.ts` dùng Vitest để gọi **handler GET thật** của `/api/ielts/bank/writing-grading` và `/api/ielts/bank/speaking-coaching` trong môi trường Node. Module xác thực và Supabase client được thay bằng database giả có đúng hai học viên A/B; không cần bất kỳ credentials hay network.
- Kiểm tra **12 trường hợp**: 9 tình huống GET/đăng nhập ban đầu (A/B, job/result bị gắn sai chủ sở hữu), cộng 3 tình huống POST `retry` Writing: A không được thử lại job của B; B chỉ được đổi trạng thái job của mình với cả điều kiện `user_id` trên `UPDATE`; và bản ghi job có `attempt_id` hợp lệ nhưng owner sai phải bị từ chối. Với các ID thuộc người khác, handler phải từ chối **trước khi** cập nhật hoặc truy vấn nội dung job riêng tư.
- `state.trace` ghi lại bảng và điều kiện `.eq(...)` mà handler thực sự truyền vào mô phỏng; regression test sẽ thất bại nếu mất `user_id` ở các bước nhạy cảm.
- H74 CI cài `npm ci` theo lockfile và chạy `npx vitest run tests/h74-api-owner-isolation.test.ts`. Chỉ được ghi **PASS** khi log Actions của đúng SHA xác nhận.
- Đây là **route-handler behavioral simulation**, mạnh hơn việc kiểm tra chuỗi nguồn nhưng vẫn không chứng minh Supabase Auth xác thực JWT, quyền SELECT/RLS thật, PostgREST behavior, revocation, hàng đợi bị thay đổi đồng thời, hoặc triển khai production. Toàn bộ **18/18 điều kiện staging vẫn NOT_TESTED**.
- Một số endpoint khác như public shares, cron và admin actions sẽ cần bằng chứng riêng trên staging; không tự nhận 12 test là bao phủ tất cả API.

## H74/M05 — Ngăn dùng nhầm khóa quyền cao và JWT sai dự án

- `scripts/h74_staging_two_user_readonly.mjs` hiện **kiểm tra offline trước mọi request**: API key phải thuộc dạng `sb_publishable_...` hoặc legacy anon JWT có `ref` trùng staging; không chấp nhận `sb_secret_...`, service-role JWT hay arbitrary token.
- Hai JWT người học phải có claim `role=authenticated`, `aud=authenticated`, `iss=https://<staging-ref>.supabase.co/auth/v1`, `sub` UUID hợp lệ, `exp` còn hạn và người dùng A/B khác nhau. **Giải mã claim trước mạng không chứng minh chữ ký**: GET `/auth/v1/user` từ chính dự án staging vẫn là xác minh phía server bắt buộc.
- Cải tiến bảo vệ này từ chối khóa JWT của dự án khác, token hết hạn, token service-role bị gắn nhầm thành JWT của học viên và key có đặc quyền trước khi gửi request.
- `tests/test_h74_staging_preflight.py` thêm **7 kiểm thử** từ chối credentials có nguy cơ; tổng test H74 Python hiện **25** (11 M01/M03 + 14 preflight M02/M05). 12 Vitest API-handler simulation và 10 check PostgreSQL cô lập là các loại kiểm thử khác nhau, không tính chung thành số chứng cứ staging.
- **Giới hạn:** code không thể xác định chắc một giá trị `sb_publishable_` có đúng môi trường cho đến khi Supabase xác minh. Không đọc secret manager; chưa chạy live probe; 18/18 staging vẫn NOT_TESTED, release NO_GO.

## M02 — Những kiểm tra staging chưa tiến hành

- Dùng hai tài khoản học viên giả định A và B trên một **Supabase staging được phê duyệt**, xác minh getUser/session/JWT, bài làm của A không thể bị đọc/sửa bởi B.
- Kiểm tra admin/learner và public share: token sai/hết hạn/đã thu hồi, tài khoản bị đình chỉ.
- DBA kiểm tra H58/H68 `service_role`, RLS, EXECUTE, SECURITY DEFINER, `search_path` trên **catalog thực tế**; không tự động chạy SQL thay đổi quyền.
- Ghi project ref, SHA, timestamp, kết quả và reviewer độc lập; không lưu mật khẩu, token, secret, bài viết hay dữ liệu cá nhân vào artifact.
- Giữ các ràng buộc `NO_GO` và Draft trước khi có evidence staging.

**Chưa có bất kỳ kiểm tra trực tiếp Supabase staging nào thuộc H74/M01.**
