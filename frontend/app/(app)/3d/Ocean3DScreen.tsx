"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Layers, Map as MapIcon, ScanLine, Waves } from "lucide-react";
import ColorLegend from "@/components/Legend";
import { DataBadge, ErrorState, LoadingState, Notice, PageHeader, Provenance, Segmented, Skeleton } from "@/components/ui";
import type { PickedPoint } from "@/components/Volume3D";
import type { VolumeSampleResponse } from "@/lib/api";
import { VOLUME_REGIONS, parsePointParams, profileHref, regionFor, stratificationHref, volumePath, type VolumeRegion } from "@/lib/analysis";
import type { RampName } from "@/lib/colormap";
import { PERIOD, sectionFromMap } from "@/lib/ocean";
import { useApi } from "@/lib/useApi";

const Volume3D = dynamic(() => import("@/components/Volume3D"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

const VARS = {
  temp: { label: "Temperature", ramp: "thermal" as RampName, kind: "reconstructed" as const, lineage: "reconstruction", digits: 1 },
  anomaly: { label: "Anomaly", ramp: "diverging" as RampName, kind: "derived" as const, lineage: "climatology", digits: 1 },
  uncertainty: { label: "Uncertainty", ramp: "uncertainty" as RampName, kind: "estimated" as const, lineage: "uncertainty", digits: 2 },
};
type Var = keyof typeof VARS;

function useSmallScreen() {
  const [small, setSmall] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const f = () => setSmall(m.matches);
    const r = requestAnimationFrame(f);
    m.addEventListener("change", f);
    return () => {
      cancelAnimationFrame(r);
      m.removeEventListener("change", f);
    };
  }, []);
  return small;
}

