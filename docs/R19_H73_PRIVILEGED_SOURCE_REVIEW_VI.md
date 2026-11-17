# H73/M01 — Phân loại đường sử dụng quyền cao (chỉ kiểm toán kỹ thuật)

**DRAFT · STATIC ONLY · NO_GO · không triển khai/migration · không can thiệp Supabase thật**

## Nguồn bằng chứng
- H72 kiểm toán mã nguồn tại SHA `6782d0b3af36c54e4aee15ca6ad0f1044d32450c`, workflow chuyên biệt và Quality đều PASS.
- Hồ sơ xuất phát: `docs/R19_H72_STATIC_REVIEW_REGISTER_20261117.md` — 32 đường dẫn gắn dấu hiệu `service_role` hoặc `bankClient`.
- Phân loại ở đây dựa trên đọc 32 file nguồn được Git theo dõi tại SHA nêu trên; **không chứng minh** quyền DB/HTTP triển khai thật hoặc khả năng truy cập H58 qua RPC/SQL động.
- Chưa phát hiện tham chiếu *tĩnh trực tiếp* đến `r19_h58`/H68 RPC trong 32 file, nhưng **không được suy ra không có phụ thuộc runtime**.

## Kết quả phân loại sơ bộ (32/32 file)

| Nhóm | Số file | Ý nghĩa |
|---|---:|---|
| A — Tạo/sử dụng client với service-role trực tiếp | 7 | Ưu tiên kiểm tra quyền SQL/RPC và giới hạn đường gọi |
| B — Tham chiếu khóa cho cấu hình/ký token | 2 | Không tự coi là client DB; có rủi ro phụ thuộc khóa bảo mật |
| C — Test fixture chứa khóa giả | 2 | Không chứng minh quyền deployment |
| D — Import/gọi `bankClient` gián tiếp | 21 | Có thể kế thừa quyền cao, cần xác nhận auth và giới hạn truy vấn |
| **Tổng** | **32** | **Chưa có kết luận an toàn Supabase staging** |

### A. Trực tiếp sử dụng client/key quyền cao (7)
1. `services/audio-worker/worker.py` — worker lấy khóa từ môi trường và tạo Supabase client.
2. `services/speaking-cloudflare-worker/src/index.js` — worker gửi HTTP tới Supabase bằng service-role.
3. `src/app/(public)/notebook/share/[token]/page.tsx` — trang share công khai dùng service-role đọc notebook/pages, token UUID là cơ chế định tuyến truy cập.
4. `src/app/api/grammar/placement/route.ts` — sau khi xác thực và chấm đạt, dùng service-role cập nhật `grammar_level_unlocks`.
5. `src/lib/ielts-bank/server.ts` — factory `bankClient()` tạo client service-role cho IELTS bank.
6. `src/lib/news/sync.ts` — `newsAdminClient()` tạo client service-role cho đồng bộ báo.
7. `src/lib/writing-grading/cloudflare-worker.ts` — worker chấm dùng service-role claim job và truy cập bảng grading.

### B. Tham chiếu khóa nhưng không tạo DB client tại vị trí đó (2)
- `src/lib/grammar/placement.ts` — HMAC ticket hiện có fallback `GRAMMAR_ASSESSMENT_SECRET || SUPABASE_SERVICE_ROLE_KEY`. **Rủi ro kiến trúc:** khóa quyền DB bị sử dụng lại làm khóa ký ticket; cần tách khóa theo môi trường, kiểm tra ticket cũ và staging trước khi sửa.
- `src/lib/deployment-environment.ts` — kiểm tra có khóa server-side cho preview live; đây là điều kiện cấu hình, không phải một truy vấn H58.

### C. Chỉ file kiểm thử (2)
- `services/audio-worker/test_worker.py`
- `services/speaking-cloudflare-worker/src/index.node-check.mjs`

### D. Dùng `bankClient` gián tiếp (21)
- Public share: `src/app/(public)/reading/share/[token]/page.tsx`
- Admin API: `src/app/api/admin/ai-content-factory/route.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/admin/vocabulary-phase5/route.ts`
- IELTS Bank API: `src/app/api/ielts/bank/{admin,attempt,catalog,library,review-highlights,scheduled,share,speaking-coaching,writing-feedback,writing-grading,writing-insights,writing-review,writing-source-facts}/route.ts`
- Khác: `src/app/api/progress/insights/route.ts`, `src/app/api/progress/route.ts`, `src/app/api/streak-leaderboard/route.ts`, `src/lib/writing-grading/server.ts`

**Lưu ý:** Dấu hiệu `viewer()` trong các route chỉ cho thấy có gọi hàm xác thực, **không tự chứng minh** từng truy vấn đã lọc theo user hoặc được phép chạy bằng service-role. Mọi route lấy dữ liệu theo owner và các quyền admin phải được rà soát riêng.

## Bổ sung CI H73/M01
- `scripts/h73_privilege_surface_gate.py` dùng lại scanner H72 trên đúng Git SHA, kiểm tra trạng thái Git trước và sau khi quét.
- Danh sách **11 đường dẫn có token `service_role`** (nhóm A+B+C) được cố định như **vị trí đã quan sát**, KHÔNG phải whitelist cấp phép.
- Nếu xuất hiện đường dẫn mới dùng `service_role`, một đường dẫn biến mất nhưng baseline chưa cập nhật, hoặc coverage của H72 không đầy đủ: trả lỗi, giữ `NO_GO`.
- Tình trạng matching baseline **không** cấp phép merge, bật chấm tự động, thay đổi secret hoặc tuyên bố có quyền DB phù hợp.
- **H73/M02 đã bổ sung kiểm soát tĩnh** cho 21 vị trí `bankClient` gián tiếp và 1 vị trí factory `createSupabaseClient`: thay đổi đường dẫn mới hoặc mất đường dẫn đã lập danh sách làm CI thất bại. Đây vẫn chỉ là kiểm tra biểu thức tĩnh, không chứng minh quyền runtime.

