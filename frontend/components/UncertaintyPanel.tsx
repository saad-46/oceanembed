"use client";
/**
 * Prediction ± uncertainty at a chosen depth, with the calibration evidence. The σ shown is OceanSight's
 * calibrated standard deviation (unchanged methodology); intervals are described by their *measured*
 * coverage on held-out Argo, never as a nominal "95 % confidence interval".
 */
import { useState } from "react";
import Explain from "@/components/Explain";
import { Provenance, fmt } from "@/components/ui";
import type { ValidationSummary } from "@/lib/api";
import { coverageSentence } from "@/lib/analysis";
import { useApi } from "@/lib/useApi";

export default function UncertaintyPanel({ depths, temps, sigmas, initialDepth = 100 }: { depths: number[]; temps: (number | null)[]; sigmas: (number | null)[] | null; initialDepth?: number }) {
  const [z, setZ] = useState(depths.includes(initialDepth) ? initialDepth : 100);
  const v = useApi<ValidationSummary>("/v1/validation/summary?split=test").data;
  const cal = v?.uncertainty_calibration?.calibrated;
  const k = depths.indexOf(z);
  const t = k >= 0 ? temps[k] : null;
  const s = k >= 0 && sigmas ? sigmas[k] : null;
  const year = v?.held_out_period?.slice(0, 4) ?? "2023";
  const quick = [0, 50, 100, 200, 500, 1000].filter((d) => depths.includes(d));
  return (
    <section aria-label="Temperature and uncertainty">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 flex items-center gap-1">
          Prediction &amp; uncertainty <Explain term="uncertainty" />
        </div>
        <div className="flex gap-0.5" role="radiogroup" aria-label="Depth for the uncertainty readout">
          {quick.map((d) => (
            <button key={d} role="radio" aria-checked={z === d} onClick={() => setZ(d)} className={`num text-[10.5px] px-1.5 py-0.5 rounded border ${z === d ? "border-accent/70 text-accent bg-accent/10" : "border-line text-ink-3 hover:text-ink"}`}>
              {d}
            </button>
          ))}
        </div>
      </div>
      {t === null ? (
        <p className="text-[12.5px] text-ink-3">No reconstruction at {z} m here (below the seabed or outside the grid).</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="num text-[20px] text-ink">{t.toFixed(2)} °C</span>
            {s !== null && <span className="num text-[14px] text-ink-2">± {s.toFixed(2)} °C</span>}
            <span className="text-[11.5px] text-ink-3">at {z} m</span>
          </div>
          {s !== null && (
            <dl className="grid grid-cols-2 gap-2 mt-1.5 text-[12px]">
              <div>
                <dt className="text-ink-3">±1σ range</dt>
                <dd className="num text-ink">
                  {fmt(t - s, 2)} – {fmt(t + s, 2)} °C
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">±2σ range</dt>
                <dd className="num text-ink">
                  {fmt(t - 2 * s, 2)} – {fmt(t + 2 * s, 2)} °C
                </dd>
              </div>
            </dl>
          )}
          {/* compact visual of the two ranges, not colour-only: labels carry the numbers */}
          {s !== null && (
            <div className="relative h-3 mt-2 rounded bg-white/[0.04]" aria-hidden>
              <div className="absolute inset-y-0 left-[10%] right-[10%] rounded bg-warn/15" />
              <div className="absolute inset-y-0 left-[30%] right-[30%] rounded bg-warn/35" />
              <div className="absolute inset-y-[-2px] left-1/2 w-[2px] bg-accent" />
            </div>
          )}
        </>
      )}
      <div className="mt-2 space-y-0.5 text-[11.5px] text-ink-3">
        <p>{coverageSentence(1, cal?.frac_within_1sigma, year)}</p>
        <p>{coverageSentence(2, cal?.frac_within_2sigma, year)}</p>
      </div>
      <div className="mt-1.5">
        <Provenance kind="estimated" source={`calibrated σ · fitted on ${cal?.fit_on ?? "2022 Argo"}`} lineage="uncertainty" />
      </div>
      <details className="mt-2 text-[12px] group">
        <summary className="cursor-pointer text-accent hover:underline select-none">How to interpret uncertainty</summary>
        <div className="mt-1.5 space-y-1.5 text-ink-2 leading-relaxed">
          <p>
            <b className="text-ink">What σ is:</b> a calibrated standard deviation of the difference between the reconstruction and the real ocean at this depth — the model&apos;s own variance estimate, widened by a per-depth term fitted so that about 68 % of 2022 Argo measurements fall within ±1σ.
          </p>
          <p>
            <b className="text-ink">What it is not:</b> not a formal confidence interval, and ±2σ is not a guaranteed &ldquo;95 %&rdquo; range. The numbers above are the coverage actually measured on held-out {year} floats.
          </p>
          <p>
            <b className="text-ink">How to use it:</b> where σ is large (often in the thermocline, 75–200 m), treat the reconstructed value as less certain and compare with nearby measured profiles.
          </p>
        </div>
      </details>
    </section>
  );
}
