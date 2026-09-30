import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fallbackKey, friendlyError, ApiError } from "../lib/api";
import { coverageSentence, forecastPath, parseMaxDepth, parsePointParams, regionFor, stepPoints, stratificationHref, stratificationPath, tsHref, tsPath, volumePath } from "../lib/analysis";
import { ADVANCED_STEPS, N_GUIDE, advancedHref, advancedSteps, parseAdvanced, parseGuide } from "../lib/guide";
import { MAX_SAVED, SAVED_KEY, isSaved, readSaved, removePoint, savePoint } from "../lib/investigation";
import { arrowPaths } from "../components/OceanMap";
import { gridPath, PRODUCT_VARS } from "../lib/useGrid";
import { GLOSSARY } from "../lib/glossary";

const root = join(__dirname, "..");
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe("analysis URL state and API paths", () => {
  it("parses and clamps point parameters", () => {
    expect(parsePointParams(new URLSearchParams("lat=15&lon=88&date=2023-05-11"))).toEqual({ lat: 15, lon: 88, date: "2023-05-11" });
    expect(parsePointParams(new URLSearchParams("lat=99&lon=10&date=2023-02-30"))).toEqual({ lat: 30, lon: 45, date: "2023-05-11" });
    expect(parsePointParams(new URLSearchParams("date=2030-01-01")).date).toBe("2023-12-31");
    expect(parseMaxDepth("1000")).toBe(1000);
    expect(parseMaxDepth("42")).toBe(500);
  });
  it("builds exactly the paths the offline snapshot script requests", () => {
    const p = { lat: 15, lon: 88, date: "2023-05-11" };
    const script = readFileSync(join(root, "..", "scripts", "snapshot_fallback.py"), "utf8").replaceAll("{DEMO_DATE}", "2023-05-11");
    for (const path of [stratificationPath(p, 500), tsPath(p), forecastPath(p), volumePath("2023-05-11", "bob", 500, "temp")]) {
      expect(script.includes(path), path).toBe(true);
      expect(fallbackKey(path)).not.toMatch(/[^A-Za-z0-9._-]/);
    }
    expect(stratificationHref(p)).toBe("/stratification?lat=15.000&lon=88.000&date=2023-05-11");
    expect(stratificationHref(p, 1000)).toContain("&zmax=1000");
    expect(tsHref(p)).toBe("/ts?lat=15.000&lon=88.000&date=2023-05-11");
  });
  it("maps new map layers to their endpoints; surface layers have no depth", () => {
    expect(gridPath("2023-05-11", 0, "salinity")).toBe("/v1/salinity/2023-05-11?depth=0");
    expect(gridPath("2023-05-11", 100, "salinity")).toBe("/v1/salinity/2023-05-11?depth=100");
    expect(gridPath("2023-05-11", 100, "sla")).toBe("/v1/surface/2023-05-11?variable=sla");
    expect(gridPath("2023-05-11", 100, "wind")).toBe("/v1/surface/2023-05-11?variable=wind_speed");
    expect(PRODUCT_VARS).toEqual(expect.arrayContaining(["sla", "wind"]));
    expect(PRODUCT_VARS).not.toContain("salinity");
  });
  it("picks the 3-D region containing a point", () => {
    expect(regionFor(15, 88)).toBe("bob");
    expect(regionFor(15, 66)).toBe("as");
    expect(regionFor(28, 60)).toBe("all");
  });
});

describe("scientific presentation helpers", () => {
  it("turns gradient layers into a step profile with breaks at gaps", () => {
    const s = stepPoints([
      { top_m: 0, bottom_m: 10, depth_m: 5, gradient: -0.01 },
      { top_m: 10, bottom_m: 20, depth_m: 15, gradient: -0.2 },
      { top_m: 30, bottom_m: 50, depth_m: 40, gradient: -0.1 },
    ]);
    expect(s).toEqual([
      { z: 0, v: -0.01 }, { z: 10, v: -0.01 }, { z: 10, v: -0.2 }, { z: 20, v: -0.2 },
      { z: 25, v: null }, { z: 30, v: -0.1 }, { z: 50, v: -0.1 },
    ]);
  });
  it("describes uncertainty by measured coverage, never as a nominal 95 % confidence interval", () => {
    const s2 = coverageSentence(2, 0.94);
    expect(s2).toContain("94 %");
    expect(s2.toLowerCase()).not.toContain("confidence");
    expect(coverageSentence(1, 0.7)).toContain("70 % of measurements fell within ±1σ");
    expect(coverageSentence(1, null)).toMatch(/not been computed/);
  });
  it("wind arrows point where the wind blows to, with length proportional to speed", () => {
    const [shaft] = arrowPaths([{ lat: 15, lon: 88, u_ms: 10, v_ms: 0, speed_ms: 10 }]);
    expect(shaft[1][0]).toBeGreaterThan(shaft[0][0]); // eastward
    expect(shaft[1][0] - shaft[0][0]).toBeCloseTo(1.0);
    expect(arrowPaths([{ lat: 15, lon: 88, u_ms: 0, v_ms: 0, speed_ms: 0 }])).toEqual([]);
  });
  it("explains every new diagnostic in two levels", () => {
    for (const k of ["thermocline_depth", "halocline", "ts_diagram", "sigma0", "density_mld", "sla", "wind", "short_horizon", "classification", "investigation_point"] as const) {
      expect(GLOSSARY[k].simple.length).toBeGreaterThan(30);
      expect(GLOSSARY[k].technical.length).toBeGreaterThan(30);
    }
    expect(GLOSSARY.short_horizon.simple.toLowerCase()).toContain("not a weather-style forecast");
  });
  it("maps the new typed errors to calm messages", () => {
    expect(friendlyError(new ApiError(422, "insufficient_forecast_history", "needs 5 days"))).toMatch(/more reconstructed history/);
    expect(friendlyError(new ApiError(503, "optional_dataset_unavailable", "Not configured."))).toBe("Not configured.");
  });
});

