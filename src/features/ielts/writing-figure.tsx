import type { ReactNode } from "react";
import { visualKind } from "./bank-writing-library";

/**
 * A Writing Task 1 figure drawn small from the task's own data, so a card's
 * cover is the question itself: chart title, axes, labelled categories and a
 * legend for line and bar charts; pies; the real table cells; process steps;
 * and map features. Mixed figures show their first two panels side by side.
 */
type Spec = Record<string, unknown>;
const palette = ["#e46f67", "#3f7fd6", "#e3a21a", "#2fa36b", "#9a63c9", "#1f9aa8"];
const W = 320, H = 210;

const text = (value: unknown, max = 40) => {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};
const numbers = (values: unknown) => (Array.isArray(values) ? values : []).map((value) => Number(String(value).replace(/[^\d.-]/g, "")) || 0);
const asSpec = (value: unknown): Spec | null => value && typeof value === "object" && !Array.isArray(value) ? value as Spec : null;

function kindOf(spec: Spec) {
  if (Array.isArray(spec.panels)) return "mixed";
  if (Array.isArray(spec.snapshots)) return "map";
  if (Array.isArray(spec.steps)) return "process";
  if (Array.isArray(spec.rows)) return "table";
  return visualKind(String(spec.kind ?? spec.chart_type ?? spec.type ?? "line"));
}

export function TaskFigure({ visual }: { visual: unknown }) {
  const spec = asSpec(visual);
  if (!spec) return null;
  return <svg className="wl-figure-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={text(spec.title, 120) || "Biểu đồ của đề"}>
    <rect width={W} height={H} fill="#fff" />
    <Figure spec={spec} width={W} height={H} />
  </svg>;
}

function Figure({ spec, width, height }: { spec: Spec; width: number; height: number }): ReactNode {
  const kind = kindOf(spec);
  const title = text(spec.title, width > 200 ? 58 : 30);
  const top = title ? 22 : 8;
  const body = (() => {
    if (kind === "mixed") {
      const panels = (spec.panels as unknown[]).map(asSpec).filter((panel): panel is Spec => Boolean(panel)).slice(0, 2);
      const share = width / Math.max(1, panels.length);
      return panels.map((panel, index) => <svg key={index} x={index * share} y={top} width={share} height={height - top} viewBox={`0 0 ${share} ${height - top}`}><Figure spec={panel} width={share} height={height - top} /></svg>);
    }
    if (kind === "map") return <MapFigure spec={spec} top={top} width={width} height={height} />;
    if (kind === "process") return <ProcessFigure spec={spec} top={top} width={width} height={height} />;
    if (kind === "table") return <TableFigure spec={spec} top={top} width={width} height={height} />;
    if (kind === "pie") return <PieFigure spec={spec} top={top} width={width} height={height} />;
    return <AxisFigure spec={spec} bars={kind === "bar"} top={top} width={width} height={height} />;
  })();
  return <>
    {title && <text x={width / 2} y={14} textAnchor="middle" fontSize={width > 200 ? 9.5 : 8} fontWeight={700} fill="#1d2a3a">{title}</text>}
    {body}
  </>;
}

type Box = { spec: Spec; top: number; width: number; height: number };

function Legend({ names, y, width }: { names: string[]; y: number; width: number }) {
  const shown = names.slice(0, 5);
  const slot = width / Math.max(1, shown.length);
  return <g>{shown.map((name, index) => <g key={index} transform={`translate(${index * slot + 6} ${y})`}>
    <rect width={7} height={7} y={-6} rx={1.5} fill={palette[index % palette.length]} />
    <text x={10} fontSize={7} fill="#47586a">{text(name, Math.max(6, Math.floor(slot / 4.6)))}</text>
  </g>)}</g>;
}

