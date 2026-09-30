"use client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, MapPin } from "lucide-react";
import DepthChart, { type ChartLine } from "@/components/DepthChart";
import Explain from "@/components/Explain";
import ColorLegend from "@/components/Legend";
import { Button, DataBadge, ErrorState, LoadingState, PageHeader, Provenance, Segmented, Skeleton, type DataKind } from "@/components/ui";
import type { SectionAnyResponse } from "@/lib/api";
import { addDays, clampDate } from "@/lib/dates";
import { DOMAIN, PERIOD, ZMAX_OPTIONS, parseSectionParams, sectionApiPath, sectionHref, sectionMapHref, timelineHref, traceIsotherm, viewState, type SectionParams } from "@/lib/ocean";
import { useApi, useOffline } from "@/lib/useApi";
import { useGrid } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

const PRESETS: { label: string; p: Omit<SectionParams, "date" | "variable" | "zmax">; saved?: boolean }[] = [
  { label: "Bay of Bengal · 15°N", p: { dir: "lon", at: 15, from: 80, to: 97 }, saved: true },
  { label: "Arabian Sea · 15°N", p: { dir: "lon", at: 15, from: 52, to: 75 } },
  { label: "BoB meridian · 88°E", p: { dir: "lat", at: 88, from: 5, to: 22 } },
  { label: "Arabian Sea meridian · 65°E", p: { dir: "lat", at: 65, from: 5, to: 25 } },
];
const VAR_STYLE: Record<SectionParams["variable"], { ramp: "thermal" | "diverging" | "uncertainty"; title: string; digits: number; kind: DataKind; source: string }> = {
  temp: { ramp: "thermal", title: "Temperature", digits: 1, kind: "reconstructed", source: "OceanSight U-Net · grid cells" },
  anomaly: { ramp: "diverging", title: "Anomaly vs seasonal climatology", digits: 2, kind: "derived", source: "reconstruction − climatology" },
  uncertainty: { ramp: "uncertainty", title: "Uncertainty (±1σ)", digits: 2, kind: "estimated", source: "calibrated model σ" },
};

