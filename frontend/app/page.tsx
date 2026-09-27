"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DataBadge, ErrorState, Skeleton, StatTile, fmt } from "@/components/ui";
import { friendlyError, get, type Fetched, type GridResponse, type Headline } from "@/lib/api";
import { DEFAULT_DATE } from "@/lib/dates";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

export default function Landing() {
  const [h, setH] = useState<Fetched<Headline> | null>(null);
  const [hero, setHero] = useState<GridResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    get<Headline>("/v1/summary/headline").then(setH).catch((e) => setErr(friendlyError(e)));
    get<GridResponse>(`/v1/grid/${DEFAULT_DATE}?depth=100&variable=temp`).then(setHero).catch(() => {});
  }, []);
  const at = (z: number) => h?.validation?.at_depths.find((d) => d.depth_m === z);
  const v100 = at(100);

  return (
    <div className="flex-1 flex flex-col">
      <section className="relative h-[62vh] min-h-[420px] border-b border-line overflow-hidden">
        {hero?.stats ? (
          <OceanMap
            minimal
            raster={{ values: hero.grid.values, vmin: Math.floor(hero.stats.min), vmax: Math.ceil(hero.stats.max), ramp: "thermal", key: "hero" }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0b1a33] via-[#101b2e] to-[#1a1030]" aria-hidden />
        )}
        <div className="absolute inset-0 z-[1] bg-gradient-to-r from-bg via-bg/70 to-transparent pointer-events-none" />
        <div className="relative z-[2] h-full flex flex-col justify-center px-6 md:px-12 max-w-3xl gap-5 pointer-events-none">
          <span className="self-start text-[11px] uppercase tracking-[0.18em] border border-accent/40 text-accent rounded px-2.5 py-1 pointer-events-auto">
            Official PS · SIH26066 — OceanEmbed · MoES / INCOIS
          </span>
          <h1 className="font-display text-4xl md:text-5xl leading-tight">
            The ocean&apos;s temperature <span className="text-accent">beneath the surface</span>, every day, from satellites alone.
          </h1>
          <p className="text-ink-2 text-base md:text-lg max-w-2xl">
            GAHAN reconstructs temperature at 15 depths down to 1000 m across the North Indian Ocean (0.25°, daily) from five surface satellite
            fields — and checks itself against Argo floats it never trained on.
          </p>
          <div className="flex gap-3 pointer-events-auto">
            <Link href="/map" className="bg-accent text-bg font-medium rounded px-5 py-2.5 hover:brightness-110">
              Enter the map
            </Link>
            <Link href="/validation" className="border border-line text-ink rounded px-5 py-2.5 hover:border-accent/60">
              See the validation
            </Link>
          </div>
          <div className="pointer-events-auto">
            <DataBadge fallback={h?.__fallback} />
          </div>
        </div>
        {hero && <div className="absolute bottom-3 right-4 text-[11px] text-ink-3 num">Hero: reconstructed temperature at 100 m · {hero.date}</div>}
      </section>
      <section className="px-6 md:px-12 py-8 space-y-4">
        {err && <ErrorState message={err} />}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile label="Independent Argo profiles" value={h?.validation?.n_independent_profiles?.toLocaleString()} loading={!h && !err} hint={h?.validation ? `held out: ${h.validation.held_out_period}` : undefined} />
          <StatTile label="RMSE at 100 m (thermocline)" value={fmt(v100?.rmse_c, 2)} unit="°C" loading={!h && !err} hint={v100 ? `climatology: ${fmt(v100.climatology_rmse_c, 2)} °C` : undefined} />
          <StatTile label="RMSE at surface" value={fmt(at(0)?.rmse_c, 2)} unit="°C" loading={!h && !err} hint={at(0) ? `climatology: ${fmt(at(0)?.climatology_rmse_c, 2)} °C` : undefined} />
          <StatTile label="Days reconstructed" value={h?.n_days_reconstructed?.toLocaleString()} loading={!h && !err} hint={h?.study_period} />
          <StatTile label="Output grid" value="0.25°" loading={!h && !err} hint="15 depths · 0–1000 m · daily" />
        </div>
        {h?.validation && <p className="text-xs text-ink-3 max-w-4xl">{h.validation.caveat}</p>}
        <div className="grid md:grid-cols-3 gap-3 pt-2">
          {[
            ["1 · Satellite inputs", "SST, SSS, sea-level anomaly, surface currents and winds — harmonised to one 0.25° daily grid."],
            ["2 · Satellite embedding", "A U-Net encoder compresses each day's basin-wide surface state into a compact latent embedding; the decoder reconstructs 15 depths with uncertainty."],
            ["3 · Decision products", "Cyclone heat potential, mixed-layer depth and thermocline depth (D20/D26) — the quantities INCOIS uses operationally."],
          ].map(([t, d]) => (
            <div key={t} className="border border-line rounded p-4 bg-surface">
              <div className="font-display text-sm text-accent">{t}</div>
              <p className="text-sm text-ink-2 mt-1.5">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
