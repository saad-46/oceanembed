"use client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, MapPin, MoveHorizontal, MoveVertical, ScanLine } from "lucide-react";
import DepthChart, { type ChartLine } from "@/components/DepthChart";
import Explain from "@/components/Explain";
import ColorLegend from "@/components/Legend";
import { Button, Card, DataBadge, ErrorState, KindBadge, LoadingState, Segmented, Skeleton } from "@/components/ui";
import type { SectionAnyResponse } from "@/lib/api";
import { addDays, clampDate } from "@/lib/dates";
import { DOMAIN, PERIOD, ZMAX_OPTIONS, parseSectionParams, sectionApiPath, sectionHref, sectionMapHref, timelineHref, traceIsotherm, viewState, type SectionParams } from "@/lib/ocean";
import { useApi } from "@/lib/useApi";
import { useGrid } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

const PRESETS: { label: string; p: Omit<SectionParams, "date" | "variable" | "zmax"> }[] = [
  { label: "Bay of Bengal · 15°N", p: { dir: "lon", at: 15, from: 80, to: 97 } },
  { label: "Arabian Sea · 15°N", p: { dir: "lon", at: 15, from: 52, to: 75 } },
  { label: "BoB meridian · 88°E", p: { dir: "lat", at: 88, from: 5, to: 22 } },
  { label: "Arabian Sea meridian · 65°E", p: { dir: "lat", at: 65, from: 5, to: 25 } },
];
const VAR_STYLE = {
  temp: { ramp: "thermal", title: "Reconstructed temperature", digits: 1 },
  anomaly: { ramp: "diverging", title: "Anomaly vs seasonal climatology", digits: 2 },
  uncertainty: { ramp: "uncertainty", title: "Model uncertainty (1σ)", digits: 2 },
} as const;

