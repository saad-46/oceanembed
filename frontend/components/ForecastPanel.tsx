"use client";
/**
 * Short-horizon (T+1, T+2) estimate of the reconstructed column. It states its method on screen: a
 * statistical extrapolation (recent trend or persistence), not a trained forecast model.
 */
import { useState } from "react";
import Explain from "@/components/Explain";
import { ErrorState, KindBadge, LoadingState, Provenance, Segmented, fmt } from "@/components/ui";
import type { ForecastResponse } from "@/lib/api";
import { forecastPath } from "@/lib/analysis";
import { useApi } from "@/lib/useApi";

const SHOWN = [0, 10, 50, 100, 150, 200, 300, 500];

export default function ForecastPanel({ lat, lon, date }: { lat: number; lon: number; date: string }) {
  const [method, setMethod] = useState<"trend" | "persistence">("trend");
  const [all, setAll] = useState(false);
  const q = useApi<ForecastResponse>(forecastPath({ lat, lon, date }, method));
  const f = q.data && !q.error ? q.data : null;
  const rows = f ? f.depths_m.map((z, k) => ({ z, k })).filter(({ z }) => all || SHOWN.includes(z)) : [];
  const verif = f?.horizons.some((h) => h.verification_c);
  return (
    <section className="panel p-4 space-y-3" aria-labelledby="fc-h" data-guide="forecast">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fc-h" className="text-[13.5px] text-ink flex items-center gap-2">
          Short-horizon estimate · T+1, T+2 days <Explain term="short_horizon" /> <KindBadge kind="forecast" />
        </h2>
        <Segmented label="Estimation method" value={method} onChange={setMethod} options={[{ value: "trend", label: "Recent trend" }, { value: "persistence", label: "Persistence" }]} />
      </div>
      {q.error && <ErrorState message={q.error} why="The estimate needs at least 7 reconstructed days before the issue day and a 60-day hindcast to measure its error." action="Select a later day in the timeline." />}
      {q.loading && !f && <LoadingState label="Extrapolating the reconstructed column and hindcasting its error…" className="h-40" />}
      {f && (
        <div className={q.loading ? "opacity-60 transition-opacity" : ""}>
          <p className="text-[12.5px] text-ink leading-relaxed">{f.method_label}</p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-[12px]">
            <div className="flex gap-1.5">
              <dt className="text-ink-3">Issued</dt>
              <dd className="num text-ink">{f.issue_date}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-3">Input period</dt>
              <dd className="num text-ink">
                {f.input_period.start} → {f.input_period.end} ({f.input_period.n_days} d)
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-3">Error from</dt>
              <dd className="num text-ink">{f.hindcast_days}-day hindcast · {f.horizons[0]?.n_hindcast_pairs} pairs</dd>
            </div>
          </dl>
          {f.notice && <p className="text-[12px] text-warn mt-1">{f.notice}</p>}
          <div className="overflow-x-auto mt-3 -mx-4 px-4">
            <table className="w-full min-w-[620px] text-[12.5px]">
              <caption className="sr-only">Short-horizon temperature estimate by depth with ±1 sd</caption>
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-3 border-b border-line">
                  <th className="py-1.5 pr-3 font-normal">Depth</th>
                  <th className="py-1.5 pr-3 font-normal">Issue day</th>
                  {f.horizons.map((h) => (
                    <th key={h.horizon_days} className="py-1.5 pr-3 font-normal">
                      T+{h.horizon_days} · {h.target_date.slice(5)}
                    </th>
                  ))}
                  <th className="py-1.5 pr-3 font-normal">Hindcast RMSE (method / persistence)</th>
                  {verif && <th className="py-1.5 font-normal">Reconstruction on T+1 / T+2</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line num">
                {rows.map(({ z, k }) => (
                  <tr key={z}>
                    <td className="py-1.5 pr-3 text-ink-2">{z} m</td>
                    <td className="py-1.5 pr-3 text-ink">{fmt(f.issue_temperature_c[k], 2)}</td>
                    {f.horizons.map((h) => (
                      <td key={h.horizon_days} className="py-1.5 pr-3 text-ink">
                        {fmt(h.temperature_c[k], 2)} <span className="text-ink-3">± {fmt(h.uncertainty_c[k], 2)}</span>
                      </td>
                    ))}
                    <td className="py-1.5 pr-3 text-ink-2">
                      {f.horizons.map((h) => `${fmt(h.method_rmse_c[k], 2)} / ${fmt(h.persistence_rmse_c[k], 2)}`).join(" · ")}
                    </td>
                    {verif && <td className="py-1.5 text-ink-2">{f.horizons.map((h) => fmt(h.verification_c?.[k] ?? null, 2)).join(" / ")}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setAll(!all)} className="text-[12px] text-accent hover:underline mt-1.5">
            {all ? "Show key depths" : "Show all 15 depths"}
          </button>
          <p className="text-[11.5px] text-ink-3 mt-1">All temperatures in °C. ± is one standard deviation: the hindcast error of the method combined with the reconstruction&apos;s calibrated σ.</p>
          {verif && <p className="text-[11.5px] text-ink-3">The reconstruction for the target days exists in the record and is shown for comparison; the estimate used only days up to {f.issue_date}.</p>}
          <ul className="mt-2 space-y-0.5">
            {f.limitations.map((l) => (
              <li key={l} className="text-[11.5px] text-ink-3">
                · {l}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <Provenance kind="forecast" source={`statistical extrapolation of ${f.provenance.model_version ?? "the reconstruction"}`} lineage="forecast" />
          </div>
        </div>
      )}
    </section>
  );
}
