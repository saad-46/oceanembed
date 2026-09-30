// @vitest-environment jsdom
/**
 * The analysis/data workspaces render real API payloads (mocked here with the backend's response shapes)
 * and show calm loading, error, unavailable and mobile states instead of invented values.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ responses: new Map<string, { data?: unknown; error?: string; loading?: boolean }>(), calls: [] as (string | null)[] }));
vi.mock("@/lib/useApi", () => ({
  useApi: (path: string | null) => {
    api.calls.push(path);
    const hit = path ? [...api.responses.entries()].find(([k]) => path.startsWith(k))?.[1] : undefined;
    return { data: hit?.data ?? null, error: hit?.error ?? null, loading: !!hit?.loading, settled: !hit?.loading, retry: vi.fn() };
  },
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams("lat=15&lon=88&date=2023-05-11"), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/stratification", useSearchParams: () => nav.params, useRouter: () => ({ push: nav.push, replace: nav.replace }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
let small = false;
window.matchMedia = ((q: string) => ({ matches: q.includes("max-width") ? small : false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

beforeEach(() => {
  api.responses.clear();
  api.calls.length = 0;
  small = false;
});
afterEach(() => cleanup());

const peak = (over: Record<string, unknown> = {}) => ({
  variable: "temperature", depth_m: 87.5, depth_range_m: [75, 100], gradient_per_m: -0.4, strength_per_m: 0.4, quality: "good",
  quality_reasons: [], n_levels_used: 13, analysis_range_m: [0, 500], gradient_profile: [{ top_m: 75, bottom_m: 100, depth_m: 87.5, gradient: -0.4 }], method: "gradient method", ...over,
});
const strat = (observed: unknown) => ({
  date: "2023-05-11", requested_date: "2023-05-11", lat: 15, lon: 88, cell: { lat: 15.125, lon: 88.125 }, max_depth_m: 500, notice: null,
  reconstructed: { depths_m: [0, 50, 75, 100, 200], temperature_c: [29, 28, 27, 17, 12], uncertainty_c: [0.3, 0.4, 0.6, 0.8, 0.5], thermocline: peak(), mld_m: 50, d20_m: 92, d26_m: 78, provenance: { classification: "derived", source: "x", lineage_id: "thermocline" } },
  observed,
  observed_status: observed ? { status: "available", detail: "Nearest Argo profile" } : { status: "none_nearby", detail: "No Argo profile within 100 km and ±3 days of this point." },
  reanalysis_salinity: null, reanalysis_status: { status: "not_configured", detail: "Subsurface salinity is available through the optional Copernicus Marine GLORYS12V1 reanalysis, which is not configured." },
  diagnostics: { mld: "MLD def", thermocline: "Thermo def", d20: "D20 def", d26: "D26 def", halocline: "Halo def", barrier_layer: "BL def" },
});

describe("Stratification workspace", () => {
  it("shows the loading state while the column is computed", async () => {
    api.responses.set("/v1/stratification", { loading: true });
    const { default: S } = await import("../app/(app)/stratification/StratificationScreen");
    render(<S />);
    expect(screen.getByRole("status").textContent).toMatch(/Computing vertical gradients/);
  });
  it("renders thermocline, MLD, D20, D26 as distinct diagnostics and a calm unavailable salinity state", async () => {
    api.responses.set("/v1/stratification", { data: strat(null) });
    const { default: S } = await import("../app/(app)/stratification/StratificationScreen");
    render(<S />);
    expect(screen.getByText("Different diagnostics, different questions")).toBeTruthy();
    for (const d of ["Mixed-layer depth", "Thermocline", "D26", "D20"]) expect(screen.getAllByText(new RegExp(d)).length).toBeGreaterThan(0);
    expect(screen.getByText("Salinity profile unavailable for this point")).toBeTruthy();
    expect(screen.getByText(/OceanSight reconstructs temperature only/)).toBeTruthy();
    expect(screen.queryByText("Halocline", { selector: "td" })).toBeNull(); // never shown without salinity
    expect(api.calls).toContain("/v1/stratification?lat=15.000&lon=88.000&date=2023-05-11&max_depth=500");
  });
  it("toggling markers off removes them from the charts", async () => {
    api.responses.set("/v1/stratification", { data: strat(null) });
    const { default: S } = await import("../app/(app)/stratification/StratificationScreen");
    const { container } = render(<S />);
    expect(container.textContent).toContain("Thermocline · 88 m");
    fireEvent.click(screen.getByLabelText("Thermocline"));
    expect(container.textContent).not.toContain("Thermocline · 88 m");
  });
  it("shows the API's friendly error with a retry", async () => {
    api.responses.set("/v1/stratification", { error: "This point is on land or outside the study domain (5–30°N, 45–105°E)." });
    const { default: S } = await import("../app/(app)/stratification/StratificationScreen");
    render(<S />);
    expect(screen.getByRole("alert").textContent).toMatch(/on land/);
  });
});

describe("T-S analysis", () => {
  it("renders measured points with density and a disabled reanalysis toggle when not configured", async () => {
    const pts = [0, 10, 50].map((z, k) => ({ depth_m: z + 2.5, temperature_c: 29 - k, salinity_psu: 31 + k, potential_temperature_c: 29 - k, sigma0_kg_m3: 18.5 + k }));
    api.responses.set("/v1/ts-profile", {
      data: {
        date: "2023-05-11", lat: 15, lon: 88, observed: { label: "Argo 2902001 (measured)", date: "2023-05-11", points: pts, argo: { id: 1, platform_number: "2902001", cycle_number: 10, profile_date: "2023-05-11T06:00:00", lat: 15.1, lon: 88.1, distance_km: 15.2, date_offset_days: 0, split: "test", independent: true }, mixed_layers: null, provenance: { classification: "measured", source: "Argo" } },
        observed_status: { status: "available", detail: "ok" }, reanalysis: null, reanalysis_status: { status: "not_configured", detail: "Not configured." },
        isopycnals: [{ sigma0: 20, points: [[31, 25], [33, 28]] }], axes: {}, reconstructed_note: "OceanSight reconstructs temperature only.", method: "TEOS-10 (gsw)",
      },
    });
    const { default: T } = await import("../app/(app)/ts/TSScreen");
    render(<T />);
    expect(screen.getByRole("img", { name: /Temperature–salinity diagram/ })).toBeTruthy();
    expect(screen.getByText(/Data table \(3 points\)/)).toBeTruthy();
    const rea = screen.getByText("Show reanalysis").closest("span")!.querySelector("input")!;
    expect(rea.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Show Argo (measured)"));
    expect(screen.getByText(/All series are hidden/)).toBeTruthy();
  });
  it("explains when no measured profile is nearby instead of plotting anything", async () => {
    api.responses.set("/v1/ts-profile", { data: { date: "2023-05-11", lat: 25, lon: 60, observed: null, observed_status: { status: "none_nearby", detail: "No Argo profile within 100 km." }, reanalysis: null, reanalysis_status: { status: "not_configured", detail: "x" }, isopycnals: [], axes: {}, reconstructed_note: "n", method: "m" } });
    const { default: T } = await import("../app/(app)/ts/TSScreen");
    render(<T />);
    expect(screen.getByText("No measured profile nearby")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Temperature–salinity diagram/ })).toBeNull();
  });
});

describe("Short-horizon estimate", () => {
  it("states its method and limitations, and labels itself Forecast (not AI)", async () => {
    const H = (h: number) => ({ horizon_days: h, target_date: `2023-05-1${1 + h}`, temperature_c: [29.1], uncertainty_c: [0.4], method_rmse_c: [0.1], persistence_c: [29], persistence_rmse_c: [0.12], n_hindcast_pairs: 60, verification_c: [29.05] });
    api.responses.set("/v1/forecast", { data: { issue_date: "2023-05-11", requested_date: "2023-05-11", lat: 15, lon: 88, cell: { lat: 15.125, lon: 88.125 }, depths_m: [0], method: "trend", method_label: "Short-horizon estimate from the recent temporal trend: least-squares line through the last 7 reconstructed days, extrapolated.", window_days: 7, input_period: { start: "2023-05-05", end: "2023-05-11", n_days: 7 }, hindcast_days: 60, issue_temperature_c: [29], reconstruction_uncertainty_c: [0.3], horizons: [H(1), H(2)], limitations: ["Not a trained forecast model: a statistical extrapolation."], notice: null, provenance: { classification: "forecast", source: "s", model_version: "cnn-unet-v1" } } });
    const { default: F } = await import("../components/ForecastPanel");
    const { container } = render(<F lat={15} lon={88} date="2023-05-11" />);
    expect(container.textContent).toMatch(/least-squares line through the last 7 reconstructed days/);
    expect(container.textContent).toMatch(/Not a trained forecast model/);
    expect(container.textContent).not.toMatch(/\bAI\b/);
    expect(screen.getAllByText("Forecast").length).toBeGreaterThan(0);
  });
  it("shows the insufficient-history message", async () => {
    api.responses.set("/v1/forecast", { error: "A short-horizon estimate needs more reconstructed history before this day." });
    const { default: F } = await import("../components/ForecastPanel");
    render(<F lat={15} lon={88} date="2019-01-02" />);
    expect(screen.getByRole("alert").textContent).toMatch(/more reconstructed history/);
  });
});

describe("3-D ocean", () => {
  it("falls back to 2-D alternatives on small screens without requesting the volume", async () => {
    small = true;
    const { default: V } = await import("../app/(app)/3d/Ocean3DScreen");
    render(<V />);
    expect(await screen.findByText("3D visualization is optimized for larger screens.")).toBeTruthy();
    expect(screen.getAllByText("Vertical section").length).toBeGreaterThan(0);
    expect(api.calls.every((c) => c === null || !c.startsWith("/v1/volume"))).toBe(true);
  });
  it("requests a budgeted sample on larger screens", async () => {
    small = false;
    const { default: V } = await import("../app/(app)/3d/Ocean3DScreen");
    render(<V />);
    await screen.findByText("Sample");
    expect(api.calls).toContain("/v1/volume/sample?date=2023-05-11&min_lat=5&max_lat=22&min_lon=80&max_lon=100&min_depth=0&max_depth=500&variable=temp");
  });
});

describe("Uncertainty presentation", () => {
  it("shows prediction ± σ, the ±1σ/±2σ ranges and measured coverage", async () => {
    api.responses.set("/v1/validation/summary", { data: { held_out_period: "2023-01-01..2023-12-31", uncertainty_calibration: { frac_within_1sigma: 0.6, frac_within_2sigma: 0.9, calibrated: { frac_within_1sigma: 0.7, frac_within_2sigma: 0.94, fit_on: "val (2022)" } } } });
    const { default: U } = await import("../components/UncertaintyPanel");
    const { container } = render(<U depths={[0, 100]} temps={[29, 22]} sigmas={[0.3, 1.0]} />);
    expect(container.textContent).toContain("22.00 °C");
    expect(container.textContent).toContain("± 1.00 °C");
    expect(container.textContent).toContain("21.00 – 23.00 °C");
    expect(container.textContent).toContain("20.00 – 24.00 °C");
    expect(container.textContent).toMatch(/70 % of measurements fell within ±1σ/);
    expect(container.textContent).not.toMatch(/95 ?% confidence/i);
    fireEvent.click(screen.getByRole("radio", { name: "0" }));
    expect(container.textContent).toContain("29.00 °C");
  });
});
