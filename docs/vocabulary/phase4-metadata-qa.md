# Vocabulary V2 — Phase 4 metadata và QA

## Phạm vi

Migration `202610280004` chỉ mở rộng bộ IELTS 5.000 từ. `definition_vi` chứa nguyên văn cột `Definition` tiếng Việt từ 25 CSV; `definition_en` được giữ để caller cũ tiếp tục hoạt động. Tám nhãn từ loại tiếng Việt được ánh xạ ổn định sang `pos_standard`. `qa_flags` lưu tín hiệu rà soát từ archive đã xác minh SHA-256, không tự sửa nội dung.

`cefr_level`, `learning_stage` và `learning_priority` vẫn để trống. Band hiện có là ước lượng từ tần suất và không được dùng để tự suy ra CEFR. Toàn bộ 5.000 dòng vẫn mang `content_status=source_unreviewed`; người biên tập cần duyệt nghĩa, ví dụ và mức độ trước khi đổi trạng thái này.

## Độ phủ và hàng chờ biên tập

| Chỉ số | Giá trị |
| --- | ---: |
| Dòng nguồn và nghĩa Việt | 5.000 / 5.000 |
| Từ loại đã chuẩn hóa | 5.000 / 5.000 |
| Nhóm từ loại | 8 |
| Dòng có ít nhất một tín hiệu QA | 1.645 |
| Ví dụ chứa chữ `nine` | 775 |
| Nghĩa ngắn dưới 10 ký tự chuẩn hóa | 703 |
| Không thấy nguyên dạng từ trong ví dụ | 394 |
| Ví dụ trùng trong cùng dòng hoặc giữa các dòng | 0 |
| CEFR / stage / priority được gán | 0 / 0 / 0 |
| Dòng được người biên tập duyệt | 0 |

Các tín hiệu có thể chồng lấp. Ví dụ dùng dạng biến đổi của từ có thể bị gắn cờ “không thấy nguyên dạng”; cờ chỉ giúp xếp hàng kiểm tra, không chứng minh lỗi. Danh sách từng dòng và báo cáo JSON nằm ngoài repo tại `C:\Users\RAZER\Documents\ChatGPT\Vocab V2 Phase1 private\phase4\` vì chứa nội dung nguồn.

## Chạy lại và kiểm tra

`scripts/enrich-ielts-vocabulary-metadata.py` mặc định dry run, yêu cầu tên môi trường và project ref khớp danh sách cố định. Script đối chiếu hash archive, toàn bộ source key/hash, nghĩa Việt và từ loại trước khi ghi. `--apply` gửi các batch tối đa 100 dòng qua RPC dành riêng cho service role; RPC từ chối source row thay đổi hoặc đã được biên tập. Chạy lại sau khi hoàn tất phải báo `rows_needing_qa_update: 0`.

Không đưa archive hay file báo cáo chi tiết vào Git hoặc thư mục `public/`. Các trường nội dung nguồn, band gợi ý, trạng thái xuất bản và dữ liệu học viên không thuộc phần cập nhật này.
