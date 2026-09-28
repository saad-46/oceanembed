"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Download, FileJson, FileSpreadsheet, FileText, Loader2, ShieldCheck, Tornado } from "lucide-react";
import LocationPicker from "@/components/LocationPicker";
import { Button, PageHeader, Provenance } from "@/components/ui";
import { API_URL, type CycloneTrack, type Meta } from "@/lib/api";
import { DEFAULT_DATE, DEFAULT_POINT, STANDARD_DEPTHS } from "@/lib/dates";
import { useApi } from "@/lib/useApi";

type ExportState = { s: "idle" } | { s: "busy" } | { s: "done"; bytes: number; at: string; url?: string } | { s: "error"; msg: string };
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function fetchFile(url: string): Promise<Blob> {
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw new Error("The OceanSight service could not be reached. Check your connection and try again.");
  }
  if (!r.ok) {
    let msg = `The report could not be generated (HTTP ${r.status}).`;
    try {
      const j = await r.json();
      if (typeof j?.detail === "string") msg = j.detail;
    } catch {}
    throw new Error(msg);
  }
  return r.blob();
}

const save = (blob: Blob, filename: string) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
};

function StateLine({ st, idle }: { st: ExportState; idle: string }) {
  return (
    <span className="text-[12px] flex items-center gap-1.5" aria-live="polite">
      {st.s === "idle" && <span className="text-ink-3">{idle}</span>}
      {st.s === "busy" && (
        <span className="text-accent flex items-center gap-1.5">
          <Loader2 size={13} className="animate-spin" /> Preparing…
        </span>
      )}
      {st.s === "done" && (
        <span className="text-good flex items-center gap-1.5">
          <CheckCircle2 size={13} /> Ready · {kb(st.bytes)} · {st.at}
        </span>
      )}
      {st.s === "error" && (
        <span className="text-bad flex items-center gap-1.5">
          <AlertCircle size={13} /> {st.msg}
        </span>
      )}
    </span>
  );
}

function ExportRow({ icon, title, detail, children }: { icon: ReactNode; title: string; detail: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="text-ink-3">{icon}</span>
      <div className="flex-1 min-w-[200px]">
        <div className="text-[13.5px] text-ink">{title}</div>
        <div className="text-[12px] text-ink-3">{detail}</div>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </li>
  );
}

