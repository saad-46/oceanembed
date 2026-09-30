"use client";
/**
 * OceanSight Investigation Point: the coordinate and day under study, the nearest measured observation
 * (if one exists) and the analyses available for it. It is a grid coordinate, not a physical station.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Box, Copy, Droplets, FileText, History, Layers, ScanLine, Waves } from "lucide-react";
import Explain from "@/components/Explain";
import { Provenance } from "@/components/ui";
import type { ArgoRef } from "@/lib/api";
import { profileHref, stratificationHref, tsHref, volumeHref } from "@/lib/analysis";
import { coordText, isSaved, removePoint, savePoint } from "@/lib/investigation";
import { sectionFromMap, timelineHref } from "@/lib/ocean";

export type AnalysisLink = "profile" | "timeline" | "section" | "stratification" | "ts" | "3d" | "report";

export default function InvestigationPoint({
  lat,
  lon,
  date,
  depth,
  observation,
  observationNote,
  exclude = [],
  compact = false,
}: {
  lat: number;
  lon: number;
  date: string;
  depth?: number;
  observation?: ArgoRef | null;
  observationNote?: string;
  exclude?: AnalysisLink[];
  compact?: boolean;
}) {
  const p = { lat, lon, date };
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const f = requestAnimationFrame(() => setSaved(isSaved(p)));
    return () => cancelAnimationFrame(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, date]);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2200);
  };
  const toggleSave = () => {
    const ok = saved ? removePoint(p) : savePoint({ ...p, depth });
    if (!ok) return flash("Saving needs browser storage, which is unavailable here.");
    setSaved(!saved);
    flash(saved ? "Removed from saved points" : "Saved in this browser");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      flash("Coordinates copied");
    } catch {
      flash(`Copy unavailable — ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }
  };
  const links: { id: AnalysisLink; href: string; label: string; icon: typeof Waves }[] = [
    { id: "profile", href: profileHref(p), label: "Profile", icon: Waves },
    { id: "timeline", href: timelineHref({ lat, lon, date }), label: "Timeline", icon: History },
    { id: "section", href: sectionFromMap(date, lat, lon), label: "Section", icon: ScanLine },
    { id: "stratification", href: stratificationHref(p), label: "Stratification", icon: Layers },
    { id: "ts", href: tsHref(p), label: "T-S analysis", icon: Droplets },
    { id: "3d", href: volumeHref(p), label: "3-D", icon: Box },
    { id: "report", href: `/reports?date=${date}&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&depth=${depth ?? 100}`, label: "Report", icon: FileText },
  ];
  const btn = "inline-flex items-center gap-1.5 text-[12px] rounded-md border border-line px-2 py-1 text-ink-2 hover:text-ink hover:border-line-2";
  return (
    <section aria-label="Investigation point" className={compact ? "space-y-2" : "panel px-4 py-3 space-y-2.5"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-ink-3 flex items-center gap-1">
            OceanSight investigation point <Explain term="investigation_point" />
          </div>
          <dl className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[12.5px]">
            <div className="flex gap-1.5">
              <dt className="text-ink-3">Lat</dt>
              <dd className="num text-ink">{lat.toFixed(3)}°N</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-3">Lon</dt>
              <dd className="num text-ink">{lon.toFixed(3)}°E</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-3">Date</dt>
              <dd className="num text-ink">{date}</dd>
            </div>
            {depth !== undefined && (
              <div className="flex gap-1.5">
                <dt className="text-ink-3">Depth</dt>
                <dd className="num text-ink">{depth} m</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={toggleSave} className={btn} aria-pressed={saved} aria-label={saved ? `Remove ${coordText(lat, lon)} from saved points` : `Save ${coordText(lat, lon)} in this browser`}>
            {saved ? <BookmarkCheck size={13} className="text-accent" aria-hidden /> : <Bookmark size={13} aria-hidden />} {saved ? "Saved" : "Save"}
          </button>
          <button type="button" onClick={copy} className={btn} aria-label="Copy coordinates">
            <Copy size={13} aria-hidden /> Copy
          </button>
        </div>
      </div>
      {msg && (
        <p className="text-[11.5px] text-accent" role="status">
          {msg}
        </p>
      )}
      {observation !== undefined && (
        <p className="text-[12px] text-ink-2 leading-relaxed">
          {observation ? (
            <>
              <span className="text-ink-3">Nearest observation: </span>
              <Provenance kind="measured" source={`Argo ${observation.platform_number} · cycle ${observation.cycle_number}`} lineage="argo" /> ·{" "}
              <span className="num">{observation.distance_km} km</span> · <span className="num">{observation.profile_date.slice(0, 10)}</span>
              {observation.date_offset_days !== 0 && <span className="num"> ({observation.date_offset_days > 0 ? "+" : ""}{observation.date_offset_days} d)</span>}
              {observation.independent ? " · held-out year" : " · training-year float"}
            </>
          ) : (
            <span className="text-ink-3">{observationNote ?? "No measured profile nearby."}</span>
          )}
        </p>
      )}
      <nav aria-label="Analyses for this point" className="flex flex-wrap gap-1.5">
        {links
          .filter((l) => !exclude.includes(l.id))
          .map(({ id, href, label, icon: Icon }) => (
            <Link key={id} href={href} className={btn}>
              <Icon size={13} aria-hidden /> {label}
            </Link>
          ))}
      </nav>
    </section>
  );
}
