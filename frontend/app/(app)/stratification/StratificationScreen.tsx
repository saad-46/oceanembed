"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import DepthProfilePlot, { type PlotMarker, type PlotSeries } from "@/components/DepthProfilePlot";
import Explain from "@/components/Explain";
import InvestigationPoint from "@/components/InvestigationPoint";
import LocationPicker from "@/components/LocationPicker";
import { DataBadge, ErrorState, KindBadge, LoadingState, Notice, PageHeader, Provenance, QualityBadge, Segmented, Toggle, UnavailableState, fmt, type DataKind } from "@/components/ui";
import type { GradientPeak, StratificationResponse } from "@/lib/api";
import { STRAT_DEPTHS, parseMaxDepth, parsePointParams, stepPoints, stratificationHref, stratificationPath, tsHref, type PointParams } from "@/lib/analysis";
import type { TermKey } from "@/lib/glossary";
import { PERIOD } from "@/lib/ocean";
import { useApi } from "@/lib/useApi";

const C = { rec: "#3987e5", argo: "#199e70", reana: "#b49cf5", mld: "#e8edf4", thermo: "#f08a5d", d20: "#2ec5d8", d26: "#f0b429", halo: "#7fb8ff", dmld: "#9aa6b8" };
const EXAMPLES = [
  { label: "Bay of Bengal · 11 May 2023", lat: 15, lon: 88, date: "2023-05-11" },
  { label: "Arabian Sea · 6 Jun 2023", lat: 15, lon: 66, date: "2023-06-06" },
  { label: "Northern Bay of Bengal · Sep 2022", lat: 19, lon: 89, date: "2022-09-15" },
  { label: "Western Arabian Sea · Jan 2022", lat: 10, lon: 60, date: "2022-01-15" },
];

const pts = (z: number[], v: (number | null)[]) => z.map((d, k) => ({ z: d, v: v[k] ?? null }));

function PeakLine({ peak, unit, digits = 3 }: { peak: GradientPeak | null | undefined; unit: string; digits?: number }) {
  if (!peak) return <span className="text-ink-3">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="num text-ink">{peak.depth_m === null ? "not defined" : `${fmt(peak.depth_m, 0)} m`}</span>
      {peak.depth_range_m && <span className="num text-ink-3 text-[11.5px]">(layer {peak.depth_range_m[0]}–{peak.depth_range_m[1]} m)</span>}
      {peak.strength_per_m !== null && <span className="num text-ink-2 text-[11.5px]">max |gradient| {peak.strength_per_m.toFixed(digits)} {unit}</span>}
      <QualityBadge quality={peak.quality} />
    </span>
  );
}

function Reasons({ peak }: { peak: GradientPeak | null | undefined }) {
  if (!peak || !peak.quality_reasons.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {peak.quality_reasons.map((r) => (
        <li key={r} className="text-[11.5px] text-ink-3">
          · {r}
        </li>
      ))}
    </ul>
  );
}

