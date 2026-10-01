# OceanSight production API inventory

Verified against the source on 2026-10-01 (`backend/app/api/*.py`, the generated OpenAPI schema, and
`frontend/lib/api.ts` plus every screen that calls it). Per-endpoint parameters are in [`API.md`](API.md).

## 1. Frontend API dependencies

All requests go through one client, `frontend/lib/api.ts` (`get`, `post`, `apiUrl`), with a 20 s timeout. The
only other `fetch` is the report download in `ReportsScreen.tsx`, which uses `apiUrl()` from the same client.
There are no Next.js API routes, no server-side data fetching, and no third-party runtime requests (the basemap is
bundled GeoJSON in `public/geo/`).

| Frontend caller | Backend endpoint |
|---|---|
| `components/AppShell.tsx`, `ModelVersion.tsx`, guide | `GET /health`, `GET /v1/meta` |
| `app/page.tsx` (landing) | `GET /v1/meta`, `GET /v1/summary/headline` |
| `lib/useGrid.ts` (map layers) | `GET /v1/grid/{day}`, `GET /v1/grid/{day}/product`, `GET /v1/surface/{day}`, `GET /v1/salinity/{day}` |
| `map/MapScreen.tsx` | `GET /v1/argo/markers`, `GET /v1/cyclones`, `GET /v1/wind/{day}/vectors`, `GET /v1/meta` |
| `components/ProfilePanel.tsx`, `UncertaintyPanel.tsx` | `GET /v1/profile/{day}`, `POST /v1/assistant/query`, `GET /v1/report/{day}?format=csv`, `GET /v1/validation/summary` |
| `timeline/TimelineScreen.tsx` | `GET /v1/timeline`, `GET /v1/cyclones`, `GET /v1/forecast` (via `lib/analysis.ts`) |
| `lib/ocean.ts` (section) | `GET /v1/section/{day}` |
| `lib/analysis.ts` (stratification, T-S, 3-D, estimate) | `GET /v1/stratification`, `GET /v1/ts-profile`, `GET /v1/volume/sample`, `GET /v1/forecast` |
| `analysis/AnalysisScreen.tsx`, `components/InsightCards.tsx` | `GET /v1/regions`, `POST /v1/region/stats`, `POST /v1/region/timeseries`, `GET /v1/cyclones`, `GET /v1/cyclones/{id}/fuel`, `GET /v1/grid/{day}/product` |
| `insights/InsightsScreen.tsx` | `POST /v1/assistant/query`, `GET /v1/embedding/projection`, `GET /v1/explain/importance` |
| `validation/ValidationScreen.tsx` | `GET /v1/validation/summary`, `/grid`, `/en4`, `/profiles`, `/scatter` |
| `data-quality/DataQualityScreen.tsx`, `provenance/ProvenanceScreen.tsx` | `GET /v1/data-quality`, `GET /v1/provenance` |
| `reports/ReportsScreen.tsx` | `GET /v1/report/{day}` (pdf, csv, json), `GET /v1/validation/summary`, `GET /v1/cyclones/{id}/fuel`, `GET /docs` (link) |

Contract check: every path the frontend calls exists in the backend with the same method. Two backend endpoints
are not called by the frontend: `GET /v1/dates` and `GET /v1/argo/{argo_id}`.

## 2. FastAPI endpoints

38 routes: `/`, `/health`, `/ready`, `/docs`, `/openapi.json`, and 33 under `/v1` (30 GET, 3 POST). Full table with parameters: [`API.md`](API.md). Routers: `core`, `grid`, `validation`,
`insights`, `analysis`, `datasets`.

## 3. ML / reconstruction endpoints

The API imports only numpy-level helpers from `ml/` (`ml/config.py`, `ml/science/*`,
`ml/evaluation/derived_products.py`, `ml/pipeline/feature_engineering.py`, `ml/qc_rules.py`). It does **not**
import torch or LightGBM and never runs the U-Net. "Reconstruction" endpoints read the precomputed prediction
store `outputs/predictions/cnn-unet-v1.zarr` (1826 days × 15 depths × 100 × 240, `temp` + `sigma`):

