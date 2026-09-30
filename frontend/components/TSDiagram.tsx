"use client";
/**
 * Temperature–salinity diagram: practical salinity across, potential temperature up, points coloured by
 * depth, σ0 isopycnals (computed server-side with TEOS-10 in the same coordinates). Plain SVG with a
 * hover/keyboard readout; values are exactly those returned by /v1/ts-profile.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TSPoint } from "@/lib/api";
import { gradientCss, rampStops, rgbCss } from "@/lib/colormap";

export interface TSSeriesSpec {
  key: string;
  label: string;
  symbol: "circle" | "square";
  points: TSPoint[];
}

const M = { l: 48, r: 16, t: 12, b: 40 };

function ticks(lo: number, hi: number, n: number) {
  const step0 = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export default function TSDiagram({ series, isopycnals, showIsopycnals, height = 440, ariaLabel }: { series: TSSeriesSpec[]; isopycnals: { sigma0: number; points: [number, number][] }[]; showIsopycnals: boolean; height?: number; ariaLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(520);
  const [hover, setHover] = useState<{ s: TSSeriesSpec; p: TSPoint } | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tableId = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.points);
  const [sLo, sHi, tLo, tHi, zMax] = useMemo(() => {
    if (!all.length) return [33, 36, 0, 30, 1000];
    const S = all.map((p) => p.salinity_psu), T = all.map((p) => p.potential_temperature_c);
    const ps = Math.max(0.1, (Math.max(...S) - Math.min(...S)) * 0.06), pt = Math.max(0.5, (Math.max(...T) - Math.min(...T)) * 0.05);
    return [Math.min(...S) - ps, Math.max(...S) + ps, Math.min(...T) - pt, Math.max(...T) + pt, Math.max(...all.map((p) => p.depth_m))];
  }, [all]);
  const pw = w - M.l - M.r, ph = height - M.t - M.b;
  const x = (s: number) => M.l + ((s - sLo) / (sHi - sLo)) * pw;
  const y = (t: number) => M.t + (1 - (t - tLo) / (tHi - tLo)) * ph;
  const col = (z: number) => rgbCss("depth", Math.sqrt(z / (zMax || 1)));
  const primary = series[0]?.points ?? [];
  const shown = hover ?? (focusIdx !== null && primary[focusIdx] ? { s: series[0], p: primary[focusIdx] } : null);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best: { s: TSSeriesSpec; p: TSPoint; d: number } | null = null;
    for (const s of series) for (const p of s.points) {
      const d = Math.hypot(x(p.salinity_psu) - mx, y(p.potential_temperature_c) - my);
      if (!best || d < best.d) best = { s, p, d };
    }
    setHover(best && best.d < 16 ? { s: best.s, p: best.p } : null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!primary.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(primary.length - 1, (i ?? -1) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, (i ?? primary.length) - 1));
    } else if (e.key === "Escape") setFocusIdx(null);
  };

  const clip = `ts-clip-${tableId.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <figure className="m-0">
      <div ref={box} className="relative w-full" style={{ height }}>
        <svg width={w} height={height} role="img" aria-label={ariaLabel} aria-describedby={tableId} tabIndex={0} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey} onBlur={() => setFocusIdx(null)} className="block outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-md">
          <defs>
            <clipPath id={clip}>
              <rect x={M.l} y={M.t} width={pw} height={ph} />
            </clipPath>
          </defs>
          {ticks(tLo, tHi, 6).map((t) => (
            <g key={`t${t}`}>
              <line x1={M.l} x2={M.l + pw} y1={y(t)} y2={y(t)} stroke="#8a96a8" strokeOpacity={0.1} />
              <text x={M.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="#8a96a8" className="num">{t}</text>
            </g>
          ))}
          {ticks(sLo, sHi, Math.max(3, Math.floor(pw / 80))).map((s) => (
            <g key={`s${s}`}>
              <line x1={x(s)} x2={x(s)} y1={M.t} y2={M.t + ph} stroke="#8a96a8" strokeOpacity={0.1} />
              <text x={x(s)} y={M.t + ph + 14} textAnchor="middle" fontSize={10.5} fill="#8a96a8" className="num">{s}</text>
            </g>
          ))}
          <text x={M.l + pw / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="#8a96a8">Practical salinity (PSS-78)</text>
          <text transform={`translate(12 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="#8a96a8">Potential temperature θ (°C)</text>
          {showIsopycnals && (
            <g clipPath={`url(#${clip})`}>
              {isopycnals.map((l) => {
                const d = l.points.map(([s, t], k) => `${k ? "L" : "M"}${x(s).toFixed(1)},${y(t).toFixed(1)}`).join("");
                const inside = l.points.filter(([s, t]) => s >= sLo && s <= sHi && t >= tLo && t <= tHi);
                const lab = inside[Math.floor(inside.length * 0.85)] ?? inside[inside.length - 1];
                return (
                  <g key={l.sigma0}>
                    <path d={d} fill="none" stroke="#8a96a8" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 3" />
                    {lab && (
                      <text x={x(lab[0])} y={y(lab[1]) - 3} fontSize={9.5} fill="#aab4c3" stroke="#0b1320" strokeWidth={2.5} paintOrder="stroke" className="num">
                        {l.sigma0.toFixed(1)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
          {series.map((s) => (
            <g key={s.key}>
              <path d={s.points.map((p, k) => `${k ? "L" : "M"}${x(p.salinity_psu).toFixed(1)},${y(p.potential_temperature_c).toFixed(1)}`).join("")} fill="none" stroke="#e8edf4" strokeOpacity={0.25} strokeWidth={1} />
              {s.points.map((p) =>
                s.symbol === "circle" ? (
                  <circle key={p.depth_m} cx={x(p.salinity_psu)} cy={y(p.potential_temperature_c)} r={3.2} fill={col(p.depth_m)} stroke="#0b1320" strokeWidth={0.7} />
                ) : (
                  <rect key={p.depth_m} x={x(p.salinity_psu) - 3.6} y={y(p.potential_temperature_c) - 3.6} width={7.2} height={7.2} fill={col(p.depth_m)} stroke="#e8edf4" strokeWidth={1} />
                ),
              )}
            </g>
          ))}
          {shown && <circle cx={x(shown.p.salinity_psu)} cy={y(shown.p.potential_temperature_c)} r={7} fill="none" stroke="#2ec5d8" strokeWidth={2} />}
        </svg>
        {shown && (
          <div
            className={`pointer-events-none absolute glass px-2.5 py-1.5 text-[11.5px] text-ink min-w-[170px] ${x(shown.p.salinity_psu) > M.l + pw / 2 ? "left-14" : "right-3"} ${y(shown.p.potential_temperature_c) < M.t + ph / 2 ? "bottom-12" : "top-3"}`}
            role="status"
            aria-live="polite"
          >
            <div className="text-ink-2 mb-0.5">{shown.s.label}</div>
            {(
              [
                ["Depth", `${shown.p.depth_m} m`],
                ["Temperature", `${shown.p.temperature_c.toFixed(2)} °C`],
                ["θ (0 dbar)", `${shown.p.potential_temperature_c.toFixed(2)} °C`],
                ["Salinity", `${shown.p.salinity_psu.toFixed(3)} PSU`],
                ["σ0", `${shown.p.sigma0_kg_m3.toFixed(2)} kg/m³`],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <span className="text-ink-3">{k}</span>
                <span className="num">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2 text-[11.5px] text-ink-2">
        <div className="flex items-center gap-2" aria-label={`Point colour: depth from 0 to ${Math.round(zMax)} m`}>
          <span>Depth</span>
          <span className="num">0</span>
          <span className="h-2.5 w-28 rounded-sm" style={{ background: gradientCss(rampStops("depth")) }} aria-hidden />
          <span className="num">{Math.round(zMax)} m</span>
        </div>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              {s.symbol === "circle" ? <circle cx="5" cy="5" r="4" fill="#5fb6d3" /> : <rect x="1" y="1" width="8" height="8" fill="#5fb6d3" stroke="#e8edf4" />}
            </svg>
            {s.label}
          </span>
        ))}
        {showIsopycnals && isopycnals.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke="#8a96a8" strokeDasharray="3 3" />
            </svg>
            σ0 isopycnals (kg/m³ − 1000)
          </span>
        )}
      </div>
      <details className="mt-2 text-[12px]" id={tableId}>
        <summary className="cursor-pointer text-ink-3 hover:text-ink-2 select-none">Data table ({all.length} points)</summary>
        <div className="max-h-64 overflow-auto mt-2">
          <table className="w-full text-[11.5px] num">
            <thead className="text-ink-3 text-left">
              <tr>
                <th className="font-normal pr-2">Series</th>
                <th className="font-normal pr-2">Depth (m)</th>
                <th className="font-normal pr-2">T (°C)</th>
                <th className="font-normal pr-2">θ (°C)</th>
                <th className="font-normal pr-2">S (PSU)</th>
                <th className="font-normal">σ0</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {series.flatMap((s) =>
                s.points.map((p) => (
                  <tr key={`${s.key}${p.depth_m}`}>
                    <td className="pr-2">{s.label}</td>
                    <td className="pr-2">{p.depth_m}</td>
                    <td className="pr-2">{p.temperature_c.toFixed(2)}</td>
                    <td className="pr-2">{p.potential_temperature_c.toFixed(2)}</td>
                    <td className="pr-2">{p.salinity_psu.toFixed(3)}</td>
                    <td>{p.sigma0_kg_m3.toFixed(2)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
