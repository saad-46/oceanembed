"use client";
import { Provenance } from "@/components/ui";
import type { Meta } from "@/lib/api";
import { useApi } from "@/lib/useApi";

/** Current model and data version, read from the service (never hard-coded). */
export default function ModelVersion() {
  const q = useApi<Meta>("/v1/meta");
  const m = q.data;
  if (q.error) return <p className="text-[13px] text-ink-3">Version information is unavailable while the service cannot be reached.</p>;
  if (!m) return <p className="text-[13px] text-ink-3">Reading the model registry…</p>;
  return (
    <div className="space-y-3">
      <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 text-[13px]">
        {(
          [
            ["Production model", m.production_model],
            ["Reconstructed period", `${m.period.start} – ${m.period.end} (${m.period.n_days.toLocaleString("en-IN")} days)`],
            ["Grid", `${m.domain.resolution_deg}° · ${m.domain.min_lat}–${m.domain.max_lat}°N, ${m.domain.min_lon}–${m.domain.max_lon}°E`],
            ["Depths", `${m.depths_m.length} standard levels, ${m.depths_m[0]}–${m.depths_m[m.depths_m.length - 1]} m`],
            ["Training years", m.splits.train_years.join(", ")],
            ["Tuning year", m.splits.val_years.join(", ")],
            ["Independent test year", m.splits.test_years.join(", ")],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11.5px] text-ink-3">{k}</dt>
            <dd className="num text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3 border-b border-line text-left">
            <th className="font-normal py-1.5">Model</th>
            <th className="font-normal">Architecture</th>
            <th className="font-normal">Role</th>
          </tr>
        </thead>
        <tbody>
          {m.models.map((x) => (
            <tr key={x.name} className="border-b border-line/60">
              <td className="py-1.5 num text-ink">{x.name}</td>
              <td className="text-ink-2">{x.architecture}</td>
              <td className="text-ink-2">{x.is_production ? <Provenance kind="reconstructed" source="served in OceanSight" /> : "comparison baseline"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
