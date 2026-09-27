"use client";
import { useState } from "react";
import { API_URL, friendlyError, post, type ProfileResponse } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import ProfileChart, { type SeriesSpec } from "./ProfileChart";
import { DataBadge, ErrorState, Notice, Skeleton, Toggle, fmt } from "./ui";

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

function Chip({ label, value, unit, hint }: { label: string; value: number | null; unit: string; hint: string }) {
  return (
    <div className="border border-line rounded px-2.5 py-1.5 min-w-0" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="num text-base text-ink">
        {fmt(value, 0)} <span className="text-[11px] text-ink-2">{value === null ? "" : unit}</span>
      </div>
    </div>
  );
}

export default function ProfilePanel({ date, lat, lon, onClose }: { date: string; lat: number | null; lon: number | null; onClose?: () => void }) {
  const { data, error, loading } = useProfile(date, lat, lon);
  const [show, setShow] = useState({ clim: true, argo: true, lgbm: false, nosss: false, target: false });
  const pointKey = `${date}|${lat}|${lon}`;
  const [summaryState, setSummary] = useState<{ key: string; text: string; source: string } | null>(null);
  const summary = summaryState?.key === pointKey ? summaryState : null;
  const [summLoading, setSummLoading] = useState(false);

  if (lat === null || lon === null)
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-ink-2 gap-3 px-6">
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="opacity-70">
          <circle cx="28" cy="28" r="6" fill="none" stroke="#2ac3de" strokeWidth="2">
            <animate attributeName="r" values="4;12;4" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.2;1" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <path d="M30 30 L44 46 L38 46 L42 54" stroke="#8a96a8" strokeWidth="2" fill="none" />
        </svg>
        <p className="text-sm">Select a point on the map to see its full 0–1000 m temperature profile.</p>
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
    if (show.clim) others.push({ key: "clim", label: "Climatology baseline", color: C.clim, values: data.baseline_climatology_c, dashed: true });
    if (show.lgbm && data.comparisons["baseline-lightgbm-v1"]) others.push({ key: "lgbm", label: "LightGBM baseline", color: C.lgbm, values: data.comparisons["baseline-lightgbm-v1"] });
    if (show.nosss && data.comparisons["cnn-unet-nosss-v1"]) others.push({ key: "nosss", label: "No-salinity ablation", color: C.nosss, values: data.comparisons["cnn-unet-nosss-v1"] });
    if (show.target && data.target_product_c) others.push({ key: "target", label: "HYCOM reanalysis (target product)", color: C.target, values: data.target_product_c, dashed: true });
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

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-start justify-between px-4 pt-3 pb-2 border-b border-line gap-2">
        <div className="min-w-0">
          <div className="font-display text-sm text-ink-2 uppercase tracking-wide">Temperature profile</div>
          <div className="num text-ink text-sm mt-0.5">
            {lat.toFixed(2)}°N {lon.toFixed(2)}°E · {data?.date ?? date}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close profile panel" className="text-ink-2 hover:text-ink text-lg leading-none px-1">
            ×
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {error && <ErrorState message={error} />}
        {loading && !data && (
          <>
            <Skeleton className="h-[340px] w-full" />
            <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          </>
        )}
        {data && !error && (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <DataBadge label={data.data_label} fallback={data.__fallback} />
              <span className="text-[11px] text-ink-3 num">model {data.model_version}</span>
            </div>
            {data.notice && <Notice>{data.notice}</Notice>}
            <div className={loading ? "opacity-60 transition-opacity" : ""}>
              <ProfileChart depths={data.depths_m} main={{ key: "model", label: "GAHAN reconstruction", color: C.model, values: data.temperature_c }} band={band} others={others} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Chip label="TCHP" value={data.derived.tchp_kj_cm2} unit="kJ/cm²" hint="Tropical cyclone heat potential: heat content above the 26°C isotherm" />
              <Chip label="MLD" value={data.derived.mld_m} unit="m" hint="Mixed-layer depth (0.5°C below the 10 m temperature)" />
              <Chip label="D26" value={data.derived.d26_m} unit="m" hint="Depth of the 26°C isotherm" />
              <Chip label="D20" value={data.derived.d20_m} unit="m" hint="Depth of the 20°C isotherm (thermocline proxy)" />
            </div>
            <fieldset className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <legend className="text-[11px] uppercase tracking-wider text-ink-3 mb-1">Compare with</legend>
              <Toggle checked={show.clim} onChange={(v) => setShow({ ...show, clim: v })} label="Climatology" color={C.clim} />
              <Toggle checked={show.lgbm} onChange={(v) => setShow({ ...show, lgbm: v })} label="LightGBM" color={C.lgbm} />
              <Toggle checked={show.nosss} onChange={(v) => setShow({ ...show, nosss: v })} label="No-salinity model" color={C.nosss} />
              {data.target_product_c && <Toggle checked={show.target} onChange={(v) => setShow({ ...show, target: v })} label="HYCOM target" color={C.target} />}
              {argo && <Toggle checked={show.argo} onChange={(v) => setShow({ ...show, argo: v })} label="Argo float" color={C.argo} />}
            </fieldset>
            {argo ? (
              <p className="text-xs text-ink-2">
                Nearest Argo float <span className="num text-ink">{argo.platform_number}</span> · {argo.distance_km} km away ·{" "}
                {argo.date_offset_days === 0 ? "same day" : `${argo.date_offset_days > 0 ? "+" : ""}${argo.date_offset_days} d`} ·{" "}
                {argo.independent ? (
                  <span className="text-good">independent (held-out year)</span>
                ) : (
                  <span className="text-ink-3">training-year float (not independent)</span>
                )}
              </p>
            ) : (
              <p className="text-xs text-ink-3">
                {data.argo_lookup === "database_unavailable" ? "Argo lookup unavailable (database offline)." : "No Argo float within 100 km and ±3 days."}
              </p>
            )}
            <div className="border-t border-line pt-3 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <button onClick={summarise} disabled={summLoading} className="text-xs border border-accent/50 text-accent rounded px-3 py-1.5 hover:bg-accent/10 disabled:opacity-50">
                  {summLoading ? "Summarising…" : "Summarise in plain language"}
                </button>
                <a className="text-xs border border-line text-ink-2 rounded px-3 py-1.5 hover:text-ink" href={`${API_URL}/v1/report/${data.date}?lat=${lat}&lon=${lon}&format=pdf`}>
                  PDF report
                </a>
                <a className="text-xs border border-line text-ink-2 rounded px-3 py-1.5 hover:text-ink" href={`${API_URL}/v1/report/${data.date}?lat=${lat}&lon=${lon}&format=csv`}>
                  CSV
                </a>
              </div>
              {summary && (
                <div className="text-sm text-ink bg-surface-2 rounded px-3 py-2">
                  {summary.text}
                  <div className="text-[10px] text-ink-3 mt-1 uppercase tracking-wider">
                    {summary.source === "llm" ? "LLM phrasing of computed values" : summary.source === "template_fallback" ? "Templated from computed values" : ""}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
