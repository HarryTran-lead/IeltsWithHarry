"use client";

import { useEffect, useRef, useState } from "react";
import { authoredPackSchema, compareSentence, countWords, type AuthoredPack } from "@/lib/authored-content";
import sample from "@/content/demo-pack.json";
import { useNotebook } from "@/features/notebook/notebook-store";
import { DEMO_PUBLISHED_PACK_KEY } from "@/lib/demo-content";
import { demoMode } from "@/lib/runtime";

const initialPack = authoredPackSchema.parse(sample);
const skills = ["Vocabulary", "Grammar", "Reading", "Listening", "Writing", "Speaking"] as const;
type Skill = (typeof skills)[number];

export function ContentLab() {
  const [pack, setPack] = useState<AuthoredPack>(initialPack);
  const [draftJson, setDraftJson] = useState(JSON.stringify(sample, null, 2));
  const [skill, setSkill] = useState<Skill>("Vocabulary");
  const [revision, setRevision] = useState(0);
  const [importError, setImportError] = useState("");

  useEffect(() => {
    if (!demoMode) return;
    void Promise.resolve().then(() => {
      try {
        const published = localStorage.getItem(DEMO_PUBLISHED_PACK_KEY);
        if (!published) return;
        const parsed = authoredPackSchema.safeParse(JSON.parse(published));
        if (parsed.success) { setPack(parsed.data); setDraftJson(JSON.stringify(parsed.data, null, 2)); }
      } catch { /* The bundled sample remains available if local data is damaged. */ }
    });
  }, []);

  function applyJson(value: string) {
    try {
      if (value.length > 100_000) throw new Error("Nội dung JSON tối đa 100 KB.");
      const parsed = authoredPackSchema.safeParse(JSON.parse(value));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(`${issue.path.join(".") || "Gói dữ liệu"}: ${issue.message}`);
      }
      setPack(parsed.data);
      setDraftJson(JSON.stringify(parsed.data, null, 2));
      setRevision((current) => current + 1);
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "JSON không hợp lệ");
    }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (file.size > 100_000) { setImportError("Tệp JSON tối đa 100 KB."); return; }
    try {
      const text = await file.text();
      setDraftJson(text);
      applyJson(text);
    } catch { setImportError("Không đọc được tệp JSON."); }
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ieltswithharry-demo-pack.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="content-page content-lab">
    <header className="lab-hero">
      <span className="eyebrow">BẢN THỬ · NỘI DUNG SOẠN SẴN</span>
      <h1>Một gói dữ liệu, sáu cách luyện tập</h1>
      <p>Nạp câu hỏi, đáp án, giải thích và bài mẫu vào JSON. Trang sẽ dựng bài luyện và chấm những câu có đáp án xác định; không gọi AI.</p>
      <div className="lab-badges"><span>📦 {pack.title}</span><span>🧭 {pack.level}</span><span>🔒 Chỉ thử trong trình duyệt</span></div>
    </header>

    <section className="card lab-import" aria-label="Nạp nội dung">
      <div><h2>Nạp tài liệu thử</h2><p>Tải mẫu, sửa nội dung rồi chọn tệp JSON hoặc dán vào ô bên dưới. Dữ liệu chỉ tồn tại ở tab này; chưa xuất bản lên Supabase.</p></div>
      <div className="lab-import-actions">
        <button type="button" className="button subtle" onClick={downloadSample}>Tải JSON mẫu</button>
        <label className="button subtle lab-file">Chọn tệp JSON<input type="file" accept=".json,application/json" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
        <button type="button" className="button subtle" onClick={() => { applyJson(JSON.stringify(sample)); setDraftJson(JSON.stringify(sample, null, 2)); }}>Khôi phục mẫu</button>
      </div>
      <details><summary>Hoặc dán và chỉnh JSON</summary><textarea aria-label="Nội dung JSON" spellCheck={false} value={draftJson} onChange={(event) => setDraftJson(event.target.value)} /><button type="button" className="button primary" onClick={() => applyJson(draftJson)}>Áp dụng dữ liệu</button></details>
      {importError && <p className="form-error" role="alert">{importError}</p>}
    </section>

    <nav className="lab-tabs" aria-label="Chọn kỹ năng">
      {skills.map((name) => <button type="button" key={name} className={skill === name ? "active" : ""} aria-current={skill === name ? "page" : undefined} onClick={() => setSkill(name)}>{name}</button>)}
    </nav>
    <section className="card lab-practice" key={`${revision}-${skill}`}>
      {skill === "Vocabulary" && <VocabularyPractice items={pack.vocabulary} />}
      {skill === "Grammar" && <div className="lab-stack"><h2>Grammar · Hiểu quy tắc, làm bài tập</h2><div className="lab-note"><strong>Quy tắc đã nạp</strong><p>{pack.grammar.rule}</p><small>Ví dụ: {pack.grammar.example}</small></div>{pack.grammar.questions.map((question, index) => <ChoiceDemo key={index} item={question} number={index + 1} />)}</div>}
      {skill === "Reading" && <div className="lab-stack"><h2>Reading · Đọc và tìm bằng chứng</h2><div className="lab-passage">{pack.reading.passage}</div>{pack.reading.questions.map((question, index) => <ChoiceDemo key={index} item={question} number={index + 1} evidence={question.evidence} />)}</div>}
      {skill === "Listening" && <ListeningDemo item={pack.listening} />}
      {skill === "Writing" && <WritingDemo item={pack.writing} />}
      {skill === "Speaking" && <SpeakingDemo item={pack.speaking} />}
    </section>
    <p className="lab-footnote">Câu Writing và Speaking mở có nhiều đáp án hợp lý. Bản thử chỉ đối chiếu câu mẫu, số từ và checklist; không tự chấm ngữ pháp, phát âm hay band IELTS.</p>
  </div>;
}

