/**
 * Pure helpers for the Ocean State Timeline and the vertical section. Nothing here creates data:
 * isotherms are traced only between two reconstructed standard depths that bracket the value, and
 * cyclone passages come straight from IBTrACS track points.
 */
import type { CycloneTrack } from "./api";
import { addDays, clampDate } from "./dates";

export const PERIOD = { start: "2019-01-01", end: "2023-12-31" };
export const DOMAIN = { latMin: 5, latMax: 30, lonMin: 45, lonMax: 105 };

/**
 * Depth where a profile first cools through `iso` °C going down from the surface, by linear
 * interpolation between the two standard depths that bracket it. Null when the surface is already
 * colder than `iso`, when no bracketing pair exists, or when a gap (null) interrupts the column.
 */
export function isothermDepth(temps: (number | null)[], depths: number[], iso: number): number | null {
  for (let k = 0; k < temps.length - 1; k++) {
    const a = temps[k], b = temps[k + 1];
    if (a === null || b === null) return null;
    if (k === 0 && a < iso) return null;
    if (a >= iso && b < iso) return depths[k] + ((a - iso) / (a - b)) * (depths[k + 1] - depths[k]);
  }
  return null;
}

/** Trace an isotherm across every column of a [depth][x] matrix. */
export const traceIsotherm = (values: (number | null)[][], depths: number[], iso: number) =>
  (values[0] ?? []).map((_, x) => isothermDepth(values.map((row) => row[x]), depths, iso));

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export interface Passage {
  name: string;
  date: string; // UTC date of closest approach
  km: number;
  windKt: number | null;
}

