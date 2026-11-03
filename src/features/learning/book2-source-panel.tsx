"use client";

import Image from "next/image";
import { BookOpenText, Headphones, Table2 } from "lucide-react";
import type { Book2Content } from "./book2-lesson";

/** Keep the material needed to answer a question beside the questions. */
export function Book2SourcePanel({ content, practice = false }: { content: Book2Content; practice?: boolean }) {
  const hasSources = content.passages.length + content.audios.length + content.visuals.length > 0;
  if (!hasSources) return null;
  return <section className={`book2-sources ${practice ? "book2-sources-practice" : ""}`} aria-label="Tư liệu của bài">
    {practice && <header className="book2-sources-heading"><h2>Tư liệu để làm bài</h2><p>Đọc, nghe hoặc xem số liệu ngay khi trả lời. Bài làm của bạn vẫn được giữ.</p></header>}
    {content.passages.map((passage) => <article className="book2-card book2-source" id={`source-${passage.id}`} key={passage.id}>
      <h2><BookOpenText size={20} /> Bài đọc · {passage.title ?? passage.id}</h2>
      <div className="book2-passage">{passage.text.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
    </article>)}
    {content.audios.map((audio) => <article className="book2-card book2-source" id={`source-${audio.id}`} key={audio.id}>
      <h2><Headphones size={20} /> Bài nghe · {audio.title ?? audio.id}</h2>
      {audio.audio_url ? <audio controls preload="metadata" src={audio.audio_url} /> : <p>Audio đang được bổ sung. Bài này chưa tính là bài luyện nghe hoàn chỉnh.</p>}
      {audio.transcript && <details><summary>Hiện transcript sau khi nghe</summary><pre className="book2-transcript">{audio.transcript}</pre></details>}
    </article>)}
    {content.visuals.map((visual) => <article className="book2-card book2-source" id={`source-${visual.id}`} key={visual.id}>
      <h2><Table2 size={20} /> {visual.title ?? visual.id}</h2>
      {visual.image_url && <Image className="book2-visual" src={visual.image_url} alt={visual.title ?? visual.id} width={900} height={520} unoptimized />}
      {visual.rows?.length ? <div className="book2-table-wrap"><table><thead><tr>{visual.headers?.map((head) => <th key={head}>{head}</th>)}</tr></thead><tbody>{visual.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
    </article>)}
  </section>;
}
