"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Pause, Play } from "lucide-react";
import Explain from "@/components/Explain";
import Gauge from "@/components/FuelGauge";
import ColorLegend from "@/components/Legend";
import ProfilePanel from "@/components/ProfilePanel";
import { Button, DataBadge, KindBadge, Skeleton, fmt, type DataKind } from "@/components/ui";
import type { CycloneTrack, FuelResponse, GridResponse, ProfileResponse, ValidationSummary } from "@/lib/api";
import { DEMO_DATE, DEMO_POINT } from "@/lib/demo";
import { timelineHref } from "@/lib/ocean";
import { useApi } from "@/lib/useApi";
import { sampleGrid, useGrid } from "@/lib/useGrid";
import { StageTitle, type StageProps } from "./StoryStages";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });
const PT = `lat=${DEMO_POINT.lat.toFixed(3)}&lon=${DEMO_POINT.lon.toFixed(3)}`;
const useDemoProfile = () => useApi<ProfileResponse>(`/v1/profile/${DEMO_DATE}?${PT}`);
const SEQ = [0, 20, 50, 100, 150, 200];

/* 05 — the real map, descending through depth */
export function MapStage({ playing, reduced, onNext }: StageProps) {
  const [k, setK] = useState(0);
  const depth = SEQ[k];
  const { grid, range, loading } = useGrid(DEMO_DATE, depth, "temp");
  const prof = useDemoProfile().data;
  const auto = playing && !reduced;
  useEffect(() => {
    if (!auto || loading) return; // wait for each layer to arrive before moving on
    const t = setTimeout(() => setK((i) => (i + 1) % SEQ.length), 2600);
    return () => clearTimeout(t);
  }, [auto, k, loading]);
  const zi = prof?.depths_m.indexOf(depth) ?? -1;
  const tHere = zi >= 0 ? prof?.temperature_c[zi] : null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <StageTitle eyebrow="05 · Beneath the surface">Now let&apos;s look beneath the surface.</StageTitle>
        <DataBadge label={grid?.data_label} fallback={grid?.__fallback} />
      </div>
      <div className="relative h-[52vh] min-h-[340px] rounded-2xl overflow-hidden border border-line">
        <OceanMap raster={grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: "thermal", key: `tour|${grid.date}|${depth}` } : null} point={DEMO_POINT} />
        <div className="absolute top-3 left-3 right-14 sm:right-auto sm:max-w-sm glass glass-strong p-3.5 fade-in" key={depth} aria-live="polite">
          <div className="flex items-center gap-2">
            <KindBadge kind="reconstructed" />
            <span className="num text-accent text-lg">{depth === 0 ? "Surface" : `${depth} m`}</span>
          </div>
          <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">
            {depth === 0 ? "This is the surface layer the model starts from — close to what satellites see." : `You're now viewing the model's reconstructed temperature field at ${depth} m depth. No satellite sees this layer.`}
          </p>
          {tHere !== null && tHere !== undefined && (
            <p className="text-[12px] text-ink-3 mt-1.5 num">
              At the marked point (15°N 88°E): <b className="text-ink">{tHere.toFixed(1)} °C</b>
            </p>
          )}
        </div>
        {range && (
          <div className="absolute bottom-3 left-3 pointer-events-none">
            <ColorLegend title={`Reconstructed temperature · ${depth} m · ${DEMO_DATE}`} vmin={range[0]} vmax={range[1]} units="°C" ramp="thermal" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-ink-3 mr-1">Depth</span>
        {SEQ.map((z, i) => (
          <button key={z} onClick={() => setK(i)} aria-pressed={i === k} className={`num text-xs rounded-full px-3 py-1 border ${i === k ? "border-accent text-accent bg-accent/10" : "border-line text-ink-2 hover:text-ink"}`}>
            {z === 0 ? "0 m" : `${z} m`}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="secondary" size="sm" href={`/map?date=${DEMO_DATE}&depth=${depth}&var=temp`}>
          Try it yourself
        </Button>
        <Button size="sm" onClick={onNext} icon={<ArrowRight size={14} />}>
          Continue tour
        </Button>
      </div>
    </div>
  );
}

/* 06 — one column, in plain language */
export function ProfileStage() {
  const p = useDemoProfile().data;
  const t = (z: number) => {
    const i = p?.depths_m.indexOf(z) ?? -1;
    return i >= 0 ? p!.temperature_c[i] : null;
  };
  const t0 = t(0), t100 = t(100), t1000 = t(1000);
  const s100 = p?.uncertainty_c?.[p.depths_m.indexOf(100)] ?? null;
  const a = p?.nearest_argo_float;
  return (
    <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 items-start">
      <div className="space-y-5">
        <StageTitle eyebrow="06 · Into the water column" sub="A map shows where something happens. A profile shows what happens beneath it.">
          Click into the ocean.
        </StageTitle>
        {!p ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-3 text-[15px] text-ink-2 leading-relaxed">
            <p>
              At <b className="text-ink">15°N 88°E</b> in the Bay of Bengal on {DEMO_DATE}, the surface is <b className="num text-ink">{fmt(t0, 1)} °C</b>. By 100 m the reconstruction gives{" "}
              <b className="num text-ink">{fmt(t100, 1)} °C</b>
              {t0 !== null && t100 !== null && <> — {fmt(t0 - t100, 1)} °C colder within the top 100 m</>}, and <b className="num text-ink">{fmt(t1000, 1)} °C</b> at 1000 m.
            </p>
            {s100 !== null && (
              <p>
                The shaded band is the model&apos;s uncertainty <Explain term="uncertainty" />: at 100 m it is about <b className="num text-ink">±{s100.toFixed(2)} °C</b>, larger where the temperature changes fastest.
              </p>
            )}
            {a ? (
              <p>
                <KindBadge kind="measured" /> A real Argo float (platform <span className="num">{a.platform_number}</span>, {a.profile_date.slice(0, 10)}, {fmt(a.distance_km, 0)} km away) measured this column
                {a.independent ? " in a year the model never trained on" : ""}. Its measurements are the dots on the chart.
              </p>
            ) : (
              <p className="text-ink-3">No Argo float surfaced close enough to this point and day for a direct comparison.</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" href={`/profiles?date=${DEMO_DATE}&${PT}`}>
            View technical profile
          </Button>
        </div>
        <div className="panel p-3.5 border-accent/30">
          <p className="text-[13.5px] text-ink-2 leading-relaxed">The ocean does not just vary across space. It changes vertically and through time.</p>
          <Button size="sm" className="mt-2.5" href={timelineHref({ lat: DEMO_POINT.lat, lon: DEMO_POINT.lon, date: DEMO_DATE, start: "2023-01-01", end: "2023-12-31" })}>
            Explore Ocean State Timeline
          </Button>
        </div>
      </div>
      <section className="panel overflow-hidden min-h-[520px]" aria-label="Reconstructed profile">
        <ProfilePanel date={DEMO_DATE} lat={DEMO_POINT.lat} lon={DEMO_POINT.lon} />
      </section>
    </div>
  );
}

/* 07 — trust: held-out Argo vs model vs climatology */
export function TrustStage({ reduced }: StageProps) {
  const sumQ = useApi<ValidationSummary>("/v1/validation/summary?split=test");
  const scatQ = useApi<{ points: { pred: number; obs: number; depth_m: number }[] }>("/v1/validation/scatter?split=test&max_points=3000");
  const sum = sumQ.data;
  const pts = useMemo(() => (scatQ.data?.points ?? []).filter((_, i) => i % 4 === 0), [scatQ.data]);
  const [n, setN] = useState(0);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (!pts.length) return;
    if (reduced) {
      const r = requestAnimationFrame(() => setN(pts.length));
      return () => cancelAnimationFrame(r);
    }
    const t = setInterval(() => setN((c) => (c >= pts.length ? c : c + 25)), 40);
    return () => clearInterval(t);
  }, [pts.length, reduced]);
  useEffect(() => {
    const r = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const at = (z: number) => sum?.per_depth.find((d) => d.depth_m === z);
  const better = sum ? sum.per_depth.filter((d) => (d.skill_vs_climatology ?? 0) > 0).length : null;
  const maxR = sum ? Math.max(...sum.per_depth.map((d) => Math.max(d.rmse_c ?? 0, d.baseline_rmse_c ?? 0))) : 1;
  const lo = 4, hi = 32, W = 300;
  const X = (v: number) => ((v - lo) / (hi - lo)) * W;
  return (
    <div className="space-y-6">
      <StageTitle eyebrow="07 · Trust" sub="The model is scored against real Argo float measurements from 2023 — observations it never trained on. And it has to beat a simple baseline: the seasonal normal.">
        But how do we know <span className="text-gradient">the AI is right?</span>
      </StageTitle>
      {sumQ.error && <p className="text-sm text-bad">Validation data unavailable: {sumQ.error}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Held-out profiles", sum ? sum.n_profiles.toLocaleString("en-IN") : null, "Argo, 2023"],
          ["Error at 100 m (RMSE)", sum ? `${fmt(at(100)?.rmse_c, 2)} °C` : null, sum ? `normal-only guess: ${fmt(at(100)?.baseline_rmse_c, 2)} °C` : ""],
          ["Correlation at 100 m", sum ? fmt(at(100)?.corr ?? null, 2) : null, "1 = perfect agreement"],
          ["Depths beating the baseline", sum && better !== null ? `${better} / ${sum.per_depth.length}` : null, "positive skill score"],
        ].map(([k, v, h]) => (
          <div key={k as string} className="panel px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-ink-3">{k}</div>
            {v === null ? <div className="skeleton h-7 w-20 mt-1.5" /> : <div className="num text-2xl text-ink mt-1">{v}</div>}
            <div className="text-[11px] text-ink-3 mt-0.5">{h}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <figure className="panel p-4">
          <figcaption className="text-[12px] text-ink-3 mb-2 flex items-center justify-between gap-2">
            <span>Reconstructed vs measured temperature (sample of held-out points)</span>
            <span className="num">{Math.min(n, pts.length)} shown</span>
          </figcaption>
          {!pts.length ? (
            <Skeleton className="h-[300px]" />
          ) : (
            <svg viewBox={`-34 -6 ${W + 44} ${W + 40}`} className="w-full max-h-[340px]" role="img" aria-label="Scatter of reconstructed against measured temperature">
              <rect x={0} y={0} width={W} height={W} fill="none" stroke="#1c2c42" />
              <line x1={0} y1={W} x2={W} y2={0} stroke="#e8edf4" strokeOpacity={0.5} strokeDasharray="4 4" />
              {pts.slice(0, n).map((p, i) => (
                <circle key={i} cx={X(p.obs)} cy={W - X(p.pred)} r={1.8} fill={p.depth_m <= 50 ? "#86b6ef" : p.depth_m <= 200 ? "#3987e5" : "#1c5cab"} fillOpacity={0.6} />
              ))}
              {[5, 10, 15, 20, 25, 30].map((v) => (
                <g key={v} fill="#8a96a8" fontSize="9">
                  <text x={X(v)} y={W + 13} textAnchor="middle">{v}</text>
                  <text x={-6} y={W - X(v) + 3} textAnchor="end">{v}</text>
                </g>
              ))}
              <text x={W / 2} y={W + 30} textAnchor="middle" fill="#8a96a8" fontSize="10">measured by Argo (°C)</text>
            </svg>
          )}
          <p className="text-[11.5px] text-ink-3 mt-1">Dots on the dashed line = perfect agreement. Lighter dots are shallower.</p>
        </figure>
        <figure className="panel p-4">
          <figcaption className="text-[12px] text-ink-3 mb-3 flex flex-wrap gap-3 items-center">
            Typical error by depth (RMSE, lower is better)
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#3987e5]" /> OceanSight</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#d95926]" /> seasonal normal <Explain term="climatology" /></span>
          </figcaption>
          {!sum ? (
            <Skeleton className="h-[300px]" />
          ) : (
            <ol className="space-y-1.5">
              {sum.per_depth
                .filter((d) => [0, 20, 50, 100, 150, 200, 300, 500, 1000].includes(d.depth_m))
                .map((d) => (
                  <li key={d.depth_m} className="grid grid-cols-[52px_1fr] gap-2 items-center text-[11px]">
                    <span className="num text-ink-3 text-right">{d.depth_m} m</span>
                    <span className="space-y-0.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2 rounded bg-[#3987e5] transition-[width] duration-1000" style={{ width: grown ? `${((d.rmse_c ?? 0) / maxR) * 85}%` : 0 }} />
                        <span className="num text-ink">{fmt(d.rmse_c, 2)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-2 rounded bg-[#d95926]/80 transition-[width] duration-1000 delay-150" style={{ width: grown ? `${((d.baseline_rmse_c ?? 0) / maxR) * 85}%` : 0 }} />
                        <span className="num text-ink-3">{fmt(d.baseline_rmse_c ?? null, 2)}</span>
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </figure>
      </div>
      <p className="text-[12.5px] text-ink-3 max-w-4xl leading-relaxed">
        <b className="text-warn">One honest caveat:</b> the ocean analysis the model learned from itself uses Argo data, so the held-out floats are independent of our training but not fully independent of that product.{" "}
        <Link href="/validation" className="text-accent hover:underline">
          See the full validation →
        </Link>
      </p>
    </div>
  );
}

/* 08 — the real Cyclone Fuel Gauge along Mocha's track */
export function CycloneStage({ playing, reduced }: StageProps) {
  const tracks = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones").data?.tracks;
  const mocha = tracks?.find((t) => t.name.includes("Mocha"));
  const fuelQ = useApi<FuelResponse>(mocha ? `/v1/cyclones/${mocha.id}/fuel?lead_days=2` : null);
  const fuel = fuelQ.data;
  const valid = useMemo(() => (fuel ? fuel.points.map((p, i) => (p.tchp_kj_cm2 !== null ? i : -1)).filter((i) => i >= 0) : []), [fuel]);
  const [j, setJ] = useState(0);
  const [run, setRun] = useState(true);
  const auto = playing && run && !reduced && valid.length > 0;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setJ((x) => (x + 1) % valid.length), 900);
    return () => clearInterval(t);
  }, [auto, valid.length]);
  const cur = fuel && valid.length ? fuel.points[valid[Math.min(j, valid.length - 1)]] : null;
  const tchp = useApi<GridResponse>(cur?.ocean_date ? `/v1/grid/${cur.ocean_date}/product?product=tchp` : null).data;
  const sig = useApi<GridResponse>(cur?.ocean_date ? `/v1/grid/${cur.ocean_date}?depth=100&variable=uncertainty` : null).data;
  const s100 = cur && sig ? sampleGrid(sig, cur.lat, cur.lon) : null;
  const track = useMemo(() => (fuel ? { path: fuel.points.map((p) => [p.lon, p.lat] as [number, number]), points: fuel.points.map((p) => ({ lon: p.lon, lat: p.lat, value: p.tchp_kj_cm2 })), highlight: valid[j] ?? 0 } : null), [fuel, valid, j]);
  const tMax = tchp?.stats ? Math.max(100, Math.ceil(tchp.stats.max / 10) * 10) : 100;
  const rows: [string, string, DataKind, string][] = cur
    ? [
        ["Storm position", `${cur.lat.toFixed(1)}°N ${cur.lon.toFixed(1)}°E · ${cur.time.slice(0, 16).replace("T", " ")} UTC`, "measured", "IBTrACS best track"],
        ["Wind", cur.wind_kt ? `${cur.wind_kt} kt` : "not reported", "measured", "IBTrACS"],
        ["Surface temperature", cur.sst_c === null ? "—" : `${cur.sst_c.toFixed(1)} °C`, "reconstructed", `ocean state ${cur.ocean_date}`],
        ["Heat below the surface (TCHP)", `${fmt(cur.tchp_kj_cm2, 0)} kJ/cm²`, "derived", "from the reconstructed column"],
        ["Depth of 26 °C water", cur.d26_m === null ? "—" : `${cur.d26_m.toFixed(0)} m`, "derived", "from the reconstructed column"],
        ["Model uncertainty at 100 m", s100 === null ? "loading / unavailable" : `±${s100.toFixed(2)} °C`, "estimated", "calibrated σ"],
      ]
    : [];
  return (
    <div className="space-y-5">
      <StageTitle eyebrow="08 · Why it matters" sub="Tropical cyclones draw energy from warm ocean water, and they stir up the water beneath them. Surface temperature alone doesn't say how much heat is stored below.">
        Why does <span className="text-gradient">subsurface temperature</span> matter?
      </StageTitle>
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <div className="relative h-[44vh] min-h-[320px] rounded-2xl overflow-hidden border border-line">
          <OceanMap raster={tchp?.stats ? { values: tchp.grid.values, vmin: 0, vmax: tMax, ramp: "thermal", key: `tour-tchp|${tchp.date}` } : null} track={track} />
          {tchp?.stats && (
            <div className="absolute bottom-3 left-3 pointer-events-none">
              <ColorLegend title={`Heat below the surface (TCHP) · ${tchp.date}`} vmin={0} vmax={tMax} units="kJ/cm²" ramp="thermal" digits={0} />
            </div>
          )}
          {fuelQ.error && <p className="absolute inset-x-3 top-3 glass p-3 text-sm text-bad">Cyclone data unavailable: {fuelQ.error}</p>}
        </div>
        <div className="panel p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-ink font-medium">{fuel?.name ?? "Cyclone Mocha 2023"} · Fuel Gauge</div>
            {!reduced && valid.length > 0 && (
              <button onClick={() => setRun(!run)} className="text-xs text-accent inline-flex items-center gap-1" aria-pressed={!run}>
                {run ? <Pause size={12} /> : <Play size={12} />} {run ? "Pause track" : "Play track"}
              </button>
            )}
          </div>
          {!cur ? (
            <Skeleton className="h-64 mt-3" />
          ) : (
            <>
              <div className="flex justify-center">
                <Gauge value={cur.tchp_kj_cm2} />
              </div>
              <input type="range" min={0} max={valid.length - 1} value={j} onChange={(e) => (setRun(false), setJ(Number(e.target.value)))} className="w-full" aria-label="Position along the cyclone track" />
              <dl className="mt-2 divide-y divide-line">
                {rows.map(([k, v, kind, src]) => (
                  <div key={k} className="py-1.5 flex items-center gap-2">
                    <dt className="flex-1 min-w-0">
                      <span className="block text-[12.5px] text-ink">{k}</span>
                      <span className="block text-[10.5px] text-ink-3 truncate">{src}</span>
                    </dt>
                    <dd className="num text-[12.5px] text-ink text-right">{v}</dd>
                    <dd className="w-[104px] shrink-0 flex justify-end">
                      <KindBadge kind={kind} />
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-3 max-w-3xl leading-relaxed">
          What OceanSight adds: the heat stored below the surface along the storm&apos;s real path, days before it passed. It describes the ocean — <b className="text-ink-2">it does not forecast cyclone intensity.</b>
        </p>
        <Button variant="secondary" size="sm" href="/analysis?mode=cyclone">
          Open the Cyclone Fuel Gauge
        </Button>
      </div>
    </div>
  );
}
