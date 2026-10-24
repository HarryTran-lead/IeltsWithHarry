# Cấu trúc English Skill Lab

## Sơ đồ thư mục hiện tại

```text
src/
  app/
    (public)/              Trang giới thiệu, khóa học, trạng thái tài khoản
    admin/                 Thông báo CMS chưa bật
    app/[[...slug]]/       Cổng học viên demo với các đường dẫn /app/*
    globals.css            Design tokens, layout, responsive styles
  components/
    illustrations/         Mochi và minh họa học tập SVG gốc
    layout/                Header, sidebar, mobile nav, public layout
  features/
    dashboard/             Banner, lộ trình, mục tiêu, gợi ý, thành tích
    planner/               Danh sách task, biểu mẫu, trang planner
    learning/              6 hoạt động học mẫu và trang tiến độ
    demo/                  React store và đồng bộ localStorage
  lib/
    demo-data.ts           Giai đoạn, nội dung mẫu, task mẫu, kiểu dữ liệu
    utils.ts               Hàm ghép class
docs/
  STRUCTURE.md
```

## Luồng dữ liệu của bản thử

`demo-data.ts → DemoProvider → Dashboard / Planner / Learning → localStorage`

- `DemoProvider` là nguồn trạng thái chung cho task, bài đã nộp, mục tiêu ngày và nháp Writing.
- Khi hoàn tất task, mục tiêu ngày và XP demo được tính lại từ dữ liệu hiện có.
- Khi nộp bài Reading/Listening, kết quả được lưu và task gắn với bài đó được đánh dấu hoàn tất.
- Nội dung học, mốc trình độ và huy hiệu ban đầu là dữ liệu mẫu, không phải kết quả đánh giá thật.

## Các tuyến trang

| Nhóm     | Tuyến                                                                                                                      | Trạng thái                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Public   | `/courses`, `/courses/[slug]`, `/about`                                                                                    | Nội dung giới thiệu          |
| Account  | `/login`, `/register`, `/forgot-password`                                                                                  | Thông báo chưa bật đăng nhập |
| Student  | `/app/dashboard`, `/app/learn`, `/app/learn/[level]`                                                                       | Demo hoạt động               |
| Practice | `/app/lesson/[slug]`, `/app/vocabulary`, `/app/grammar`, `/app/reading`, `/app/listening`, `/app/writing`, `/app/speaking` | Bài mẫu hoạt động            |
| Planner  | `/app/planner`, `/app/progress`                                                                                            | Demo hoạt động               |
| Admin    | `/admin/*`                                                                                                                 | Thông báo chưa bật CMS       |

## Giai đoạn tiếp theo

1. **Dữ liệu và đăng nhập:** schema Supabase, Auth, RLS, Zod, hồ sơ học viên, lưu tiến độ trên máy chủ.
2. **Nội dung học:** mô hình `Path → Stage → Course → Unit → Lesson → Exercise`, nội dung dạng block, nhập CSV/JSON, nhiều bài cho mỗi cấp độ.
3. **Quản trị và media:** CMS phân quyền, quy trình xuất bản, upload R2 qua signed URL.
4. **Chất lượng:** test nghiệp vụ, test E2E, kiểm tra đa thiết bị, trợ năng và hiệu năng.

Kiến trúc hiện tại cố ý giữ giao diện tách khỏi nguồn dữ liệu, để thay demo store bằng dịch vụ máy chủ mà không viết lại toàn bộ màn hình.
