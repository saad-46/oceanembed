"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ColorLegend from "@/components/Legend";
import { Card, DataBadge, ErrorState, Notice, Segmented, Skeleton, StatTile, fmt } from "@/components/ui";
import { type BBox, type CycloneTrack, type Fetched, type FuelResponse, type GridResponse, type Region, type RegionStats } from "@/lib/api";
import { DEFAULT_DATE } from "@/lib/dates";
import { useApi } from "@/lib/useApi";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });
const BOB: BBox = { min_lat: 5, max_lat: 22, min_lon: 80, max_lon: 100 };

function Gauge({ value, max = 150 }: { value: number | null; max?: number }) {
  const v = value === null ? 0 : Math.min(value, max);
  const a = Math.PI * (1 - v / max);
  const x = 100 + 80 * Math.cos(a), y = 100 - 80 * Math.sin(a);
  const t50 = Math.PI * (1 - 50 / max);
  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[260px]" role="img" aria-label={`TCHP gauge ${value === null ? "no data" : value.toFixed(0) + " kJ/cm²"}`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#1e2836" strokeWidth="14" strokeLinecap="round" />
      <path d={`M20 100 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke={v >= 50 ? "#ec7a5a" : "#3987e5"} strokeWidth="14" strokeLinecap="round" />
      <line x1={100 + 66 * Math.cos(t50)} y1={100 - 66 * Math.sin(t50)} x2={100 + 94 * Math.cos(t50)} y2={100 - 94 * Math.sin(t50)} stroke="#e8edf4" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x="100" y="92" textAnchor="middle" fill="#e8edf4" fontSize="26" fontFamily="var(--font-plex-mono)">
        {value === null ? "—" : value.toFixed(0)}
      </text>
      <text x="100" y="112" textAnchor="middle" fill="#8a96a8" fontSize="10">
        kJ/cm² · 50 = intensification-supportive
      </text>
    </svg>
  );
}

export default function AnalysisScreen() {
  const [date, setDate] = useState(DEFAULT_DATE);
  const [bbox, setBbox] = useState<BBox>(BOB);
  const [corner, setCorner] = useState<{ lat: number; lon: number } | null>(null);
  const [tsProduct, setTsProduct] = useState<"tchp" | "mld" | "d26" | "d20">("tchp");
  const [lead, setLead] = useState(2);
  const [mode, setMode] = useState<"region" | "cyclone">("region");
  const [pick, setPick] = useState<number | null>(null);
  const [stepState, setStepState] = useState<{ key: string; step: number } | null>(null);

  const regions = useApi<{ regions: Region[] }>("/v1/regions").data?.regions ?? [];
  const tracksQ = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones");
  const tracks = tracksQ.data?.tracks ?? null;
  const defaultTrack = tracks ? (tracks.find((t) => t.name.includes("Mocha")) ?? tracks[tracks.length - 1])?.id ?? null : null;
  const trackId = pick ?? defaultTrack;
  const statsQ = useApi<RegionStats>("/v1/region/stats", { date, bbox });
  const stats: Fetched<RegionStats> | null = statsQ.data;
  const statsErr = statsQ.error;
  const statsLoading = statsQ.loading;
  const tsQ = useApi<{ dates: string[]; values: (number | null)[] }>("/v1/region/timeseries", { bbox, product: tsProduct, stride_days: 5 });
  const ts = tsQ.loading ? null : tsQ.error ? { dates: [], values: [] } : tsQ.data;
  const fuelKey = trackId === null ? null : `/v1/cyclones/${trackId}/fuel?lead_days=${lead}`;
  const fuelQ = useApi<FuelResponse>(fuelKey);
  const fuel = fuelQ.loading ? null : fuelQ.data;
  const fuelErr = fuelQ.error ?? tracksQ.error;
  const firstValid = fuel ? Math.max(0, fuel.points.findIndex((p) => p.tchp_kj_cm2 !== null)) : 0;
  const step = stepState && stepState.key === fuelKey ? stepState.step : firstValid;
  const setStep = (n: number) => fuelKey && setStepState({ key: fuelKey, step: n });

  const cur = fuel?.points[step];
  const mapDate = mode === "cyclone" ? cur?.ocean_date ?? date : date;
  const tchpMap: GridResponse | null = useApi<GridResponse>(`/v1/grid/${mapDate}/product?product=tchp`).data;

  const onMapClick = (lat: number, lon: number) => {
    if (mode !== "region") return;
    if (!corner) setCorner({ lat, lon });
    else {
      const b = { min_lat: Math.max(5, Math.min(lat, corner.lat)), max_lat: Math.min(30, Math.max(lat, corner.lat)), min_lon: Math.max(45, Math.min(lon, corner.lon)), max_lon: Math.min(105, Math.max(lon, corner.lon)) };
      if (b.max_lat - b.min_lat >= 0.5 && b.max_lon - b.min_lon >= 0.5) setBbox(b);
      setCorner(null);
    }
  };

  const track = useMemo(
    () =>
      mode === "cyclone" && fuel
        ? { path: fuel.points.map((p) => [p.lon, p.lat] as [number, number]), points: fuel.points.map((p) => ({ lon: p.lon, lat: p.lat, value: p.tchp_kj_cm2 })), highlight: step }
        : null,
    [mode, fuel, step],
  );
  const tsData = ts?.dates.map((d, i) => ({ date: d, v: ts.values[i] })) ?? [];
  const tsUnits = tsProduct === "tchp" ? "kJ/cm²" : "m";

  return (
    <div className="flex-1 flex flex-col xl:flex-row min-h-0">
      <div className="relative xl:flex-1 h-[52vh] xl:h-auto min-h-[380px]">
        <OceanMap
          raster={tchpMap?.stats ? { values: tchpMap.grid.values, vmin: 0, vmax: Math.max(100, Math.ceil(tchpMap.stats.max / 10) * 10), ramp: "thermal", key: `tchp|${tchpMap.date}` } : null}
          bbox={mode === "region" ? bbox : null}
          point={mode === "region" ? corner : null}
          track={track}
          onClick={onMapClick}
        />
        <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none max-w-[70%]">
          <div className="pointer-events-auto">
            <Segmented label="Analysis mode" value={mode} onChange={setMode} options={[{ value: "region", label: "Region analysis" }, { value: "cyclone", label: "Cyclone Fuel Gauge" }]} />
          </div>
          {mode === "region" && <Notice tone="info">{corner ? "Click the opposite corner to finish the box" : "Click two corners on the map to draw a region box"}</Notice>}
        </div>
        {tchpMap?.stats && (
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <ColorLegend title={`Reconstructed TCHP · ${tchpMap.date}`} vmin={0} vmax={Math.max(100, Math.ceil(tchpMap.stats.max / 10) * 10)} units="kJ/cm²" ramp="thermal" digits={0} />
          </div>
        )}
      </div>
      <aside className="xl:w-[520px] shrink-0 border-t xl:border-t-0 xl:border-l border-line bg-bg overflow-y-auto p-4 space-y-4">
        {mode === "region" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={date} min="2019-01-01" max="2023-12-31" onChange={(e) => e.target.value && setDate(e.target.value)} className="num bg-surface border border-line rounded px-2 py-1 text-sm [color-scheme:dark]" aria-label="Analysis date" />
              {regions.map((r) => (
                <button key={r.name} onClick={() => setBbox(r.bbox)} className="text-xs border border-line rounded px-2 py-1 text-ink-2 hover:text-ink">
                  {r.name}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-ink-3 num">
              Box {bbox.min_lat.toFixed(2)}–{bbox.max_lat.toFixed(2)}°N · {bbox.min_lon.toFixed(2)}–{bbox.max_lon.toFixed(2)}°E {stats && `· ${stats.n_ocean_cells.toLocaleString()} ocean cells`}
            </div>
            {statsErr && <ErrorState message={statsErr} />}
            {stats?.notice && <Notice>{stats.notice}</Notice>}
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Mean TCHP" value={fmt(stats?.mean_tchp_kj_cm2, 0)} unit="kJ/cm²" loading={statsLoading && !stats} hint={stats ? `max ${fmt(stats.max_tchp_kj_cm2, 0)} · ${fmt((stats.frac_cells_tchp_gt_50 ?? 0) * 100, 0)}% of area > 50` : undefined} />
              <StatTile label="Mean mixed-layer depth" value={fmt(stats?.mean_mld_m, 0)} unit="m" loading={statsLoading && !stats} />
              <StatTile label="Mean D26 / D20" value={stats ? `${fmt(stats.mean_d26_m, 0)} / ${fmt(stats.mean_d20_m, 0)}` : null} unit="m" loading={statsLoading && !stats} />
              <StatTile
                label="Barrier-layer proxy"
                value={stats?.barrier_layer_flag === null || stats?.barrier_layer_flag === undefined ? "—" : stats.barrier_layer_flag ? "Likely" : "Unlikely"}
                loading={statsLoading && !stats}
                hint={stats ? `${fmt((stats.barrier_layer_proxy.frac_cells_sss_below_threshold ?? 0) * 100, 0)}% of area SSS < ${stats.barrier_layer_proxy.sss_threshold_psu} PSU (proxy from satellite SSS)` : undefined}
              />
            </div>
            <Card title="Region mean over the study period" right={<Segmented label="Product" value={tsProduct} onChange={setTsProduct} options={[{ value: "tchp", label: "TCHP" }, { value: "mld", label: "MLD" }, { value: "d26", label: "D26" }, { value: "d20", label: "D20" }]} />}>
              {!ts ? (
                <Skeleton className="h-52" />
              ) : tsData.length === 0 ? (
                <p className="text-sm text-ink-3">Time series unavailable.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer>
                    <LineChart data={tsData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#8a96a8" strokeOpacity={0.12} vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "#8a96a8", fontSize: 10 }} stroke="#1e2836" tickFormatter={(d: string) => d.slice(0, 7)} minTickGap={40} />
                      <YAxis tick={{ fill: "#8a96a8", fontSize: 10 }} stroke="#1e2836" width={36} reversed={tsProduct !== "tchp"} />
                      <Tooltip contentStyle={{ background: "#111826", border: "1px solid #2ac3de", fontSize: 12 }} formatter={(v) => [typeof v === "number" ? `${v.toFixed(1)} ${tsUnits}` : "—", tsProduct.toUpperCase()]} />
                      <ReferenceLine x={tsData.find((d) => d.date >= date)?.date} stroke="#2ac3de" strokeDasharray="3 3" />
                      <Line dataKey="v" stroke="#3987e5" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="text-[11px] text-ink-3 mt-1">Every 5th day; dashed line = selected date. {tsProduct !== "tchp" && "Depth axis increases downward."}</p>
            </Card>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={trackId ?? ""} onChange={(e) => setPick(Number(e.target.value))} className="bg-surface border border-line rounded px-2 py-1 text-sm" aria-label="Cyclone">
                {(tracks ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.peak_category}
                  </option>
                ))}
              </select>
              <label className="text-xs text-ink-2 flex items-center gap-1.5">
                ocean state
                <select value={lead} onChange={(e) => setLead(Number(e.target.value))} className="bg-surface border border-line rounded px-1 py-0.5 num">
                  {[0, 1, 2, 3, 5].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                days before passage
              </label>
            </div>
            {fuelErr && <ErrorState message={fuelErr} />}
            {!fuel && !fuelErr && <Skeleton className="h-64" />}
            {fuel && (
              <>
                <DataBadge />
                <div className="flex flex-col items-center">
                  <Gauge value={cur?.tchp_kj_cm2 ?? null} />
                  <div className="text-sm text-ink num mt-1">
                    {cur?.time.slice(0, 16).replace("T", " ")} UTC · {cur?.lat.toFixed(1)}°N {cur?.lon.toFixed(1)}°E
                  </div>
                  <div className="text-xs text-ink-2">
                    {cur?.category ?? "—"} {cur?.wind_kt ? `· ${cur.wind_kt} kt` : ""} {cur?.ocean_date && `· ocean state ${cur.ocean_date}`}
                  </div>
                  {cur && cur.tchp_kj_cm2 === null && <p className="text-xs text-ink-3 mt-1">Track point over land or outside the study domain.</p>}
                </div>
                <input type="range" min={0} max={fuel.points.length - 1} value={step} onChange={(e) => setStep(Number(e.target.value))} className="w-full" aria-label="Track position" />
                <div className="h-44">
                  <ResponsiveContainer>
                    <LineChart data={fuel.points.map((p, i) => ({ i, t: p.time.slice(5, 13).replace("T", " "), tchp: p.tchp_kj_cm2, wind: p.wind_kt }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} onClick={(e) => typeof e?.activeTooltipIndex === "number" && setStep(e.activeTooltipIndex)}>
                      <CartesianGrid stroke="#8a96a8" strokeOpacity={0.12} vertical={false} />
                      <XAxis dataKey="t" tick={{ fill: "#8a96a8", fontSize: 10 }} stroke="#1e2836" minTickGap={30} />
                      <YAxis tick={{ fill: "#8a96a8", fontSize: 10 }} stroke="#1e2836" width={32} />
                      <Tooltip contentStyle={{ background: "#111826", border: "1px solid #2ac3de", fontSize: 12 }} formatter={(v) => [typeof v === "number" ? `${v.toFixed(0)} kJ/cm²` : "—", "TCHP"]} />
                      <ReferenceLine y={50} stroke="#e8edf4" strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine x={fuel.points[step] ? fuel.points[step].time.slice(5, 13).replace("T", " ") : undefined} stroke="#2ac3de" />
                      <Line dataKey="tchp" stroke="#ec7a5a" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-ink-3">
                  {fuel.note} Peak reconstructed TCHP along the track: <span className="num text-ink">{fmt(fuel.max_tchp_kj_cm2, 0)} kJ/cm²</span>. Track: NOAA IBTrACS; ocean: GAHAN satellite-only reconstruction.
                </p>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
