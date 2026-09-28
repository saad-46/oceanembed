"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Flame, Gauge, Scale, ThermometerSun, Tornado } from "lucide-react";
import { ErrorState, KindBadge, fmt, type DataKind } from "@/components/ui";
import type { BBox, CycloneTrack, FuelResponse, GridResponse, RegionStats } from "@/lib/api";
import { addDays } from "@/lib/dates";
import { useApi } from "@/lib/useApi";

const BOB: BBox = { min_lat: 5, max_lat: 22, min_lon: 80, max_lon: 100 };
const AS: BBox = { min_lat: 5, max_lat: 25, min_lon: 50, max_lon: 77 };

/** Summaries of a grid computed client-side from the values the API returned — nothing is assumed. */
function gridSummary(g: GridResponse | null) {
  if (!g) return null;
  let n = 0, above = 0, below = 0, best = -Infinity, bi = 0, bj = 0;
  g.grid.values.forEach((row, i) =>
    row.forEach((v, j) => {
      if (v === null) return;
      n++;
      if (v > 1) above++;
      if (v < -1) below++;
      if (v > best) {
        best = v;
        bi = i;
        bj = j;
      }
    }),
  );
  return n ? { n, fracAbove: above / n, fracBelow: below / n, max: best, lat: g.grid.lat[bi], lon: g.grid.lon[bj] } : null;
}

function InsightCard({ icon, title, kind, value, unit, children, href, cta, loading, error }: { icon: ReactNode; title: string; kind: DataKind; value: string | null; unit?: string; children: ReactNode; href?: string; cta?: string; loading?: boolean; error?: string | null }) {
  return (
    <article className="panel lift p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="w-7 h-7 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">{icon}</span>
        <KindBadge kind={kind} />
      </div>
      <h3 className="mt-2.5 text-[11px] uppercase tracking-wider text-ink-3">{title}</h3>
      {error ? (
        <div className="mt-3">
          <ErrorState message={error} />
        </div>
      ) : loading || value === null ? (
        <div className="mt-4 space-y-2">
          <div className="skeleton h-8 w-24" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="num text-[28px] text-ink leading-none">{value}</span>
            {unit && <span className="text-sm text-ink-3">{unit}</span>}
          </div>
          <p className="text-[12.5px] text-ink-2 mt-2 leading-relaxed flex-1">{children}</p>
          {href && (
            <Link href={href} className="mt-3 text-xs text-accent inline-flex items-center gap-1 hover:underline">
              {cta ?? "Open"} <ArrowRight size={12} />
            </Link>
          )}
        </>
      )}
    </article>
  );
}

