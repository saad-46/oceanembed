# OceanSight — Feature Inventory & Gap Analysis

Audit date: 2026-09-29 · first audited after `d1f3432`; **updated after the Timeline / Section pass** (see §8).
Method: read the code (routes, endpoints, components, store, ML modules), probed the running API with valid and
invalid inputs, ran every test suite, rebuilt production and browser-checked the production server (not dev).
**Audit only — no product code was changed.**

## 1. Feature inventory

| Feature | Implemented | Location | API / Backend | Frontend | Tested | Notes |
|---|---|---|---|---|---|---|
| Landing page (hero section, metrics, story, preview, validation, tour band) | ✅ | `app/page.tsx`, `components/landing/*` | `/v1/summary/headline`, `/v1/meta`, `/v1/section` | real-data cross-section, count-up metrics | browser (prod) | metrics all API-driven except test count (static 46) |
| App shell (sidebar, status, top bar, mobile drawer) | ✅ | `components/AppShell.tsx` | `/health` | live API/offline pill, data period, model | browser + vitest | duplicate `/health`/`/v1/meta` fixed by the shared request cache (`lib/requestCache.ts`) |
| Overview | ✅ | `app/(app)/overview` | headline, meta, section, region/stats | tiles, section, quick launch, BoB/AS cards | browser | |
| Ocean map — 7 layers | ✅ | `app/(app)/map/MapScreen.tsx`, `components/OceanMap.tsx` | `/v1/grid/{day}` (temp / anomaly / uncertainty), `/v1/grid/{day}/product` (tchp, mld, d26, d20) | MapLibre 5 + deck.gl raster, legend, hover readout | API tests + browser | backend also serves an `sss` product that is not exposed on the map |
| Depth exploration (15 standard depths) | ✅ | MapScreen depth slider + chips | `depth=` validated (422 on non-standard) | slider, chips | API test + probe | |
| Time-lapse (date animation) | ✅ | MapScreen `playing` | ±1-day prefetch in `useGrid` | play/pause, date slider, prev/next day | browser | |
| Argo observation overlay | ✅ | MapScreen + OceanMap `argo` layer | `/v1/argo/markers` (PostGIS) | held-out vs training colouring, click → profile | API + PostGIS tests | `/v1/argo/{id}` endpoint exists but is unused by the frontend |
| Cyclone track overlay | ✅ | MapScreen / Analysis | `/v1/cyclones` (26 IBTrACS tracks) | line + points | API test | |
| Water-column profile | ✅ | `components/ProfilePanel.tsx`, `ProfileChart.tsx`, `app/(app)/profiles` | `/v1/profile/{day}` | ±σ band, climatology, LightGBM, no-SSS, HYCOM target, Argo dots, thermal column, derived chips | API tests + browser | |
| Argo comparison at a point | ✅ | ProfilePanel | nearest float via PostGIS (distance, date offset, independence flag) | dots + caption | API test | |
| Model comparison (per profile) | ✅ | ProfilePanel "Compare with" | `comparisons` in profile payload | toggles | API test | map-level model switching absent (grid accepts `model=`, UI never sends it) |
| Uncertainty (calibrated σ) | ✅ | map layer, profile band, validation tiles, tour | `sigma_cal` (per-depth a_k fitted on 2022) | layer + band + coverage stats | API + ML tests | |
| Anomaly vs climatology | ✅ | map layer, Insights card, demo step 4 | `variable=anomaly` | diverging ramp | API test | |
| Derived products (TCHP, MLD, D20, D26) | ✅ | `ml/evaluation/derived_products.py`, product stores | `/grid/{day}/product`, profile `derived` | map layers, chips, Explain popovers | ML tests | |
| Vertical section (interactive) | ✅ | `app/(app)/section`, `components/DepthChart.tsx` | `/v1/section/{day}` — zonal or meridional, temp / anomaly / uncertainty | longitude or latitude transect, date, variable, depth range, 20/26 °C isotherms, hover, drag-zoom/reset, map locator, Open in Map | API + vitest + browser | landing/overview keep the fixed 15°N hero section |
| **Ocean State Timeline** (signature) | ✅ | `app/(app)/timeline`, `components/DepthChart.tsx`, `lib/ocean.ts` | `GET /v1/timeline` (cached, ≤400 samples, auto-stride) | depth × time heat-map, MLD/D20/D26, anomaly view, cyclone passages, day selection → profile, play, map↔timeline links | API + vitest + browser | reads only the requested day chunks; 1.5 s cold / 0.25 s cached |
| Region analysis | ✅ | `app/(app)/analysis` | `POST /v1/region/stats`, `POST /v1/region/timeseries` | draw box, presets, stat tiles, product time series (TCHP/MLD/D26/D20) | API tests | time series = area mean of products only (not depth-resolved) |
| Cyclone Fuel Gauge | ✅ | Analysis cyclone mode, `components/FuelGauge.tsx` | `/v1/cyclones/{id}/fuel?lead_days=` | gauge, track stepping, provenance badges | API test + browser | |
| Validation | ✅ | `app/(app)/validation` | `/v1/validation/summary|scatter|profiles|grid|en4` | method strip, RMSE-by-depth, scatter, per-depth table, float list, architecture table, EN4 | API tests + browser | |
| Insights (computed cards) | ✅ | `components/InsightCards.tsx` | region stats, anomaly/σ grids, fuel | 5 cards with provenance | browser | |
| Satellite embedding + explainability | ✅ | Insights | `/v1/embedding/projection`, `/v1/explain/importance` | seasonal PCA facets, LightGBM importance | API test | U-Net itself has no attribution (importance is for the LightGBM baseline — labelled as such) |
| Location assistant | ✅ | Insights, ProfilePanel "Summarise" | `POST /v1/assistant/query` (templated; optional LLM phrasing) | ask form + presets | API test | default `llm_model` in `config.py` is `claude-opus-5` (only used if a key is set) |
| Reports & export | ✅ | `app/(app)/reports` | `/v1/report/{day}?format=pdf|csv` | 6 export cards with states, PDF preview | API test + browser | reports are point-only; no region/cyclone PDF |
| Map PNG export | ✅ | MapScreen `exportPng` | — | button | manual | |
| Methodology | ✅ | `app/(app)/methodology` + `components/PipelineFlow.tsx` | — | interactive pipeline, sources, claims/limits | browser | |
| Guided tour (9 stages, live data) | ✅ | `app/tour`, `components/tour/*`, `lib/tour.ts` | reuses existing endpoints | deep links, keyboard, reduced motion | vitest + browser | |
| Presenter demo (8 steps) | ✅ | `app/demo`, `components/DemoBar.tsx`, `lib/demo.ts` | reuses existing endpoints | presenter bar, clicker keys | vitest + browser (all 8 steps) | |
| Contextual help | ✅ | `components/GuideMe.tsx`, `Explain.tsx`, `lib/glossary.ts` | — | per-screen guide, 10 two-level glossary terms | vitest + browser | |
| Data provenance labels | ✅ | `KindBadge` (measured / reconstructed / derived / estimated / baseline) | `data_label`, `model_version`, `source` in every payload | DataBadge + KindBadge | browser | |
| Model versioning | 🟡 | `model_registry.json`, DB `model_registry` | `model_version` in every response, `/v1/meta` lists models | shown in shell/footers | API test | read-only; no UI to choose a model version on the map |
| Offline fallback | ✅ | `lib/api.ts`, `public/fallback` (94 snapshots), `scripts/snapshot_fallback.py` | — | "cached" badge | vitest (coverage of tour/demo calls) | covers the demo scenario, not arbitrary dates |
| Typed API errors | ✅ | `backend/app/errors.py` | `{error, detail}`; 404 / 422 probed | ErrorState what/why/what-to-do + retry | API tests + probes | |
| Saved state | 🟡 | URL params (map, profiles, reports, tour step, **timeline, section**), local/session storage (tour status, demo step) | — | deep links work | vitest | no saved investigations / bookmarks list (deferred by decision) |
| System status | ✅ | sidebar + top bar | `/health` (DB + store) | pill + status block | API test | |
| Observability | 🟡 | `oceanembed.access` log middleware, typed error logging | request logs | — | — | no metrics endpoint / request timing dashboard |
| Security | ✅ | CORS allow-list (3100 only), `.env` untracked, `.env.example` only | foreign origin gets no ACAO; no stack traces in errors | — | probe | `/docs` is public (intended for judges) |

