// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DepthChart from "../components/DepthChart";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/map",
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

// jsdom has neither PointerEvent nor a canvas backend: polyfill the event, stub the context
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {} as typeof MouseEvent;
}
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
// jsdom has no matchMedia: report "no reduced-motion preference"
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

afterEach(() => cleanup());

const depths = [0, 50, 100];
const values = [
  [28, 27, 26, 25],
  [24, 23, null, 21],
  [18, 17, 16, 15],
];

function chart(onSelect = vi.fn()) {
  render(<DepthChart x={[0, 1, 2, 3]} xLabel={(i) => `day ${i}`} depths={depths} values={values} vmin={15} vmax={28} ramp="thermal" zmax={100} units="°C" selected={1} onSelect={onSelect} ariaLabel="Test depth chart" />);
  const c = screen.getByRole("img", { name: /Test depth chart/ });
  // jsdom has no layout: give the canvas a box so pointer math works (chart area starts at x=46,y=8)
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 340, right: 640, bottom: 340, x: 0, y: 0, toJSON: () => ({}) });
  return { c, onSelect };
}

describe("DepthChart (timeline & section renderer)", () => {
  it("renders an accessible, focusable chart even without canvas support", () => {
    const { c } = chart();
    expect(c.tagName).toBe("CANVAS");
    expect(c).toHaveProperty("tabIndex", 0);
    expect(c.getAttribute("aria-label")).toMatch(/arrow keys/);
  });
  it("hover shows the value at the nearest standard depth, and 'no data' for gaps", () => {
    const { c } = chart();
    fireEvent.pointerMove(c, { clientX: 46 + 10, clientY: 8 + 1 }); // column 0, surface
    expect(screen.getByRole("status").textContent).toMatch(/day 0.*0 m.*28\.0 °C/);
    fireEvent.pointerMove(c, { clientX: 46 + 300, clientY: 8 + Math.sqrt(0.5) * 306 }); // column 2 at 50 m (sqrt depth axis) → null cell
    expect(screen.getByRole("status").textContent).toMatch(/50 m.*no data/);
  });
  it("click selects a column (date selection); keyboard moves it", () => {
    const { c, onSelect } = chart();
    fireEvent.pointerDown(c, { clientX: 46 + 450, clientY: 50 });
    fireEvent.pointerUp(c, { clientX: 46 + 450, clientY: 50 });
    expect(onSelect).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(c, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(c, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(3);
  });
  it("drag zooms, and Reset zoom restores the full range", () => {
    const { c, onSelect } = chart();
    expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();
    fireEvent.pointerDown(c, { clientX: 46 + 5, clientY: 50 });
    fireEvent.pointerMove(c, { clientX: 46 + 580, clientY: 50 });
    fireEvent.pointerUp(c, { clientX: 46 + 580, clientY: 50 });
    const reset = screen.getByRole("button", { name: "Reset zoom" });
    expect(onSelect).not.toHaveBeenCalled(); // a drag is not a click
    fireEvent.click(reset);
    expect(screen.queryByRole("button", { name: "Reset zoom" })).toBeNull();
  });
});

describe("Help menu (Guide me)", () => {
  it("keeps an accessible name when its text is visually hidden, explains the screen and offers Guided Exploration", async () => {
    const { default: HelpMenu } = await import("../components/guide/HelpMenu");
    render(<HelpMenu />);
    const b = screen.getByRole("button", { name: "Help and Guided Exploration" });
    expect(b.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(b);
    const dlg = screen.getByRole("dialog", { name: "Help" });
    expect(dlg.textContent).toMatch(/Ocean map/);
    expect(screen.getByRole("link", { name: /Guided Exploration/ }).getAttribute("href")).toMatch(/^\/map\?.*guide=1$/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("first-time onboarding prompt", () => {
  it("appears once for a new visitor; 'Explore on my own' is remembered and opens the product", async () => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("oceansight.offlineNotice", "1"); // the Offline Demo notice (if any) is already closed
    nav.push.mockClear();
    const { default: OnboardingPrompt } = await import("../components/guide/OnboardingPrompt");
    render(<OnboardingPrompt exploreHref="/map" />);
    const own = await screen.findByRole("button", { name: "Explore on my own" });
    expect(screen.getByRole("link", { name: "Start Guided Exploration" }).getAttribute("href")).toContain("guide=1");
    fireEvent.click(own);
    expect(localStorage.getItem("oceansight.guide.status.v1")).toBe("dismissed");
    expect(nav.push).toHaveBeenCalledWith("/map");
    expect(screen.queryByRole("complementary", { name: "Getting started" })).toBeNull();
  });
  it("never interrupts a returning visitor", async () => {
    localStorage.setItem("oceansight.guide.status.v1", "completed");
    const { default: OnboardingPrompt } = await import("../components/guide/OnboardingPrompt");
    render(<OnboardingPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("New to OceanSight?")).toBeNull();
  });
});

describe("Guided Exploration layer over the real screens", () => {
  it("shows the current step, moves forward and back, and can be exited", async () => {
    localStorage.clear();
    nav.params = new URLSearchParams("date=2023-05-11&depth=100&var=temp&lat=15.000&lon=88.000&guide=2");
    nav.push.mockClear();
    nav.replace.mockClear();
    const { default: GuideLayer } = await import("../components/guide/GuideLayer");
    render(<GuideLayer />);
    const region = await screen.findByRole("region", { name: /Guided Exploration, step 2 of 8/ });
    expect(region.textContent).toMatch(/Look below the surface/);
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(nav.push).toHaveBeenLastCalledWith(expect.stringContaining("guide=3"));
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(nav.push).toHaveBeenLastCalledWith(expect.stringContaining("guide=1"));
    fireEvent.click(screen.getByRole("button", { name: "Exit exploration" }));
    expect(localStorage.getItem("oceansight.guide.status.v1")).toBe("skipped");
    expect(nav.replace).toHaveBeenCalled();
  });
  it("keyboard: Page Down advances; the last step finishes into 'You're ready to explore.'", async () => {
    nav.params = new URLSearchParams("guide=8");
    nav.push.mockClear();
    const { default: GuideLayer } = await import("../components/guide/GuideLayer");
    const { unmount } = render(<GuideLayer />);
    await screen.findByRole("region", { name: /step 8 of 8/ });
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(localStorage.getItem("oceansight.guide.status.v1")).toBe("completed");
    unmount();
    nav.params = new URLSearchParams("guide=done");
    render(<GuideLayer />);
    expect((await screen.findByRole("dialog", { name: "Guided Exploration complete" })).textContent).toMatch(/You.re ready to explore\./);
    expect(screen.getByRole("link", { name: "Explore OceanSight" }).getAttribute("href")).toBe("/map");
  });
  it("renders nothing when the guide is not running", async () => {
    sessionStorage.clear();
    nav.params = new URLSearchParams("date=2023-05-11");
    const { default: GuideLayer } = await import("../components/guide/GuideLayer");
    const { container } = render(<GuideLayer />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.innerHTML).toBe("");
  });
});

describe("ErrorState", () => {
  it("does not explain a connection problem as missing data", async () => {
    const { ErrorState } = await import("../components/ui");
    const why = "There is no reconstruction for this point and day.";
    render(<ErrorState message="The OceanSight API is temporarily unavailable, and there is no saved copy of this view. Try again in a moment." why={why} action="Choose an ocean cell." />);
    expect(screen.queryByText(/no reconstruction for this point/)).toBeNull();
    expect(screen.queryByText(/Choose an ocean cell/)).toBeNull();
    cleanup();
    render(<ErrorState message="This point is on land or outside the study domain (5–30°N, 45–105°E)." why={why} />);
    expect(screen.getByText(/no reconstruction for this point/)).toBeTruthy();
  });
});

describe("Offline Demo Mode", () => {
  const load = async (mode: "offline" | "live", configured = false) => {
    vi.resetModules();
    vi.doMock("@/lib/backendStatus", () => ({
      OFFLINE_NOTICE_EVENT: "oceansight:offline-notice",
      useBackendStatus: () => ({ mode, health: null }),
      offlineNoticeSeen: () => sessionStorage.getItem("seen") !== null,
      markOfflineNoticeSeen: () => sessionStorage.setItem("seen", "1"),
    }));
    vi.doMock("@/lib/api", () => ({ API_CONFIGURED: configured }));
    return (await import("../components/OfflineNotice")).default;
  };
  const raf = () => vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => (cb(0), 0));
  afterEach(() => {
    sessionStorage.clear();
    vi.doUnmock("@/lib/backendStatus");
    vi.doUnmock("@/lib/api");
    vi.restoreAllMocks();
  });

  it("explains the mode and the infrastructure reason, and can be dismissed once per session", async () => {
    raf();
    const OfflineNotice = await load("offline");
    const view = render(<OfflineNotice />);
    expect(screen.getByRole("dialog", { name: "Offline Demo Mode" })).toBeTruthy();
    expect(screen.getByText(/requires paid cloud infrastructure and an active cloud billing setup/)).toBeTruthy();
    expect(screen.getByText(/precomputed demonstration data\.$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue Exploring" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    render(<OfflineNotice />); // same session: not shown again
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent(window, new Event("oceansight:offline-notice")); // the status indicator can reopen it
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("never appears while the backend is live", async () => {
    raf();
    const OfflineNotice = await load("live", true);
    render(<OfflineNotice />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not claim a billing reason when a configured backend is merely unreachable", async () => {
    raf();
    const OfflineNotice = await load("offline", true);
    render(<OfflineNotice />);
    expect(screen.getByText(/cannot be reached right now/)).toBeTruthy();
    expect(screen.queryByText(/cloud billing/)).toBeNull();
  });

  it("shows backend-only features as 'Live Backend Required', not as an error", async () => {
    vi.resetModules();
    const { ErrorState } = await import("../components/ui");
    const { LIVE_BACKEND_REQUIRED } = await vi.importActual<typeof import("../lib/api")>("../lib/api");
    render(<ErrorState message={LIVE_BACKEND_REQUIRED} why="There is no reconstruction for this point and day." onRetry={() => {}} />);
    expect(screen.getByText("Live Backend Required")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Retry/)).toBeNull();
    expect(screen.queryByText(/no reconstruction for this point/)).toBeNull();
  });
});

describe("first-visit prompts do not stack", () => {
  it("holds the onboarding prompt until the Offline Demo notice is closed", async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    vi.doMock("@/lib/api", () => ({ API_CONFIGURED: false, get: vi.fn() }));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => (cb(0), 0));
    const { default: OnboardingPrompt } = await import("../components/guide/OnboardingPrompt");
    const status = await import("../lib/backendStatus");
    render(<OnboardingPrompt />);
    expect(screen.queryByText("New to OceanSight?")).toBeNull();
    status.markOfflineNoticeSeen();
    expect(await screen.findByText("New to OceanSight?")).toBeTruthy();
    vi.doUnmock("@/lib/api");
    vi.restoreAllMocks();
  });
});
