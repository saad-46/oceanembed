"use client";
/**
 * MapLibre (offline GeoJSON basemap — no tile CDN, docs/16 §6) + deck.gl overlay (docs/11).
 * The temperature raster is a BitmapLayer painted client-side from the API grid, positioned in
 * LNGLAT image coordinates so the equirectangular 0.25° grid is reprojected exactly.
 */
import { useEffect, useRef } from "react";
import { Map as MLMap, NavigationControl, ScaleControl, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { BitmapLayer, PathLayer, PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { gridToCanvas, type RampName } from "@/lib/colormap";
import type { ArgoMarker, BBox } from "@/lib/api";

export interface RasterSpec {
  values: (number | null)[][];
  vmin: number;
  vmax: number;
  ramp: RampName;
  key: string;
}
export interface TrackSpec {
  path: [number, number][];
  points?: { lon: number; lat: number; value: number | null; label?: string }[];
  highlight?: number;
}

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    land: { type: "geojson", data: "/geo/land.json" },
    borders: { type: "geojson", data: "/geo/borders.json" },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#07101c" } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": "#1a2331" } },
    { id: "coast", type: "line", source: "land", paint: { "line-color": "#3b4a5f", "line-width": 0.7 } },
    { id: "borders", type: "line", source: "borders", paint: { "line-color": "#2d3a4d", "line-width": 0.6, "line-dasharray": [2, 2] } },
  ],
};
const DOMAIN_BOUNDS: [number, number, number, number] = [45, 5, 105, 30];

export default function OceanMap({
  raster,
  argo,
  track,
  bbox,
  point,
  onClick,
  onHover,
  onArgoClick,
  fitDomain = true,
  mapRef,
  minimal = false,
}: {
  raster?: RasterSpec | null;
  argo?: ArgoMarker[] | null;
  track?: TrackSpec | null;
  bbox?: BBox | null;
  point?: { lat: number; lon: number } | null;
  onClick?: (lat: number, lon: number) => void;
  onHover?: (p: { lat: number; lon: number } | null) => void;
  onArgoClick?: (m: ArgoMarker) => void;
  fitDomain?: boolean;
  mapRef?: React.MutableRefObject<MLMap | null>;
  minimal?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const canvasCache = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const handlers = useRef({ onClick, onHover, onArgoClick });
  useEffect(() => {
    handlers.current = { onClick, onHover, onArgoClick };
  });

  useEffect(() => {
    if (!el.current) return;
    const m = new MLMap({
      container: el.current,
      style: STYLE,
      bounds: DOMAIN_BOUNDS,
      fitBoundsOptions: { padding: 12 },
      maxBounds: [
        [20, -15],
        [130, 45],
      ],
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    m.touchZoomRotate.disableRotation();
    if (!minimal) {
      m.addControl(new NavigationControl({ showCompass: true, visualizePitch: false }), "top-right");
      m.addControl(new ScaleControl({ unit: "metric" }), "bottom-right");
    }
    const ov = new MapboxOverlay({ interleaved: true, layers: [] });
    m.addControl(ov);
    m.on("mousemove", (e: MapMouseEvent) => handlers.current.onHover?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    m.on("mouseout", () => handlers.current.onHover?.(null));
    m.on("click", (e: MapMouseEvent) => {
      const picked = ov.pickObject({ x: e.point.x, y: e.point.y, radius: 4, layerIds: ["argo"] });
      if (picked?.object) {
        handlers.current.onArgoClick?.(picked.object as ArgoMarker);
        return;
      }
      handlers.current.onClick?.(e.lngLat.lat, e.lngLat.lng);
    });
    map.current = m;
    overlay.current = ov;
    if (mapRef) mapRef.current = m;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      overlay.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (fitDomain && map.current) map.current.fitBounds(DOMAIN_BOUNDS, { padding: 12, duration: 0 });
  }, [fitDomain]);

  useEffect(() => {
    const ov = overlay.current;
    if (!ov) return;
    const layers: Layer[] = [];
    if (raster) {
      if (canvasCache.current?.key !== raster.key) {
        canvasCache.current = { key: raster.key, canvas: gridToCanvas(raster.values, raster.vmin, raster.vmax, raster.ramp) };
      }
      layers.push(
        new BitmapLayer({
          id: "raster",
          image: canvasCache.current.canvas,
          bounds: DOMAIN_BOUNDS,
          _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
          textureParameters: { minFilter: "nearest", magFilter: "nearest" },
          beforeId: "land",
        } as ConstructorParameters<typeof BitmapLayer>[0] & { beforeId: string }),
      );
    }
    if (bbox) {
      layers.push(
        new PolygonLayer({
          id: "bbox",
          data: [[[bbox.min_lon, bbox.min_lat], [bbox.max_lon, bbox.min_lat], [bbox.max_lon, bbox.max_lat], [bbox.min_lon, bbox.max_lat]]],
          getPolygon: (d: number[][]) => d,
          filled: true,
          getFillColor: [42, 195, 222, 25],
          getLineColor: [42, 195, 222, 230],
          lineWidthMinPixels: 1.5,
          stroked: true,
        }),
      );
    }
    if (track) {
      layers.push(
        new PathLayer({
          id: "track",
          data: [{ path: track.path }],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [232, 237, 244, 200],
          widthMinPixels: 2,
          getDashArray: [4, 3],
        }),
      );
      if (track.points) {
        layers.push(
          new ScatterplotLayer({
            id: "track-pts",
            data: track.points.map((p, i) => ({ ...p, i })),
            getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
            getRadius: (d: { i: number }) => (d.i === track.highlight ? 9 : 4),
            radiusUnits: "pixels",
            getFillColor: (d: { value: number | null; i: number }) =>
              d.i === track.highlight ? [42, 195, 222, 255] : d.value === null ? [93, 104, 120, 200] : [246, 247, 160, 230],
            getLineColor: [10, 14, 20, 255],
            lineWidthMinPixels: 1.5,
            stroked: true,
            updateTriggers: { getRadius: track.highlight, getFillColor: track.highlight },
          }),
        );
      }
    }
    if (argo && argo.length) {
      layers.push(
        new ScatterplotLayer({
          id: "argo",
          data: argo,
          pickable: true,
          getPosition: (d: ArgoMarker) => [d.lon, d.lat],
          getRadius: 5,
          radiusUnits: "pixels",
          getFillColor: (d: ArgoMarker) => (d.independent ? [25, 158, 112, 235] : [138, 150, 168, 200]),
          getLineColor: [10, 14, 20, 255],
          lineWidthMinPixels: 2,
          stroked: true,
        }),
      );
    }
    if (point) {
      layers.push(
        new ScatterplotLayer({
          id: "point",
          data: [point],
          getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
          getRadius: 7,
          radiusUnits: "pixels",
          filled: false,
          stroked: true,
          getLineColor: [42, 195, 222, 255],
          lineWidthMinPixels: 2.5,
        }),
      );
    }
    ov.setProps({ layers });
  }, [raster, argo, track, bbox, point]);

  return <div ref={el} className="absolute inset-0" role="application" aria-label="Interactive ocean map" />;
}
