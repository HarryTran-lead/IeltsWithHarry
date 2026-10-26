"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopicArt } from "@/components/illustrations/topic-art";

export type PackageActivity = { id: string; type: string; prompt: string; answer: string; options?: string[]; explanation?: string; instruction?: string };
export type PackageLesson = {
  type: string;
  title?: string; aim?: string; theory_vi?: string; examples?: string[]; practice?: [string, string][]; output?: string;
  instruction_vi?: string; study_method?: string | { learn?: string; practice?: string; review?: string; master?: string }; duration_min?: number;
  grammar_title?: string; grammar_form?: string; listening_strategy?: string | string[]; pre_listening?: string;
  reading_strategy?: string | string[]; questions?: string[];
  audio_url?: string;
  audio_quality_note?: string;
  stage_warning?: string;
  assessment_slug?: string;
  activities?: PackageActivity[];
  micro_exercises?: PackageActivity[];
  scaffolding_steps?: string[];
  rubric?: { criterion: string; detail: string; max: number }[];
  pronunciation_focus?: string;
  expansion_words?: { en: string; vi: string; example?: string }[];
  expansion_activities?: PackageActivity[];
  practice_cycles?: { name: string; instruction: string }[];
  practice_sections?: { title: string; instruction_vi?: string; activities: PackageActivity[] }[];
  independent_use?: string;
  audios?: { id: string; title: string; script: string; audio_url: string; questions: PackageActivity[]; difficulty?: string }[];
  passages?: { id: string; title: string; text: string; questions: PackageActivity[]; difficulty?: string }[];
  phases?: { phase: string; task: string }[];
  new_translation_prompts?: PackageActivity[];
  review_checklist?: string[]; second_task?: string;
  shadow_phrases?: string[]; role_plays?: { id: string; scenario: string; target_seconds: number }[];
  stages?: { name: string; task: string }[]; self_check?: string[];
  exam_strategy?: string;
  data_visual?: { headers: string[]; rows: string[][] };
  advanced_essay?: { prompt: string; min_words: number; model_paragraphs: string[]; planning_prompts: string[] };
  language_upgrade?: { correction_drills: { prompt: string; model: string; why: string }[] };
  speaking_extensions?: { question: string; response_framework: string }[];
};

function normalize(value: string) { return value.trim().toLocaleLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " "); }
function lines(value?: string | string[]) { return Array.isArray(value) ? value : value ? [value] : []; }

