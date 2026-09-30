# 13 · API Specification

Base URL: `/v1`. No authentication for the hackathon build (judge-facing public demo, no user accounts, no sensitive data) — see `16_SECURITY_AND_PRODUCTION.md` for what production would add (API keys/rate limiting).

## Health

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Liveness check. Response: `{"status":"ok","model_version":"cnn-v1.2"}` |

## Data / Map

### `GET /v1/grid/{date}`
Returns the reconstructed temperature (and optionally uncertainty) grid for a given date and depth.

- **Query params**: `depth` (one of the 15 standard depths, default `0`), `variable` (`temp` | `uncertainty`, default `temp`).
- **Auth**: none.
- **Example**: `GET /v1/grid/2023-05-11?depth=100&variable=temp`
- **Response**:
```json
{
  "date": "2023-05-11",
  "depth_m": 100,
  "variable": "temp",
  "grid": {
    "lat": [5.0, 5.25, "..."],
    "lon": [45.0, 45.25, "..."],
    "values": [[27.1, 27.3, "..."], ["...", "..."]]
  },
  "source": "cached_reconstruction",
  "model_version": "cnn-v1.2"
}
```

### `GET /v1/profile/{date}`
Returns the full 15-depth profile at a single point.

- **Query params**: `lat`, `lon` (required).
- **Example**: `GET /v1/profile/2023-05-11?lat=15.0&lon=88.0`
- **Response**:
```json
{
  "date": "2023-05-11", "lat": 15.0, "lon": 88.0,
  "depths_m": [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000],
  "temperature_c": [29.8,29.7,29.5,28.9,27.8,25.1,22.4,20.1,18.7,17.5,15.9,13.2,10.1,8.4,6.2],
  "uncertainty_c": [0.2,0.2,0.3,0.4,0.6,0.9,1.1,1.0,0.8,0.7,0.6,0.5,0.4,0.3,0.3],
  "baseline_climatology_c": ["..."],
  "nearest_argo_float": {"platform_number": "2902xxx", "distance_km": 42.1, "date_offset_days": 1}
}
```

### `POST /v1/region/stats`
Computes region-aggregated derived products over a bounding box and date.

- **Body**: `{"date":"2023-05-11","bbox":{"min_lat":10,"max_lat":20,"min_lon":80,"max_lon":95}}`
- **Response**: `{"mean_tchp_kj_cm2":78.4,"mean_mld_m":32.1,"mean_d20_m":61.5,"mean_d26_m":48.9,"barrier_layer_flag":true}`

## Validation

### `GET /v1/validation/summary`
Returns the full independent Argo validation table.

- **Response**: `{"per_depth":[{"depth_m":0,"rmse_c":0.41,"bias_c":0.05,"corr":0.93,"n_obs":214,"baseline_rmse_c":0.78}, "..."], "held_out_period":"2022-01-01..2023-12-31", "caveat":"GLORYS assimilates some of the same floats; see docs/21_RISKS_AND_LIMITATIONS.md"}`

## AI Insights

### `GET /v1/embedding/projection`
Returns a precomputed 2D PCA/UMAP projection of the model's embedding space.

### `POST /v1/assistant/query`
Optional NL summary feature.
- **Body**: `{"lat":15.0,"lon":88.0,"date":"2023-05-11"}`
- **Response**: `{"summary":"Warm surface layer to ~30m, thermocline around 60m depth, moderate cyclone heat potential (78 kJ/cm²) — consistent with pre-monsoon conditions.", "source":"llm" | "template_fallback"}`

## Reports

### `GET /v1/report/{date}`
- **Query params**: `lat`, `lon`, `format` (`pdf`|`csv`, default `pdf`).
- Returns a generated file (binary response) or a signed URL to one.

## Search / Regions

### `GET /v1/regions`
Returns the two named study sub-regions (Bay of Bengal, Arabian Sea) with their bounding boxes, for quick-jump UI buttons.

