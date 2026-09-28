"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity, ArrowRight, BrainCircuit, Database, FileDown, Gauge, GitBranch, Layers, Satellite, ShieldCheck, Sigma, Tornado, Waves,
} from "lucide-react";
import CrossSection from "@/components/landing/CrossSection";
import { Badge, Button, CountUp, Logo, Reveal, SectionHeader, Skeleton, fmt } from "@/components/ui";
import type { Headline, Meta, SectionResponse } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const ProductPreview = dynamic(() => import("@/components/landing/ProductPreview"), {
  ssr: false,
  loading: () => <Skeleton className="h-[480px] rounded-[var(--radius-lg)]" />,
});

const CAPABILITIES = [
  { icon: Waves, title: "Subsurface reconstruction", body: "Daily temperature at 15 standard depths, 0–1000 m, on a 0.25° grid across the North Indian Ocean." },
  { icon: BrainCircuit, title: "Satellite-embedding model", body: "A U-Net encoder compresses each day's surface state into an embedding; the decoder rebuilds the water column." },
  { icon: Layers, title: "Depth profiles anywhere", body: "Click any ocean cell for its full temperature profile, compared with climatology and baselines." },
  { icon: Sigma, title: "Calibrated uncertainty", body: "Every value carries an error bar calibrated against real Argo floats — see where not to trust it." },
  { icon: ShieldCheck, title: "Independent validation", body: "Scored per depth against Argo floats from a year the model never saw, plus an EN4 cross-check." },
  { icon: Tornado, title: "Cyclone fuel gauge", body: "Reconstructed heat potential replayed along real IBTrACS cyclone tracks, e.g. Mocha 2023." },
  { icon: Gauge, title: "Ocean analytics", body: "Tropical cyclone heat potential, mixed-layer depth and the 20 °C / 26 °C isotherm depths, every day." },
  { icon: FileDown, title: "Reports & exports", body: "One-page PDF and CSV profile reports and map snapshots for any point and day." },
];

const STEPS = [
  { n: "01", icon: Satellite, title: "Satellite observations", body: "SST, sea-surface salinity, sea-level anomaly, surface currents and winds — five daily fields." },
  { n: "02", icon: Database, title: "Data harmonisation", body: "Quality control, gap filling and regridding of every source to one 0.25° daily grid." },
  { n: "03", icon: BrainCircuit, title: "ML reconstruction", body: "U-Net satellite embedding → temperature at 15 depths with uncertainty; LightGBM and climatology as baselines." },
  { n: "04", icon: ShieldCheck, title: "Independent validation", body: "Whole-year hold-out; per-depth error against Argo floats; uncertainty calibrated on 2022, checked on 2023." },
  { n: "05", icon: Activity, title: "Ocean intelligence", body: "Maps, profiles, TCHP / MLD / D20 / D26 and cyclone replay — served from precomputed daily fields." },
];

