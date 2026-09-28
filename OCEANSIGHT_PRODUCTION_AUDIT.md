# OceanSight — Production Audit (final state)

Date: 2026-09-29 · scope: Ocean State Timeline, interactive vertical section, and three small fixes, on top of
the audited product (see `OCEANSIGHT_FEATURE_INVENTORY.md`). All results below were measured on the
**production build** (`next build` → standalone server on :3100, API on :8100 against the real 2019–2023 stores).

## 1. What changed

| Area | Change | Files |
|---|---|---|
| API | `GET /v1/timeline?lat&lon&start&end[&stride_days]` — reconstructed temperature at the 15 standard depths for one 0.25° cell through time, derived MLD/D20/D26 and the seasonal climatology (for anomalies). Read-only, LRU-cached (64 entries), ≤ 400 samples (auto-stride; explicit strides that exceed it → 422 `range_too_large`); ranges are clipped to 2019–2023 with a notice. | `backend/app/api/grid.py` |
| API | `GET /v1/section/{day}` gains `orientation=zonal|meridional` (+ `lon`, `lat_min`, `lat_max`) and `variable=temp|anomaly|uncertainty`; returns generic `x`/`values`. Backwards compatible (default zonal temperature, `temperature_c` kept). No new data processing: the same day cube, sliced. | `backend/app/api/grid.py` |
| Web | `/timeline` — depth × time chart, MLD/D20/D26 overlays, anomaly view, depth range, IBTrACS passage markers, hover, drag-zoom, click/arrow-key day selection, play/pause (off under reduced motion), selected-day readouts + the real profile, *Explore this state* → map. | `app/(app)/timeline/*`, `components/DepthChart.tsx`, `lib/ocean.ts` |
| Web | `/section` — longitude or latitude transect, fixed coordinate, from/to, date ±1 day, variable, max depth, presets, locator map (click to move the line), 20/26 °C isotherms, hover, drag-zoom/reset, *Open in Map*, column → profile / timeline. | `app/(app)/section/*` |
| Links | Map panel: *Explore this section*, *View through time*; profile drawer & Profiles page: *View through time*, *Section here*; tour stage 6: *Explore Ocean State Timeline*; sidebar: Timeline, Sections; Guide me text for both. | `MapScreen.tsx`, `ProfilePanel.tsx`, `AppShell.tsx`, `GuideMe.tsx`, `tour/LiveStages.tsx` |
| Fix | Shared request cache: concurrent identical requests share one call; results reused for a TTL (15 s for `/health`, 5 min for immutable data); errors never cached; *Retry* bypasses the cache. | `lib/requestCache.ts`, `lib/useApi.ts` |
| Fix | Guide me: accessible name at every width. | `components/GuideMe.tsx` |
| Chore | Package renamed `oceansight-frontend`. | `package.json`, lockfile, `docs/18_DEPLOYMENT.md` |
| Offline | Snapshots for the default timeline (15°N 88°E, 2023) and default section — 96 files. | `scripts/snapshot_fallback.py` |

## 2. Scientific integrity checks

- Timeline and section values are the reconstructed grid cells (labelled **Reconstructed**); anomaly = reconstruction −
  model climatology (**Derived**); section uncertainty = served calibrated σ (**Estimated**).
- MLD/D20/D26 on the timeline come from the precomputed derived-product store (same numbers as the map layers).
  Section isotherms are traced only between the two standard depths that bracket 20 / 26 °C; null where the column never
  crosses them or a gap interrupts it (unit-tested).
- Display colours blend vertically between standard depths and never across a null; hover reports the value at the
  **nearest standard depth**, not an interpolated number. Sections never interpolate horizontally.
- Cyclone markers are IBTrACS closest approach (≤ 300 km) — **Measured**. The selected-day note quotes reconstructed
  surface temperatures before/after and says: *"The temperature structure changed following the passage; this view alone
  does not establish the cause."* Example (production): Mocha passed 72 km from 15°N 88°E on 2023-05-12; reconstructed
  SST 31.1 °C (05-09) → 29.3 °C (05-16).
- No model code, calculation, schema or data file was changed.

## 3. Performance (production)

| Measurement | Result |
|---|---|
| `/v1/timeline` 1 year daily (366 samples), cold | 1.58 s |
| same, repeated (cache) | 0.25 s (≈ the API's baseline latency) |
| `/v1/timeline` 2019–2023 (auto 5-day stride, 366 samples), cold / cached | 1.50 s / 0.27 s |
| `/v1/timeline` 4 months daily | 0.43 s |
| timeline payload | 74 kB raw / **16 kB gzip** |
| `/v1/section` meridional 88°E / zonal 50–100°E anomaly | 0.26 s / 0.24 s; 2–4 kB gzip |
| Timeline chart redraw (366 samples, React update + canvas) | 7–55 ms |
| Duplicate API requests per page (/map, /insights, /timeline) | **0** (was 2× `/health`, 2× `/v1/meta`) |

The whole-record point read that took ~2.9 s in the audit is avoided: the endpoint reads only the requested day chunks
and caps the sample count.

## 4. Reliability (API, automated)

Valid timeline; out-of-domain and on-land points; missing `lat`; reversed range (422 `invalid_range`); range outside
2019–2023 (404); impossible date (422); stride bound (422); explicit stride over the sample cap (422
`range_too_large`); partial overlap clipped with a notice; masked depths returned as `null`; cache reuse;
meridional/zonal sections; anomaly and uncertainty variables; reversed or sub-cell transects; unknown orientation or
variable; out-of-range latitude; invalid and out-of-period dates.

## 5. Accessibility

Charts are focusable `role="img"` canvases with descriptive labels; arrow keys / Shift / Home / End move the selected
day or column; the hover readout is a `role="status"` region; Reset zoom is a labelled button; play is hidden under
`prefers-reduced-motion`; Guide me is named at every width (verified at 375 px: text hidden, `aria-label` present).

## 6. Test results (this pass)

| Suite | Result |
|---|---|
| pytest (backend + ML + PostGIS) | **53 passed** (46 existing + 7 new) |
| vitest (frontend) | **42 passed** (12 existing + 30 new: ocean science helpers, URL state, request cache, chart geometry, DepthChart DOM behaviour, Guide me a11y) |
| ESLint / TypeScript | clean / clean |
| `next build` | success (includes `/timeline` and `/section`) |
| Browser, production, 1440 px | timeline (hover, day select → URL + profile, overlays, cyclone note, Explore this state → map, map → View through time); section (latitude transect, longitude transect, anomaly, date step, drag-zoom + reset, Open in Map) |
| Browser, production, 375 px | timeline and section: no horizontal overflow (`scrollWidth` 375), chart ≈ 310 px wide, Guide me named |
| GitHub Actions | see the commit's CI run (backend pytest + frontend lint/typecheck/test/build) |

Not automated: pixel-level chart rendering (jsdom has no canvas; covered by browser checks) and the play animation.

## 7. Risks & known limits

- First timeline request for a new point/range costs ~1.5 s (disk reads of up to 366 day chunks); later ones are cached.
- The cache is per API process and in memory (64 timelines); restarts clear it.
- Offline snapshots cover only the default timeline and section; other points need the API.
- On very long ranges the 5-day stride can alias short events (e.g. a cyclone's 2–3-day cooling); the UI says so, and
  the *Mocha window* preset shows it daily.
- The dev server's reload loop in the embedded browser is unchanged — demo from the production build.

## 8. Recommendation

The exploration loop **space → depth → time → compare → validate** is complete. Stop feature work; next steps are
deployment (hosting accounts) and production hardening (process supervision, cache warm-up, metrics).