`/v1/grid/{day}`, `/v1/profile/{day}`, `/v1/section/{day}`, `/v1/timeline`, `/v1/volume/sample`,
`/v1/stratification`, `/v1/forecast` (statistical extrapolation of the stored reconstruction),
`/v1/region/stats`, `/v1/report/{day}`, `/v1/assistant/query`, `/v1/cyclones/{id}/fuel`.

Model comparison data (`baseline-lightgbm-v1`, `cnn-unet-nosss-v1`) is read the same way.

## 4. Data endpoints

| Data | Store (under `OCEANEMBED_DATA_DIR`) | Endpoints |
|---|---|---|
| Derived products MLD/D20/D26/TCHP/SSS | `outputs/products/cnn-unet-v1.zarr` | `/v1/grid/{day}/product`, `/v1/timeline`, `/v1/region/*` |
| Satellite surface inputs | `processed/inputs.zarr` | `/v1/surface/{day}`, `/v1/wind/{day}/vectors`, `/v1/salinity/{day}` at 0 m |
| Training target (HYCOM) | `processed/target.zarr` | profile comparison, `/v1/data-quality`, `/v1/meta` |
| Climatology, land mask | `processed/climatology.zarr`, `processed/static.zarr` | anomalies, masks |
| Argo profiles | PostGIS, with `processed/argo_profiles.parquet` as fallback for nearest-profile lookups | `/v1/argo/*`, `/v1/stratification`, `/v1/ts-profile`, `/v1/validation/*` |
| Cyclone tracks | PostGIS | `/v1/cyclones*` |
| Validation metrics | `outputs/metrics_*.json`, `outputs/argo_predictions.parquet`, `outputs/uncertainty_calibration.json` | `/v1/validation/*` |
| Embeddings, importances | `outputs/embeddings.json`, `models/baseline-lightgbm-v1/feature_importance.json` | `/v1/embedding/projection`, `/v1/explain/importance` |
| Optional GLORYS salinity | `processed/salinity.zarr` (absent by default) | `/v1/salinity/{day}` below the surface, reanalysis toggle in T-S |

## 5. Health / readiness endpoints

| Endpoint | Status codes | Use for |
|---|---|---|
| `GET /health` | always 200 | platform liveness check, frontend status indicator |
| `GET /ready` | 200 / 503 | gating traffic after deploy; 503 means the data bundle is not mounted |

Both are cheap: the store handle is opened once per process (Zarr metadata only) and the database check is one
`SELECT 1` with a 5 s connect timeout.

## 6. External APIs

| Service | Base URL | Purpose | Auth | Used at runtime by the API? | Failure behaviour |
|---|---|---|---|---|---|
| NOAA CoastWatch ERDDAP | `coastwatch.noaa.gov`, `coastwatch.pfeg.noaa.gov` | SST, SSS, SLA, currents, winds | none | **No** (ingestion only) | pipeline retries; not relevant to serving |
| HYCOM THREDDS | `ncss.hycom.org` | training target | none | No (ingestion only) | – |
| Argo (Ifremer ERDDAP via argopy) | `erddap.ifremer.fr` | Argo profiles | none | No (ingestion only) | – |
| NOAA NCEI IBTrACS | `www.ncei.noaa.gov` | cyclone tracks | none | No (ingestion only) | – |
| Copernicus Marine | `data.marine.copernicus.eu` | optional credentialed sources, GLORYS salinity | username/password (`COPERNICUSMARINE_SERVICE_*`) | No (precompute only) | optional layers report `not_configured` |
| Copernicus CDS (ERA5) | `cds.climate.copernicus.eu/api` | optional winds | `CDS_API_KEY` | No (ingestion only) | falls back to NOAA winds |
| Anthropic API | SDK default | optional plain-language summary | `LLM_API_KEY` | **Yes, only if the key is set** | 20 s timeout, 1 retry, then the templated summary |

The frontend calls no external service: no tile provider, fonts CDN, or analytics.

## 7. Environment variables

Backend (read by `backend/app/config.py`; names are case-insensitive):

