"use client";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Compass, FileText, GitCompareArrows, History, Layers, Map as MapIcon, ShieldCheck, Tornado } from "lucide-react";
import OnboardingPrompt from "@/components/guide/OnboardingPrompt";
import FieldHero from "@/components/landing/FieldHero";
import { Button, Logo, fmt } from "@/components/ui";
import type { Headline, Meta } from "@/lib/api";
import { stepHref } from "@/lib/guide";
import { useApi } from "@/lib/useApi";

const TASKS = [
  { icon: MapIcon, title: "Explore", body: "Navigate the reconstructed ocean by variable, depth and date, with Argo observations and cyclone tracks on the map.", href: "/map", cta: "Open the map" },
  { icon: Layers, title: "Dive deeper", body: "Open any point's water column from the surface to 1000 m, with its uncertainty band and derived structure.", href: "/profiles", cta: "Inspect a profile" },
  { icon: History, title: "Follow change", body: "Follow one location day by day to see the mixed layer and thermocline move through the seasons.", href: "/timeline", cta: "Open the timeline" },
  { icon: GitCompareArrows, title: "Compare", body: "Set the reconstruction against measured Argo profiles, the seasonal climatology and baseline models.", href: "/section", cta: "Cut a section" },
  { icon: ShieldCheck, title: "Validate", body: "See the evidence: error by depth against observations never used for training, and how well the uncertainty is calibrated.", href: "/validation", cta: "Review the evidence" },
  { icon: Tornado, title: "Investigate", body: "Examine upper-ocean heat content along observed cyclone tracks and over regions, and save the result as a report.", href: "/analysis?mode=cyclone", cta: "Investigate an event" },
];

const SOURCES = [
  { role: "Model inputs · satellite, daily", items: ["NOAA OISST v2.1 — sea-surface temperature", "NASA SMAP + ESA SMOS — sea-surface salinity", "NOAA blended altimetry — sea level and geostrophic currents", "NOAA NCEI Blended Seawinds — surface winds"] },
  { role: "Training target", items: ["HYCOM GOFS 3.1 ocean analysis, 2019–2021 (coarsened to 0.25°)"] },
  { role: "Independent observations", items: ["Argo float profiles — validation (2023 held out) and on-map comparison", "Met Office EN4 — monthly cross-check"] },
  { role: "Events", items: ["NOAA IBTrACS — observed cyclone tracks and winds"] },
];

