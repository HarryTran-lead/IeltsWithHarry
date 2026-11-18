"use client";
/*
 * Draws a Task 1 figure: the package's chart specs (line, bar, pie, table, mixed panels) as inline SVG,
 * or a supplied diagram (maps and processes) as an image the learner can open full size.
 */
import { useId, useState } from "react";
import { Maximize2, X } from "lucide-react";
import type { CartesianSpec, ChartSeries, ChartSpec, MapSpec, ProcessSpec, Task1Visual } from "@/lib/writing-task1/types";

const palette = ["#2577c8", "#e0803a", "#2f9e6f", "#8a63d2", "#d2524a", "#6b7c93"];

export function Task1Figure({ visual, unit }: { visual: Task1Visual; unit?: string }) {
  const [open, setOpen] = useState(false);
  if (visual.type === "image") return <figure className="t1-figure is-image">
    <button type="button" className="t1-zoom" onClick={() => setOpen(true)} aria-label="Phóng to hình">
      {/* eslint-disable-next-line @next/next/no-img-element -- static diagrams from public/, sized by CSS */}
      <img src={visual.src} alt={visual.alt} loading="lazy"/>
      <span><Maximize2 size={14}/> Phóng to</span>
    </button>
    {open && <div className="t1-lightbox" role="dialog" aria-modal="true" aria-label={visual.alt} onClick={() => setOpen(false)}>
      <button type="button" className="t1-lightbox-close" onClick={() => setOpen(false)} aria-label="Đóng"><X size={20}/></button>
      {/* eslint-disable-next-line @next/next/no-img-element -- full-size view of the same diagram */}
      <img src={visual.src} alt="" onClick={(event) => event.stopPropagation()}/>
    </div>}
  </figure>;
  return <figure className="t1-figure"><Chart spec={visual.spec}/>{unit && <figcaption>Đơn vị: {unit}</figcaption>}</figure>;
}

function Chart({ spec }: { spec: ChartSpec }) {
  if (spec.kind === "process") return <div className="t1-chart"><b className="t1-chart-title">{spec.title}</b><ProcessDiagram spec={spec}/></div>;
  if (spec.kind === "map") return <div className="t1-chart"><b className="t1-chart-title">{spec.title}</b><MapPanels spec={spec}/></div>;
  if (spec.kind === "mixed") return <div className="t1-mixed"><b className="t1-chart-title">{spec.title}</b><div>{spec.panels.map((panel, index) => <Chart key={index} spec={panel}/>)}</div></div>;
  if (spec.kind === "table") return <div className="t1-table-wrap"><b className="t1-chart-title">{spec.title}</b>
    <table className="t1-table"><thead><tr>{spec.rows[0].map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
      <tbody>{spec.rows.slice(1).map((row, index) => <tr key={index} className={/^total$/i.test(row[0]) ? "is-total" : ""}>{row.map((cell, cellIndex) => cellIndex ? <td key={cellIndex}>{cell}</td> : <th key={cellIndex} scope="row">{cell}</th>)}</tr>)}</tbody>
    </table></div>;
  if (spec.kind === "pie") return <div className="t1-chart"><b className="t1-chart-title">{spec.title}</b>
    <div className="t1-pies">{spec.series.map((series) => <Pie key={series.name} series={series} categories={spec.x_axis.categories}/>)}</div>
    <Legend names={spec.x_axis.categories}/></div>;
  return <div className="t1-chart"><b className="t1-chart-title">{spec.title}</b><Cartesian spec={spec}/>{spec.series.length > 1 && <Legend names={spec.series.map((series) => series.name)}/>}</div>;
}

function Legend({ names }: { names: string[] }) {
  return <ul className="t1-legend">{names.map((name, index) => <li key={name}><i style={{ background: palette[index % palette.length] }}/>{name}</li>)}</ul>;
}

function niceMax(value: number) {
  const step = 10 ** Math.floor(Math.log10(value || 1));
  for (const factor of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (factor * step >= value) return factor * step;
  return 10 * step;
}

function Cartesian({ spec }: { spec: CartesianSpec }) {
  const width = 560, height = 280, left = 46, right = 14, top = 14, bottom = 34;
  const categories = spec.x_axis.categories;
  const max = niceMax(Math.max(...spec.series.flatMap((series) => series.values)) * 1.08);
  const ticks = Array.from({ length: 6 }, (_, index) => (max / 5) * index);
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;
  const band = plotWidth / categories.length;
  const x = (index: number) => left + band * index + band / 2;
  const label = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  return <svg className="t1-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.title}>
    {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="t1-grid"/><text x={left - 8} y={y(tick) + 4} textAnchor="end" className="t1-tick">{label(tick)}</text></g>)}
    {categories.map((category, index) => <text key={category} x={x(index)} y={height - 12} textAnchor="middle" className="t1-tick">{category}</text>)}
    {spec.kind === "line" ? spec.series.map((series, seriesIndex) => <g key={series.name} style={{ color: palette[seriesIndex % palette.length] }}>
      <polyline fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round" points={series.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")}/>
      {series.values.map((value, index) => <g key={index}><circle cx={x(index)} cy={y(value)} r={4} fill="#fff" stroke="currentColor" strokeWidth={2.2}/><title>{`${series.name}, ${categories[index]}: ${value}`}</title></g>)}
    </g>) : categories.map((category, index) => {
      const inner = Math.min(band * 0.76, 44 * spec.series.length);
      const barWidth = inner / spec.series.length;
      return <g key={category}>{spec.series.map((series, seriesIndex) => {
        const value = series.values[index];
        const bx = x(index) - inner / 2 + barWidth * seriesIndex;
        return <g key={series.name}>
          <rect x={bx + 1.5} y={y(value)} width={barWidth - 3} height={y(0) - y(value)} rx={3} fill={palette[seriesIndex % palette.length]}><title>{`${series.name}, ${category}: ${value}`}</title></rect>
          <text x={bx + barWidth / 2} y={y(value) - 5} textAnchor="middle" className="t1-value">{value}</text>
        </g>;
      })}</g>;
    })}
    <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="t1-axis"/>
  </svg>;
}