export default function Landing() {
  const h = useApi<Headline>("/v1/summary/headline").data;
  const meta = useApi<Meta>("/v1/meta").data;
  const sectionQ = useApi<SectionResponse>("/v1/section/2023-05-11?lat=15&lon_min=80&lon_max=97");
  const at = (z: number) => h?.validation?.at_depths.find((d) => d.depth_m === z);
  const metrics: { value: number | null | undefined; label: string; decimals?: number; suffix?: string }[] = [
    { value: meta?.depths_m.length, label: "depth levels, 0–1000 m" },
    { value: 0.25, label: "grid resolution", decimals: 2, suffix: "°" },
    { value: h?.n_days_reconstructed, label: "daily fields reconstructed" },
    { value: h?.n_argo_profiles_total, label: "Argo profiles ingested" },
    { value: h?.validation?.n_independent_profiles, label: "held-out Argo profiles (2023)" },
    { value: h?.target_days, label: "3-D training-target days" },
    { value: h?.n_models_compared, label: "models compared side by side" },
    { value: 46, label: "automated tests in CI" },
  ];

  return (
    <div className="bg-bg text-ink">
      {/* ---------------- nav ---------------- */}
      <header className="fixed top-0 inset-x-0 z-40 border-b border-white/[0.06] bg-bg/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-6">
          <Link href="/" aria-label="OceanSight home">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm text-ink-2" aria-label="Sections">
            {[
              ["#why", "Why"],
              ["#capabilities", "Capabilities"],
              ["#how", "How it works"],
              ["#validation", "Validation"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="px-3 py-1.5 rounded-md hover:text-ink hover:bg-white/[0.04] transition-colors">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex-1" />
          <Button href="/map" size="sm" icon={<ArrowRight size={14} />}>
            Open platform
          </Button>
        </div>
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="relative pt-28 md:pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-60 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(31,111,178,0.28),transparent_65%)]" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-5 grid lg:grid-cols-[1fr_1.15fr] gap-12 items-center">
          <div className="fade-in">
            <Badge tone="accent" className="mb-5">SIH26066 · OceanEmbed · MoES / INCOIS</Badge>
            <h1 className="font-display text-5xl md:text-6xl leading-[1.04] tracking-tight">
              See beneath <br />
              <span className="text-gradient">the surface.</span>
            </h1>
            <p className="mt-5 text-lg text-ink-2 max-w-xl leading-relaxed">
              Daily reconstruction of North Indian Ocean temperature from the surface to 1000 m — learned from satellite observations and
              checked against independent Argo floats.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/map" size="lg" icon={<Waves size={17} />}>
                Explore the ocean
              </Button>
              <Button href="#how" variant="secondary" size="lg">
                How it works
              </Button>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {[
                ["0–1000 m", "15 standard depths"],
                ["0.25°", "daily grid"],
                [h?.validation ? `${fmt(at(100)?.rmse_c, 2)} °C` : "—", "RMSE at 100 m vs held-out Argo"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="num text-xl text-ink">{v}</dd>
                  <dd className="text-[11px] text-ink-3 leading-snug mt-0.5">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="fade-in [animation-delay:150ms]">
            <CrossSection data={sectionQ.data ?? null} error={sectionQ.error} />
          </div>
        </div>
      </section>

      {/* ---------------- metrics ---------------- */}
      <section aria-label="Key figures" className="border-y border-line bg-bg-2/60">
        <div className="max-w-7xl mx-auto px-5 py-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-y-6 gap-x-4">
          {metrics.map((m, i) => (
            <Reveal key={m.label} delay={i * 50}>
              <div className="text-2xl md:text-[26px] text-ink">
                {m.value === undefined || m.value === null ? <span className="num text-ink-3">—</span> : <CountUp value={m.value} decimals={m.decimals} suffix={m.suffix} />}
              </div>
              <div className="text-[11.5px] text-ink-3 mt-1 leading-snug">{m.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- why ---------------- */}
      <section id="why" className="scroll-mt-20 max-w-7xl mx-auto px-5 py-24 grid lg:grid-cols-2 gap-14 items-center">
        <Reveal>
          <SectionHeader
            eyebrow="The problem"
            title={<>Satellites see the surface. <span className="text-ink-2">The ocean&apos;s heat lives below it.</span></>}
            sub="Cyclone intensification, fish habitat and climate signals depend on temperature tens to hundreds of metres down. Argo floats, buoys and ships measure it only at scattered points and times. Satellites cover the whole basin every day — but only the top millimetres."
          />
          <p className="mt-5 text-ink-2 leading-relaxed">
            The surface carries fingerprints of what is underneath: a raised sea level often sits over a deep warm layer. OceanSight learns those
            fingerprints and rebuilds the full column.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <ol className="relative space-y-3" aria-label="From satellite to ocean intelligence">
            {[
              { icon: Satellite, t: "Satellite observations", d: "Five surface fields, every day, whole basin", tone: "text-accent-2" },
              { icon: BrainCircuit, t: "AI reconstruction", d: "Satellite embedding → 15-depth temperature + σ", tone: "text-accent" },
              { icon: Waves, t: "Subsurface temperature", d: "0–1000 m, 0.25°, daily, 2019–2023", tone: "text-ocean" },
              { icon: Gauge, t: "Ocean intelligence", d: "TCHP · MLD · D20 · D26 · cyclone replay", tone: "text-good" },
            ].map(({ icon: Icon, t, d, tone }, i, arr) => (
              <li key={t} className="relative">
                <div className="panel lift flex items-center gap-4 px-5 py-4">
                  <span className={`w-10 h-10 rounded-lg bg-white/[0.04] border border-line flex items-center justify-center ${tone}`}>
                    <Icon size={20} aria-hidden />
                  </span>
                  <div>
                    <div className="font-medium text-ink">{t}</div>
                    <div className="text-sm text-ink-2">{d}</div>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <svg className="absolute left-[38px] -bottom-3 h-3 w-2" viewBox="0 0 2 12" aria-hidden>
                    <line x1="1" y1="0" x2="1" y2="12" stroke="#2ec5d8" strokeWidth="2" className="flow-line" />
                  </svg>
                )}
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* ---------------- capabilities ---------------- */}
      <section id="capabilities" className="scroll-mt-20 border-t border-line bg-bg-2/40">
        <div className="max-w-7xl mx-auto px-5 py-24">
          <Reveal>
            <SectionHeader eyebrow="Capabilities" title="Everything here runs on real reconstructions" sub="Each capability below is implemented and backed by the precomputed 2019–2023 record." />
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={(i % 4) * 70}>
                <div className="panel lift h-full p-5">
                  <span className="w-10 h-10 rounded-lg bg-accent/[0.08] border border-accent/20 flex items-center justify-center text-accent">
                    <Icon size={19} aria-hidden />
                  </span>
                  <h3 className="mt-4 font-medium text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section id="how" className="scroll-mt-20 max-w-7xl mx-auto px-5 py-24">
        <Reveal>
          <SectionHeader eyebrow="How it works" title="From satellite pixels to a validated ocean column" />
        </Reveal>
        <div className="mt-12 grid md:grid-cols-5 gap-4 relative">
          <svg className="hidden md:block absolute top-[34px] left-[10%] right-[10%] h-2 w-[80%]" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden>
            <line x1="0" y1="1" x2="100" y2="1" stroke="#2ec5d8" strokeOpacity=".5" strokeWidth="2" vectorEffect="non-scaling-stroke" className="flow-line" />
          </svg>
          {STEPS.map(({ n, icon: Icon, title, body }, i) => (
            <Reveal key={n} delay={i * 90}>
              <div className="relative text-center md:text-left">
                <div className="mx-auto md:mx-0 w-[68px] h-[68px] rounded-2xl glass flex flex-col items-center justify-center relative z-10">
                  <Icon size={20} className="text-accent" aria-hidden />
                  <span className="num text-[10px] text-ink-3 mt-1">{n}</span>
                </div>
                <h3 className="mt-4 font-medium text-ink">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-2 leading-relaxed">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- product preview ---------------- */}
      <section className="border-t border-line bg-[radial-gradient(ellipse_at_top,rgba(31,111,178,0.14),transparent_60%)]">
        <div className="max-w-7xl mx-auto px-5 py-24">
          <Reveal>
            <SectionHeader
              eyebrow="Live preview"
              title="The platform, running on real data"
              sub="Switch depth to see the thermocline structure change; the profile on the right is a real reconstruction next to a real Argo float, days before Cyclone Mocha (May 2023)."
            />
          </Reveal>
          <Reveal className="mt-10">
            <ProductPreview />
          </Reveal>
        </div>
      </section>

      {/* ---------------- validation ---------------- */}
      <section id="validation" className="scroll-mt-20 max-w-7xl mx-auto px-5 py-24 grid lg:grid-cols-[1fr_1.1fr] gap-12 items-center">
        <Reveal>
          <SectionHeader
            eyebrow="Validation"
            title="How do we know it works?"
            sub="We score it against the real ocean — Argo floats from 2023, a year the model never saw in training, normalisation or tuning."
          />
          <ul className="mt-6 space-y-2.5 text-sm text-ink-2">
            {[
              "Whole-year split: train 2019–2021 · validate 2022 · test 2023",
              "Error per depth — never one headline number",
              "Compared with climatology and LightGBM baselines",
              "Uncertainty calibrated on 2022, verified on 2023",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <ShieldCheck size={16} className="text-good shrink-0 mt-0.5" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <Button href="/validation" variant="secondary" icon={<ArrowRight size={15} />}>
              See the full validation
            </Button>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="panel p-6">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Held-out 2023 · RMSE vs Argo</span>
              <span className="num text-xs text-ink-3">n = {h?.validation?.n_independent_profiles?.toLocaleString("en-IN") ?? "—"} profiles</span>
            </div>
            <div className="mt-5 space-y-4">
              {(h?.validation?.at_depths ?? []).map((d) => {
                const max = Math.max(...(h?.validation?.at_depths ?? []).map((x) => x.climatology_rmse_c ?? 0), 0.01);
                return (
                  <div key={d.depth_m}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="num text-ink-2">{d.depth_m} m</span>
                      <span className="num text-ink">
                        {fmt(d.rmse_c, 2)} °C <span className="text-ink-3">vs {fmt(d.climatology_rmse_c, 2)} climatology</span>
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-white/[0.05] overflow-hidden">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-[#d95926]/45" style={{ width: `${((d.climatology_rmse_c ?? 0) / max) * 100}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded-full bg-[#3987e5]" style={{ width: `${((d.rmse_c ?? 0) / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              {!h && <Skeleton className="h-40" />}
            </div>
            <div className="mt-4 flex gap-4 text-[11px] text-ink-3">
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#3987e5]" />OceanSight U-Net</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#d95926]/45" />Seasonal climatology</span>
            </div>
            <p className="mt-4 text-[11.5px] text-ink-3 leading-relaxed">{h?.validation?.caveat}</p>
          </div>
        </Reveal>
      </section>

      {/* ---------------- CTA + footer ---------------- */}
      <section className="border-t border-line">
        <div className="max-w-7xl mx-auto px-5 py-20 text-center">
          <h2 className="font-display text-3xl md:text-4xl">Explore the ocean beneath the surface.</h2>
          <p className="text-ink-2 mt-3">Every map, profile and number is a real reconstruction from 2019–2023.</p>
          <div className="mt-7 flex justify-center gap-3 flex-wrap">
            <Button href="/map" size="lg" icon={<Waves size={17} />}>
              Explore the ocean
            </Button>
            <Button href="/methodology" size="lg" variant="secondary">
              Read the methodology
            </Button>
          </div>
        </div>
        <footer className="border-t border-line">
          <div className="max-w-7xl mx-auto px-5 py-8 flex flex-col md:flex-row gap-4 md:items-center justify-between text-xs text-ink-3">
            <div className="flex items-center gap-4 flex-wrap">
              <Logo size={22} sub={false} />
              <span>Team CodeCrafters · SIH 2026 · proof of concept, not an operational INCOIS product</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <span>Data: NOAA · HYCOM · Argo · Met Office EN4 · IBTrACS</span>
              <a href="https://github.com/saad-46/oceanembed" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
                <GitBranch size={14} /> Source
              </a>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
