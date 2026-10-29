/* eslint-disable @next/next/no-img-element -- These are authored course diagrams in public assets. */
import styles from "./starter-visual.module.css";

export type StarterVisualData = { title?: string; stages?: string[]; labels?: string[]; data?: number[]; series?: Record<string, number[]>; panels?: { year?: string; cells?: string[][] }[]; notes?: string[] };

/** A readable in-page version of the exact diagram, map or chart named by the exercise. */
export function StarterVisual({ value, imageUrl, compact = false }: { value: StarterVisualData; imageUrl?: string; compact?: boolean }) {
  const stages = value.stages ?? [];
  const labels = value.labels ?? [];
  const data = value.data ?? [];
  const series = Object.entries(value.series ?? {});
  const panels = value.panels ?? [];
  return <figure className={`${styles.visual} ${compact ? styles.compact : ""}`}>
    {value.title && <figcaption>{value.title}</figcaption>}
    {imageUrl ? <img src={imageUrl} alt={value.title ?? "Biểu đồ của đề Writing"} loading="lazy" /> : null}
    {stages.length > 0 && <ol className={styles.flow}>{stages.map((stage, index) => <li key={index}><span>{index + 1}</span><p>{stage}</p></li>)}</ol>}
    {panels.length > 0 && <div className={styles.maps}>{panels.map((panel, index) => <div className={styles.map} key={index}><strong>{panel.year ?? `Bản đồ ${index + 1}`}</strong><div className={styles.mapGrid}>{panel.cells?.map((row, rowIndex) => <div key={rowIndex}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>)}</div></div>)}</div>}
    {labels.length > 0 && !imageUrl && <div className={styles.chart} role="img" aria-label={value.title ?? "Biểu đồ số liệu"}>{labels.map((label, index) => <div key={index}><b>{label}</b><i style={{ width: `${Math.max(3, (data[index] ?? series[0]?.[1]?.[index] ?? 0) / Math.max(...data, ...series.flatMap((entry) => entry[1]), 1) * 100)}%` }} /><span>{data[index] ?? series.map(([name, values]) => `${name}: ${values[index]}`).join(" · ")}</span></div>)}</div>}
    {value.notes?.length && !compact ? <ul className={styles.notes}>{value.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
  </figure>;
}
