"use client";
import { useState } from "react";
import { BrainCircuit, ChevronRight, Database, Map as MapIcon, ShieldCheck, SlidersHorizontal } from "lucide-react";

const STAGES = [
  {
    key: "data",
    label: "Data",
    icon: Database,
    tag: "open data only",
    title: "Satellite surface fields + ocean truth",
    points: [
      "Daily SST (NOAA OISST), SSS (SMAP + bias-corrected SMOS), sea-level anomaly and geostrophic currents (NOAA altimetry), winds (NCEI Blended Seawinds).",
      "Training target: HYCOM GOFS 3.1 analysis, coarsened from 1/12° to 0.25°.",
      "Independent truth: Argo GDAC float profiles (QC 1/2) via argopy; EN4 as a monthly cross-check; IBTrACS for cyclone tracks.",
    ],
    out: "7 surface channels · 2019–2023",
  },
  {
    key: "processing",
    label: "Processing",
    icon: SlidersHorizontal,
    tag: "0.25° · daily",
    title: "Clean, harmonise, regrid",
    points: [
      "One adapter per source with cached, resumable downloads.",
      "Unit harmonisation, physical-range flags, de-duplication.",
      "Everything regridded to a common 0.25° daily grid (100 × 240 cells over 5–30°N, 45–105°E); normalisation statistics from training years only.",
    ],
    out: "Aligned tensors · 15 target depths",
  },
  {
    key: "model",
    label: "Model",
    icon: BrainCircuit,
    tag: "U-Net + baselines",
    title: "Learn the column from the surface",
    points: [
      "U-Net encoder–decoder over the whole basin image; its bottleneck is the satellite embedding.",
      "Predicts each depth as a departure from seasonal climatology, plus a per-depth σ (heteroscedastic uncertainty head).",
      "Baselines trained alongside: harmonic climatology, per-depth LightGBM, and a no-salinity U-Net ablation.",
    ],
    out: "Temperature ± σ · 0–1000 m",
  },
  {
    key: "validation",
    label: "Validation",
    icon: ShieldCheck,
    tag: "held-out years",
    title: "Score against floats it never saw",
    points: [
      "Whole-year split: train 2019–2021, validate 2022, test 2023 (touched once).",
      "Every held-out Argo profile compared at its day and 0.25° cell, per depth: RMSE, bias, r, skill vs climatology.",
      "σ calibrated on 2022 floats, coverage checked on 2023. Caveat disclosed: the HYCOM target assimilates Argo.",
    ],
    out: "Per-depth skill · calibrated σ",
  },
  {
    key: "output",
    label: "Output",
    icon: MapIcon,
    tag: "API + platform",
    title: "Serve fields, profiles and products",
    points: [
      "Every day of 2019–2023 precomputed into compact Zarr stores — no live inference on screen.",
      "Derived products from the reconstructed column: TCHP, mixed-layer depth (0.5 °C), D20, D26.",
      "FastAPI + PostGIS behind this platform: maps, profiles, timelines, sections, cyclone-track analysis, reports and a documented REST API.",
    ],
    out: "Maps · profiles · reports",
  },
] as const;

export default function PipelineFlow() {
  const [i, setI] = useState(0);
  const s = STAGES[i];
  const Icon = s.icon;
  return (
    <div className="panel p-4 md:p-5">
      <div role="tablist" aria-label="Pipeline stages" className="grid grid-cols-5 gap-1.5 md:gap-2 items-stretch">
        {STAGES.map((st, n) => {
          const I = st.icon;
          const on = n === i;
          return (
            <button
              key={st.key}
              role="tab"
              aria-selected={on}
              aria-controls={`stage-${st.key}`}
              id={`tab-${st.key}`}
              onClick={() => setI(n)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") setI((i + 1) % STAGES.length);
                if (e.key === "ArrowLeft") setI((i + STAGES.length - 1) % STAGES.length);
              }}
              className={`relative rounded-xl border px-2 py-3 md:px-3 flex flex-col items-center text-center gap-1.5 transition-all ${on ? "border-accent/70 bg-accent/10 shadow-[0_0_24px_-8px_var(--accent)]" : "border-line hover:border-line-2 bg-white/[0.015]"}`}
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${on ? "bg-accent text-[#04121c]" : "bg-accent/10 text-accent"}`}>
                <I size={17} aria-hidden />
              </span>
              <span className={`text-[11px] md:text-sm font-medium ${on ? "text-ink" : "text-ink-2"}`}>{st.label}</span>
              <span className="hidden md:block text-[10.5px] text-ink-3 num">{st.tag}</span>
              {n < STAGES.length - 1 && <ChevronRight size={14} className="absolute -right-[11px] md:-right-[13px] top-1/2 -translate-y-1/2 text-ink-3 z-10" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="mt-2 h-[2px] rounded bg-line overflow-hidden" aria-hidden>
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${((i + 1) / STAGES.length) * 100}%` }} />
      </div>
      <div id={`stage-${s.key}`} role="tabpanel" aria-labelledby={`tab-${s.key}`} key={s.key} className="fade-in mt-4 grid md:grid-cols-[1fr_220px] gap-4">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Icon size={16} aria-hidden />
            <span className="eyebrow">Stage {i + 1} · {s.label}</span>
          </div>
          <h3 className="font-display text-lg text-ink mt-1.5">{s.title}</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            {s.points.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-bg/60 p-3.5 h-fit">
          <div className="text-[10.5px] uppercase tracking-wider text-ink-3">Hands to the next stage</div>
          <div className="num text-sm text-ink mt-1">{s.out}</div>
          <div className="flex gap-1.5 mt-3">
            <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="flex-1 text-xs border border-line rounded-md py-1 text-ink-2 hover:text-ink disabled:opacity-40">
              Back
            </button>
            <button onClick={() => setI(Math.min(STAGES.length - 1, i + 1))} disabled={i === STAGES.length - 1} className="flex-1 text-xs border border-accent/50 text-accent rounded-md py-1 hover:bg-accent/10 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
