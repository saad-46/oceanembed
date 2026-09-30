"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import Explain from "@/components/Explain";
import { Badge, DataBadge, ErrorState, KindBadge, LoadingState, PageHeader } from "@/components/ui";
import type { LineageResponse, LineageRow } from "@/lib/api";
import { CLASS_ORDER } from "@/lib/analysis";
import { useApi } from "@/lib/useApi";

const ROUTE_LABEL: Record<string, string> = {
  "/map": "Ocean map", "/profiles": "Profile", "/timeline": "Timeline", "/section": "Section", "/stratification": "Stratification", "/ts": "T-S analysis",
  "/3d": "3-D ocean", "/analysis": "Events & regions", "/validation": "Evidence", "/reports": "Reports", "/methodology": "Methodology",
};

function Availability({ a }: { a: LineageRow["availability"] }) {
  const tone = a.status === "available" ? "good" : a.status === "not_configured" || a.status === "not_precomputed" || a.status === "database" ? "neutral" : "warn";
  const label = { available: "available", not_configured: "not configured", not_precomputed: "configured · not precomputed", database: "via database", unavailable: "unavailable" }[a.status] ?? a.status;
  return (
    <Badge tone={tone} className="normal-case tracking-normal">
      {label}
    </Badge>
  );
}

function RowCard({ r, open, onToggle }: { r: LineageRow; open: boolean; onToggle: () => void }) {
  const processing = Array.isArray(r.processing) ? r.processing : [r.processing];
  return (
    <article id={r.id} className="panel p-4 scroll-mt-4" aria-labelledby={`${r.id}-h`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`${r.id}-h`} className="text-[14.5px] text-ink">
          {r.variable}
        </h3>
        <div className="flex items-center gap-2">
          <KindBadge kind={r.classification} />
          <Availability a={r.availability} />
        </div>
      </div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 mt-3 text-[12.5px]">
        {(
          [
            ["Source / provider", r.provider],
            ["Dataset", r.dataset],
            ["Resolution", r.resolution],
            ["Temporal coverage", r.temporal_coverage],
            ["Depth coverage", r.depth_coverage],
            ["Role", r.role],
            ["Native resolution", r.native_resolution],
            ["Provenance record", r.recorded ? "recorded by the pipeline with the data used" : "declared by the source adapter"],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] text-ink-3">{k}</dt>
            <dd className="text-ink-2 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {r.availability.detail && <p className="text-[12px] text-ink-3 mt-2">{r.availability.detail}</p>}
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`${r.id}-how`} className="mt-3 text-[12.5px] text-accent hover:underline">
        {open ? "Hide" : "How this value was produced"}
      </button>
      {open && (
        <div id={`${r.id}-how`} className="mt-3 space-y-3 fade-in">
          <ol className="flex flex-wrap items-stretch gap-1.5" aria-label="Lineage">
            {r.lineage.map((s, k) => (
              <li key={s.stage} className="flex items-center gap-1.5">
                <span className="rounded-md border border-line bg-white/[0.02] px-2.5 py-1.5 max-w-[240px]">
                  <span className="block text-[10.5px] uppercase tracking-wider text-ink-3">{s.stage}</span>
                  <span className="block text-[12px] text-ink-2 leading-snug">{s.detail}</span>
                </span>
                {k < r.lineage.length - 1 && <ArrowRight size={13} className="text-ink-3 shrink-0" aria-hidden />}
              </li>
            ))}
          </ol>
          <div>
            <div className="text-[11px] text-ink-3 mb-1">Processing</div>
            <ul className="list-disc pl-5 text-[12.5px] text-ink-2 space-y-0.5">
              {processing.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-ink-3">Shown in:</span>
            {r.shown_in.map((h) => (
              <Link key={h} href={h} className="text-accent hover:underline">
                {ROUTE_LABEL[h] ?? h}
              </Link>
            ))}
            {r.url.startsWith("http") && (
              <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink ml-auto">
                Provider documentation <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default function ProvenanceScreen() {
  const q = useApi<LineageResponse>("/v1/provenance");
  const d = q.data && !q.error ? q.data : null;
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!d) return;
    const openHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id || !d.variables.some((v) => v.id === id)) return;
      setOpen((s) => new Set(s).add(id));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    openHash();
    window.addEventListener("hashchange", openHash);
    return () => window.removeEventListener("hashchange", openHash);
  }, [d]);
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1300px] w-full mx-auto">
      <PageHeader
        group="Data"
        title={
          <>
            Data sources &amp; lineage <Explain term="classification" />
          </>
        }
        description="Where every variable in OceanSight comes from, what kind of value it is, how it was processed, and where it is shown."
        actions={
          <>
            <DataBadge fallback={q.data?.__fallback} />
            <Link href="/data-quality" className="text-[12.5px] text-accent hover:underline">
              Data quality →
            </Link>
          </>
        }
      />
      {q.error && <ErrorState message={q.error} why="The lineage table is built from the deployed pipeline records." onRetry={q.retry} />}
      {q.loading && !d && <LoadingState label="Assembling the lineage of every variable…" className="h-80" />}
      {d && (
        <>
          <section className="panel p-4" aria-labelledby="cls-h">
            <h2 id="cls-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Classifications used throughout OceanSight</h2>
            <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CLASS_ORDER.filter((c) => d.classifications[c]).map((c) => (
                <div key={c}>
                  <dt>
                    <KindBadge kind={c} />
                  </dt>
                  <dd className="text-[12px] text-ink-2 mt-1 leading-snug">{d.classifications[c]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel p-4" aria-labelledby="tbl-h" data-guide="lineage-table">
            <h2 id="tbl-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Lineage overview</h2>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[760px] text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-3 border-b border-line">
                    {["Variable", "Classification", "Source / provider", "Resolution", "Temporal coverage", "Role", "Availability"].map((h) => (
                      <th key={h} className="py-1.5 pr-3 font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.variables.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="py-2 pr-3">
                        <a href={`#${r.id}`} className="text-ink hover:text-accent">{r.variable}</a>
                      </td>
                      <td className="py-2 pr-3"><KindBadge kind={r.classification} /></td>
                      <td className="py-2 pr-3 text-ink-2">{r.provider}</td>
                      <td className="py-2 pr-3 text-ink-2 num">{r.resolution}</td>
                      <td className="py-2 pr-3 text-ink-2 num">{r.temporal_coverage}</td>
                      <td className="py-2 pr-3 text-ink-2">{r.role}</td>
                      <td className="py-2 pr-3"><Availability a={r.availability} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-ink-3 mt-2">Model version: <span className="num">{d.model_version ?? "—"}</span></p>
          </section>

          <section aria-labelledby="det-h" className="space-y-3">
            <h2 id="det-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Variables in detail</h2>
            {d.variables.map((r) => (
              <RowCard key={r.id} r={r} open={open.has(r.id)} onToggle={() => toggle(r.id)} />
            ))}
          </section>

          <section className="panel p-4" aria-labelledby="opt-h">
            <h2 id="opt-h" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">Optional credentialed sources</h2>
            <ul className="space-y-2">
              {Object.entries(d.optional_sources).map(([k, v]) => (
                <li key={k} className="text-[12.5px] flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-ink">{k === "copernicus_marine" ? "Copernicus Marine" : k === "copernicus_cds" ? "Copernicus Climate Data Store" : k}</span>
                  <Badge tone={v.status === "configured" ? "good" : "neutral"} className="normal-case tracking-normal">{v.status.replace("_", " ")}</Badge>
                  <span className="text-ink-2">{v.enables}</span>
                  <span className="text-ink-3 num text-[11.5px]">env: {v.variables}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11.5px] text-ink-3 mt-2">Credentials are only used by the offline pipeline; the service never downloads data during a request and never exposes credential values.</p>
          </section>
        </>
      )}
    </div>
  );
}
