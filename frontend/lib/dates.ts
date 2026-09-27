export const DEFAULT_DATE = "2023-05-11"; // pre-Cyclone Mocha (docs/15)
export const DEFAULT_POINT = { lat: 15.0, lon: 88.0 };
export const STANDARD_DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function clampDate(iso: string, start: string, end: string): string {
  return iso < start ? start : iso > end ? end : iso;
}