export default function Landing() {
  const h = useApi<Headline>("/v1/summary/headline").data;
  const meta = useApi<Meta>("/v1/meta").data;
  const v = h?.validation;
  const r100 = v?.at_depths.find((d) => d.depth_m === 100);
  const period = meta ? `${meta.period.start.slice(0, 4)}–${meta.period.end.slice(0, 4)}` : "2019–2023";

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-6">
          <Link href="/" aria-label="OceanSight home">
            <Logo size={24} />
          </Link>
          <nav aria-label="Site" className="hidden md:flex items-center gap-5 text-[13.5px] text-ink-2">
            <Link href="/map" className="hover:text-ink">
              Explore
            </Link>
            <Link href="/validation" className="hover:text-ink">
              Validation
            </Link>
            <Link href="/methodology" className="hover:text-ink">
              Methodology
            </Link>
          </nav>
          <div className="flex-1" />
          <Link href={stepHref(0)} className="hidden sm:inline text-[13.5px] text-ink-2 hover:text-ink">
            Guided Exploration
          </Link>
          <Button href="/map" size="sm">
            Explore ocean
          </Button>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-5 pt-12 md:pt-20 pb-14 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="text-[12.5px] text-ink-3 num">North Indian Ocean · {period} · 0–1000 m</p>
            <h1 className="font-display text-[40px] md:text-[56px] leading-[1.04] tracking-tight text-ink mt-3">See beneath the surface.</h1>
            <p className="text-ink-2 text-[17px] leading-relaxed mt-5 max-w-xl">
              Explore reconstructed ocean temperature structure across space, depth and time — with independent observations, uncertainty and validation one step away.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button href="/map" size="lg" icon={<MapIcon size={16} />}>
                Explore ocean
              </Button>
              <Button href={stepHref(0)} size="lg" variant="secondary" icon={<Compass size={16} />}>
                Guided Exploration
              </Button>
            </div>
            <p className="text-[12.5px] text-ink-3 mt-4">Reconstruction, not forecast: 0.25° daily fields from satellite surface observations.</p>
          </div>
          <FieldHero />
        </section>

        <section aria-labelledby="tasks" className="border-t border-line">
          <div className="max-w-6xl mx-auto px-5 py-16">
            <h2 id="tasks" className="font-display text-2xl text-ink">What you can do</h2>
            <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-9">
              {TASKS.map(({ icon: Icon, title, body, href, cta }) => (
                <div key={title}>
                  <div className="flex items-center gap-2.5">
                    <Icon size={17} className="text-accent" aria-hidden />
                    <h3 className="text-[15px] text-ink font-medium">{title}</h3>
                  </div>
                  <p className="text-[13.5px] text-ink-2 mt-2 leading-relaxed">{body}</p>
                  <Link href={href} className="inline-flex items-center gap-1 text-[13px] text-accent mt-2.5 hover:underline">
                    {cta} <ArrowRight size={13} aria-hidden />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="data" className="border-t border-line bg-bg-2/50">
          <div className="max-w-6xl mx-auto px-5 py-16 grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
            <div>
              <h2 id="data" className="font-display text-2xl text-ink">
                Built on observations and physical context
              </h2>
              <p className="text-[14px] text-ink-2 mt-3 leading-relaxed">
                OceanSight learns how surface patterns relate to the temperature below from a physical ocean analysis, then reconstructs the subsurface from daily satellite observations. Independent float measurements are kept apart to test it.
              </p>
              <p className="text-[14px] text-ink-2 mt-4 leading-relaxed">
                {v && r100 ? (
                  <>
                    Against <span className="num text-ink">{v.n_independent_profiles.toLocaleString("en-IN")}</span> Argo profiles from 2023 — a year not used for training — the reconstruction&apos;s error at 100 m is{" "}
                    <span className="num text-ink">{fmt(r100.rmse_c, 2)} °C</span>, compared with <span className="num text-ink">{fmt(r100.climatology_rmse_c, 2)} °C</span> for the seasonal climatology.
                  </>
                ) : (
                  "Accuracy is reported by depth against Argo profiles that were not used for training."
                )}{" "}
                <Link href="/validation" className="text-accent hover:underline whitespace-nowrap">
                  Review the evidence →
                </Link>
              </p>
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
              {SOURCES.map((s) => (
                <div key={s.role}>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-3">{s.role}</dt>
                  {s.items.map((i) => (
                    <dd key={i} className="text-[13.5px] text-ink-2 mt-1.5 leading-snug">
                      {i}
                    </dd>
                  ))}
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="max-w-6xl mx-auto px-5 py-14 flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="font-display text-xl text-ink">Start with a place and a date.</h2>
              <p className="text-[14px] text-ink-2 mt-1.5">Open the map, or take eight short steps through the application first.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button href="/map" icon={<MapIcon size={15} />}>
                Explore ocean
              </Button>
              <Button href={stepHref(0)} variant="secondary" icon={<Compass size={15} />}>
                Guided Exploration
              </Button>
              <Button href="/reports" variant="ghost" icon={<FileText size={15} />}>
                Create a report
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-5 py-8 grid md:grid-cols-[1fr_auto] gap-6 text-[12.5px] text-ink-3">
          <div className="space-y-2">
            <Logo size={20} />
            <p className="num">
              Model {meta?.production_model ?? "—"} · data {meta ? `${meta.period.start} – ${meta.period.end}` : "—"} · 0.25° · 15 depths
            </p>
            <p>Data: NOAA (OISST, altimetry, Blended Seawinds, IBTrACS), NASA SMAP, ESA SMOS, HYCOM, Argo, Met Office EN4.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 md:justify-end md:items-start">
            <Link href="/map" className="hover:text-ink">
              Explore
            </Link>
            <Link href="/methodology" className="hover:text-ink">
              Methodology
            </Link>
            <Link href="/validation" className="hover:text-ink">
              Validation
            </Link>
            <Link href="/methodology#data" className="hover:text-ink">
              Data sources
            </Link>
            <Link href={stepHref(0)} className="hover:text-ink">
              Guided Exploration
            </Link>
          </nav>
        </div>
      </footer>
      <Suspense fallback={null}>
        <OnboardingPrompt exploreHref="/map" />
      </Suspense>
    </div>
  );
}
