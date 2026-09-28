import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fallbackKey } from "../lib/api";
import { GUIDE_STEPS, N_GUIDE, REF_DATE, clampGuide, panelCorner, parseGuide, readGuideStatus, shouldPromptOnboarding, stepDone, stepHref, writeGuideStatus } from "../lib/guide";
import { gridPath } from "../lib/useGrid";

const root = join(__dirname, "..");
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const route = (href: string) => href.split("?")[0].slice(1);

describe("Guided Exploration steps", () => {
  it("teaches the product in eight steps, in workflow order", () => {
    expect(N_GUIDE).toBe(8);
    expect(GUIDE_STEPS.map((s) => s.id)).toEqual(["location", "depth", "profile", "timeline", "section", "validate", "event", "report"]);
  });
  it("every step opens a real application screen and carries its step index", () => {
    GUIDE_STEPS.forEach((s, i) => {
      const href = stepHref(i);
      expect(href).toContain(`guide=${i + 1}`);
      expect(existsSync(join(root, "app", "(app)", route(href), "page.tsx")), href).toBe(true);
      expect(parseGuide(new URLSearchParams(href.split("?")[1]).get("guide"))).toBe(i);
    });
  });
  it("every highlighted target exists on its screen", () => {
    const sources: Record<string, string> = {
      map: ["app/(app)/map/MapScreen.tsx"].map((f) => readFileSync(join(root, f), "utf8")).join(""),
      timeline: readFileSync(join(root, "app/(app)/timeline/TimelineScreen.tsx"), "utf8"),
      section: readFileSync(join(root, "app/(app)/section/SectionScreen.tsx"), "utf8"),
      validation: readFileSync(join(root, "app/(app)/validation/ValidationScreen.tsx"), "utf8"),
      analysis: readFileSync(join(root, "app/(app)/analysis/AnalysisScreen.tsx"), "utf8"),
      reports: readFileSync(join(root, "app/(app)/reports/ReportsScreen.tsx"), "utf8"),
    };
    for (const s of GUIDE_STEPS) {
      const src = sources[route(s.path)] ?? "";
      expect(src.includes(`data-guide="${s.target}"`) || src.includes(`guide="${s.target}"`), `${s.id} → ${s.target}`).toBe(true);
    }
  });
  it("parses deep links, including the completion panel, and rejects junk", () => {
    expect(parseGuide("1")).toBe(0);
    expect(parseGuide("8")).toBe(7);
    expect(parseGuide("done")).toBe("done");
    expect(parseGuide("0")).toBeNull();
    expect(parseGuide("9")).toBeNull();
    expect(parseGuide(null)).toBeNull();
    expect(clampGuide(42)).toBe(7);
  });
  it("step 1 is done only once the user has picked a point on the map", () => {
    const step = GUIDE_STEPS[0];
    expect(stepDone(step, "/map", new URLSearchParams("date=2023-05-11"))).toBe(false);
    expect(stepDone(step, "/map", new URLSearchParams("lat=15&lon=88"))).toBe(true);
    expect(stepDone(step, "/timeline", new URLSearchParams("lat=15&lon=88"))).toBe(false);
  });
});

describe("onboarding memory", () => {
  it("remembers completed / skipped / dismissed and can be reset", () => {
    const s = memStore();
    expect(readGuideStatus(s)).toBeNull();
    for (const v of ["completed", "skipped", "dismissed"] as const) {
      writeGuideStatus(v, s);
      expect(readGuideStatus(s)).toBe(v);
    }
    writeGuideStatus(null, s);
    expect(readGuideStatus(s)).toBeNull();
  });
  it("prompts only first-time visitors who are not already in the guide", () => {
    expect(shouldPromptOnboarding(null, false)).toBe(true);
    expect(shouldPromptOnboarding(null, true)).toBe(false);
    expect(shouldPromptOnboarding("dismissed", false)).toBe(false);
    expect(shouldPromptOnboarding("completed", false)).toBe(false);
  });
  it("survives storage that throws (private mode)", () => {
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(readGuideStatus(bad)).toBeNull();
    expect(() => writeGuideStatus("completed", bad)).not.toThrow();
  });
});

describe("guide panel placement", () => {
  it("moves away from the highlighted element", () => {
    const vw = 1440, vh = 900;
    expect(panelCorner(null, vw, vh)).toBe("br");
    expect(panelCorner({ left: 1000, top: 600, right: 1440, bottom: 900 }, vw, vh)).not.toBe("br"); // target bottom-right
    expect(panelCorner({ left: 0, top: 0, right: 1440, bottom: 500 }, vw, vh)).toBe("br"); // target along the top
  });
});

describe("offline copies cover every request the guide makes", () => {
  const has = (path: string) => existsSync(join(root, "public", "fallback", `${fallbackKey(path)}.json`));
  it("map, profile, timeline, section and validation steps", () => {
    for (const p of [
      gridPath(REF_DATE, 0, "temp"),
      gridPath(REF_DATE, 100, "temp"),
      `/v1/argo/markers?date=${REF_DATE}&window_days=3`,
      `/v1/profile/${REF_DATE}?lat=15.000&lon=88.000`,
      "/v1/timeline?lat=15.000&lon=88.000&start=2023-01-01&end=2023-12-31",
      `/v1/section/${REF_DATE}?variable=temp&orientation=zonal&lat=15&lon_min=80&lon_max=97`,
      "/v1/validation/summary?split=test",
      "/v1/cyclones",
      "/v1/meta",
      "/v1/summary/headline",
    ])
      expect(has(p), p).toBe(true);
  });
  it("the cyclone step (track, heat content and uncertainty along it)", () => {
    const tracks = JSON.parse(readFileSync(join(root, "public", "fallback", `${fallbackKey("/v1/cyclones")}.json`), "utf8")).tracks as { id: number; name: string }[];
    const mocha = tracks.find((t) => t.name.includes("Mocha"))!;
    const fuelPath = `/v1/cyclones/${mocha.id}/fuel?lead_days=2`;
    expect(has(fuelPath)).toBe(true);
    const fuel = JSON.parse(readFileSync(join(root, "public", "fallback", `${fallbackKey(fuelPath)}.json`), "utf8"));
    for (const d of new Set<string>(fuel.points.map((p: { ocean_date: string | null }) => p.ocean_date).filter(Boolean))) expect(has(`/v1/grid/${d}/product?product=tchp`), d).toBe(true);
  });
});