| Variable | Required in production | Secret | Default | Purpose |
|---|---|---|---|---|
| `DATABASE_URL` | yes | **yes** | local compose DB | PostGIS connection. `postgres://` and `postgresql://` are accepted and mapped to the psycopg 3 driver. |
| `OCEANEMBED_DATA_DIR` | yes | no | `<repo>/ml/data` (`/data` in the image) | Root of the data bundle |
| `CORS_ORIGINS` | yes | no | `http://localhost:3100,http://127.0.0.1:3100` | Comma-separated exact frontend origins |
| `CORS_ORIGIN_REGEX` | no | no | empty | Regex for Vercel preview origins |
| `PORT` | host-injected | no | 8100 | Listen port (Docker `CMD`) |
| `MODEL_VERSION` | no | no | registry's production model | Override the served model |
| `LOG_LEVEL` | no | no | `INFO` | Log level |
| `LLM_API_KEY` | no | **yes** | empty | Enables the LLM summary |
| `LLM_MODEL` | no | no | `claude-opus-5-5` | Model for the summary |
| `MAX_3D_POINTS`, `MAX_REGION_CELLS`, `GRID_CACHE_DAYS` | no | no | 20000 / 24000 / 48 | Limits and cache size |
| `COPERNICUSMARINE_SERVICE_USERNAME` / `_PASSWORD`, `CDS_API_KEY` | no | **yes** | empty | The API only reports whether they are configured |

Frontend:

| Variable | Required | Secret | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes for a live deployment | no (public, inlined at build time) | Backend origin, no trailing slash |

Pipeline-only (never needed by the deployed API): `CDS_API_URL`, `COPERNICUS_MARINE_USERNAME` / `_PASSWORD`.
`EARTHDATA_*` appears in `.env.example` but no code reads it.

## 8. CORS

`CORSMiddleware` with `allow_origins = CORS_ORIGINS` (exact match), optional `allow_origin_regex =
CORS_ORIGIN_REGEX`, methods `GET, POST`, all request headers, no credentials. There is no wildcard. Error
responses (including unexpected 500s) carry the CORS headers so the browser can read the typed error.

Production values: `CORS_ORIGINS=https://<your-vercel-production-domain>`; add
`CORS_ORIGIN_REGEX=https://<project>-[a-z0-9-]+\.vercel\.app` only if preview deployments must reach the API.

## 9. Error responses

`{"error": code, "detail": text}`; full code list in [`API.md`](API.md#errors). Frontend mapping
(`friendlyError` in `lib/api.ts`):

| Situation | What the API returns | What the user sees |
|---|---|---|
| Invalid point | 422 `on_land` / `out_of_domain` | "This point is on land or outside the study domain" |
| No data for a date | 404 `date_out_of_range` | "No reconstruction for that date" |
| Database down | 503 `database_unavailable` | "The metadata database is temporarily unavailable — map and profiles still work." |
| Optional dataset absent | 503 `optional_dataset_unavailable` | the API's explanation |
| API unreachable, timeout, or gateway 502/503/504 | – | the saved copy if one exists, otherwise "The OceanSight API is temporarily unavailable…" |
| Build without `NEXT_PUBLIC_API_URL` | – | saved copies, otherwise "This deployment is not connected to the OceanSight API" |

## 10–11. Example requests and responses

See [`API.md`](API.md#examples-real-responses-from-the-20192023-store-shortened).

## 12. Deployment dependencies

| Dependency | Requirement |
|---|---|
| Python | 3.12 (`backend/requirements.txt`; no torch / LightGBM) |
| Database | PostgreSQL with PostGIS (tested: PostGIS 3.4 on PostgreSQL 16), about 232 MB after seeding |
| Data bundle | `python scripts/make_deploy_bundle.py` → `deploy_data/`, 2.55 GB for 2019–2023 |
| Memory | 520–700 MiB measured under the smoke test; plan for 2 GB |
| Startup | ready about 11 s after container start (measured, data on local disk) |
| Frontend | Node ≥ 20.9 (CI uses 22), Next.js 16 |
