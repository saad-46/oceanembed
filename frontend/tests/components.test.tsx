// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DepthChart from "../components/DepthChart";

vi.mock("next/navigation", () => ({ usePathname: () => "/map" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

// jsdom has neither PointerEvent nor a canvas backend: polyfill the event, stub the context
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {} as typeof MouseEvent;
}
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];

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

describe("Guide me accessibility", () => {
  it("keeps an accessible name when its text is visually hidden (narrow screens)", async () => {
    const { default: GuideMe } = await import("../components/GuideMe");
    render(<GuideMe />);
    const b = screen.getByRole("button", { name: /Guide me: explain the Ocean Map screen/ });
    expect(b.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(b);
    expect(screen.getByRole("dialog", { name: /About Ocean Map/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
