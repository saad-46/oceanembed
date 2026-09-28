"use client";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Activity, BoxSelect, ChevronLeft, ChevronRight, Flame, Gauge as GaugeIcon, Layers, LineChart as LineIcon, Tornado } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ColorLegend from "@/components/Legend";
import { Card, DataBadge, ErrorState, KindBadge, LoadingState, Notice, Segmented, Skeleton, StatTile, fmt, type DataKind } from "@/components/ui";
import { type BBox, type CycloneTrack, type Fetched, type FuelResponse, type GridResponse, type Region, type RegionStats } from "@/lib/api";
import { DEFAULT_DATE } from "@/lib/dates";
import { useApi } from "@/lib/useApi";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });
const BOB: BBox = { min_lat: 5, max_lat: 22, min_lon: 80, max_lon: 100 };
const TIP = { background: "#0d1929", border: "1px solid #2ec5d8", borderRadius: 8, fontSize: 12 };
const AXIS = { fill: "#8a96a8", fontSize: 10 };

function Gauge({ value, max = 150 }: { value: number | null; max?: number }) {
  const v = value === null ? 0 : Math.min(value, max);
  const a = Math.PI * (1 - v / max);
  const x = 100 + 80 * Math.cos(a), y = 100 - 80 * Math.sin(a);
  const t50 = Math.PI * (1 - 50 / max);
  const hot = v >= 50;
  return (
    <svg viewBox="0 0 200 124" className="w-full max-w-[280px]" role="img" aria-label={`TCHP gauge ${value === null ? "no data" : value.toFixed(0) + " kJ/cm²"}`}>
      <defs>
        <linearGradient id="gaugeHot" x1="0" x2="1">
          <stop offset="0" stopColor="#3987e5" />
          <stop offset="0.45" stopColor="#f0b429" />
          <stop offset="1" stopColor="#ec5a3a" />
        </linearGradient>
      </defs>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#1c2c42" strokeWidth="14" strokeLinecap="round" />
      {value !== null && <path d={`M20 100 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke={hot ? "url(#gaugeHot)" : "#3987e5"} strokeWidth="14" strokeLinecap="round" style={{ transition: "all .35s ease" }} />}
      <line x1={100 + 64 * Math.cos(t50)} y1={100 - 64 * Math.sin(t50)} x2={100 + 96 * Math.cos(t50)} y2={100 - 96 * Math.sin(t50)} stroke="#e8edf4" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x={100 + 104 * Math.cos(t50)} y={100 - 104 * Math.sin(t50)} textAnchor="end" fill="#8a96a8" fontSize="8">
        50
      </text>
      <text x="100" y="90" textAnchor="middle" fill="#e8edf4" fontSize="30" fontFamily="var(--font-plex-mono)">
        {value === null ? "—" : value.toFixed(0)}
      </text>
      <text x="100" y="106" textAnchor="middle" fill="#8a96a8" fontSize="9.5">
        kJ/cm² ocean heat content
      </text>
      <text x="100" y="121" textAnchor="middle" fill={value === null ? "#8a96a8" : hot ? "#f0b429" : "#7fa8d8"} fontSize="9.5" fontWeight="600">
        {value === null ? "no ocean value here" : hot ? "above the 50 kJ/cm² reference level" : "below the 50 kJ/cm² reference level"}
      </text>
    </svg>
  );
}

function ProvRow({ label, value, source, kind }: { label: string; value: string; source: string; kind: DataKind }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-line last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-ink">{label}</div>
        <div className="text-[10.5px] text-ink-3 truncate">{source}</div>
      </div>
      <div className="num text-sm text-ink text-right whitespace-nowrap">{value}</div>
      <div className="w-[112px] shrink-0 flex justify-end">
        <KindBadge kind={kind} />
      </div>
    </div>
  );
}

export default function AnalysisScreen() {
  const [date, setDate] = useState(DEFAULT_DATE);
  const [bbox, setBbox] = useState<BBox>(BOB);
  const [corner, setCorner] = useState<{ lat: number; lon: number } | null>(null);
  const [tsProduct, setTsProduct] = useState<"tchp" | "mld" | "d26" | "d20">("tchp");
  const [lead, setLead] = useState(2);
  const sp = useSearchParams();
  const [mode, setMode] = useState<"region" | "cyclone">(sp.get("mode") === "cyclone" ? "cyclone" : "region");
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
  const setStep = (n: number) => fuel && fuelKey && setStepState({ key: fuelKey, step: Math.max(0, Math.min(fuel.points.length - 1, n)) });

  const cur = fuel?.points[step];
  const mapDate = mode === "cyclone" ? cur?.ocean_date ?? date : date;
  const tchpQ = useApi<GridResponse>(`/v1/grid/${mapDate}/product?product=tchp`);
  const tchpMap: GridResponse | null = tchpQ.data;
  const tchpMax = tchpMap?.stats ? Math.max(100, Math.ceil(tchpMap.stats.max / 10) * 10) : 100;

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
  const activeTrack = tracks?.find((t) => t.id === trackId);
  const nAbove = fuel ? fuel.points.filter((p) => (p.tchp_kj_cm2 ?? 0) >= 50).length : 0;
  const nOcean = fuel ? fuel.points.filter((p) => p.tchp_kj_cm2 !== null).length : 0;

  return (
    <div className="flex-1 flex flex-col xl:flex-row min-h-0">
      {/* map canvas */}
      <div className="relative xl:flex-1 h-[52vh] xl:h-auto min-h-[380px]">
        <OceanMap
          raster={tchpMap?.stats ? { values: tchpMap.grid.values, vmin: 0, vmax: tchpMax, ramp: "thermal", key: `tchp|${tchpMap.date}` } : null}
          bbox={mode === "region" ? bbox : null}
          point={mode === "region" ? corner : null}
          track={track}
          onClick={onMapClick}
        />
        <div className="absolute top-3 left-3 right-3 flex flex-col items-start gap-2 pointer-events-none">
          <div className="pointer-events-auto glass p-1">
            <Segmented label="Analysis mode" value={mode} onChange={setMode} options={[{ value: "region", label: "Region analysis" }, { value: "cyclone", label: "Cyclone Fuel Gauge" }]} />
          </div>
          {mode === "region" && (
            <div className="glass px-3 py-1.5 text-[12px] text-ink-2 flex items-center gap-2">
              <BoxSelect size={13} className="text-accent" />
              {corner ? "Now click the opposite corner to finish the box" : "Click two corners on the map to draw a custom region"}
            </div>
          )}
          {mode === "cyclone" && cur && (
            <div className="glass px-3 py-1.5 text-[12px] text-ink-2 num flex items-center gap-2">
              <Tornado size={13} className="text-accent" />
              {activeTrack?.name} · {cur.time.slice(0, 16).replace("T", " ")} UTC · point {step + 1}/{fuel?.points.length}
            </div>
          )}
          {tchpQ.loading && !tchpMap && (
            <span className="glass inline-flex items-center gap-1.5 text-[11px] text-accent px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" /> Loading reconstructed heat-content field
            </span>
          )}
        </div>
        {tchpMap?.stats && (
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <ColorLegend title={`Reconstructed TCHP · ${tchpMap.date}`} vmin={0} vmax={tchpMax} units="kJ/cm²" ramp="thermal" digits={0} />
          </div>
        )}
      </div>

      {/* workspace */}
      <aside className="xl:w-[540px] shrink-0 border-t xl:border-t-0 xl:border-l border-line bg-bg-2/60 overflow-y-auto p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Analysis workspace</div>
            <h2 className="font-display text-xl mt-1">{mode === "region" ? "Regional ocean state" : "Cyclone Fuel Gauge"}</h2>
            <p className="text-[12.5px] text-ink-3 mt-1 leading-relaxed">
              {mode === "region"
                ? "Upper-ocean heat and stratification averaged over a box, from the daily reconstruction."
                : "How much ocean heat sat beneath a real cyclone's track, a few days before it passed."}
            </p>
          </div>
          <DataBadge fallback={mode === "region" ? stats?.__fallback : fuel?.__fallback} />
        </div>

        {mode === "region" ? (
          <>
            <Card title="Region & date" icon={<Layers size={14} />}>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={date} min="2019-01-01" max="2023-12-31" onChange={(e) => e.target.value && setDate(e.target.value)} className="num bg-bg border border-line rounded-md px-2 py-1 text-sm [color-scheme:dark]" aria-label="Analysis date" />
                {regions.map((r) => {
                  const on = r.bbox.min_lat === bbox.min_lat && r.bbox.max_lat === bbox.max_lat && r.bbox.min_lon === bbox.min_lon && r.bbox.max_lon === bbox.max_lon;
                  return (
                    <button key={r.name} onClick={() => setBbox(r.bbox)} aria-pressed={on} className={`text-xs rounded-full px-3 py-1 border transition-colors ${on ? "border-accent/70 text-accent bg-accent/10" : "border-line text-ink-2 hover:text-ink hover:border-line-2"}`}>
                      {r.name}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-ink-3 num mt-2.5">
                Box {bbox.min_lat.toFixed(2)}–{bbox.max_lat.toFixed(2)}°N · {bbox.min_lon.toFixed(2)}–{bbox.max_lon.toFixed(2)}°E {stats && `· ${stats.n_ocean_cells.toLocaleString("en-IN")} ocean cells`}
              </div>
            </Card>
            {statsErr && <ErrorState message={statsErr} why="Region statistics could not be computed for this box and date." action="Pick a date in 2019–2023 or a box that covers ocean cells." onRetry={statsQ.retry} />}
            {stats?.notice && <Notice>{stats.notice}</Notice>}
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile icon={<Flame size={13} />} label="Mean TCHP" value={fmt(stats?.mean_tchp_kj_cm2, 0)} unit="kJ/cm²" loading={statsLoading && !stats} hint={stats ? `max ${fmt(stats.max_tchp_kj_cm2, 0)} · ${fmt((stats.frac_cells_tchp_gt_50 ?? 0) * 100, 0)}% of area > 50` : undefined} />
              <StatTile icon={<Activity size={13} />} label="Mixed-layer depth" value={fmt(stats?.mean_mld_m, 0)} unit="m" loading={statsLoading && !stats} hint="0.5 °C below 10 m temperature" />
              <StatTile icon={<Layers size={13} />} label="D26 / D20" value={stats ? `${fmt(stats.mean_d26_m, 0)} / ${fmt(stats.mean_d20_m, 0)}` : null} unit="m" loading={statsLoading && !stats} hint="isotherm depths" />
              <StatTile
                icon={<GaugeIcon size={13} />}
                label="Barrier-layer proxy"
                value={stats?.barrier_layer_flag === null || stats?.barrier_layer_flag === undefined ? "—" : stats.barrier_layer_flag ? "Likely" : "Unlikely"}
                loading={statsLoading && !stats}
                hint={stats ? `${fmt((stats.barrier_layer_proxy.frac_cells_sss_below_threshold ?? 0) * 100, 0)}% of area SSS < ${stats.barrier_layer_proxy.sss_threshold_psu} PSU` : undefined}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
              <KindBadge kind="derived" /> TCHP, MLD, D26, D20 are computed from the reconstructed temperature column.
              <KindBadge kind="estimated" /> barrier layer is a satellite-SSS proxy, not a measurement.
            </div>
            <Card title="Region mean over 2019–2023" icon={<LineIcon size={14} />} right={<Segmented label="Product" value={tsProduct} onChange={setTsProduct} options={[{ value: "tchp", label: "TCHP" }, { value: "mld", label: "MLD" }, { value: "d26", label: "D26" }, { value: "d20", label: "D20" }]} />}>
              {!ts ? (
                <LoadingState label="Averaging five years of daily fields over the box…" className="h-52" />
              ) : tsData.length === 0 ? (
                <ErrorState message="Time series unavailable" why="The API returned no values for this box." action="Try one of the preset regions." onRetry={tsQ.retry} />
              ) : (
                <div className="h-52">
                  <ResponsiveContainer>
                    <LineChart data={tsData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#8a96a8" strokeOpacity={0.1} vertical={false} />
                      <XAxis dataKey="date" tick={AXIS} stroke="#1c2c42" tickFormatter={(d: string) => d.slice(0, 7)} minTickGap={40} />
                      <YAxis tick={AXIS} stroke="#1c2c42" width={36} reversed={tsProduct !== "tchp"} />
                      <Tooltip contentStyle={TIP} formatter={(v) => [typeof v === "number" ? `${v.toFixed(1)} ${tsUnits}` : "—", tsProduct.toUpperCase()]} />
                      <ReferenceLine x={tsData.find((d) => d.date >= date)?.date} stroke="#2ec5d8" strokeDasharray="3 3" />
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
            <Card title="Storm & lead time" icon={<Tornado size={14} />}>
              <div className="flex flex-wrap gap-2 items-center">
                <select value={trackId ?? ""} onChange={(e) => setPick(Number(e.target.value))} className="bg-bg border border-line rounded-md px-2 py-1.5 text-sm flex-1 min-w-[180px]" aria-label="Cyclone">
                  {(tracks ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.peak_category}
                    </option>
                  ))}
                </select>
                <label className="text-xs text-ink-2 flex items-center gap-1.5">
                  ocean state
                  <select value={lead} onChange={(e) => setLead(Number(e.target.value))} className="bg-bg border border-line rounded-md px-1.5 py-1 num">
                    {[0, 1, 2, 3, 5].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  days before passage
                </label>
              </div>
            </Card>
            {fuelErr && <ErrorState message={fuelErr} why="The cyclone track or its ocean heat could not be loaded." action="Check the API connection, or pick another storm." onRetry={fuelQ.retry} />}
            {!fuel && !fuelErr && <LoadingState label="Sampling reconstructed ocean heat along the track…" className="h-72" />}
            {fuel && cur && (
              <>
                <Card title="Fuel under the storm" icon={<Flame size={14} />}>
                  <div className="flex flex-col items-center">
                    <Gauge value={cur.tchp_kj_cm2} />
                    <div className="flex items-center gap-2 mt-2">
                      <button aria-label="Previous track point" onClick={() => setStep(step - 1)} disabled={step === 0} className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink disabled:opacity-40">
                        <ChevronLeft size={14} />
                      </button>
                      <input type="range" min={0} max={fuel.points.length - 1} value={step} onChange={(e) => setStep(Number(e.target.value))} className="w-56" aria-label="Track position" />
                      <button aria-label="Next track point" onClick={() => setStep(step + 1)} disabled={step === fuel.points.length - 1} className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink disabled:opacity-40">
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <ProvRow label="Storm position & time" value={`${cur.lat.toFixed(1)}°N ${cur.lon.toFixed(1)}°E`} source={`NOAA IBTrACS best track · ${cur.time.slice(0, 16).replace("T", " ")} UTC`} kind="measured" />
                    <ProvRow label="Intensity" value={cur.wind_kt ? `${cur.wind_kt} kt` : "—"} source={`IBTrACS · ${cur.category ?? "category n/a"}`} kind="measured" />
                    <ProvRow label="Sea-surface temperature" value={cur.sst_c === null ? "—" : `${cur.sst_c.toFixed(1)} °C`} source={`OceanSight reconstruction · ocean state ${cur.ocean_date ?? "—"}`} kind="reconstructed" />
                    <ProvRow label="Tropical-cyclone heat potential" value={cur.tchp_kj_cm2 === null ? "—" : `${cur.tchp_kj_cm2.toFixed(0)} kJ/cm²`} source="Integrated from the reconstructed column above 26 °C" kind="derived" />
                    <ProvRow label="Depth of the 26 °C isotherm" value={cur.d26_m === null ? "—" : `${cur.d26_m.toFixed(0)} m`} source="Interpolated from the reconstructed profile" kind="derived" />
                  </div>
                  {cur.tchp_kj_cm2 === null && <p className="text-xs text-ink-3 mt-2">This track point is over land or outside the 5–30°N, 45–105°E domain, so there is no ocean value.</p>}
                </Card>
                <Card title="Heat content along the track" icon={<LineIcon size={14} />} right={<span className="text-[11px] text-ink-3 num">{nAbove}/{nOcean} ocean points ≥ 50</span>}>
                  <div className="h-44">
                    <ResponsiveContainer>
                      <LineChart data={fuel.points.map((p, i) => ({ i, t: p.time.slice(5, 13).replace("T", " "), tchp: p.tchp_kj_cm2, wind: p.wind_kt }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} onClick={(e) => typeof e?.activeTooltipIndex === "number" && setStep(e.activeTooltipIndex)}>
                        <CartesianGrid stroke="#8a96a8" strokeOpacity={0.1} vertical={false} />
                        <XAxis dataKey="t" tick={AXIS} stroke="#1c2c42" minTickGap={30} />
                        <YAxis tick={AXIS} stroke="#1c2c42" width={32} />
                        <Tooltip contentStyle={TIP} formatter={(v) => [typeof v === "number" ? `${v.toFixed(0)} kJ/cm²` : "—", "TCHP"]} />
                        <ReferenceLine y={50} stroke="#e8edf4" strokeDasharray="3 3" strokeOpacity={0.5} />
                        <ReferenceLine x={fuel.points[step] ? fuel.points[step].time.slice(5, 13).replace("T", " ") : undefined} stroke="#2ec5d8" />
                        <Line dataKey="tchp" stroke="#ec7a5a" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-ink-3 mt-1 leading-relaxed">
                    Click the chart to jump along the track. {fuel.note} Peak reconstructed TCHP: <span className="num text-ink">{fmt(fuel.max_tchp_kj_cm2, 0)} kJ/cm²</span>.
                  </p>
                </Card>
                <p className="text-[11px] text-ink-3 leading-relaxed">
                  The 50 kJ/cm² line is a widely used reference level for ocean heat that can support intensification; it is context, not a forecast. This gauge describes the ocean — it does not predict storm intensity.
                </p>
              </>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
