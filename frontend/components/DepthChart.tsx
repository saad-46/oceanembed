"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ZoomOut } from "lucide-react";
import { rampStops, type RampName } from "@/lib/colormap";

/**
 * Depth × (time | distance) heatmap for the Ocean State Timeline and the vertical section.
 *
 * Honesty rules: values are the reconstructed standard depths; colours are linearly interpolated
 * between two neighbouring standard depths only for display, and never across a null (land/seabed).
 * Hover reports the value at the *nearest standard depth*, not an interpolated number.
 */
export interface ChartLine {
  name: string;
  color: string;
  values: (number | null)[]; // depth (m) per x, null = undefined at that x
  dash?: number[];
}
export interface ChartMarker {
  index: number;
  label: string;
}

const PAD = { l: 46, r: 10, t: 8, b: 26 };

/* ---------- pure helpers (unit-tested) ---------- */
export const depthToFrac = (z: number, zmax: number) => Math.sqrt(Math.max(0, Math.min(z, zmax)) / zmax); // sqrt axis: resolves the upper ocean
export const fracToDepth = (f: number, zmax: number) => Math.max(0, Math.min(1, f)) ** 2 * zmax;

export function nearestDepthIndex(z: number, depths: number[]): number {
  let k = 0;
  for (let i = 1; i < depths.length; i++) if (Math.abs(depths[i] - z) < Math.abs(depths[k] - z)) k = i;
  return k;
}

/** Display value at depth z in one column: linear between the bracketing standard depths, null across gaps. */
export function columnValueAt(col: (number | null)[], depths: number[], z: number): number | null {
  if (z <= depths[0]) return col[0];
  for (let k = 0; k < depths.length - 1; k++) {
    if (z >= depths[k] && z <= depths[k + 1]) {
      const a = col[k], b = col[k + 1];
      if (a === null || b === null) return null;
      return a + ((z - depths[k]) / (depths[k + 1] - depths[k])) * (b - a);
    }
  }
  return null;
}

/** Index range after a drag from pixel x0 to x1 over `n` visible columns starting at `lo`. */
export function zoomRange(x0: number, x1: number, plotW: number, lo: number, n: number): [number, number] | null {
  const a = Math.floor((Math.min(x0, x1) / plotW) * n), b = Math.ceil((Math.max(x0, x1) / plotW) * n) - 1;
  if (b - a < 2) return null; // too small to be a deliberate zoom
  return [lo + Math.max(0, a), lo + Math.min(n - 1, b)];
}

export function buildLut(ramp: RampName, n = 256): [number, number, number][] {
  const stops = rampStops(ramp).map((h) => [1, 3, 5].map((o) => parseInt(h.slice(o, o + 2), 16)) as [number, number, number]);
  return Array.from({ length: n }, (_, i) => {
    const f = (i / (n - 1)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(f)), t = f - k;
    return [0, 1, 2].map((c) => Math.round(stops[k][c] + t * (stops[k + 1][c] - stops[k][c]))) as [number, number, number];
  });
}

