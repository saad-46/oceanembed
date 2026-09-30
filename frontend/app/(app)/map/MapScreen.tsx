"use client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { ChevronLeft, ChevronRight, FileText, History, ImageDown, Pause, Play, ScanLine, SlidersHorizontal, X } from "lucide-react";
import Explain from "@/components/Explain";
import ColorLegend from "@/components/Legend";
import ProfilePanel from "@/components/ProfilePanel";
import { DataBadge, ErrorState, Notice, Provenance, Skeleton, Toggle, type DataKind } from "@/components/ui";
import type { ArgoMarker, CycloneTrack, LayerKey, Meta, WindVectorsResponse } from "@/lib/api";
import type { RampName } from "@/lib/colormap";
import { addDays, clampDate, daysBetween, DEFAULT_DATE, STANDARD_DEPTHS } from "@/lib/dates";
import type { TermKey } from "@/lib/glossary";
import { sectionFromMap, timelineHref } from "@/lib/ocean";
import { useApi } from "@/lib/useApi";
import { PRODUCT_VARS, sampleGrid, useGrid, type LayerVar } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

type VarSpec = { value: LayerVar; label: string; ramp: RampName; units: string; title: string; kind: DataKind; source: string; term?: TermKey; layer: LayerKey; lineage: string; digits: number };
const VARS: VarSpec[] = [
  { value: "temp", label: "Temperature", ramp: "thermal", units: "°C", title: "Temperature", kind: "reconstructed", source: "OceanSight U-Net", term: "reconstruction", layer: "temp", lineage: "reconstruction", digits: 1 },
  { value: "anomaly", label: "Anomaly", ramp: "diverging", units: "°C", title: "Anomaly vs seasonal climatology", kind: "derived", source: "reconstruction − climatology", term: "anomaly", layer: "anomaly", lineage: "climatology", digits: 1 },
  { value: "uncertainty", label: "Uncertainty", ramp: "uncertainty", units: "°C", title: "Uncertainty (±1σ)", kind: "estimated", source: "calibrated model σ", term: "uncertainty", layer: "uncertainty", lineage: "uncertainty", digits: 2 },
  { value: "tchp", label: "TCHP", ramp: "thermal", units: "kJ/cm²", title: "Heat content above 26 °C (TCHP)", kind: "derived", source: "from reconstructed temperature", term: "tchp", layer: "tchp", lineage: "derived", digits: 0 },
  { value: "mld", label: "MLD", ramp: "thermal", units: "m", title: "Mixed-layer depth", kind: "derived", source: "from reconstructed temperature", term: "mld", layer: "mld", lineage: "derived", digits: 0 },
  { value: "d26", label: "D26", ramp: "thermal", units: "m", title: "Depth of 26 °C", kind: "derived", source: "from reconstructed temperature", term: "d26", layer: "d26", lineage: "derived", digits: 0 },
  { value: "d20", label: "D20", ramp: "thermal", units: "m", title: "Depth of 20 °C", kind: "derived", source: "from reconstructed temperature", term: "d20", layer: "d20", lineage: "derived", digits: 0 },
  { value: "salinity", label: "Salinity", ramp: "haline", units: "PSU", title: "Salinity", kind: "satellite", source: "satellite SMAP/SMOS (surface)", term: "salinity", layer: "sss", lineage: "input_sss", digits: 2 },
  { value: "sla", label: "Sea level", ramp: "diverging", units: "cm", title: "Sea-level anomaly", kind: "satellite", source: "satellite altimetry", term: "sla", layer: "sla", lineage: "input_sla", digits: 1 },
  { value: "wind", label: "Wind 10 m", ramp: "speed", units: "m/s", title: "10 m wind speed", kind: "satellite", source: "satellite-blended winds", term: "wind", layer: "wind", lineage: "input_winds", digits: 1 },
];
const PLACES = [
  { label: "Bay of Bengal · May 2023", date: "2023-05-11", lat: 15.0, lon: 88.0 },
  { label: "Arabian Sea · June 2023", date: "2023-06-06", lat: 15.0, lon: 66.0 },
  { label: "Andaman Sea · Aug 2021", date: "2021-08-01", lat: 11.0, lon: 95.0 },
];

function Group({ title, children, open = true, guide, extra }: { title: string; children: ReactNode; open?: boolean; guide?: string; extra?: ReactNode }) {
  return (
    <details open={open} className="group border-b border-line" data-guide={guide}>
      <summary className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3 group-open:text-ink-2">{title}</span>
        <span className="flex items-center gap-2">
          {extra}
          <ChevronRight size={14} className="text-ink-3 transition-transform group-open:rotate-90" aria-hidden />
        </span>
      </summary>
      <div className="px-4 pb-3.5">{children}</div>
    </details>
  );
}

