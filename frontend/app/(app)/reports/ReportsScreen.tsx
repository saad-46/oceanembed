"use client";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Crosshair, Download, FileJson, FileSpreadsheet, FileText, ImageDown, Loader2, MapPin, ShieldCheck, Tornado } from "lucide-react";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { API_URL, type CycloneTrack } from "@/lib/api";
import { DEFAULT_DATE, DEFAULT_POINT } from "@/lib/dates";
import { useApi } from "@/lib/useApi";

type ExportState = { s: "idle" } | { s: "busy" } | { s: "done"; bytes: number; at: string } | { s: "error"; msg: string };

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function ReportCard({ icon, title, type, scope, desc, url, filename, state, onExport, children }: { icon: ReactNode; title: string; type: string; scope: string; desc: string; url?: string; filename?: string; state?: ExportState; onExport?: () => void; children?: ReactNode }) {
  const st = state ?? { s: "idle" };
  return (
    <article className="panel p-4 flex flex-col" aria-busy={st.s === "busy"}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm text-ink font-medium">{title}</h3>
            <Badge tone="neutral">{type}</Badge>
          </div>
          <div className="text-[11px] text-ink-3 num mt-0.5 truncate">{scope}</div>
        </div>
      </div>
      <p className="text-[12.5px] text-ink-2 mt-3 leading-relaxed flex-1">{desc}</p>
      <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-2 min-h-[36px]" aria-live="polite">
        <div className="text-[11px] flex items-center gap-1.5">
          {st.s === "idle" && <span className="text-ink-3">{onExport ? "Ready to generate" : "Opens in the platform"}</span>}
          {st.s === "busy" && (
            <span className="text-accent flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" /> Generating from the reconstruction…
            </span>
          )}
          {st.s === "done" && (
            <span className="text-good flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Downloaded · {kb(st.bytes)} · {st.at}
            </span>
          )}
          {st.s === "error" && (
            <span className="text-bad flex items-center gap-1.5">
              <AlertCircle size={13} /> {st.msg}
            </span>
          )}
        </div>
        {children ??
          (onExport && (
            <Button size="sm" variant={st.s === "done" ? "secondary" : "primary"} onClick={onExport} disabled={st.s === "busy"} icon={<Download size={13} />} ariaLabel={`Export ${title}${filename ? ` as ${filename}` : ""}`}>
              {st.s === "done" ? "Again" : st.s === "error" ? "Retry" : "Export"}
            </Button>
          ))}
      </div>
      {url && <span className="sr-only">{url}</span>}
    </article>
  );
}

