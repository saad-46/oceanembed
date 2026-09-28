"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { useGrid } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

/**
 * Compact location control for analysis toolbars: typed coordinates plus an on-demand map picker
 * (the map is only mounted while the picker is open).
 */
export default function LocationPicker({ lat, lon, date, onChange }: { lat: number; lon: number; date: string; onChange: (lat: number, lon: number) => void }) {
  const [draft, setDraft] = useState({ lat, lon });
  const [key, setKey] = useState(`${lat}|${lon}`);
  if (key !== `${lat}|${lon}`) {
    // external change (preset, URL): resync the inputs
    setKey(`${lat}|${lon}`);
    setDraft({ lat, lon });
  }
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          onChange(draft.lat, draft.lon);
        }}
      >
        <label className="text-[11px] text-ink-3">
          Lat °N
          <input type="number" step="0.25" min={5} max={30} value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} className="mt-1 w-[76px] block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink" />
        </label>
        <label className="text-[11px] text-ink-3">
          Lon °E
          <input type="number" step="0.25" min={45} max={105} value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })} className="mt-1 w-[76px] block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink" />
        </label>
        <button type="submit" className="rounded-md border border-line-2 text-ink text-sm px-2.5 py-1 hover:border-accent/60">
          Go
        </button>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-sm text-ink-2 hover:text-ink">
          <MapPin size={13} aria-hidden /> Map
        </button>
      </form>
      {open && <Picker lat={lat} lon={lon} date={date} onPick={(la, lo) => (onChange(la, lo), setOpen(false))} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Picker({ lat, lon, date, onPick, onClose }: { lat: number; lon: number; date: string; onPick: (lat: number, lon: number) => void; onClose: () => void }) {
  const { grid, range } = useGrid(date, 0, "temp");
  return (
    <div role="dialog" aria-label="Pick a location on the map" className="absolute z-40 left-0 top-full mt-2 w-[min(420px,calc(100vw-32px))] glass glass-strong p-2 fade-in">
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <span className="text-[12px] text-ink-2">Click an ocean cell · surface temperature on {grid?.date ?? date}</span>
        <button onClick={onClose} aria-label="Close map picker" className="text-ink-3 hover:text-ink">
          <X size={14} />
        </button>
      </div>
      <div className="relative h-56 rounded-md overflow-hidden border border-line">
        <OceanMap minimal raster={grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: "thermal", key: `pick|${grid.date}` } : null} point={{ lat, lon }} onClick={(la, lo) => onPick(+la.toFixed(3), +lo.toFixed(3))} />
      </div>
    </div>
  );
}
