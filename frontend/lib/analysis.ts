/**
 * URL state and API paths for the analysis and data workspaces (stratification, T-S, forecast, 3-D).
 * Pure helpers, unit-tested in tests/analysis.test.ts. Paths are built exactly as scripts/snapshot_fallback.py
 * requests them, so the reference scenario also works from the bundled offline copies.
 */
import type { Classification, GradientLayer } from "./api";
import { clampDate, DEFAULT_DATE, DEFAULT_POINT } from "./dates";
import { DOMAIN, PERIOD } from "./ocean";

export interface PointParams {
  lat: number;
  lon: number;
  date: string;
}

const clampNum = (v: string | null, lo: number, hi: number, d: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const isoOk = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v ? v : null);

export function parsePointParams(sp: { get(k: string): string | null }): PointParams {
  return {
    lat: clampNum(sp.get("lat"), DOMAIN.latMin, DOMAIN.latMax, DEFAULT_POINT.lat),
    lon: clampNum(sp.get("lon"), DOMAIN.lonMin, DOMAIN.lonMax, DEFAULT_POINT.lon),
    date: clampDate(isoOk(sp.get("date")) ?? DEFAULT_DATE, PERIOD.start, PERIOD.end),
  };
}

const q = (p: PointParams) => `lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}&date=${p.date}`;

export const STRAT_DEPTHS = [200, 300, 500, 1000] as const;
export const parseMaxDepth = (v: string | null) => ((STRAT_DEPTHS as readonly number[]).includes(Number(v)) ? Number(v) : 500);

export const stratificationPath = (p: PointParams, maxDepth = 500) => `/v1/stratification?${q(p)}&max_depth=${maxDepth}`;
export const tsPath = (p: PointParams) => `/v1/ts-profile?${q(p)}`;
export const forecastPath = (p: PointParams, method: "trend" | "persistence" = "trend") => `/v1/forecast?${q(p)}&method=${method}`;

export const stratificationHref = (p: PointParams, maxDepth?: number) => `/stratification?${q(p)}${maxDepth && maxDepth !== 500 ? `&zmax=${maxDepth}` : ""}`;
export const tsHref = (p: PointParams) => `/ts?${q(p)}`;
export const profileHref = (p: PointParams) => `/profiles?${q(p)}`;
export const volumeHref = (p: PointParams) => `/3d?${q(p)}`;

/* ---------------- 3-D view ---------------- */
export const VOLUME_REGIONS = [
  { id: "bob", label: "Bay of Bengal", bbox: { min_lat: 5, max_lat: 22, min_lon: 80, max_lon: 100 } },
  { id: "as", label: "Arabian Sea", bbox: { min_lat: 5, max_lat: 25, min_lon: 50, max_lon: 77 } },
  { id: "all", label: "Whole domain", bbox: { min_lat: 5, max_lat: 30, min_lon: 45, max_lon: 105 } },
] as const;
export type VolumeRegion = (typeof VOLUME_REGIONS)[number]["id"];

export function volumePath(date: string, region: VolumeRegion, maxDepth: number, variable: "temp" | "anomaly" | "uncertainty", minDepth = 0): string {
  const b = VOLUME_REGIONS.find((r) => r.id === region)!.bbox;
  return `/v1/volume/sample?date=${date}&min_lat=${b.min_lat}&max_lat=${b.max_lat}&min_lon=${b.min_lon}&max_lon=${b.max_lon}&min_depth=${minDepth}&max_depth=${maxDepth}&variable=${variable}`;
}

/** The region containing a point (for the 3-D link), falling back to the whole domain. */
export function regionFor(lat: number, lon: number): VolumeRegion {
  const r = VOLUME_REGIONS.find((x) => x.id !== "all" && lat >= x.bbox.min_lat && lat <= x.bbox.max_lat && lon >= x.bbox.min_lon && lon <= x.bbox.max_lon);
  return r ? r.id : "all";
}

/* ---------------- charts ---------------- */
/** Gradient layers as a step profile: (value, top) → (value, bottom) for each layer, with breaks at gaps. */
export function stepPoints(layers: GradientLayer[], scale = 1): { z: number; v: number | null }[] {
  const out: { z: number; v: number | null }[] = [];
  layers.forEach((g, k) => {
    if (k > 0 && layers[k - 1].bottom_m !== g.top_m) out.push({ z: (layers[k - 1].bottom_m + g.top_m) / 2, v: null });
    out.push({ z: g.top_m, v: g.gradient * scale }, { z: g.bottom_m, v: g.gradient * scale });
  });
  return out;
}

/** Display metadata of each classification (label only; colours live in components/ui). */
export const CLASS_ORDER: Classification[] = ["measured", "satellite", "reanalysis", "reconstructed", "derived", "estimated", "forecast", "baseline"];

/** Coverage interpretation of a ±kσ interval from the empirical Argo coverage, never a nominal "95 %". */
export function coverageSentence(k: 1 | 2, frac: number | null | undefined, year = "2023"): string {
  if (frac === null || frac === undefined) return `Empirical coverage of the ±${k}σ range has not been computed.`;
  const ideal = k === 1 ? 68 : 95;
  return `On held-out ${year} Argo profiles, ${Math.round(frac * 100)} % of measurements fell within ±${k}σ (about ${ideal} % would be expected for a well-calibrated Gaussian error).`;
}