function AdvancedEssayPractice({ essay, keyName }: { essay: NonNullable<PackageLesson["advanced_essay"]>; keyName: string }) {
  const [draft, setDraft] = useState("");
  const [showModel, setShowModel] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { try { setDraft(localStorage.getItem(keyName) ?? ""); } catch { /* Browser storage can be disabled. */ } }, 0); return () => window.clearTimeout(timer); }, [keyName]);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  return <section className="advanced-essay"><span className="eyebrow">IELTS WRITING · TASK 2</span><h3>{essay.prompt}</h3><ol>{essay.planning_prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ol><label htmlFor="advanced-essay-draft">Bản nháp của bạn · {words}/{essay.min_words} từ</label><textarea id="advanced-essay-draft" value={draft} rows={12} onChange={(event) => { setDraft(event.target.value); try { localStorage.setItem(keyName, event.target.value); } catch { /* The draft stays in memory. */ } }} placeholder="Viết dàn ý rồi phát triển thành bài luận tại đây…" /><p className="advanced-essay-save">Bản nháp tự lưu trên trình duyệt này.</p><button type="button" className="button subtle" onClick={() => setShowModel((value) => !value)}>{showModel ? "Ẩn bài mẫu" : "Xem bài mẫu để đối chiếu"}</button>{showModel && <div className="advanced-essay-model">{essay.model_paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<small>Bài mẫu để tham khảo; hệ thống chưa chấm band tự động.</small></div>}</section>;
}

export function OpenResponsePractice({ items, title }: { items: PackageActivity[]; title: string }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [active, setActive] = useState(0);
  if (!items.length) return null;
  const item = items[Math.min(active, items.length - 1)];
  const completed = items.filter((_, index) => revealed[index]).length;
  return <section className="guided-practice" aria-label={title}>
    <div className="guided-practice-head"><div><span className="eyebrow">LUYỆN TẬP TỪNG CÂU</span><h2>{title}</h2></div><strong>{completed}/{items.length} đã kiểm tra</strong></div>
    <div className="guided-practice-track" role="progressbar" aria-label="Số câu đã kiểm tra" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={items.length}><span style={{ width: `${completed / items.length * 100}%` }} /></div>
    <div className="guided-practice-dots" aria-label="Chọn câu hỏi">{items.map((question, index) => <button type="button" key={`${question.id}-${index}`} aria-label={`Câu ${index + 1}${revealed[index] ? ", đã kiểm tra" : ""}`} aria-current={active === index ? "step" : undefined} className={`${active === index ? "active" : ""} ${revealed[index] ? "done" : ""}`} onClick={() => setActive(index)}>{index + 1}</button>)}</div>
    <div className="guided-question" key={`${item.id}-${active}`}>
      <div className="guided-question-meta"><span>CÂU {active + 1} / {items.length}</span><span>{item.options?.length ? "Chọn một đáp án" : "Tự viết câu trả lời"}</span></div>
      <h3>{item.prompt}</h3>
      {item.instruction && <p className="guided-question-hint">{item.instruction}</p>}
      {item.options?.length ? <div className="guided-options">{item.options.map((option, optionIndex) => <button type="button" key={optionIndex} className={answers[active] === option ? "selected" : ""} aria-pressed={answers[active] === option} onClick={() => { setAnswers((current) => ({ ...current, [active]: option })); setRevealed((current) => ({ ...current, [active]: false })); }}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>
        : <label className="guided-answer">Câu trả lời của bạn<input value={answers[active] ?? ""} onChange={(event) => { setAnswers((current) => ({ ...current, [active]: event.target.value })); setRevealed((current) => ({ ...current, [active]: false })); }} placeholder="Gõ câu trả lời tại đây…" onKeyDown={(event) => { if (event.key === "Enter" && answers[active]?.trim()) setRevealed((current) => ({ ...current, [active]: true })); }} /></label>}
      {revealed[active] && <div className={`guided-feedback ${normalize(answers[active]) === normalize(item.answer) ? "matched" : "review"}`} role="status"><b>{normalize(answers[active]) === normalize(item.answer) ? "Chính xác!" : "Đối chiếu với đáp án gợi ý"}</b><p>Đáp án biên soạn: <strong>{item.answer}</strong></p>{item.explanation && <p>{item.explanation}</p>}{!item.options?.length && <small>Cách diễn đạt tương đương có thể vẫn đúng; phần so sánh này chỉ khớp văn bản.</small>}</div>}
      <div className="guided-actions"><button type="button" className="button subtle" disabled={active === 0} onClick={() => setActive(active - 1)}>← Câu trước</button><div>{!revealed[active] && <button type="button" className="button primary" disabled={!answers[active]?.trim()} onClick={() => setRevealed((current) => ({ ...current, [active]: true }))}>Kiểm tra câu này</button>}{revealed[active] && active < items.length - 1 && <button type="button" className="button primary" onClick={() => setActive(active + 1)}>Câu tiếp theo →</button>}</div></div>
    </div>
  </section>;
}

export function PackageLessonPractice({ content, mode = "practice" }: { content: PackageLesson | null; mode?: "learn" | "practice" | "review" }) {
  if (!content) return null;
  const method = typeof content.study_method === "string" ? content.study_method : content.study_method?.learn;
  const strategy = lines(content.reading_strategy || content.listening_strategy || content.pre_listening || content.exam_strategy);
  if (mode === "learn") return <div className="package-learn-content">
    {content.type !== "intro" && <div className="package-concept"><span className="eyebrow">CÁCH HỌC BÀI NÀY</span><h2>{content.type === "grammar" ? content.grammar_title || "Nhìn ví dụ trước khi luyện" : content.type === "listening" ? "Nghe để nắm ý chính" : content.type === "reading" ? "Đọc để hiểu nội dung" : content.type === "writing" ? "Lên ý trước khi viết" : content.type === "speaking" ? "Chuẩn bị ý trước khi nói" : "Nhìn, nghe và dùng từ"}</h2><p>{content.instruction_vi || method || (content.type === "reading" ? "Đọc bài một lượt để tìm ý chính; lượt hai tìm bằng chứng cho từng câu hỏi." : content.type === "listening" ? "Xem câu hỏi trước, nghe để bắt ý chính, rồi nghe lại để kiểm tra chi tiết." : content.type === "writing" ? "Xem đề và dữ liệu, ghi ý chính trước khi viết bản nháp." : content.type === "speaking" ? "Đọc câu hỏi, chuẩn bị vài ý, sau đó nói thành câu đầy đủ." : "Xem ví dụ, tự nói lại và thử dùng kiến thức vào câu mới.")}</p>{method && content.instruction_vi && <small>{method}</small>}</div>}
    {content.type === "intro" && <><div className="package-concept"><span className="eyebrow">Ý CHÍNH CẦN NHỚ</span><h2>{content.title}</h2><p>{content.theory_vi || content.aim}</p></div>{content.audio_url && <div className="package-audio"><span>🎧 Nghe mẫu và đọc theo</span><audio controls src={content.audio_url} aria-label="Audio bài học" /></div>}{content.examples?.length ? <div className="package-examples"><h3>Thử đọc những ví dụ này</h3><div className="foundation-chips">{content.examples.map((example) => <span key={example}>{example}</span>)}</div></div> : null}</>}
    {content.grammar_form && <div className="package-grammar-form"><strong>Công thức cần nhớ</strong><p>{content.grammar_form}</p></div>}
    {content.type === "grammar" && content.examples?.length ? <div className="package-examples"><h3>Quan sát câu mẫu</h3><div className="foundation-chips">{content.examples.map((example) => <span key={example}>{example}</span>)}</div></div> : null}
    {content.data_visual?.rows?.length ? <div className="package-data-table"><h3>Dữ liệu cho Writing Task 1</h3><div><table><thead><tr>{content.data_visual.headers.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead><tbody>{content.data_visual.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div><small>Chỉ mô tả số liệu và so sánh; không suy đoán nguyên nhân khi đề không cho biết.</small></div> : null}
    {strategy.length > 0 && <div className="package-strategy"><strong>Mẹo thực hành</strong><ol>{strategy.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol></div>}
    {content.type === "writing" && content.phases?.length ? <div className="package-process"><h3>Viết theo các bước</h3>{content.phases.map((phase, index) => <div key={phase.phase}><span>{index + 1}</span><p><b>{phase.phase}</b><br />{phase.task}</p></div>)}</div> : null}
    {content.type === "speaking" && content.stages?.length ? <div className="package-process"><h3>Nói theo các bước</h3>{content.stages.map((stage, index) => <div key={stage.name}><span>{index + 1}</span><p><b>{stage.name}</b><br />{stage.task}</p></div>)}</div> : null}
    {content.type === "speaking" && content.shadow_phrases?.length ? <div className="package-examples"><h3>Cụm từ để nói theo</h3><div className="foundation-chips">{content.shadow_phrases.map((phrase) => <span key={phrase}>{phrase}</span>)}</div></div> : null}
    {content.practice_cycles?.length ? <div className="foundation-steps">{content.practice_cycles.map((step, index) => <div key={step.name}><span>{index + 1}</span><b>{step.name}</b><small>{step.instruction}</small></div>)}</div> : null}
    {content.type === "vocabulary" && content.audio_url && <div className="package-audio"><span>🎧 Nghe phát âm từ vựng</span><audio controls src={content.audio_url} aria-label="Audio từ vựng" /><small>Giọng máy thử nghiệm từ gói bài học.</small></div>}
    {content.type === "listening" && content.audio_quality_note && <small>{content.audio_quality_note}</small>}
    {content.expansion_words?.length ? <details className="foundation-activity"><summary>Khám phá thêm {content.expansion_words.length} từ</summary><div className="foundation-word-grid">{content.expansion_words.map((word) => <div key={word.en}><TopicArt topic={content.title || "English"} word={word.en} className="foundation-word-art" /><strong>{word.en}</strong><span>{word.vi}</span><small>{word.example}</small></div>)}</div></details> : null}
  </div>;
  if (mode === "review") return <div className="package-review-content">
    <div className="package-concept"><span className="eyebrow">SAU BÀI HỌC NÀY</span><h2>Ghi nhớ và tự vận dụng</h2><p>{content.output || content.independent_use || content.aim || "Hãy thử dùng lại điều vừa học trong một tình huống của riêng bạn."}</p></div>
    {content.independent_use && content.output && <p className="lab-note"><strong>Tự vận dụng:</strong> {content.independent_use}</p>}
    {content.review_checklist?.length ? <div className="package-review-list"><h3>Tự kiểm tra</h3>{content.review_checklist.map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div> : null}
    {content.self_check?.length ? <div className="package-review-list"><h3>Trước khi rời bài</h3>{content.self_check.map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div> : null}
    {content.pronunciation_focus && <p className="lab-note"><strong>Luyện phát âm:</strong> {content.pronunciation_focus}</p>}
    {content.rubric?.length ? <details className="foundation-activity"><summary>Tiêu chí tự đánh giá</summary><ul>{content.rubric.map((row) => <li key={row.criterion}><strong>{row.criterion}:</strong> {row.detail} ({row.max} điểm tối đa)</li>)}</ul></details> : null}
    {content.stage_warning && <details className="package-curriculum-note"><summary>Về mức học của lộ trình</summary><p>{content.stage_warning}</p></details>}
    {content.assessment_slug && <p><Link className="button subtle" href={`/app/check/${content.assessment_slug}`}>Ôn tập & kiểm tra unit →</Link></p>}
  </div>;
  return <div className="lab-stack">
    {content.type === "intro" && <OpenResponsePractice title="Thử làm trước khi xem đáp án" items={(content.practice ?? []).map(([prompt, answer], index) => ({ id: `start-${index}`, prompt, answer, type: "short_answer" }))} />}
    {content.expansion_activities?.length ? <details className="foundation-activity"><summary>Thử dùng từ mở rộng · {content.expansion_activities.length} câu</summary><OpenResponsePractice items={content.expansion_activities} title="Thử dùng từ mở rộng" /></details> : null}
    {content.practice_sections?.map((section) => <details className="foundation-activity" key={section.title}><summary>{section.title} · {section.activities.length} câu</summary>{section.instruction_vi && <p>{section.instruction_vi}</p>}<OpenResponsePractice items={section.activities} title="Luyện ngữ pháp" /></details>)}
    <OpenResponsePractice items={content.activities ?? []} title={content.type === "grammar" ? "Luyện ngữ pháp" : content.type === "listening" ? "Bài nghe 1 · trả lời câu hỏi" : content.type === "reading" ? "Bài đọc 1 · trả lời câu hỏi" : "Câu hỏi luyện tập"} />
    {content.audios?.slice(1).map((item, index) => <details className="foundation-activity" key={item.id}><summary>Bài nghe {index + 2}: {item.title}</summary><audio controls src={item.audio_url} aria-label={`Bài nghe ${index + 2}`} /><OpenResponsePractice items={item.questions} title="Nghe rồi trả lời" /><details><summary>Xem transcript sau khi làm</summary><p className="foundation-transcript">{item.script}</p></details></details>)}
    {content.passages?.slice(1).map((item, index) => <details className="foundation-activity" key={item.id}><summary>Bài đọc {index + 2}: {item.title}</summary><p className="foundation-passage">{item.text}</p><OpenResponsePractice items={item.questions} title="Đọc rồi trả lời" /></details>)}
    <OpenResponsePractice items={content.micro_exercises ?? []} title="Luyện câu trước khi viết" />
    {content.advanced_essay && <AdvancedEssayPractice essay={content.advanced_essay} keyName={`ielts-draft:${content.assessment_slug}:${content.title}`} />}
    {content.language_upgrade?.correction_drills?.length ? <details className="foundation-activity"><summary>Nâng cấp cách diễn đạt · {content.language_upgrade.correction_drills.length} câu</summary><OpenResponsePractice title="Viết lại cho chính xác" items={content.language_upgrade.correction_drills.map((item, index) => ({ id: `upgrade-${index}`, type: "short_answer", prompt: item.prompt, answer: item.model, explanation: item.why }))} /></details> : null}
    {content.speaking_extensions?.length ? <div className="package-speaking-prompts"><h3>Nói sâu hơn · Part 3</h3>{content.speaking_extensions.map((item, index) => <details key={index}><summary>{index + 1}. {item.question}</summary><p><b>Khung gợi ý:</b> {item.response_framework}</p></details>)}</div> : null}
    {(content.new_translation_prompts?.length || content.second_task) ? <details className="foundation-activity"><summary>Dịch câu & thử thách viết</summary><OpenResponsePractice items={content.new_translation_prompts ?? []} title="Dịch câu ngắn" />{content.second_task && <p><strong>Thử thách thêm:</strong> {content.second_task}</p>}</details> : null}
    {content.role_plays?.length ? <details className="foundation-activity"><summary>Luyện nói theo tình huống</summary>{content.role_plays.map((role) => <p key={role.id}><strong>{role.target_seconds} giây:</strong> {role.scenario}</p>)}</details> : null}
    {content.scaffolding_steps?.length ? <details className="lab-note"><summary>Gợi ý từng bước & checklist</summary><ol>{content.scaffolding_steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></details> : null}
  </div>;
}
