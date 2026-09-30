import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLut, columnValueAt, depthToFrac, fracToDepth, nearestDepthIndex, zoomRange } from "../components/DepthChart";
import type { CycloneTrack } from "../lib/api";
import {
  cyclonePassages, haversineKm, isothermDepth, mapStateHref, parseSectionParams, parseTimelineParams, sectionApiPath, sectionFromMap,
  sectionHref, sectionMapHref, timelineHref, traceIsotherm, viewState,
} from "../lib/ocean";
import { cachedRequest, clearRequestCache, ttlFor } from "../lib/requestCache";

const D = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000];
const qs = (o: Record<string, string>) => new URLSearchParams(o);

describe("isotherms are traced only where the reconstructed column brackets them", () => {
  const col = [29, 29, 28.9, 28.5, 28, 27, 26.5, 25, 23, 21, 18, 13, 9, 7, 6];
  it("interpolates between the bracketing standard depths", () => {
    expect(isothermDepth(col, D, 26)).toBeCloseTo(75 + (0.5 / 1.5) * 25, 6); // between 75 m (26.5) and 100 m (25)
    expect(isothermDepth(col, D, 20)).toBeCloseTo(150 + (1 / 3) * 50, 6);
  });
  it("returns null instead of inventing a depth", () => {
    expect(isothermDepth(col.map((t) => t - 10), D, 26)).toBeNull(); // surface already colder
    expect(isothermDepth(col.map(() => 30), D, 26)).toBeNull(); // never crosses
    expect(isothermDepth([29, 28, null, 20, ...col.slice(4)], D, 26)).toBeNull(); // gap before the crossing
    expect(isothermDepth([...col.slice(0, 14), null], D, 20)).toBeCloseTo(166.667, 2); // gap below is irrelevant
  });
  it("traces across a [depth][x] matrix", () => {
    const m = D.map((_, k) => [col[k], col[k] - 20]);
    expect(traceIsotherm(m, D, 26)).toEqual([expect.closeTo(83.333, 2), null]);
  });
});

describe("cyclone passages come straight from IBTrACS points", () => {
  const track = (name: string, pts: [string, number, number][]): CycloneTrack => ({
    id: 1, sid: "x", name, season: 2023, peak_category: null, start: pts[0][0], end: pts[pts.length - 1][0],
    points: pts.map(([time, lat, lon]) => ({ time, lat, lon, category: null, grade: null, wind_kt: 50 })),
  });
  const tracks = [track("Cyclone Near 2023", [["2023-05-10T00:00:00", 12, 88], ["2023-05-11T06:00:00", 15.5, 88.2]]), track("Cyclone Far 2023", [["2023-05-12T00:00:00", 20, 60]])];
  it("keeps storms within the radius, at their closest approach", () => {
    const p = cyclonePassages(tracks, 15, 88, "2023-01-01", "2023-12-31");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ name: "Cyclone Near 2023", date: "2023-05-11" });
    expect(p[0].km).toBeLessThan(70);
  });
  it("respects the date range", () => expect(cyclonePassages(tracks, 15, 88, "2023-06-01", "2023-12-31")).toEqual([]));
  it("haversine sanity: 1° of latitude ≈ 111 km", () => expect(haversineKm(10, 80, 11, 80)).toBeCloseTo(111.2, 0));
});

describe("timeline URL state (location & date selection, map synchronisation)", () => {
  it("defaults to the Bay of Bengal in 2023", () => {
    expect(parseTimelineParams(qs({}))).toMatchObject({ lat: 15, lon: 88, start: "2023-01-01", end: "2023-12-31", date: "2023-05-11", view: "temp", zmax: 500 });
  });
  it("centres one year on a date arriving from the map/profile", () => {
    const p = parseTimelineParams(qs({ lat: "12.5", lon: "70", date: "2021-06-15" }));
    expect(p).toMatchObject({ lat: 12.5, lon: 70, date: "2021-06-15", start: "2020-12-15", end: "2021-12-14" });
  });
  it("clamps to the domain and period, swaps reversed ranges, rejects impossible dates", () => {
    const p = parseTimelineParams(qs({ lat: "99", lon: "10", start: "2024-03-01", end: "2018-01-01", date: "2023-02-30", zmax: "37" }));
    expect(p.lat).toBe(30);
    expect(p.lon).toBe(45);
    expect([p.start, p.end]).toEqual(["2019-01-01", "2023-12-31"]);
    expect(p.date).toBe("2019-01-01");
    expect(p.zmax).toBe(500);
  });
  it("round-trips through its href", () => {
    const p = parseTimelineParams(qs({ lat: "10", lon: "60", start: "2022-01-01", end: "2022-12-31", date: "2022-07-15", view: "anomaly", zmax: "200" }));
    expect(parseTimelineParams(new URL(timelineHref(p), "http://x").searchParams)).toEqual(p);
  });
  it("'Explore this state' opens the map at the same point and day", () => {
    expect(mapStateHref("2023-05-11", 15, 88)).toBe("/map?date=2023-05-11&depth=100&var=temp&lat=15.000&lon=88.000");
  });
});