## H73/M02 — Hàng rào CI cho client gián tiếp (đã thực hiện trên nhánh Draft)
- Nguồn snapshot: 32 file từ H72. Có **11 file** chứa dấu hiệu `SERVICE_ROLE_REF`, **22 file** có dấu hiệu `POSSIBLE_SERVICE_CLIENT` (bao gồm factory), hợp của hai tập là **32 file**. Trong 22 vị trí possible-client, **21 vị trí** chỉ đi qua `bankClient` mà không nhắc trực tiếp service-role.
- `BASELINE_INDIRECT_BANK_CLIENT_PATHS` lưu 21 path; `BASELINE_POSSIBLE_CLIENT_PATHS` là 21 path cộng factory `src/lib/ielts-bank/server.ts`.
- `scripts/h73_privilege_surface_gate.py` xuất `observed_possible_client_paths`, `observed_indirect_bank_client_paths`, `unreviewed_new_client_paths`, `stale_client_baseline_paths`. Có client mới, đường dẫn cũ biến mất, hoặc H72 báo coverage thiếu → `STATIC_BASELINE_DRIFT`, exit code 3.
- Workflow `.github/workflows/h73-privileged-source-ci.yml` kiểm tra số lượng 11/22/21/32, từ chối thay đổi chưa rà soát và luôn giữ `NO_GO`. Đã thêm 6 regression tests, tổng cộng **13** bài H73.
- Run H73 đầu tiên có cả 13 kiểm thử đạt: https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44084261046 (SHA `c105dc5d4c0258a399018aa48624967339a115c0`). Các commit tiếp theo cần chạy lại CI tại đúng SHA.
- **Giới hạn:** rule `POSSIBLE_SERVICE_CLIENT` của H72 hiện phát hiện `bankClient(...)` và `createSupabaseClient(...)`; không chứng minh luồng import gián tiếp, tên alias khác, kết quả truy vấn, ownership filter, quyền SQL thật hoặc runtime access. Một baseline khớp **không** có nghĩa là an toàn.

## Ghi nhận thay đổi sau M04 (không sửa snapshot H72)
- Danh sách **32** của H72 là hồ sơ lịch sử đúng SHA cũ. M04 xóa tham chiếu service-role khỏi `src/lib/grammar/placement.ts`, do đó snapshot sau M04 còn **10** đường dẫn role, **22** đường dẫn possible-client, hợp **31** đường dẫn. Không có thay đổi nào đến khóa/migration thực tế của production.
- Tên `GRAMMAR_ASSESSMENT_SECRET` được cấu hình trên từng môi trường trước khi triển khai thì khóa ký mới mới hoạt động ở live; nếu thiếu hoặc yếu, Grammar GET/POST lỗi đóng (503/không phát ticket).
- CI cần đối chiếu commit cuối của H73/M04; đây là một bước kỹ thuật khác với kiểm thử tài khoản staging.

## Việc còn lại trong phạm vi kỹ thuật H73
1. M03: rà luồng xác thực và ownership filter ở public/share/learner/admin API; ghi bằng chứng cụ thể, không khẳng định an toàn chỉ từ regex.
2. M04: **đã hoàn thành phần mã nguồn** tách Grammar ticket khỏi service-role và 7 Vitest về key/ticket; triển khai secret mới và thử nghiệm trên staging vẫn **chưa thực hiện** (xem `docs/R19_H73_M04_GRAMMAR_SECRET_ISOLATION_VI.md`).
3. M05: kiểm tra môi trường/Edge Functions/Workers/cron ngoài repository qua staging được phê duyệt, DBA xác nhận quyền SQL/RPC.


## H73/M05 — Private workers và kiểm soát cấu hình runtime (chỉ static)
- `scripts/writing-grading-worker.ts` và `scripts/speaking-coaching-worker.ts` là **private runtime workers** (Supabase service role, RPC claim/finish). H72 trước đây xem chung `scripts/` là operational nên hai file này chưa xuất hiện trong danh sách runtime.
- M05 phân loại hai entrypoint này là `APPLICATION_RUNTIME`; `tests/test_h72_dependency_audit.py` có test hồi quy. H73 baseline role tăng từ **10 lên 12**, possible client vẫn **22**, hợp tập thành **33 file**. Đây là sửa lỗi bỏ sót, không chứng minh hai worker mới được triển khai.
- `scripts/h73_m05_runtime_boundary_gate.py` giám sát `wrangler.toml`, Cloudflare Speaking cron mỗi 2 phút, Writing proxy, `vercel.json`, audio Docker Compose, auth markers của scheduled endpoints, source RPC và hai worker nội bộ. Có cấu hình sai/lệch mới: CI fail closed.
- `tests/test_h73_m05_runtime_boundary_gate.py` thêm 9 bài kiểm tra. Workflow H73 chạy 29 unit tests H73 và 28 unit tests H72, kèm hai static scans, đóng báo cáo JSON SHA-bound.
- Tài liệu và checklist phụ thuộc runtime nằm tại `docs/R19_H73_M05_EXTERNAL_DEPENDENCIES_VI.md`. Không có kết luận về quyền trên Oracle, Cloudflare, Vercel hoặc Supabase staging; release NO_GO.

**Release gate:** NO_GO. H73 mới chốt static code review; 18/18 Supabase staging checks chưa có bằng chứng.
