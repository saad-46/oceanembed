# 11 · GIS / Map System

## 1. Library choice

**MapLibre GL JS (base map, navigation, controls) + Deck.gl (`BitmapLayer`/`GridLayer` for the reconstructed temperature raster, `IconLayer` for Argo float markers, `PathLayer` for cyclone track replay).** Both are open-source, both run in the browser via WebGL, and Deck.gl is purpose-built to sit on top of MapLibre for exactly this kind of large-array geospatial overlay. No 3D globe/terrain engine (Cesium) is needed — this is a 2D regional lat/lon grid problem.

## 2. Layers

| Layer | Type | Source | Purpose |
|---|---|---|---|
| Base map | MapLibre vector/raster basemap (e.g. free MapLibre demo style, or a minimal custom dark-ocean style) | Static | Coastlines, country borders for orientation |
| Reconstructed temperature | Deck.gl raster/grid layer, one per selected depth | Precomputed daily grid (`08`) | The core output |
| Uncertainty overlay | Deck.gl raster layer, toggleable, semi-transparent hatching or a second color ramp | Precomputed uncertainty grid | Should-have feature #10 |
| Argo float markers | Deck.gl icon/scatter layer | Argo metadata table (PostGIS) | Click-to-inspect validation points |
| Cyclone track (Wow feature) | Deck.gl path layer | Static historical track (Mocha/Biparjoy) | Demo narrative |
| Region-of-interest bounding box | MapLibre draw control or simple click-drag | Client-side | Region selection |

## 3. Interaction features

- **Depth selector**: a slider/dropdown for the 15 standard depths — re-renders the raster layer client-side from the already-fetched daily cube (no server round-trip needed once a date's data is loaded).
- **Date/time slider**: scrubs through the study period; debounced fetch of that day's precomputed grid.
- **Click-to-inspect**: clicking any ocean cell fetches (from cache) the full 15-depth profile + uncertainty at that point and opens the profile chart panel.
- **Hover tooltip**: shows lat/lon, current depth's temperature, and uncertainty band under the cursor.
- **Legend**: a color-ramp legend for temperature (sequential, colorblind-safe — see `dataviz` guidance) and a separate legend for uncertainty.
- **Coordinate display**: current cursor lat/lon shown in the map's corner.
- **Region selection / bounding box**: for the "Analysis" screen (compute regional TCHP mean, etc.).
- **Scale bar + north arrow**: standard GIS conventions, cheap to add, expected by a scientific/government audience.
- **Export**: "download current view as PNG" (client-side canvas export) and "download this profile as CSV."
- **Time-lapse / animation**: auto-advance the date slider for the demo's seasonal-cycle narrative (Wow-adjacent, cheap once the slider exists).

## 4. What's explicitly NOT built

- **3D terrain/globe rendering** — not needed for a 2D regional grid; would be a demo distraction, not substance.
- **Contour line generation** — a filled raster with a good color ramp communicates the same information faster to a judge in a 5-minute demo; contouring is a nice-to-have polish item only if time allows.
- **Full GIS layer-management UI** (drag-reorder layers, arbitrary layer styling) — over-engineered for a single-purpose PoC with ~5 fixed layers.

## 5. Serving the data efficiently

- Precomputed daily grids are stored as small GeoTIFF or JSON-encoded arrays (100×240×15 floats ≈ manageable per day) and served directly by the FastAPI backend — no tile server needed at this data volume.
- The backend caches the last N requested date/depth combinations in memory to avoid repeated disk reads during a live demo.
- If judges want to explore many dates in a row, the frontend prefetches the next/previous day in the background once a date is selected.
