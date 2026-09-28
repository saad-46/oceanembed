"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Card, Notice } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { DEFAULT_DATE, DEFAULT_POINT } from "@/lib/dates";

export default function ReportsScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const [date, setDate] = useState(sp.get("date") || DEFAULT_DATE);
  const [lat, setLat] = useState(Number(sp.get("lat") ?? DEFAULT_POINT.lat));
  const [lon, setLon] = useState(Number(sp.get("lon") ?? DEFAULT_POINT.lon));
  const [pdfFailed, setPdfFailed] = useState(false);
  const q = `${date}?lat=${lat}&lon=${lon}`;
  const pdf = `${API_URL}/v1/report/${q}&format=pdf`;
  const csv = `${API_URL}/v1/report/${q}&format=csv`;

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1400px] w-full mx-auto grid lg:grid-cols-3 gap-4">
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-2xl">Reports &amp; export</h1>
          <p className="text-sm text-ink-2 mt-1">A one-page profile report for any ocean point and day: reconstruction, uncertainty, climatology, nearest Argo float, derived products and the validation caveat.</p>
        </div>
        <Card title="Location">
          <div className="space-y-3">
            <label className="block text-[11px] text-ink-3">
              Date
              <input type="date" value={date} min="2019-01-01" max="2023-12-31" onChange={(e) => e.target.value && (setDate(e.target.value), setPdfFailed(false))} className="mt-1 w-full num bg-bg border border-line rounded px-2 py-1 text-sm text-ink [color-scheme:dark]" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink-3">
                Latitude (5–30)
                <input type="number" step="0.25" min={5} max={30} value={lat} onChange={(e) => (setLat(Number(e.target.value)), setPdfFailed(false))} className="mt-1 w-full num bg-bg border border-line rounded px-2 py-1 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                Longitude (45–105)
                <input type="number" step="0.25" min={45} max={105} value={lon} onChange={(e) => (setLon(Number(e.target.value)), setPdfFailed(false))} className="mt-1 w-full num bg-bg border border-line rounded px-2 py-1 text-sm text-ink" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={pdf} className="text-sm bg-accent text-bg rounded px-4 py-1.5">
                Download PDF
              </a>
              <a href={csv} className="text-sm border border-line rounded px-4 py-1.5 text-ink-2 hover:text-ink">
                Download CSV
              </a>
              <button onClick={() => router.push(`/map?date=${date}&lat=${lat}&lon=${lon}`)} className="text-sm border border-line rounded px-4 py-1.5 text-ink-2 hover:text-ink">
                Open on map
              </button>
            </div>
            <p className="text-[11px] text-ink-3">Map snapshots (PNG) are exported from the Ocean Map screen (sidebar → &ldquo;Export map PNG&rdquo;).</p>
          </div>
        </Card>
      </div>
      <Card className="lg:col-span-2" title="PDF preview" right={<a href={pdf} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Open PDF in new tab ↗</a>}>
        {pdfFailed ? (
          <Notice>Export failed or the point is on land / outside the domain — try CSV, or pick an ocean point.</Notice>
        ) : (
          <object key={pdf} data={pdf} type="application/pdf" className="w-full h-[78vh] rounded border border-line bg-white" aria-label="PDF report preview" onError={() => setPdfFailed(true)}>
            <p className="text-sm text-ink-2 p-4">
              Inline PDF preview isn&apos;t supported in this browser — <a className="text-accent" href={pdf}>download the PDF</a> or the <a className="text-accent" href={csv}>CSV</a>.
            </p>
          </object>
        )}
      </Card>
    </div>
  );
}
