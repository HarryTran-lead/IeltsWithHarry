# H73/M05 — Kiểm toán phụ thuộc runtime ngoài repository (chỉ đọc mã nguồn)

**DRAFT · TECHNICAL SCOPE · NO_GO · không truy cập live Vercel/Cloudflare/Oracle/Supabase**

## 1. Bằng chứng và giới hạn

Nguồn: nhánh `codex/r19-h73-service-role-reachability-20261117`, kiểm tra source trước/sau bằng Git SHA. Các worker, route, script và config dưới đây đã được mở đọc trực tiếp. **File tồn tại không chứng minh service đã deploy, nhận request hay sở hữu quyền tương ứng trên tài khoản cloud thật.**

Hai entrypoint thực thi riêng ở `scripts/writing-grading-worker.ts` và `scripts/speaking-coaching-worker.ts` bị H72 phân loại nhầm là `MILESTONE_OR_OPERATIONAL`. M05 cập nhật `scripts/h72_dependency_audit.py` để nhận diện đúng `APPLICATION_RUNTIME` và hồi quy test chống bỏ sót.

Do đó, bề mặt đã rà soát sau M04:
- `SERVICE_ROLE_REF`: **12** đường dẫn (trước M05 là 10)
- `POSSIBLE_SERVICE_CLIENT`: **22** đường dẫn, bao gồm 21 `bankClient` gián tiếp
- Hợp hai tập: **34?** Không: 12 + 22 - 1 file trùng `src/lib/ielts-bank/server.ts` = **33 đường dẫn**.
- H72 lịch sử ở SHA cũ có 32 đường dẫn; M04 bỏ fallback Grammar (31); M05 sửa 2 worker bị bỏ sót (33). Không sửa báo cáo lịch sử theo SHA cũ.

## 2. Các đường triển khai được nhận diện từ source

| Bề mặt | File làm bằng chứng | Cơ chế có trong mã nguồn | Chưa kiểm chứng |
|---|---|---|---|
| Cloudflare Speaking Worker | `services/speaking-cloudflare-worker/wrangler.toml`, `src/index.js` | Cron `*/2 * * * *`, `AI` binding, dùng Supabase `service_role`; endpoint POST `/run` có `WORKER_TRIGGER_SECRET` | Worker có thực sự deploy/enable, secret scope, cron invocations, quyền Supabase |
| Cloudflare Writing Proxy | `services/writing-cloudflare-proxy/wrangler.toml`, `src/index.js` | `workers_dev = true`, `AI` binding, POST phải có `PROXY_SECRET`; không tự xác thực JWT học viên ở worker | Proxy deployed URL, secret rotation, upstream callers, quotas |
| Docker audio worker | `services/audio-worker/compose.yaml`, `Dockerfile`, `worker.py` | Không publish ports trong compose, filesystem read-only, `no-new-privileges`; worker chạy với `SUPABASE_SERVICE_ROLE_KEY` trong env_file | VPS thực tế có dùng compose này không, env secret, egress, DB grants |
| Private Writing worker | `scripts/writing-grading-worker.ts` | Dùng service-role, RPC `writing_claim_grading_job` / `writing_finish_grading_job`; loopback local model | Process có đang chạy và dưới tài khoản nào, actual RPC grants |
| Private Speaking worker | `scripts/speaking-coaching-worker.ts` | Dùng service-role, RPC `speaking_claim_coaching_job` / `speaking_finish_coaching_job`; model cục bộ | Process có đang chạy, Oracle environment, ASR model, actual DB grants |
| Scheduled IELTS sync route | `src/app/api/ielts/bank/scheduled/route.ts` | POST bearer `IELTS_SYNC_SECRET || NEWS_SYNC_SECRET` trước `bankClient` | Lịch/nguồn nào gọi route; có đang dùng secret fallback không |
| Scheduled News sync route | `src/app/api/news/sync/route.ts` | POST với `NEWS_SYNC_SECRET` hoặc cùng origin + admin RPC `is_admin` | Admin auth/RPC grants, external cron caller và secret scope |
| Vercel config | `vercel.json`, `next.config.ts` | Chỉ có vùng `icn1`; **không khai báo `crons` trong `vercel.json`**; NextConfig kiểm tra cách ly môi trường | Cron được thiết lập qua dashboard/ngoài repo hay không |
| DB/RPC | `sql/h72_preflight_READ_ONLY.sql` | DBA read-only SQL liệt kê schema H58/H68, role, RLS/policy và RPC owner/grants | Đầu ra chạy thật từ staging, role `service_role`, function SECURITY DEFINER/search_path |

