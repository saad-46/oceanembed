/** Guided-tour state: pure helpers (unit-tested in tests/tour.test.ts). */

export const TOUR_STEPS = [
  { id: "problem", label: "The problem" },
  { id: "gap", label: "Why it's hard" },
  { id: "system", label: "Enter OceanSight" },
  { id: "ai", label: "The AI" },
  { id: "map", label: "Beneath the surface" },
  { id: "profile", label: "Into the water column" },
  { id: "trust", label: "Is it right?" },
  { id: "cyclone", label: "Why it matters" },
  { id: "value", label: "Surface → intelligence" },
] as const;

export const N_STEPS = TOUR_STEPS.length;
export const TOUR_KEY = "oceansight.tour.v1";

export type TourStatus = "completed" | "skipped";

/** `?step=` is 1-based in the URL; anything invalid falls back to the first step. */
export function parseStep(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(N_STEPS - 1, Math.max(0, n - 1));
}

export const stepParam = (i: number) => String(clampStep(i) + 1);
export const clampStep = (i: number) => Math.min(N_STEPS - 1, Math.max(0, i));
export const next = (i: number) => clampStep(i + 1);
export const back = (i: number) => clampStep(i - 1);
export const isLast = (i: number) => i >= N_STEPS - 1;
export const progress = (i: number) => (clampStep(i) + 1) / N_STEPS;
export const counter = (i: number) => `${String(clampStep(i) + 1).padStart(2, "0")} / ${String(N_STEPS).padStart(2, "0")}`;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readTourStatus(s: Store | null = store()): TourStatus | null {
  try {
    const v = s?.getItem(TOUR_KEY);
    return v === "completed" || v === "skipped" ? v : null;
  } catch {
    return null;
  }
}

export function writeTourStatus(status: TourStatus | null, s: Store | null = store()) {
  try {
    if (status === null) s?.removeItem(TOUR_KEY);
    else s?.setItem(TOUR_KEY, status);
  } catch {
    /* private mode: the tour simply isn't remembered */
  }
}