describe("investigation points (browser storage)", () => {
  it("saves newest first, de-duplicates and caps the list", () => {
    const s = mem();
    expect(savePoint({ lat: 15, lon: 88, date: "2023-05-11" }, s)).toBe(true);
    expect(savePoint({ lat: 15.0001, lon: 88, date: "2023-05-11", depth: 100 }, s)).toBe(true);
    expect(readSaved(s)).toHaveLength(1);
    for (let i = 0; i < MAX_SAVED + 5; i++) savePoint({ lat: 10 + i * 0.1, lon: 70, date: "2023-01-01" }, s);
    expect(readSaved(s)).toHaveLength(MAX_SAVED);
    expect(readSaved(s)[0].lat).toBeCloseTo(10 + (MAX_SAVED + 4) * 0.1);
  });
  it("removes points and survives corrupt or unavailable storage", () => {
    const s = mem();
    savePoint({ lat: 15, lon: 88, date: "2023-05-11" }, s);
    expect(isSaved({ lat: 15, lon: 88, date: "2023-05-11" }, s)).toBe(true);
    removePoint({ lat: 15, lon: 88, date: "2023-05-11" }, s);
    expect(isSaved({ lat: 15, lon: 88, date: "2023-05-11" }, s)).toBe(false);
    s.m.set(SAVED_KEY, "{not json");
    expect(readSaved(s)).toEqual([]);
    expect(savePoint({ lat: 1, lon: 2, date: "2023-01-01" }, null)).toBe(false);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readSaved(throwing)).toEqual([]);
    expect(savePoint({ lat: 1, lon: 2, date: "2023-01-01" }, throwing)).toBe(false);
  });
});

describe("advanced guided exploration (optional track)", () => {
  it("keeps the eight core steps and adds an optional, separately addressed track", () => {
    expect(N_GUIDE).toBe(8);
    expect(parseGuide("a1")).toBeNull();
    expect(ADVANCED_STEPS.map((s) => s.id)).toEqual(["stratification", "ts", "quality", "provenance"]);
    expect(parseAdvanced("a1")).toBe(0);
    expect(parseAdvanced("a5")).toBeNull();
    expect(parseAdvanced("3")).toBeNull();
    expect(advancedHref(ADVANCED_STEPS, 1)).toContain("guide=a2");
  });
  it("shows the T-S step only when measured salinity can be served", () => {
    expect(advancedSteps(null).map((s) => s.id)).toContain("ts");
    expect(advancedSteps({ argo_salinity: { status: "database" } }).map((s) => s.id)).toContain("ts");
    expect(advancedSteps({ argo_salinity: { status: "unavailable" } }).map((s) => s.id)).not.toContain("ts");
  });
  it("every advanced step opens a real screen that carries its highlight target", () => {
    const files: Record<string, string> = {
      stratification: "app/(app)/stratification/StratificationScreen.tsx", ts: "app/(app)/ts/TSScreen.tsx",
      "data-quality": "app/(app)/data-quality/DataQualityScreen.tsx", provenance: "app/(app)/provenance/ProvenanceScreen.tsx",
    };
    for (const s of ADVANCED_STEPS) {
      const route = s.path.split("?")[0].slice(1);
      expect(existsSync(join(root, "app", "(app)", route, "page.tsx")), route).toBe(true);
      expect(readFileSync(join(root, files[route]), "utf8")).toContain(`data-guide="${s.target}"`);
    }
  });
});
