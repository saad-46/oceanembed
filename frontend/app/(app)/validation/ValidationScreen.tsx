"use client";
import Link from "next/link";
import { useState } from "react";
import { CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { AlertTriangle, BarChart3, Crosshair, Database, GitCompare, ListOrdered, ScatterChart as ScatterIcon } from "lucide-react";
import Explain from "@/components/Explain";
import { Card, DataBadge, ErrorState, LoadingState, PageHeader, Segmented, fmt } from "@/components/ui";
import { type ValidationSummary } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fromY, toY, Y_TICKS } from "@/components/ProfileChart";

const SERIES = [
  { key: "rmse_c", label: "OceanSight U-Net", color: "#3987e5" },
  { key: "baseline_rmse_c", label: "Climatology", color: "#d95926" },
  { key: "lightgbm_rmse_c", label: "LightGBM", color: "#c98500" },
  { key: "nosss_rmse_c", label: "U-Net without SSS", color: "#d55181" },
  { key: "target_product_rmse_c", label: "HYCOM target product", color: "#9085e9" },
] as const;
const blue = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
const depthColor = (z: number) => blue[Math.min(4, Math.floor(Math.sqrt(z / 1000) * 5))];

interface ProfilesResp {
  total: number;
  profiles: { id: number; platform_number: string; cycle_number: number; profile_date: string; split: string; lat: number; lon: number; rmse_c: number | null; n_levels: number; distance_km: number }[];
}
interface GridMetrics {
  target_source: string;
  splits: Record<string, { n_days: number; period: string; models: Record<string, { per_depth: { depth_m: number; rmse_c?: number }[]; bay_of_bengal_per_depth: { depth_m: number; rmse_c?: number }[] }> }>;
  uncertainty_calibration?: Record<string, { frac_within_1sigma: number; frac_within_2sigma: number }>;
}

interface En4Metrics {
  source: string;
  note: string;
  splits: Record<string, { models: Record<string, { per_depth: { depth_m: number; rmse_c?: number; bias_c?: number; n_obs: number }[] }> }>;
}

