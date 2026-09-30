/**
 * Saved investigation points. An investigation point is a coordinate on the OceanSight grid chosen by the
 * user — never a physical station, so it has no invented station ID. Stored only in this browser
 * (localStorage); every access is guarded so private mode or blocked storage simply disables saving.
 */
export interface SavedPoint {
  lat: number;
  lon: number;
  date: string;
  depth?: number;
  label?: string;
  saved_at: string;
}

export const SAVED_KEY = "oceansight.investigation.points.v1";
export const MAX_SAVED = 20;
type Store = Pick<Storage, "getItem" | "setItem">;

const local = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const same = (a: SavedPoint, b: Pick<SavedPoint, "lat" | "lon" | "date">) => a.lat.toFixed(3) === b.lat.toFixed(3) && a.lon.toFixed(3) === b.lon.toFixed(3) && a.date === b.date;

export function readSaved(s: Store | null = local()): SavedPoint[] {
  try {
    const raw = s?.getItem(SAVED_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((p) => typeof p?.lat === "number" && typeof p?.lon === "number" && typeof p?.date === "string") : [];
  } catch {
    return [];
  }
}

function write(list: SavedPoint[], s: Store | null): boolean {
  try {
    if (!s) return false;
    s.setItem(SAVED_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Adds (newest first, de-duplicated, capped). Returns false when storage is unavailable. */
export function savePoint(p: Omit<SavedPoint, "saved_at">, s: Store | null = local(), now = new Date()): boolean {
  const list = readSaved(s).filter((x) => !same(x, p));
  return write([{ ...p, lat: +p.lat.toFixed(3), lon: +p.lon.toFixed(3), saved_at: now.toISOString() }, ...list].slice(0, MAX_SAVED), s);
}

export function removePoint(p: Pick<SavedPoint, "lat" | "lon" | "date">, s: Store | null = local()): boolean {
  return write(readSaved(s).filter((x) => !same(x, p)), s);
}

export const isSaved = (p: Pick<SavedPoint, "lat" | "lon" | "date">, s: Store | null = local()) => readSaved(s).some((x) => same(x, p));

export const coordText = (lat: number, lon: number) => `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
