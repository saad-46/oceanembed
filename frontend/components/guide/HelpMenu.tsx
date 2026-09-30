"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, CircleHelp, Compass, X } from "lucide-react";
import { stepHref } from "@/lib/guide";

/** Plain-language help for each screen ("Explain this screen"). */
export const SCREEN_HELP: Record<string, { title: string; body: string; tips: string[] }> = {
  "/map": { title: "Ocean map", body: "The reconstructed ocean state for one day. Choose what to show, how deep, and when; click any ocean cell to open its water column.", tips: ["Depth steps are separate reconstructed layers — satellites only observe the surface.", "Green dots are measured Argo profiles within ±3 days.", "The bar at the bottom states what the colours are, where they come from, and the data version."] },
  "/profiles": { title: "Profile", body: "One water column from the surface to 1000 m: the reconstruction with its uncertainty band, compared with the seasonal climatology and nearby measured Argo profiles.", tips: ["Where the shaded band is wide, the reconstruction is less certain.", "Derived values (MLD, D20, D26, TCHP) are computed from the reconstructed column."] },
  "/timeline": { title: "Timeline", body: "One point followed through time: temperature by depth and day, with the mixed layer and the 20 °C / 26 °C depths drawn on top.", tips: ["Click a day to open its profile; arrow keys move the selected day.", "Drag across the chart to zoom; long ranges are subsampled."] },
  "/section": { title: "Section", body: "A slice through the ocean along a line: distance across, depth down, colour = temperature, anomaly or uncertainty on the chosen day.", tips: ["Longitude transects run west–east; latitude transects south–north.", "Click a column to open its profile or follow it through time."] },
  "/analysis": { title: "Events & regions", body: "Upper-ocean conditions over a region, or along a cyclone's observed track. Every value is labelled measured, reconstructed, derived or estimated.", tips: ["Region: click two corners on the map to draw a box.", "Cyclone: step along the track; the gauge shows heat content beneath the storm."] },
  "/validation": { title: "Validation", body: "How the reconstruction compares with independent observations: Argo profiles from 2023 (not used in training), a monthly EN4 cross-check and a climatology baseline.", tips: ["Lower RMSE is better; compare with the climatology line.", "Read the caveat: the training target assimilates Argo."] },
  "/insights": { title: "Daily summary", body: "Summaries computed from the reconstruction for one date, and a look at the model's internal representation.", tips: ["Change the date to recompute every summary."] },
  "/reports": { title: "Reports", body: "Turn an investigation into a document: choose the location, date and depth, then generate a PDF or export the numbers.", tips: ["Reports include provenance, uncertainty, observations and model version."] },
  "/methodology": { title: "Methodology", body: "How OceanSight works: data, processing, reconstruction, derived products, validation, limitations and version.", tips: [] },
  "/stratification": { title: "Stratification", body: "Where temperature and salinity change fastest with depth at one point: the thermocline from the reconstruction, and the thermocline, halocline and density mixed layer from the nearest measured Argo profile.", tips: ["MLD, thermocline, D20 and D26 are different diagnostics and need not coincide.", "Quality flags say when the vertical resolution or a weak gradient limits the answer.", "Salinity is never reconstructed: it comes from measured profiles or the optional reanalysis."] },
  "/ts": { title: "T-S analysis", body: "Temperature against salinity for every depth of the nearest measured profile, with density contours computed using TEOS-10.", tips: ["Each point is one 5 m depth bin, coloured by depth.", "Hover or use the arrow keys to read values; the data table lists every point."] },
  "/3d": { title: "3-D ocean", body: "A downsampled point cloud of the reconstruction for orientation: latitude, longitude and depth. Use the section and profile views for exact values.", tips: ["Drag to rotate, scroll to zoom, click a point to open its water column.", "Depth is stretched; the exaggeration slider changes it."] },
  "/data-quality": { title: "Data quality", body: "Completeness and quality control of the inputs and observations, computed from the pipeline's own QC records.", tips: ["Status thresholds are listed at the bottom of the page."] },
  "/provenance": { title: "Data sources & lineage", body: "Every variable with its classification, source, resolution, coverage, processing and where it is shown.", tips: ["Open 'How this value was produced' for the full chain from source to screen."] },
};

export default function HelpMenu() {
  const path = usePathname() ?? "";
  const key = Object.keys(SCREEN_HELP).find((k) => path.startsWith(k));
  const h = key ? SCREEN_HELP[key] : null;
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === path; // closes on navigation
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenPath(null);
        btn.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpenPath(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        onClick={() => setOpenPath(open ? null : path)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Help and Guided Exploration"
        title="Help and Guided Exploration"
        className="inline-flex items-center gap-1.5 text-xs rounded-full border border-line-2 text-ink-2 px-2.5 py-1 hover:text-ink hover:border-accent/50"
      >
        <CircleHelp size={14} aria-hidden /> <span className="hidden sm:inline" aria-hidden>Guide me</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Help" className="absolute right-0 top-10 z-50 w-[min(340px,calc(100vw-24px))] glass glass-strong p-4 fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider text-ink-3">{h ? "This screen" : "Help"}</div>
            <button onClick={() => setOpenPath(null)} aria-label="Close help" className="text-ink-3 hover:text-ink">
              <X size={15} />
            </button>
          </div>
          {h && (
            <>
              <div className="font-display text-base text-ink mt-0.5">{h.title}</div>
              <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed">{h.body}</p>
              {h.tips.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {h.tips.map((t) => (
                    <li key={t} className="text-[12px] text-ink-3 flex gap-2">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-accent shrink-0" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="mt-3 pt-3 border-t border-line grid gap-1.5">
            <Link href={stepHref(0)} className="flex items-center gap-2 text-[13px] text-ink hover:text-accent">
              <Compass size={14} className="text-accent" aria-hidden /> Guided Exploration
              <span className="text-[11.5px] text-ink-3">· 8 short steps over the real app, plus optional advanced steps</span>
            </Link>
            <Link href="/methodology" className="flex items-center gap-2 text-[13px] text-ink hover:text-accent">
              <BookOpen size={14} className="text-accent" aria-hidden /> Methodology &amp; data sources
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
