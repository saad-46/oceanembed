"use client";
import Link from "next/link";
import { Droplets, FileText, History, Layers, Map as MapIcon, ScanLine } from "lucide-react";
import InvestigationPoint from "./InvestigationPoint";
import UncertaintyPanel from "./UncertaintyPanel";
import { stratificationHref, tsHref } from "@/lib/analysis";
import { sectionFromMap, timelineHref } from "@/lib/ocean";
import Explain from "@/components/Explain";
import type { TermKey } from "@/lib/glossary";
import { useState } from "react";
import { apiUrl, friendlyError, post, type ProfileResponse } from "@/lib/api";
import { useBackendStatus } from "@/lib/backendStatus";
import { useApi } from "@/lib/useApi";
import ProfileChart, { type SeriesSpec } from "./ProfileChart";
import { DataBadge, ErrorState, LoadingState, Notice, Provenance, Toggle, fmt, type DataKind } from "./ui";
import { RAMPS } from "@/lib/colormap";
import { X } from "lucide-react";

const C = {
  model: "#3987e5",
  clim: "#d95926",
  argo: "#199e70",
  lgbm: "#c98500",
  nosss: "#d55181",
  target: "#9085e9",
};

export function useProfile(date: string, lat: number | null, lon: number | null) {
  const path = lat === null || lon === null ? null : `/v1/profile/${date}?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`;
  const { data, error, loading } = useApi<ProfileResponse>(path);
  return { data: error ? null : data, error, loading };
}

function Chip({ label, value, unit, hint, term }: { label: string; value: number | null; unit: string; hint: string; term: TermKey }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3 flex items-center gap-0.5">
        {label} <Explain term={term} />
      </div>
      <div className="num text-base text-ink">
        {fmt(value, 0)} <span className="text-[11px] text-ink-2">{value === null ? "" : unit}</span>
      </div>
    </div>
  );
}

function ThermalColumn({ depths, temps }: { depths: number[]; temps: (number | null)[] }) {
  const vals = temps.filter((t): t is number => t !== null);
  if (!vals.length) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (
    <div className="flex flex-col w-11 shrink-0 rounded-md overflow-hidden border border-line" aria-label="Temperature by depth colour column">
      {depths.map((z, k) => {
        const t = temps[k];
        const [r, g, b] = t === null ? [20, 30, 45] : RAMPS.thermal((t - lo) / (hi - lo || 1));
        return (
          <div key={z} className="flex-1 min-h-[16px] flex items-center justify-center text-[9px] num" style={{ background: `rgb(${r | 0},${g | 0},${b | 0})`, color: t !== null && (t - lo) / (hi - lo || 1) > 0.55 ? "#0a0e14" : "#e8eef6" }} title={`${z} m: ${t === null ? "no data" : t.toFixed(2) + " °C"}`}>
            {t === null ? "–" : t.toFixed(0)}
          </div>
        );
      })}
    </div>
  );
}