function AxisFigure({ spec, bars, top, width, height }: Box & { bars: boolean }) {
  const series = (Array.isArray(spec.series) ? spec.series : []).map(asSpec).filter((item): item is Spec => Boolean(item)).slice(0, 6);
  const axis = asSpec(spec.x_axis) ?? {};
  const values = series.map((item) => numbers(item.values));
  const count = Math.max(1, ...values.map((row) => row.length));
  const categories = (Array.isArray(axis.categories) ? axis.categories : []).map((item) => text(item, 8));
  const max = Math.max(1, ...values.flat());
  const left = 28, right = width - 8, bottom = height - (series.length > 1 ? 30 : 18), plotTop = top + 6;
  const y = (value: number) => bottom - (value / max) * (bottom - plotTop);
  const step = (right - left) / count;
  const labelEvery = Math.ceil(count / Math.max(2, Math.floor((right - left) / 30)));
  return <g>
    {[0, 0.25, 0.5, 0.75, 1].map((share) => <g key={share}>
      <line x1={left} x2={right} y1={y(max * share)} y2={y(max * share)} stroke="#e7ecf0" strokeWidth={0.6} />
      <text x={left - 3} y={y(max * share) + 2.5} textAnchor="end" fontSize={6.5} fill="#7a8a99">{Math.round(max * share)}</text>
    </g>)}
    <line x1={left} x2={right} y1={bottom} y2={bottom} stroke="#9aa8b5" strokeWidth={0.8} />
    {bars ? values.map((row, seriesIndex) => row.map((value, index) => {
      const barWidth = Math.max(1.5, (step * 0.72) / values.length);
      return <rect key={`${seriesIndex}-${index}`} x={left + index * step + step * 0.14 + seriesIndex * barWidth} y={y(value)} width={barWidth - 0.4} height={bottom - y(value)} fill={palette[seriesIndex % palette.length]} />;
    })) : values.map((row, seriesIndex) => <g key={seriesIndex}>
      <polyline fill="none" stroke={palette[seriesIndex % palette.length]} strokeWidth={1.6} strokeLinejoin="round" points={row.map((value, index) => `${left + index * step + step / 2},${y(value)}`).join(" ")} />
      {row.map((value, index) => <circle key={index} cx={left + index * step + step / 2} cy={y(value)} r={1.5} fill={palette[seriesIndex % palette.length]} />)}
    </g>)}
    {categories.slice(0, count).map((label, index) => index % labelEvery === 0 && <text key={index} x={left + index * step + step / 2} y={bottom + 9} textAnchor="middle" fontSize={6.5} fill="#5d6d7c">{label}</text>)}
    {series.length > 1 && <Legend names={series.map((item, index) => String(item.name ?? `Series ${index + 1}`))} y={height - 6} width={width} />}
  </g>;
}

function PieFigure({ spec, top, width, height }: Box) {
  const series = (Array.isArray(spec.series) ? spec.series : []).map(asSpec).filter((item): item is Spec => Boolean(item)).slice(0, 3);
  const axis = asSpec(spec.x_axis) ?? {};
  const labels = (Array.isArray(axis.categories) ? axis.categories : []).map(String);
  const pies = series.length ? series : [];
  const slot = width / Math.max(1, pies.length);
  const radius = Math.min(slot / 2 - 10, (height - top - 30) / 2);
  return <g>
    {pies.map((item, pieIndex) => {
      const values = numbers(item.values);
      const sum = values.reduce((total, value) => total + value, 0) || 1;
      const cx = slot * pieIndex + slot / 2, cy = top + 6 + radius;
      let angle = -Math.PI / 2;
      return <g key={pieIndex}>
        {values.map((value, index) => {
          const start = angle, end = angle + (value / sum) * Math.PI * 2;
          angle = end;
          const large = end - start > Math.PI ? 1 : 0;
          return <path key={index} d={`M${cx} ${cy} L${cx + radius * Math.cos(start)} ${cy + radius * Math.sin(start)} A${radius} ${radius} 0 ${large} 1 ${cx + radius * Math.cos(end)} ${cy + radius * Math.sin(end)} Z`} fill={palette[index % palette.length]} stroke="#fff" strokeWidth={0.8} />;
        })}
        {pies.length > 1 && <text x={cx} y={cy + radius + 10} textAnchor="middle" fontSize={7} fontWeight={700} fill="#47586a">{text(item.name, 14)}</text>}
      </g>;
    })}
    {labels.length > 0 && <Legend names={labels} y={height - 5} width={width} />}
  </g>;
}

function TableFigure({ spec, top, width, height }: Box) {
  const rows = (spec.rows as unknown[]).filter(Array.isArray).slice(0, 7) as unknown[][];
  const columns = Math.min(5, Math.max(1, ...rows.map((row) => row.length)));
  const cellWidth = (width - 12) / columns, cellHeight = Math.min(22, (height - top - 6) / Math.max(1, rows.length));
  return <g>{rows.map((row, rowIndex) => Array.from({ length: columns }, (_, column) => {
    const x = 6 + column * cellWidth, y = top + 2 + rowIndex * cellHeight;
    return <g key={`${rowIndex}-${column}`}>
      <rect x={x} y={y} width={cellWidth} height={cellHeight} fill={rowIndex === 0 ? "#f6c79c" : column === 0 ? "#fdeedd" : rowIndex % 2 ? "#fffaf4" : "#fff"} stroke="#ecd3ba" strokeWidth={0.5} />
      <text x={x + cellWidth / 2} y={y + cellHeight / 2 + 2.5} textAnchor="middle" fontSize={Math.min(7.5, cellHeight * 0.42)} fontWeight={rowIndex === 0 || column === 0 ? 700 : 400} fill="#3a2c1f">{text(row[column], Math.max(4, Math.floor(cellWidth / 4.4)))}</text>
    </g>;
  }))}</g>;
}

