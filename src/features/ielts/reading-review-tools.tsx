"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Highlighter, Languages, X } from "lucide-react";
import { translateEnglishToVietnamese } from "@/lib/news/browser-translation";
import { textOffset, type ReadingMark } from "./reading-highlights";

type Selection = { text: string; range: Range; pane: ReadingMark["pane"]; x: number; y: number };
type Translation = { source: string; value: string; loading: boolean; error: string };

export function ReadingReviewTools({ passage, questions, sectionId, marks, onMarksChange, saveError }: {
  passage: RefObject<HTMLElement | null>;
  questions: RefObject<HTMLDivElement | null>;
  sectionId: string;
  marks: ReadingMark[];
  onMarksChange: (marks: ReadingMark[]) => void;
  saveError: string;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [translation, setTranslation] = useState<Translation | null>(null);
  const [toolError, setToolError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const capture = () => {
      const chosen = window.getSelection();
      if (!chosen || chosen.isCollapsed || !chosen.rangeCount) return;
      const range = chosen.getRangeAt(0);
      const pane = passage.current?.contains(range.commonAncestorContainer) ? "passage"
        : questions.current?.contains(range.commonAncestorContainer) ? "questions" : null;
      const text = chosen.toString().trim();
      if (!pane || !text) return;
      const rect = range.getBoundingClientRect();
      setSelection({ text, range: range.cloneRange(), pane, x: rect.left + rect.width / 2, y: rect.top });
      setTranslation(null);
      setToolError("");
      // Native selection popups in Opera cover the action bar; keep the cloned range instead.
      chosen.removeAllRanges();
    };
    const onTouchEnd = () => window.setTimeout(capture, 100);
    const panes = [passage.current, questions.current];
    panes.forEach((pane) => { pane?.addEventListener("mouseup", capture); pane?.addEventListener("touchend", onTouchEnd); pane?.addEventListener("keyup", capture); });
    return () => panes.forEach((pane) => { pane?.removeEventListener("mouseup", capture); pane?.removeEventListener("touchend", onTouchEnd); pane?.removeEventListener("keyup", capture); });
  }, [passage, questions, sectionId]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.(".br-select-toolbar,.br-translate-card")) setSelection(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setSelection(null); setTranslation(null); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, []);

  const highlight = () => {
    if (!selection) return;
    if (!("Highlight" in window) || !(CSS as unknown as { highlights?: unknown }).highlights) {
      setToolError("Trình duyệt này chưa hỗ trợ tô sáng. Hãy cập nhật trình duyệt rồi thử lại.");
      return;
    }
    const root = selection.pane === "passage" ? passage.current : questions.current;
    if (!root) return;
    const selector = selection.pane === "passage" ? "[data-paragraph]" : "[data-review-text]";
    const captured: ReadingMark[] = [];
    root.querySelectorAll<HTMLElement>(selector).forEach((block, index) => {
      if (!selection.range.intersectsNode(block)) return;
      const bounds = document.createRange();
      bounds.selectNodeContents(block);
      const portion = selection.range.cloneRange();
      if (portion.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) portion.setStart(bounds.startContainer, bounds.startOffset);
      if (portion.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) portion.setEnd(bounds.endContainer, bounds.endOffset);
      const start = textOffset(block, portion.startContainer, portion.startOffset);
      const end = textOffset(block, portion.endContainer, portion.endOffset);
      if (end > start) captured.push({ section: sectionId, pane: selection.pane, block: index, start, end, quote: selection.pane === "questions" ? portion.toString() : undefined });
    });
    if (!captured.length) { setToolError("Hãy chọn chữ trong bài đọc hoặc nội dung câu hỏi để tô sáng."); return; }
    const added = captured.filter((mark) => !marks.some((item) => item.section === mark.section && item.pane === mark.pane && item.block === mark.block && item.start === mark.start && item.end === mark.end));
    onMarksChange([...marks, ...added]);
    setSelection(null);
  };

  const translate = () => {
    if (!selection) return;
    if (selection.text.length > 20000) { setToolError("Mỗi lần dịch tối đa 20.000 ký tự. Hãy chọn một đoạn ngắn hơn."); return; }
    const source = selection.text;
    const current = ++requestId.current;
    setTranslation({ source, value: "", loading: true, error: "" });
    setSelection(null);
    void translateEnglishToVietnamese([source]).then(([value]) => {
      if (requestId.current === current) setTranslation({ source, value, loading: false, error: "" });
    }).catch((error) => {
      if (requestId.current === current) setTranslation({ source, value: "", loading: false, error: error instanceof Error ? error.message : "Không dịch được lúc này." });
    });
  };

  return <>
    {selection && <div className={`br-select-toolbar ${selection.y < 100 ? "is-below" : ""}`} style={{ "--tool-x": `${selection.x}px`, top: selection.y } as CSSProperties} role="toolbar" aria-label="Công cụ văn bản đã chọn">
      <span title={selection.text}>{selection.text.length > 42 ? `${selection.text.slice(0, 42)}…` : selection.text}</span>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={highlight}><Highlighter size={16} /> Tô sáng</button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={translate}><Languages size={16} /> {selection.text.split(/\s+/).length === 1 ? "Dịch từ" : "Dịch đoạn"}</button>
      <button type="button" className="br-tool-close" aria-label="Đóng công cụ" onClick={() => setSelection(null)}><X size={15} /></button>
      {toolError && <small role="alert">{toolError}</small>}
    </div>}
    {translation && <aside className="br-translate-card" aria-label="Bản dịch tiếng Việt">
      <header><strong><Languages size={17} /> Dịch sang tiếng Việt</strong><button type="button" aria-label="Đóng bản dịch" onClick={() => { requestId.current++; setTranslation(null); }}><X size={17} /></button></header>
      <p className="br-translate-source">{translation.source}</p>
      {translation.loading ? <p role="status">Đang dịch…</p> : translation.error ? <p role="alert" className="br-translate-error">{translation.error}</p> : <p lang="vi">{translation.value}</p>}
    </aside>}
    {saveError && <p className="br-mark-save-error" role="alert">{saveError}</p>}
  </>;
}