const meanRmse = (rows: { rmse_c?: number }[]) => {
  const v = rows.map((r) => r.rmse_c).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function AblationNote({ g }: { g: GridMetrics }) {
  const full = g.splits.test?.models["cnn-unet-v1"];
  const nosss = g.splits.test?.models["cnn-unet-nosss-v1"];
  if (!full || !nosss) return null;
  const d = (meanRmse(nosss.bay_of_bengal_per_depth) ?? 0) - (meanRmse(full.bay_of_bengal_per_depth) ?? 0);
  return (
    <p className="text-[11px] text-ink-3 mt-2">
      Salinity ablation (same U-Net without the SSS channel): Bay of Bengal test RMSE changes by{" "}
      <span className="num text-ink">{d >= 0 ? "+" : ""}{d.toFixed(3)} °C</span>.{" "}
      {Math.abs(d) < 0.01
        ? "In this build, removing satellite SSS does not measurably change skill — the other channels (SST, SLA, winds) carry equivalent information, or the open daily SSS is too noisy to add signal. We report this rather than assume the barrier-layer effect."
        : d > 0
          ? "Removing SSS degrades the Bay of Bengal reconstruction — evidence the model uses salinity (barrier-layer) information."
          : "Removing SSS slightly improves this metric — satellite SSS is not adding skill here."}
    </p>
  );
}

export default function ValidationScreen() {
  const [split, setSplit] = useState<"test" | "val">("test");
  const [sort, setSort] = useState<"date" | "rmse_desc" | "rmse_asc">("rmse_desc");
  const [page, setPage] = useState(0);
  const sumQ = useApi<ValidationSummary>(`/v1/validation/summary?split=${split}`);
  const scatQ = useApi<{ points: { pred: number; obs: number; depth_m: number }[] }>(`/v1/validation/scatter?split=${split}&max_points=3000`);
  const profQ = useApi<ProfilesResp>(`/v1/validation/profiles?split=${split}&sort=${sort}&limit=15&offset=${page * 15}`);
  const gridQ = useApi<GridMetrics>("/v1/validation/grid");
  const en4 = useApi<En4Metrics>("/v1/validation/en4").data;
  const sum = sumQ.loading ? null : sumQ.data;
  const scatter = scatQ.loading ? null : scatQ.error ? [] : scatQ.data?.points ?? null;
  const profiles = profQ.data;
  const gridM = gridQ.data;
  const err = sumQ.error;
  const profErr = profQ.error;

  const at100 = sum?.per_depth.find((r) => r.depth_m === 100);
  const nBetter = sum ? sum.per_depth.filter((r) => (r.skill_vs_climatology ?? 0) > 0).length : 0;
  const cal1 = sum ? (sum.uncertainty_calibration.calibrated?.frac_within_1sigma ?? sum.uncertainty_calibration.frac_within_1sigma ?? null) : null;
  const chartData = sum?.per_depth.map((r) => ({ ...r, y: toY(r.depth_m) })) ?? [];
  const lims = scatter?.length ? [Math.floor(Math.min(...scatter.map((p) => Math.min(p.pred, p.obs)))), Math.ceil(Math.max(...scatter.map((p) => Math.max(p.pred, p.obs))))] : [0, 32];

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1500px] w-full mx-auto">
      <PageHeader
        group="Validate"
        title="Evidence"
        description="How the reconstruction compares with observations it was not trained on, and with simpler baselines. Numbers below are computed from the stored validation results."
        actions={
          <>
            <DataBadge fallback={sum?.__fallback} />
            <Segmented label="Held-out year" value={split} onChange={(s) => (setSplit(s), setPage(0))} options={[{ value: "test", label: "Test · 2023" }, { value: "val", label: "Tuning · 2022" }]} />
          </>
        }
      />

      <ol className="panel grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line" aria-label="How the data are split">
        {(
          [
            ["2019–2021", "Training", "Satellite inputs → HYCOM ocean analysis (training target). Normalisation and climatology use these years only."],
            ["2022", "Tuning", "Argo profiles used only for early stopping and to calibrate the ±σ uncertainty."],
            ["2023", "Independent test", "Argo profiles never seen in training or tuning; every headline number on this page uses them unless you switch to 2022."],
          ] as const
        ).map(([y, t, d]) => (
          <li key={t} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="num text-ink">{y}</span>
              <span className="text-[12px] uppercase tracking-[0.1em] text-ink-3">{t}</span>
            </div>
            <p className="text-[12.5px] text-ink-2 mt-1 leading-relaxed">{d}</p>
          </li>
        ))}
      </ol>

      <dl className="panel grid grid-cols-2 lg:grid-cols-4 divide-x divide-line" aria-label="Key numbers">
        {(
          [
            ["Profiles scored", sum ? sum.n_profiles.toLocaleString("en-IN") : null, sum ? `Argo, ${sum.held_out_period}` : "", null],
            ["RMSE at 100 m", at100 ? `${fmt(at100.rmse_c, 2)} °C` : null, at100 ? `seasonal climatology ${fmt(at100.baseline_rmse_c, 2)} °C` : "", "climatology"],
            ["Depths better than climatology", sum ? `${nBetter} of ${sum.per_depth.length}` : null, "positive skill score", null],
            ["Values within ±1σ", cal1 === null ? null : `${(cal1 * 100).toFixed(0)}%`, "ideal ≈ 68% if σ is well calibrated", "uncertainty"],
          ] as const
        ).map(([k, v, hint, term]) => (
          <div key={k} className="px-4 py-3">
            <dt className="text-[11.5px] text-ink-3 flex items-center gap-1">
              {k} {term && <Explain term={term} />}
            </dt>
            <dd className="num text-[20px] text-ink mt-0.5">{v ?? (err ? "—" : <span className="skeleton inline-block h-6 w-16 align-middle" />)}</dd>
            <dd className="text-[11.5px] text-ink-3">{hint}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-3 rounded-lg border border-warn/40 bg-warn/[0.05] px-4 py-3 text-[13px]" role="note">
        <AlertTriangle size={16} className="text-warn shrink-0 mt-0.5" aria-hidden />
        <div>
          <span className="font-medium text-warn">Independence caveat · </span>
          <span className="text-ink-2">{sum?.caveat ?? "Held-out floats are independent of the model's training, but the ocean analysis used as the training target assimilates Argo, so they are not fully independent of that product."}</span>
        </div>
      </div>
      {err && <ErrorState message={err} why="The validation results could not be loaded." action="Check the connection and retry." onRetry={sumQ.retry} />}

      <div className="grid lg:grid-cols-2 gap-4" data-guide="validation-evidence">
        <Card className="scroll-mt-4" icon={<BarChart3 size={14} />} title="Error by depth against held-out Argo (RMSE, lower is better)" right={sum && <span className="text-[11px] text-ink-3 num">{sum.n_profiles.toLocaleString()} profiles · {sum.held_out_period}</span>}>
          {!sum ? (
            <LoadingState label="Scoring the reconstruction against held-out floats…" className="h-[380px]" />
          ) : (
            <div className="h-[380px]">
              <ResponsiveContainer>
                <ComposedChart layout="vertical" data={chartData} margin={{ top: 4, right: 16, bottom: 20, left: 4 }}>
                  <CartesianGrid stroke="#8a96a8" strokeOpacity={0.12} />
                  <XAxis type="number" tick={{ fill: "#8a96a8", fontSize: 11 }} stroke="#1c2c42" label={{ value: "RMSE (°C)", position: "insideBottom", offset: -12, fill: "#8a96a8", fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" domain={[0, toY(1000)]} ticks={Y_TICKS} tickFormatter={(y: number) => String(fromY(y))} tick={{ fill: "#8a96a8", fontSize: 11 }} stroke="#1c2c42" width={44} />
                  <Tooltip contentStyle={{ background: "#0d1929", border: "1px solid #2ec5d8", borderRadius: 8, fontSize: 12 }} labelFormatter={(y) => `${fromY(Number(y))} m`} formatter={(v, n) => [typeof v === "number" ? `${v.toFixed(2)} °C` : "—", n]} />
                  <Legend verticalAlign="top" height={40} wrapperStyle={{ fontSize: 11 }} />
                  {SERIES.map((s) => (
                    <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.key === "rmse_c" ? 2.5 : 2} strokeDasharray={s.key === "target_product_rmse_c" ? "5 4" : undefined} dot={{ r: 3, fill: s.color, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-ink-3 mt-2">
            HYCOM target product is scored only on the days it was fetched (every 3rd day) — it shows the ceiling of what learning from that target can achieve.
          </p>
        </Card>
        <Card icon={<ScatterIcon size={14} />} title="Reconstructed vs measured temperature (colour = depth)">
          {!scatter ? (
            <LoadingState label="Pairing reconstructed and observed temperatures…" className="h-[380px]" />
          ) : scatter.length === 0 ? (
            <p className="text-sm text-ink-3 h-[380px] flex items-center justify-center">No paired points available.</p>
          ) : (
            <div className="h-[380px]">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
                  <CartesianGrid stroke="#8a96a8" strokeOpacity={0.12} />
                  <XAxis type="number" dataKey="obs" domain={lims} tick={{ fill: "#8a96a8", fontSize: 11 }} stroke="#1c2c42" label={{ value: "Argo observed (°C)", position: "insideBottom", offset: -12, fill: "#8a96a8", fontSize: 11 }} />
                  <YAxis type="number" dataKey="pred" domain={lims} tick={{ fill: "#8a96a8", fontSize: 11 }} stroke="#1c2c42" width={44} label={{ value: "Reconstructed (°C)", angle: -90, position: "insideLeft", fill: "#8a96a8", fontSize: 11, dy: 50 }} />
                  <ZAxis range={[10, 10]} />
                  <ReferenceLine segment={[{ x: lims[0], y: lims[0] }, { x: lims[1], y: lims[1] }]} stroke="#e8edf4" strokeOpacity={0.5} strokeDasharray="4 4" />
                  <Tooltip contentStyle={{ background: "#0d1929", border: "1px solid #2ec5d8", borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [typeof v === "number" ? v.toFixed(2) : v, n]} />
                  <Scatter data={scatter} isAnimationActive={false}>
                    {scatter.map((p, i) => (
                      <Cell key={i} fill={depthColor(p.depth_m)} fillOpacity={0.55} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-ink-3 mt-2">
            depth:
            {[0, 50, 200, 500, 1000].map((z) => (
              <span key={z} className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: depthColor(z) }} /> {z} m
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card icon={<ListOrdered size={14} />} title="Per-depth statistics (OceanSight U-Net vs held-out Argo)">
        {!sum ? (
          <LoadingState label="Computing per-depth skill…" className="h-64" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm num">
              <thead>
                <tr className="text-ink-3 text-[11px] uppercase tracking-wider border-b border-line">
                  {["Depth (m)", "RMSE °C", "Bias °C", "r", "Skill vs clim.", "Clim. RMSE", "LightGBM RMSE", "No-SSS RMSE", "n"].map((h) => (
                    <th key={h} className="text-right font-normal py-2 px-2 first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sum.per_depth.map((r) => (
                  <tr key={r.depth_m} className="border-b border-line/60">
                    <td className="py-1.5 px-2">{r.depth_m}</td>
                    <td className="text-right px-2 text-ink">{fmt(r.rmse_c, 2)}</td>
                    <td className="text-right px-2">{fmt(r.bias_c, 2)}</td>
                    <td className="text-right px-2">{fmt(r.corr ?? null, 2)}</td>
                    <td className={`text-right px-2 ${(r.skill_vs_climatology ?? 0) > 0 ? "text-good" : "text-bad"}`}>{fmt(r.skill_vs_climatology, 2)}</td>
                    <td className="text-right px-2 text-ink-2">{fmt(r.baseline_rmse_c, 2)}</td>
                    <td className="text-right px-2 text-ink-2">{fmt(r.lightgbm_rmse_c, 2)}</td>
                    <td className="text-right px-2 text-ink-2">{fmt(r.nosss_rmse_c, 2)}</td>
                    <td className="text-right px-2 text-ink-3">{r.n_obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-ink-3 mt-2">
              Skill vs climatology = 1 − MSE<sub>model</sub>/MSE<sub>climatology</sub> (positive = better than the training-period seasonal climatology).
              {sum.uncertainty_calibration.calibrated?.frac_within_1sigma !== undefined ? (
                <>
                  {" "}Uncertainty (served, calibrated on 2022 Argo): {(100 * (sum.uncertainty_calibration.calibrated.frac_within_1sigma ?? 0)).toFixed(0)}% of 2023 Argo values within ±1σ (ideal 68%),{" "}
                  {(100 * (sum.uncertainty_calibration.calibrated.frac_within_2sigma ?? 0)).toFixed(0)}% within ±2σ (ideal 95%); the raw model σ covered only{" "}
                  {(100 * (sum.uncertainty_calibration.frac_within_1sigma ?? 0)).toFixed(0)}% / {(100 * (sum.uncertainty_calibration.frac_within_2sigma ?? 0)).toFixed(0)}%.
                </>
              ) : (
                sum.uncertainty_calibration.frac_within_1sigma !== null && (
                  <>
                    {" "}Raw model σ: {(100 * (sum.uncertainty_calibration.frac_within_1sigma ?? 0)).toFixed(0)}% within ±1σ (ideal 68%), {(100 * (sum.uncertainty_calibration.frac_within_2sigma ?? 0)).toFixed(0)}% within ±2σ.
                    {sum.uncertainty_calibration.calibrated?.note && ` (${sum.uncertainty_calibration.calibrated.note})`}
                  </>
                )
              )}
            </p>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3" icon={<Crosshair size={14} />} title="Individual held-out Argo profiles" right={<Segmented label="Sort" value={sort} onChange={(s) => (setSort(s), setPage(0))} options={[{ value: "rmse_desc", label: "Worst first" }, { value: "rmse_asc", label: "Best first" }, { value: "date", label: "Date" }]} />}>
          {profErr && <ErrorState message={profErr} why="The float list could not be loaded." action="Retry, or switch the sort order." onRetry={profQ.retry} />}
          {!profiles && !profErr ? (
            <LoadingState label="Loading held-out float profiles…" className="h-72" />
          ) : profiles ? (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-sm num">
                <thead>
                  <tr className="text-ink-3 text-[11px] uppercase tracking-wider border-b border-line">
                    {["Float", "Date", "Lat", "Lon", "Levels", "RMSE °C", ""].map((h) => (
                      <th key={h} className="text-right font-normal py-2 px-2 first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profiles.profiles.map((p) => (
                    <tr key={p.id} className="border-b border-line/60 hover:bg-surface-2">
                      <td className="py-1.5 px-2">{p.platform_number}</td>
                      <td className="text-right px-2">{p.profile_date.slice(0, 10)}</td>
                      <td className="text-right px-2">{p.lat.toFixed(2)}</td>
                      <td className="text-right px-2">{p.lon.toFixed(2)}</td>
                      <td className="text-right px-2 text-ink-3">{p.n_levels}</td>
                      <td className="text-right px-2 text-ink">{fmt(p.rmse_c, 2)}</td>
                      <td className="text-right px-2">
                        <Link className="text-accent text-xs hover:underline" href={`/map?date=${p.profile_date.slice(0, 10)}&lat=${p.lat}&lon=${p.lon}`}>
                          open →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-ink-2">
                <span className="num">
                  {page * 15 + 1}–{Math.min((page + 1) * 15, profiles.total)} of {profiles.total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button disabled={page === 0} onClick={() => setPage(page - 1)} className="border border-line rounded-md px-2.5 py-0.5 hover:border-line-2 hover:text-ink disabled:opacity-40">
                    Prev
                  </button>
                  <button disabled={(page + 1) * 15 >= profiles.total} onClick={() => setPage(page + 1)} className="border border-line rounded-md px-2.5 py-0.5 hover:border-line-2 hover:text-ink disabled:opacity-40">
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </Card>
        <Card className="lg:col-span-2" icon={<GitCompare size={14} />} title="Model comparison against the gridded analysis">
          {!gridM ? (
            <LoadingState label="Loading gridded model comparison…" className="h-72" />
          ) : (
            <>
              <p className="text-[11px] text-ink-3 mb-2">Mean RMSE over 15 depths against the {gridM.target_source} grid, every ocean cell of every held-out target day.</p>
              <div className="overflow-x-auto">
              <table className="w-full text-sm num">
                <thead>
                  <tr className="text-ink-3 text-[11px] uppercase tracking-wider border-b border-line">
                    <th className="text-left font-normal py-2">Model</th>
                    <th className="text-right font-normal">Val 2022</th>
                    <th className="text-right font-normal">Test 2023</th>
                    <th className="text-right font-normal" title="Bay of Bengal subset, test year">BoB test</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(gridM.splits.test?.models ?? {}).map((m) => (
                    <tr key={m} className="border-b border-line/60">
                      <td className="py-1.5 text-ink-2 text-xs">{m}</td>
                      <td className="text-right">{fmt(meanRmse(gridM.splits.val?.models[m]?.per_depth ?? []), 3)}</td>
                      <td className="text-right text-ink">{fmt(meanRmse(gridM.splits.test.models[m].per_depth), 3)}</td>
                      <td className="text-right">{fmt(meanRmse(gridM.splits.test.models[m].bay_of_bengal_per_depth), 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <AblationNote g={gridM} />
            </>
          )}
        </Card>
      </div>
      {en4 && (
        <Card icon={<Database size={14} />} title="Cross-check against Met Office EN4 (monthly, 1°)">
          <p className="text-[11px] text-ink-3 mb-2">{en4.note} Mean RMSE over depths (5–1000 m); EN4 has no 0 m level.</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm num max-w-2xl">
            <thead>
              <tr className="text-ink-3 text-[11px] uppercase tracking-wider border-b border-line">
                <th className="text-left font-normal py-2">Model</th>
                <th className="text-right font-normal">Val 2022</th>
                <th className="text-right font-normal">Test 2023</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(en4.splits.test?.models ?? {}).map((m) => (
                <tr key={m} className="border-b border-line/60">
                  <td className="py-1.5 text-ink-2 text-xs">{m}</td>
                  <td className="text-right">{fmt(meanRmse(en4.splits.val?.models[m]?.per_depth ?? []), 3)}</td>
                  <td className="text-right text-ink">{fmt(meanRmse(en4.splits.test.models[m].per_depth), 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
      <section className="panel p-4" aria-labelledby="limits">
        <h2 id="limits" className="text-[11px] uppercase tracking-[0.12em] text-ink-3">What this evidence does and does not show</h2>
        <ul className="mt-2 grid md:grid-cols-2 gap-x-8 gap-y-1.5 text-[13px] text-ink-2 list-disc pl-5">
          <li>Errors are measured at Argo float locations and days; regions and seasons with few floats are less well tested.</li>
          <li>Argo profiles are point measurements; the reconstruction is a 0.25° cell average, which adds representativeness error.</li>
          <li>The training target assimilates Argo, so the test is independent of the model&apos;s training but not of that target product.</li>
          <li>The reconstruction covers 2019–2023 and is not a forecast; skill outside this period and region is not established.</li>
        </ul>
      </section>
    </div>
  );
}