function ProcessFigure({ spec, top, width, height }: Box) {
  const steps = (spec.steps as unknown[]).map((step) => asSpec(step)?.label ?? step).slice(0, 8);
  const perRow = Math.min(4, Math.max(2, Math.ceil(steps.length / 2)));
  const rowsCount = Math.ceil(steps.length / perRow);
  const gap = 12, boxWidth = (width - 12 - gap * (perRow - 1)) / perRow, boxHeight = Math.min(42, (height - top - 10 - gap * (rowsCount - 1)) / rowsCount);
  return <g>{steps.map((step, index) => {
    const row = Math.floor(index / perRow), slot = index % perRow;
    const column = row % 2 ? perRow - 1 - slot : slot;
    const x = 6 + column * (boxWidth + gap), y = top + 4 + row * (boxHeight + gap);
    const last = index === steps.length - 1, endOfRow = slot === perRow - 1;
    return <g key={index}>
      <rect x={x} y={y} width={boxWidth} height={boxHeight} rx={5} fill="#e8f1ff" stroke="#5b8fd9" strokeWidth={0.8} />
      <text x={x + 5} y={y + 9} fontSize={6.5} fontWeight={800} fill="#3f6fb5">{index + 1}</text>
      <text x={x + boxWidth / 2} y={y + boxHeight / 2 + 3} textAnchor="middle" fontSize={7} fill="#1d2a3a">{text(step, Math.floor(boxWidth / 4.2))}</text>
      {!last && (endOfRow
        ? <path d={`M${x + boxWidth / 2} ${y + boxHeight} v${gap - 2}`} stroke="#5b8fd9" strokeWidth={1} markerEnd="url(#wl-arrow)" />
        : <path d={row % 2 ? `M${x} ${y + boxHeight / 2} h${-gap + 2}` : `M${x + boxWidth} ${y + boxHeight / 2} h${gap - 2}`} stroke="#5b8fd9" strokeWidth={1} markerEnd="url(#wl-arrow)" />)}
    </g>;
  })}
    <defs><marker id="wl-arrow" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={5} markerHeight={5} orient="auto"><path d="M0 0 6 3 0 6Z" fill="#5b8fd9" /></marker></defs>
  </g>;
}

function MapFigure({ spec, top, width, height }: Box) {
  const snapshots = (spec.snapshots as unknown[]).map(asSpec).filter((item): item is Spec => Boolean(item)).slice(0, 2);
  const share = (width - 6) / Math.max(1, snapshots.length);
  const fills = ["#cfe0f5", "#f6dcc4", "#d9ecd0", "#efd2e4", "#fbeab0"];
  return <g>{snapshots.map((snapshot, index) => {
    const x0 = 4 + index * share, w = share - 6, h = height - top - 16;
    const features = (Array.isArray(snapshot.features) ? snapshot.features : []).map(asSpec).filter((item): item is Spec => Boolean(item)).slice(0, 16);
    return <g key={index}>
      <text x={x0 + w / 2} y={top + 6} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#47586a">{text(snapshot.label ?? `Map ${index + 1}`, 18)}</text>
      <rect x={x0} y={top + 10} width={w} height={h} fill="#f2f7ef" stroke="#b9cbb5" strokeWidth={0.7} />
      {features.map((feature, featureIndex) => {
        const fx = x0 + (Number(feature.x) || 0) / 100 * w, fy = top + 10 + (Number(feature.y) || 0) / 100 * h;
        const fw = Math.max(4, (Number(feature.w) || 8) / 100 * w), fh = Math.max(4, (Number(feature.h) || 8) / 100 * h);
        return <g key={featureIndex}>
          <rect x={fx} y={fy} width={fw} height={fh} rx={feature.shape === "circle" ? Math.min(fw, fh) / 2 : 1.5} fill={fills[featureIndex % fills.length]} stroke="#8fa2b3" strokeWidth={0.5} />
          {fw > 18 && <text x={fx + fw / 2} y={fy + fh / 2 + 2} textAnchor="middle" fontSize={5.5} fill="#2c3a48">{text(feature.label, Math.floor(fw / 3.2))}</text>}
        </g>;
      })}
    </g>;
  })}</g>;
}