## Summary

### `GET /v1/summary/headline`
Returns the landing-page headline stats (overall RMSE at a representative depth, number of independent validation profiles, study period).

---

**Design notes**: every endpoint is a plain GET/POST returning JSON (or a file for the report endpoint) — no WebSockets, no GraphQL, matching the "no over-engineering" principle in `08_SYSTEM_ARCHITECTURE.md`. All endpoints read from **precomputed** cached data (see `09_DATA_PIPELINE.md`); none trigger a live model inference call during the demo, which is what makes the offline/demo-fallback strategy in `16_SECURITY_AND_PRODUCTION.md` trivial to guarantee.

---

## As-built addendum — analysis & data endpoints

All return JSON validated by Pydantic response models (`backend/app/schemas.py`), carry a `provenance` block
(`classification` ∈ measured · satellite · reanalysis · reconstructed · derived · estimated · forecast · baseline,
`source`, `lineage_id` → a row of `/v1/provenance`) and use the typed error format `{"error", "detail"}`.

| Endpoint | Parameters | Returns | Typed errors |
|---|---|---|---|
| `GET /v1/stratification` | `lat, lon, date, max_depth=500 (100–1000), radius_km=100, window_days=3` | reconstructed thermocline + gradient profile + MLD/D20/D26; nearest measured profile (5 m bins) with thermocline, halocline, density MLD / barrier layer, QC counts; optional reanalysis salinity; source statuses; diagnostic definitions | `on_land`, `out_of_domain`, `date_out_of_range`, `invalid_request` |
| `GET /v1/ts-profile` | `lat, lon, date, radius_km, window_days` | T-S points (depth, T, S, θ, σ0) of the nearest Argo profile and optional reanalysis, σ0 isopycnals, axis definitions | as above |
| `GET /v1/forecast` | `lat, lon, date, method=trend\|persistence, window=7` | T+1/T+2 estimates, ±1 sd, hindcast RMSE (method and persistence), verification reconstruction when inside the record, method label, limitations | `insufficient_forecast_history` (422) |
| `GET /v1/volume/sample` | `date, min_lat, max_lat, min_lon, max_lon, min_depth, max_depth, variable=temp\|anomaly\|uncertainty, max_points≤20000, stride` | flat arrays lat/lon/depth/value, stride used, point budget | `invalid_request`, `invalid_depth`, `uncertainty_unavailable` |
| `GET /v1/surface/{date}` | `variable=sla\|wind_speed\|sss` | grid (SLA in cm, wind m/s, SSS PSU) | `optional_dataset_unavailable` (503, with `availability`) |
| `GET /v1/wind/{date}/vectors` | `stride=8 (4–20)` | u, v, speed, direction-from | `optional_dataset_unavailable` |
| `GET /v1/salinity/{date}` | `depth` (standard depth) | satellite SSS at 0 m; GLORYS reanalysis below when precomputed | `optional_dataset_unavailable` (`availability`: `not_configured` / `not_precomputed`), `invalid_depth` |
| `GET /v1/data-quality` | — | dataset inventory with status, input QC table, Argo coverage statistics, QC rules, thresholds, files used | — |
| `GET /v1/provenance` | — | classification legend, lineage rows (source, dataset, resolution, coverage, processing, role, availability, lineage steps, where shown), optional-source status | — |
| `GET /v1/report/{date}` (extended) | `format=pdf\|csv\|json`, `sections=stratification,surface,quality` | JSON: one record per value with unit, depth, date, classification, source, model version, uncertainty | as before |

`GET /v1/meta` additionally returns `layers` (per-layer `status` ∈ available · not_configured · not_precomputed ·
unavailable · database, with `detail`) and `optional_sources` (credential *configuration status only*). Grid and product
responses gain a `classification` field (additive). Unexpected server errors are returned as
`{"error": "internal_error"}` with CORS headers.
