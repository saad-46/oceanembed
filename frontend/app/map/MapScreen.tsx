"use client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import ColorLegend from "@/components/Legend";
import ProfilePanel from "@/components/ProfilePanel";
import { DataBadge, ErrorState, Notice, Skeleton, Toggle } from "@/components/ui";
import { get, type ArgoMarker, type CycloneTrack, type Meta } from "@/lib/api";
import type { RampName } from "@/lib/colormap";
import { addDays, clampDate, daysBetween, DEFAULT_DATE, STANDARD_DEPTHS } from "@/lib/dates";
import { PRODUCT_VARS, sampleGrid, useGrid, type LayerVar } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

const VARS: { value: LayerVar; label: string; ramp: RampName; units: string; title: string }[] = [
  { value: "temp", label: "Temperature", ramp: "thermal", units: "°C", title: "Reconstructed temperature" },
  { value: "anomaly", label: "Anomaly", ramp: "diverging", units: "°C", title: "Anomaly vs. seasonal climatology" },
  { value: "uncertainty", label: "Uncertainty", ramp: "uncertainty", units: "°C", title: "Model uncertainty (1σ)" },
  { value: "tchp", label: "TCHP", ramp: "thermal", units: "kJ/cm²", title: "Cyclone heat potential (TCHP)" },
  { value: "mld", label: "MLD", ramp: "thermal", units: "m", title: "Mixed-layer depth" },
  { value: "d26", label: "D26", ramp: "thermal", units: "m", title: "Depth of 26°C isotherm" },
  { value: "d20", label: "D20", ramp: "thermal", units: "m", title: "Depth of 20°C isotherm" },
];