function Pie({ series, categories }: { series: ChartSeries; categories: string[] }) {
  const total = series.values.reduce((sum, value) => sum + value, 0) || 1;
  const radius = 78, center = 90;
  const point = (theta: number, r = radius) => `${center + r * Math.cos(theta)},${center + r * Math.sin(theta)}`;
  const slices = series.values.map((value, index) => {
    const before = series.values.slice(0, index).reduce((sum, item) => sum + item, 0);
    const start = -Math.PI / 2 + (before / total) * Math.PI * 2;
    const sweep = (value / total) * Math.PI * 2;
    const end = start + sweep;
    return { index, value, path: `M${center},${center} L${point(start)} A${radius},${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(end)} Z`, label: point(start + sweep / 2, radius * 0.64) };
  });
  return <div className="t1-pie"><svg className="t1-svg" viewBox="0 0 180 180" role="img" aria-label={`${series.name}: ${categories.map((name, index) => `${name} ${series.values[index]}%`).join(", ")}`}>
    {slices.map((slice) => <g key={slice.index}><path d={slice.path} fill={palette[slice.index % palette.length]} stroke="#fff" strokeWidth={2}><title>{`${categories[slice.index]}: ${slice.value}%`}</title></path>
      {slice.value >= 6 && <text x={slice.label.split(",")[0]} y={Number(slice.label.split(",")[1]) + 4} textAnchor="middle" className="t1-slice">{slice.value}%</text>}</g>)}
  </svg><b>{series.name}</b></div>;
}

/** Splits a stage label into short lines so it fits inside its box. */
function wrap(text: string, width: number) {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.slice(0, 3);
}

/**
 * A process from data: numbered boxes in reading order (a snake of rows, or a ring for a cycle) joined by arrows.
 * Arrows stop at the box edges so their heads stay visible, and a labelled arrow shows its condition.
 */
