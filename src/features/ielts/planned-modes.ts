import {
  AudioLines, BookOpen, BookText, ChartNoAxesCombined, CheckCheck, Clock3,
  FileQuestion, FileText, Layers3, ListChecks,
  MapPinned, Mic, NotebookPen, PenLine, RotateCcw, SearchCheck, SpellCheck,
  Volume2,
} from "lucide-react";
import type { IeltsSkill } from "./ielts-live-page";

export type PlannedMode = {
  id: string;
  title: string;
  detail: string;
  source: string;
  icon: typeof BookOpen;
  steps: [string, string, string];
  needs: string;
};

// These are curriculum designs, not active exercises. Keep them separate from live modes.
export const plannedModes: Record<IeltsSkill, PlannedMode[]> = {
  vocabulary: [
    { id: "match-meaning", title: "Ghép nghĩa", detail: "Ghép từ với định nghĩa đúng rồi xem lời giải cho từng lựa chọn.", source: "Kho từ có đáp án", icon: CheckCheck, steps: ["Chọn bộ từ", "Ghép từ và nghĩa", "Xem đáp án, lưu lỗi sai"], needs: "Bộ câu hỏi ghép từ được tạo và kiểm tra từ kho từ đã duyệt." },
    { id: "spelling", title: "Chính tả từ vựng", detail: "Nghe hoặc đọc gợi ý, viết đúng chính tả của từ mục tiêu.", source: "Từ vựng + audio hợp lệ", icon: SpellCheck, steps: ["Chọn nhóm từ", "Nghe gợi ý và nhập từ", "Đối chiếu đáp án"], needs: "Audio phát âm được phép sử dụng và đáp án chính tả chuẩn." },
    { id: "spaced-review", title: "Ôn tập ngắt quãng", detail: "Ôn lại những từ sắp quên theo lịch cá nhân.", source: "Kho từ đã lưu của bạn", icon: RotateCcw, steps: ["Xem từ đến hạn", "Tự nhớ trước khi lật thẻ", "Đánh dấu mức độ nhớ"], needs: "Lịch ôn và trạng thái nhớ được lưu theo tài khoản." },
  ],
  grammar: [
    { id: "topics", title: "Ngữ pháp theo chủ điểm", detail: "Học từng cấu trúc thường dùng trong IELTS với ví dụ và bài kiểm tra ngắn.", source: "Bài học biên soạn", icon: BookText, steps: ["Chọn chủ điểm", "Đọc quy tắc và ví dụ", "Làm bài kiểm tra"], needs: "Bài giảng, ví dụ và câu hỏi được biên tập, duyệt đáp án." },
    { id: "gap-fill", title: "Điền từ vào câu", detail: "Chọn dạng từ hoặc cấu trúc phù hợp với ngữ cảnh.", source: "Ngân hàng câu có đáp án", icon: PenLine, steps: ["Đọc câu", "Điền từ còn thiếu", "Xem giải thích"], needs: "Ngân hàng câu hỏi và đáp án theo từng cấu trúc ngữ pháp." },
    { id: "multiple-choice", title: "Trắc nghiệm ngữ pháp", detail: "Phân biệt các cấu trúc dễ nhầm qua câu hỏi nhiều lựa chọn.", source: "Ngân hàng câu có đáp án", icon: ListChecks, steps: ["Chọn chủ điểm", "Trả lời câu hỏi", "Xem lý do đúng sai"], needs: "Câu hỏi có phương án nhiễu và giải thích được biên tập." },
    { id: "error-correction", title: "Sửa lỗi trong câu", detail: "Tìm lỗi ngữ pháp trong câu và thử viết lại cho đúng.", source: "Bài tập biên soạn", icon: SearchCheck, steps: ["Đọc câu có lỗi", "Chỉ ra và sửa lỗi", "Đối chiếu câu chuẩn"], needs: "Cặp câu lỗi/câu chuẩn cùng lời giải đã được kiểm tra." },
    { id: "sentence-transform", title: "Viết lại câu", detail: "Diễn đạt lại một ý bằng cấu trúc khác mà vẫn giữ nghĩa.", source: "Bài tập biên soạn", icon: FileText, steps: ["Đọc câu gốc", "Viết câu tương đương", "Đối chiếu các mẫu đúng"], needs: "Nhiều đáp án mẫu và tiêu chí tự đối chiếu cho câu mở." },
  ],
  reading: [
    { id: "true-false-not-given", title: "True / False / Not Given", detail: "Xác định thông tin đúng, sai hoặc không được nêu trong bài.", source: "Bài đọc + câu hỏi duyệt", icon: CheckCheck, steps: ["Đọc passage", "Tìm bằng chứng từng câu", "Xem đáp án và vị trí"], needs: "Passage hợp quyền và câu hỏi có bằng chứng chính xác." },
    { id: "matching-headings", title: "Matching headings", detail: "Ghép tiêu đề với ý chính của từng đoạn văn.", source: "Bài đọc + câu hỏi duyệt", icon: Layers3, steps: ["Đọc lướt từng đoạn", "Ghép heading", "Xem giải thích"], needs: "Passage nhiều đoạn và bộ heading có đáp án được duyệt." },
    { id: "matching-information", title: "Matching information", detail: "Tìm đoạn chứa mỗi chi tiết hoặc luận điểm được hỏi.", source: "Bài đọc + câu hỏi duyệt", icon: SearchCheck, steps: ["Xem câu hỏi", "Định vị đoạn chứa thông tin", "Kiểm tra bằng chứng"], needs: "Câu hỏi gắn với đoạn nguồn và giải thích đáp án." },
    { id: "multiple-choice", title: "Multiple choice", detail: "Trả lời câu hỏi về ý chính và chi tiết với các lựa chọn gần nghĩa.", source: "Bài đọc + câu hỏi duyệt", icon: ListChecks, steps: ["Đọc câu hỏi", "Chọn đáp án", "Xem dẫn chứng"], needs: "Bộ đáp án, phương án nhiễu và dẫn chứng trong bài." },
    { id: "summary-completion", title: "Summary completion", detail: "Điền từ còn thiếu vào bản tóm tắt dựa trên passage.", source: "Bài đọc + tóm tắt duyệt", icon: FileText, steps: ["Đọc passage", "Hoàn thành tóm tắt", "So sánh đáp án"], needs: "Bản tóm tắt, giới hạn từ và đáp án đã được kiểm tra." },
  ],
  listening: [
    { id: "timed-parts", title: "Đề Parts 1–4 có thời gian", detail: "Luyện từng phần hoặc cả bài nghe theo đồng hồ như buổi thi.", source: "Audio IELTS có quyền", icon: Clock3, steps: ["Chọn Part hoặc đề đầy đủ", "Nghe và trả lời đúng thời gian", "Xem đáp án và transcript"], needs: "Bộ audio, transcript và câu hỏi được cấp quyền hoặc do đội ngũ tự tạo." },
    { id: "form-note", title: "Form / note completion", detail: "Nghe thông tin cụ thể và điền vào biểu mẫu hoặc ghi chú.", source: "Audio + transcript + đáp án", icon: NotebookPen, steps: ["Đọc biểu mẫu", "Nghe và điền chỗ trống", "Đối chiếu transcript"], needs: "Audio hợp quyền, biểu mẫu, transcript và đáp án." },
    { id: "multiple-choice", title: "Multiple choice", detail: "Nghe để chọn ý đúng giữa các phương án dễ gây nhầm.", source: "Audio + câu hỏi duyệt", icon: ListChecks, steps: ["Đọc lựa chọn", "Nghe và chọn đáp án", "Xem mốc audio giải thích"], needs: "Audio, câu hỏi và vị trí bằng chứng trong transcript." },
    { id: "matching", title: "Matching", detail: "Nối thông tin nghe được với người, địa điểm hoặc lựa chọn phù hợp.", source: "Audio + câu hỏi duyệt", icon: Layers3, steps: ["Xem hai nhóm thông tin", "Nghe và ghép cặp", "Xem transcript"], needs: "Audio, cặp thông tin và đáp án được kiểm tra." },
    { id: "map-labelling", title: "Map labelling", detail: "Theo dõi hướng dẫn trong audio để điền nhãn trên sơ đồ.", source: "Audio + sơ đồ có quyền", icon: MapPinned, steps: ["Xem bản đồ", "Nghe chỉ dẫn", "Gắn nhãn và xem đáp án"], needs: "Sơ đồ có quyền dùng, audio chỉ đường và đáp án vị trí." },
    { id: "dictation", title: "Chép chính tả", detail: "Nghe từng đoạn ngắn, ghi lại câu rồi so với transcript.", source: "Audio + transcript", icon: Volume2, steps: ["Chọn đoạn nghe", "Chép câu vừa nghe", "So sánh với transcript"], needs: "Audio hợp quyền và transcript đồng bộ theo đoạn." },
  ],
  writing: [
    { id: "outline", title: "Lập dàn ý", detail: "Sắp ý chính, ví dụ và cấu trúc trước khi viết bài hoàn chỉnh.", source: "Đề viết đã duyệt", icon: Layers3, steps: ["Chọn đề", "Lập luận điểm và ví dụ", "Đối chiếu dàn ý mẫu"], needs: "Đề viết cùng một hoặc nhiều dàn ý mẫu do biên tập viên duyệt." },
    { id: "paragraphs", title: "Luyện từng đoạn", detail: "Tập viết mở bài, thân bài hoặc kết luận theo mục tiêu riêng.", source: "Đề viết + đoạn mẫu", icon: PenLine, steps: ["Chọn loại đoạn", "Viết theo đề", "Đối chiếu checklist và mẫu"], needs: "Đề viết, đoạn mẫu và checklist theo từng phần." },
    { id: "sample-compare", title: "Đối chiếu bài mẫu", detail: "So bài viết với câu trả lời mẫu và các điểm cần tự sửa.", source: "Bài mẫu biên soạn", icon: BookOpen, steps: ["Mở bài đã viết", "Đọc bài mẫu", "Đánh dấu điểm cần sửa"], needs: "Bài mẫu được cấp quyền và rubric tự đánh giá." },
    { id: "rubric", title: "Tự đánh giá theo rubric", detail: "Rà soát Task Response, Coherence, Vocabulary và Grammar trước khi sửa bài.", source: "IELTS Writing band descriptors", icon: ChartNoAxesCombined, steps: ["Chọn bài đã lưu", "Đi qua checklist bốn tiêu chí", "Lưu bản sửa tiếp theo"], needs: "Checklist có diễn giải, liên kết bài nháp và lịch sử sửa bài." },
  ],
  speaking: [
    { id: "part-1", title: "Part 1: phỏng vấn ngắn", detail: "Trả lời câu hỏi về bản thân và cuộc sống thường ngày.", source: "Bộ câu hỏi biên soạn", icon: Mic, steps: ["Chọn nhóm chủ đề", "Trả lời từng câu", "Nghe lại bản ghi"], needs: "Bộ câu hỏi Part 1 đã duyệt theo chủ đề." },
    { id: "all-parts-timer", title: "Luyện cả 3 Parts", detail: "Tập một buổi nói liền mạch với thời gian chuẩn cho từng phần.", source: "Bộ câu hỏi hoàn chỉnh", icon: Clock3, steps: ["Chọn bộ đề", "Nói lần lượt Part 1–3", "Xem thời lượng và ghi chú"], needs: "Bộ câu hỏi đủ ba phần, đồng hồ và lịch sử phiên luyện." },
    { id: "record-review", title: "Ghi âm & nghe lại", detail: "Quản lý các lần ghi âm và tự ghi nhận điều cần cải thiện.", source: "Bản ghi của bạn", icon: AudioLines, steps: ["Chọn buổi luyện", "Nghe lại bản ghi", "Lưu nhận xét"], needs: "Lưu trữ bản ghi riêng tư theo tài khoản và quyền truy cập phù hợp." },
    { id: "sample-compare", title: "Đối chiếu câu trả lời mẫu", detail: "So cách triển khai ý với câu trả lời mẫu do biên tập viên chuẩn bị.", source: "Câu trả lời mẫu biên soạn", icon: FileQuestion, steps: ["Trả lời một câu hỏi", "Đọc hoặc nghe bài mẫu", "Ghi lại cách diễn đạt hay"], needs: "Bài mẫu có quyền dùng, liên kết với từng câu hỏi và chủ đề." },
  ],
};