/** IBTrACS storms whose track came within `maxKm` of the point during [start, end]. */
export function cyclonePassages(tracks: CycloneTrack[], lat: number, lon: number, start: string, end: string, maxKm = 300): Passage[] {
  const out: Passage[] = [];
  for (const t of tracks) {
    let best: { km: number; time: string; wind: number | null } | null = null;
    for (const p of t.points) {
      const d = p.time.slice(0, 10);
      if (d < start || d > end) continue;
      const km = haversineKm(lat, lon, p.lat, p.lon);
      if (!best || km < best.km) best = { km, time: p.time, wind: p.wind_kt };
    }
    if (best && best.km <= maxKm) out.push({ name: t.name, date: best.time.slice(0, 10), km: Math.round(best.km), windKt: best.wind });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const num = (v: string | null, lo: number, hi: number, dflt: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const isoDate = (v: string | null) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v + "T00:00:00Z");
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v ? null : v; // rejects 2023-02-30
};

/* ---------------- timeline URL state ---------------- */
export interface TimelineParams {
  lat: number;
  lon: number;
  start: string;
  end: string;
  date: string;
  view: "temp" | "anomaly";
  zmax: number;
}
export const ZMAX_OPTIONS = [200, 500, 1000] as const;

export function parseTimelineParams(sp: { get(k: string): string | null }): TimelineParams {
  const lat = num(sp.get("lat"), DOMAIN.latMin, DOMAIN.latMax, 15);
  const lon = num(sp.get("lon"), DOMAIN.lonMin, DOMAIN.lonMax, 88);
  const focus = isoDate(sp.get("date"));
  let start = isoDate(sp.get("start"));
  let end = isoDate(sp.get("end"));
  if (!start || !end) {
    // arriving from the map/profile with only a date: centre one year on it
    const c = focus ? clampDate(focus, PERIOD.start, PERIOD.end) : null;
    start = start ?? (c ? addDays(c, -182) : "2023-01-01");
    end = end ?? (c ? addDays(c, 182) : PERIOD.end);
  }
  start = clampDate(start, PERIOD.start, PERIOD.end);
  end = clampDate(end, PERIOD.start, PERIOD.end);
  if (start > end) [start, end] = [end, start];
  const date = focus && focus >= start && focus <= end ? focus : start;
  const zm = Number(sp.get("zmax"));
  return { lat, lon, start, end, date, view: sp.get("view") === "anomaly" ? "anomaly" : "temp", zmax: (ZMAX_OPTIONS as readonly number[]).includes(zm) ? zm : 500 };
}

export function timelineHref(p: Partial<TimelineParams> & { lat: number; lon: number }): string {
  const q = new URLSearchParams({ lat: p.lat.toFixed(3), lon: p.lon.toFixed(3) });
  if (p.date) q.set("date", p.date);
  if (p.start) q.set("start", p.start);
  if (p.end) q.set("end", p.end);
  if (p.view && p.view !== "temp") q.set("view", p.view);
  if (p.zmax && p.zmax !== 500) q.set("zmax", String(p.zmax));
  return `/timeline?${q.toString()}`;
}

/** "Explore this state": the map at the same point and day, profile drawer open. */
export const mapStateHref = (date: string, lat: number, lon: number, depth = 100) => `/map?date=${date}&depth=${depth}&var=temp&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`;

/* ---------------- section URL state ---------------- */
export interface SectionParams {
  date: string;
  dir: "lon" | "lat"; // lon = along a line of latitude (x = longitude); lat = along a meridian (x = latitude)
  at: number; // the fixed coordinate
  from: number;
  to: number;
  variable: "temp" | "anomaly" | "uncertainty";
  zmax: number;
}

export function parseSectionParams(sp: { get(k: string): string | null }): SectionParams {
  const dir = sp.get("dir") === "lat" ? "lat" : "lon";
  const [lo, hi] = dir === "lon" ? [DOMAIN.lonMin, DOMAIN.lonMax] : [DOMAIN.latMin, DOMAIN.latMax];
  const [flo, fhi] = dir === "lon" ? [DOMAIN.latMin, DOMAIN.latMax] : [DOMAIN.lonMin, DOMAIN.lonMax];
  let from = num(sp.get("from"), lo, hi, dir === "lon" ? 80 : 5);
  let to = num(sp.get("to"), lo, hi, dir === "lon" ? 97 : 22);
  if (from > to) [from, to] = [to, from];
  if (to - from < 0.5) to = Math.min(hi, from + 0.5);
  const v = sp.get("variable");
  const zm = Number(sp.get("zmax"));
  return {
    date: clampDate(isoDate(sp.get("date")) ?? "2023-05-11", PERIOD.start, PERIOD.end),
    dir,
    at: num(sp.get("at"), flo, fhi, dir === "lon" ? 15 : 88),
    from,
    to,
    variable: v === "anomaly" || v === "uncertainty" ? v : "temp",
    zmax: (ZMAX_OPTIONS as readonly number[]).includes(zm) ? zm : 500,
  };
}

export function sectionHref(p: SectionParams): string {
  const q = new URLSearchParams({ date: p.date, dir: p.dir, at: String(+p.at.toFixed(3)), from: String(+p.from.toFixed(3)), to: String(+p.to.toFixed(3)) });
  if (p.variable !== "temp") q.set("variable", p.variable);
  if (p.zmax !== 500) q.set("zmax", String(p.zmax));
  return `/section?${q.toString()}`;
}

/** API path for a section; the backend's zonal/meridional terms map to our transect direction. */
export function sectionApiPath(p: SectionParams): string {
  const q = new URLSearchParams({ variable: p.variable });
  if (p.dir === "lon") {
    q.set("orientation", "zonal");
    q.set("lat", String(p.at));
    q.set("lon_min", String(p.from));
    q.set("lon_max", String(p.to));
  } else {
    q.set("orientation", "meridional");
    q.set("lon", String(p.at));
    q.set("lat_min", String(p.from));
    q.set("lat_max", String(p.to));
  }
  return `/v1/section/${p.date}?${q.toString()}`;
}

/** From a map point: an east–west section ±12° through it, clamped to the domain. */
export function sectionFromMap(date: string, lat: number | null, lon: number | null): string {
  if (lat === null || lon === null) return sectionHref({ date, dir: "lon", at: 15, from: 80, to: 97, variable: "temp", zmax: 500 });
  const from = Math.max(DOMAIN.lonMin, lon - 12), to = Math.min(DOMAIN.lonMax, lon + 12);
  return sectionHref({ date, dir: "lon", at: lat, from, to, variable: "temp", zmax: 500 });
}

/** "Open in Map": the section's midpoint on the same day. */
export function sectionMapHref(p: SectionParams): string {
  const mid = (p.from + p.to) / 2;
  const [lat, lon] = p.dir === "lon" ? [p.at, mid] : [mid, p.at];
  return `/map?date=${p.date}&depth=100&var=${p.variable}&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`;
}

/** Which screen state to show for a fetched matrix. */
export function viewState(q: { loading: boolean; error: string | null; values: (number | null)[][] | null | undefined }): "loading" | "error" | "empty" | "ready" {
  if (q.error) return "error";
  if (!q.values) return q.loading ? "loading" : "empty";
  return q.values.some((row) => row.some((v) => v !== null)) ? "ready" : "empty";
}