## 2. Audit against the earlier product-evolution requests

| Capability | Status | Evidence |
|---|---|---|
| Advanced ocean explorer | ✅ | map: 7 layers × 15 depths × 1826 days, hover, click-profile, overlays |
| Time-lapse | ✅ | MapScreen play with neighbour prefetch |
| Depth dive | ✅ | depth slider on map; tour stage 5; Timeline and Section give continuous depth views |
| 3D / vertical visualization | ✅ | interactive section + timeline + profile (3D remains ❌ not appropriate) |
| Compare mode | 🟡 | model comparison per profile ✅; validation model table ✅; no side-by-side dates/regions on the map |
| Anomaly explorer | ✅ | anomaly layer at any depth/day, insight card |
| Uncertainty exploration | ✅ | σ layer, band, calibration coverage |
| Observation overlay | ✅ | Argo markers + nearest-float comparison |
| Model explainability | 🟡 | embedding projection + LightGBM importance; no attribution for the production U-Net |
| Smart insights | ✅ | 5 computed cards + assistant |
| Saved investigations / bookmarks | 🔴 | only URL deep links |
| Smart search | ❌ | domain is one fixed basin; presets + deep links cover navigation; place-name search would add a geocoder dependency for little value |
| Report builder | 🟡 | point PDF/CSV + JSON exports; no region or cyclone report |
| Data provenance | ✅ | measured / reconstructed / derived / estimated everywhere it matters |
| Model versioning | 🟡 | versions reported; not selectable |
| System status | ✅ | health pill + sidebar |
| Production UX | ✅ | loading/error/empty states, fallback, deep links |
| Accessibility | ✅ | keyboard (charts: arrow keys), focus, reduced motion, labels; Guide-me now named at every width |
| Mobile | ✅ | no horizontal overflow at 375 px on all 11 routes |
| Security | ✅ | see table above |
| Observability | 🟡 | access logs only |