export default function SectionScreen() {
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
    <div className="px-4 md:px-7 py-6 space-y-5 max-w-[1500px] w-full mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow flex items-center gap-1.5">
            <ScanLine size={12} /> Vertical section
          </div>
          <h2 className="font-display text-2xl md:text-[28px] mt-1">
            Slice through the ocean <Explain term="cross_section" />
          </h2>
          <p className="text-sm text-ink-2 mt-1.5 max-w-3xl leading-relaxed">
            Choose a line across the basin and a day: the section shows how temperature changes with depth along it, with the 20 °C and 26 °C isotherms <Explain term="isotherm" /> traced from the data.
          </p>
        </div>
        <DataBadge label={s?.data_label} fallback={s?.__fallback} />
      </div>

      <div className="grid xl:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-4">
          <Card title="Transect" icon={<ScanLine size={14} />}>
            <Segmented
              label="Transect direction"
              value={p.dir}
              onChange={(d) => {
                const n = parseSectionParams(new URLSearchParams({ dir: d, date: p.date, variable: p.variable, zmax: String(p.zmax) }));
                setDraft({ at: n.at, from: n.from, to: n.to });
                set({ dir: d, at: n.at, from: n.from, to: n.to });
              }}
              options={[
                { value: "lon", label: "Longitude transect" },
                { value: "lat", label: "Latitude transect" },
              ]}
            />
            <p className="text-[11px] text-ink-3 mt-2 flex items-center gap-1.5">
              {isLon ? <MoveHorizontal size={12} /> : <MoveVertical size={12} />}
              {isLon ? "West → east along a fixed latitude." : "South → north along a fixed longitude."}
            </p>
            <form
              className="grid grid-cols-3 gap-2 mt-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                apply();
              }}
            >
              <label className="text-[11px] text-ink-3">
                {isLon ? "Latitude °N" : "Longitude °E"}
                <input type="number" step="0.25" min={isLon ? DOMAIN.latMin : DOMAIN.lonMin} max={isLon ? DOMAIN.latMax : DOMAIN.lonMax} value={draft.at} onChange={(e) => setDraft({ ...draft, at: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                From {isLon ? "°E" : "°N"}
                <input type="number" step="0.25" value={draft.from} onChange={(e) => setDraft({ ...draft, from: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                To {isLon ? "°E" : "°N"}
                <input type="number" step="0.25" value={draft.to} onChange={(e) => setDraft({ ...draft, to: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1.5 text-sm text-ink" />
              </label>
              <button type="submit" className="col-span-3 rounded-lg bg-accent text-[#04121c] text-sm font-semibold py-1.5 hover:brightness-110">
                Draw section
              </button>
            </form>
            <div className="relative h-44 mt-3 rounded-md overflow-hidden border border-line">
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
            <p className="text-[11px] text-ink-3 mt-1.5">Click the map to move the {isLon ? "latitude" : "longitude"} of the line.</p>
          </Card>
          <Card title="Day & variable">
            <div className="flex items-center gap-1.5">
              <button aria-label="Previous day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink" onClick={() => set({ date: clampDate(addDays(p.date, -1), PERIOD.start, PERIOD.end) })}>
                <ChevronLeft size={14} />
              </button>
              <input type="date" aria-label="Section date" min={PERIOD.start} max={PERIOD.end} value={p.date} onChange={(e) => e.target.value && set({ date: e.target.value })} className="num bg-bg border border-line rounded-md px-2 py-1 text-sm flex-1 min-w-0 [color-scheme:dark]" />
              <button aria-label="Next day" className="p-1.5 rounded-md border border-line text-ink-2 hover:text-ink" onClick={() => set({ date: clampDate(addDays(p.date, 1), PERIOD.start, PERIOD.end) })}>
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <Segmented label="Variable" value={p.variable} onChange={(v) => set({ variable: v })} options={[{ value: "temp", label: "Temperature" }, { value: "anomaly", label: "Anomaly" }, { value: "uncertainty", label: "Uncertainty" }]} />
              <Segmented label="Max depth" value={p.zmax} onChange={(z) => set({ zmax: z })} options={ZMAX_OPTIONS.map((z) => ({ value: z, label: `${z} m` }))} />
            </div>
          </Card>
          <Card title="Presets">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((x) => (
                <Button
                  key={x.label}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDraft({ at: x.p.at, from: x.p.from, to: x.p.to });
                    set(x.p);
                  }}
                >
                  {x.label}
                </Button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card
            title={
              <span className="flex items-center gap-2">
                {s ? (isLon ? `${(s.lat as number).toFixed(2)}°N · ${fmtX(s.x[0])} → ${fmtX(s.x[s.x.length - 1])}` : `${(s.lon as number).toFixed(2)}°E · ${fmtX(s.x[0])} → ${fmtX(s.x[s.x.length - 1])}`) : "Section"}
                <KindBadge kind={p.variable === "uncertainty" ? "estimated" : p.variable === "anomaly" ? "derived" : "reconstructed"} />
              </span>
            }
            right={
              <Button size="sm" variant="secondary" href={sectionMapHref(p)} icon={<MapPin size={13} />}>
                Open in Map
              </Button>
            }
          >
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
                    height={340}
                    ariaLabel={`Vertical section of ${VAR_STYLE[p.variable].title.toLowerCase()} on ${s.date}`}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                  <ColorLegend title={`${VAR_STYLE[p.variable].title} · ${s.date}`} vmin={vmin} vmax={vmax} units="°C" ramp={VAR_STYLE[p.variable].ramp} digits={p.variable === "temp" ? 0 : 1} />
                  {lines.map((l) => (
                    <span key={l.name} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                      <span className="inline-block w-4 border-t-2" style={{ borderColor: l.color }} /> {l.name} isotherm
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-ink-3 mt-2 leading-relaxed">
                  Each column is one 0.25° grid cell of the reconstruction (no horizontal interpolation); colours blend between the 15 standard depths for display and blank cells are land or below the seabed.
                  {p.variable === "temp" && " Isotherms are derived by linear interpolation between the two standard depths that bracket 20 °C / 26 °C."} Drag to zoom; click a column to select it.
                </p>
              </>
            )}
          </Card>
          {picked && (
            <Card title={`Selected column · ${picked.lat.toFixed(2)}°N ${picked.lon.toFixed(2)}°E`}>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" href={`/map?date=${p.date}&depth=100&var=${p.variable}&lat=${picked.lat.toFixed(3)}&lon=${picked.lon.toFixed(3)}`} icon={<MapPin size={13} />}>
                  Profile on the map
                </Button>
                <Button size="sm" variant="secondary" href={timelineHref({ lat: picked.lat, lon: picked.lon, date: p.date })} icon={<History size={13} />}>
                  View this point through time
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
