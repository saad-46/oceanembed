"use client";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import ProfilePanel from "@/components/ProfilePanel";
import { Button, Card, Skeleton } from "@/components/ui";
import { DEFAULT_DATE, DEFAULT_POINT } from "@/lib/dates";
import { useGrid } from "@/lib/useGrid";

const OceanMap = dynamic(() => import("@/components/OceanMap"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

const PRESETS = [
  { label: "Pre-Mocha · Bay of Bengal", date: "2023-05-11", lat: 15, lon: 88 },
  { label: "Biparjoy · Arabian Sea", date: "2023-06-06", lat: 15, lon: 66 },
  { label: "Winter · W. Arabian Sea", date: "2022-01-15", lat: 10, lon: 60 },
  { label: "Monsoon · Andaman Sea", date: "2021-08-01", lat: 11, lon: 95 },
];

export default function ProfilesScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const date = sp.get("date") || DEFAULT_DATE;
  const lat = Number(sp.get("lat") ?? DEFAULT_POINT.lat);
  const lon = Number(sp.get("lon") ?? DEFAULT_POINT.lon);
  const [draft, setDraft] = useState({ date, lat, lon });
  const go = (d: string, la: number, lo: number) => {
    setDraft({ date: d, lat: la, lon: lo });
    router.replace(`/profiles?date=${d}&lat=${la.toFixed(3)}&lon=${lo.toFixed(3)}`, { scroll: false });
  };
  const { grid, range } = useGrid(date, 0, "temp");

  return (
    <div className="px-4 md:px-7 py-6 max-w-[1500px] w-full mx-auto grid xl:grid-cols-[380px_1fr] gap-5">
      <div className="space-y-4">
        <Card title="Location & date" icon={<Crosshair size={14} />}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              go(draft.date, draft.lat, draft.lon);
            }}
          >
            <label className="block text-[11px] text-ink-3">
              Date
              <input type="date" min="2019-01-01" max="2023-12-31" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2.5 py-1.5 text-sm text-ink [color-scheme:dark]" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-ink-3">
                Latitude (5–30°N)
                <input type="number" step="0.25" min={5} max={30} value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2.5 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-[11px] text-ink-3">
                Longitude (45–105°E)
                <input type="number" step="0.25" min={45} max={105} value={draft.lon} onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })} className="mt-1 w-full num bg-bg border border-line rounded-md px-2.5 py-1.5 text-sm text-ink" />
              </label>
            </div>
            <button type="submit" className="w-full rounded-lg bg-accent text-[#04121c] text-sm font-semibold py-2 hover:brightness-110">
              Reconstruct profile
            </button>
          </form>
        </Card>
        <Card title="Pick on the map" icon={<MapPin size={14} />}>
          <div className="relative h-56 rounded-md overflow-hidden border border-line">
            <OceanMap
              minimal
              raster={grid && range ? { values: grid.grid.values, vmin: range[0], vmax: range[1], ramp: "thermal", key: `pf|${grid.date}` } : null}
              point={{ lat, lon }}
              onClick={(la, lo) => go(date, la, lo)}
            />
          </div>
          <p className="text-[11px] text-ink-3 mt-2">Surface temperature on {grid?.date ?? date}. Click any ocean cell.</p>
        </Card>
        <Card title="Presets">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.label} variant="secondary" size="sm" onClick={() => go(p.date, p.lat, p.lon)}>
                {p.label}
              </Button>
            ))}
          </div>
        </Card>
      </div>
      <section className="panel min-h-[640px] overflow-hidden" aria-label="Temperature profile">
        <ProfilePanel date={date} lat={lat} lon={lon} wide />
      </section>
    </div>
  );
}