export default function DepthChart({
  x,
  xLabel,
  depths,
  values,
  vmin,
  vmax,
  ramp,
  zmax,
  units,
  digits = 1,
  lines = [],
  markers = [],
  selected,
  onSelect,
  height = 340,
  ariaLabel,
}: {
  x: number[];
  xLabel: (i: number) => string;
  depths: number[];
  values: (number | null)[][];
  vmin: number;
  vmax: number;
  ramp: RampName;
  zmax: number;
  units: string;
  digits?: number;
  lines?: ChartLine[];
  markers?: ChartMarker[];
  selected?: number | null;
  onSelect?: (i: number) => void;
  height?: number;
  ariaLabel: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(640);
  const [view, setView] = useState<[number, number] | null>(null); // zoomed index range
  const [hover, setHover] = useState<{ i: number; k: number; px: number; py: number } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; x1: number } | null>(null);
  const n = x.length;
  const [lo, hi] = view && view[1] < n ? view : [0, n - 1];
  const nv = Math.max(1, hi - lo + 1);
  const plotW = Math.max(10, w - PAD.l - PAD.r), plotH = height - PAD.t - PAD.b;
  const lut = useMemo(() => buildLut(ramp), [ramp]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext?.("2d");
    if (!c || !ctx) return; // jsdom / no canvas: the chart degrades to its accessible summary
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    // field: one image column per x sample, one row per pixel of depth, then scaled to the plot
    const rows = Math.max(1, Math.round(plotH));
    const img = ctx.createImageData(nv, rows);
    const cols = Array.from({ length: nv }, (_, c2) => values.map((row) => row[lo + c2]));
    for (let r = 0; r < rows; r++) {
      const z = fracToDepth((r + 0.5) / rows, zmax);
      for (let c2 = 0; c2 < nv; c2++) {
        const v = columnValueAt(cols[c2], depths, z);
        const o = (r * nv + c2) * 4;
        if (v === null) {
          img.data.set([22, 30, 42, 255], o); // land / below seabed
        } else {
          const t = Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin || 1)));
          const [R, G, B] = lut[Math.round(t * (lut.length - 1))];
          img.data.set([R, G, B, 255], o);
        }
      }
    }
    const off = document.createElement("canvas");
    off.width = nv;
    off.height = rows;
    off.getContext("2d")?.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = nv > plotW / 2;
    ctx.drawImage(off, PAD.l, PAD.t, plotW, plotH);
    const X = (i: number) => PAD.l + ((i - lo + 0.5) / nv) * plotW;
    const Y = (z: number) => PAD.t + depthToFrac(z, zmax) * plotH;
    // overlays
    for (const ln of lines) {
      ctx.beginPath();
      let pen = false;
      for (let i = lo; i <= hi; i++) {
        const z = ln.values[i];
        if (z === null || z === undefined || z > zmax) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(X(i), Y(z));
        else ctx.moveTo(X(i), Y(z));
        pen = true;
      }
      // dark halo first so light lines stay visible over warm colours
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(4,10,20,.75)";
      ctx.lineWidth = 3.6;
      ctx.stroke();
      ctx.setLineDash(ln.dash ?? []);
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const m of markers) {
      if (m.index < lo || m.index > hi) continue;
      ctx.strokeStyle = "rgba(232,237,244,.85)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(m.index), PAD.t);
      ctx.lineTo(X(m.index), PAD.t + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e8edf4";
      ctx.font = "10px ui-sans-serif, system-ui";
      ctx.fillText(m.label, Math.min(X(m.index) + 3, PAD.l + plotW - 90), PAD.t + 11);
    }
    if (selected !== null && selected !== undefined && selected >= lo && selected <= hi) {
      ctx.strokeStyle = "#2ec5d8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(selected), PAD.t);
      ctx.lineTo(X(selected), PAD.t + plotH);
      ctx.stroke();
    }
    // axes
    ctx.fillStyle = "#8a96a8";
    ctx.font = "10px ui-monospace, Consolas, monospace";
    ctx.textAlign = "right";
    for (const z of depths.filter((d) => d <= zmax && [0, 20, 50, 100, 150, 200, 300, 500, 700, 1000].includes(d))) ctx.fillText(`${z}`, PAD.l - 6, Y(z) + 3);
    ctx.save();
    ctx.translate(11, PAD.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("depth (m)", 0, 0);
    ctx.restore();
    ctx.textAlign = "center";
    const ticks = Math.max(2, Math.min(8, Math.floor(plotW / 110)));
    for (let t = 0; t <= ticks; t++) {
      const i = Math.round(lo + (t / ticks) * (nv - 1));
      ctx.fillText(xLabel(i), Math.max(PAD.l + 24, Math.min(PAD.l + plotW - 24, X(i))), height - 8);
    }
    if (drag) {
      ctx.fillStyle = "rgba(46,197,216,.18)";
      ctx.fillRect(PAD.l + Math.min(drag.x0, drag.x1), PAD.t, Math.abs(drag.x1 - drag.x0), plotH);
    }
  }, [w, height, values, depths, vmin, vmax, lut, zmax, lo, hi, nv, plotW, plotH, lines, markers, selected, drag, xLabel]);

  const toLocal = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { px: e.clientX - r.left - PAD.l, py: e.clientY - r.top - PAD.t };
  };
  const indexAt = (px: number) => Math.max(lo, Math.min(hi, lo + Math.floor((px / plotW) * nv)));

  const onMove = (e: ReactPointerEvent) => {
    const { px, py } = toLocal(e);
    if (drag) setDrag({ ...drag, x1: Math.max(0, Math.min(plotW, px)) });
    if (px < 0 || px > plotW || py < 0 || py > plotH) return setHover(null);
    setHover({ i: indexAt(px), k: nearestDepthIndex(fracToDepth(py / plotH, zmax), depths), px: px + PAD.l, py: py + PAD.t });
  };
  const onDown = (e: ReactPointerEvent) => {
    const { px } = toLocal(e);
    if (px >= 0 && px <= plotW) setDrag({ x0: px, x1: px });
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    const r = zoomRange(drag.x0, drag.x1, plotW, lo, nv);
    setDrag(null);
    if (r) setView(r);
    else {
      const { px } = toLocal(e);
      if (px >= 0 && px <= plotW) onSelect?.(indexAt(px)); // a click, not a drag
    }
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (!onSelect) return;
    const cur = selected ?? lo;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowRight") onSelect(Math.min(n - 1, cur + step));
    else if (e.key === "ArrowLeft") onSelect(Math.max(0, cur - step));
    else if (e.key === "Home") onSelect(lo);
    else if (e.key === "End") onSelect(hi);
    else return;
    e.preventDefault();
  };

  const hv = hover ? values[hover.k]?.[hover.i] : null;
  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      <canvas
        ref={canvas}
        role="img"
        tabIndex={0}
        aria-label={`${ariaLabel}. ${onSelect ? "Use the left and right arrow keys to move the selected column." : ""}`}
        onPointerMove={onMove}
        onPointerLeave={() => (setHover(null), setDrag(null))}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onKeyDown={onKey}
        className="block w-full rounded-lg cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        style={{ width: "100%", height }}
      />
      {view && (
        <button onClick={() => setView(null)} className="absolute top-2 right-2 inline-flex items-center gap-1 glass px-2 py-1 text-[11px] text-ink hover:text-accent" aria-label="Reset zoom">
          <ZoomOut size={12} /> Reset zoom
        </button>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 glass px-2.5 py-1.5 text-[11px] num text-ink-2 whitespace-nowrap"
          style={{ left: Math.min(hover.px + 12, w - 190), top: Math.max(0, hover.py - 44) }}
          role="status"
        >
          <div className="text-ink">{xLabel(hover.i)}</div>
          <div>
            {depths[hover.k]} m · <b className="text-ink">{hv === null || hv === undefined ? "no data" : `${hv.toFixed(digits)} ${units}`}</b>
          </div>
          {lines.map((l) => {
            const z = l.values[hover.i];
            return z === null || z === undefined ? null : (
              <div key={l.name} style={{ color: l.color }}>
                {l.name} {z.toFixed(0)} m
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