export default function ReportsScreen() {
  const sp = useSearchParams();
  const [date, setDate] = useState(sp.get("date") || DEFAULT_DATE);
  const [lat, setLat] = useState(Number(sp.get("lat") ?? DEFAULT_POINT.lat));
  const [lon, setLon] = useState(Number(sp.get("lon") ?? DEFAULT_POINT.lon));
  const [pdfFailed, setPdfFailed] = useState(false);
  const [states, setStates] = useState<Record<string, ExportState>>({});
  const q = `${date}?lat=${lat}&lon=${lon}`;
  const pdf = `${API_URL}/v1/report/${q}&format=pdf`;
  const csv = `${API_URL}/v1/report/${q}&format=csv`;
  const valJson = `${API_URL}/v1/validation/summary?split=test`;
  const mocha = useApi<{ tracks: CycloneTrack[] }>("/v1/cyclones").data?.tracks.find((t) => t.name.includes("Mocha"));
  const fuelJson = mocha ? `${API_URL}/v1/cyclones/${mocha.id}/fuel?lead_days=2` : null;
  const pointKey = `${date}|${lat}|${lon}`;
  const stateOf = (id: string, keyed = true) => states[keyed ? `${id}|${pointKey}` : id];

  const run = async (id: string, url: string, filename: string, keyed = true) => {
    const k = keyed ? `${id}|${pointKey}` : id;
    setStates((s) => ({ ...s, [k]: { s: "busy" } }));
    try {
      const r = await fetch(url);
      if (!r.ok) {
        let msg = `Export failed (HTTP ${r.status})`;
        try {
          const j = await r.json();
          if (j?.detail) msg = typeof j.detail === "string" ? j.detail : msg;
        } catch {}
        throw new Error(msg);
      }
      const blob = await r.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      setStates((s) => ({ ...s, [k]: { s: "done", bytes: blob.size, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } }));
    } catch (e) {
      const msg = e instanceof TypeError ? "API unreachable — is the backend running?" : e instanceof Error ? e.message : "Export failed";
      setStates((s) => ({ ...s, [k]: { s: "error", msg } }));
    }
  };

  const tag = `${date}_${lat.toFixed(2)}N_${lon.toFixed(2)}E`;

  return (
    <div className="px-4 md:px-7 py-6 max-w-[1500px] w-full mx-auto space-y-6">
      <div>
        <div className="eyebrow">Reports & export</div>
        <h2 className="font-display text-2xl md:text-[28px] mt-1">Take the ocean with you</h2>
        <p className="text-sm text-ink-2 mt-1.5 max-w-3xl leading-relaxed">
          Every export is generated on demand from the same reconstruction you see on screen, and every file carries its data source and the validation caveat.
        </p>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-5">
        <Card title="Report location" icon={<Crosshair size={14} />} className="h-fit">
          <div className="space-y-3">
            <label className="block text-[11px] text-ink-3">
              Date
              <input type="date" value={date} min="2019-01-01" max="2023-12-31" onChange={(e) => e.target.value && (setDate(e.target.value), setPdfFailed(false))} className="mt-1 w-full num bg-bg border border-line rounded-md px-2.5 py-1.5 text-sm text-ink [color-scheme:dark]" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink-3">
                Latitude (5–30°N)
                <input type="number" step="0.25" min={5} max={30} value={lat} onChange={(e) => (setLat(Number(e.target.value)), setPdfFailed(false))} className="mt-1 w-full num bg-bg border border-line rounded-md px-2.5 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                Longitude (45–105°E)
                <input type="number" step="0.25" min={45} max={105} value={lon} onChange={(e) => (setLon(Number(e.target.value)), setPdfFailed(false))} className="mt-1 w-full num bg-bg border border-line rounded-md px-2.5 py-1.5 text-sm text-ink" />
              </label>
            </div>
            <Button variant="secondary" size="sm" href={`/map?date=${date}&lat=${lat}&lon=${lon}`} icon={<MapPin size={13} />}>
              Open this point on the map
            </Button>
          </div>
        </Card>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <ReportCard
            icon={<FileText size={17} />}
            title="Profile report"
            type="PDF"
            scope={`${date} · ${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`}
            desc="One page: reconstructed profile with ±σ, climatology, nearest Argo float, TCHP/MLD/D20/D26 and the validation caveat."
            filename={`oceansight_profile_${tag}.pdf`}
            state={stateOf("pdf")}
            onExport={() => run("pdf", pdf, `oceansight_profile_${tag}.pdf`)}
          />
          <ReportCard
            icon={<FileSpreadsheet size={17} />}
            title="Profile data"
            type="CSV"
            scope={`${date} · ${lat.toFixed(2)}°N ${lon.toFixed(2)}°E · 15 depths`}
            desc="Depth-by-depth temperature, uncertainty and climatology for the same point — ready for Excel, Python or GIS."
            filename={`oceansight_profile_${tag}.csv`}
            state={stateOf("csv")}
            onExport={() => run("csv", csv, `oceansight_profile_${tag}.csv`)}
          />
          <ReportCard
            icon={<ImageDown size={17} />}
            title="Map snapshot"
            type="PNG"
            scope="Current map view · any layer and depth"
            desc="Exports exactly what the map shows — field, legend and overlays — from the Ocean Map control panel."
          >
            <Button size="sm" variant="secondary" href={`/map?date=${date}&depth=100&lat=${lat}&lon=${lon}`} icon={<MapPin size={13} />}>
              Go to map
            </Button>
          </ReportCard>
          <ReportCard
            icon={<ShieldCheck size={17} />}
            title="Validation metrics"
            type="JSON"
            scope="Held-out 2023 Argo · per depth"
            desc="RMSE, bias, correlation and skill vs climatology per depth, baseline comparison and uncertainty calibration."
            filename="oceansight_validation_2023.json"
            state={stateOf("val", false)}
            onExport={() => run("val", valJson, "oceansight_validation_2023.json", false)}
          />
          <ReportCard
            icon={<Tornado size={17} />}
            title="Cyclone Mocha fuel"
            type="JSON"
            scope="IBTrACS track · ocean state 2 days before"
            desc="Every track point with observed position and wind, plus reconstructed SST and derived TCHP / D26 beneath it."
            filename="oceansight_mocha_fuel.json"
            state={stateOf("fuel", false)}
            onExport={fuelJson ? () => run("fuel", fuelJson, "oceansight_mocha_fuel.json", false) : undefined}
          />
          <ReportCard icon={<FileJson size={17} />} title="API access" type="REST" scope={`${API_URL}/docs`} desc="All of the above — and gridded fields — are available programmatically from the documented REST API (OpenAPI).">
            <Button size="sm" variant="secondary" href={`${API_URL}/docs`} external>
              Open docs
            </Button>
          </ReportCard>
        </div>
      </div>

      <Card title="Profile report preview" icon={<FileText size={14} />} right={<a href={pdf} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Open PDF in new tab ↗</a>}>
        {pdfFailed ? (
          <Notice>The report could not be generated — the point may be on land or outside 5–30°N, 45–105°E. Pick an ocean point, or try the CSV export.</Notice>
        ) : (
          <object key={pdf} data={pdf} type="application/pdf" className="w-full h-[72vh] rounded-lg border border-line bg-white" aria-label="PDF report preview" onError={() => setPdfFailed(true)}>
            <p className="text-sm text-ink-2 p-4">
              Inline PDF preview isn&apos;t supported in this browser — <a className="text-accent" href={pdf}>download the PDF</a> or the <a className="text-accent" href={csv}>CSV</a>.
            </p>
          </object>
        )}
      </Card>
    </div>
  );
}