## 3. What is genuinely missing (grouped, not scored)

### Essential
*None.* Nothing blocks the SIH demo or misrepresents the science.

### Valuable — scientific depth
1. **Ocean State Timeline at a point (signature feature)** — pick a location and see the full column evolve through
   time: a depth × time heat-map (surface–1000 m, 2019–2023 or one year) with the MLD / D20 / D26 lines and anomaly toggle,
   linked to the date on the map. It shows the monsoon cycle, deepening and shoaling of the thermocline and post-cyclone cooling.
   *Not a duplicate:* `region/timeseries` is area-mean 2-D products only; the map and profile are single-day.
   *Feasible:* the U-Net store is chunked one day per chunk (`[1,15,100,240]` int16), and one point's full
   `(1826, 15)` series reads in **~2.9 s** cold (fast with a per-point cache, or a 1-year window). Needs one read-only endpoint; no schema change.
2. **Interactive vertical section** — let users choose the latitude (and later a longitude line) on the map and see
   the section for the current date. The `/v1/section` endpoint already supports any lat / lon range; only the UI is fixed.
   Together with (1) this is the "depth dive" done properly outside the tour.
3. **Cyclone before/after cooling view** — reuse the fuel data + anomaly grids to show the cold wake along a track (ocean state before vs. after passage).
   Scientifically strong but must be labelled descriptive; lower priority than 1–2.

### Valuable — product
4. **Request de-duplication in `useApi`** (shared in-flight cache): `/health` and `/v1/meta` are fetched twice per page.
5. **Region / cyclone report** (PDF) reusing the existing report service — currently point-only.

### Optional
6. Map-level model switch (the `model=` API parameter already exists) for expert comparison.
7. Saved investigations (named list of deep links in localStorage).
8. Expose the existing `sss` product as a map layer (barrier-layer context).
9. Small fixes: Guide-me accessible name on narrow screens; `llm_model` default ID; `package.json` name is still `gahan-frontend`.

**Recommended signature feature:** the **Ocean State Timeline** (1), paired with the **interactive section** (2).
They are the two views the product cannot yet show — how the column changes over *time* and along *space* —
and both come straight from data and endpoints that already exist.

## 4. Production-quality findings

- **Performance:** a grid is 132 kB raw / **18 kB gzipped** (GZip middleware on). API latency is 0.21–0.40 s for all probed endpoints.
  The production JS is 3.2 MB across all chunks (MapLibre + deck.gl dominate; pages lazy-load the map).
  Duplicate `/health` and `/v1/meta` fetches (no shared cache). Nothing else is duplicated.
