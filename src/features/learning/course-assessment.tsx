"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { TopicArt } from "@/components/illustrations/topic-art";
import { DemoProvider } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import {
  ListeningStudioPractice,
  OpenResponsePractice,
  ReadingStudioPractice,
  SpeakingStudioPractice,
  WritingStudioPractice,
  type PackageActivity,
  type PackageAudio,
  type PackageLesson,
  type PackagePassage,
  type PackageV3Enrichment,
} from "./course-package-practice";

type AssessmentQuestion = PackageActivity | [string, string];
type Rubric = { criterion: string; detail: string; max: number };
type Reading = {
  id?: string;
  title?: string;
  passage?: string;
  sections?: [string, string][];
  questions?: AssessmentQuestion[];
};
type Listening = {
  id?: string;
  title?: string;
  audio_url?: string;
  script?: string;
  questions?: AssessmentQuestion[];
};

function questions(items: AssessmentQuestion[] = []): PackageActivity[] {
  return items.map((item, index) =>
    Array.isArray(item)
      ? { id: `q-${index}`, type: "short_answer", prompt: item[0], answer: item[1] }
      : item,
  );
}

type Assessment = {
  title: string;
  instruction_vi?: string;
  note?: string;
  stage_warning?: string;
  v2?: boolean;
  v3?: boolean;
  goal_vi?: string;
  pass_rule?: string;
  standards_vi?: string;
  language?: PackageActivity[];
  auto_scored?: PackageActivity[];
  comprehension_checks?: PackageActivity[];
  writing_task?: string;
  speaking_task?: string;
  writing?: string | { prompt?: string; task?: string; rubric?: Rubric[] };
  speaking?: string[] | { prompt?: string; task?: string; rubric?: Rubric[] };
  essay_task2?: PackageLesson["advanced_essay"];
  speaking_extensions?: { question: string; response_framework: string }[];
  visual_url?: string;
  v3_enrichment?: PackageV3Enrichment;
  reading?: Reading | Reading[];
  listening?: Listening | Listening[];
  review?: { vocabulary_recall?: { en: string; vi: string; example?: string; example_vi?: string }[] };
};

export type { Assessment };

export function CourseAssessment({ content, stageId }: { content: Assessment; stageId: string }) {
  return (
    <DemoProvider>
      <NotebookProvider>
        <AppShell>
          <div className="content-page">
            <p>
              <Link href={`/app/learn/${stageId}`}>← Quay lại lộ trình {stageId}</Link>
            </p>
            <AssessmentBody content={content} stageId={stageId} />
          </div>
        </AppShell>
      </NotebookProvider>
    </DemoProvider>
  );
}

