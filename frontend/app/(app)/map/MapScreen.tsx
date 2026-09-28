"use client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import ColorLegend from "@/components/Legend";
import ProfilePanel from "@/components/ProfilePanel";
import { Badge, Button, DataBadge, ErrorState, Notice, Skeleton, Toggle } from "@/components/ui";
import { ArrowDownToLine, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FileText, ImageDown, Layers, Pause, Play, SlidersHorizontal } from "lucide-react";
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
  const [panel, setPanel] = useState<boolean | null>(null);
  useEffect(() => {
    // phones: start with the map, controls collapsed
    const raf = window.innerWidth < 768 ? requestAnimationFrame(() => setPanel(false)) : 0;
    return () => cancelAnimationFrame(raf);
  }, []);
  const exportPng = () => {
    const c = mapRef.current?.getCanvas();
    if (!c) return;
    // composite the basemap canvas with deck.gl's overlaid canvas
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#07101c";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0);
    c.parentElement?.parentElement?.querySelectorAll("canvas").forEach((k) => {
      if (k !== c) ctx.drawImage(k, 0, 0, out.width, out.height);
    });
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `oceansight_${v}_${PRODUCT_VARS.includes(v) ? "" : depth + "m_"}${grid?.date ?? date}.png`;
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

  const panelOpen = panel ?? true;
  return (
    <div className="relative flex-1 min-h-[520px] overflow-hidden">
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

      {/* status chips */}
      <div
        className={`absolute top-[68px] md:top-3 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-[5] transition-all duration-300 ${
          lat !== null && lon !== null
            ? `left-1/2 max-w-[70%] sm:max-w-[calc(100%-500px)] ${panelOpen ? "md:left-[calc(50%-74px)] md:max-w-[calc(100%-820px)]" : "sm:left-[calc(50%-230px)]"}`
            : `left-1/2 max-w-[min(560px,70%)] ${panelOpen ? "md:left-[calc(50%+156px)]" : ""}`
        }`}
      >
        <div className="flex flex-wrap justify-center gap-2 pointer-events-auto">
          <DataBadge label={grid?.data_label} fallback={grid?.__fallback} />
          {activeTrack && <Badge tone="accent">Track · {activeTrack.name}</Badge>}
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider rounded-full border border-accent/40 text-accent px-2.5 py-0.5 bg-bg/70">
              <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot text-accent" /> Loading ocean field
            </span>
          )}
        </div>
        {grid?.notice && <Notice>{grid.notice}</Notice>}
        {error && (
          <div className="pointer-events-auto w-full">
            <ErrorState message={error} action="Try a date between 2019-01-01 and 2023-12-31; the previous frame stays on screen." />
          </div>
        )}
      </div>

      {/* floating control panel */}
      <aside
        className={`absolute top-3 left-3 z-10 w-[300px] max-w-[calc(100%-24px)] glass glass-strong transition-all duration-300 ${panelOpen ? "max-h-[calc(100%-24px)]" : "max-h-12"} overflow-hidden flex flex-col`}
        aria-label="Map controls"
      >
        <button onClick={() => setPanel(!panelOpen)} className="flex items-center justify-between px-3.5 h-12 shrink-0 text-sm text-ink hover:text-accent" aria-expanded={panelOpen}>
          <span className="flex items-center gap-2 font-display">
            <SlidersHorizontal size={15} className="text-accent" /> Map controls
          </span>
          <ChevronDown size={16} className={`transition-transform ${panelOpen ? "rotate-180" : ""}`} />
        </button>
        <div className="overflow-y-auto px-3.5 pb-4 space-y-4 border-t border-line pt-3">
          <div>
            <label className="text-[10.5px] uppercase tracking-wider text-ink-3 flex items-center gap-1.5" htmlFor="date">
              <CalendarDays size={12} /> Date
            </label>
            <div className="flex items-center gap-1.5 mt-1.5">
              <button aria-label="Previous day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink hover:border-line-2" onClick={() => setParams({ date: addDays(date, -1) })}>
                <ChevronLeft size={14} />
              </button>
              <input
                id="date"
                type="date"
                value={date}
                min={period.start}
                max={period.end}
                onChange={(e) => e.target.value && setParams({ date: e.target.value })}
                className="num bg-bg/70 border border-line rounded-md px-2 py-1 text-sm flex-1 min-w-0 [color-scheme:dark]"
              />
              <button aria-label="Next day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink hover:border-line-2" onClick={() => setParams({ date: addDays(date, 1) })}>
                <ChevronRight size={14} />
              </button>
            </div>
            <input aria-label="Date slider" type="range" min={0} max={nDays} value={dayIndex} onChange={(e) => setParams({ date: addDays(period.start, Number(e.target.value)) })} className="w-full mt-2" />
            <div className="flex justify-between items-center text-[10px] text-ink-3 num">
              <span>{period.start}</span>
              <button onClick={() => setPlaying(!playing)} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline" aria-pressed={playing}>
                {playing ? <Pause size={11} /> : <Play size={11} />} {playing ? "Pause" : "Time-lapse"}
              </button>
              <span>{period.end}</span>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-wider text-ink-3 mb-1.5 flex items-center gap-1.5">
              <Layers size={12} /> Layer
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {VARS.map((x) => (
                <button
                  key={x.value}
                  onClick={() => setParams({ var: x.value })}
                  aria-pressed={v === x.value}
                  className={`text-xs rounded-md px-2 py-1.5 border transition-colors ${v === x.value ? "border-accent/70 text-accent bg-accent/10" : "border-line text-ink-2 hover:text-ink hover:border-line-2"}`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className={isProduct ? "opacity-40 pointer-events-none" : ""}>
            <label className="text-[10.5px] uppercase tracking-wider text-ink-3 flex items-center justify-between" htmlFor="depth">
              <span className="flex items-center gap-1.5">
                <ArrowDownToLine size={12} /> Depth
              </span>
              <span className="num text-accent normal-case text-sm">{depth} m</span>
            </label>
            <input id="depth" type="range" min={0} max={STANDARD_DEPTHS.length - 1} value={Math.max(0, STANDARD_DEPTHS.indexOf(depth))} onChange={(e) => setParams({ depth: STANDARD_DEPTHS[Number(e.target.value)] })} className="w-full mt-1.5" />
            <div className="grid grid-cols-6 gap-1 mt-1.5">
              {[0, 50, 100, 200, 500, 1000].map((z) => (
                <button key={z} onClick={() => setParams({ depth: z })} className={`num text-[11px] py-0.5 rounded border ${depth === z ? "border-accent text-accent bg-accent/10" : "border-line text-ink-2 hover:text-ink"}`}>
                  {z}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10.5px] uppercase tracking-wider text-ink-3">Overlays</div>
            <Toggle checked={showArgo} onChange={setShowArgo} label="Argo floats (±3 days)" color="#199e70" />
            <Toggle checked={showTracks} onChange={setShowTracks} label="Cyclone tracks (IBTrACS)" color="#e8edf4" />
            {showArgo && argo && (
              <p className="text-[11px] text-ink-3">
                {argo.length} floats · <span className="text-good">green</span> = held-out year (independent), grey = training year
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="text-[10.5px] uppercase tracking-wider text-ink-3">Quick jump</div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setParams({ date: "2023-05-11", lat: 15.0, lon: 88.0 })}>
                Pre-Mocha · BoB
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setParams({ date: "2023-06-06", lat: 15.0, lon: 66.0 })}>
                Biparjoy · Arabian Sea
              </Button>
            </div>
          </div>
          <div className="flex gap-1.5 pt-1">
            <Button variant="ghost" size="sm" onClick={exportPng} icon={<ImageDown size={14} />}>
              Export PNG
            </Button>
            {lat !== null && lon !== null && (
              <Button variant="ghost" size="sm" href={`/reports?date=${grid?.date ?? date}&lat=${lat}&lon=${lon}`} icon={<FileText size={14} />}>
                Report
              </Button>
            )}
          </div>
          <p className="text-[10.5px] text-ink-3 leading-relaxed border-t border-line pt-3">
            0.25° grid · 15 depths · daily. Model <span className="num text-ink-2">{grid?.model_version ?? "—"}</span>, from satellite SST, SSS, SLA, currents and winds.
          </p>
        </div>
      </aside>

      {/* legend + hover readout */}
      <div className={`absolute bottom-3 z-[5] flex flex-col gap-2 pointer-events-none transition-all duration-300 ${panelOpen ? "left-3 md:left-[324px]" : "left-3"}`}>
        {range && <ColorLegend title={`${spec.title}${isProduct ? "" : ` · ${depth} m`}`} vmin={range[0]} vmax={range[1]} units={spec.units} ramp={spec.ramp} digits={v === "uncertainty" ? 2 : isProduct ? 0 : 1} />}
        <div className="glass px-3 py-1.5 num text-[11px] text-ink-2 w-60 hidden sm:block" aria-live="polite">
          {hover ? (
            <>
              {hover.lat.toFixed(2)}°N {hover.lon.toFixed(2)}°E ·{" "}
              <span className="text-ink">{hoverVal === null ? "land / no data" : `${hoverVal.toFixed(v === "uncertainty" ? 2 : 1)} ${spec.units}`}</span>
            </>
          ) : (
            "Hover the map · click any cell for its profile"
          )}
        </div>
      </div>

      {/* profile drawer */}
      {lat !== null && lon !== null && (
        <aside className="absolute z-20 inset-x-2 bottom-2 top-24 sm:inset-auto sm:top-3 sm:right-3 sm:bottom-3 sm:w-[460px] glass glass-strong overflow-hidden fade-in" aria-label="Profile panel">
          <ProfilePanel date={grid?.date ?? date} lat={lat} lon={lon} onClose={() => setParams({ lat: null, lon: null })} />
        </aside>
      )}
    </div>
  );
}
