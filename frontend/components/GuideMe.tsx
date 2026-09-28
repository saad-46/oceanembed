"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Compass, Presentation, X } from "lucide-react";

const HELP: Record<string, { title: string; body: string; tips: string[] }> = {
  "/overview": { title: "Overview", body: "A snapshot of the platform: how many days are reconstructed, how accurate the model is at 100 m, and quick links into the most useful views.", tips: ["Open a quick-launch card to jump straight to a prepared view.", "Regional cards compare the Bay of Bengal and the Arabian Sea on one day."] },
  "/map": { title: "Ocean Map", body: "This map shows the reconstructed ocean state. Use the depth and date controls to explore how conditions change below the surface.", tips: ["Drag the depth slider — each step is a new layer the model reconstructed.", "Click any ocean cell to open its full temperature profile.", "Green dots are real Argo floats from the held-out year."] },
  "/profiles": { title: "Profiles", body: "Click anywhere on the map to inspect the reconstructed water column — temperature from the surface down to 1000 m, with its uncertainty band.", tips: ["The shaded band is ±1σ: where it is wide, trust the value less.", "Dots are real Argo measurements, when a float was nearby."] },
  "/analysis": { title: "Analysis", body: "Use this workspace to investigate ocean conditions over a region or along a cyclone track. Every number is labelled measured, reconstructed, derived or estimated.", tips: ["Region mode: click two corners on the map to draw a box.", "Cyclone mode: step along the track to see the ocean heat beneath the storm."] },
  "/validation": { title: "Validation", body: "This page compares OceanSight's reconstruction against independent Argo observations from 2023 — a year the model never trained on — and against a simple climatology baseline.", tips: ["Lower RMSE is better; compare the blue line with the orange climatology line.", "The leakage caveat explains the one way the check is not fully independent."] },
  "/insights": { title: "Insights", body: "Cards computed live from the reconstruction for the chosen date, plus a look inside the model's satellite embedding.", tips: ["Change the date to recompute every card.", "Each card links to the screen that shows the underlying field."] },
  "/reports": { title: "Reports", body: "Export a one-page profile report, the raw numbers, validation metrics or a cyclone's heat record — all generated from the same data shown on screen.", tips: ["Set the date and point first, then press Export on any card."] },
  "/methodology": { title: "Methodology", body: "How the data flows from satellites to the reconstructed ocean, how the model is validated, and which claims we do and do not make.", tips: ["Click each pipeline stage to see what happens there."] },
};

export default function GuideMe() {
  const path = usePathname() ?? "";
  const key = Object.keys(HELP).find((k) => path.startsWith(k));
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === path; // closes itself when the route changes
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPath(null);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpenPath(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  if (!key) return null;
  const h = HELP[key];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpenPath(open ? null : path)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-xs rounded-full border border-accent/40 text-accent px-3 py-1 hover:bg-accent/10">
        <Compass size={13} aria-hidden /> <span className="hidden sm:inline">Guide me</span>
      </button>
      {open && (
        <div role="dialog" aria-label={`About ${h.title}`} className="absolute right-0 top-10 z-50 w-[min(340px,calc(100vw-24px))] glass glass-strong p-4 fade-in shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="eyebrow">You are on</div>
              <div className="font-display text-base text-ink mt-0.5">{h.title}</div>
            </div>
            <button onClick={() => setOpenPath(null)} aria-label="Close guide" className="text-ink-3 hover:text-ink">
              <X size={15} />
            </button>
          </div>
          <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">{h.body}</p>
          <ul className="mt-2.5 space-y-1.5">
            {h.tips.map((t) => (
              <li key={t} className="text-[12px] text-ink-3 flex gap-2">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-accent shrink-0" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-line flex flex-wrap gap-2">
            <Link href="/tour" className="text-xs rounded-full bg-accent text-[#04121c] font-semibold px-3 py-1">
              Take the 3-minute tour
            </Link>
            <Link href="/demo" className="text-xs rounded-full border border-line text-ink-2 px-3 py-1 inline-flex items-center gap-1 hover:text-ink">
              <Presentation size={12} /> Presenter demo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
