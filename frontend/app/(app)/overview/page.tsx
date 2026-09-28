"use client";
import Link from "next/link";
import { ArrowRight, BarChart3, Map as MapIcon, ShieldCheck, Tornado, Waves } from "lucide-react";
import CrossSection from "@/components/landing/CrossSection";
import { Badge, Card, DataBadge, ErrorState, StatTile, fmt } from "@/components/ui";
import type { BBox, Headline, Meta, RegionStats, SectionResponse } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const DEMO = "2023-05-11";
const BOB: BBox = { min_lat: 5, max_lat: 22, min_lon: 80, max_lon: 100 };
const AS: BBox = { min_lat: 5, max_lat: 25, min_lon: 50, max_lon: 77 };

const LAUNCH = [
  { href: `/map?date=${DEMO}&depth=100&lat=15.000&lon=88.000`, icon: MapIcon, title: "Pre-Mocha Bay of Bengal", sub: "100 m field + profile at 15°N 88°E" },
  { href: "/analysis?mode=cyclone", icon: Tornado, title: "Cyclone Fuel Gauge", sub: "TCHP along Mocha's real track" },
  { href: "/validation", icon: ShieldCheck, title: "Independent validation", sub: "2023 held-out Argo, per depth" },
  { href: "/profiles?date=2023-06-06&lat=15.000&lon=66.000", icon: Waves, title: "Biparjoy, Arabian Sea", sub: "Water column, June 2023" },
];

function RegionCard({ name, bbox }: { name: string; bbox: BBox }) {
  const q = useApi<RegionStats>("/v1/region/stats", { date: DEMO, bbox });
  const s = q.data;
  return (
    <div className="rounded-lg border border-line bg-white/[0.02] p-3.5">
      <div className="flex items-center justify-between">
        <div className="font-medium text-ink text-sm">{name}</div>
        <Badge tone="neutral">Reconstructed</Badge>
      </div>
      {q.error ? (
        <div className="mt-3">
          <ErrorState message={q.error} />
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          {(
            [
              ["SST", s?.mean_sst_c, "°C", 1],
              ["TCHP", s?.mean_tchp_kj_cm2, "kJ/cm²", 0],
              ["MLD", s?.mean_mld_m, "m", 0],
              ["D26", s?.mean_d26_m, "m", 0],
            ] as const
          ).map(([k, v, u, d]) => (
            <div key={k} className="rounded-md bg-white/[0.03] border border-line py-2">
              <dt className="text-[10px] text-ink-3 uppercase tracking-wider">{k}</dt>
              <dd className="num text-ink mt-0.5">{s ? fmt(v ?? null, d) : <span className="skeleton inline-block w-8 h-4" />}</dd>
              <dd className="text-[9.5px] text-ink-3">{u}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default function Overview() {
  const h = useApi<Headline>("/v1/summary/headline");
  const meta = useApi<Meta>("/v1/meta").data;
  const sectionQ = useApi<SectionResponse>(`/v1/section/${DEMO}?lat=15&lon_min=80&lon_max=97`);
  const v = h.data?.validation;
  const at = (z: number) => v?.at_depths.find((d) => d.depth_m === z);
  const loading = h.loading && !h.data;
  return (
    <div className="px-4 md:px-7 py-6 space-y-6 max-w-[1500px] w-full mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Ocean intelligence overview</div>
          <h2 className="font-display text-2xl md:text-[28px] mt-1">North Indian Ocean · 0–1000 m · daily</h2>
        </div>
        <DataBadge fallback={h.data?.__fallback} />
      </div>
      {h.error && <ErrorState message={h.error} why="The API did not answer." action="Check that the backend is running on port 8100, or open the bundled demo views below." offline />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Reconstructed days" value={h.data?.n_days_reconstructed?.toLocaleString("en-IN")} hint={h.data?.study_period.replace("..", " → ")} loading={loading} />
        <StatTile label="Production model" value={h.data?.production_model} hint={`${meta?.available_models.length ?? "—"} models incl. baselines`} loading={loading} />
        <StatTile label="RMSE at 100 m (2023)" value={fmt(at(100)?.rmse_c, 2)} unit="°C" hint={`climatology ${fmt(at(100)?.climatology_rmse_c, 2)} °C`} loading={loading} />
        <StatTile label="Independent profiles" value={v?.n_independent_profiles?.toLocaleString("en-IN")} hint="Argo floats, held-out 2023" loading={loading} />
      </div>
      <div className="grid xl:grid-cols-[1.35fr_1fr] gap-5">
        <Card title="Subsurface section · Bay of Bengal" icon={<Waves size={14} />} right={<Link href="/profiles" className="text-xs text-accent hover:underline">Explore profiles →</Link>}>
          <CrossSection data={sectionQ.data ?? null} error={sectionQ.error} />
        </Card>
        <div className="space-y-4">
          <Card title="Quick launch — demo views" icon={<ArrowRight size={14} />}>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {LAUNCH.map(({ href, icon: Icon, title, sub }) => (
                <Link key={title} href={href} className="lift rounded-lg border border-line bg-white/[0.02] p-3 flex gap-3 items-start">
                  <span className="w-8 h-8 rounded-md bg-accent/[0.1] text-accent flex items-center justify-center shrink-0">
                    <Icon size={16} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm text-ink">{title}</span>
                    <span className="block text-[11.5px] text-ink-3">{sub}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
          <Card title={`Regional snapshot · ${DEMO}`} icon={<BarChart3 size={14} />}>
            <div className="space-y-2.5">
              <RegionCard name="Bay of Bengal" bbox={BOB} />
              <RegionCard name="Arabian Sea" bbox={AS} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
