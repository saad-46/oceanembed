"use client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Crosshair, History, MapPin, Pause, Play, ScanLine, Tornado } from "lucide-react";
import DepthChart, { type ChartLine } from "@/components/DepthChart";
import Explain from "@/components/Explain";
import ColorLegend from "@/components/Legend";
import ProfilePanel from "@/components/ProfilePanel";
import { Button, Card, DataBadge, ErrorState, KindBadge, LoadingState, Segmented, Skeleton, fmt } from "@/components/ui";
import type { CycloneTrack, TimelineResponse } from "@/lib/api";
import { PERIOD, ZMAX_OPTIONS, cyclonePassages, mapStateHref, parseTimelineParams, sectionFromMap, timelineHref, viewState, type TimelineParams } from "@/lib/ocean";
import { addDays } from "@/lib/dates";
import { useApi } from "@/lib/useApi";
import { useGrid } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

const PRESETS = [
  { label: "Bay of Bengal · 2023 (Mocha)", lat: 15, lon: 88, start: "2023-01-01", end: "2023-12-31", date: "2023-05-11" },
  { label: "Arabian Sea · 2023 (Biparjoy)", lat: 15, lon: 66, start: "2023-01-01", end: "2023-12-31", date: "2023-06-06" },
  { label: "Central BoB · 2019–2023", lat: 15, lon: 88, start: "2019-01-01", end: "2023-12-31", date: "2021-05-20" },
  { label: "Southern Arabian Sea · 2022", lat: 10, lon: 60, start: "2022-01-01", end: "2022-12-31", date: "2022-07-15" },
];
const RANGES = [
  { label: "2023", start: "2023-01-01", end: "2023-12-31" },
  { label: "SW monsoon 2023", start: "2023-06-01", end: "2023-09-30" },
  { label: "Mocha window", start: "2023-04-15", end: "2023-06-15" },
  { label: "All 2019–2023", start: PERIOD.start, end: PERIOD.end },
];
const LINE_STYLE = { mld: { name: "MLD", color: "#e8edf4", dash: [5, 3] }, d26: { name: "D26", color: "#f0b429" }, d20: { name: "D20", color: "#2ec5d8" } } as const;

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = requestAnimationFrame(() => setR(m.matches));
    return () => cancelAnimationFrame(f);
  }, []);
  return r;
}