/** The check itself, shared by its own page and the course book's workbook. */
export function AssessmentBody({ content, stageId, slug }: { content: Assessment; stageId: string; slug?: string }) {
  const unitSlug = slug?.replace(/-check$/, "") || undefined;
  const readingRaw = Array.isArray(content.reading) ? content.reading : content.reading ? [content.reading] : [];
  const readingPassages: PackagePassage[] = readingRaw
    .filter((r) => r.passage || r.sections?.length)
    .map((r, idx) => ({
      id: r.id || `assess-reading-${idx + 1}`,
      title: r.title || `Bài đọc kiểm tra ${idx + 1}`,
      text: r.passage || (r.sections ?? []).map(([lbl, txt]) => `[${lbl}] ${txt}`).join("\n\n"),
      sections: r.sections,
      questions: questions(r.questions),
      difficulty: "Đề kiểm tra Đọc hiểu học thuật",
    }));

  const listeningRaw = Array.isArray(content.listening) ? content.listening : content.listening ? [content.listening] : [];
  const listeningTracks: PackageAudio[] = listeningRaw
    .filter((l) => l.questions?.length)
    .map((l, idx) => {
      const qs = questions(l.questions);
      return {
        id: l.id || `assess-listening-${idx + 1}`,
        title: l.title || `Bài nghe kiểm tra ${idx + 1}`,
        audio_url: l.audio_url || "",
        script: l.script || qs.map((q) => q.audio_text || q.prompt).join(" "),
        questions: qs,
      };
    });

  const writingPrompt =
    content.writing_task ??
    (typeof content.writing === "string" ? content.writing : content.writing?.prompt ?? content.writing?.task);
  const writingRubric =
    content.writing && typeof content.writing === "object" ? content.writing.rubric : undefined;

  const speakingPrompts: (string | { part?: number; prompt: string })[] = Array.isArray(content.speaking)
    ? content.speaking
    : content.speaking_task || (typeof content.speaking === "object" && (content.speaking?.prompt || content.speaking?.task))
      ? [content.speaking_task ?? (typeof content.speaking === "object" ? content.speaking.prompt ?? content.speaking.task ?? "" : "")]
      : [];
  const speakingRubric =
    content.speaking && !Array.isArray(content.speaking) ? content.speaking.rubric : undefined;

  return (
    <div className="card section-card lab-stack">
      <div className="package-scene-hero">
        <TopicArt topic={content.title} unitSlug={unitSlug} variant="unit" className="package-scene-art" />
        <div className="package-scene-copy">
          <span className="eyebrow">KIỂM TRA & ĐÁNH GIÁ TOÀN DIỆN · {stageId.toUpperCase()}</span>
          <h3>{content.title}</h3>
          <p>{content.instruction_vi || content.goal_vi || "Ôn tập và tự đánh giá kiến thức toàn diện của unit."}</p>
        </div>
      </div>

      {content.stage_warning && <p className="lab-note">{content.stage_warning}</p>}
      {content.goal_vi && (
        <p className="lab-note">
          <b>🎯 Mục tiêu đạt chuẩn:</b> {content.goal_vi}
        </p>
      )}
      {content.note && <p>{content.note}</p>}

      {content.review?.vocabulary_recall?.length ? (
        <details className="foundation-activity" open>
          <summary>Bảng từ vựng trọng tâm cần ôn ({content.review.vocabulary_recall.length} từ)</summary>
          <div className="v3-vocab-grid">
            {content.review.vocabulary_recall.map((word, i) => (
              <div key={`${word.en}-${i}`} className="v3-vocab-card">
                <div className="v3-vocab-title-col">
                  <strong>{word.en}</strong>
                  <span className="v3-vocab-meaning">{word.vi}</span>
                </div>
                {word.example && (
                  <div className="v3-vocab-example">
                    <p>“{word.example}”</p>
                    {word.example_vi && <p className="v3-vocab-example-vi">🌐 {word.example_vi}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <OpenResponsePractice
        scoreKey="assess-auto"
        topic={content.title}
        items={content.auto_scored ?? []}
        title="Phần 1 · Kiểm tra cốt lõi (Có dịch câu hỏi & giải thích chi tiết)"
      />
      <OpenResponsePractice
        scoreKey="assess-lang"
        topic={content.title}
        items={content.language ?? []}
        title="Phần 2 · Từ vựng & Ngữ pháp học thuật nâng cao"
      />
      <OpenResponsePractice
        scoreKey="assess-comp"
        topic={content.title}
        items={content.comprehension_checks ?? []}
        title="Phần 3 · Đọc & Nghe hiểu trọng tâm của Unit"
      />

      {readingPassages.length > 0 && (
        <ReadingStudioPractice
          passages={readingPassages}
          topicLabel={content.title}
          strategyLines={["Đọc câu hỏi trước, xác định từ khóa rồi đối chiếu với đoạn văn đánh nhãn [A]–[H] ở cột bên trái."]}
        />
      )}

      {listeningTracks.length > 0 && (
        <ListeningStudioPractice
          audios={listeningTracks}
          topicLabel={content.title}
          strategyLines={["Bấm Phát giọng đọc bài nghe ngay trên đầu câu hỏi; chú ý các từ nối chuyển ý hoặc tự sửa thông tin."]}
        />
      )}

      {(writingPrompt || content.essay_task2) && (
        <WritingStudioPractice
          task1Prompt={writingPrompt}
          visualUrl={content.visual_url || content.v3_enrichment?.visual_url}
          task1Template={content.v3_enrichment?.writing_task1_template}
          essay={
            content.essay_task2 ??
            (writingPrompt
              ? {
                  prompt: writingPrompt,
                  min_words: 250,
                  model_paragraphs: [],
                  planning_prompts: [
                    "Xác định rõ yêu cầu trọng tâm của đề bài và lập trường xuyên suốt.",
                    "Lập dàn ý 4 đoạn (Introduction, Body 1, Body 2, Conclusion) và chọn ít nhất 5 cụm từ học thuật của Unit.",
                  ],
                }
              : undefined)
          }
          task2Template={content.v3_enrichment?.writing_task2_template}
          rubric={writingRubric}
          keyName={`ielts-check-writing:${slug || content.title}`}
          lessonSlug={slug}
          topic={content.title}
        />
      )}

      {(speakingPrompts.length > 0 || content.speaking_extensions?.length) && (
        <SpeakingStudioPractice
          questions={speakingPrompts}
          extensions={content.speaking_extensions}
          part3Template={content.v3_enrichment?.speaking_part3_template}
          rubric={speakingRubric}
          keyName={`ielts-check-speaking:${slug || content.title}`}
        />
      )}

      {content.pass_rule && <p className="lab-note"><b>Tiêu chuẩn vượt qua Unit:</b> {content.pass_rule}</p>}
      {content.standards_vi && <p className="lab-note">{content.standards_vi}</p>}
    </div>
  );
}
