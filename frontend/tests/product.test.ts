import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV, NAV_GROUPS } from "../components/AppShell";
import { GLOSSARY } from "../lib/glossary";

const root = join(__dirname, "..");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
const SOURCES = ["app", "components", "lib"].flatMap((d) => files(join(root, d)));

/** Product language: none of these may appear anywhere in the application source. */
const BANNED: [RegExp, string][] = [
  [/\bSIH\d*/, "competition code"],
  [/hackathon/i, "hackathon"],
  [/\bjudges?\b/i, "judge"],
  [/\bpresenter\b/i, "presenter"],
  [/(?<!Offline )\bdemo\b/i, "demo"], // "Offline Demo Mode" is the product's own name for the no-backend state
  [/\bsubmission\b/i, "submission"],
  [/\bprototype\b/i, "prototype"],
  [/\bpitch\b/i, "pitch"],
  [/codecrafters/i, "team name"],
  [/\bteam\b/i, "team"],
  [/problem[ _]statement/i, "problem statement"],
  [/oceanembed/i, "former code name"],
  [/\bINCOIS\b|\bMoES\b|Ministry of Earth/i, "sponsor"],
  [/\bour (ai|solution|innovation|project)\b/i, "promotional first person"],
  [/proof[- ]of[- ]concept/i, "prototype framing"],
  [/predicts? the ocean/i, "forecast claim"],
];

describe("product language", () => {
  it.each(BANNED)("no %s in the product (%s)", (re) => {
    const hits = SOURCES.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
    expect(hits).toEqual([]);
  });
  it("offline copies of API responses (served to users when the service is down) are clean too", () => {
    const dir = join(root, "public", "fallback");
    const bad = readdirSync(dir).filter((f) => /SIH\d|OceanEmbed|INCOIS|problem_statement|docs\/|hackathon/.test(readFileSync(join(dir, f), "utf8")));
    expect(bad).toEqual([]);
  });
  it("public metadata presents OceanSight as a product", () => {
    const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
    expect(layout).toContain("OceanSight — Subsurface Ocean Intelligence");
    expect(layout).toContain("openGraph");
    expect(existsSync(join(root, "app/icon.svg"))).toBe(true);
  });
});

describe("information architecture", () => {
  it("navigation is organised by task", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Explore", "Analyze", "Data", "Validate", "Report", "Learn"]);
  });
  it("every navigation entry is a real page", () => {
    for (const n of NAV) expect(existsSync(join(root, "app", "(app)", n.href.slice(1), "page.tsx")), n.href).toBe(true);
  });
  it("retired routes redirect instead of breaking old links", () => {
    for (const r of ["app/(app)/overview/page.tsx", "app/tour/page.tsx", "app/demo/page.tsx", "app/guide/page.tsx"]) {
      expect(readFileSync(join(root, r), "utf8")).toContain("redirect(");
    }
  });
});

describe("contextual help", () => {
  it("covers the scientific terms used across the product with two levels", () => {
    for (const k of ["tchp", "d26", "d20", "mld", "argo", "uncertainty", "climatology", "reconstruction", "thermocline", "isotherm", "cross_section", "temporal_evolution"]) {
      const t = GLOSSARY[k as keyof typeof GLOSSARY];
      expect(t, k).toBeTruthy();
      expect(t.simple.length).toBeGreaterThan(40);
      expect(t.technical.length).toBeGreaterThan(40);
    }
  });
});
