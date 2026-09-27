/**
 * Colour ramps. Temperature uses a cmocean-"thermal"-style ramp: multi-hue for recognisability
 * (the oceanographic convention requested in docs/12) but *monotonic in lightness*, so it still
 * reads correctly for colour-vision-deficient viewers and in greyscale. Anomaly is diverging
 * blue↔red around a neutral grey; uncertainty is a single-hue violet ramp so it can never be
 * confused with temperature. Derived products (TCHP etc.) reuse the thermal ramp — they are
 * magnitudes of "warmth".
 */
type RGB = [number, number, number];

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

function ramp(stops: string[]) {
  const cols = stops.map(hex);
  return (t: number): RGB => {
    const x = Math.min(1, Math.max(0, t)) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(x));
    const f = x - i;
    const a = cols[i], b = cols[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}

// dark navy → indigo → purple → rose → orange → pale yellow (lightness increases monotonically)
export const THERMAL = ["#04142e", "#172a73", "#3c3b9c", "#6b479d", "#99558f", "#c96578", "#ec7a5a", "#fca046", "#fdd05a", "#f6f7a0"];
export const DIVERGING = ["#1c5cab", "#3987e5", "#86b6ef", "#383835", "#f0a3a3", "#e66767", "#b3282e"];
export const UNCERTAINTY = ["#15132b", "#2c2663", "#4a3aa7", "#7466d6", "#a79cf0", "#dcd7ff"];

export const RAMPS = {
  thermal: ramp(THERMAL),
  diverging: ramp(DIVERGING),
  uncertainty: ramp(UNCERTAINTY),
};
export type RampName = keyof typeof RAMPS;

export function gradientCss(stops: string[]): string {
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Paint a lat-ascending (rows south→north) grid to a canvas with north up. */
export function gridToCanvas(values: (number | null)[][], vmin: number, vmax: number, rampName: RampName, alpha = 235): HTMLCanvasElement {
  const h = values.length;
  const w = values[0]?.length ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const f = RAMPS[rampName];
  const span = vmax - vmin || 1;
  for (let r = 0; r < h; r++) {
    const row = values[h - 1 - r];
    for (let c = 0; c < w; c++) {
      const v = row[c];
      const k = (r * w + c) * 4;
      if (v === null || Number.isNaN(v)) {
        img.data[k + 3] = 0;
        continue;
      }
      const [R, G, B] = f((v - vmin) / span);
      img.data[k] = R;
      img.data[k + 1] = G;
      img.data[k + 2] = B;
      img.data[k + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export const rampStops = (name: RampName) => (name === "thermal" ? THERMAL : name === "diverging" ? DIVERGING : UNCERTAINTY);
