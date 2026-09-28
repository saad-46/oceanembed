/**
 * Deterministic SIH presenter scenario: Bay of Bengal before Cyclone Mocha (2023-05-11).
 * Every step is a real screen of the platform in a fixed state; all of its API calls are
 * covered by the offline snapshots in public/fallback, so the demo runs without the backend.
 */
export const DEMO_DATE = "2023-05-11";
export const DEMO_POINT = { lat: 15.0, lon: 88.0 };
export const DEMO_KEY = "oceansight.demo.v1";

export const SCENARIO = {
  title: "Bay of Bengal — Cyclone Mocha case study",
  date: DEMO_DATE,
  region: "Bay of Bengal (5–22°N, 80–100°E)",
  point: "15.00°N 88.00°E",
  cyclone: "Cyclone Mocha, May 2023 (IBTrACS)",
};

const P = `lat=${DEMO_POINT.lat.toFixed(3)}&lon=${DEMO_POINT.lon.toFixed(3)}`;

export const DEMO_STEPS = [
  { title: "What satellites see", path: `/map?date=${DEMO_DATE}&depth=0&var=temp`, say: "This is the ocean surface on 11 May 2023, while Cyclone Mocha was developing in the Bay of Bengal — the view a satellite gives us." },
  { title: "What happens beneath the surface", path: `/map?date=${DEMO_DATE}&depth=100&var=temp`, say: "Same day, 100 m down. No satellite sees this layer; this field is OceanSight's reconstruction." },
  { title: "How OceanSight reconstructs it", path: "/methodology", say: "Surface fields go in, the model learned from years of ocean data, and a full 0–1000 m temperature field comes out — then we check it against real floats." },
  { title: "Explore the reconstructed field", path: `/map?date=${DEMO_DATE}&depth=100&var=anomaly`, say: "Here is how unusual 100 m is compared with the seasonal normal: red is warmer than usual, blue colder." },
  { title: "Inspect a water-column profile", path: `/map?date=${DEMO_DATE}&depth=100&var=temp&${P}`, say: "Click one point and see the whole column, with its uncertainty band and a real Argo float from a year the model never trained on." },
  { title: "Validate against Argo", path: "/validation", say: "Every number here comes from comparing the model with held-out Argo profiles, and against a simple climatology baseline." },
  { title: "Investigate cyclone interaction", path: "/analysis?mode=cyclone", say: "Cyclone Mocha's real track over the reconstructed ocean heat content. Each value is labelled measured, reconstructed or derived." },
  { title: "Generate a scientific report", path: `/reports?date=${DEMO_DATE}&${P}`, say: "Any point and day can be exported as a one-page PDF or CSV, with sources and the validation caveat included." },
] as const;

export const N_DEMO = DEMO_STEPS.length;

/** The URL for step i carries `demo=i+1` so a reload or shared link re-enters the presenter bar. */
export function demoHref(i: number): string {
  const k = Math.min(N_DEMO - 1, Math.max(0, i));
  const p = DEMO_STEPS[k].path;
  return `${p}${p.includes("?") ? "&" : "?"}demo=${k + 1}`;
}

export function parseDemo(raw: string | null | undefined): number | null {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= N_DEMO ? n - 1 : null;
}