export default function ProfilePanel({
  date,
  lat,
  lon,
  onClose,
  wide = false,
  context = "map",
  depth = 100,
  layerValue,
}: {
  date: string;
  lat: number | null;
  lon: number | null;
  onClose?: () => void;
  wide?: boolean;
  /** Where the panel is shown; decides which cross-links make sense. */
  context?: "map" | "profiles" | "timeline";
  /** Map depth for the report's map inset. */
  depth?: number;
  /** The map layer's value at this cell (the map's click readout). */
  layerValue?: { title: string; value: number | null; units: string; digits: number; where: string; date: string; kind: DataKind; source: string; lineage: string };
}) {
  const { data, error, loading } = useProfile(date, lat, lon);
  useBackendStatus(); // re-render when the API connects or disconnects (the CSV link depends on it)
  const [show, setShow] = useState({ clim: true, argo: true, lgbm: false, nosss: false, target: false });
  const pointKey = `${date}|${lat}|${lon}`;
  const [summaryState, setSummary] = useState<{ key: string; text: string; source: string } | null>(null);
  const summary = summaryState?.key === pointKey ? summaryState : null;
  const [summLoading, setSummLoading] = useState(false);

  if (lat === null || lon === null)
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-ink-2 gap-2 px-6">
        <p className="text-sm">Select a point on the map to inspect its water column from the surface to 1000 m.</p>
      </div>
    );

  const summarise = async () => {
    setSummLoading(true);
    try {
      const r = await post<{ summary: string; source: string }>("/v1/assistant/query", { lat, lon, date: data?.date ?? date });
      setSummary({ key: pointKey, text: r.summary, source: r.source });
    } catch (e) {
      setSummary({ key: pointKey, text: friendlyError(e), source: "error" });
    } finally {
      setSummLoading(false);
    }
  };

  const others: SeriesSpec[] = [];
  if (data) {
    if (show.clim) others.push({ key: "clim", label: "Seasonal climatology", color: C.clim, values: data.baseline_climatology_c, dashed: true });
    if (show.lgbm && data.comparisons["baseline-lightgbm-v1"]) others.push({ key: "lgbm", label: "LightGBM baseline", color: C.lgbm, values: data.comparisons["baseline-lightgbm-v1"] });
    if (show.nosss && data.comparisons["cnn-unet-nosss-v1"]) others.push({ key: "nosss", label: "No-salinity model", color: C.nosss, values: data.comparisons["cnn-unet-nosss-v1"] });
    if (show.target && data.target_product_c) others.push({ key: "target", label: "HYCOM analysis (training target)", color: C.target, values: data.target_product_c, dashed: true });
    if (show.argo && data.nearest_argo_float)
      others.push({ key: "argo", label: `Argo ${data.nearest_argo_float.platform_number} (measured)`, color: C.argo, values: data.nearest_argo_float.temperature_c_std_depths, dots: true });
  }
  const band =
    data?.uncertainty_c
      ? {
          lo: data.temperature_c.map((t, k) => (t === null || data.uncertainty_c![k] === null ? null : t - (data.uncertainty_c![k] as number))),
          hi: data.temperature_c.map((t, k) => (t === null || data.uncertainty_c![k] === null ? null : t + (data.uncertainty_c![k] as number))),
        }
      : null;
  const argo = data?.nearest_argo_float;
  const shown = data?.date ?? date;
  const csvHref = apiUrl(`/v1/report/${shown}?lat=${lat}&lon=${lon}&format=csv`);
  const link = "inline-flex items-center gap-1.5 text-[12.5px] rounded-md border border-line px-2.5 py-1.5 text-ink-2 hover:text-ink hover:border-line-2";

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-start justify-between px-4 pt-3 pb-2.5 border-b border-line gap-2">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Water column · 0–1000 m</div>
          <div className="num text-ink text-[15px] mt-0.5">
            {lat.toFixed(2)}°N · {lon.toFixed(2)}°E <span className="text-ink-3">·</span> {shown}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close water-column panel" className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/[0.05]">
            <X size={17} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {error && <ErrorState message={error} why="There is no reconstruction for this point and day." action="Choose an ocean cell inside 5–30°N, 45–105°E and a date in 2019–2023." />}
        {loading && !data && <LoadingState label="Retrieving the selected water column…" className="h-[380px]" />}
        {data && !error && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Provenance kind="reconstructed" source={`OceanSight U-Net · ${data.model_version}`} />
              <DataBadge fallback={data.__fallback} />
            </div>
            {data.notice && <Notice>{data.notice}</Notice>}
            {layerValue && (
              <section aria-label="Map layer value at this point" className="rounded-md border border-line bg-white/[0.02] px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[12px] text-ink-2">{layerValue.title}</span>
                  <span className="num text-[16px] text-ink">
                    {layerValue.value === null ? "no data" : `${layerValue.value.toFixed(layerValue.digits)} ${layerValue.units}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                  <span className="num">{layerValue.where}</span>·<span className="num">{layerValue.date}</span>·
                  <Provenance kind={layerValue.kind} source={layerValue.source} lineage={layerValue.lineage} />
                </div>
              </section>
            )}

            <div className={`flex gap-3 items-stretch ${loading ? "opacity-60 transition-opacity" : ""}`}>
              <div className="flex-1 min-w-0">
                <ProfileChart depths={data.depths_m} main={{ key: "model", label: "OceanSight reconstruction", color: C.model, values: data.temperature_c }} band={band} others={others} height={wide ? 440 : 340} />
              </div>
              <div className="hidden sm:flex flex-col pt-9 pb-6">
                <ThermalColumn depths={data.depths_m} temps={data.temperature_c} />
              </div>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">Compare with</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Toggle checked={show.clim} onChange={(v) => setShow({ ...show, clim: v })} label="Seasonal climatology" color={C.clim} />
                {argo ? <Toggle checked={show.argo} onChange={(v) => setShow({ ...show, argo: v })} label="Argo (measured)" color={C.argo} /> : <span className="text-[12px] text-ink-3">No Argo float nearby</span>}
              </div>
              <details className="text-[12px]">
                <summary className="cursor-pointer text-ink-3 hover:text-ink-2 select-none">Model comparisons</summary>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1.5">
                  <Toggle checked={show.lgbm} onChange={(v) => setShow({ ...show, lgbm: v })} label="LightGBM" color={C.lgbm} />
                  <Toggle checked={show.nosss} onChange={(v) => setShow({ ...show, nosss: v })} label="No-salinity model" color={C.nosss} />
                  {data.target_product_c && <Toggle checked={show.target} onChange={(v) => setShow({ ...show, target: v })} label="HYCOM analysis" color={C.target} />}
                </div>
              </details>
            </fieldset>

            <UncertaintyPanel depths={data.depths_m} temps={data.temperature_c} sigmas={data.uncertainty_c} initialDepth={depth} />

            <section aria-label="Derived structure">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">Derived structure</div>
              <div className="grid grid-cols-4 gap-2">
                <Chip label="MLD" value={data.derived.mld_m} unit="m" hint="Mixed-layer depth (0.5°C below the 10 m temperature)" term="mld" />
                <Chip label="D26" value={data.derived.d26_m} unit="m" hint="Depth of the 26°C isotherm" term="d26" />
                <Chip label="D20" value={data.derived.d20_m} unit="m" hint="Depth of the 20°C isotherm (thermocline proxy)" term="d20" />
                <Chip label="TCHP" value={data.derived.tchp_kj_cm2} unit="kJ/cm²" hint="Heat content above the 26°C isotherm" term="tchp" />
              </div>
              <div className="mt-1.5">
                <Provenance kind="derived" source="from the reconstructed column" />
              </div>
            </section>

            <section aria-label="Observations">
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-1.5">Observations</div>
              {argo ? (
                <p className="text-[12.5px] text-ink-2 leading-relaxed">
                  <Provenance kind="measured" source={`Argo ${argo.platform_number}`} /> · {argo.distance_km} km away ·{" "}
                  {argo.date_offset_days === 0 ? "same day" : `${argo.date_offset_days > 0 ? "+" : ""}${argo.date_offset_days} d`} ·{" "}
                  {argo.independent ? <span className="text-good">2023 float, not used in training</span> : <span className="text-ink-3">training-year float</span>}
                </p>
              ) : (
                <p className="text-[12.5px] text-ink-3">{data.argo_lookup === "database_unavailable" ? "Observation lookup is unavailable (database offline)." : "No Argo profile within 100 km and ±3 days of this point."}</p>
              )}
            </section>

            <div className="border-t border-line pt-3">
              <InvestigationPoint compact lat={lat} lon={lon} date={shown} depth={depth} exclude={["profile", "timeline", "section", "stratification", "ts", "report"]} />
            </div>

            <section aria-label="Actions" className="space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                {context !== "timeline" && (
                  <Link className={link} href={timelineHref({ lat, lon, date: shown })}>
                    <History size={13} aria-hidden /> View through time
                  </Link>
                )}
                <Link className={link} href={sectionFromMap(shown, lat, lon)}>
                  <ScanLine size={13} aria-hidden /> Section here
                </Link>
                <Link className={link} href={stratificationHref({ lat, lon, date: shown })}>
                  <Layers size={13} aria-hidden /> Stratification
                </Link>
                <Link className={link} href={tsHref({ lat, lon, date: shown })}>
                  <Droplets size={13} aria-hidden /> T-S
                </Link>
                {context !== "map" && (
                  <Link className={link} href={`/map?date=${shown}&depth=${depth}&var=temp&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`}>
                    <MapIcon size={13} aria-hidden /> Explore on map
                  </Link>
                )}
                <Link className={`${link} border-accent/50 text-accent hover:text-accent`} href={`/reports?date=${shown}&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&depth=${depth}`}>
                  <FileText size={13} aria-hidden /> Generate report
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                <button onClick={summarise} disabled={summLoading} className="text-accent hover:underline disabled:opacity-50">
                  {summLoading ? "Summarising the computed values…" : "Summarise in plain language"}
                </button>
                {csvHref && (
                  <>
                    <span className="text-ink-3">·</span>
                    <a className="text-ink-3 hover:text-ink" href={csvHref}>
                      Download CSV
                    </a>
                  </>
                )}
              </div>
              {summary && (
                <div className="text-[13px] text-ink bg-white/[0.03] border border-line rounded-md px-3 py-2" aria-live="polite">
                  {summary.text}
                  <div className="text-[10.5px] text-ink-3 mt-1">
                    {summary.source === "llm" ? "Wording by a language model; numbers computed by OceanSight" : summary.source === "template_fallback" ? "Generated from the computed values" : ""}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
