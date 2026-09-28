"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pause, Play, ScanLine, Tornado } from "lucide-react";
import DepthChart, { type ChartLine } from "@/components/DepthChart";
import Explain from "@/components/Explain";
import ColorLegend from "@/components/Legend";
import ProfilePanel from "@/components/ProfilePanel";
import LocationPicker from "@/components/LocationPicker";
import { Button, DataBadge, ErrorState, LoadingState, PageHeader, Provenance, Segmented, fmt } from "@/components/ui";
import type { CycloneTrack, TimelineResponse } from "@/lib/api";
import { PERIOD, ZMAX_OPTIONS, cyclonePassages, mapStateHref, parseTimelineParams, sectionFromMap, timelineHref, viewState, type TimelineParams } from "@/lib/ocean";
import { addDays } from "@/lib/dates";
import { useApi } from "@/lib/useApi";


const PRESETS = [
  { label: "Bay of Bengal · 2023", lat: 15, lon: 88, start: "2023-01-01", end: "2023-12-31", date: "2023-05-11" },
  { label: "Arabian Sea · 2023", lat: 15, lon: 66, start: "2023-01-01", end: "2023-12-31", date: "2023-06-06" },
  { label: "Central BoB · 2019–2023", lat: 15, lon: 88, start: "2019-01-01", end: "2023-12-31", date: "2021-05-20" },
  { label: "Southern Arabian Sea · 2022", lat: 10, lon: 60, start: "2022-01-01", end: "2022-12-31", date: "2022-07-15" },
];
const RANGES = [
  { label: "2023", start: "2023-01-01", end: "2023-12-31" },
  { label: "SW monsoon 2023", start: "2023-06-01", end: "2023-09-30" },
  { label: "Apr–Jun 2023 (Cyclone Mocha)", start: "2023-04-15", end: "2023-06-15" },
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
  const [show, setShow] = useState({ mld: true, d26: true, d20: true, storms: true });
  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState<number | null>(null);
  const reduced = useReducedMotion();

  const q = useApi<TimelineResponse>(`/v1/timeline?lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}&start=${p.start}&end=${p.end}`);
  const tl = q.data && !q.error ? q.data : null;
  const tracks = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones").data?.tracks;

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
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1500px] w-full mx-auto">
      <PageHeader
        group="Analyze"
        title={
          <>
            Timeline <Explain term="temporal_evolution" />
          </>
        }
        description="The reconstructed water column at one location through time — seasonal warming and cooling, the thermocline and the mixed layer moving up and down."
        actions={<DataBadge fallback={tl?.__fallback} />}
      />

      {/* toolbar: where · when · what */}
      <div className="panel px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <LocationPicker lat={p.lat} lon={p.lon} date={p.start} onChange={(la, lo) => set({ lat: la, lon: lo })} />
        <div className="flex items-end gap-1.5">
          <label className="text-[11px] text-ink-3">
            From
            <input type="date" min={PERIOD.start} max={PERIOD.end} value={p.start} onChange={(e) => e.target.value && set({ start: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink [color-scheme:dark]" />
          </label>
          <label className="text-[11px] text-ink-3">
            To
            <input type="date" min={PERIOD.start} max={PERIOD.end} value={p.end} onChange={(e) => e.target.value && set({ end: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink [color-scheme:dark]" />
          </label>
          <label className="text-[11px] text-ink-3">
            Range
            <select
              value={RANGES.find((r) => r.start === p.start && r.end === p.end)?.label ?? ""}
              onChange={(e) => {
                const r = RANGES.find((x) => x.label === e.target.value);
                if (r) set({ start: r.start, end: r.end, date: p.date >= r.start && p.date <= r.end ? p.date : r.start });
              }}
              className="mt-1 block bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink"
            >
              <option value="">Custom</option>
              {RANGES.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="View" value={p.view} onChange={(v) => set({ view: v })} options={[{ value: "temp", label: "Temperature" }, { value: "anomaly", label: "Anomaly" }]} />
          <Segmented label="Max depth" value={p.zmax} onChange={(z) => set({ zmax: z })} options={ZMAX_OPTIONS.map((z) => ({ value: z, label: `${z} m` }))} />
        </div>
        <label className="text-[11px] text-ink-3 ml-auto">
          Examples
          <select
            value=""
            onChange={(e) => {
              const x = PRESETS.find((q) => q.label === e.target.value);
              if (x) set({ lat: x.lat, lon: x.lon, start: x.start, end: x.end, date: x.date });
            }}
            className="mt-1 block bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink"
          >
            <option value="">Choose…</option>
            {PRESETS.map((x) => (
              <option key={x.label} value={x.label}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* the instrument */}
      <section className="panel p-4" data-guide="timeline-chart" aria-label="Temperature structure through time">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <h2 className="text-[13.5px] text-ink">
            {tl ? (
              <span className="num">
                {tl.cell.lat.toFixed(2)}°N {tl.cell.lon.toFixed(2)}°E · {tl.start} → {tl.end}
              </span>
            ) : (
              "Temperature structure"
            )}
          </h2>
          <Provenance kind={p.view === "anomaly" ? "derived" : "reconstructed"} source={p.view === "anomaly" ? "reconstruction − seasonal climatology" : "OceanSight U-Net · 0.25° cell"} />
        </div>
        {state === "error" && <ErrorState message={q.error!} why="The timeline could not be built for this point and range." action="Choose an ocean point inside 5–30°N, 45–105°E and a range within 2019–2023." onRetry={q.retry} />}
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
                height={380}
                ariaLabel={`Depth–time chart of reconstructed ${p.view === "anomaly" ? "temperature anomaly" : "temperature"} at ${tl.cell.lat.toFixed(2)}°N ${tl.cell.lon.toFixed(2)}°E from ${tl.start} to ${tl.end}`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
              <ColorLegend title={p.view === "anomaly" ? "Anomaly" : "Temperature"} vmin={vmin} vmax={vmax} units="°C" ramp={p.view === "anomaly" ? "diverging" : "thermal"} digits={p.view === "anomaly" ? 1 : 0} />
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
                  <Tornado size={12} /> Cyclone passages
                </label>
              </fieldset>
              <div className="flex-1" />
              {!reduced && (
                <Button size="sm" variant="secondary" onClick={togglePlay} icon={playing ? <Pause size={13} /> : <Play size={13} />}>
                  {playing ? "Pause" : "Play through time"}
                </Button>
              )}
            </div>
            <p className="text-[11.5px] text-ink-3 mt-2 leading-relaxed">
              Colours blend between the 15 standard depths for display; hover shows the value at the nearest standard depth. MLD, D20 and D26 are derived from the same column.
              {tl.stride_days > 1 && ` Long range: every ${tl.stride_days}th day (${tl.dates.length} samples) — events lasting only a few days can be missed; choose a shorter range for daily detail.`} Drag to zoom; click a day or use the arrow keys to select it.
            </p>
          </>
        )}
      </section>

      {tl && state === "ready" && (
        <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 items-start">
          <div className="space-y-4">
            <section className="panel p-4" aria-label="Events">
              <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Events in this range</h2>
              {passages.length === 0 ? (
                <p className="text-[12.5px] text-ink-3">No cyclone track passed within 300 km of this location in this period.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {passages.map((s) => (
                    <li key={s.name + s.date}>
                      <button onClick={() => set({ date: tl.dates.find((d) => d >= s.date) ?? s.date })} className="w-full flex items-center gap-3 py-1.5 text-left hover:text-ink text-[12.5px] text-ink-2">
                        <Tornado size={13} className="text-ink-3 shrink-0" aria-hidden />
                        <span className="flex-1 min-w-0 truncate text-ink">{s.name}</span>
                        <span className="num">{s.date}</span>
                        <span className="num text-ink-3 w-16 text-right">{s.km} km</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2">
                <Provenance kind="measured" source="IBTrACS closest approach within 300 km" />
              </div>
            </section>
            <section className="panel p-4" aria-label="Selected day">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Selected day</h2>
                <span className="num text-[13px] text-ink">{selDate}</span>
              </div>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5 mt-3">
                {(
                  [
                    ["Surface", at(0), "°C"],
                    ["100 m", at(zi(100)), "°C"],
                    ["300 m", at(zi(300)), "°C"],
                    ["MLD", tl.mld_m[sel], "m"],
                    ["D26", tl.d26_m[sel], "m"],
                    ["D20", tl.d20_m[sel], "m"],
                  ] as const
                ).map(([k, v, u]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-ink-3">{k}</dt>
                    <dd className="num text-[16px] text-ink">
                      {fmt(v, u === "m" ? 0 : 1)} <span className="text-[11px] text-ink-3">{v === null ? "" : u}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <Provenance kind="reconstructed" source="temperatures" />
                <Provenance kind="derived" source="MLD · D26 · D20" />
              </div>
              {recent && (
                <p className="text-[12.5px] text-ink-2 mt-3 leading-relaxed border-t border-line pt-3">
                  {recent.name} passed about <b className="num text-ink">{recent.km} km</b> from this point on {recent.date}.
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
            </section>
          </div>
          <section className="panel overflow-hidden min-h-[420px]" aria-label="Profile on the selected day">
            {playing ? <p className="p-4 text-sm text-ink-3">The profile updates when you pause.</p> : <ProfilePanel date={selDate} lat={p.lat} lon={p.lon} context="timeline" />}
          </section>
        </div>
      )}
    </div>
  );
}
