"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Explain from "@/components/Explain";
import InvestigationPoint from "@/components/InvestigationPoint";
import LocationPicker from "@/components/LocationPicker";
import TSDiagram, { type TSSeriesSpec } from "@/components/TSDiagram";
import { DataBadge, ErrorState, LoadingState, PageHeader, Provenance, Toggle, UnavailableState, fmt } from "@/components/ui";
import type { TSProfileResponse } from "@/lib/api";
import { parsePointParams, stratificationHref, tsHref, tsPath, type PointParams } from "@/lib/analysis";
import { PERIOD } from "@/lib/ocean";
import { useApi } from "@/lib/useApi";

const EXAMPLES = [
  { label: "Bay of Bengal · 11 May 2023", lat: 15, lon: 88, date: "2023-05-11" },
  { label: "Arabian Sea · 6 Jun 2023", lat: 15, lon: 66, date: "2023-06-06" },
  { label: "Northern Bay of Bengal · Sep 2022", lat: 19, lon: 89, date: "2022-09-15" },
];

export default function TSScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const p = parsePointParams(sp);
  const go = (patch: Partial<PointParams>) => router.replace(tsHref({ ...p, ...patch }), { scroll: false });
  const q = useApi<TSProfileResponse>(tsPath(p));
  const t = q.data && !q.error ? q.data : null;
  const [show, setShow] = useState({ argo: true, reana: true, iso: true });

  const series: TSSeriesSpec[] = [];
  if (t?.observed && show.argo) series.push({ key: "argo", label: t.observed.label, symbol: "circle", points: t.observed.points });
  if (t?.reanalysis && show.reana) series.push({ key: "rea", label: t.reanalysis.label, symbol: "square", points: t.reanalysis.points });
  const obs = t?.observed;
  const surf = obs?.points[0];
  const deep = obs?.points[obs.points.length - 1];

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1300px] w-full mx-auto">
      <PageHeader
        group="Analyze"
        title={
          <>
            T-S analysis <Explain term="ts_diagram" />
          </>
        }
        description="T-S diagrams reveal water-mass structure through the joint relationship between temperature and salinity. Here: the nearest measured Argo profile, with density computed using TEOS-10."
        actions={<DataBadge fallback={q.data?.__fallback} />}
      />
      <div className="panel px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <LocationPicker lat={p.lat} lon={p.lon} date={p.date} onChange={(la, lo) => go({ lat: la, lon: lo })} />
        <label className="text-[11px] text-ink-3">
          Date
          <input type="date" min={PERIOD.start} max={PERIOD.end} value={p.date} onChange={(e) => e.target.value && go({ date: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink [color-scheme:dark]" />
        </label>
        <label className="text-[11px] text-ink-3 ml-auto">
          Examples
          <select value="" onChange={(e) => { const x = EXAMPLES.find((k) => k.label === e.target.value); if (x) go(x); }} className="mt-1 block bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink">
            <option value="">Choose…</option>
            {EXAMPLES.map((x) => (
              <option key={x.label} value={x.label}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.error && <ErrorState message={q.error} why="T-S analysis needs an ocean point inside the study domain." action="Choose an ocean point inside 5–30°N, 45–105°E and a date in 2019–2023." onRetry={q.retry} />}
      {q.loading && !t && <LoadingState label="Finding the nearest measured profile and computing densities…" className="h-[440px]" />}
      {t && (
        <div className={`space-y-4 ${q.loading ? "opacity-60 transition-opacity" : ""}`}>
          <InvestigationPoint lat={p.lat} lon={p.lon} date={t.date} observation={obs?.argo ?? null} observationNote={t.observed_status.detail} exclude={["ts"]} />
          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            <section className="panel p-4" aria-label="Temperature–salinity diagram" data-guide="ts-diagram">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-[13.5px] text-ink">Temperature–salinity diagram</h2>
                {obs && <Provenance kind="measured" source={`${obs.label.replace(" (measured)", "")} · ${obs.date}`} lineage="argo" />}
              </div>
              <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-2">
                <legend className="sr-only">Show</legend>
                <Toggle checked={show.argo} onChange={(v) => setShow({ ...show, argo: v })} label="Show Argo (measured)" />
                {t.reanalysis ? (
                  <Toggle checked={show.reana} onChange={(v) => setShow({ ...show, reana: v })} label="Show reanalysis" />
                ) : (
                  <span className="text-[12.5px] text-ink-3 inline-flex items-center gap-2" title={t.reanalysis_status.detail}>
                    <input type="checkbox" disabled aria-describedby="rea-why" /> Show reanalysis <span id="rea-why" className="sr-only">{t.reanalysis_status.detail}</span>
                  </span>
                )}
                <Toggle checked={show.iso} onChange={(v) => setShow({ ...show, iso: v })} label="Show density contours" />
              </fieldset>
              {series.length ? (
                <TSDiagram series={series} isopycnals={t.isopycnals} showIsopycnals={show.iso} ariaLabel={`Temperature–salinity diagram near ${p.lat.toFixed(2)}°N ${p.lon.toFixed(2)}°E, ${t.date}`} />
              ) : obs || t.reanalysis ? (
                <p className="text-sm text-ink-3 h-40 flex items-center justify-center">All series are hidden — turn one on above.</p>
              ) : (
                <UnavailableState
                  title={t.observed_status.status === "none_nearby" ? "No measured profile nearby" : t.observed_status.status === "no_salinity" ? "The nearest profile has no salinity" : "Observation lookup unavailable"}
                  detail={`${t.observed_status.detail} Try a nearby date or location, or pick an Argo marker on the map.`}
                />
              )}
              <p className="text-[11.5px] text-ink-3 mt-2 leading-relaxed">{t.method}</p>
            </section>

            <aside className="space-y-4">
              <section className="panel p-4" aria-label="Profile summary">
                <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Profile summary</h2>
                {obs && surf && deep ? (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
                    {(
                      [
                        ["Shallowest bin", `${surf.depth_m} m`],
                        ["Deepest bin", `${deep.depth_m} m`],
                        ["Surface S", `${surf.salinity_psu.toFixed(2)} PSU`],
                        ["Surface σ0", `${surf.sigma0_kg_m3.toFixed(2)}`],
                        ["Density MLD", obs.mixed_layers?.mld_density_m != null ? `${fmt(obs.mixed_layers.mld_density_m, 0)} m` : "—"],
                        ["Barrier layer", obs.mixed_layers?.barrier_layer_thickness_m != null ? `${fmt(obs.mixed_layers.barrier_layer_thickness_m, 0)} m` : "—"],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11px] text-ink-3">{k}</dt>
                        <dd className="num text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-[12.5px] text-ink-3">{t.observed_status.detail}</p>
                )}
                {obs && (
                  <div className="mt-2">
                    <Provenance kind="derived" source="TEOS-10 from measured T and S" lineage="argo_derived" />
                  </div>
                )}
              </section>
              <section className="panel p-4 text-[12.5px] text-ink-2 space-y-2" aria-label="How to read this diagram">
                <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">How to read it</h2>
                <p>Each point is one depth. Lines of equal density (σ0) run diagonally; stable water gets denser with depth.</p>
                <p>Fresh surface water plots to the left; a sharp leftward bend near the surface marks a halocline. Identifying named water masses needs regional context and is not attempted here.</p>
                <p className="text-ink-3">{t.reconstructed_note}</p>
                {!t.reanalysis && <p className="text-ink-3">Reanalysis: {t.reanalysis_status.detail}</p>}
                <a href={stratificationHref({ ...p, date: t.date })} className="text-accent hover:underline inline-block">
                  Stratification at this point →
                </a>
              </section>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
