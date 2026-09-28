"use client";
/** Live product preview built from the real components and real API data (not a screenshot). */
import dynamic from "next/dynamic";
import { useState } from "react";
import { Crosshair, Layers } from "lucide-react";
import ProfileChart from "@/components/ProfileChart";
import ColorLegend from "@/components/Legend";
import { Button, Skeleton, fmt } from "@/components/ui";
import type { ProfileResponse } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useGrid } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });
const DATE = "2023-05-11";
const PT = { lat: 15, lon: 88 };

export default function ProductPreview() {
  const [depth, setDepth] = useState(100);
  const { grid, range } = useGrid(DATE, depth, "temp");
  const prof = useApi<ProfileResponse>(`/v1/profile/${DATE}?lat=15.000&lon=88.000`).data;
  const band = prof?.uncertainty_c
    ? {
        lo: prof.temperature_c.map((t, k) => (t === null || prof.uncertainty_c![k] === null ? null : t - (prof.uncertainty_c![k] as number))),
        hi: prof.temperature_c.map((t, k) => (t === null || prof.uncertainty_c![k] === null ? null : t + (prof.uncertainty_c![k] as number))),
      }
    : null;
  return (
    <div className="relative rounded-[var(--radius-lg)] border border-line-2 bg-bg-2 overflow-hidden shadow-[var(--shadow-2)]">
      <div className="flex items-center gap-1.5 px-4 h-9 border-b border-line bg-bg/60">
        {["#e5484d", "#e9a23b", "#22b07d"].map((c) => (
          <span key={c} className="w-2.5 h-2.5 rounded-full opacity-70" style={{ background: c }} aria-hidden />
        ))}
        <span className="ml-3 text-[11px] num text-ink-3">oceansight · ocean map · {DATE}</span>
      </div>
      <div className="grid lg:grid-cols-[1fr_340px]">
        <div className="relative h-[380px] md:h-[440px]">
          <OceanMap
            minimal
            raster={grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: "thermal", key: `pv|${grid.depth_m}` } : null}
            point={PT}
          />
          <div className="absolute top-3 left-3 glass p-2 flex items-center gap-1.5" role="group" aria-label="Preview depth">
            <Layers size={14} className="text-accent ml-1" aria-hidden />
            {[0, 100, 500].map((z) => (
              <button
                key={z}
                onClick={() => setDepth(z)}
                aria-pressed={depth === z}
                className={`num text-xs px-2.5 py-1 rounded-md transition-colors ${depth === z ? "bg-accent/20 text-accent" : "text-ink-2 hover:text-ink"}`}
              >
                {z} m
              </button>
            ))}
          </div>
          {range && (
            <div className="absolute bottom-3 left-3">
              <ColorLegend title={`Reconstructed temperature · ${depth} m`} vmin={range[0]} vmax={range[1]} units="°C" ramp="thermal" />
            </div>
          )}
        </div>
        <div className="border-t lg:border-t-0 lg:border-l border-line p-4 bg-surface/40">
          <div className="flex items-center gap-2 text-xs text-ink-2">
            <Crosshair size={14} className="text-accent" /> <span className="num">15.00°N 88.00°E</span> · pre-Cyclone Mocha
          </div>
          {prof ? (
            <>
              <ProfileChart
                depths={prof.depths_m}
                main={{ key: "model", label: "Reconstruction", color: "#3987e5", values: prof.temperature_c }}
                band={band}
                others={
                  prof.nearest_argo_float
                    ? [{ key: "argo", label: "Argo (measured)", color: "#199e70", values: prof.nearest_argo_float.temperature_c_std_depths, dots: true }]
                    : []
                }
                height={270}
              />
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {[
                  ["TCHP", prof.derived.tchp_kj_cm2, "kJ/cm²"],
                  ["MLD", prof.derived.mld_m, "m"],
                  ["D26", prof.derived.d26_m, "m"],
                  ["D20", prof.derived.d20_m, "m"],
                ].map(([k, v, u]) => (
                  <div key={k as string} className="rounded-md border border-line px-2 py-1.5">
                    <div className="text-[9.5px] text-ink-3 uppercase tracking-wider">{k}</div>
                    <div className="num text-sm text-ink">
                      {fmt(v as number | null, 0)} <span className="text-[10px] text-ink-3">{u}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Skeleton className="h-[330px] mt-2" />
          )}
          <Button href={`/map?date=${DATE}&depth=${depth}&lat=15.000&lon=88.000`} size="sm" className="w-full mt-3">
            Open this view in the platform →
          </Button>
        </div>
      </div>
    </div>
  );
}