export default function StratificationScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const p = parsePointParams(sp);
  const zmax = parseMaxDepth(sp.get("zmax"));
  const go = (patch: Partial<PointParams>, z = zmax) => router.replace(stratificationHref({ ...p, ...patch }, z), { scroll: false });
  const q = useApi<StratificationResponse>(stratificationPath(p, zmax));
  const s = q.data && !q.error ? q.data : null;
  const [show, setShow] = useState({ thermo: true, mld: true, d20: true, d26: false, halo: true, argo: true });

  const rec = s?.reconstructed;
  const obs = s?.observed ?? null;
  const reana = s?.reanalysis_salinity ?? null;
  const hasSal = !!(obs?.salinity_psu && obs.salinity_psu.some((v) => v !== null)) || !!reana;

  const markers = useMemo(() => {
    if (!rec) return { temp: [] as PlotMarker[], sal: [] as PlotMarker[] };
    const m: PlotMarker[] = [];
    if (show.mld && rec.mld_m !== null) m.push({ z: rec.mld_m, label: "MLD", color: C.mld, dash: "2 3" });
    if (show.thermo && rec.thermocline.depth_m !== null) m.push({ z: rec.thermocline.depth_m, label: "Thermocline", color: C.thermo, dash: "6 3" });
    if (show.d26 && rec.d26_m !== null) m.push({ z: rec.d26_m, label: "D26", color: C.d26 });
    if (show.d20 && rec.d20_m !== null) m.push({ z: rec.d20_m, label: "D20", color: C.d20 });
    const sal: PlotMarker[] = [];
    const halo = obs?.halocline ?? reana?.halocline;
    if (show.halo && halo?.depth_m !== null && halo?.depth_m !== undefined) sal.push({ z: halo.depth_m, label: "Halocline", color: C.halo, dash: "6 3" });
    if (show.mld && obs?.mixed_layers?.mld_density_m != null) sal.push({ z: obs.mixed_layers.mld_density_m, label: "Density MLD", color: C.dmld, dash: "2 3" });
    return { temp: m, sal };
  }, [rec, obs, reana, show]);

  const tempSeries: PlotSeries[] = rec
    ? [
        {
          key: "rec",
          label: "Reconstructed temperature",
          color: C.rec,
          points: pts(rec.depths_m, rec.temperature_c),
          band: rec.uncertainty_c ? rec.depths_m.flatMap((z, k) => (rec.temperature_c[k] !== null && rec.uncertainty_c![k] !== null ? [{ z, lo: rec.temperature_c[k]! - rec.uncertainty_c![k]!, hi: rec.temperature_c[k]! + rec.uncertainty_c![k]! }] : [])) : undefined,
        },
        ...(show.argo && obs ? [{ key: "argo", label: `Argo ${obs.argo.platform_number} (measured)`, color: C.argo, style: "dots" as const, points: pts(obs.depths_m, obs.temperature_c) }] : []),
      ]
    : [];
  const gradSeries: PlotSeries[] = rec
    ? [
        { key: "g_rec", label: "dT/dz · reconstructed", color: C.rec, style: "step", points: stepPoints(rec.thermocline.gradient_profile) },
        ...(show.argo && obs?.thermocline ? [{ key: "g_argo", label: "dT/dz · measured (5 m bins)", color: C.argo, style: "step" as const, points: stepPoints(obs.thermocline.gradient_profile) }] : []),
      ]
    : [];
  const salSeries: PlotSeries[] = [
    ...(obs?.salinity_psu ? [{ key: "s_argo", label: `Argo ${obs.argo.platform_number} (measured)`, color: C.argo, style: "dots" as const, points: pts(obs.depths_m, obs.salinity_psu) }] : []),
    ...(reana ? [{ key: "s_rea", label: `GLORYS12V1 (reanalysis, ${reana.date})`, color: C.reana, points: pts(reana.depths_m, reana.salinity_psu) }] : []),
  ];
  const salGrad: PlotSeries[] = [
    ...(obs?.halocline ? [{ key: "ds_argo", label: "dS/dz · measured", color: C.argo, style: "step" as const, points: stepPoints(obs.halocline.gradient_profile) }] : []),
    ...(reana ? [{ key: "ds_rea", label: "dS/dz · reanalysis", color: C.reana, style: "step" as const, points: stepPoints(reana.halocline.gradient_profile) }] : []),
  ];

  const rows: { name: string; term: TermKey; value: string; kind: DataKind; source: string; def: string; quality?: GradientPeak["quality"] }[] = rec
    ? [
        { name: "Mixed-layer depth", term: "mld", value: rec.mld_m === null ? "—" : `${fmt(rec.mld_m, 0)} m`, kind: "derived", source: "reconstructed temperature", def: s!.diagnostics.mld },
        { name: "Thermocline", term: "thermocline_depth", value: rec.thermocline.depth_m === null ? "not defined" : `${fmt(rec.thermocline.depth_m, 0)} m`, kind: "derived", source: "reconstructed temperature", def: s!.diagnostics.thermocline, quality: rec.thermocline.quality },
        { name: "D26", term: "d26", value: rec.d26_m === null ? "—" : `${fmt(rec.d26_m, 0)} m`, kind: "derived", source: "reconstructed temperature", def: s!.diagnostics.d26 },
        { name: "D20", term: "d20", value: rec.d20_m === null ? "—" : `${fmt(rec.d20_m, 0)} m`, kind: "derived", source: "reconstructed temperature", def: s!.diagnostics.d20 },
        ...(obs?.thermocline ? [{ name: "Thermocline (measured profile)", term: "thermocline_depth" as TermKey, value: obs.thermocline.depth_m === null ? "not defined" : `${fmt(obs.thermocline.depth_m, 0)} m`, kind: "derived" as DataKind, source: `Argo ${obs.argo.platform_number}`, def: "Same gradient method applied to the measured temperature profile (5 m bins).", quality: obs.thermocline.quality }] : []),
        ...(obs?.halocline ? [{ name: "Halocline", term: "halocline" as TermKey, value: obs.halocline.depth_m === null ? "not defined" : `${fmt(obs.halocline.depth_m, 0)} m`, kind: "derived" as DataKind, source: `Argo ${obs.argo.platform_number}`, def: s!.diagnostics.halocline, quality: obs.halocline.quality }] : []),
        ...(obs?.mixed_layers ? [
          { name: "Density mixed layer", term: "density_mld" as TermKey, value: obs.mixed_layers.mld_density_m === null ? "—" : `${fmt(obs.mixed_layers.mld_density_m, 0)} m`, kind: "derived" as DataKind, source: `Argo ${obs.argo.platform_number}`, def: "σ0 exceeds its 10 m value by 0.03 kg/m³ (de Boyer Montégut 2004)." },
          { name: "Barrier layer", term: "density_mld" as TermKey, value: obs.mixed_layers.barrier_layer_thickness_m === null ? "—" : `${fmt(obs.mixed_layers.barrier_layer_thickness_m, 0)} m`, kind: "derived" as DataKind, source: `Argo ${obs.argo.platform_number}`, def: s!.diagnostics.barrier_layer },
        ] : []),
      ]
    : [];

  const peakDesc = (label: string, pk: GradientPeak | null | undefined) =>
    pk ? `${label}: ${pk.depth_m === null ? "not defined" : `${pk.depth_m} m`}, quality ${pk.quality}.` : "";

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1400px] w-full mx-auto">
      <PageHeader
        group="Analyze"
        title={
          <>
            Stratification <Explain term="thermocline_depth" />
          </>
        }
        description="How the water column is layered at one point: where temperature and salinity change fastest with depth, compared with the mixed layer and the 20 °C / 26 °C isotherms."
        actions={<DataBadge fallback={q.data?.__fallback} />}
      />

      <div className="panel px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <LocationPicker lat={p.lat} lon={p.lon} date={p.date} onChange={(la, lo) => go({ lat: la, lon: lo })} />
        <label className="text-[11px] text-ink-3">
          Date
          <input type="date" min={PERIOD.start} max={PERIOD.end} value={p.date} onChange={(e) => e.target.value && go({ date: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink [color-scheme:dark]" />
        </label>
        <div className="text-[11px] text-ink-3">
          Analysis depth
          <div className="mt-1">
            <Segmented label="Analysis depth" value={zmax} onChange={(z) => go({}, z)} options={STRAT_DEPTHS.map((z) => ({ value: z, label: `${z} m` }))} />
          </div>
        </div>
        <label className="text-[11px] text-ink-3 ml-auto">
          Examples
          <select value="" onChange={(e) => { const x = EXAMPLES.find((k) => k.label === e.target.value); if (x) go({ lat: x.lat, lon: x.lon, date: x.date }); }} className="mt-1 block bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink">
            <option value="">Choose…</option>
            {EXAMPLES.map((x) => (
              <option key={x.label} value={x.label}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.error && <ErrorState message={q.error} why="Stratification is computed from the reconstruction at an ocean grid cell." action="Choose an ocean point inside 5–30°N, 45–105°E and a date in 2019–2023." onRetry={q.retry} />}
      {q.loading && !s && <LoadingState label="Computing vertical gradients for this water column…" className="h-[420px]" />}

      {s && rec && (
        <div className={`space-y-4 ${q.loading ? "opacity-60 transition-opacity" : ""}`} aria-busy={q.loading}>
          {s.notice && <Notice>{s.notice}</Notice>}
          <InvestigationPoint lat={p.lat} lon={p.lon} date={s.date} observation={obs?.argo ?? null} observationNote={s.observed_status.detail} exclude={["stratification"]} />

          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 panel px-4 py-2.5" data-guide="stratification-controls">
            <legend className="sr-only">Show on the charts</legend>
            <Toggle checked={show.thermo} onChange={(v) => setShow({ ...show, thermo: v })} label="Thermocline" color={C.thermo} />
            <Toggle checked={show.halo} onChange={(v) => setShow({ ...show, halo: v })} label="Halocline" color={C.halo} />
            <Toggle checked={show.mld} onChange={(v) => setShow({ ...show, mld: v })} label="MLD" color={C.mld} />
            <Toggle checked={show.d20} onChange={(v) => setShow({ ...show, d20: v })} label="D20" color={C.d20} />
            <Toggle checked={show.d26} onChange={(v) => setShow({ ...show, d26: v })} label="D26" color={C.d26} />
            {obs && <Toggle checked={show.argo} onChange={(v) => setShow({ ...show, argo: v })} label="Measured Argo profile" color={C.argo} />}
          </fieldset>

          <div className="grid lg:grid-cols-2 gap-4" data-guide="stratification-charts">
            <section className="panel p-4" aria-label="Temperature profile">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-[13.5px] text-ink">Temperature · 0–{zmax} m</h2>
                <Provenance kind="reconstructed" source={`OceanSight U-Net · ±1σ shaded · ${s.date}`} lineage="reconstruction" />
              </div>
              <DepthProfilePlot series={tempSeries} markers={markers.temp} xLabel="Temperature (°C)" units="°C" zmax={zmax} ariaLabel={`Temperature profile to ${zmax} m at ${p.lat.toFixed(2)}°N ${p.lon.toFixed(2)}°E on ${s.date}`} description={`${peakDesc("Thermocline", rec.thermocline)} MLD ${rec.mld_m ?? "undefined"} m; D20 ${rec.d20_m ?? "undefined"} m; D26 ${rec.d26_m ?? "undefined"} m.`} />
            </section>
            <section className="panel p-4" aria-label="Temperature gradient">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-[13.5px] text-ink flex items-center gap-1">
                  Vertical temperature gradient <Explain term="vertical_gradient" />
                </h2>
                <Provenance kind="derived" source="between consecutive levels" lineage="thermocline" />
              </div>
              <DepthProfilePlot series={gradSeries} markers={markers.temp.filter((m) => m.label === "Thermocline" || m.label === "MLD")} xLabel="dT/dz (°C per m; negative = cooling with depth)" units="°C/m" digits={3} zmax={zmax} zeroLine ariaLabel="Vertical temperature gradient by layer" description={peakDesc("Thermocline", rec.thermocline) + (obs?.thermocline ? " " + peakDesc("Measured-profile thermocline", obs.thermocline) : "")} />
            </section>

            <section className="panel p-4" aria-label="Salinity profile">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-[13.5px] text-ink flex items-center gap-1">
                  Salinity <Explain term="salinity" />
                </h2>
                {obs?.salinity_psu ? <Provenance kind="measured" source={`Argo ${obs.argo.platform_number} · ${obs.argo.distance_km} km · ${obs.argo.profile_date.slice(0, 10)}`} lineage="argo" /> : reana ? <Provenance kind="reanalysis" source="GLORYS12V1" lineage="glorys_salinity" /> : null}
              </div>
              {hasSal ? (
                <DepthProfilePlot series={salSeries} markers={markers.sal} xLabel="Practical salinity (PSU)" units="PSU" digits={2} zmax={zmax} ariaLabel="Salinity profile" description={peakDesc("Halocline", obs?.halocline ?? reana?.halocline)} />
              ) : (
                <UnavailableState title="Salinity profile unavailable for this point" detail={`${s.observed_status.detail} OceanSight reconstructs temperature only. ${s.reanalysis_status.detail}`} />
              )}
            </section>
            <section className="panel p-4" aria-label="Salinity gradient">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-[13.5px] text-ink flex items-center gap-1">
                  Vertical salinity gradient <Explain term="halocline" />
                </h2>
                {hasSal && <Provenance kind="derived" source="from measured / reanalysis salinity" lineage="argo_derived" />}
              </div>
              {salGrad.length ? (
                <DepthProfilePlot series={salGrad} markers={markers.sal.filter((m) => m.label === "Halocline")} xLabel="dS/dz (PSU per m; positive = saltier with depth)" units="PSU/m" digits={3} zmax={zmax} zeroLine ariaLabel="Vertical salinity gradient by layer" description={peakDesc("Halocline", obs?.halocline ?? reana?.halocline)} />
              ) : (
                <UnavailableState title="Halocline not shown" detail="A halocline needs a salinity profile: a measured Argo profile nearby, or the optional reanalysis salinity." />
              )}
            </section>
          </div>

          <section className="panel p-4" aria-labelledby="diag-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="diag-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
                Different diagnostics, different questions
              </h2>
              {obs && (
                <a href={tsHref({ ...p, date: s.date })} className="text-[12.5px] text-accent hover:underline">
                  Open the T-S diagram for this profile →
                </a>
              )}
            </div>
            <p className="text-[12.5px] text-ink-2 mt-1.5 max-w-4xl leading-relaxed">
              MLD, thermocline, D20 and D26 describe different things and need not coincide: the mixed layer is the well-stirred top; the thermocline is where cooling with depth is strongest; D20 and D26 are the depths of fixed temperatures. In fresh-water-capped regions the density mixed layer can be shallower than the warm layer, leaving a barrier layer.
            </p>
            <div className="overflow-x-auto mt-3 -mx-4 px-4">
              <table className="w-full min-w-[640px] text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-3 border-b border-line">
                    <th className="py-1.5 pr-3 font-normal">Diagnostic</th>
                    <th className="py-1.5 pr-3 font-normal">Value</th>
                    <th className="py-1.5 pr-3 font-normal">Type · source</th>
                    <th className="py-1.5 font-normal">What it measures</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.name} className="align-top">
                      <td className="py-2 pr-3 text-ink whitespace-nowrap">
                        {r.name} <Explain term={r.term} />
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className="num text-ink">{r.value}</span> {r.quality && <QualityBadge quality={r.quality} className="ml-1" />}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <KindBadge kind={r.kind} /> <span className="text-ink-3">{r.source}</span>
                        </span>
                      </td>
                      <td className="py-2 text-ink-2">{r.def}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel p-4 grid md:grid-cols-2 gap-4" aria-label="Method and quality">
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">Reconstructed thermocline</h2>
              <PeakLine peak={rec.thermocline} unit="°C/m" />
              <Reasons peak={rec.thermocline} />
              <p className="text-[11.5px] text-ink-3 mt-2 leading-relaxed">{rec.thermocline.method} The reconstruction has 15 standard depths, so below 200 m the depth is only known to within a thick layer.</p>
            </div>
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">Measured profile</h2>
              {obs ? (
                <>
                  <div className="text-[12.5px] text-ink-2">Thermocline: <PeakLine peak={obs.thermocline} unit="°C/m" /></div>
                  <Reasons peak={obs.thermocline} />
                  <div className="text-[12.5px] text-ink-2 mt-1.5">Halocline: <PeakLine peak={obs.halocline} unit="PSU/m" /></div>
                  <Reasons peak={obs.halocline} />
                  <p className="text-[11.5px] text-ink-3 mt-2 leading-relaxed">
                    Argo QC flags 1/2; OceanSight additionally applies the Argo global-range and spike tests (
                    {Object.entries(obs.qc).map(([k, v]) => `${k}: ${v.n_failed_range + v.n_failed_spike} of ${v.n_input} levels removed`).join("; ")}) and averages in {obs.bin_m} m bins.
                    {obs.mixed_layers && ` ${obs.mixed_layers.method}`}
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-ink-3">{s.observed_status.detail}</p>
              )}
              {s.reanalysis_status.status !== "available" && <p className="text-[11.5px] text-ink-3 mt-2">Reanalysis salinity: {s.reanalysis_status.detail}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
