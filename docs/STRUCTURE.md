# Cấu trúc English Skill Lab

## Các tầng chính

```text
src/app/                 Định tuyến Next.js, kiểm tra phiên trên server
src/components/          Giao diện chung, thiết kế, minh họa
src/features/            Từng miền nghiệp vụ: auth, dashboard, planner, learning, admin, demo
src/lib/supabase/        Tạo client cho trình duyệt/server
src/lib/validation/      Kiểm tra dữ liệu nhập
supabase/migrations/     Bảng, index, RLS, hàm chấm điểm
supabase/seed.sql        Nội dung học gốc; không thêm tiến độ giả cho học viên
tests/                  Kiểm tra đầu vào và nghiệp vụ nhỏ
.github/workflows/      CI cho typecheck, lint, test, build
```

## Hai chế độ chạy tách biệt

**Demo** (`NEXT_PUBLIC_DEMO_MODE=true`): `demo-data.ts → DemoProvider → UI → localStorage`. Dùng để xem giao diện và thử các thao tác. Task/XP/streak ban đầu chỉ là dữ liệu mẫu.

**Live** (`NEXT_PUBLIC_DEMO_MODE=false` và có Supabase URL/publishable key): Supabase Auth xác thực người học; server bảo vệ `/app` và `/admin`; UI đọc/ghi dữ liệu cá nhân qua Supabase với RLS. Grammar/Reading/Listening gửi lựa chọn tới `submit_exercise` trong Postgres. Hàm này chấm bằng answer key riêng, lưu kết quả và cập nhật task liên kết trong cùng giao dịch. Bài học xuất bản ở `/app/lesson/[slug]` đọc nội dung thật từ database.

Chưa cấu hình Supabase và đã tắt demo thì giao diện hiển thị trạng thái cần thiết lập. Không có dữ liệu mẫu nào được ghi vào tài khoản thật.

## Ranh giới quyền

| Dữ liệu | Khách | Học viên | Admin |
| --- | --- | --- | --- |
| Stage, nội dung đã xuất bản | Đọc | Đọc | Đọc/sửa |
| Course/unit/lesson nháp | Không | Không | Đọc/sửa |
| Answer keys | Không | Không | Đọc/sửa |
| Profile, task, attempt, draft của người khác | Không | Không | Không qua client |
| Profile, task, attempt, draft của mình | Không | Đọc/ghi theo chính sách | Theo tài khoản của mình |

`admin_users` không cấp quyền ghi cho frontend. Chỉ chủ project thêm admin qua SQL editor. Client không được tự gửi điểm hay XP; score do database quyết định. Khi bổ sung upload, cần signed URL và kiểm tra định dạng/kích thước ở server.

## Triển khai tiếp theo

1. Tạo project Supabase, chạy migration và seed; kiểm tra RLS bằng hai tài khoản riêng.
2. Nâng CMS để chỉnh vocabulary, preview bài nháp trước khi xuất bản và nhập nội dung hàng loạt.
3. Lưu bản ghi Speaking trong R2 private; mở rộng nội dung từng stage và kiểm tra trên thiết bị di động.
4. Thêm E2E auth/planner/exercise và cơ chế email/AI nếu thực sự cần.
