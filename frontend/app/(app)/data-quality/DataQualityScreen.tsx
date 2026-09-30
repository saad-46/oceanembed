"use client";
import Link from "next/link";
import { Database } from "lucide-react";
import Explain from "@/components/Explain";
import { DataBadge, ErrorState, KindBadge, LoadingState, PageHeader, QualityBadge, fmt } from "@/components/ui";
import type { DataQualityResponse } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-IN") : v === null || v === undefined ? "—" : String(v));
const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(d)} %`);
const LABELS: Record<string, string> = {
  days: "Days", missing_days: "Missing days", first: "First day", last: "Last day", ocean_cells_surface: "Ocean cells (surface)",
  ocean_cells_1000m: "Ocean cells (1000 m)", model: "Model", target_days: "Target days", split_counts: "Days per split", source: "Source",
  profiles: "Profiles", tracks: "Tracks",
};

function Metric({ k, v }: { k: string; v: unknown }) {
  const val = v && typeof v === "object" ? Object.entries(v as Record<string, number>).map(([a, b]) => `${a} ${n(b)}`).join(" · ") : n(v);
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{LABELS[k] ?? k.replace(/_/g, " ")}</dt>
      <dd className="num text-[12.5px] text-ink break-words">{val}</dd>
    </div>
  );
}

function MonthBars({ months }: { months: { month: string; n: number }[] }) {
  if (!months.length) return null;
  const max = Math.max(...months.map((m) => m.n));
  const W = 600, H = 70;
  const bw = W / months.length;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-auto" role="img" aria-label={`Argo profiles per month, ${months[0].month} to ${months[months.length - 1].month}, maximum ${max}`}>
        {months.map((m, k) => (
          <rect key={m.month} x={k * bw + 0.5} y={H - (m.n / max) * H} width={Math.max(1, bw - 1)} height={(m.n / max) * H} fill="#199e70" opacity={m.month.startsWith("2023") ? 1 : 0.55}>
            <title>{`${m.month}: ${m.n} profiles`}</title>
          </rect>
        ))}
        <text x={0} y={H + 12} fontSize={10} fill="#8a96a8">{months[0].month}</text>
        <text x={W} y={H + 12} fontSize={10} fill="#8a96a8" textAnchor="end">{months[months.length - 1].month}</text>
      </svg>
      <figcaption className="text-[11px] text-ink-3">Profiles per month · brighter bars: 2023 (held-out test year)</figcaption>
    </figure>
  );
}

export default function DataQualityScreen() {
  const q = useApi<DataQualityResponse>("/v1/data-quality");
  const d = q.data && !q.error ? q.data : null;
  const a = d?.argo;
  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1300px] w-full mx-auto">
      <PageHeader
        group="Data"
        title="Data quality"
        description="How complete and how clean the observations and input datasets are — computed from the processing pipeline's own quality-control records, not estimated."
        actions={
          <>
            <DataBadge fallback={q.data?.__fallback} />
            <Link href="/provenance" className="text-[12.5px] text-accent hover:underline">
              Data sources &amp; lineage →
            </Link>
          </>
        }
      />
      {q.error && <ErrorState message={q.error} why="The quality report is computed from the deployed pipeline records." onRetry={q.retry} />}
      {q.loading && !d && <LoadingState label="Reading the pipeline's quality-control records…" className="h-80" />}
      {d && (
        <>
          <section aria-labelledby="inv" data-guide="data-quality">
            <h2 id="inv" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Dataset inventory</h2>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {d.datasets.map((ds) => (
                <article key={ds.id} className="panel p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-[14px] text-ink flex items-center gap-2">
                      <Database size={14} className="text-ink-3" aria-hidden /> {ds.name}
                    </h3>
                    <QualityBadge quality={ds.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    <KindBadge kind={ds.classification} />
                    <span className="text-[12px] text-ink-3">{ds.status_reason}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {Object.entries(ds.metrics).map(([k, v]) => (
                      <Metric key={k} k={k} v={v} />
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </section>

          {d.inputs.length > 0 && (
            <section className="panel p-4" aria-labelledby="inp">
              <h2 id="inp" className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Satellite surface inputs</h2>
              <p className="text-[12.5px] text-ink-2 mt-1">Every value filled or rejected by the pipeline is counted. Status is the share of ocean values that had to be gap-filled.</p>
              <div className="overflow-x-auto mt-3 -mx-4 px-4">
                <table className="w-full min-w-[820px] text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-3 border-b border-line">
                      {["Variable", "Source", "Missing before fill", "Gap-filled (time / space)", "Out of range", "Duplicate times", "Days absent", "Valid range", "Status"].map((h) => (
                        <th key={h} className="py-1.5 pr-3 font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {d.inputs.map((r) => (
                      <tr key={r.variable} className="align-top">
                        <td className="py-2 pr-3 text-ink uppercase">{r.variable}</td>
                        <td className="py-2 pr-3 text-ink-2">{r.source ?? "—"}</td>
                        <td className="py-2 pr-3 num">{pct(r.missing_before_fill_pct, 2)}</td>
                        <td className="py-2 pr-3 num">
                          {pct(r.filled_pct, 2)} <span className="text-ink-3">({n(r.filled_temporal)} / {n(r.filled_spatial)})</span>
                        </td>
                        <td className="py-2 pr-3 num">{n(r.invalid_flagged)}</td>
                        <td className="py-2 pr-3 num">{n(r.duplicate_times)}</td>
                        <td className="py-2 pr-3 num">{n(r.days_absent_in_source)}</td>
                        <td className="py-2 pr-3 num text-ink-2">{r.valid_range.every((x) => x !== null) ? `${r.valid_range[0]} to ${r.valid_range[1]}` : "—"}</td>
                        <td className="py-2 pr-3">
                          <QualityBadge quality={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {a && (
            <section className="panel p-4 space-y-4" aria-labelledby="argo-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="argo-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 flex items-center gap-1">
                  Argo profiles <Explain term="argo" />
                </h2>
                <KindBadge kind="measured" />
              </div>
              {!a.detail_available ? (
                <p className="text-[12.5px] text-ink-3">{a.note}</p>
              ) : (
                <>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(
                      [
                        ["Profiles accepted", n(a.n_profiles)],
                        ["Held-out (2023) profiles", n(a.independent_profiles)],
                        ["With salinity", `${n(a.salinity?.profiles_with_salinity)} (${pct(a.salinity?.profiles_with_salinity_pct)})`],
                        ["Valid salinity levels", pct(a.salinity?.valid_salinity_levels_pct)],
                        ["1° boxes with profiles", `${n(a.spatial?.boxes_with_profiles)} of ${n(a.spatial?.ocean_boxes_1deg)} (${pct(a.spatial?.coverage_pct)})`],
                        ["2023 spatial coverage", pct(a.spatial?.test_year_coverage_pct)],
                        ["Reaching 500 m", pct(a.depth?.profiles_reaching_500m_pct)],
                        ["Reaching 1000 m", pct(a.depth?.profiles_reaching_1000m_pct)],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-[11px] text-ink-3">{k}</dt>
                        <dd className="num text-[15px] text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <h3 className="text-[12.5px] text-ink mb-1.5">Coverage at the standard depths</h3>
                      <ul className="space-y-1" aria-label="Share of profiles resolving each standard depth">
                        {a.depth?.per_standard_depth.map((r) => (
                          <li key={r.depth_m} className="grid grid-cols-[52px_1fr_62px_86px] items-center gap-2 text-[11.5px]">
                            <span className="num text-ink-2 text-right">{r.depth_m} m</span>
                            <span className="h-2 rounded-sm bg-white/[0.05] overflow-hidden" aria-hidden>
                              <span className="block h-full bg-good/70" style={{ width: `${r.coverage_pct ?? 0}%` }} />
                            </span>
                            <span className="num text-ink">{pct(r.coverage_pct, 0)}</span>
                            <QualityBadge quality={r.status} />
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-3">
                      {a.temporal && <MonthBars months={a.temporal.per_month} />}
                      <dl className="grid grid-cols-2 gap-2 text-[12px]">
                        <div>
                          <dt className="text-ink-3">Data mode</dt>
                          <dd className="text-ink num">{Object.entries(a.data_mode_counts ?? {}).map(([k, v]) => `${k} ${n(v)}`).join(" · ") || "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-3">Profiles per split</dt>
                          <dd className="text-ink num">{Object.entries(a.split_counts ?? {}).map(([k, v]) => `${k} ${n(v)}`).join(" · ")}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-3">Period</dt>
                          <dd className="text-ink num">{a.temporal?.first} → {a.temporal?.last}</dd>
                        </div>
                        <div>
                          <dt className="text-ink-3">Independent-sample status</dt>
                          <dd><QualityBadge quality={a.independent_status} /></dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="text-[12px] text-ink-2 border-t border-line pt-3 space-y-1">
                    <div className="text-ink">Rejected data</div>
                    {a.qc_record ? (
                      <p className="num">{Object.entries(a.qc_record).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k.replace(/_/g, " ")}: ${n(v)}`).join(" · ")}</p>
                    ) : (
                      <p className="text-ink-3">{a.rejected_note}</p>
                    )}
                    {a.salinity && <p className="text-ink-3">{a.salinity.note}</p>}
                  </div>
                </>
              )}
            </section>
          )}

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <section className="panel p-4" aria-labelledby="qc-h">
              <h2 id="qc-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Quality-control rules applied</h2>
              <ul className="space-y-2.5">
                {d.qc_rules.map((r) => (
                  <li key={r.step} className="text-[12.5px]">
                    <div className="text-ink">
                      {r.step} <span className="text-[11px] text-ink-3">· {r.applies_to}</span>
                    </div>
                    <div className="text-ink-2 leading-relaxed">{r.rule}</div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel p-4" aria-labelledby="th-h">
              <h2 id="th-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">How status is assigned</h2>
              <p className="text-[12px] text-ink-3 mb-2">OceanSight display thresholds, documented in docs/DATA_QUALITY.md. They summarise the records above; they are not a certification.</p>
              <ul className="space-y-2">
                {Object.entries(d.thresholds).map(([k, t]) => (
                  <li key={k} className="text-[12.5px]">
                    <div className="text-ink-2">{t.meaning}</div>
                    <div className="num text-[11.5px] text-ink-3">
                      {t.good_max !== undefined
                        ? `good ≤ ${fmt(t.good_max * 100, 0)} % · limited ≤ ${fmt(t.limited_max! * 100, 0)} % · insufficient above`
                        : t.good_min !== undefined && t.good_min >= 1
                          ? `good ≥ ${t.good_min} · limited ≥ ${t.limited_min} · insufficient below`
                          : `good ≥ ${fmt(t.good_min! * 100, 0)} % · limited ≥ ${fmt(t.limited_min! * 100, 0)} % · insufficient below`}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[11.5px] text-ink-3 mt-3">Computed from: {d.files.join(", ") || "no pipeline records are deployed"}.</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
