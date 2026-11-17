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
- **Chưa chặn tự động** việc mở rộng `bankClient` gián tiếp của nhóm D; đây là phạm vi kỹ thuật cần làm tiếp trong H73/M02.

## Việc còn lại trong phạm vi kỹ thuật H73
1. M02: ràng buộc CI đối với 21 đường dẫn `bankClient` gián tiếp, không chỉ 11 tham chiếu service-role.
2. M03: rà luồng xác thực và ownership filter ở public/share/learner/admin API; ghi bằng chứng cụ thể, không khẳng định an toàn chỉ từ regex.
3. M04: tách khóa ký grammar ticket ra khỏi khóa service-role với kế hoạch chuyển đổi an toàn; **không đổi secret production** trong PR kiểm toán này.
4. M05: kiểm tra môi trường/Edge Functions/Workers/cron ngoài repository qua staging được phê duyệt, DBA xác nhận quyền SQL/RPC.

**Release gate:** NO_GO. H73 mới chốt static code review; 18/18 Supabase staging checks chưa có bằng chứng.
