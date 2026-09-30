/**
 * Guided Exploration — an onboarding layer over the real OceanSight screens (no separate canvas).
 * Pure state helpers; unit-tested in tests/guide.test.ts.
 *
 * The reference case is the Bay of Bengal in May 2023, while Cyclone Mocha developed. Every
 * request the guide triggers is also bundled as an offline snapshot (public/fallback).
 */
export const REF_DATE = "2023-05-11";
export const REF_POINT = { lat: 15.0, lon: 88.0 };
const P = `lat=${REF_POINT.lat.toFixed(3)}&lon=${REF_POINT.lon.toFixed(3)}`;

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  /** Screen to open for this step (the user's own state is kept when already there, see stepHref). */
  path: string;
  /** `data-guide` target to highlight on that screen. */
  target: string;
  /** Optional hint shown once the user has done the step themselves. */
  done?: string;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "location",
    title: "Choose a location",
    body: "Click a point in the Bay of Bengal, east of India. OceanSight opens the water column for the grid cell you picked.",
    path: `/map?date=${REF_DATE}&depth=0&var=temp`,
    target: "map-canvas",
    done: "Location selected — its profile is open on the right.",
  },
  {
    id: "depth",
    title: "Look below the surface",
    body: "Move the depth control. Each step is a separate layer reconstructed by OceanSight — satellites only observe the surface.",
    path: `/map?date=${REF_DATE}&depth=100&var=temp&${P}`,
    target: "depth",
  },
  {
    id: "profile",
    title: "Inspect the water column",
    body: "The profile shows temperature from the surface to 1000 m: the reconstruction with its uncertainty band, the seasonal climatology and, where a float was nearby, measured Argo values.",
    path: `/map?date=${REF_DATE}&depth=100&var=temp&${P}`,
    target: "profile",
  },
  {
    id: "timeline",
    title: "Follow it through time",
    body: "The timeline shows the same point day by day. Watch the mixed layer and the 20 °C and 26 °C depths move with the seasons; click any day to open its profile.",
    path: `/timeline?${P}&date=${REF_DATE}&start=2023-01-01&end=2023-12-31`,
    target: "timeline-chart",
  },
  {
    id: "section",
    title: "Explore a section",
    body: "A section follows the structure along a line instead of at a single point — here west to east across the Bay of Bengal at 15°N.",
    path: `/section?date=${REF_DATE}&dir=lon&at=15&from=80&to=97`,
    target: "section-chart",
  },
  {
    id: "validate",
    title: "Check the evidence",
    body: "Accuracy is measured against Argo profiles from 2023, a year not used for training, and compared with a seasonal-climatology baseline.",
    path: "/validation",
    target: "validation-evidence",
  },
  {
    id: "event",
    title: "Investigate an event",
    body: "Examine the upper-ocean heat content along Cyclone Mocha's observed track. Values are labelled measured, reconstructed, derived or estimated; the view describes the ocean, it does not forecast the storm.",
    path: "/analysis?mode=cyclone",
    target: "fuel-gauge",
  },
  {
    id: "report",
    title: "Create a report",
    body: "Save an investigation as a report: location, date, profile, derived structure, uncertainty, observations and model details in one document.",
    path: `/reports?date=${REF_DATE}&${P}`,
    target: "report-builder",
  },
];

export const N_GUIDE = GUIDE_STEPS.length;

/**
 * Optional advanced track, offered after the core exploration is complete. Each step opens a real
 * screen; a step whose data this deployment cannot serve is left out (``requires``).
 */
export interface AdvancedStep extends GuideStep {
  requires?: "argo_salinity";
}
export const ADVANCED_STEPS: AdvancedStep[] = [
  {
    id: "stratification",
    title: "Inspect stratification",
    body: "Where does temperature fall fastest with depth? The thermocline comes from the reconstructed profile's vertical gradient, and is shown next to the mixed layer and the 20 °C / 26 °C depths — four different diagnostics.",
    path: `/stratification?${P}&date=${REF_DATE}`,
    target: "stratification-charts",
  },
  {
    id: "ts",
    title: "Compare temperature and salinity",
    body: "The T-S diagram plots the nearest measured Argo profile, one point per depth, with density contours computed using TEOS-10. OceanSight does not reconstruct salinity, so these points are measurements.",
    path: `/ts?${P}&date=${REF_DATE}`,
    target: "ts-diagram",
    requires: "argo_salinity",
  },
  {
    id: "quality",
    title: "Check data quality",
    body: "How complete are the inputs and observations? These statistics come from the pipeline's own quality-control records: gap-filling, rejected values, depth and spatial coverage.",
    path: "/data-quality",
    target: "data-quality",
  },
  {
    id: "provenance",
    title: "Trace data provenance",
    body: "Every variable is classified — measured, satellite, reanalysis, reconstructed, derived, estimated, forecast — with its source and the chain of processing that produced it.",
    path: "/provenance",
    target: "lineage-table",
  },
];