function VocabularyPractice({ items }: { items: AuthoredPack["vocabulary"] }) {
  const [index, setIndex] = useState(0);
  return <div className="lab-stack"><div className="lab-item-picker"><span>{index + 1} / {items.length} từ</span><button type="button" className="button subtle" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Từ trước</button><button type="button" className="button subtle" disabled={index === items.length - 1} onClick={() => setIndex(index + 1)}>Từ tiếp →</button></div><VocabularyDemo key={index} item={items[index]} /></div>;
}

function VocabularyDemo({ item }: { item: AuthoredPack["vocabulary"][number] }) {
  const { entries, addEntry, error: notebookError } = useNotebook();
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const result = compareSentence(answer, item.acceptedSentences);
  const saved = entries.some((entry) => entry.kind === "word" && entry.title === item.word && entry.sourcePath === "/app/content-lab");
  return <div className="lab-stack">
    <div className="lab-section-heading"><span>🧠</span><div><h2>Vocabulary · Học rồi đặt câu</h2><p>Từ, nghĩa, định nghĩa và câu mẫu đều lấy từ gói dữ liệu.</p></div></div>
    <div className="lab-word"><span>WORD CARD</span><h3>{item.word}</h3><p>{item.definition}</p><div className="lab-word-actions"><button type="button" className="button subtle" onClick={() => setRevealed(!revealed)}>{revealed ? "Ẩn nghĩa và ví dụ" : "Xem nghĩa và ví dụ"}</button><button type="button" className="button subtle" disabled={saved} onClick={async () => { try { await addEntry({ kind: "word", title: item.word, body: "", meaningVi: item.meaningVi, example: item.example }); } catch { /* Notebook shows the error. */ } }}>{saved ? "★ Đã lưu vào sổ" : "☆ Lưu vào sổ tay"}</button></div>{revealed && <div className="lab-note"><strong>{item.meaningVi}</strong><p>{item.example}</p></div>}{notebookError && <p className="form-error" role="alert">{notebookError}</p>}</div>
    <div className="lab-task"><h3>Đặt câu</h3><p>{item.sentencePromptVi}</p><label htmlFor="lab-sentence">Câu của bạn</label><input id="lab-sentence" value={answer} onChange={(event) => { setAnswer(event.target.value); setChecked(false); }} placeholder="Type your sentence in English…" /><button type="button" className="button primary" disabled={!answer.trim()} onClick={() => setChecked(true)}>So sánh với câu mẫu</button></div>
    {checked && <div className="lab-result" role="status"><strong>{result.exact ? "Khớp một đáp án đã soạn ✓" : "Chưa khớp đáp án đã soạn"}</strong><p>Mức trùng từ với câu mẫu gần nhất: {result.similarity}%. Đây là độ giống văn bản, không phải điểm chất lượng câu.</p><p><b>Các câu được chấp nhận:</b> {item.acceptedSentences.join(" / ")}</p><p>{result.exact ? "Bạn có thể thử một cách diễn đạt khác." : "Nếu câu của bạn cũng hợp lý nhưng diễn đạt khác mẫu, hãy tự đối chiếu hoặc bổ sung biến thể vào JSON."}</p></div>}
  </div>;
}

