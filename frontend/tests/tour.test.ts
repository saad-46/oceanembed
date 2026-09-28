import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fallbackKey } from "../lib/api";
import { DEMO_DATE, DEMO_STEPS, N_DEMO, demoHref, parseDemo } from "../lib/demo";
import { GLOSSARY } from "../lib/glossary";
import { N_STEPS, TOUR_STEPS, back, clampStep, counter, isLast, next, parseStep, progress, readTourStatus, stepParam, writeTourStatus } from "../lib/tour";
import { gridPath } from "../lib/useGrid";

const root = join(__dirname, "..");
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("guided tour navigation", () => {
  it("has nine stages in story order", () => {
    expect(N_STEPS).toBe(9);
    expect(TOUR_STEPS[0].id).toBe("problem");
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["problem", "gap", "system", "ai", "map", "profile", "trust", "cyclone", "value"]);
  });
  it("next/back stay inside bounds", () => {
    expect(next(0)).toBe(1);
    expect(next(N_STEPS - 1)).toBe(N_STEPS - 1);
    expect(back(0)).toBe(0);
    expect(back(4)).toBe(3);
    expect(clampStep(99)).toBe(N_STEPS - 1);
  });
  it("deep links parse 1-based ?step= and reject junk", () => {
    expect(parseStep("5")).toBe(4);
    expect(parseStep("1")).toBe(0);
    expect(parseStep(null)).toBe(0);
    expect(parseStep("abc")).toBe(0);
    expect(parseStep("0")).toBe(0);
    expect(parseStep("42")).toBe(N_STEPS - 1);
    for (let i = 0; i < N_STEPS; i++) expect(parseStep(stepParam(i))).toBe(i); // round trip
  });
  it("progress and counter describe the position", () => {
    expect(counter(0)).toBe("01 / 09");
    expect(counter(8)).toBe("09 / 09");
    expect(progress(8)).toBe(1);
    expect(isLast(8)).toBe(true);
    expect(isLast(7)).toBe(false);
  });
  it("remembers completion and skip, and restart clears it", () => {
    const s = memStore();
    expect(readTourStatus(s)).toBeNull();
    writeTourStatus("skipped", s);
    expect(readTourStatus(s)).toBe("skipped");
    writeTourStatus("completed", s);
    expect(readTourStatus(s)).toBe("completed");
    writeTourStatus(null, s);
    expect(readTourStatus(s)).toBeNull();
  });
  it("survives storage that throws (private mode)", () => {
    const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(readTourStatus(bad)).toBeNull();
    expect(() => writeTourStatus("completed", bad)).not.toThrow();
  });
});

describe("presenter demo scenario", () => {
  it("has the 8 scripted steps", () => {
    expect(N_DEMO).toBe(8);
    expect(DEMO_STEPS.map((s) => s.title)).toEqual([
      "What satellites see", "What happens beneath the surface", "How OceanSight reconstructs it", "Explore the reconstructed field",
      "Inspect a water-column profile", "Validate against Argo", "Investigate cyclone interaction", "Generate a scientific report",
    ]);
  });
  it("every step links to an existing screen and carries its demo index", () => {
    DEMO_STEPS.forEach((s, i) => {
      const href = demoHref(i);
      expect(href).toContain(`demo=${i + 1}`);
      const route = href.split("?")[0].slice(1);
      expect(existsSync(join(root, "app", "(app)", route, "page.tsx"))).toBe(true);
      expect(parseDemo(new URLSearchParams(href.split("?")[1]).get("demo"))).toBe(i);
    });
    expect(parseDemo("0")).toBeNull();
    expect(parseDemo("9")).toBeNull();
  });
  it("is deterministic: fixed date and point", () => {
    expect(DEMO_DATE).toBe("2023-05-11");
    expect(demoHref(4)).toContain("lat=15.000&lon=88.000");
  });
});

describe("offline fallback covers the tour and demo", () => {
  const has = (path: string, body?: unknown) => existsSync(join(root, "public", "fallback", `${fallbackKey(path, body)}.json`));
  it("has snapshots for every API call of the live tour stages", () => {
    const paths = [
      "/v1/summary/headline",
      `/v1/argo/markers?date=${DEMO_DATE}&window_days=3`,
      `/v1/profile/${DEMO_DATE}?lat=15.000&lon=88.000`,
      "/v1/validation/summary?split=test",
      "/v1/validation/scatter?split=test&max_points=3000",
      "/v1/cyclones",
      ...[0, 20, 50, 100, 150, 200].map((z) => gridPath(DEMO_DATE, z, "temp")),
      gridPath(DEMO_DATE, 100, "anomaly"),
    ];
    for (const p of paths) expect(has(p), p).toBe(true);
  });
  it("has the Mocha fuel record and the fields along its track", () => {
    const tracks = JSON.parse(readFileSync(join(root, "public", "fallback", `${fallbackKey("/v1/cyclones")}.json`), "utf8")).tracks as { id: number; name: string }[];
    const mocha = tracks.find((t) => t.name.includes("Mocha"))!;
    const fuelPath = `/v1/cyclones/${mocha.id}/fuel?lead_days=2`;
    expect(has(fuelPath)).toBe(true);
    const fuel = JSON.parse(readFileSync(join(root, "public", "fallback", `${fallbackKey(fuelPath)}.json`), "utf8"));
    const dates = new Set<string>(fuel.points.map((p: { ocean_date: string | null }) => p.ocean_date).filter(Boolean));
    for (const d of dates) {
      expect(has(`/v1/grid/${d}/product?product=tchp`), d).toBe(true);
      expect(has(`/v1/grid/${d}?depth=100&variable=uncertainty`), d).toBe(true);
    }
  });
});

describe("glossary", () => {
  it("gives every term a simple and a technical explanation", () => {
    for (const [k, t] of Object.entries(GLOSSARY)) {
      expect(t.simple.length, k).toBeGreaterThan(40);
      expect(t.technical.length, k).toBeGreaterThan(40);
      expect(t.simple).not.toEqual(t.technical);
    }
  });
});
