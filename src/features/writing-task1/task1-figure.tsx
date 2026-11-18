"use client";
/*
 * Draws a Task 1 figure: the package's chart specs (line, bar, pie, table, mixed panels) as inline SVG,
 * or a supplied diagram (maps and processes) as an image the learner can open full size.
 */
import { useState } from "react";
import { Maximize2, X } from "lucide-react";
import type { CartesianSpec, ChartSeries, ChartSpec, Task1Visual } from "@/lib/writing-task1/types";

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