describe("section URL state and API mapping (controls, Open in Map)", () => {
  it("longitude transect = zonal slice at a fixed latitude", () => {
    const p = parseSectionParams(qs({ dir: "lon", at: "15", from: "80", to: "97", date: "2023-05-11" }));
    expect(sectionApiPath(p)).toBe("/v1/section/2023-05-11?variable=temp&orientation=zonal&lat=15&lon_min=80&lon_max=97");
  });
  it("latitude transect = meridional slice at a fixed longitude", () => {
    const p = parseSectionParams(qs({ dir: "lat", at: "88", from: "20", to: "5", variable: "anomaly" }));
    expect([p.from, p.to]).toEqual([5, 20]); // reversed input is swapped
    expect(sectionApiPath(p)).toContain("orientation=meridional&lon=88&lat_min=5&lat_max=20");
    expect(sectionApiPath(p)).toContain("variable=anomaly");
  });
  it("guards invalid transects before calling the API", () => {
    const p = parseSectionParams(qs({ dir: "lon", at: "50", from: "90", to: "90", variable: "salinity", date: "nope" }));
    expect(p.at).toBe(30);
    expect(p.to - p.from).toBeGreaterThanOrEqual(0.5);
    expect(p.variable).toBe("temp");
    expect(p.date).toBe("2023-05-11");
  });
  it("round-trips, links to the map at the midpoint, and opens from a map point", () => {
    const p = parseSectionParams(qs({ dir: "lat", at: "65", from: "5", to: "25", date: "2022-08-01", zmax: "1000" }));
    expect(parseSectionParams(new URL(sectionHref(p), "http://x").searchParams)).toEqual(p);
    expect(sectionMapHref(p)).toBe("/map?date=2022-08-01&depth=100&var=temp&lat=15.000&lon=65.000");
    expect(sectionFromMap("2023-05-11", 15, 100)).toContain("from=88&to=105"); // clamped to the domain
    expect(sectionFromMap("2023-05-11", null, null)).toContain("at=15&from=80&to=97");
  });
});

describe("view state: loading / error / empty / ready", () => {
  it("classifies fetch results", () => {
    expect(viewState({ loading: true, error: null, values: null })).toBe("loading");
    expect(viewState({ loading: false, error: "boom", values: [[1]] })).toBe("error");
    expect(viewState({ loading: false, error: null, values: [[null, null]] })).toBe("empty");
    expect(viewState({ loading: false, error: null, values: null })).toBe("empty");
    expect(viewState({ loading: true, error: null, values: [[1, null]] })).toBe("ready"); // keep showing while refreshing
  });
});

describe("depth chart geometry", () => {
  it("uses a square-root depth axis", () => {
    expect(depthToFrac(250, 1000)).toBeCloseTo(0.5);
    expect(fracToDepth(0.5, 1000)).toBeCloseTo(250);
  });
  it("hover reports the nearest standard depth", () => {
    expect(D[nearestDepthIndex(85, D)]).toBe(75);
    expect(D[nearestDepthIndex(90, D)]).toBe(100);
  });
  it("display blending never crosses a gap", () => {
    expect(columnValueAt([20, 10, ...Array(13).fill(5)], D, 2.5)).toBeCloseTo(15);
    expect(columnValueAt([20, null, ...Array(13).fill(5)], D, 2.5)).toBeNull();
  });
  it("drag-to-zoom maps pixels to an index window; tiny drags are clicks", () => {
    expect(zoomRange(100, 300, 400, 0, 100)).toEqual([25, 74]);
    expect(zoomRange(100, 102, 400, 0, 100)).toBeNull();
  });
  it("colour lookup spans the ramp", () => {
    const lut = buildLut("thermal", 16);
    expect(lut).toHaveLength(16);
    expect(lut[0]).toEqual([4, 20, 46]);
  });
});

describe("shared request cache (duplicate /health and /v1/meta)", () => {
  afterEach(() => clearRequestCache());
  it("concurrent callers share one request", async () => {
    const f = vi.fn(() => Promise.resolve({ ok: 1 }));
    const [a, b] = await Promise.all([cachedRequest("/health", f), cachedRequest("/health", f)]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
  it("reuses a fresh result, refetches after the TTL, and Retry forces the network", async () => {
    const f = vi.fn(() => Promise.resolve(1));
    await cachedRequest("/v1/meta", f);
    await cachedRequest("/v1/meta", f);
    expect(f).toHaveBeenCalledTimes(1);
    await cachedRequest("/v1/meta", f, { now: Date.now() + ttlFor("/v1/meta") + 1 });
    expect(f).toHaveBeenCalledTimes(2);
    await cachedRequest("/v1/meta", f, { force: true });
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("never caches errors", async () => {
    const bad = vi.fn(() => Promise.reject(new Error("down")));
    await expect(cachedRequest("/v1/x", bad)).rejects.toThrow("down");
    const good = vi.fn(() => Promise.resolve(2));
    await expect(cachedRequest("/v1/x", good)).resolves.toBe(2);
  });
  it("health stays fresher than data", () => expect(ttlFor("/health")).toBeLessThan(ttlFor("/v1/meta")));
});
