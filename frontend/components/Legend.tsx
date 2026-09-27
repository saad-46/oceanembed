"use client";
import { gradientCss, rampStops, type RampName } from "@/lib/colormap";

export default function ColorLegend({ title, vmin, vmax, units, ramp, digits = 1 }: { title: string; vmin: number; vmax: number; units: string; ramp: RampName; digits?: number }) {
  return (
    <div className="bg-bg/85 border border-line rounded px-3 py-2 w-60 backdrop-blur-sm" aria-label={`${title} colour scale ${vmin} to ${vmax} ${units}`}>
      <div className="text-[11px] text-ink-2 mb-1.5">{title}</div>
      <div className="h-2.5 rounded-sm" style={{ background: gradientCss(rampStops(ramp)) }} />
      <div className="flex justify-between mt-1 num text-[11px] text-ink-2">
        <span>{vmin.toFixed(digits)}</span>
        {ramp === "diverging" && <span>0</span>}
        <span>
          {vmax.toFixed(digits)} {units}
        </span>
      </div>
    </div>
  );
}