- **Reliability (probed):** out-of-range date → 404 `date_out_of_range`; impossible date → 422; non-standard or huge depth → 422
  with the valid list; out-of-domain and on-land points → 422; unknown cyclone → 404; inverted bbox or section → 422.
  Report on an invalid point → 422 with the reason, which the export card shows.
- **Accessibility:** keyboard tour/demo, focus moves to stage headings, reduced motion honoured, dialogs close on Esc.
  One unlabelled control: the Guide-me button below `sm`.
- **Security:** CORS allow-list only (foreign origins get no `Access-Control-Allow-Origin`); `.env` is not tracked;
  errors carry no stack traces; the optional LLM key is read only from the environment.
- **Maintainability:** no duplicate map / profile / report systems (the gauge was extracted and shared).
  Unused endpoints: `/v1/dates`, `/v1/argo/{id}` (harmless). No unused npm dependencies.

## 5. Risks

- The dev server (`next dev`) can reload in a loop in the embedded browser — **always demo on the production build**.
- The offline fallback covers only the demo scenario dates; any other date needs the API.
- The first API request after a cold start is ~4 s (store and DB-pool warm-up) — warm the server before presenting.
- A timeline endpoint reading all 1826 day chunks would be the slowest call in the API; it needs caching or a bounded window.
- Deployment is still local only (no hosting accounts).

## 6. Architecture (as built)

```
Browser (Next.js 16 App Router, React 19, MapLibre 5 + deck.gl 9.4, Recharts 3)
  ├─ static offline snapshots  /fallback/*.json  (94 files, demo scenario)
  ▼  REST (CORS allow-list, GZip)
FastAPI  /health · /v1/{meta,summary,grid,profile,section,region,cyclones,validation,argo,embedding,explain,assistant,report}
  ├─ GridStore → Zarr (int16, 1 day/chunk): predictions ×3 models (1826×15×100×240), products (TCHP/MLD/D20/D26/SSS),
  │              climatology, σ calibration, HYCOM target days
  └─ PostgreSQL 16 + PostGIS: region, model_registry, daily_product, argo_profile, prediction_at_argo,
                              skill_metric, cyclone_track, track_point
ML (offline): ingestion (OISST, SMAP/SMOS, NOAA altimetry SLA+currents, NCEI winds, HYCOM, Argo, EN4, IBTrACS)
  → clean / regrid 0.25° → features → climatology · LightGBM · U-Net (+ no-SSS) → σ calibration
  → precompute all days → Argo / EN4 validation → metrics JSON
```

## 7. Testing status (this audit, production build)

| Check | Result |
|---|---|
| Backend + ML + PostGIS (pytest) | **46 passed** |
| Frontend unit (vitest) | **12 passed** |
| ESLint | clean |
| TypeScript | clean |
| `next build` (production) | success — 14 static pages |
| Route smoke test on the production server | all 11 routes 200; unknown route 404 |
| API negative probes | 11/11 return the correct typed error |
| Browser (production): map, insights | render; request audit above |
| GitHub Actions (latest runs) | success |

## 8. Update — Timeline & Section pass (2026-09-29)

Implemented exactly the approved scope; nothing else.

| Item | Result |
|---|---|
| Ocean State Timeline | `/timeline` + `GET /v1/timeline`; MAP → PROFILE → TIMELINE → MAP links (map panel, profile drawer, section column, tour stage 6) |
| Interactive vertical section | `/section` using the existing `/v1/section` endpoint, extended with `orientation` (zonal / meridional) and `variable` — the old zonal parameters and `temperature_c` key still work |
| Duplicate `/health`, `/v1/meta` | cause: sidebar + top bar + screens each mounted their own `useApi`; fix: shared in-flight/TTL cache (errors not cached, Retry forces the network). Measured on production: **0 duplicate API requests** on /map, /insights, /timeline |
| Guide me a11y | `aria-label` ("Guide me: explain the … screen"), `aria-haspopup="dialog"`, `title`; the visible text is `aria-hidden` so the name is not doubled |
| Package name | `gahan-frontend` → `oceansight-frontend` (package.json, lockfile; Docker tag examples in docs/18). No import/CI/Docker references used the old name |
| Glossary | + vertical cross-section, isotherm, thermocline, temporal evolution (simple + technical) |

Remaining gaps are unchanged from §3 (Optional / deferred by decision): saved investigations, region/cyclone PDF,
map model switch, SSS layer, cold-wake view, observability metrics.
