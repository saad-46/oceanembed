"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, BrainCircuit, CheckCircle2, Database, Eye, Map as MapIcon, Orbit, Satellite, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { KindBadge, Skeleton, fmt } from "@/components/ui";
import type { ArgoMarker, Headline, ProfileResponse } from "@/lib/api";
import { DEMO_DATE, DEMO_POINT } from "@/lib/demo";
import { THERMAL } from "@/lib/colormap";
import { useApi } from "@/lib/useApi";
import { useGrid } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

export type StageProps = { playing: boolean; reduced: boolean; onNext: () => void };

export function thermal(t: number, lo = 4, hi = 31) {
  const x = Math.min(1, Math.max(0, (t - lo) / (hi - lo))) * (THERMAL.length - 1);
  return THERMAL[Math.round(x)];
}

export function StageTitle({ eyebrow, children, sub }: { eyebrow: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <div className="eyebrow">{eyebrow}</div>
      <h2 tabIndex={-1} data-stage-title className="font-display text-[28px] leading-[1.12] md:text-5xl text-ink mt-2 outline-none">
        {children}
      </h2>
      {sub && <p className="text-ink-2 text-base md:text-lg mt-3 leading-relaxed">{sub}</p>}
    </header>
  );
}

/* 01 — the problem */
export function ProblemStage() {
  const layers = ["#0f4a7a", "#0d3a66", "#0a2c52", "#08213f", "#06182e", "#040f1f"];
  return (
    <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 items-center">
      <div className="space-y-6">
        <StageTitle eyebrow="01 · The problem" sub="Satellites watch the ocean surface every day, everywhere. But much of what matters happens below it — out of their sight.">
          We can see the ocean surface. <span className="text-gradient">But what is happening below it?</span>
        </StageTitle>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {[
            ["Heat stored below the surface", "The warm upper ocean can hold far more heat than the thin surface skin reveals."],
            ["Layers in the ocean", "Warm, light water sits on cold, dense water — the depth of that boundary changes daily."],
            ["Cyclones and the ocean", "Storms stir up water from below; what lies there helps decide what they feed on."],
            ["Hidden anomalies", "Unusually warm or cold water can sit tens of metres down with no surface sign."],
          ].map(([t, d]) => (
            <div key={t} className="panel p-3.5">
              <div className="text-sm text-ink font-medium">{t}</div>
              <div className="text-[12.5px] text-ink-3 mt-1 leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative h-[340px] md:h-[440px] rounded-2xl overflow-hidden border border-line" aria-hidden>
        <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-[#050b14] to-[#0b2239]">
          <div className="absolute left-[12%] top-[26%] float">
            <Satellite size={30} className="text-accent" />
          </div>
          <div className="absolute left-[14%] top-[48%] w-[70%] h-[52%] bg-gradient-to-b from-accent/25 to-transparent [clip-path:polygon(0_0,6%_0,100%_100%,0_100%)]" />
          <span className="absolute right-3 top-3 text-[10.5px] uppercase tracking-wider text-accent">satellite view</span>
        </div>
        <div className="absolute inset-x-0 top-[22%] h-[6%] bg-gradient-to-r from-[#1f8fb8] via-[#2ec5d8] to-[#1f8fb8] shadow-[0_0_30px_rgba(46,197,216,.6)]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10.5px] font-semibold uppercase tracking-wider text-[#04121c]">surface — observed daily</span>
        </div>
        {layers.map((c, i) => (
          <div key={c} className="absolute inset-x-0 flex items-center" style={{ top: `${28 + i * 12}%`, height: "12%", background: c }}>
            <span className="ml-3 text-[10.5px] num text-ink-3/70">{["20 m", "50 m", "100 m", "200 m", "500 m", "1000 m"][i]}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 top-[28%] bottom-0 flex items-center justify-center">
          <span className="font-display text-6xl md:text-7xl text-ink/15">?</span>
        </div>
      </div>
    </div>
  );
}

/* 02 — why it is hard: the real Argo coverage on the demo day */
export function GapStage() {
  const h = useApi<Headline>("/v1/summary/headline").data;
  const argo = useApi<{ floats: ArgoMarker[] }>(`/v1/argo/markers?date=${DEMO_DATE}&window_days=3`);
  const markers = argo.data?.floats ?? null;
  const { grid, range } = useGrid(DEMO_DATE, 0, "temp");
  const perDay = h?.n_argo_profiles_total && h.n_days_reconstructed ? h.n_argo_profiles_total / h.n_days_reconstructed : null;
  return (
    <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 items-start">
      <div className="space-y-6">
        <StageTitle eyebrow="02 · Why this is hard" sub="Measuring below the surface means putting an instrument in the water. That is slow, sparse and expensive compared with a satellite pass.">
          The ocean doesn&apos;t reveal everything from the surface.
        </StageTitle>
        <ol className="flex flex-col items-center sm:items-start gap-1.5" aria-label="Information chain">
          {[
            [Satellite, "Satellite", "text-accent"],
            [Waves, "Surface observations — every day, everywhere", "text-accent"],
            [null, "? ? ?  the information gap", "text-warn"],
            [Database, "Subsurface ocean — 0 to 1000 m", "text-ink-2"],
          ].map(([I, t, c], i) => (
            <li key={t as string} className="flex flex-col items-center sm:items-start">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm ${i === 2 ? "border-warn/50 bg-warn/10 pulse-dot" : "border-line bg-white/[0.02]"} ${c}`}>
                {I ? (() => { const Ic = I as typeof Satellite; return <Ic size={15} aria-hidden />; })() : null}
                {t as string}
              </span>
              {i < 3 && <ArrowDown size={15} className="text-ink-3 my-0.5 sm:ml-5" aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink-2 leading-relaxed">
          <b className="text-ink">Argo floats</b> — robots that dive and measure temperature on the way up — give us real subsurface data.{" "}
          {perDay !== null && h ? (
            <>
              In this project&apos;s region they delivered <b className="num text-ink">{h.n_argo_profiles_total!.toLocaleString("en-IN")}</b> profiles over {h.n_days_reconstructed.toLocaleString("en-IN")} days — about <b className="num text-ink">{fmt(perDay, 0)} per day</b> for a region the model maps as 100 × 240 grid cells.
            </>
          ) : (
            "But there are only a handful per day across the whole region."
          )}
        </p>
      </div>
      <figure className="panel overflow-hidden">
        <div className="relative h-[300px] md:h-[400px]">
          <OceanMap minimal raster={grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: "thermal", key: `tour-sst|${grid.date}` } : null} argo={markers} />
        </div>
        <figcaption className="px-3.5 py-2.5 text-[12px] text-ink-3 flex flex-wrap items-center gap-2">
          <KindBadge kind="measured" /> {markers ? <b className="num text-ink">{markers.length}</b> : "…"} Argo floats surfaced within ±3 days of {DEMO_DATE} — every green dot. Colours: reconstructed surface temperature that day.
        </figcaption>
      </figure>
    </div>
  );
}

const INPUTS = [
  ["Sea-surface temperature", "NOAA OISST"],
  ["Sea-surface salinity", "NASA SMAP + ESA SMOS"],
  ["Sea level & surface currents", "NOAA altimetry"],
  ["Surface winds", "NOAA NCEI Blended Seawinds"],
];

/* 03 — enter the system */
export function SystemStage() {
  return (
    <div className="space-y-8">
      <StageTitle eyebrow="03 · Enter OceanSight" sub="It combines what satellites see today with what the ocean has taught us in the past, and fills in the water column below.">
        OceanSight reconstructs what we <span className="text-gradient">cannot directly observe.</span>
      </StageTitle>
      <div className="grid lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-stretch">
        <div className="space-y-2.5">
          <Group icon={<Satellite size={15} />} title="Satellites · daily" kind="measured">
            {INPUTS.map(([v, s]) => (
              <Row key={v} v={v} s={s} />
            ))}
          </Group>
          <Group icon={<Waves size={15} />} title="Ocean observations" kind="measured">
            <Row v="Argo float profiles" s="used to check the model, never shown to it for 2023" />
          </Group>
          <Group icon={<Database size={15} />} title="Historical ocean state" kind="baseline">
            <Row v="HYCOM ocean analysis 2019–2021" s="what the model learns from" />
          </Group>
        </div>
        <FlowArrow />
        <div className="panel p-5 flex flex-col items-center justify-center text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(46,197,216,.18),transparent_65%)]" aria-hidden />
          <BrainCircuit size={44} className="text-accent relative" aria-hidden />
          <div className="font-display text-xl text-ink mt-3 relative">OceanSight AI</div>
          <p className="text-[12.5px] text-ink-3 mt-1.5 relative">learns how surface patterns relate to the temperature below</p>
        </div>
        <FlowArrow />
        <div className="panel p-5 flex flex-col justify-center">
          <KindBadge kind="reconstructed" />
          <div className="font-display text-xl text-ink mt-2">Subsurface ocean field</div>
          <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
            <li>15 depths, surface to 1000 m</li>
            <li>0.25° grid (~28 km)</li>
            <li>every day, 2019–2023</li>
            <li>with an uncertainty for every value</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
function Group({ icon, title, kind, children }: { icon: ReactNode; title: string; kind: "measured" | "baseline"; children: ReactNode }) {
  return (
    <div className="panel p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-3">
          <span className="text-accent">{icon}</span>
          {title}
        </span>
        {kind === "measured" ? <KindBadge kind="measured" /> : <span className="text-[10px] uppercase tracking-wider text-ink-3 border border-line rounded-full px-2 py-0.5">training</span>}
      </div>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}
const Row = ({ v, s }: { v: string; s: string }) => (
  <div className="text-[13px] text-ink flex flex-wrap justify-between gap-x-2">
    {v} <span className="text-[11.5px] text-ink-3">{s}</span>
  </div>
);
const FlowArrow = () => (
  <div className="flex lg:flex-col items-center justify-center" aria-hidden>
    <svg className="w-10 h-10 lg:w-16 lg:h-10 rotate-90 lg:rotate-0" viewBox="0 0 64 20">
      <line x1="2" y1="10" x2="54" y2="10" stroke="#2ec5d8" strokeWidth="2" className="flow-line" />
      <path d="M52 4 L62 10 L52 16" fill="none" stroke="#2ec5d8" strokeWidth="2" />
    </svg>
  </div>
);

/* 04 — what the AI does, shown on the real reconstructed column */
export function AIStage({ reduced }: StageProps) {
  const prof = useApi<ProfileResponse>(`/v1/profile/${DEMO_DATE}?lat=${DEMO_POINT.lat.toFixed(3)}&lon=${DEMO_POINT.lon.toFixed(3)}`);
  const p = prof.data;
  const [shown, setShown] = useState(0);
  const n = p?.depths_m.length ?? 0;
  useEffect(() => {
    if (!n) return;
    if (reduced) {
      const r = requestAnimationFrame(() => setShown(n));
      return () => cancelAnimationFrame(r);
    }
    const t = setInterval(() => setShown((s) => (s >= n ? s : s + 1)), 170);
    return () => clearInterval(t);
  }, [n, reduced]);
  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8 items-start">
      <div className="space-y-5">
        <StageTitle eyebrow="04 · The AI" sub="It is not magic and not a forecast: the model learns, from years of examples, how surface patterns relate to the temperature below.">
          The model learns the relationship between <span className="text-gradient">surface signals and subsurface structure.</span>
        </StageTitle>
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <ul className="space-y-1.5">
            {["Surface temperature", "Salinity", "Sea-level height", "Winds", "Currents", "Seasonal normal (history)"].map((t, i) => (
              <li key={t} className="text-[13px] text-ink-2 panel px-3 py-1.5 fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                {t}
              </li>
            ))}
          </ul>
          <ArrowDown size={20} className="mx-auto text-accent sm:-rotate-90" aria-hidden />
          <div className="panel p-4 text-center">
            <BrainCircuit size={30} className="text-accent mx-auto" aria-hidden />
            <div className="text-sm text-ink mt-2 font-medium">AI model</div>
            <div className="text-[11.5px] text-ink-3">temperature at 15 depths</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5 text-[13px]">
          <div className="panel p-3.5">
            <div className="eyebrow">Training</div>
            <p className="text-ink-2 mt-1 leading-relaxed">OceanSight learns from 2019–2021: surface observations on one side, the known ocean state below on the other.</p>
          </div>
          <div className="panel p-3.5">
            <div className="eyebrow">Reconstruction</div>
            <p className="text-ink-2 mt-1 leading-relaxed">For any day, it takes that day&apos;s surface observations and rebuilds the column below — including days it never saw.</p>
          </div>
        </div>
        <details className="panel p-3.5 text-[13px] text-ink-2 group">
          <summary className="cursor-pointer text-accent select-none">Technical details</summary>
          <ul className="mt-2 space-y-1.5 list-disc pl-5">
            <li><b className="text-ink">U-Net</b> encoder–decoder over the whole 100 × 240 basin image; its bottleneck is the <i>satellite embedding</i>.</li>
            <li>Predicts each depth as a departure from a harmonic climatology, with a per-depth σ (heteroscedastic head), calibrated on 2022 Argo.</li>
            <li>Baselines: per-depth <b className="text-ink">LightGBM</b> on per-pixel features, climatology, and a no-salinity U-Net ablation.</li>
            <li>Training target: HYCOM GOFS 3.1 analysis coarsened to 0.25°; inputs 7 channels (SST, SSS, SLA, geostrophic U/V, wind U/V).</li>
            <li>Resolution: 0.25° daily, 15 standard depths 0–1000 m; split train 2019–21 / validate 2022 / test 2023.</li>
          </ul>
        </details>
      </div>
      <figure className="panel p-4">
        <figcaption className="flex items-center justify-between gap-2 text-[12px] text-ink-3 mb-3">
          <span>Reconstructed column · {DEMO_POINT.lat.toFixed(0)}°N {DEMO_POINT.lon.toFixed(0)}°E · {DEMO_DATE}</span>
          <KindBadge kind="reconstructed" />
        </figcaption>
        {!p ? (
          prof.error ? <p className="text-sm text-ink-3">Profile unavailable — {prof.error}</p> : <Skeleton className="h-[420px]" />
        ) : (
          <ol className="space-y-1" aria-label="Temperature by depth">
            {p.depths_m.map((z, i) => {
              const t = p.temperature_c[i];
              const on = i < shown;
              return (
                <li key={z} className="grid grid-cols-[56px_1fr_64px] items-center gap-2 text-[12px]">
                  <span className="num text-ink-3 text-right">{z} m</span>
                  <span className="h-[22px] rounded transition-all duration-500" style={{ background: on && t !== null ? thermal(t) : "rgba(255,255,255,.04)", opacity: on ? 1 : 0.5 }} />
                  <span className="num text-ink">{on && t !== null ? `${t.toFixed(1)} °C` : ""}</span>
                </li>
              );
            })}
          </ol>
        )}
      </figure>
    </div>
  );
}

/* 09 — value */
export function ValueStage({ onReplay }: { onReplay: () => void }) {
  const steps = [
    [Orbit, "Satellites"],
    [Database, "Ocean data"],
    [BrainCircuit, "AI reconstruction"],
    [ShieldCheck, "Validation"],
    [Sparkles, "Subsurface intelligence"],
  ] as const;
  return (
    <div className="space-y-9 text-center">
      <div className="flex justify-center">
        <StageTitle eyebrow="09 · The whole picture">
          From surface observations to <span className="text-gradient">subsurface intelligence.</span>
        </StageTitle>
      </div>
      <ol className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-0">
        {steps.map(([I, t], i) => (
          <li key={t} className="flex flex-col md:flex-row items-center">
            <span className="panel px-4 py-3 flex flex-col items-center gap-1.5 min-w-[140px] fade-in" style={{ animationDelay: `${i * 120}ms` }}>
              <I size={20} className="text-accent" aria-hidden />
              <span className="text-sm text-ink">{t}</span>
            </span>
            {i < steps.length - 1 && <FlowArrow />}
          </li>
        ))}
      </ol>
      <div className="grid md:grid-cols-3 gap-3 max-w-4xl mx-auto text-left">
        {[
          [Eye, "See", "Explore the ocean beneath the surface — any day of 2019–2023, down to 1000 m."],
          [MapIcon, "Understand", "Analyse temperature structure, heat content and anomalies over regions and cyclone tracks."],
          [CheckCircle2, "Verify", "Compare the reconstruction against independent Argo observations and a climatology baseline."],
        ].map(([I, t, d]) => {
          const Ic = I as typeof Eye;
          return (
            <div key={t as string} className="panel p-4">
              <Ic size={18} className="text-accent" aria-hidden />
              <div className="font-display text-lg text-ink mt-2">{t as string}</div>
              <p className="text-[13px] text-ink-2 mt-1 leading-relaxed">{d as string}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/overview" className="rounded-xl bg-accent text-[#04121c] font-semibold px-6 py-3 hover:brightness-110 shadow-[0_0_30px_-6px_var(--accent)]">
          Explore OceanSight
        </Link>
        <Link href="/methodology" className="rounded-xl border border-line-2 text-ink px-6 py-3 hover:border-accent/60">
          View methodology
        </Link>
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-sm">
        <button onClick={onReplay} className="text-accent hover:underline">
          Replay the tour
        </button>
        <Link href="/demo" className="text-ink-3 hover:text-ink">
          Presenter demo →
        </Link>
      </div>
    </div>
  );
}