/** Advanced steps this deployment can serve (layer statuses from /v1/meta; unknown = assume available). */
export function advancedSteps(layers?: Record<string, { status: string }> | null): AdvancedStep[] {
  return ADVANCED_STEPS.filter((s) => !s.requires || !layers || (layers[s.requires] && layers[s.requires].status !== "unavailable"));
}

/** `guide=a1…` addresses the advanced track (1-based). */
export function parseAdvanced(raw: string | null | undefined, n = ADVANCED_STEPS.length): number | null {
  const m = /^a(\d+)$/.exec(raw ?? "");
  const k = m ? Number(m[1]) : NaN;
  return Number.isInteger(k) && k >= 1 && k <= n ? k - 1 : null;
}

export function advancedHref(steps: AdvancedStep[], i: number): string {
  const k = Math.min(steps.length - 1, Math.max(0, i));
  const p = steps[k].path;
  return `${p}${p.includes("?") ? "&" : "?"}guide=a${k + 1}`;
}
export const GUIDE_STATUS_KEY = "oceansight.guide.status.v1";
export const GUIDE_STEP_KEY = "oceansight.guide.step.v1";
export type GuideStatus = "completed" | "skipped" | "dismissed";

/** URL for step i; `guide=i+1` lets a reload or shared link resume the guide. */
export function stepHref(i: number): string {
  const k = clampGuide(i);
  const p = GUIDE_STEPS[k].path;
  return `${p}${p.includes("?") ? "&" : "?"}guide=${k + 1}`;
}

export const clampGuide = (i: number) => Math.min(N_GUIDE - 1, Math.max(0, i));

/** `guide=` is 1-based; `done` marks the completion panel. */
export function parseGuide(raw: string | null | undefined): number | "done" | null {
  if (raw === "done") return "done";
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= N_GUIDE ? n - 1 : null;
}

/** Step 1 is complete once the user has picked a point on the map themselves. */
export function stepDone(step: GuideStep, path: string, params: { get(k: string): string | null }): boolean {
  if (step.id === "location") return path.startsWith("/map") && params.get("lat") !== null && params.get("lon") !== null;
  return false;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function readGuideStatus(s: Store | null = local()): GuideStatus | null {
  try {
    const v = s?.getItem(GUIDE_STATUS_KEY);
    return v === "completed" || v === "skipped" || v === "dismissed" ? v : null;
  } catch {
    return null;
  }
}

export function writeGuideStatus(status: GuideStatus | null, s: Store | null = local()) {
  try {
    if (status === null) s?.removeItem(GUIDE_STATUS_KEY);
    else s?.setItem(GUIDE_STATUS_KEY, status);
  } catch {
    /* private mode: onboarding simply isn't remembered */
  }
}

/** Show the one-time onboarding prompt only to visitors who never made a choice. */
export const shouldPromptOnboarding = (status: GuideStatus | null, guiding: boolean) => status === null && !guiding;

/** Which corner the guide panel should use so it does not cover the highlighted element. */
export function panelCorner(target: { left: number; top: number; right: number; bottom: number } | null, vw: number, vh: number, pw = 380, ph = 230): "br" | "bl" | "tr" {
  if (!target) return "br";
  const boxes = {
    br: { left: vw - pw - 16, top: vh - ph - 16, right: vw - 16, bottom: vh - 16 },
    bl: { left: 16, top: vh - ph - 16, right: 16 + pw, bottom: vh - 16 },
    tr: { left: vw - pw - 16, top: 72, right: vw - 16, bottom: 72 + ph },
  };
  const overlap = (b: typeof boxes.br) => Math.max(0, Math.min(b.right, target.right) - Math.max(b.left, target.left)) * Math.max(0, Math.min(b.bottom, target.bottom) - Math.max(b.top, target.top));
  return (Object.keys(boxes) as ("br" | "bl" | "tr")[]).reduce((best, k) => (overlap(boxes[k]) < overlap(boxes[best]) ? k : best), "br");
}