export default function TimelineScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const p = parseTimelineParams(sp);
  const set = useCallback((patch: Partial<TimelineParams>) => router.replace(timelineHref({ ...p, ...patch }), { scroll: false }), [p, router]);
  const [draft, setDraft] = useState({ lat: p.lat, lon: p.lon });
  const [show, setShow] = useState({ mld: true, d26: true, d20: true, storms: true });
  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState<number | null>(null);
  const reduced = useReducedMotion();

  const q = useApi<TimelineResponse>(`/v1/timeline?lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}&start=${p.start}&end=${p.end}`);
  const tl = q.data && !q.error ? q.data : null;
  const tracks = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones").data?.tracks;
  const { grid, range } = useGrid(p.start, 0, "temp");

  const dateIdx = tl ? Math.max(0, tl.dates.findIndex((d) => d >= p.date)) : 0;
  const sel = playing && playIdx !== null ? playIdx : dateIdx;
  const selDate = tl?.dates[sel] ?? p.date;

  // anomaly = reconstruction − seasonal climatology (both model-side, same cell)
  const values = useMemo(() => {
    if (!tl) return null;
    if (p.view === "temp" || !tl.climatology_c) return tl.temperature_c;
    return tl.temperature_c.map((row, k) => row.map((v, t) => (v === null || tl.climatology_c![k][t] === null ? null : +(v - tl.climatology_c![k][t]!).toFixed(2))));
  }, [tl, p.view]);
  const state = viewState({ loading: q.loading, error: q.error, values });
  const [vmin, vmax] = useMemo(() => {
    if (!values || !tl) return [0, 1];
    const within = values.filter((_, k) => tl.depths_m[k] <= p.zmax).flat().filter((v): v is number => v !== null);
    if (!within.length) return [0, 1];
    if (p.view === "anomaly") {
      const m = Math.min(4, Math.max(0.5, ...within.map(Math.abs)));
      return [-m, m];
    }
    return [Math.floor(Math.min(...within)), Math.ceil(Math.max(...within))];
  }, [values, tl, p.zmax, p.view]);

  const lines: ChartLine[] = useMemo(() => {
    if (!tl) return [];
    return (["mld", "d26", "d20"] as const).filter((k) => show[k]).map((k) => ({ ...LINE_STYLE[k], dash: "dash" in LINE_STYLE[k] ? [...(LINE_STYLE[k] as { dash: readonly number[] }).dash] : undefined, values: tl[`${k}_m`] }));
  }, [tl, show]);
  const passages = useMemo(() => (tracks && tl ? cyclonePassages(tracks, tl.cell.lat, tl.cell.lon, tl.start, tl.end) : []), [tracks, tl]);
  const markers = useMemo(
    () => (show.storms && tl ? passages.map((s) => ({ index: Math.max(0, tl.dates.findIndex((d) => d >= s.date)), label: s.name.replace(/^Cyclone /, "").replace(/ \d{4}$/, "") })) : []),
    [passages, tl, show.storms],
  );

  // play: move the day cursor through the samples; the URL/profile update when paused
  useEffect(() => {
    if (!playing || !tl) return;
    const t = setInterval(() => setPlayIdx((i) => ((i ?? dateIdx) + 1) % tl.dates.length), 220);
    return () => clearInterval(t);
  }, [playing, tl, dateIdx]);
  const togglePlay = () => {
    if (playing && tl && playIdx !== null) set({ date: tl.dates[playIdx] });
    setPlayIdx(playing ? null : dateIdx);
    setPlaying(!playing);
  };

  const at = (k: number) => tl?.temperature_c[k]?.[sel] ?? null;
  const zi = (z: number) => tl?.depths_m.indexOf(z) ?? -1;
  const recent = passages.filter((s) => s.date <= selDate && s.date >= addDays(selDate, -20)).slice(-1)[0];
  let before = -1; // last sample at least 3 days before the passage
  if (recent && tl) for (let k = 0; k < tl.dates.length && tl.dates[k] <= addDays(recent.date, -3); k++) before = k;

  return (
    <div className="px-4 md:px-7 py-6 space-y-5 max-w-[1500px] w-full mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow flex items-center gap-1.5">
            <History size={12} /> Ocean State Timeline
          </div>
          <h2 className="font-display text-2xl md:text-[28px] mt-1">
            How the water column changes through time <Explain term="temporal_evolution" />
          </h2>
          <p className="text-sm text-ink-2 mt-1.5 max-w-3xl leading-relaxed">
            Pick a point: the chart shows its reconstructed temperature from the surface down, day by day — the seasonal cycle, the thermocline <Explain term="thermocline" /> moving up and down, and the mixed layer deepening and
            shoaling.
          </p>
        </div>
        <DataBadge label={tl?.data_label} fallback={tl?.__fallback} />
      </div>

      <div className="grid xl:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-4">
          <Card title="Location" icon={<Crosshair size={14} />}>
            <form
              className="grid grid-cols-2 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                set({ lat: draft.lat, lon: draft.lon });
              }}
            >
              <label className="text-[11px] text-ink-3">
                Latitude (5–30°N)
                <input type="number" step="0.25" min={5} max={30} value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                Longitude (45–105°E)
                <input type="number" step="0.25" min={45} max={105} value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1.5 text-sm text-ink" />
              </label>
              <button type="submit" className="col-span-2 rounded-lg bg-accent text-[#04121c] text-sm font-semibold py-1.5 hover:brightness-110">
                Show timeline
              </button>
            </form>
            <div className="relative h-44 mt-3 rounded-md overflow-hidden border border-line">
              <OceanMap
                minimal
                raster={grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: "thermal", key: `tl|${grid.date}` } : null}
                point={{ lat: p.lat, lon: p.lon }}
                onClick={(la, lo) => {
                  setDraft({ lat: +la.toFixed(2), lon: +lo.toFixed(2) });
                  set({ lat: la, lon: lo });
                }}
              />
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5">Click any ocean cell to move the point.</p>
          </Card>
          <Card title="Time range" icon={<CalendarRange size={14} />}>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink-3">
                Start
                <input type="date" min={PERIOD.start} max={PERIOD.end} value={p.start} onChange={(e) => e.target.value && set({ start: e.target.value })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1.5 text-sm text-ink [color-scheme:dark]" />
              </label>
              <label className="text-[11px] text-ink-3">
                End
                <input type="date" min={PERIOD.start} max={PERIOD.end} value={p.end} onChange={(e) => e.target.value && set({ end: e.target.value })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2 py-1.5 text-sm text-ink [color-scheme:dark]" />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {RANGES.map((r) => (
                <button key={r.label} onClick={() => set({ start: r.start, end: r.end, date: p.date >= r.start && p.date <= r.end ? p.date : r.start })} aria-pressed={p.start === r.start && p.end === r.end} className={`text-xs rounded-full px-2.5 py-1 border ${p.start === r.start && p.end === r.end ? "border-accent/70 text-accent bg-accent/10" : "border-line text-ink-2 hover:text-ink"}`}>
                  {r.label}
                </button>
              ))}
            </div>
            {tl && tl.stride_days > 1 && <p className="text-[11px] text-ink-3 mt-2">Long range: showing every {tl.stride_days}th day ({tl.dates.length} samples) to keep the chart fast — events lasting only a few days can be missed; pick a shorter range for daily detail.</p>}
          </Card>
          <Card title="Presets" icon={<MapPin size={14} />}>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((x) => (
                <Button
                  key={x.label}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDraft({ lat: x.lat, lon: x.lon });
                    set({ lat: x.lat, lon: x.lon, start: x.start, end: x.end, date: x.date });
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
                {tl ? `${tl.cell.lat.toFixed(2)}°N ${tl.cell.lon.toFixed(2)}°E · ${tl.start} → ${tl.end}` : "Timeline"}
                <KindBadge kind="reconstructed" />
              </span>
            }
            right={
              <div className="flex flex-wrap items-center gap-2">
                <Segmented label="View" value={p.view} onChange={(v) => set({ view: v })} options={[{ value: "temp", label: "Temperature" }, { value: "anomaly", label: "Anomaly" }]} />
                <Segmented label="Max depth" value={p.zmax} onChange={(z) => set({ zmax: z })} options={ZMAX_OPTIONS.map((z) => ({ value: z, label: `${z} m` }))} />
              </div>
            }
          >
            {state === "error" && <ErrorState message={q.error!} why="The timeline could not be built for this point and range." action="Pick an ocean point inside 5–30°N, 45–105°E and a range within 2019–2023." onRetry={q.retry} />}
            {state === "loading" && <LoadingState label="Reading every day of the reconstruction at this point…" className="h-[360px]" />}
            {state === "empty" && <p className="text-sm text-ink-3 h-40 flex items-center justify-center">No reconstructed values at this point for the selected range.</p>}
            {state === "ready" && tl && values && (
              <>
                {tl.notice && <p className="text-[12px] text-warn mb-2">{tl.notice}</p>}
                <div className={q.loading ? "opacity-60 transition-opacity" : ""} aria-busy={q.loading}>
                  <DepthChart
                    x={tl.dates.map((d) => Date.parse(d))}
                    xLabel={(i) => tl.dates[i] ?? ""}
                    depths={tl.depths_m}
                    values={values}
                    vmin={vmin}
                    vmax={vmax}
                    ramp={p.view === "anomaly" ? "diverging" : "thermal"}
                    zmax={p.zmax}
                    units="°C"
                    digits={p.view === "anomaly" ? 2 : 1}
                    lines={lines}
                    markers={markers}
                    selected={sel}
                    onSelect={(i) => {
                      setPlaying(false);
                      setPlayIdx(null);
                      set({ date: tl.dates[i] });
                    }}
                    height={360}
                    ariaLabel={`Depth–time chart of reconstructed ${p.view === "anomaly" ? "temperature anomaly" : "temperature"} at ${tl.cell.lat.toFixed(2)}°N ${tl.cell.lon.toFixed(2)}°E from ${tl.start} to ${tl.end}`}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                  <ColorLegend title={p.view === "anomaly" ? "Anomaly vs seasonal climatology" : "Reconstructed temperature"} vmin={vmin} vmax={vmax} units="°C" ramp={p.view === "anomaly" ? "diverging" : "thermal"} digits={p.view === "anomaly" ? 1 : 0} />
                  <fieldset className="flex flex-wrap items-center gap-3 text-[12px] text-ink-2">
                    <legend className="sr-only">Overlays</legend>
                    {(["mld", "d26", "d20"] as const).map((k) => (
                      <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} className="accent-[#2ec5d8]" />
                        <span className="inline-block w-4 border-t-2" style={{ borderColor: LINE_STYLE[k].color, borderStyle: k === "mld" ? "dashed" : "solid" }} />
                        {LINE_STYLE[k].name}
                        <Explain term={k} />
                      </label>
                    ))}
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={show.storms} onChange={(e) => setShow({ ...show, storms: e.target.checked })} className="accent-[#2ec5d8]" />
                      <Tornado size={12} /> Cyclone passages ({passages.length})
                    </label>
                  </fieldset>
                  <div className="flex-1" />
                  {!reduced && (
                    <Button size="sm" variant="secondary" onClick={togglePlay} icon={playing ? <Pause size={13} /> : <Play size={13} />}>
                      {playing ? "Pause" : "Play through time"}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-ink-3 mt-2 leading-relaxed">
                  <KindBadge kind="reconstructed" /> temperature at the 0.25° cell containing the point (colours are blended between the 15 standard depths for display; hover shows the value at the nearest standard depth).{" "}
                  <KindBadge kind="derived" /> MLD, D20 and D26 lines are computed from that reconstructed column. <KindBadge kind="measured" /> Cyclone markers: IBTrACS closest approach within 300 km. Drag across the chart to zoom; click a day to select it.
                </p>
              </>
            )}
          </Card>

          {tl && state === "ready" && (
            <div className="grid lg:grid-cols-[1fr_1.1fr] gap-4">
              <Card title={`Selected day · ${selDate}`} icon={<CalendarRange size={14} />}>
                <div className="flex items-center gap-2 mb-2 text-[11px] text-ink-3">
                  <KindBadge kind="reconstructed" /> temperatures <KindBadge kind="derived" /> MLD · D26 · D20
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    [
                      ["Surface", at(0), "°C", "reconstructed"],
                      ["100 m", at(zi(100)), "°C", "reconstructed"],
                      ["300 m", at(zi(300)), "°C", "reconstructed"],
                      ["MLD", tl.mld_m[sel], "m", "derived"],
                      ["D26", tl.d26_m[sel], "m", "derived"],
                      ["D20", tl.d20_m[sel], "m", "derived"],
                    ] as const
                  ).map(([k, v, u, kind]) => (
                    <div key={k} className="rounded-lg border border-line bg-white/[0.02] px-2.5 py-2">
                      <dt className="text-[10px] uppercase tracking-wider text-ink-3 flex items-center justify-between gap-1">
                        {k} <span className="normal-case tracking-normal text-[9.5px] text-ink-3">{kind}</span>
                      </dt>
                      <dd className="num text-lg text-ink">
                        {fmt(v, u === "m" ? 0 : 1)} <span className="text-[11px] text-ink-3">{v === null ? "" : u}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                {recent && (
                  <p className="text-[12.5px] text-ink-2 mt-3 leading-relaxed">
                    <Tornado size={13} className="inline -mt-0.5 text-accent" /> {recent.name} passed about <b className="num text-ink">{recent.km} km</b> from this point on {recent.date} (IBTrACS).
                    {before >= 0 && at(0) !== null && tl.temperature_c[0][before] !== null && (
                      <>
                        {" "}
                        Reconstructed surface temperature: <b className="num text-ink">{tl.temperature_c[0][before]!.toFixed(1)} °C</b> on {tl.dates[before]} → <b className="num text-ink">{at(0)!.toFixed(1)} °C</b> on {selDate}. The
                        temperature structure changed following the passage; this view alone does not establish the cause.
                      </>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" href={mapStateHref(selDate, p.lat, p.lon)} icon={<MapPin size={13} />}>
                    Explore this state
                  </Button>
                  <Button size="sm" variant="secondary" href={sectionFromMap(selDate, p.lat, p.lon)} icon={<ScanLine size={13} />}>
                    Section through this point
                  </Button>
                </div>
              </Card>
              <section className="panel overflow-hidden min-h-[420px]" aria-label="Profile on the selected day">
                {playing ? <p className="p-4 text-sm text-ink-3">The profile updates when you pause.</p> : <ProfilePanel date={selDate} lat={p.lat} lon={p.lon} hideTimelineLink />}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
