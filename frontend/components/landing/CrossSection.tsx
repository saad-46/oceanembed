"use client";
/**
 * Hero visual built from REAL output: a zonal depth section of the reconstruction (GET /v1/section).
 * Canvas: temperature field (sqrt depth axis, interpolated between the 15 standard depths), the 26 °C and
 * 20 °C isotherms traced from the same data, and a scan line that reveals the field top-down.
 * SVG overlay: satellite on an orbit arc with a scan beam to the surface.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { RAMPS } from "@/lib/colormap";
import type { SectionResponse } from "@/lib/api";

const ZMAX = 1000;
const W = 900;
const H = 420;
const SKY = 92; // px reserved above the sea surface
const yOf = (z: number) => SKY + Math.sqrt(Math.max(z, 0) / ZMAX) * (H - SKY - 22);

function isotherm(section: SectionResponse, iso: number): [number, number][] {
  const pts: [number, number][] = [];
  const { depths_m: z, temperature_c: t } = section;
  for (let j = 0; j < section.lon.length; j++) {
    for (let k = 0; k < z.length - 1; k++) {
      const a = t[k][j], b = t[k + 1][j];
      if (a === null || b === null) break;
      if (a >= iso && b < iso) {
        const f = (a - iso) / (a - b);
        pts.push([j, z[k] + f * (z[k + 1] - z[k])]);
        break;
      }
    }
  }
  return pts;
}

export default function CrossSection({ data, error }: { data: SectionResponse | null; error?: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);

  const range = useMemo(() => {
    if (!data) return [4, 31] as const;
    const v = data.temperature_c.flat().filter((x): x is number => x !== null);
    return [Math.floor(Math.min(...v)), Math.ceil(Math.max(...v))] as const;
  }, [data]);

  // reveal animation (scan line from surface to 1000 m); instant when reduced motion is preferred
  useEffect(() => {
    if (!data) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    if (reduce) {
      raf = requestAnimationFrame(() => setProgress(1));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 2600);
      setProgress(1 - Math.pow(1 - p, 2));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !data) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const n = data.lon.length;
    const colW = W / n;
    const f = RAMPS.thermal;
    const z = data.depths_m;
    const [vmin, vmax] = range;
    const revealY = SKY + progress * (H - SKY);
    // field: per pixel row, interpolate temperature between standard depths
    for (let y = SKY; y < Math.min(H, revealY); y += 2) {
      const frac = (y - SKY) / (H - SKY - 22);
      const depth = Math.min(ZMAX, frac * frac * ZMAX);
      let k = z.findIndex((d) => d >= depth);
      if (k <= 0) k = 1;
      const w = (depth - z[k - 1]) / (z[k] - z[k - 1]);
      for (let j = 0; j < n; j++) {
        const a = data.temperature_c[k - 1][j], b = data.temperature_c[k][j];
        if (a === null || b === null) continue;
        const t = a + (b - a) * Math.min(1, Math.max(0, w));
        const [r, g, bl] = f((t - vmin) / (vmax - vmin));
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
        ctx.fillRect(j * colW, y, colW + 0.6, 2.2);
      }
    }
    // isotherms from the data
    const lines: [number, string, string][] = [[26, "#f6f7a0", "26 °C (D26)"], [20, "#e8eef6", "20 °C (D20)"]];
    for (const [iso, color, label] of lines) {
      const pts = isotherm(data, iso).filter(([, d]) => yOf(d) < revealY);
      if (pts.length < 2) continue;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      pts.forEach(([j, d], i) => (i ? ctx.lineTo(j * colW + colW / 2, yOf(d)) : ctx.moveTo(j * colW + colW / 2, yOf(d))));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const [lj, ld] = pts[Math.floor(pts.length * 0.72)];
      ctx.font = "600 11px ui-monospace, Consolas, monospace";
      ctx.fillStyle = color;
      ctx.fillText(label, lj * colW + 6, yOf(ld) - 5);
    }
    // scan line
    if (progress < 1) {
      const g = ctx.createLinearGradient(0, revealY - 16, 0, revealY);
      g.addColorStop(0, "rgba(46,197,216,0)");
      g.addColorStop(1, "rgba(127,227,239,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, revealY - 16, W, 16);
    }
    // sea surface
    ctx.strokeStyle = "rgba(127,227,239,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, SKY);
    ctx.lineTo(W, SKY);
    ctx.stroke();
    // depth ticks
    ctx.font = "10px ui-monospace, Consolas, monospace";
    ctx.fillStyle = "rgba(232,238,246,0.75)";
    for (const d of [0, 50, 100, 200, 500, 1000]) {
      const y = yOf(d);
      if (y > revealY + 2) continue;
      ctx.fillRect(0, y, 6, 1);
      ctx.fillText(`${d} m`, 9, y + (d === 0 ? 12 : 3));
    }
  }, [data, progress, range]);

  return (
    <figure className="relative w-full" aria-label="Reconstructed temperature section, 0 to 1000 m, along 15 degrees north across the Bay of Bengal">
      <div className="relative rounded-[var(--radius-lg)] overflow-hidden border border-line-2 bg-[#030a14] shadow-[var(--shadow-2)]">
        <svg viewBox={`0 0 ${W} ${SKY}`} className="absolute inset-x-0 top-0 w-full" style={{ height: `${(SKY / H) * 100}%` }} aria-hidden>
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#030a14" />
              <stop offset="1" stopColor="#0a1a2e" />
            </linearGradient>
            <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7fe3ef" stopOpacity=".55" />
              <stop offset="1" stopColor="#7fe3ef" stopOpacity="0" />
            </linearGradient>
            <path id="orbit" d={`M -40 70 Q ${W / 2} -34 ${W + 40} 70`} />
          </defs>
          <rect width={W} height={SKY} fill="url(#sky)" />
          {Array.from({ length: 28 }).map((_, i) => (
            <circle key={i} cx={(i * 131) % W} cy={(i * 37) % (SKY - 30) + 6} r={i % 3 ? 0.7 : 1.1} fill="#e8eef6" opacity={0.25 + (i % 4) * 0.12} />
          ))}
          <use href="#orbit" fill="none" stroke="#2ec5d8" strokeOpacity=".28" strokeDasharray="3 5" />
          <g>
            <polygon points="0,6 -46,86 46,86" fill="url(#beam)" opacity=".5" />
            <rect x="-9" y="-4" width="18" height="8" rx="1.5" fill="#e8eef6" />
            <rect x="-26" y="-2.5" width="14" height="5" fill="#2ec5d8" opacity=".85" />
            <rect x="12" y="-2.5" width="14" height="5" fill="#2ec5d8" opacity=".85" />
            <animateMotion dur="16s" repeatCount="indefinite" rotate="auto">
              <mpath href="#orbit" />
            </animateMotion>
          </g>
          <text x={W - 12} y={18} textAnchor="end" fontSize="11" fill="#93a3b8" fontFamily="var(--font-plex-mono)">SST · SSS · SLA · currents · winds</text>
        </svg>
        <canvas ref={canvas} className="block w-full h-auto" style={{ aspectRatio: `${W} / ${H}` }} />
        {!data && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ top: `${(SKY / H) * 100}%` }}>
            <span className="glass text-xs text-ink-2 px-3 py-1.5">{error ? "Section unavailable — the API did not answer" : "Loading reconstructed section…"}</span>
          </div>
        )}
      </div>
      <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
        <span>
          <span className="text-ink-2">Real model output</span> · reconstructed temperature, 0–1000 m, along{" "}
          {data ? `${data.lat.toFixed(2)}°N, ${data.lon[0].toFixed(1)}–${data.lon[data.lon.length - 1].toFixed(1)}°E` : "15°N"} · {data?.date ?? "2023-05-11"}
        </span>
        <span className="flex items-center gap-2 num">
          {range[0]}°C
          <span className="w-24 h-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#04142e,#3c3b9c,#99558f,#ec7a5a,#fdd05a,#f6f7a0)" }} />
          {range[1]}°C
        </span>
      </figcaption>
    </figure>
  );
}
