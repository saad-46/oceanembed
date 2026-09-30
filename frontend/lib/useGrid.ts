"use client";
import { useEffect, useState } from "react";
import { friendlyError, get, type Fetched, type GridResponse } from "./api";
import { addDays } from "./dates";

export type LayerVar = "temp" | "uncertainty" | "anomaly" | "tchp" | "mld" | "d20" | "d26" | "salinity" | "sla" | "wind";
/** Column or surface layers: no depth selection. */
export const PRODUCT_VARS: LayerVar[] = ["tchp", "mld", "d20", "d26", "sla", "wind"];

export function gridPath(date: string, depth: number, v: LayerVar) {
  if (v === "salinity") return `/v1/salinity/${date}?depth=${depth}`;
  if (v === "sla") return `/v1/surface/${date}?variable=sla`;
  if (v === "wind") return `/v1/surface/${date}?variable=wind_speed`;
  return PRODUCT_VARS.includes(v) ? `/v1/grid/${date}/product?product=${v}` : `/v1/grid/${date}?depth=${depth}&variable=${v}`;
}

const cache = new Map<string, Promise<Fetched<GridResponse>>>();
function fetchGrid(path: string) {
  let p = cache.get(path);
  if (!p) {
    p = get<GridResponse>(path);
    p.catch(() => cache.delete(path));
    cache.set(path, p);
    if (cache.size > 120) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

const lockedRanges = new Map<string, [number, number]>();

function rangeFor(g: GridResponse, depth: number, v: LayerVar): [number, number] | null {
  if (!g.stats) return null;
  // colour range locked per (variable, depth) at first load so animation doesn't re-scale colours
  const key = `${v}|${PRODUCT_VARS.includes(v) ? "" : depth}`;
  let r = lockedRanges.get(key);
  if (!r) {
    const { min, max } = g.stats;
    if (v === "anomaly" || v === "sla") {
      const m = Math.max(0.5, Math.ceil(Math.max(Math.abs(min), Math.abs(max)) * 2) / 2);
      r = [-m, m];
    } else if (v === "uncertainty") r = [0, Math.max(0.2, Math.ceil(max * 10) / 10)];
    else if (v === "tchp") r = [0, Math.max(50, Math.ceil(max / 10) * 10)];
    else if (v === "wind") r = [0, Math.max(5, Math.ceil(max))];
    else r = [Math.floor(min), Math.ceil(max)];
    lockedRanges.set(key, r);
  }
  return r;
}

/** Loads a grid, keeps the previous frame while the next loads (no flash), prefetches +/-1 day. */
export function useGrid(date: string, depth: number, v: LayerVar) {
  const path = gridPath(date, depth, v);
  const [st, setSt] = useState<{ path: string | null; grid: Fetched<GridResponse> | null; range: [number, number] | null; error: string | null }>({ path: null, grid: null, range: null, error: null });
  useEffect(() => {
    let alive = true;
    fetchGrid(path)
      .then((g) => {
        if (!alive) return;
        setSt({ path, grid: g, range: rangeFor(g, depth, v), error: null });
        [1, -1].forEach((n) => fetchGrid(gridPath(addDays(date, n), depth, v)).catch(() => {}));
      })
      .catch((e) => alive && setSt((s) => ({ ...s, path, error: friendlyError(e) })));
    return () => {
      alive = false;
    };
  }, [path, date, depth, v]);
  const settled = st.path === path;
  return { grid: st.grid, range: st.range, error: settled ? st.error : null, loading: !settled };
}

export function sampleGrid(g: GridResponse | null, lat: number, lon: number): number | null {
  if (!g) return null;
  const i = Math.floor((lat - 5) / 0.25);
  const j = Math.floor((lon - 45) / 0.25);
  if (i < 0 || i >= g.grid.values.length || j < 0 || j >= g.grid.values[0].length) return null;
  return g.grid.values[i][j];
}
