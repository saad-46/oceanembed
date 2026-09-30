"use client";
/**
 * Vertical profile plot (value across, depth down) in plain SVG: lines, measured points, step
 * gradients, horizontal depth markers (MLD, thermocline, isotherms…), hover/keyboard readout and a
 * text alternative. Depth uses the same square-root axis as the profile chart, so the upper ocean is
 * stretched. Nothing is interpolated: lines join the values given, gaps (null) break them.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface PlotSeries {
  key: string;
  label: string;
  color: string;
  points: { z: number; v: number | null }[];
  style?: "line" | "dots" | "step";
  dash?: string;
  band?: { z: number; lo: number; hi: number }[];
}

export interface PlotMarker {
  z: number;
  label: string;
  color: string;
  dash?: string;
}

const M = { l: 46, r: 14, t: 10, b: 36 };
const TICKS = [0, 10, 20, 50, 100, 200, 300, 500, 700, 1000];
const zy = (z: number) => Math.sqrt(Math.max(0, z));

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export default function DepthProfilePlot({
  series,
  markers = [],
  xLabel,
  units,
  zmax,
  height = 320,
  digits = 2,
  zeroLine = false,
  ariaLabel,
  description,
}: {
  series: PlotSeries[];
  markers?: PlotMarker[];
  xLabel: string;
  units: string;
  zmax: number;
  height?: number;
  digits?: number;
  zeroLine?: boolean;
  ariaLabel: string;
  description?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  const [hoverZ, setHoverZ] = useState<number | null>(null);
  const descId = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(() => series.map((s) => ({ ...s, points: s.points.filter((p) => p.z <= zmax) })), [series, zmax]);
  const [lo, hi] = useMemo(() => {
    const vals = visible.flatMap((s) => [...s.points.map((p) => p.v), ...(s.band ?? []).filter((b) => b.z <= zmax).flatMap((b) => [b.lo, b.hi])]).filter((v): v is number => v !== null && Number.isFinite(v));
    if (zeroLine) vals.push(0);
    if (!vals.length) return [0, 1];
    const a = Math.min(...vals), b = Math.max(...vals);
    const pad = (b - a || Math.abs(a) || 1) * 0.06;
    return [a - pad, b + pad];
  }, [visible, zmax, zeroLine]);

  const pw = w - M.l - M.r, ph = height - M.t - M.b;
  const x = (v: number) => M.l + ((v - lo) / (hi - lo)) * pw;
  const y = (z: number) => M.t + (zy(z) / zy(zmax)) * ph;
  const depths = useMemo(() => [...new Set(visible.flatMap((s) => s.points.filter((p) => p.v !== null).map((p) => p.z)))].sort((a, b) => a - b), [visible]);

  const pathFor = (pts: { z: number; v: number | null }[]) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (p.v === null || !Number.isFinite(p.v)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.v).toFixed(1)},${y(p.z).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const bandPath = (b: { z: number; lo: number; hi: number }[]) => {
    const pts = b.filter((q) => q.z <= zmax);
    if (pts.length < 2) return "";
    return `M${pts.map((q) => `${x(q.lo).toFixed(1)},${y(q.z).toFixed(1)}`).join("L")}L${[...pts].reverse().map((q) => `${x(q.hi).toFixed(1)},${y(q.z).toFixed(1)}`).join("L")}Z`;
  };

  const readout = hoverZ === null ? null : visible.map((s) => {
    let best: { z: number; v: number | null } | null = null;
    for (const p of s.points) if (p.v !== null && (!best || Math.abs(p.z - hoverZ) < Math.abs(best.z - hoverZ))) best = p;
    // step series: the layer containing hoverZ
    if (s.style === "step") {
      for (let k = 0; k + 1 < s.points.length; k++) {
        const a = s.points[k], b = s.points[k + 1];
        if (a.v !== null && a.v === b.v && hoverZ >= a.z && hoverZ <= b.z) best = { z: hoverZ, v: a.v };
      }
    }
    return { s, p: best && Math.abs(best.z - hoverZ) <= Math.max(6, hoverZ * 0.15) ? best : null };
  });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const py = e.clientY - r.top;
    if (py < M.t || py > M.t + ph) return setHoverZ(null);
    const t = (py - M.t) / ph;
    setHoverZ(Math.round((t * zy(zmax)) ** 2));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!depths.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Escape")) return;
    e.preventDefault();
    if (e.key === "Escape") return setHoverZ(null);
    const k = hoverZ === null ? -1 : depths.findIndex((d) => d >= hoverZ);
    const next = e.key === "ArrowDown" ? Math.min(depths.length - 1, k + 1) : Math.max(0, (k === -1 ? depths.length : k) - 1);
    setHoverZ(depths[next]);
  };

  const zt = TICKS.filter((t) => t <= zmax);
  const xt = niceTicks(lo, hi, Math.max(3, Math.floor(pw / 70)));

  return (
    <figure className="m-0">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 mb-1.5 text-[11.5px] text-ink-2" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            {s.style === "dots" ? (
              <span className="w-2 h-2 rounded-full border border-bg" style={{ background: s.color }} aria-hidden />
            ) : (
              <svg width="18" height="6" aria-hidden>
                <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
              </svg>
            )}
            {s.label}
          </li>
        ))}
        {markers.map((m) => (
          <li key={m.label} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={m.color} strokeWidth="1.5" strokeDasharray={m.dash ?? "4 3"} />
            </svg>
            {m.label}
          </li>
        ))}
      </ul>
      <div ref={box} className="relative w-full" style={{ height }}>
        <svg
          width={w}
          height={height}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={description ? descId : undefined}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setHoverZ(null)}
          onKeyDown={onKey}
          onBlur={() => setHoverZ(null)}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-md"
        >
          {zt.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={M.l + pw} y1={y(t)} y2={y(t)} stroke="#8a96a8" strokeOpacity={0.12} />
              <text x={M.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="#8a96a8" className="num">
                {t}
              </text>
            </g>
          ))}
          {xt.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.t} y2={M.t + ph} stroke="#8a96a8" strokeOpacity={0.1} />
              <text x={x(t)} y={M.t + ph + 14} textAnchor="middle" fontSize={10.5} fill="#8a96a8" className="num">
                {Math.abs(t) < 1e-9 ? 0 : +t.toPrecision(3)}
              </text>
            </g>
          ))}
          {zeroLine && lo < 0 && hi > 0 && <line x1={x(0)} x2={x(0)} y1={M.t} y2={M.t + ph} stroke="#8a96a8" strokeOpacity={0.5} />}
          <text x={M.l + pw / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="#8a96a8">
            {xLabel}
          </text>
          <text transform={`translate(11 ${M.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="#8a96a8">
            Depth (m)
          </text>
          {visible.map((s) => s.band && <path key={`${s.key}-band`} d={bandPath(s.band)} fill={s.color} fillOpacity={0.16} />)}
          {visible.map((s) =>
            s.style === "dots" ? (
              <g key={s.key}>
                {s.points.filter((p) => p.v !== null).map((p) => (
                  <circle key={p.z} cx={x(p.v!)} cy={y(p.z)} r={2.6} fill={s.color} stroke="#0b1320" strokeWidth={0.8} />
                ))}
              </g>
            ) : (
              <path key={s.key} d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth={s.style === "step" ? 1.6 : 2.2} strokeDasharray={s.dash} strokeLinejoin="round" />
            ),
          )}
          {markers.filter((m) => m.z <= zmax).map((m, k) => (
            <g key={m.label}>
              <line x1={M.l} x2={M.l + pw} y1={y(m.z)} y2={y(m.z)} stroke={m.color} strokeWidth={1.4} strokeDasharray={m.dash ?? "5 4"} />
              <text x={k % 2 ? M.l + 4 : M.l + pw - 3} y={y(m.z) - 3} textAnchor={k % 2 ? "start" : "end"} fontSize={10.5} fill={m.color} stroke="#0b1320" strokeWidth={3} paintOrder="stroke">
                {m.label} · {Math.round(m.z)} m
              </text>
            </g>
          ))}
          {hoverZ !== null && <line x1={M.l} x2={M.l + pw} y1={y(hoverZ)} y2={y(hoverZ)} stroke="#e8edf4" strokeOpacity={0.35} />}
        </svg>
        {readout && hoverZ !== null && (
          <div className="pointer-events-none absolute left-14 glass px-2.5 py-1.5 text-[11.5px] text-ink min-w-[150px]" style={{ top: Math.min(height - 90, Math.max(4, y(hoverZ) + 8)) }} role="status" aria-live="polite">
            <div className="num text-ink-2 mb-0.5">{hoverZ} m</div>
            {readout.map(({ s, p }) => (
              <div key={s.key} className="flex justify-between gap-3">
                <span style={{ color: s.color }}>{s.label}</span>
                <span className="num">{p && p.v !== null ? `${p.v.toFixed(digits)} ${units}` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {description && (
        <figcaption id={descId} className="sr-only">
          {description}
        </figcaption>
      )}
    </figure>
  );
}
