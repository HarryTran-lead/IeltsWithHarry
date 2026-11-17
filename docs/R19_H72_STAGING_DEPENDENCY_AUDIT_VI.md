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
- Chạy 25 unit tests scanner (số trường hợp đã soạn trong nhánh, trạng thái PASS phụ thuộc CI).
- Chạy scan theo \`GITHUB_SHA\` và tạo \`reports/h72_dependency_inventory.json/.md\`.
- Xác nhận H71 evidence gate không báo GO khi dữ liệu staging còn thiếu.
- Đóng artifact gồm mã nguồn, báo cáo và \`h72_ci_receipt.json\` có SHA-256 của báo cáo.
- Báo cáo \`release_gate=NO_GO\` không đổi cho đến khi có quy trình duyệt độc lập.

**Điểm cần DBA kiểm tra thủ công:** \`src/lib/ielts-bank/server.ts\` sử dụng \`SUPABASE_SERVICE_ROLE_KEY\` cho question bank. Đây là quyền cao đang tồn tại trong code, nhưng **chưa có chứng cứ nó truy cập bảng H58**. Phải phân biệt việc sử dụng \`service_role\` ở module khác với phụ thuộc trực tiếp vào H58 trước khi thay quyền trong staging.

## Kiểm tra tính toàn vẹn checkout trước khi quét (H72 bổ sung)
- Scanner từ chối tạo báo cáo khi bất kỳ file được Git theo dõi nào bị sửa hoặc đã stage nhưng chưa commit. Commit SHA khớp **không đủ** nếu nội dung working tree đã thay đổi.
- File báo cáo **chưa được Git theo dõi** có thể tồn tại mà không làm kiểm toán thất bại; test độc lập bao phủ trường hợp này.
- Đây vẫn chỉ là kiểm tra mã nguồn được checkout, không chứng minh không có runtime dependencies, job bên ngoài, dịch vụ triển khai ngoài Git, hay xác nhận bảo mật trên Supabase staging.
- Khi gặp `tracked working tree differs from checked-out HEAD`: không dùng báo cáo đó làm evidence; tạo checkout sạch đúng commit và chạy lại CI. **Không** tự bật migration hoặc thay khóa.

## H72 mở rộng coverage và fail-closed (tiếp tục)
- Quét thêm file `.jsx`, `.mts`, `.cts`, `.json`, `.prisma` và các vị trí runtime `src/pages/`, `workers/`, `functions/`, `app/`, `lib/`, `api/`, `pages/`, middleware, bên cạnh `src/app/` và `src/lib/`.
- Các phần mở rộng trên **không** chứng minh có hay không có phụ thuộc khi mã nguồn được sinh tự động, truy vấn SQL ghép chuỗi, hoặc khi services bên ngoài repository đang chạy.
- Kết quả `PARTIAL_STATIC_INVENTORY` do file quá lớn/bị bỏ qua giờ trả mã thoát **3 (không hoàn tất)** thay vì 0. Kết quả `INVENTORY_INCOMPLETE` tiếp tục trả 3. Chỉ `STATIC_INVENTORY_PRODUCED` trả 0 và ngay cả khi đó vẫn là **STATIC ONLY / NO_GO**.
- Hai unit tests bổ sung kiểm tra runtime layouts/extensions và exit code khi input quá lớn.
- Artifact CI chỉ được xem là bằng chứng về mã nguồn theo SHA, **không phải** bằng chứng DBA/RLS/JWT/Supabase staging thật, và không được dùng để mở quyền chấm cho learner.

## Kiểm tra index flags che giấu thay đổi (H72 nâng cấp)
- `git status --porcelain` có thể bỏ qua một file bị thay đổi nếu index gắn `assume-unchanged` hoặc `skip-worktree`. Do đó việc kiểm tra working tree thông thường chưa đủ để tin rằng source khớp commit SHA.
- Scanner bây giờ kiểm tra toàn bộ entry được Git theo dõi bằng `git ls-files -v -z --cached` và **từ chối** các cờ `assume-unchanged` / `skip-worktree`, kể cả khi báo cáo `git status` sạch. Hạn chế này có thể dẫn tới fail-closed trong sparse checkout; dùng checkout bình thường để kiểm toán.
- Có thêm 2 unit tests cô lập cho hai cờ này; bộ test được mở rộng tiếp ở mục dưới. Đây chỉ là coverage của chính scanner, không phải bằng chứng rằng hệ thống staging đã được kiểm tra.

## H72 chống báo cáo sai khi quét rỗng và thay đổi đồng thời
- Sau khi quét xong, scanner **kiểm tra lại HEAD và trạng thái tracked working tree**. Nếu source bị sửa, hoặc HEAD chuyển sang commit khác trong thời gian quét, kết quả bị từ chối **trước khi ghi file báo cáo**.
- Hai regression tests tạo tình huống source bị thay đổi và HEAD đổi sau khi đã tính xong findings, xác nhận công cụ trả mã 2 và **không** tạo báo cáo JSON/Markdown.
- Một checkout không có bất kỳ file mã nguồn đủ điều kiện nào **không được coi là kiểm toán thành công**. Scanner trả `INVENTORY_INCOMPLETE`, lỗi `NO_ELIGIBLE_SOURCE_FILES` và mã thoát 3; regression test kiểm chứng trường hợp chỉ có README.
- Tổng bộ scanner hiện có **25 unit tests được soạn**. CI của HEAD mới nhất và workflow H72 chuyên biệt vẫn cần bằng chứng PASS. Không nâng số lượng này thành bằng chứng staging thật; `NO_GO` và 0/18 kiểm tra staging không đổi.

## H72 bổ sung: đường dẫn nguồn không theo cấu trúc chuẩn
- Trước thay đổi này, scanner bỏ qua hoàn toàn các file nguồn được Git theo dõi ngoài các thư mục đã định sẵn như `src/`, `api/`, `workers/`. Vì vậy câu báo cáo `STATIC_INVENTORY_PRODUCED` có thể thiếu file runtime ở monorepo (`packages/`, `modules/`) hoặc root config.
- Hiện scanner đọc **mọi file nguồn được Git theo dõi có đuôi được nhận diện**, kể cả `.vue`, `.svelte`, `.astro`, không phân biệt vị trí. Nguồn ngoài các nhóm đã biết nhận `scope=OTHER_SOURCE` và khi có dấu hiệu H58/service_role/RPC sẽ được đưa vào `unclassified_source_reference_paths` để rà soát thủ công; **không tự kết luận là không liên quan runtime**.
- Các dependency lockfile phổ biến (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`) được loại riêng với `reason=DEPENDENCY_LOCKFILE_EXCLUDED` trong `coverage.skipped`, không âm thầm bỏ qua.
- Hai unit tests mới kiểm tra đường dẫn ngoài scope/đuôi `.vue` và việc loại lockfile có ghi nhận lý do. Tổng bộ là **25** trường hợp đã viết, kết quả PASS cuối cùng phải đối chiếu CI run đúng commit SHA.
- `coverage.complete=true` chỉ có nghĩa **đã quét hết các file đủ điều kiện theo quy tắc tĩnh**, không có nghĩa không còn dependency động, service bên ngoài, SQL build lúc chạy hoặc chưa kiểm chứng trên Supabase thật.

## H72 giữ lại artifact kiểm toán khi CI thất bại
- Trước đây bước tải artifact chỉ chạy khi toàn bộ job thành công, gây mất báo cáo JSON/Markdown khi scanner chủ động từ chối một kết quả thiếu coverage.
- Workflow hiện dùng `if: always()` với `if-no-files-found: warn` để giữ lại **bất kỳ báo cáo nào đã sinh ra** cho việc chẩn đoán. Điều này **không** biến job lỗi thành PASS và không thay đổi kết quả kiểm duyệt staging hay `release_gate=NO_GO`.
- Một unit test mới kiểm tra cấu hình thu thập báo cáo khi thất bại. Tổng cộng **25** bài kiểm thử scanner/workflow đã soạn; trạng thái PASS phải được đối chiếu với CI đúng commit.