function ProcessDiagram({ spec }: { spec: ProcessSpec }) {
  const arrowId = `t1-arrow-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const count = spec.stages.length;
  const boxW = 150, boxH = 62, gapX = 40, gapY = 46;
  const cycle = spec.process_type === "cycle";
  const cols = cycle ? 0 : count <= 4 ? count : 3;
  const width = cycle ? 560 : cols * boxW + (cols - 1) * gapX + 20;
  const rows = cycle ? 0 : Math.ceil(count / cols);
  const height = cycle ? 420 : rows * boxH + (rows - 1) * gapY + 20;
  const centre = (index: number) => {
    if (cycle) {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      return { x: width / 2 + 205 * Math.cos(angle), y: height / 2 + 160 * Math.sin(angle) };
    }
    const row = Math.floor(index / cols);
    const col = row % 2 ? cols - 1 - (index % cols) : index % cols;
    return { x: 10 + col * (boxW + gapX) + boxW / 2, y: 10 + row * (boxH + gapY) + boxH / 2 };
  };
  const position = new Map(spec.stages.map((stage, index) => [stage.id, centre(index)]));
  const edgePoint = (from: { x: number; y: number }, to: { x: number; y: number }, gap: number) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    const t = Math.min(dx ? (boxW / 2 + gap) / Math.abs(dx) : Infinity, dy ? (boxH / 2 + gap) / Math.abs(dy) : Infinity);
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  return <svg className="t1-svg t1-process" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${spec.title}: ${spec.stages.map((stage, index) => `${index + 1}. ${stage.label_en}`).join(", ")}`}>
    <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#2b4a6b"/></marker></defs>
    {spec.edges.map((edge, index) => {
      const a = position.get(edge.from), b = position.get(edge.to);
      if (!a || !b) return null;
      const start = edgePoint(a, b, 2), end = edgePoint(b, a, 4);
      return <g key={index}>
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="t1-process-edge" markerEnd={`url(#${arrowId})`}/>
        {edge.label_en && <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 6} textAnchor="middle" className="t1-process-label">{edge.label_en}</text>}
      </g>;
    })}
    {spec.stages.map((stage, index) => {
      const { x, y } = centre(index);
      const lines = wrap(stage.label_en, 20);
      return <g key={stage.id}>
        <rect x={x - boxW / 2} y={y - boxH / 2} width={boxW} height={boxH} rx={10} className="t1-process-box"/>
        <circle cx={x - boxW / 2 + 14} cy={y - boxH / 2 + 14} r={10} className="t1-process-num"/>
        <text x={x - boxW / 2 + 14} y={y - boxH / 2 + 18} textAnchor="middle" className="t1-process-num-text">{index + 1}</text>
        {lines.map((line, lineIndex) => <text key={lineIndex} x={x + 8} y={y + 5 + (lineIndex - (lines.length - 1) / 2) * 15} textAnchor="middle" className="t1-process-text">{line}</text>)}
      </g>;
    })}
  </svg>;
}

const mapColours: Record<string, string> = {
  building: "#c9d3df", housing: "#f2c7a5", shop: "#f6d78b", school: "#b9d7f2", road: "#9aa7b5", path: "#d9c7a3", bridge: "#8b97a5",
  park: "#bfe3b4", trees: "#8ccf8a", farmland: "#e6e2a7", water: "#a8d4f0", "car-park": "#d6dbe1", other: "#e4e0ec",
};

/** A map from data: each panel is a 12×12 grid with north at the top; features keep their id across dates. */
function MapPanels({ spec }: { spec: MapSpec }) {
  const cell = 22, size = cell * 12;
  return <div className="t1-maps">{spec.panels.map((panel) => <figure key={panel.label} className="t1-map">
    <svg className="t1-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${panel.label}: ${panel.features.map((feature) => feature.name).join(", ")}`}>
      <rect width={size} height={size} className="t1-map-ground"/>
      {panel.features.map((feature) => {
        const lines = wrap(feature.name, Math.max(6, feature.w * 3));
        return <g key={feature.id}>
          <rect x={feature.x * cell + 1} y={feature.y * cell + 1} width={feature.w * cell - 2} height={feature.h * cell - 2} rx={feature.type === "water" ? 10 : 3} fill={mapColours[feature.type] ?? mapColours.other} className="t1-map-feature"/>
          {lines.map((line, index) => <text key={index} x={(feature.x + feature.w / 2) * cell} y={(feature.y + feature.h / 2) * cell + 4 + (index - (lines.length - 1) / 2) * 11} textAnchor="middle" className="t1-map-text">{line}</text>)}
        </g>;
      })}
      {spec.compass !== false && <g className="t1-compass" transform={`translate(${size - 18},20)`}><path d="M0 -12 L5 4 L0 0 L-5 4 Z"/><text y={16} textAnchor="middle">N</text></g>}
    </svg>
    <figcaption>{panel.label}</figcaption>
  </figure>)}</div>;
}
