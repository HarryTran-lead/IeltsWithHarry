# Cấu trúc English Skill Lab

## Các tầng chính

```text
src/app/                 Định tuyến Next.js, kiểm tra phiên trên server
src/components/          Giao diện chung, thiết kế, minh họa
src/features/            Từng miền nghiệp vụ: auth, dashboard, planner, learning, admin, demo
src/features/content-lab/  Bản thử luyện tập từ gói JSON do người soạn nạp
src/features/notebook/     Nút nổi ghi nhanh, sổ tay, lịch sử học
src/content/             Gói nội dung JSON mẫu cho Content Lab
src/lib/supabase/        Tạo client cho trình duyệt/server
src/lib/validation/      Kiểm tra dữ liệu nhập
supabase/migrations/     Bảng, index, RLS, hàm chấm điểm
supabase/seed.sql        Nội dung học gốc; không thêm tiến độ giả cho học viên
tests/                  Kiểm tra đầu vào, nghiệp vụ và migration/RLS bằng PGlite
.github/workflows/      CI cho typecheck, lint, test, build
```

## Hai chế độ chạy tách biệt

**Demo** (`NEXT_PUBLIC_DEMO_MODE=true`): `demo-data.ts → DemoProvider → UI → localStorage`. Dùng để xem giao diện và thử các thao tác. Task/XP/streak ban đầu chỉ là dữ liệu mẫu.

**Live** (`NEXT_PUBLIC_DEMO_MODE=false` và có Supabase URL/publishable key): Supabase Auth xác thực người học; server bảo vệ `/app` và `/admin`; UI đọc/ghi dữ liệu cá nhân qua Supabase với RLS. Grammar/Reading/Listening gửi lựa chọn tới `submit_exercise` trong Postgres. Hàm này chấm bằng answer key riêng, lưu kết quả và cập nhật task liên kết trong cùng giao dịch. Bài học xuất bản ở `/app/lesson/[slug]` đọc nội dung thật từ database.

Đăng nhập live hỗ trợ email/mật khẩu, Google OAuth và số điện thoại/mật khẩu. Hai lựa chọn Google/điện thoại chỉ hiển thị khi bật cờ môi trường tương ứng sau khi cấu hình provider trong Supabase. Email xác nhận và Google OAuth quay về `/auth/callback`; đăng ký điện thoại xác minh SMS qua OTP. Vai trò admin được kiểm tra từ `admin_users` qua `is_admin()`, không lấy từ metadata do người dùng gửi khi đăng ký.

**Sổ tay**: nút nổi trong AppShell mở ghi chú/từ vựng từ mọi trang. Demo lưu `notebook_entries` và `study_visits` trong localStorage riêng; live dùng migration `202610240002_notebook.sql` với RLS. Trang `/app/notebook` ghép mục đã lưu, lần mở trang học và bài luyện đã nộp thành dòng thời gian. Lần mở trang chỉ ghi khi chuyển vào một trang học; việc xem dashboard/planner/sổ tay không tạo lịch sử học giả.

Chưa cấu hình Supabase và đã tắt demo thì giao diện hiển thị trạng thái cần thiết lập. Không có dữ liệu mẫu nào được ghi vào tài khoản thật.

## Ranh giới quyền

Luồng trang: `/` và `/courses` dành cho Guest; `/login` chuyển sang học viên hoặc admin demo; `/app/*` là khu học viên mà cả student và admin đều dùng được; `/admin/*` là khu biên tập chỉ dành cho admin. Server kiểm tra vai trò trước khi dựng trang. Trong demo, cookie chỉ chọn vai trò trình diễn và nội dung biên tập được lưu trong localStorage của cùng trình duyệt. Trong live, Supabase Auth xác thực tài khoản, `is_admin()` xác định admin, RLS bảo vệ dữ liệu; người dùng không tự chọn vai trò admin.

Admin live có sidebar: Tổng quan, Lộ trình & bài học, sáu kỹ năng và Media library. Mỗi bài học có `lesson_materials.content` theo schema Zod trong `src/lib/skill-material.ts`; trắc nghiệm và answer key vẫn ở bảng riêng. Form Reading nhập passage; Listening nhập transcript và audio; Writing nhập đề, số từ, mẫu, checklist; Speaking nhập đề, giờ chuẩn bị, mẫu, checklist; Grammar nhập quy tắc và ví dụ; Vocabulary nhập danh sách từ, yêu cầu đặt câu và các câu được chấp nhận. Hình minh họa có URL, alt và nút upload. Media public chỉ được admin ghi qua Storage RLS. Admin xem trước cả lesson nháp, học viên chỉ mở được lesson đã xuất bản. Bài Writing lưu bản nháp theo lesson; Speaking ghi âm tại tab trình duyệt và không lưu lên server.

| Dữ liệu | Khách | Học viên | Admin |
| --- | --- | --- | --- |
| Stage, nội dung đã xuất bản | Đọc | Đọc | Đọc/sửa |
| Course/unit/lesson nháp | Không | Không | Đọc/sửa |
| Answer keys | Không | Không | Đọc/sửa |
| Profile, task, attempt, draft, sổ tay của người khác | Không | Không | Không qua client |
| Profile, task, attempt, draft, sổ tay của mình | Không | Đọc/ghi theo chính sách | Theo tài khoản của mình |

`admin_users` không cấp quyền ghi cho frontend. Chỉ chủ project thêm admin qua SQL editor. Client không được tự gửi điểm hay XP; score do database quyết định. Khi bổ sung upload, cần signed URL và kiểm tra định dạng/kích thước ở server.

## Triển khai tiếp theo

1. Tạo project Supabase, chạy migration và seed; kiểm tra Auth/PostgREST và RLS bằng hai tài khoản riêng trên dịch vụ thật.
2. Nâng CMS để preview bài nháp trước khi xuất bản và nhập nội dung hàng loạt.
3. Lưu bản ghi Speaking trong R2 private; mở rộng nội dung từng stage và kiểm tra trên thiết bị di động.
4. Thêm E2E auth/planner/exercise và cơ chế email/AI nếu thực sự cần.