export default function ReportsScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const date = sp.get("date") || DEFAULT_DATE;
  const lat = Number(sp.get("lat") ?? DEFAULT_POINT.lat);
  const lon = Number(sp.get("lon") ?? DEFAULT_POINT.lon);
  const rawDepth = sp.get("depth");
  const depth = rawDepth !== null && STANDARD_DEPTHS.includes(Number(rawDepth)) ? Number(rawDepth) : 100; // default: 100 m
  const setQ = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams({ date, lat: lat.toFixed(3), lon: lon.toFixed(3), depth: String(depth) });
    for (const [k, v] of Object.entries(patch)) q.set(k, String(v));
    router.replace(`/reports?${q.toString()}`, { scroll: false });
  };
  const meta = useApi<Meta>("/v1/meta").data;
  const mocha = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones").data?.tracks.find((t) => t.name.includes("Mocha"));
  const [states, setStates] = useState<Record<string, ExportState>>({});
  const investigation = `${date}|${lat}|${lon}|${depth}`;
  const st = (id: string, keyed = true): ExportState => states[keyed ? `${id}|${investigation}` : id] ?? { s: "idle" };
  const tag = `${date}_${lat.toFixed(2)}N_${lon.toFixed(2)}E`;
  const q = `${date}?lat=${lat}&lon=${lon}`;

  // a new investigation invalidates the previous preview
  const report = st("pdf");
  const previewUrl = report.s === "done" ? report.url : undefined;
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const run = async (id: string, url: string, filename: string, opts: { keyed?: boolean; preview?: boolean } = {}) => {
    const k = opts.keyed === false ? id : `${id}|${investigation}`;
    setStates((s) => ({ ...s, [k]: { s: "busy" } }));
    try {
      const blob = await fetchFile(url);
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (opts.preview) setStates((s) => ({ ...s, [k]: { s: "done", bytes: blob.size, at, url: URL.createObjectURL(blob) } }));
      else {
        save(blob, filename);
        setStates((s) => ({ ...s, [k]: { s: "done", bytes: blob.size, at } }));
      }
    } catch (e) {
      setStates((s) => ({ ...s, [k]: { s: "error", msg: e instanceof Error ? e.message : "The file could not be generated." } }));
    }
  };

  const pdfUrl = `${API_URL}/v1/report/${q}&depth=${depth}&format=pdf`;
  const contents: [string, "reconstructed" | "estimated" | "baseline" | "derived" | "measured"][] = [
    ["Temperature profile, 0–1000 m", "reconstructed"],
    [`Map of the field at ${depth} m around the location`, "reconstructed"],
    ["±σ uncertainty at each depth", "estimated"],
    ["Seasonal climatology for comparison", "baseline"],
    ["MLD, D20, D26 and heat content (TCHP)", "derived"],
    ["Nearest Argo profile, when one is within 100 km and ±3 days", "measured"],
  ];

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1300px] w-full mx-auto">
      <PageHeader group="Report" title="Reports" description="Turn an investigation into a document. Choose the location, date and map depth; the report is generated from the same reconstruction you explore in OceanSight." />

      <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4 items-start">
        <section className="panel p-4 space-y-4" aria-labelledby="inv" data-guide="report-builder">
          <h2 id="inv" className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Investigation</h2>
          <div className="space-y-3">
            <div>
              <div className="text-[12px] text-ink-2 mb-1">Location</div>
              <LocationPicker lat={lat} lon={lon} date={date} onChange={(la, lo) => setQ({ lat: la.toFixed(3), lon: lo.toFixed(3) })} />
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="text-[12px] text-ink-2">
                Date
                <input type="date" min="2019-01-01" max="2023-12-31" value={date} onChange={(e) => e.target.value && setQ({ date: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink [color-scheme:dark]" />
              </label>
              <label className="text-[12px] text-ink-2">
                Map depth
                <select value={depth} onChange={(e) => setQ({ depth: e.target.value })} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink">
                  {STANDARD_DEPTHS.map((z) => (
                    <option key={z} value={z}>
                      {z} m
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div>
            <div className="text-[12px] text-ink-2 mb-1.5">The report includes</div>
            <ul className="space-y-1.5">
              {contents.map(([t, kind]) => (
                <li key={t} className="flex items-start justify-between gap-3 text-[12.5px] text-ink-2">
                  <span>{t}</span>
                  <Provenance kind={kind} className="shrink-0" />
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-ink-3 mt-2">
              Plus investigation metadata, model {meta?.production_model ?? "version"}, data period {meta ? `${meta.period.start} – ${meta.period.end}` : "2019–2023"}, method notes and the validation caveat.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-line">
            <Button onClick={() => run("pdf", pdfUrl, `oceansight_report_${tag}.pdf`, { preview: true })} disabled={report.s === "busy"} icon={<FileText size={15} />}>
              {report.s === "done" ? "Regenerate report" : "Generate report"}
            </Button>
            <StateLine st={report} idle="PDF document" />
          </div>
        </section>

        <section className="panel overflow-hidden min-h-[480px] flex flex-col" aria-label="Report preview">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-line">
            <span className="text-[13px] text-ink">Preview</span>
            {previewUrl && (
              <a href={previewUrl} download={`oceansight_report_${tag}.pdf`} className="inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:underline">
                <Download size={13} /> Download PDF
              </a>
            )}
          </div>
          {previewUrl ? (
            <object data={previewUrl} type="application/pdf" className="w-full flex-1 min-h-[70vh] bg-white" aria-label="Generated report">
              <p className="p-4 text-sm text-ink-2">
                This browser cannot show PDFs inline —{" "}
                <a className="text-accent" href={previewUrl} download={`oceansight_report_${tag}.pdf`}>
                  download the report
                </a>
                .
              </p>
            </object>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-[13px] text-ink-3">
              {report.s === "busy" ? "Preparing the report from the reconstruction…" : report.s === "error" ? "The report could not be generated — see the message on the left." : "Set up the investigation and generate the report to preview it here."}
            </div>
          )}
        </section>
      </div>

      <section className="panel px-4 py-2" aria-labelledby="exports">
        <h2 id="exports" className="text-[11px] uppercase tracking-[0.12em] text-ink-3 pt-2">Data exports</h2>
        <ul className="divide-y divide-line">
          <ExportRow icon={<FileSpreadsheet size={16} />} title="Profile values (CSV)" detail={`Temperature, ±σ, climatology and Argo by depth · ${date} · ${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`}>
            <StateLine st={st("csv")} idle="" />
            <Button size="sm" variant="secondary" onClick={() => run("csv", `${API_URL}/v1/report/${q}&format=csv`, `oceansight_profile_${tag}.csv`)} disabled={st("csv").s === "busy"} icon={<Download size={13} />}>
              CSV
            </Button>
          </ExportRow>
          <ExportRow icon={<ShieldCheck size={16} />} title="Validation metrics (JSON)" detail="Per-depth RMSE, bias, correlation and skill against held-out 2023 Argo; uncertainty calibration">
            <StateLine st={st("val", false)} idle="" />
            <Button size="sm" variant="secondary" onClick={() => run("val", `${API_URL}/v1/validation/summary?split=test`, "oceansight_validation_2023.json", { keyed: false })} disabled={st("val", false).s === "busy"} icon={<Download size={13} />}>
              JSON
            </Button>
          </ExportRow>
          <ExportRow icon={<Tornado size={16} />} title="Cyclone Mocha track and ocean heat (JSON)" detail="Observed positions and winds (IBTrACS) with reconstructed SST and derived TCHP / D26 along the track">
            <StateLine st={st("fuel", false)} idle="" />
            <Button size="sm" variant="secondary" onClick={() => mocha && run("fuel", `${API_URL}/v1/cyclones/${mocha.id}/fuel?lead_days=2`, "oceansight_mocha_track.json", { keyed: false })} disabled={!mocha || st("fuel", false).s === "busy"} icon={<Download size={13} />}>
              JSON
            </Button>
          </ExportRow>
          <ExportRow icon={<FileJson size={16} />} title="API" detail="Every field, profile, section and timeline is available from the documented REST API (OpenAPI)">
            <Button size="sm" variant="ghost" href={`${API_URL}/docs`} external>
              Open API documentation
            </Button>
          </ExportRow>
        </ul>
      </section>
    </div>
  );
}