export default function MapScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const period = meta?.period ?? { start: "2019-01-01", end: "2023-12-31" };
  const date = clampDate(sp.get("date") || DEFAULT_DATE, period.start, period.end);
  const depth = Number(sp.get("depth") ?? 0);
  const v = (sp.get("var") as LayerVar) || "temp";
  const lat = sp.get("lat") ? Number(sp.get("lat")) : null;
  const lon = sp.get("lon") ? Number(sp.get("lon")) : null;
  const [showArgo, setShowArgo] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);
  const [argo, setArgo] = useState<ArgoMarker[] | null>(null);
  const [tracks, setTracks] = useState<CycloneTrack[] | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const exportPng = () => {
    const c = mapRef.current?.getCanvas();
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `gahan_${v}_${PRODUCT_VARS.includes(v) ? "" : depth + "m_"}${grid?.date ?? date}.png`;
    a.click();
  };

  const setParams = useCallback(
    (patch: Record<string, string | number | null>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, val] of Object.entries(patch)) {
        if (val === null) p.delete(k);
        else p.set(k, String(val));
      }
      router.replace(`/map?${p.toString()}`, { scroll: false });
    },
    [sp, router],
  );

  useEffect(() => {
    get<Meta>("/v1/meta").then(setMeta).catch(() => {});
    get<{ tracks: CycloneTrack[] }>("/v1/cyclones").then((r) => setTracks(r.tracks)).catch(() => setTracks(null));
  }, []);

  const { grid, error, loading, range } = useGrid(date, depth, v);
  const spec = VARS.find((x) => x.value === v) ?? VARS[0];

  useEffect(() => {
    if (!showArgo) return;
    let alive = true;
    get<{ floats: ArgoMarker[] }>(`/v1/argo/markers?date=${date}&window_days=3`)
      .then((r) => alive && setArgo(r.floats))
      .catch(() => alive && setArgo(null));
    return () => {
      alive = false;
    };
  }, [date, showArgo]);

  // time-lapse: advance one day once the current frame has loaded
  useEffect(() => {
    if (!playing || loading) return;
    const t = setTimeout(() => {
      const next = addDays(date, 1);
      if (next > period.end) setPlaying(false);
      else setParams({ date: next });
    }, 650);
    return () => clearTimeout(t);
  }, [playing, loading, date, period.end, setParams]);

  const raster = useMemo(
    () => (grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: spec.ramp, key: `${grid.date}|${grid.depth_m ?? ""}|${v}|${range}` } : null),
    [grid, range, spec.ramp, v],
  );

  const activeTrack = useMemo(() => {
    if (!showTracks || !tracks) return null;
    const t = tracks.find((tr) => tr.start && tr.end && daysBetween(tr.start.slice(0, 10), date) >= -7 && daysBetween(date, tr.end.slice(0, 10)) >= -3);
    return t ? { name: t.name, spec: { path: t.points.map((p) => [p.lon, p.lat] as [number, number]) } } : null;
  }, [showTracks, tracks, date]);

  const hoverVal = hover ? sampleGrid(grid, hover.lat, hover.lon) : null;
  const dayIndex = daysBetween(period.start, date);
  const nDays = daysBetween(period.start, period.end);
  const isProduct = PRODUCT_VARS.includes(v);

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      <div className="relative flex-1 min-h-[420px]">
        <OceanMap
          mapRef={mapRef}
          raster={raster}
          argo={showArgo ? argo : null}
          track={activeTrack?.spec ?? null}
          point={lat !== null && lon !== null ? { lat, lon } : null}
          onClick={(la, lo) => setParams({ lat: la.toFixed(3), lon: lo.toFixed(3) })}
          onHover={setHover}
          onArgoClick={(m) => setParams({ lat: m.lat.toFixed(3), lon: m.lon.toFixed(3), date: m.profile_date.slice(0, 10) })}
        />
        <div className="absolute top-3 left-3 flex flex-col gap-2 max-w-[60%] pointer-events-none">
          <div className="pointer-events-auto">
            <DataBadge label={grid?.data_label} fallback={grid?.__fallback} />
          </div>
          {grid?.notice && <Notice>{grid.notice}</Notice>}
          {error && <ErrorState message={error} />}
          {activeTrack && <Notice tone="info">Track: {activeTrack.name} (IBTrACS)</Notice>}
        </div>
        <div className="absolute bottom-3 left-3 flex flex-col gap-2 pointer-events-none">
          {range && <ColorLegend title={`${spec.title}${isProduct ? "" : ` · ${depth} m`}`} vmin={range[0]} vmax={range[1]} units={spec.units} ramp={spec.ramp} digits={v === "uncertainty" ? 2 : isProduct ? 0 : 1} />}
          <div className="bg-bg/85 border border-line rounded px-3 py-1.5 num text-[11px] text-ink-2 w-60" aria-live="polite">
            {hover ? (
              <>
                {hover.lat.toFixed(2)}°N {hover.lon.toFixed(2)}°E ·{" "}
                <span className="text-ink">{hoverVal === null ? "land / no data" : `${hoverVal.toFixed(v === "uncertainty" ? 2 : 1)} ${spec.units}`}</span>
              </>
            ) : (
              "hover the map · click for profile"
            )}
          </div>
        </div>
        {loading && <div className="absolute top-3 right-14 text-[11px] text-ink-2 bg-bg/80 px-2 py-1 rounded border border-line">loading…</div>}
        {lat !== null && lon !== null && (
          <aside className="absolute top-0 right-0 bottom-0 w-full sm:w-[440px] bg-surface/97 border-l border-line shadow-2xl z-10" aria-label="Profile panel">
            <ProfilePanel date={grid?.date ?? date} lat={lat} lon={lon} onClose={() => setParams({ lat: null, lon: null })} />
          </aside>
        )}
      </div>
      <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-line bg-surface p-4 space-y-5 overflow-y-auto" aria-label="Map controls">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-ink-3" htmlFor="date">
            Date
          </label>
          <div className="flex items-center gap-2 mt-1.5">
            <button aria-label="Previous day" className="border border-line rounded px-2 py-1 text-ink-2 hover:text-ink" onClick={() => setParams({ date: addDays(date, -1) })}>
              ‹
            </button>
            <input
              id="date"
              type="date"
              value={date}
              min={period.start}
              max={period.end}
              onChange={(e) => e.target.value && setParams({ date: e.target.value })}
              className="num bg-bg border border-line rounded px-2 py-1 text-sm flex-1 [color-scheme:dark]"
            />
            <button aria-label="Next day" className="border border-line rounded px-2 py-1 text-ink-2 hover:text-ink" onClick={() => setParams({ date: addDays(date, 1) })}>
              ›
            </button>
          </div>
          <input
            aria-label="Date slider"
            type="range"
            min={0}
            max={nDays}
            value={dayIndex}
            onChange={(e) => setParams({ date: addDays(period.start, Number(e.target.value)) })}
            className="w-full mt-2"
          />
          <div className="flex justify-between text-[10px] text-ink-3 num">
            <span>{period.start}</span>
            <span>{period.end}</span>
          </div>
          <button onClick={() => setPlaying(!playing)} className="mt-2 text-xs border border-accent/50 text-accent rounded px-3 py-1 hover:bg-accent/10" aria-pressed={playing}>
            {playing ? "❚❚ Pause time-lapse" : "▶ Play time-lapse"}
          </button>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-3 mb-1.5">Layer</div>
          <div className="grid grid-cols-2 gap-1.5">
            {VARS.map((x) => (
              <button
                key={x.value}
                onClick={() => setParams({ var: x.value })}
                aria-pressed={v === x.value}
                className={`text-xs rounded px-2 py-1.5 border ${v === x.value ? "border-accent text-accent bg-accent/10" : "border-line text-ink-2 hover:text-ink"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <div className={isProduct ? "opacity-40 pointer-events-none" : ""}>
          <label className="text-[11px] uppercase tracking-wider text-ink-3" htmlFor="depth">
            Depth <span className="num text-ink normal-case">{depth} m</span>
          </label>
          <input
            id="depth"
            type="range"
            min={0}
            max={STANDARD_DEPTHS.length - 1}
            value={Math.max(0, STANDARD_DEPTHS.indexOf(depth))}
            onChange={(e) => setParams({ depth: STANDARD_DEPTHS[Number(e.target.value)] })}
            className="w-full mt-1.5"
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[0, 50, 100, 200, 500, 1000].map((z) => (
              <button key={z} onClick={() => setParams({ depth: z })} className={`num text-[11px] px-1.5 py-0.5 rounded border ${depth === z ? "border-accent text-accent" : "border-line text-ink-2"}`}>
                {z}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">Overlays</div>
          <Toggle checked={showArgo} onChange={setShowArgo} label="Argo floats (±3 days)" color="#199e70" />
          <Toggle checked={showTracks} onChange={setShowTracks} label="Cyclone tracks (IBTrACS)" color="#e8edf4" />
          {showArgo && argo && (
            <p className="text-[11px] text-ink-3">
              {argo.length} floats · <span className="text-good">green</span> = held-out year (independent), grey = training year
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">Quick jump</div>
          <div className="flex flex-wrap gap-1.5">
            <button className="text-xs border border-line rounded px-2 py-1 text-ink-2 hover:text-ink" onClick={() => setParams({ date: "2023-05-11", lat: 15.0, lon: 88.0 })}>
              Pre-Mocha · Bay of Bengal
            </button>
            <button className="text-xs border border-line rounded px-2 py-1 text-ink-2 hover:text-ink" onClick={() => setParams({ date: "2023-06-06", lat: 15.0, lon: 66.0 })}>
              Biparjoy · Arabian Sea
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportPng} className="text-xs border border-line rounded px-3 py-1 text-ink-2 hover:text-ink">
            Export map PNG
          </button>
          {lat !== null && lon !== null && (
            <a href={`/reports?date=${grid?.date ?? date}&lat=${lat}&lon=${lon}`} className="text-xs border border-line rounded px-3 py-1 text-ink-2 hover:text-ink">
              Report for this point
            </a>
          )}
        </div>
        <p className="text-[11px] text-ink-3 leading-relaxed">
          0.25° grid, 15 standard depths (0–1000 m), daily. Reconstructed from satellite SST, SSS, SLA, currents and winds by{" "}
          <span className="num">{grid?.model_version ?? "—"}</span>.
        </p>
      </aside>
    </div>
  );
}

