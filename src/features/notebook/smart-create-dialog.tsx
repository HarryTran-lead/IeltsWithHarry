"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { covers, papers, type Cover, type Paper } from "./smart-model";

const coverNames: Record<Cover, string> = { teal: "Xanh ngọc", blue: "Xanh lam", lavender: "Tím oải hương", coral: "Cam đào", sand: "Vàng cát" };
const paperNames: Record<Paper, string> = { blank: "Trang trắng", ruled: "Kẻ dòng", grid: "Ô vuông" };
const steps = ["Chọn bìa", "Thông tin", "Mẫu giấy"] as const;

export function SmartCreateDialog({ title, description, folder, cover, paper, busy, onTitle, onDescription, onFolder, onCover, onPaper, onCancel, onCreate }: {
  title: string; description: string; folder: string; cover: Cover; paper: Paper; busy: boolean;
  onTitle: (value: string) => void; onDescription: (value: string) => void; onFolder: (value: string) => void;
  onCover: (value: Cover) => void; onPaper: (value: Paper) => void;
  onCancel: () => void; onCreate: () => void;
}) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") cancelRef.current(); };
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, []);

  return createPortal(<div className="smart-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div ref={dialogRef} className="smart-create-dialog" role="dialog" aria-modal="true" aria-labelledby="smart-create-title" tabIndex={-1}>
      <header><div><h2 id="smart-create-title">Tạo sổ tay mới</h2><p>Chọn bìa, đặt tên và thiết lập theo sở thích của bạn.</p></div><button aria-label="Đóng" onClick={onCancel}><X size={19} /></button></header>
      <div className="smart-create-body"><nav aria-label="Các bước tạo sổ tay">{steps.map((label, index) => <button key={label} className={step === index ? "active" : ""} onClick={() => setStep(index)}><span>{index < step ? <Check size={14} /> : index + 1}</span>{label}</button>)}</nav>
        <div className="smart-create-content">
          {step === 0 && <><h3>Chọn bìa sổ</h3><div className="smart-cover-choices">{covers.map((item) => <button key={item} className={cover === item ? `chosen ${item}` : item} aria-label={coverNames[item]} aria-pressed={cover === item} onClick={() => onCover(item)}><span className={`smart-cover-choice-art ${item}`}><span className="smart-choice-binding" /><span className="smart-choice-title">{item === "lavender" ? "ENGLISH\nGRAMMAR" : item === "coral" ? "WRITING" : "Notebook"}</span></span><small>{coverNames[item]}</small>{cover === item && <span className="smart-choice-check"><Check size={15} /></span>}</button>)}</div></>}
          {step === 1 && <><h3>Thông tin sổ tay</h3><div className="smart-create-info"><label>Tên sổ tay <span>*</span><input autoFocus maxLength={100} value={title} onChange={(event) => onTitle(event.target.value)} placeholder="Ví dụ: IELTS Vocabulary" /><small>{title.length}/100</small></label><label>Mô tả (tùy chọn)<textarea rows={4} maxLength={300} value={description} onChange={(event) => onDescription(event.target.value)} placeholder="Ghi chú, các topic, collocations và ý tưởng trả lời..." /><small>{description.length}/300</small></label><label>Thư mục (tùy chọn)<input maxLength={60} list="smart-folder-suggestions" value={folder} onChange={(event) => onFolder(event.target.value)} placeholder="Ví dụ: IELTS" /><datalist id="smart-folder-suggestions"><option value="IELTS" /><option value="Học tập" /><option value="Cá nhân" /></datalist></label></div></>}
          {step === 2 && <><h3>Chọn mẫu giấy</h3><div className="smart-paper-choices">{papers.map((item) => <button key={item} aria-pressed={paper === item} className={paper === item ? "chosen" : ""} onClick={() => onPaper(item)}><span className={`smart-paper-preview ${item}`} /><strong>{paperNames[item]}</strong></button>)}</div><p className="smart-create-hint">Bạn có thể đổi loại giấy riêng cho từng trang sau khi tạo sổ.</p></>}
        </div>
      </div>
      <footer><button className="button subtle" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>{step === 0 ? "Hủy" : <><ChevronLeft size={16} /> Quay lại</>}</button>{step < 2 ? <button className="button primary" onClick={() => setStep(step + 1)}>Tiếp theo <ChevronRight size={16} /></button> : <button className="button primary" disabled={busy || !title.trim()} onClick={onCreate}>{busy ? "Đang tạo…" : "Tạo sổ tay"}</button>}</footer>
    </div>
  </div>, document.body);
}

export function SmartCoverPreview({ cover, title }: { cover: Cover; title: string }) {
  return <span className={`smart-cover-choice-art ${cover}`}><span className="smart-choice-binding" /><span className="smart-choice-title">{title || "Notebook"}</span></span>;
}

export function SmartCoverPicker({ current, onSelect, onCancel }: { current: Cover; onSelect: (value: Cover) => void; onCancel: () => void }) {
  return createPortal(<div className="smart-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="smart-create-dialog smart-cover-picker" role="dialog" aria-modal="true" aria-label="Đổi bìa sổ tay"><header><div><h2>Đổi bìa sổ tay</h2><p>Chọn bìa bạn muốn dùng.</p></div><button aria-label="Đóng" onClick={onCancel}><X size={19} /></button></header><div className="smart-create-content"><div className="smart-cover-choices">{covers.map((item) => <button key={item} className={current === item ? `chosen ${item}` : item} aria-pressed={current === item} onClick={() => onSelect(item)}><SmartCoverPreview cover={item} title="Notebook" /><small>{coverNames[item]}</small>{current === item && <span className="smart-choice-check"><Check size={15} /></span>}</button>)}</div></div></section></div>, document.body);
}
