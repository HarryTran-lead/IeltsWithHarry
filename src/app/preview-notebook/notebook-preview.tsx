"use client";

import { useEffect, useState } from "react";
import { NotesWorkspace } from "@/features/notebook/quick-notes-workspace";
import type { NotebookEntry } from "@/features/notebook/notebook-store";
import type { NotebookInput } from "@/lib/validation/notebook";

const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
const note = (id: string, title: string, body: string, days: number, sourcePath = "/app/notebook"): NotebookEntry => ({
  id, kind: "note", title, body, meaningVi: "", example: "", sourcePath, createdAt: ago(days + 2), updatedAt: ago(days, 1),
});

const makeSeed = (): NotebookEntry[] => [
  note("00000000-0000-4000-8000-000000000001", "Lỗi sai: since vs for", "## Mình đã viết\n> I have lived here since 5 years.\n\n## Câu đúng\n> I have lived here **for** 5 years.\n\n## Vì sao sai\n- *since* + mốc thời gian (since 2020)\n- *for* + khoảng thời gian (for 5 years)\n\n## Lần sau nhớ\n- [x] Đọc lại quy tắc\n- [ ] Viết 3 câu tương tự\n\n#mistakes #grammar", 0),
  note("00000000-0000-4000-8000-000000000002", "Dàn ý Task 2: Remote work and cities", "## Đề bài\n> More people work from home. Is this a positive or negative development?\n\n## Quan điểm\n- Mostly ==positive== for workers, but cities must adapt\n\n## Body 1\n- Ý chính: saves commuting time\n- Ví dụ: 2 hours/day in Ho Chi Minh City\n\n## Từ vựng ăn điểm\n- **work-life balance**\n- **urban congestion**\n\n#writing #task2", 1),
  note("00000000-0000-4000-8000-000000000003", "Từ mới: mitigate", "## Từ / cụm từ\n**mitigate** (v) /ˈmɪtɪɡeɪt/\n\n## Nghĩa\n- giảm nhẹ, làm dịu\n\n## Collocation hay đi kèm\n- mitigate the impact / risk / effects\n\n#vocabulary #environment", 3, "/app/lesson/starter-u01-reading-city-gardens"),
  note("00000000-0000-4000-8000-000000000004", "Speaking Part 2: a place I'd like to visit", "## Cue card\n> Describe a place you would like to visit\n\n## Ý chính\n- What: Kyoto in autumn\n- Why it matters: temples + maple leaves\n\n#speaking", 9),
  note("00000000-0000-4000-8000-000000000005", "Tóm tắt: Listening Section 1 tips", "## 3 điều mình học được\n1. Đọc trước câu hỏi trong 30 giây\n2. Chú ý số và tên riêng được đánh vần\n3. Bẫy: người nói đổi ý\n\n## Việc cần làm\n- [ ] Luyện 2 đề Section 1\n- [ ] Ôn bảng chữ cái tiếng Anh\n\n#listening #lesson", 40, "/app/lesson/starter-u01-listening-exchange-programme"),
];

export function NotebookPreview() {
  // Timestamps are relative to now, so build them on the client only to avoid a hydration mismatch.
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => { setEntries(makeSeed()); setReady(true); }); return () => cancelAnimationFrame(frame); }, []);
  const addEntry = async (input: NotebookInput) => {
    const entry = { ...input, id: crypto.randomUUID(), sourcePath: "/app/notebook", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as NotebookEntry;
    setEntries((current) => [entry, ...current]);
    return entry;
  };
  const updateEntry = async (id: string, input: NotebookInput) => setEntries((current) => current.map((item) => (item.id === id ? { ...item, ...input, updatedAt: new Date().toISOString() } as NotebookEntry : item)));
  const removeEntry = async (id: string) => setEntries((current) => current.filter((item) => item.id !== id));
  return <div style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 16px" }}>
    <NotesWorkspace entries={entries} ready={ready} error="" books={[{ id: "b1", title: "Sổ tay IELTS 2025", updated_at: ago(60) }]} booksError={false} addEntry={addEntry} updateEntry={updateEntry} removeEntry={removeEntry} />
  </div>;
}