export default function Ocean3DScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const p = parsePointParams(sp);
  const hasPoint = sp.get("lat") !== null && sp.get("lon") !== null;
  const region = (VOLUME_REGIONS.some((r) => r.id === sp.get("region")) ? sp.get("region") : hasPoint ? regionFor(p.lat, p.lon) : "bob") as VolumeRegion;
  const v: Var = sp.get("var") === "anomaly" || sp.get("var") === "uncertainty" ? (sp.get("var") as Var) : "temp";
  const zmax = [200, 500, 1000].includes(Number(sp.get("zmax"))) ? Number(sp.get("zmax")) : 500;
  const set = (patch: Record<string, string | number>) => {
    const qq = new URLSearchParams(sp.toString());
    for (const [k, val] of Object.entries(patch)) qq.set(k, String(val));
    router.replace(`/3d?${qq.toString()}`, { scroll: false });
  };
  const small = useSmallScreen();
  const [exag, setExag] = useState(1);
  const [size, setSize] = useState(4);
  const [slice, setSlice] = useState<number | null>(null);
  const [picked, setPicked] = useState<PickedPoint | null>(null);
  const q = useApi<VolumeSampleResponse>(small === false ? volumePath(p.date, region, zmax, v) : null);
  const d = q.data && !q.error ? q.data : null;
  const spec = VARS[v];
  const st = d?.stats;
  const am = st ? Math.max(0.5, Math.ceil(Math.max(Math.abs(st.min), Math.abs(st.max)))) : 1;
  const [vmin, vmax] = !st ? [0, 1] : v === "anomaly" ? [-am, am] : v === "uncertainty" ? [0, Math.max(0.2, Math.ceil(st.max * 10) / 10)] : [Math.floor(st.min), Math.ceil(st.max)];

  const alternatives = (
    <div className="flex flex-wrap gap-2">
      <Link href={sectionFromMap(p.date, hasPoint ? p.lat : null, hasPoint ? p.lon : null)} className="inline-flex items-center gap-1.5 text-[12.5px] rounded-md border border-line px-2.5 py-1.5 text-ink-2 hover:text-ink">
        <ScanLine size={13} aria-hidden /> Vertical section
      </Link>
      <Link href={profileHref(p)} className="inline-flex items-center gap-1.5 text-[12.5px] rounded-md border border-line px-2.5 py-1.5 text-ink-2 hover:text-ink">
        <Waves size={13} aria-hidden /> Profile
      </Link>
      <Link href={`/map?date=${p.date}&depth=100&var=temp`} className="inline-flex items-center gap-1.5 text-[12.5px] rounded-md border border-line px-2.5 py-1.5 text-ink-2 hover:text-ink">
        <MapIcon size={13} aria-hidden /> Map by depth
      </Link>
    </div>
  );

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1500px] w-full mx-auto">
      <PageHeader group="Explore" title="3-D ocean" description="A downsampled point cloud of the reconstructed ocean — latitude, longitude and depth — for orientation. For measurements and exact values use the section and profile views." actions={<DataBadge fallback={q.data?.__fallback} />} />
      {small === true && (
        <section className="panel p-5 space-y-3" role="status">
          <h2 className="text-[15px] text-ink">3D visualization is optimized for larger screens.</h2>
          <p className="text-[13px] text-ink-2">On a phone, the same reconstruction is easier to read in 2-D: a vertical section across the region, the water column at a point, or the map at any depth.</p>
          {alternatives}
        </section>
      )}
      {small === false && (
        <>
          <div className="panel px-4 py-3 flex flex-wrap items-end gap-x-5 gap-y-3">
            <label className="text-[11px] text-ink-3">
              Date
              <input type="date" min={PERIOD.start} max={PERIOD.end} value={p.date} onChange={(e) => e.target.value && set({ date: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink [color-scheme:dark]" />
            </label>
            <div className="text-[11px] text-ink-3">
              Region
              <div className="mt-1">
                <Segmented label="Region" value={region} onChange={(r) => set({ region: r })} options={VOLUME_REGIONS.map((r) => ({ value: r.id, label: r.label }))} />
              </div>
            </div>
            <div className="text-[11px] text-ink-3">
              Variable
              <div className="mt-1">
                <Segmented label="Variable" value={v} onChange={(x) => set({ var: x })} options={(Object.keys(VARS) as Var[]).map((k) => ({ value: k, label: VARS[k].label }))} />
              </div>
            </div>
            <div className="text-[11px] text-ink-3">
              Depth range
              <div className="mt-1">
                <Segmented label="Depth range" value={zmax} onChange={(z) => { setSlice(null); set({ zmax: z }); }} options={[200, 500, 1000].map((z) => ({ value: z, label: `0–${z} m` }))} />
              </div>
            </div>
            <label className="text-[11px] text-ink-3">
              Slice
              <select value={slice ?? ""} onChange={(e) => setSlice(e.target.value === "" ? null : Number(e.target.value))} className="mt-1 block bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink">
                <option value="">All depths</option>
                {(d?.depths_m ?? []).map((z) => (
                  <option key={z} value={z}>
                    {z} m only
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-ink-3">
              Vertical exaggeration <span className="num text-ink-2">×{exag.toFixed(1)}</span>
              <input type="range" min={0.5} max={3} step={0.1} value={exag} onChange={(e) => setExag(Number(e.target.value))} className="mt-2 block w-32" aria-valuetext={`${exag.toFixed(1)} times`} />
            </label>
            <label className="text-[11px] text-ink-3">
              Point size <span className="num text-ink-2">{size}px</span>
              <input type="range" min={2} max={9} step={1} value={size} onChange={(e) => setSize(Number(e.target.value))} className="mt-2 block w-24" />
            </label>
          </div>
          {q.error && <ErrorState message={q.error} why="The 3-D sample is taken from the reconstruction for one day." onRetry={q.retry} />}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
            <section className="panel relative overflow-hidden h-[62vh] min-h-[420px]" aria-label="3-D ocean view" data-guide="volume-3d">
              {q.loading && !d && <LoadingState label="Sampling the reconstructed volume…" className="absolute inset-0 h-auto" />}
              {d && <Volume3D key={`${region}|${zmax}`} data={d} ramp={spec.ramp} vmin={vmin} vmax={vmax} exaggeration={exag} pointSize={size} slice={slice} marker={hasPoint ? { lat: p.lat, lon: p.lon } : null} onPick={setPicked} />}
              {d && (
                <div className="absolute left-2 bottom-2 pointer-events-none">
                  <ColorLegend title={`${spec.label} · ${slice === null ? `0–${zmax} m` : `${slice} m`}`} vmin={vmin} vmax={vmax} units={d.units} ramp={spec.ramp} digits={spec.digits} />
                </div>
              )}
              <p className="absolute right-2 top-2 glass px-2.5 py-1 text-[11.5px] text-ink-2 pointer-events-none">Drag to rotate · scroll to zoom · click a point</p>
            </section>
            <aside className="space-y-4">
              <section className="panel p-4 space-y-2" aria-label="Sample">
                <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Sample</h2>
                {d ? (
                  <>
                    {d.notice && <Notice>{d.notice}</Notice>}
                    <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
                      {(
                        [
                          ["Date", d.date],
                          ["Points", `${d.n_points.toLocaleString("en-IN")} of max ${d.max_points.toLocaleString("en-IN")}`],
                          ["Horizontal stride", `every ${d.stride} cell${d.stride > 1 ? "s" : ""} (${(0.25 * d.stride).toFixed(2)}°)`],
                          ["Depths", `${d.depths_m.length} standard levels`],
                        ] as const
                      ).map(([k, val]) => (
                        <div key={k}>
                          <dt className="text-[11px] text-ink-3">{k}</dt>
                          <dd className="num text-ink">{val}</dd>
                        </div>
                      ))}
                    </dl>
                    <Provenance kind={spec.kind} source={d.provenance.source} lineage={spec.lineage} />
                    <p className="text-[11.5px] text-ink-3">Downsampled on the server to keep the view fast; depth is stretched for visibility. Points are grid-cell values, not interpolated.</p>
                  </>
                ) : (
                  <p className="text-[12.5px] text-ink-3">—</p>
                )}
              </section>
              <section className="panel p-4 space-y-2" aria-label="Selected point" aria-live="polite">
                <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Selected point</h2>
                {picked ? (
                  <>
                    <p className="num text-[13px] text-ink">
                      {picked.lat.toFixed(3)}°N · {picked.lon.toFixed(3)}°E · {picked.depth} m
                    </p>
                    <p className="num text-[18px] text-ink">
                      {picked.value.toFixed(spec.digits)} <span className="text-[12px] text-ink-2">{d?.units}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={profileHref({ lat: picked.lat, lon: picked.lon, date: d?.date ?? p.date })} className="inline-flex items-center gap-1.5 text-[12px] rounded-md border border-accent/50 text-accent px-2 py-1">
                        <Waves size={13} aria-hidden /> Open profile
                      </Link>
                      <Link href={stratificationHref({ lat: picked.lat, lon: picked.lon, date: d?.date ?? p.date })} className="inline-flex items-center gap-1.5 text-[12px] rounded-md border border-line text-ink-2 px-2 py-1 hover:text-ink">
                        <Layers size={13} aria-hidden /> Stratification
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="text-[12.5px] text-ink-3">Click any point in the cloud to read its value and open the full water column.</p>
                )}
              </section>
              <section className="panel p-4 space-y-2" aria-label="2-D alternatives">
                <h2 className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Same data in 2-D</h2>
                {alternatives}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
