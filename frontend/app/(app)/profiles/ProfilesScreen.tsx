"use client";
import { useRouter, useSearchParams } from "next/navigation";
import LocationPicker from "@/components/LocationPicker";
import ProfilePanel from "@/components/ProfilePanel";
import { PageHeader } from "@/components/ui";
import { DEFAULT_DATE, DEFAULT_POINT } from "@/lib/dates";

const EXAMPLES = [
  { label: "Bay of Bengal · 11 May 2023", date: "2023-05-11", lat: 15, lon: 88 },
  { label: "Arabian Sea · 6 Jun 2023", date: "2023-06-06", lat: 15, lon: 66 },
  { label: "Western Arabian Sea · Jan 2022", date: "2022-01-15", lat: 10, lon: 60 },
  { label: "Andaman Sea · Aug 2021", date: "2021-08-01", lat: 11, lon: 95 },
];

export default function ProfilesScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const date = sp.get("date") || DEFAULT_DATE;
  const lat = Number(sp.get("lat") ?? DEFAULT_POINT.lat);
  const lon = Number(sp.get("lon") ?? DEFAULT_POINT.lon);
  const go = (d: string, la: number, lo: number) => router.replace(`/profiles?date=${d}&lat=${la.toFixed(3)}&lon=${lo.toFixed(3)}`, { scroll: false });

  return (
    <div className="px-4 md:px-7 py-5 space-y-4 max-w-[1100px] w-full mx-auto">
      <PageHeader group="Analyze" title="Profile" description="Inspect one water column from the surface to 1000 m: the reconstruction and its uncertainty, compared with the seasonal climatology and measured Argo profiles." />
      <div className="panel px-4 py-3 flex flex-wrap items-end gap-x-6 gap-y-3">
        <LocationPicker lat={lat} lon={lon} date={date} onChange={(la, lo) => go(date, la, lo)} />
        <label className="text-[11px] text-ink-3">
          Date
          <input type="date" min="2019-01-01" max="2023-12-31" value={date} onChange={(e) => e.target.value && go(e.target.value, lat, lon)} className="mt-1 block num bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink [color-scheme:dark]" />
        </label>
        <label className="text-[11px] text-ink-3 ml-auto">
          Examples
          <select
            value=""
            onChange={(e) => {
              const x = EXAMPLES.find((q) => q.label === e.target.value);
              if (x) go(x.date, x.lat, x.lon);
            }}
            className="mt-1 block bg-bg border border-line rounded-md px-2 py-1 text-sm text-ink"
          >
            <option value="">Choose…</option>
            {EXAMPLES.map((x) => (
              <option key={x.label} value={x.label}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="panel min-h-[640px] overflow-hidden" aria-label="Water-column profile">
        <ProfilePanel date={date} lat={lat} lon={lon} wide context="profiles" />
      </section>
    </div>
  );
}