export default function SectionScreen() {
  const offline = useOffline();
  const sp = useSearchParams();
  const router = useRouter();
  const p = parseSectionParams(sp);
  const set = useCallback((patch: Partial<SectionParams>) => router.replace(sectionHref({ ...p, ...patch }), { scroll: false }), [p, router]);
  const [draft, setDraft] = useState({ at: p.at, from: p.from, to: p.to });
  const [pick, setPick] = useState<number | null>(null);

  const q = useApi<SectionAnyResponse>(sectionApiPath(p));
  const s = q.data && !q.error ? q.data : null;
  const state = viewState({ loading: q.loading, error: q.error, values: s?.values });
  const { grid, range } = useGrid(p.date, 0, "temp");
  const isLon = p.dir === "lon";
  const fmtX = useCallback((v: number) => (isLon ? `${v.toFixed(2)}°E` : `${v.toFixed(2)}°N`), [isLon]);

  const [vmin, vmax] = useMemo(() => {
    if (!s) return [0, 1];
    const within = s.values.filter((_, k) => s.depths_m[k] <= p.zmax).flat().filter((v): v is number => v !== null);
    if (!within.length) return [0, 1];
    if (p.variable === "anomaly") {
      const m = Math.min(4, Math.max(0.5, ...within.map(Math.abs)));
      return [-m, m];
    }
    return [Math.floor(Math.min(...within) * 10) / 10, Math.ceil(Math.max(...within) * 10) / 10];
  }, [s, p.zmax, p.variable]);
  const lines: ChartLine[] = useMemo(
    () =>
      s && p.variable === "temp"
        ? [
            { name: "26 °C", color: "#f0b429", values: traceIsotherm(s.values, s.depths_m, 26) },
            { name: "20 °C", color: "#2ec5d8", values: traceIsotherm(s.values, s.depths_m, 20) },
          ]
        : [],
    [s, p.variable],
  );
  // the transect drawn on the locator map
  const track = useMemo(() => {
    const pts: [number, number][] = isLon ? [[p.from, p.at], [p.to, p.at]] : [[p.at, p.from], [p.at, p.to]];
    return { path: pts, points: [] };
  }, [isLon, p.from, p.to, p.at]);
  const picked = s && pick !== null ? { x: s.x[pick], lat: isLon ? p.at : s.x[pick], lon: isLon ? s.x[pick] : p.at } : null;
  const apply = () => set({ at: draft.at, from: Math.min(draft.from, draft.to), to: Math.max(draft.from, draft.to) });

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1500px] w-full mx-auto">
      <PageHeader
        group="Analyze"
        title={
          <>
            Section <Explain term="cross_section" />
          </>
        }
        description="A vertical slice through the reconstructed ocean along a line, with the 20 °C and 26 °C isotherms traced from the data."
        actions={
          <>
            <DataBadge fallback={s?.__fallback} />
            <Button size="sm" variant="secondary" href={sectionMapHref(p)} icon={<MapPin size={13} />}>
              Open in map
            </Button>
          </>
        }
      />

      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* toolbar: transect · day · variable */}
          <div className="panel px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <div className="text-[11px] text-ink-3 mb-1">Transect</div>
              <Segmented
                label="Transect direction"
                value={p.dir}
                onChange={(d) => {
                  const n = parseSectionParams(new URLSearchParams({ dir: d, date: p.date, variable: p.variable, zmax: String(p.zmax) }));
                  setDraft({ at: n.at, from: n.from, to: n.to });
                  set({ dir: d, at: n.at, from: n.from, to: n.to });
                }}
                options={[
                  { value: "lon", label: "West–east" },
                  { value: "lat", label: "South–north" },
                ]}
              />
            </div>
            <form
              className="flex items-end gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                apply();
              }}
            >
              <label className="text-[11px] text-ink-3">
                {isLon ? "At lat °N" : "At lon °E"}
                <input type="number" step="0.25" min={isLon ? DOMAIN.latMin : DOMAIN.lonMin} max={isLon ? DOMAIN.latMax : DOMAIN.lonMax} value={draft.at} onChange={(e) => setDraft({ ...draft, at: Number(e.target.value) })} className="mt-1 block w-[76px] num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                From {isLon ? "°E" : "°N"}
                <input type="number" step="0.25" value={draft.from} onChange={(e) => setDraft({ ...draft, from: Number(e.target.value) })} className="mt-1 block w-[76px] num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                To {isLon ? "°E" : "°N"}
                <input type="number" step="0.25" value={draft.to} onChange={(e) => setDraft({ ...draft, to: Number(e.target.value) })} className="mt-1 block w-[76px] num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink" />
              </label>
              <button type="submit" className="rounded-md border border-line-2 text-ink text-sm px-2.5 py-1 hover:border-accent/60">
                Draw
              </button>
            </form>
            <div className="flex items-end gap-1.5">
              <button aria-label="Previous day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink" onClick={() => set({ date: clampDate(addDays(p.date, -1), PERIOD.start, PERIOD.end) })}>
                <ChevronLeft size={14} />
              </button>
              <label className="text-[11px] text-ink-3">
                Day
                <input type="date" aria-label="Section date" min={PERIOD.start} max={PERIOD.end} value={p.date} onChange={(e) => e.target.value && set({ date: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm [color-scheme:dark]" />
              </label>
              <button aria-label="Next day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink" onClick={() => set({ date: clampDate(addDays(p.date, 1), PERIOD.start, PERIOD.end) })}>
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Variable" value={p.variable} onChange={(v) => set({ variable: v })} options={[{ value: "temp", label: "Temperature" }, { value: "anomaly", label: "Anomaly" }, { value: "uncertainty", label: "Uncertainty" }]} />
              <Segmented label="Max depth" value={p.zmax} onChange={(z) => set({ zmax: z })} options={ZMAX_OPTIONS.map((z) => ({ value: z, label: `${z} m` }))} />
            </div>
          </div>

          {/* the instrument */}
          <section className="panel p-4" data-guide="section-chart" aria-label="Vertical section">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <h2 className="text-[13.5px] text-ink num">
                {s ? `${isLon ? `${(s.lat as number).toFixed(2)}°N` : `${(s.lon as number).toFixed(2)}°E`} · ${fmtX(s.x[0])} → ${fmtX(s.x[s.x.length - 1])} · ${s.date}` : "Section"}
              </h2>
              <Provenance kind={VAR_STYLE[p.variable].kind} source={VAR_STYLE[p.variable].source} />
            </div>
            {state === "error" && <ErrorState message={q.error!} why="The section could not be drawn for this line and day." action="Keep the line inside 5–30°N, 45–105°E, at least 0.5° long, on a day in 2019–2023." onRetry={q.retry} />}
            {state === "loading" && <LoadingState label="Cutting a slice through the reconstructed ocean…" className="h-[340px]" />}
            {state === "empty" && <p className="text-sm text-ink-3 h-40 flex items-center justify-center">This line runs over land only — move it over the ocean.</p>}
            {state === "ready" && s && (
              <>
                {s.notice && <p className="text-[12px] text-warn mb-2">{s.notice}</p>}
                <div className={q.loading ? "opacity-60 transition-opacity" : ""} aria-busy={q.loading}>
                  <DepthChart
                    x={s.x}
                    xLabel={(i) => fmtX(s.x[i] ?? 0)}
                    depths={s.depths_m}
                    values={s.values}
                    vmin={vmin}
                    vmax={vmax}
                    ramp={VAR_STYLE[p.variable].ramp}
                    zmax={p.zmax}
                    units="°C"
                    digits={VAR_STYLE[p.variable].digits}
                    lines={lines}
                    selected={pick}
                    onSelect={setPick}
                    height={360}
                    ariaLabel={`Vertical section of ${VAR_STYLE[p.variable].title.toLowerCase()} on ${s.date}`}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                  <ColorLegend title={VAR_STYLE[p.variable].title} vmin={vmin} vmax={vmax} units="°C" ramp={VAR_STYLE[p.variable].ramp} digits={p.variable === "temp" ? 0 : 1} />
                  {lines.map((l) => (
                    <span key={l.name} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                      <span className="inline-block w-4 border-t-2" style={{ borderColor: l.color }} /> {l.name} isotherm
                    </span>
                  ))}
                  {lines.length > 0 && <Explain term="isotherm" />}
                </div>
                <p className="text-[11.5px] text-ink-3 mt-2 leading-relaxed">
                  Each column is one 0.25° grid cell (no horizontal interpolation); colours blend between the 15 standard depths for display; blank cells are land or below the seabed.
                  {p.variable === "temp" && " Isotherms are derived by interpolating between the two standard depths that bracket 20 °C / 26 °C."} Drag to zoom; click a column to select it.
                </p>
              </>
            )}
          </section>

          {picked && (
            <section className="panel px-4 py-3 flex flex-wrap items-center gap-3" aria-label="Selected column">
              <span className="text-[13px] text-ink num">
                Selected column · {picked.lat.toFixed(2)}°N {picked.lon.toFixed(2)}°E
              </span>
              <span className="flex-1" />
              <Button size="sm" href={`/map?date=${p.date}&depth=100&var=${p.variable}&lat=${picked.lat.toFixed(3)}&lon=${picked.lon.toFixed(3)}`} icon={<MapPin size={13} />}>
                Water column
              </Button>
              <Button size="sm" variant="secondary" href={timelineHref({ lat: picked.lat, lon: picked.lon, date: p.date })} icon={<History size={13} />}>
                Through time
              </Button>
            </section>
          )}
        </div>

        <aside className="panel p-3 space-y-3" aria-label="Transect locator">
          <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Locator</div>
          <div className="relative h-48 rounded-md overflow-hidden border border-line">
            <OceanMap
              minimal
              raster={grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: "thermal", key: `sec|${grid.date}` } : null}
              track={track}
              onClick={(la, lo) => {
                const at = +(isLon ? la : lo).toFixed(2);
                setDraft({ ...draft, at });
                set({ at });
              }}
            />
          </div>
          <p className="text-[11.5px] text-ink-3">Click the map to move the line&apos;s {isLon ? "latitude" : "longitude"}.</p>
          <div>
            <div className="text-[11px] text-ink-3 mb-1">Examples</div>
            <div className="grid gap-0.5">
              {PRESETS.map((x) => (
                <button
                  key={x.label}
                  disabled={offline && !x.saved}
                  title={offline && !x.saved ? "Saved offline copies cover the reference cases only; start the OceanSight service for this example." : undefined}
                  onClick={() => {
                    setDraft({ at: x.p.at, from: x.p.from, to: x.p.to });
                    set(x.p);
                  }}
                  className="text-left text-[12.5px] text-ink-2 hover:text-ink rounded px-1.5 py-1 hover:bg-white/[0.03] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  {x.label}
                  {offline && !x.saved && <span className="text-ink-3"> — needs live service</span>}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
