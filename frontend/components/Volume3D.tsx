"use client";
/**
 * Lightweight 3-D point cloud of a server-downsampled sub-volume (deck.gl OrbitView, already a
 * dependency of the map). Positions: x/y = longitude/latitude (equirectangular, 1° = 10 units),
 * z = −depth scaled by a vertical exaggeration. Every point is a reconstructed grid cell returned by
 * /v1/volume/sample; nothing is interpolated in the browser.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { COORDINATE_SYSTEM, Deck, OrbitView, type Layer, type PickingInfo } from "@deck.gl/core";
import { LineLayer, PointCloudLayer, TextLayer } from "@deck.gl/layers";
import { RAMPS, type RampName } from "@/lib/colormap";
import type { VolumeSampleResponse } from "@/lib/api";

export interface PickedPoint {
  lat: number;
  lon: number;
  depth: number;
  value: number;
}

interface P {
  position: [number, number, number];
  color: [number, number, number, number];
  i: number;
}

const DEG = 10; // scene units per degree
const Z_SPAN = 60; // scene units for the full requested depth range at exaggeration 1

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Volume3D({
  data,
  ramp,
  vmin,
  vmax,
  exaggeration,
  pointSize,
  slice,
  marker,
  onPick,
}: {
  data: VolumeSampleResponse;
  ramp: RampName;
  vmin: number;
  vmax: number;
  exaggeration: number;
  pointSize: number;
  slice: number | null;
  marker?: { lat: number; lon: number } | null;
  onPick: (p: PickedPoint | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const deck = useRef<Deck<OrbitView> | null>(null);
  const [failed, setFailed] = useState(false);
  const b = data.bbox;
  const lonc = (b.min_lon + b.max_lon) / 2, latc = (b.min_lat + b.max_lat) / 2;
  const zmax = Math.max(...data.depths_m, 1);
  const zOf = (depth: number) => -(depth / zmax) * Z_SPAN * exaggeration;
  const pick = useRef(onPick);
  const dref = useRef(data);
  useEffect(() => {
    pick.current = onPick;
    dref.current = data;
  });

  const points = useMemo<P[]>(() => {
    const f = RAMPS[ramp];
    const span = vmax - vmin || 1;
    const out: P[] = [];
    for (let i = 0; i < data.value.length; i++) {
      if (slice !== null && data.depth[i] !== slice) continue;
      const [r, g, bl] = f((data.value[i] - vmin) / span);
      out.push({ position: [(data.lon[i] - lonc) * DEG, (data.lat[i] - latc) * DEG, zOf(data.depth[i])], color: [r, g, bl, 235], i });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ramp, vmin, vmax, slice, exaggeration]);

  useEffect(() => {
    if (!canvas.current || deck.current) return;
    if (!webglAvailable()) {
      requestAnimationFrame(() => setFailed(true));
      return;
    }
    try {
      const w = canvas.current.clientWidth || 800;
      const extent = Math.max(b.max_lon - b.min_lon, b.max_lat - b.min_lat) * DEG * 1.35;
      deck.current = new Deck<OrbitView>({
        canvas: canvas.current,
        views: new OrbitView({ orbitAxis: "Z", fovy: 45 }),
        initialViewState: { target: [0, 0, -Z_SPAN / 2], rotationX: 38, rotationOrbit: -28, zoom: Math.log2(w / extent), minZoom: -2, maxZoom: 6 },
        controller: true,
        layers: [],
        getTooltip: ({ object }: PickingInfo) => {
          const p = object as P | undefined;
          const v = dref.current;
          if (!p || p.i >= v.value.length) return null;
          return {
            text: `${v.lat[p.i].toFixed(2)}°N ${v.lon[p.i].toFixed(2)}°E · ${v.depth[p.i]} m\n${v.value[p.i].toFixed(2)} ${v.units}`,
            style: { background: "rgba(11,19,32,.92)", color: "#e8edf4", fontSize: "12px", border: "1px solid #2ac3de", borderRadius: "6px", padding: "6px 8px" },
          };
        },
        onClick: ({ object }: PickingInfo) => {
          const p = object as P | undefined;
          const v = dref.current;
          pick.current(p && p.i < v.value.length ? { lat: v.lat[p.i], lon: v.lon[p.i], depth: v.depth[p.i], value: v.value[p.i] } : null);
        },
      });
    } catch {
      requestAnimationFrame(() => setFailed(true));
    }
    return () => {
      deck.current?.finalize();
      deck.current = null;
    };
    // the Deck instance is created once; data-dependent layers are set below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = deck.current;
    if (!d) return;
    const x0 = (b.min_lon - lonc) * DEG, x1 = (b.max_lon - lonc) * DEG, y0 = (b.min_lat - latc) * DEG, y1 = (b.max_lat - latc) * DEG;
    const zb = zOf(zmax);
    const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const frame: { s: [number, number, number]; t: [number, number, number] }[] = [];
    corners.forEach((c, k) => {
      const n = corners[(k + 1) % 4];
      frame.push({ s: [c[0], c[1], 0], t: [n[0], n[1], 0] }, { s: [c[0], c[1], zb], t: [n[0], n[1], zb] }, { s: [c[0], c[1], 0], t: [c[0], c[1], zb] });
    });
    const labels = [
      ...data.depths_m.filter((z) => [0, 100, 200, 500, 1000].includes(z)).map((z) => ({ p: [x0 - 2, y0 - 2, zOf(z)] as [number, number, number], t: `${z} m` })),
      { p: [x0, y0 - 6, 0] as [number, number, number], t: `${b.min_lon}°E` },
      { p: [x1, y0 - 6, 0] as [number, number, number], t: `${b.max_lon}°E` },
      { p: [x1 + 5, y1, 0] as [number, number, number], t: `${b.max_lat}°N` },
      { p: [x1 + 5, y0, 0] as [number, number, number], t: `${b.min_lat}°N` },
    ];
    const layers: Layer[] = [
      new LineLayer({ id: "frame", data: frame, coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, getSourcePosition: (f: { s: number[] }) => f.s as [number, number, number], getTargetPosition: (f: { t: number[] }) => f.t as [number, number, number], getColor: [138, 150, 168, 110], getWidth: 1 }),
      new PointCloudLayer<P>({ id: "volume", data: points, coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, getPosition: (p) => p.position, getColor: (p) => p.color, getNormal: [0, 0, 1], pointSize, sizeUnits: "pixels", pickable: true, material: false }),
      new TextLayer({ id: "labels", data: labels, coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, getPosition: (l: { p: [number, number, number] }) => l.p, getText: (l: { t: string }) => l.t, getSize: 12, getColor: [170, 180, 195, 255], billboard: true, characterSet: "auto", fontFamily: "system-ui, sans-serif" }),
    ];
    if (marker) {
      const mx = (marker.lon - lonc) * DEG, my = (marker.lat - latc) * DEG;
      layers.push(new LineLayer({ id: "marker", data: [{ s: [mx, my, 4], t: [mx, my, zb] }], coordinateSystem: COORDINATE_SYSTEM.CARTESIAN, getSourcePosition: (f: { s: number[] }) => f.s as [number, number, number], getTargetPosition: (f: { t: number[] }) => f.t as [number, number, number], getColor: [46, 197, 216, 255], getWidth: 3 }));
    }
    d.setProps({ layers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, pointSize, marker, exaggeration, data]);

  if (failed)
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-2" role="status">
        3-D rendering needs WebGL, which is not available in this browser. The section and profile views show the same data in 2-D.
      </div>
    );
  return <canvas ref={canvas} className="absolute inset-0 w-full h-full" aria-label="3-D view of the sampled ocean volume; drag to rotate, scroll to zoom" role="img" />;
}