export default function MapScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const meta = useApi<Meta>("/v1/meta").data;
  const tracks = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones").data?.tracks ?? null;
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
  const [toolsOpen, setToolsOpen] = useState(false); // below lg the tools are an overlay sheet
  const [draft, setDraft] = useState({ lat: lat ?? 15, lon: lon ?? 88 });
  const mapRef = useRef<MLMap | null>(null);

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

  const layers = meta?.layers;
  const avail = (x: VarSpec) => !layers || layers[x.layer]?.status === "available";
  const subsurfaceSal = layers?.salinity_subsurface?.status === "available";
  // subsurface salinity only exists with the optional reanalysis; otherwise salinity is the satellite surface field
  const layerDepth = v === "salinity" && !subsurfaceSal ? 0 : depth;
  const { grid, error, loading, range } = useGrid(date, layerDepth, v);
  const baseSpec = VARS.find((x) => x.value === v) ?? VARS[0];
  const spec: VarSpec = v === "salinity" && layerDepth > 0 ? { ...baseSpec, kind: "reanalysis", source: "GLORYS12V1 reanalysis", lineage: "glorys_salinity" } : baseSpec;
  const [showWind, setShowWind] = useState(false);
  const windOk = layers?.wind?.status === "available";
  const windQ = useApi<WindVectorsResponse>(showWind && windOk ? `/v1/wind/${date}/vectors?stride=8` : null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const argoQ = useApi<{ floats: ArgoMarker[] }>(showArgo ? `/v1/argo/markers?date=${date}&window_days=3` : null);
  const argo = showArgo ? argoQ.data?.floats ?? null : null;

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
    a.download = `oceansight_${v}_${PRODUCT_VARS.includes(v) ? "" : layerDepth + "m_"}${grid?.date ?? date}.png`;
    a.click();
  };

  const hoverVal = hover ? sampleGrid(grid, hover.lat, hover.lon) : null;
  const dayIndex = daysBetween(period.start, date);
  const nDays = daysBetween(period.start, period.end);
  const isProduct = PRODUCT_VARS.includes(v);
  const shownDate = grid?.date ?? date;
  const hasPoint = lat !== null && lon !== null;

  const tools = (
    <>
      <Group title="Variable">
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Variable">
          {VARS.map((x) => {
            const ok = avail(x);
            return (
              <button
                key={x.value}
                role="radio"
                aria-checked={v === x.value}
                aria-disabled={!ok}
                title={ok ? undefined : layers?.[x.layer]?.detail}
                onClick={() => ok && setParams({ var: x.value })}
                className={`text-[12.5px] text-left rounded-md px-2.5 py-1.5 border transition-colors ${!ok ? "border-transparent text-ink-3/60 cursor-not-allowed line-through decoration-ink-3/40" : v === x.value ? "border-accent/60 text-ink bg-accent/10" : "border-transparent text-ink-2 hover:text-ink hover:bg-white/[0.03]"}`}
              >
                {x.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1">
          <Provenance kind={spec.kind} source={spec.source} lineage={spec.lineage} />
          {spec.term && <Explain term={spec.term} />}
        </div>
        {layers && VARS.some((x) => !avail(x)) && (
          <ul className="mt-2 space-y-1">
            {VARS.filter((x) => !avail(x)).map((x) => (
              <li key={x.value} className="text-[11px] text-ink-3 leading-snug">
                <span className="text-ink-2">{x.label} unavailable:</span> {layers[x.layer]?.detail}
              </li>
            ))}
          </ul>
        )}
      </Group>
      <Group title="Depth" guide="depth" extra={<span className="num text-[12px] text-accent">{isProduct ? "—" : `${layerDepth} m`}</span>}>
        {isProduct ? (
          <p className="text-[12px] text-ink-3">{v === "sla" || v === "wind" ? `${spec.label} is a surface field, so it has no depth setting.` : `${spec.label} describes the whole column, so it has no depth setting.`} Choose Temperature, Anomaly or Uncertainty to move through depth.</p>
        ) : v === "salinity" && !subsurfaceSal ? (
          <p className="text-[12px] text-ink-3">
            Only satellite surface salinity is available. {layers?.salinity_subsurface?.detail ?? "Subsurface salinity needs the optional GLORYS reanalysis."} Measured salinity profiles are in{" "}
            <a className="text-accent hover:underline" href={`/stratification?lat=${(lat ?? 15).toFixed(3)}&lon=${(lon ?? 88).toFixed(3)}&date=${date}`}>Stratification</a>.
          </p>
        ) : (
          <>
            <label htmlFor="depth" className="sr-only">
              Depth
            </label>
            <input id="depth" type="range" min={0} max={STANDARD_DEPTHS.length - 1} value={Math.max(0, STANDARD_DEPTHS.indexOf(depth))} onChange={(e) => setParams({ depth: STANDARD_DEPTHS[Number(e.target.value)] })} aria-valuetext={`${depth} metres`} className="w-full" />
            <div className="grid grid-cols-6 gap-1 mt-1.5">
              {[0, 50, 100, 200, 500, 1000].map((z) => (
                <button key={z} onClick={() => setParams({ depth: z })} aria-pressed={depth === z} className={`num text-[11px] py-0.5 rounded border ${depth === z ? "border-accent/70 text-accent bg-accent/10" : "border-line text-ink-2 hover:text-ink"}`}>
                  {z}
                </button>
              ))}
            </div>
          </>
        )}
      </Group>
      <Group title="Date" extra={<span className="num text-[12px] text-ink-2">{shownDate}</span>}>
        <div className="flex items-center gap-1.5">
          <button aria-label="Previous day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink" onClick={() => setParams({ date: addDays(date, -1) })}>
            <ChevronLeft size={14} />
          </button>
          <input id="date" aria-label="Date" type="date" value={date} min={period.start} max={period.end} onChange={(e) => e.target.value && setParams({ date: e.target.value })} className="num bg-bg border border-line rounded-md px-2 py-1 text-sm flex-1 min-w-0 [color-scheme:dark]" />
          <button aria-label="Next day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink" onClick={() => setParams({ date: addDays(date, 1) })}>
            <ChevronRight size={14} />
          </button>
        </div>
        <input aria-label="Date slider" type="range" min={0} max={nDays} value={dayIndex} onChange={(e) => setParams({ date: addDays(period.start, Number(e.target.value)) })} aria-valuetext={date} className="w-full mt-2" />
        <div className="flex justify-between items-center text-[10.5px] text-ink-3 num">
          <span>{period.start.slice(0, 4)}</span>
          <button onClick={() => setPlaying(!playing)} className="inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline" aria-pressed={playing}>
            {playing ? <Pause size={11} /> : <Play size={11} />} {playing ? "Pause" : "Play daily"}
          </button>
          <span>{period.end.slice(0, 4)}</span>
        </div>
      </Group>
      <Group title="Overlays" open={false} extra={<span className="text-[11px] text-ink-3">{[showArgo && "Argo", showTracks && "Tracks"].filter(Boolean).join(" · ") || "off"}</span>}>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Toggle checked={showArgo} onChange={setShowArgo} label="Argo profiles (±3 days)" color="#199e70" />
            <Explain term="argo" />
          </div>
          {showArgo && argo && (
            <p className="text-[11.5px] text-ink-3 pl-6">
              <Provenance kind="measured" source={`${argo.length} floats`} /> — green: 2023 (independent), grey: training years
            </p>
          )}
          <Toggle checked={showTracks} onChange={setShowTracks} label="Cyclone tracks (IBTrACS)" color="#e8edf4" />
          {activeTrack && <p className="text-[11.5px] text-ink-3 pl-6">{activeTrack.name} on the map</p>}
          {windOk ? (
            <>
              <div className="flex items-center gap-1">
                <Toggle checked={showWind} onChange={setShowWind} label="Wind arrows (10 m)" color="#dccb62" />
                <Explain term="wind" />
              </div>
              {showWind && windQ.data && <p className="text-[11.5px] text-ink-3 pl-6">Arrows point where the wind blows to; length ∝ speed. Air motion, not ocean currents.</p>}
            </>
          ) : (
            layers && <p className="text-[11.5px] text-ink-3">Wind arrows unavailable: {layers.wind?.detail}</p>
          )}
        </div>
      </Group>
      <Group title="Location" open={false}>
        <form
          className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ lat: draft.lat.toFixed(3), lon: draft.lon.toFixed(3) });
          }}
        >
          <label className="text-[11px] text-ink-3">
            Lat °N
            <input type="number" step="0.25" min={5} max={30} value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink" />
          </label>
          <label className="text-[11px] text-ink-3">
            Lon °E
            <input type="number" step="0.25" min={45} max={105} value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink" />
          </label>
          <button type="submit" className="rounded-md border border-line-2 text-ink text-sm px-2.5 py-1 hover:border-accent/60">
            Go
          </button>
        </form>
        <div className="mt-2.5 space-y-1">
          {PLACES.map((p) => (
            <button key={p.label} onClick={() => setParams({ date: p.date, lat: p.lat.toFixed(3), lon: p.lon.toFixed(3) })} className="block w-full text-left text-[12.5px] text-ink-2 hover:text-ink rounded px-1.5 py-1 hover:bg-white/[0.03]">
              {p.label}
            </button>
          ))}
        </div>
      </Group>
      <Group title="Analyze & export" open={false}>
        <div className="grid gap-1">
          <a href={sectionFromMap(shownDate, lat, lon)} className="flex items-center gap-2 text-[12.5px] text-ink-2 hover:text-ink rounded px-1.5 py-1 hover:bg-white/[0.03]">
            <ScanLine size={14} className="text-ink-3" /> Section {hasPoint ? "through the selected point" : "across the Bay of Bengal"}
          </a>
          {hasPoint && (
            <>
              <a href={timelineHref({ lat: lat!, lon: lon!, date: shownDate })} className="flex items-center gap-2 text-[12.5px] text-ink-2 hover:text-ink rounded px-1.5 py-1 hover:bg-white/[0.03]">
                <History size={14} className="text-ink-3" /> View the point through time
              </a>
              <a href={`/reports?date=${shownDate}&lat=${lat}&lon=${lon}&depth=${isProduct ? 100 : depth}`} className="flex items-center gap-2 text-[12.5px] text-ink-2 hover:text-ink rounded px-1.5 py-1 hover:bg-white/[0.03]">
                <FileText size={14} className="text-ink-3" /> Generate a report
              </a>
            </>
          )}
          <button onClick={exportPng} className="flex items-center gap-2 text-[12.5px] text-ink-2 hover:text-ink rounded px-1.5 py-1 hover:bg-white/[0.03] text-left">
            <ImageDown size={14} className="text-ink-3" /> Export map image (PNG)
          </button>
        </div>
      </Group>
    </>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0 relative">
        {/* tools: a column on desktop, an overlay sheet below lg */}
        <aside aria-label="Map tools" className="hidden lg:block w-[268px] shrink-0 border-r border-line bg-bg-2/60 overflow-y-auto">
          {tools}
        </aside>
        {toolsOpen && (
          <aside aria-label="Map tools" className="lg:hidden absolute z-30 left-2 top-2 bottom-2 w-[min(300px,calc(100%-16px))] glass glass-strong overflow-y-auto fade-in">
            <div className="flex items-center justify-between px-4 h-11 border-b border-line">
              <span className="text-sm text-ink">Layers &amp; controls</span>
              <button onClick={() => setToolsOpen(false)} aria-label="Close map tools" className="text-ink-3 hover:text-ink">
                <X size={16} />
              </button>
            </div>
            {tools}
          </aside>
        )}

        <div className="relative flex-1 min-w-0 min-h-[420px]" data-guide="map-canvas">
          <OceanMap
            mapRef={mapRef}
            raster={raster}
            argo={showArgo ? argo : null}
            track={activeTrack?.spec ?? null}
            vectors={showWind && windOk ? windQ.data?.vectors ?? null : null}
            point={hasPoint ? { lat: lat!, lon: lon! } : null}
            onClick={(la, lo) => {
              setDraft({ lat: +la.toFixed(2), lon: +lo.toFixed(2) });
              setParams({ lat: la.toFixed(3), lon: lo.toFixed(3) });
            }}
            onHover={(h) => {
              setHover(h ? { lat: h.lat, lon: h.lon } : null);
              setCursor(h && h.x !== undefined && h.y !== undefined ? { x: h.x, y: h.y } : null);
            }}
            onArgoClick={(m) => setParams({ lat: m.lat.toFixed(3), lon: m.lon.toFixed(3), date: m.profile_date.slice(0, 10) })}
          />
          <button onClick={() => setToolsOpen(true)} className="lg:hidden absolute z-10 left-2 top-2 inline-flex items-center gap-1.5 glass px-3 py-1.5 text-[12.5px] text-ink" aria-expanded={toolsOpen}>
            <SlidersHorizontal size={14} className="text-accent" /> {spec.label}
            {!isProduct && <span className="num text-ink-2">· {layerDepth} m</span>}
          </button>
          <div className={`absolute z-[5] top-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 max-w-[min(520px,70%)] ${hasPoint ? "sm:left-[calc(50%-210px)]" : ""}`}>
            <DataBadge fallback={grid?.__fallback} />
            {grid?.notice && <Notice>{grid.notice}</Notice>}
            {error && <ErrorState message={error} why="This day or layer could not be loaded." action="Pick a date between 2019-01-01 and 2023-12-31; the previous field stays on screen." />}
          </div>
          {range && (
            <div className="absolute z-[5] left-2 bottom-2 pointer-events-none">
              <ColorLegend title={`${spec.title}${isProduct ? "" : ` · ${layerDepth} m`}`} vmin={range[0]} vmax={range[1]} units={spec.units} ramp={spec.ramp} digits={v === "uncertainty" ? 2 : v === "sla" || v === "wind" ? 0 : spec.digits === 2 ? 1 : isProduct ? 0 : 1} />
            </div>
          )}
          {!hasPoint && (
            <p className="hidden sm:block absolute z-[5] right-3 top-3 glass px-3 py-1.5 text-[12px] text-ink-2 pointer-events-none">Click any ocean cell to inspect its water column</p>
          )}
          {hover && cursor && hoverVal !== null && !loading && (
            <div className="hidden md:block absolute z-[6] pointer-events-none glass px-2.5 py-1.5 text-[11.5px] min-w-[180px]" style={{ left: cursor.x + 14, top: cursor.y + 14 }} role="tooltip">
              <div className="flex justify-between gap-3">
                <span className="text-ink-2">{spec.title}</span>
                <span className="num text-ink">{hoverVal.toFixed(spec.digits)} {spec.units}</span>
              </div>
              <div className="num text-ink-3">
                {isProduct ? (v === "sla" || v === "wind" ? (v === "wind" ? "10 m above sea" : "sea surface") : "whole column") : `${layerDepth} m`} · {shownDate}
              </div>
              <div className="num text-ink-3">
                {hover.lat.toFixed(2)}°N {hover.lon.toFixed(2)}°E
              </div>
              <div className="mt-0.5">
                <Provenance kind={spec.kind} source={grid?.provenance?.dataset ?? spec.source} />
              </div>
            </div>
          )}
          {hasPoint && (
            <aside data-guide="profile" className="absolute z-20 inset-x-2 bottom-2 top-16 sm:inset-auto sm:top-2 sm:right-2 sm:bottom-2 sm:w-[430px] glass glass-strong overflow-hidden fade-in" aria-label="Water-column profile">
              <ProfilePanel
                date={shownDate}
                lat={lat}
                lon={lon}
                onClose={() => setParams({ lat: null, lon: null })}
                context="map"
                depth={isProduct || v === "salinity" ? 100 : depth}
                layerValue={{ title: spec.title, value: sampleGrid(grid, lat!, lon!), units: spec.units, digits: spec.digits, where: isProduct ? (v === "sla" ? "sea surface" : v === "wind" ? "10 m above sea" : "whole column") : `${layerDepth} m`, date: shownDate, kind: spec.kind, source: grid?.provenance?.dataset ?? spec.source, lineage: spec.lineage }}
              />
            </aside>
          )}
        </div>
      </div>

      {/* status bar: what the colours are, where they come from, and the data version */}
      <footer className="shrink-0 border-t border-line bg-bg-2/80 px-3 md:px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-3" aria-label="Map status">
        <Provenance kind={spec.kind} source={spec.source} lineage={spec.lineage} />
        <span className="text-ink-2">
          {spec.label}
          {!isProduct && ` · ${layerDepth} m`} · <span className="num">{shownDate}</span>
        </span>
        <span className="hidden md:inline num">0.25° · daily</span>
        <span className="hidden md:inline num">Data {period.start.slice(0, 4)}–{period.end.slice(0, 4)}</span>
        <span className="hidden lg:inline num">Model {grid?.model_version ?? meta?.production_model ?? "—"}</span>
        <span className="flex-1" />
        {loading ? (
          <span className="text-accent" role="status">
            Loading {isProduct || v === "salinity" ? spec.title.toLowerCase() : `${spec.title.toLowerCase()} field at ${layerDepth} m`}…
          </span>
        ) : (
          <span className="hidden sm:inline num" aria-live="polite">
            {hover ? (
              <>
                {hover.lat.toFixed(2)}°N {hover.lon.toFixed(2)}°E · <span className="text-ink">{hoverVal === null ? "land / no data" : `${hoverVal.toFixed(spec.digits)} ${spec.units}`}</span>
              </>
            ) : (
              "Hover for values · click to inspect"
            )}
          </span>
        )}
      </footer>
    </div>
  );
}
