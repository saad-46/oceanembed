"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Card, DataBadge, ErrorState, Segmented, Skeleton } from "@/components/ui";
import { friendlyError, get, post } from "@/lib/api";
import { DEFAULT_DATE, DEFAULT_POINT, STANDARD_DEPTHS } from "@/lib/dates";

interface EmbPoint { date: string; region: string; month: number; season: string; x: number; y: number }
interface Emb { method: string; embedding_dim: number; explained_variance_ratio: number[]; n_points: number; points: EmbPoint[] }
const SEASONS = ["NE monsoon (DJF)", "Pre-monsoon (MAM)", "SW monsoon (JJAS)", "Post-monsoon (ON)"];
const FEATURE_LABEL: Record<string, string> = { sst: "SST", sss: "SSS", sla: "Sea-level anomaly", ucur: "Current U", vcur: "Current V", uwind: "Wind U", vwind: "Wind V", lat: "Latitude", lon: "Longitude", doy_sin: "Season (sin)", doy_cos: "Season (cos)" };

export default function InsightsScreen() {
  const router = useRouter();
  const [emb, setEmb] = useState<Emb | null>(null);
  const [embErr, setEmbErr] = useState<string | null>(null);
  const [region, setRegion] = useState<"Bay of Bengal" | "Arabian Sea" | "both">("both");
  const [imp, setImp] = useState<Record<string, Record<string, number>> | null>(null);
  const [depth, setDepth] = useState(100);
  const [q, setQ] = useState({ lat: DEFAULT_POINT.lat, lon: DEFAULT_POINT.lon, date: DEFAULT_DATE });
  const [ans, setAns] = useState<{ summary: string; source: string } | null>(null);
  const [ansErr, setAnsErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    get<Emb>("/v1/embedding/projection").then(setEmb).catch((e) => setEmbErr(friendlyError(e)));
    get<{ per_depth: Record<string, Record<string, number>> }>("/v1/explain/importance").then((r) => setImp(r.per_depth)).catch(() => {});
  }, []);

  const pts = useMemo(() => (emb ? emb.points.filter((p) => region === "both" || p.region === region) : []), [emb, region]);
  const impData = imp?.[String(depth)] ? Object.entries(imp[String(depth)]).map(([k, v]) => ({ name: FEATURE_LABEL[k] ?? k, v: +(v * 100).toFixed(1) })).sort((a, b) => b.v - a.v) : [];
  const ask = async () => {
    setAsking(true);
    setAnsErr(null);
    try {
      setAns(await post<{ summary: string; source: string }>("/v1/assistant/query", q));
    } catch (e) {
      setAnsErr(friendlyError(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="px-4 md:px-8 py-6 space-y-5 max-w-[1600px] w-full mx-auto">
      <div>
        <h1 className="font-display text-2xl">AI insights · the satellite embedding</h1>
        <p className="text-sm text-ink-2 mt-1 max-w-3xl">
          The U-Net encoder compresses each day&apos;s basin-wide surface state (SST, SSS, SLA, currents, winds) into a compact latent representation — the
          &ldquo;satellite embedding&rdquo; the problem statement asks for. Below, each dot is one day&apos;s embedding pooled over a region, projected to 2-D.
        </p>
      </div>
      <Card
        title="Embedding space by season"
        right={
          <div className="flex items-center gap-3">
            <DataBadge />
            <Segmented label="Region" value={region} onChange={setRegion} options={[{ value: "both", label: "Both" }, { value: "Bay of Bengal", label: "Bay of Bengal" }, { value: "Arabian Sea", label: "Arabian Sea" }]} />
          </div>
        }
      >
        {embErr && <ErrorState message={embErr} />}
        {!emb && !embErr && <Skeleton className="h-[420px]" />}
        {emb && (
          <>
            <p className="text-[11px] text-ink-3 mb-2 num">
              {emb.method} · {emb.embedding_dim}-d → 2-d · PC1 {(emb.explained_variance_ratio[0] * 100).toFixed(0)}% / PC2 {(emb.explained_variance_ratio[1] * 100).toFixed(0)}% of variance · click a dot to open that day on the map
            </p>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              {SEASONS.map((s) => {
                const on = pts.filter((p) => p.season === s);
                const off = pts.filter((p) => p.season !== s);
                return (
                  <div key={s} className="border border-line rounded p-2">
                    <div className="text-xs text-ink mb-1">
                      {s} <span className="text-ink-3 num">· {on.length} days</span>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer>
                        <ScatterChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                          <CartesianGrid stroke="#8a96a8" strokeOpacity={0.1} />
                          <XAxis type="number" dataKey="x" hide domain={["dataMin", "dataMax"]} />
                          <YAxis type="number" dataKey="y" hide domain={["dataMin", "dataMax"]} />
                          <ZAxis range={[14, 14]} />
                          <Tooltip
                            cursor={false}
                            contentStyle={{ background: "#111826", border: "1px solid #2ac3de", fontSize: 12 }}
                            content={({ payload }) => {
                              const p = payload?.[0]?.payload as EmbPoint | undefined;
                              return p ? (
                                <div className="bg-surface border border-accent rounded px-2 py-1 text-xs">
                                  <div className="num">{p.date}</div>
                                  <div className="text-ink-2">{p.region}</div>
                                </div>
                              ) : null;
                            }}
                          />
                          <Scatter data={off} fill="#5d6878" fillOpacity={0.18} isAnimationActive={false} />
                          <Scatter data={on} fill="#3987e5" fillOpacity={0.8} isAnimationActive={false} onClick={(d) => router.push(`/map?date=${(d as unknown as EmbPoint).date}`)} cursor="pointer" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-3 mt-2">
              Seasons separating in embedding space is evidence the encoder has learned the monsoon-driven state of the upper ocean from surface data alone; it is a
              diagnostic, not a skill metric (see Validation).
            </p>
          </>
        )}
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card
          title="What drives the baseline? (LightGBM importance)"
          right={
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="bg-bg border border-line rounded px-2 py-1 text-xs num" aria-label="Depth">
              {STANDARD_DEPTHS.map((z) => (
                <option key={z} value={z}>
                  {z} m
                </option>
              ))}
            </select>
          }
        >
          {!imp ? (
            <Skeleton className="h-72" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart layout="vertical" data={impData} margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke="#8a96a8" strokeOpacity={0.12} horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#8a96a8", fontSize: 11 }} stroke="#1e2836" unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#8a96a8", fontSize: 11 }} stroke="#1e2836" width={110} />
                  <Tooltip contentStyle={{ background: "#111826", border: "1px solid #2ac3de", fontSize: 12 }} formatter={(v) => [`${v}% of split gain`, "importance"]} cursor={{ fill: "#ffffff08" }} />
                  <Bar dataKey="v" fill="#3987e5" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-ink-3">Share of LightGBM split gain per input at the selected depth — which surface signal the per-pixel baseline relies on.</p>
        </Card>
        <Card title="Ask about a location">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-ink-3">
              Latitude
              <input type="number" step="0.25" value={q.lat} onChange={(e) => setQ({ ...q, lat: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded px-2 py-1 text-sm text-ink" />
            </label>
            <label className="text-[11px] text-ink-3">
              Longitude
              <input type="number" step="0.25" value={q.lon} onChange={(e) => setQ({ ...q, lon: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded px-2 py-1 text-sm text-ink" />
            </label>
            <label className="text-[11px] text-ink-3">
              Date
              <input type="date" value={q.date} min="2019-01-01" max="2023-12-31" onChange={(e) => e.target.value && setQ({ ...q, date: e.target.value })} className="mt-1 w-full num bg-bg border border-line rounded px-2 py-1 text-sm text-ink [color-scheme:dark]" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={ask} disabled={asking} className="text-sm bg-accent text-bg rounded px-4 py-1.5 disabled:opacity-50">
              {asking ? "Thinking…" : "What's the heat potential here?"}
            </button>
            {[
              { lat: 15, lon: 88, date: "2023-05-11", l: "Pre-Mocha BoB" },
              { lat: 15, lon: 66, date: "2023-06-06", l: "Biparjoy, Arabian Sea" },
              { lat: 10, lon: 60, date: "2022-01-15", l: "Winter, W. Arabian Sea" },
            ].map((ex) => (
              <button key={ex.l} onClick={() => setQ({ lat: ex.lat, lon: ex.lon, date: ex.date })} className="text-xs border border-line rounded px-2 py-1 text-ink-2 hover:text-ink">
                {ex.l}
              </button>
            ))}
          </div>
          {ansErr && <div className="mt-3"><ErrorState message={ansErr} /></div>}
          {ans && (
            <div className="mt-3 bg-surface-2 rounded px-3 py-2 text-sm">
              {ans.summary}
              <div className="text-[10px] text-ink-3 mt-1 uppercase tracking-wider">{ans.source === "llm" ? "LLM phrasing of computed values" : "Templated from computed values (no LLM configured)"}</div>
            </div>
          )}
          <p className="text-[11px] text-ink-3 mt-3">
            Numbers are computed deterministically from the reconstruction first; an LLM (optional) only phrases them, with a templated fallback — the
            answer never depends on a live AI service.
          </p>
        </Card>
      </div>
    </div>
  );
}