type Choice = AuthoredPack["grammar"]["questions"][number];
function ChoiceDemo({ item, evidence, onSubmit, number }: { item: Choice; evidence?: string; onSubmit?: () => void; number?: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  return <div className="lab-task"><h3>{number ? `${number}. ` : ""}{item.prompt}</h3><div className="lab-options">{item.options.map((option, index) => <button type="button" key={index} disabled={submitted} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div><button type="button" className="button primary" disabled={selected === null || submitted} onClick={() => { setSubmitted(true); onSubmit?.(); }}>Nộp đáp án</button>{submitted && <div className="lab-result" role="status"><strong>{selected === item.correctIndex ? "Chính xác ✓" : "Chưa đúng — xem lại gợi ý"}</strong><p><b>Đáp án:</b> {item.options[item.correctIndex]}</p><p>{item.explanation}</p>{evidence && <p><b>Bằng chứng trong bài:</b> “{evidence}”</p>}<button type="button" className="button subtle" onClick={() => { setSelected(null); setSubmitted(false); }}>Làm lại</button></div>}</div>;
}

function ListeningDemo({ item }: { item: AuthoredPack["listening"] }) {
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => () => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);
  function play() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(item.script);
    speech.lang = "en-US";
    speech.rate = 0.85;
    window.speechSynthesis.speak(speech);
  }
  return <div className="lab-stack"><div className="lab-section-heading"><span>🎧</span><div><h2>Listening · Nghe rồi trả lời</h2><p>Chế độ luyện tập: transcript mở sau khi nộp câu đầu tiên.</p></div></div><div className="lab-note"><button type="button" className="button primary" onClick={play}>▶ Phát giọng đọc mẫu</button><button type="button" className="button subtle" onClick={() => window.speechSynthesis?.cancel()}>Dừng</button><small>Giọng tổng hợp có sẵn của trình duyệt; chất lượng tùy thiết bị. Bản chính thức sẽ dùng tệp âm thanh do người soạn tải lên.</small></div>{item.questions.map((question, index) => <ChoiceDemo key={index} item={question} number={index + 1} onSubmit={() => setSubmitted(true)} />)}{submitted && <><h3>Transcript để ôn tập</h3><div className="lab-passage">{item.script}</div></>}</div>;
}

function WritingDemo({ item }: { item: AuthoredPack["writing"] }) {
  const [body, setBody] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const words = countWords(body);
  return <div className="lab-stack"><div className="lab-section-heading"><span>✍️</span><div><h2>Writing · Viết và tự đối chiếu</h2><p>Đề bài, ngưỡng từ, mẫu và checklist đều do người soạn cung cấp.</p></div></div><div className="lab-note"><strong>Đề bài</strong><p>{item.prompt}</p></div><label htmlFor="lab-writing">Bài viết của bạn · {words} từ / tối thiểu {item.minWords}</label><textarea id="lab-writing" rows={9} value={body} onChange={(event) => { setBody(event.target.value); setSubmitted(false); }} placeholder="Write your answer here…" /><button type="button" className="button primary" disabled={!body.trim()} onClick={() => setSubmitted(true)}>Mở mẫu và checklist</button>{submitted && <div className="lab-result" role="status"><strong>{words >= item.minWords ? "Đã đạt số từ tối thiểu" : `Cần thêm ${item.minWords - words} từ để đạt ngưỡng`}</strong><p><b>Bài mẫu tham khảo:</b> {item.modelAnswer}</p><ul>{item.checklist.map((line) => <li key={line}><label><input type="checkbox" /> {line}</label></li>)}</ul><small>Checklist do bạn tự đánh dấu. Hệ thống không tự đánh giá chất lượng bài viết.</small></div>}</div>;
}

function SpeakingDemo({ item }: { item: AuthoredPack["speaking"] }) {
  const [seconds, setSeconds] = useState(item.preparationSeconds);
  const [counting, setCounting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioRef = useRef("");
  useEffect(() => {
    if (!counting || seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [counting, seconds]);
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((track) => track.stop()); if (audioRef.current) URL.revokeObjectURL(audioRef.current); }, []);
  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Trình duyệt này chưa hỗ trợ ghi âm."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(stream);
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioRef.current) URL.revokeObjectURL(audioRef.current);
        const url = URL.createObjectURL(new Blob(chunks, { type: next.mimeType || "audio/webm" }));
        audioRef.current = url;
        setAudioUrl(url);
        setRecording(false);
      };
      recorder.current = next;
      next.start();
      setRecording(true);
    } catch { setError("Không mở được microphone. Hãy kiểm tra quyền truy cập."); }
  }
  return <div className="lab-stack"><div className="lab-section-heading"><span>🎙️</span><div><h2>Speaking · Ghi âm và tự nghe lại</h2><p>Câu hỏi và câu mẫu do người soạn nhập; bản ghi chỉ ở tab này.</p></div></div><div className="lab-note"><strong>Câu hỏi</strong><p>{item.prompt}</p></div><div className="lab-speaking-controls"><span>Chuẩn bị: <b>{seconds}s</b></span><button type="button" className="button subtle" onClick={() => { setSeconds(item.preparationSeconds); setCounting(true); }}>Bắt đầu đếm giờ</button>{recording ? <button type="button" className="button primary" onClick={() => recorder.current?.stop()}>■ Dừng ghi âm</button> : <button type="button" className="button primary" onClick={() => void startRecording()}>● Ghi âm</button>}</div>{error && <p className="form-error" role="alert">{error}</p>}{audioUrl && <audio controls src={audioUrl} aria-label="Nghe lại bài nói" />}<button type="button" className="button subtle" onClick={() => setRevealed(!revealed)}>{revealed ? "Ẩn mẫu" : "Xem câu mẫu và checklist"}</button>{revealed && <div className="lab-result"><p><b>Câu mẫu:</b> {item.modelAnswer}</p><ul>{item.checklist.map((line) => <li key={line}><label><input type="checkbox" /> {line}</label></li>)}</ul><small>Không tự chấm phát âm hay band IELTS.</small></div>}</div>;
}
