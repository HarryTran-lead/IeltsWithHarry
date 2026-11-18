/** Client-safe shapes for the Grammar practice labs (M20–M26). No answer keys live here. */
import type { GrammarLevel } from "./types";

export type LabKind = "clinic" | "contrast" | "transform" | "context" | "transfer";

export const labInfo: Record<LabKind, { name: string; short: string; milestone: string; description: string }> = {
  clinic: { name: "Phòng chữa lỗi", short: "Chữa lỗi", milestone: "M22", description: "Đi từng bước qua một lỗi hay gặp: nhận diện, hiểu vì sao sai, áp dụng một quy tắc rồi thử lại với câu mới." },
  contrast: { name: "Phân biệt cặp cấu trúc", short: "Phân biệt", milestone: "M23", description: "So sánh hai cấu trúc dễ nhầm trong cùng tình huống để chọn cách nói khớp ý người nói." },
  transform: { name: "Viết lại câu", short: "Viết lại câu", milestone: "M24", description: "Viết lại câu theo gợi ý mà giữ nguyên nghĩa. Câu khác mẫu chưa chắc sai: hãy tự đối chiếu." },
  context: { name: "Thám tử ngữ cảnh", short: "Ngữ cảnh", milestone: "M25", description: "Đọc một đoạn văn, chọn cấu trúc theo ngữ cảnh, tìm và sửa nhiều lỗi trong bản nháp." },
  transfer: { name: "Vận dụng Viết & Nói", short: "Viết & Nói", milestone: "M26", description: "Dùng điểm ngữ pháp trong một nhiệm vụ viết hoặc nói ngắn, tự chấm theo tiêu chí." },
};
export const labKinds = Object.keys(labInfo) as LabKind[];

export type LabSummary = { lab: LabKind; id: string; level: GrammarLevel; lessonIds: string[]; title: string; subtitle?: string };

export type LabConcept = {
  id: string; lessonId: string; title: string; family: string;
  skills: Array<{ id: string; title: string; formula: string }>;
  prerequisites: string[];
};

export type ChoiceQuestion = { id: string; promptVi: string; optionsEn: string[]; type?: string };
export type OpenTask = { id: string; kind: "edit" | "diagnose" | "transfer"; promptVi: string; draftEn?: string | null };

export type ClinicItem = {
  lab: "clinic"; id: string; level: GrammarLevel; lessonId: string; title: string;
  misconceptionVi: string; contextVi: string; decisionRuleVi: string;
  steps: Array<{ kind: string; instructionVi: string; contentVi?: string; problematicEn?: string; recommendedEn?: string; explanationVi?: string }>;
  practice: ChoiceQuestion[];
  independentTask: { promptVi: string; rubricVi: string[] };
};
export type ContrastItem = {
  lab: "contrast"; id: string; level: GrammarLevel; lessonIds: string[]; title: string; topicVi: string;
  steps: Array<{ kind: string; instructionVi: string; contentVi?: string; examplesEn?: string[]; aMeaningVi?: string; bMeaningVi?: string; contextVi?: string; aEn?: string; bEn?: string; explanationVi?: string; checkId?: string; selfReviewVi?: string[] }>;
  practice: ChoiceQuestion[];
};
export type TransformItem = { lab: "transform"; id: string; level: GrammarLevel; lessonId: string; cue: string; instructionVi: string; sourceSentenceEn: string };
export type TransformSet = { lab: "transform"; id: string; level: GrammarLevel; lessonId: string; title: string; items: TransformItem[] };
export type ContextItem = {
  lab: "context"; id: string; level: GrammarLevel; lessonId: string; title: string; genre: string;
  passageEn: string; questions: ChoiceQuestion[]; open: OpenTask[];
};
export type TransferItem = {
  lab: "transfer"; id: string; level: GrammarLevel; lessonId: string; mode: "WRITING" | "SPEAKING"; stage: string;
  titleVi: string; promptVi: string; sourceContextEn: string; preparationStepsVi: string[]; targetVi: string;
  timeLengthVi: string; rubric: Array<{ id: string; vi: string }>;
};
export type LabItem = ClinicItem | ContrastItem | TransformSet | ContextItem | TransferItem;

export type ChoiceGrade = { kind: "choice"; questionId: string; correct: boolean; feedbackVi: string; correctOption?: string; explanationVi?: string; noteVi?: string };
export type OpenGrade = { kind: "open"; questionId: string; matchedReference: boolean; feedbackVi: string; referenceEn?: string | null; rubricVi?: string[]; noteVi?: string | null };
export type LabGrade = ChoiceGrade | OpenGrade;

export type DiagnosticQuestion = { id: string; conceptId: string; prompt: string; options: string[] };
export type DiagnosticResult = {
  level: GrammarLevel; points: number; total: number; summaryVi: string;
  concepts: Array<{ conceptId: string; lessonId: string; title: string; correct: number; total: number; status: "REVIEW_PRIORITY" | "MIXED" | "PROVISIONAL_STRENGTH" | "INSUFFICIENT_EVIDENCE" }>;
  review: Array<{ lessonId: string; title: string; clinicId: string | null }>;
  answers: Array<{ id: string; correct: boolean; correctOption: string; rationaleVi: string }>;
};

export type LessonLabs = { concept: LabConcept | null; labs: Record<LabKind, LabSummary[]>; draftPreview: boolean };
export type LevelLabs = { level: GrammarLevel; labs: Record<LabKind, LabSummary[]>; diagnosticItems: number; draftPreview: boolean };