export default function InsightCards({ date }: { date: string }) {
  const bob = useApi<RegionStats>("/v1/region/stats", { date, bbox: BOB });
  const as = useApi<RegionStats>("/v1/region/stats", { date, bbox: AS });
  const anomQ = useApi<GridResponse>(`/v1/grid/${date}?depth=100&variable=anomaly`);
  const sigQ = useApi<GridResponse>(`/v1/grid/${date}?depth=100&variable=uncertainty`);
  const tracksQ = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones");
  const anom = gridSummary(anomQ.data);
  const sig = gridSummary(sigQ.data);

  // an IBTrACS storm active within ±10 days of the chosen date, if any
  const lo = addDays(date, -10), hi = addDays(date, 10);
  const storm = tracksQ.data?.tracks.find((t) => t.start && t.end && t.end.slice(0, 10) >= lo && t.start.slice(0, 10) <= hi) ?? null;
  const fuelQ = useApi<FuelResponse>(storm ? `/v1/cyclones/${storm.id}/fuel?lead_days=2` : null);
  const fuel = fuelQ.data && storm && fuelQ.data.id === storm.id ? fuelQ.data : null;
  const nHot = fuel ? fuel.points.filter((p) => (p.tchp_kj_cm2 ?? 0) >= 50).length : 0;
  const nOcean = fuel ? fuel.points.filter((p) => p.tchp_kj_cm2 !== null).length : 0;

  const b = bob.data, a = as.data;
  const dT = b && a && b.mean_tchp_kj_cm2 !== null && a.mean_tchp_kj_cm2 !== null ? b.mean_tchp_kj_cm2 - a.mean_tchp_kj_cm2 : null;

  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
      <InsightCard icon={<ThermometerSun size={15} />} title="Ocean condition" kind="reconstructed" value={b ? fmt(b.mean_sst_c, 1) : null} unit="°C · BoB SST" loading={bob.loading && !b} error={bob.error} href={`/analysis`} cta="Analyse the region">
        {b && (
          <>
            Bay of Bengal mean TCHP is <b className="num text-ink">{fmt(b.mean_tchp_kj_cm2, 0)} kJ/cm²</b>, with {fmt((b.frac_cells_tchp_gt_50 ?? 0) * 100, 0)}% of the basin above the 50 kJ/cm² reference level and a mixed layer of about {fmt(b.mean_mld_m, 0)} m.
          </>
        )}
      </InsightCard>
      <InsightCard icon={<Flame size={15} />} title="Subsurface anomaly · 100 m" kind="derived" value={anom ? `${fmt(anomQ.data?.stats?.mean, 2)}` : null} unit="°C mean vs clim." loading={anomQ.loading && !anom} error={anomQ.error} href={`/map?date=${date}&depth=100&var=anomaly&lat=${anom?.lat.toFixed(3) ?? ""}&lon=${anom?.lon.toFixed(3) ?? ""}`} cta="See the warmest cell">
        {anom && (
          <>
            {fmt(anom.fracAbove * 100, 0)}% of the domain is more than 1 °C warmer than the seasonal climatology at 100 m and {fmt(anom.fracBelow * 100, 0)}% more than 1 °C colder. Warmest: <b className="num text-ink">+{anom.max.toFixed(1)} °C</b> at {anom.lat.toFixed(2)}°N {anom.lon.toFixed(2)}°E.
          </>
        )}
      </InsightCard>
      <InsightCard icon={<Gauge size={15} />} title="Model confidence · 100 m" kind="estimated" value={sigQ.data?.stats ? `±${fmt(sigQ.data.stats.mean, 2)}` : null} unit="°C mean σ" loading={sigQ.loading && !sig} error={sigQ.error} href={`/map?date=${date}&depth=100&var=uncertainty`} cta="Map the uncertainty">
        {sig && (
          <>
            The calibrated 1σ spread at 100 m ranges up to <b className="num text-ink">±{sig.max.toFixed(2)} °C</b>, largest near {sig.lat.toFixed(1)}°N {sig.lon.toFixed(1)}°E — trust the thermocline less there.
          </>
        )}
      </InsightCard>
      <InsightCard
        icon={<Tornado size={15} />}
        title="Cyclone interaction"
        kind="derived"
        value={storm ? (fuel ? fmt(fuel.max_tchp_kj_cm2, 0) : null) : tracksQ.data ? "None" : null}
        unit={storm ? "kJ/cm² peak TCHP" : undefined}
        loading={tracksQ.loading || (!!storm && !fuel && !fuelQ.error)}
        error={tracksQ.error ?? fuelQ.error}
        href={storm ? "/analysis?mode=cyclone" : undefined}
        cta="Investigate the track"
      >
        {storm && fuel ? (
          <>
            {storm.name} ({storm.peak_category ?? "category n/a"}) crossed water with at least 50 kJ/cm² at <b className="num text-ink">{nHot} of {nOcean}</b> ocean track points, using ocean state 2 days before passage.
          </>
        ) : (
          <>No IBTrACS cyclone in the domain within 10 days of {date}. Try 2023-05-11 (Mocha) or 2023-06-06 (Biparjoy).</>
        )}
      </InsightCard>
      <InsightCard icon={<Scale size={15} />} title="Regional signal" kind="derived" value={dT === null ? null : `${dT >= 0 ? "+" : ""}${dT.toFixed(0)}`} unit="kJ/cm² BoB − Arabian Sea" loading={(bob.loading && !b) || (as.loading && !a)} error={bob.error ?? as.error} href="/analysis" cta="Compare regions">
        {b && a && (
          <>
            Mean TCHP is <b className="num text-ink">{fmt(b.mean_tchp_kj_cm2, 0)}</b> in the Bay of Bengal vs <b className="num text-ink">{fmt(a.mean_tchp_kj_cm2, 0)}</b> in the Arabian Sea; D26 sits at {fmt(b.mean_d26_m, 0)} m vs {fmt(a.mean_d26_m, 0)} m.
          </>
        )}
      </InsightCard>
    </div>
  );
}
