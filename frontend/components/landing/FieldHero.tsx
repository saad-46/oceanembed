"use client";
import { useEffect, useRef, useState } from "react";
import ColorLegend from "@/components/Legend";
import { Provenance } from "@/components/ui";
import { gridToCanvas } from "@/lib/colormap";
import { REF_DATE } from "@/lib/guide";
import { useGrid } from "@/lib/useGrid";

const DEPTHS = [0, 50, 100, 200] as const;

/**
 * Landing visual built from real OceanSight output: the reconstructed temperature field of the
 * North Indian Ocean at a chosen depth (no stock imagery, no map library — one grid request).
 */
export default function FieldHero() {
  const [k, setK] = useState(2);
  const [auto, setAuto] = useState(true);
  const depth = DEPTHS[k];
  const { grid, range, loading, error } = useGrid(REF_DATE, depth, "temp");
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!auto || reduced || loading) return;
    const t = setTimeout(() => setK((i) => (i + 1) % DEPTHS.length), 3800);
    return () => clearTimeout(t);
  }, [auto, k, loading]);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !grid || !range) return;
    const img = gridToCanvas(grid.grid.values, range[0], range[1], "thermal", 255);
    c.width = img.width * 4;
    c.height = img.height * 4;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }, [grid, range]);

  return (
    <figure className="relative rounded-xl border border-line bg-[#0b1522] overflow-hidden" onPointerEnter={() => setAuto(false)}>
      <div className="relative aspect-[12/5]">
        <canvas ref={ref} role="img" aria-label={`Reconstructed ocean temperature at ${depth} m on ${REF_DATE}, North Indian Ocean`} className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${grid ? "opacity-100" : "opacity-0"}`} />
        {!grid && (
          <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-ink-3" role="status">
            {error ? "The reconstruction could not be loaded right now." : "Loading subsurface temperature…"}
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1 rounded-lg bg-bg/75 border border-line p-0.5" role="radiogroup" aria-label="Depth">
          {DEPTHS.map((z, i) => (
            <button
              key={z}
              role="radio"
              aria-checked={i === k}
              onClick={() => {
                setAuto(false);
                setK(i);
              }}
              className={`num text-[11.5px] px-2.5 py-1 rounded-md transition-colors ${i === k ? "bg-accent/15 text-accent" : "text-ink-2 hover:text-ink"}`}
            >
              {z === 0 ? "Surface" : `${z} m`}
            </button>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-end justify-between gap-3 px-3.5 py-2.5 border-t border-line bg-bg/60">
        <div className="space-y-0.5">
          <div className="text-[12.5px] text-ink">
            Temperature at {depth === 0 ? "the surface" : `${depth} m`} · <span className="num">{REF_DATE}</span>
          </div>
          <Provenance kind="reconstructed" source="OceanSight U-Net · 0.25° grid" />
        </div>
        {range && <ColorLegend title="°C" vmin={range[0]} vmax={range[1]} units="°C" ramp="thermal" digits={0} />}
      </figcaption>
    </figure>
  );
}