**Điểm cần xử lý kỹ thuật:** Fallback `IELTS_SYNC_SECRET || NEWS_SYNC_SECRET` cho phép hai integration dùng chung secret nếu IELTS key chưa có; chưa thay đổi vì không biết cấu hình deployed hiện tại. Nên kiểm tra secret đang được cấp cho caller nào ở staging rồi lên kế hoạch tách khóa riêng trước khi release.

**Điểm quan trọng:** Cloudflare Speaking cron gọi `scheduled()` theo binding, không đi qua xác thực HTTP `WORKER_TRIGGER_SECRET` của endpoint thủ công `/run`. Cần kiểm tra cả hai đường riêng, không coi bảo vệ của endpoint POST là bảo vệ toàn bộ cron.

## 3. Cổng CI M05 (chỉ kiểm tra cấu hình trong repo)

`scripts/h73_m05_runtime_boundary_gate.py` kiểm tra tĩnh:
- Hai `wrangler.toml` đã xác định, tên, entrypoint `src/index.js`, `AI` binding và cron của Speaking Worker; worker config mới sẽ gây drift.
- `vercel.json` không có cron nào mới mà chưa rà soát.
- Compose audio vẫn có cấu hình `read_only`, `no-new-privileges`, và không được thêm khai báo `ports`/host network/privileged.
- File worker/RPC/route còn tồn tại; các dấu hiệu guard/secret và RPC chưa bị xóa khỏi source.
- H72 phân loại đúng hai private workers là runtime và H73 xác nhận tập 12/22/21/33.
- Báo cáo JSON chỉ chứa đường dẫn/config metadata và mã lỗi, không chứa giá trị token/secret hoặc toàn bộ source.

**Giới hạn:** kiểm tra chuỗi + manifest KHÔNG tương đương phân tích AST, quyền JWT/RLS, validation egress, cloud deployment, kiểm thử penetration hay độc lập DBA. Mốc M05 đạt static CI không phải hoàn tất live staging.

## 4. Bằng chứng bắt buộc trên staging được cho phép (chưa thực hiện)

- Xác nhận project Supabase staging khác production; project ref, thời gian, người thực hiện, checksum code, không ghi secret vào artifact.
- Đối chiếu worker deployments, cron logs, tên biến môi trường (chỉ *có/không*, không in giá trị), issuer/receiver và mỗi role có quyền SELECT/EXECUTE gì trên H58/H68.
- Kiểm tra `service_role` trực tiếp và quyền execute của `writing_* / speaking_* / h68_*` RPC, function owner, `SECURITY DEFINER` và `search_path` bằng DB catalog read-only.
- Kiểm tra endpoint có/không bearer secret, expired/invalid secret, phản hồi 401/403 phù hợp, không lộ dữ liệu khi request không có user JWT.
- Kiểm tra cron Cloudflare scheduled path và POST `/run` riêng, quota/fail-open/fail-closed và rollback disable.
- Kiểm tra private worker không dùng nguồn secret production khi chạy staging, hoạt động và stop/restart/rollback.
- Xác nhận source CI artifact gắn đúng commit SHA và staging project ID, reviewer độc lập trên kỹ thuật triển khai.

Không có bất kỳ kiểm tra live nào đã được thực thi trong M05, do đó **18/18 staging acceptance = NOT_TESTED**, release gate **NO_GO**, PR vẫn **Draft**. Không có mốc kiểm duyệt giáo viên/nội dung học tập trong phạm vi này.
