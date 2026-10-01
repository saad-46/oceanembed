# OceanSight API reference

FastAPI application `app.main:app` (run from `backend/`). Interactive docs: `GET /docs`; machine-readable
schema: `GET /openapi.json`. This file is the human-readable summary; the OpenAPI schema is authoritative.

- **Base URL:** the backend's public origin (no path prefix). Data endpoints live under `/v1`.
- **Authentication:** none. The API is public and read-only: `POST` endpoints compute statistics, they do not write.
- **Format:** JSON (gzip above 1 KB), except `GET /v1/report/{day}` with `format=pdf|csv`.
- **Nothing runs a model per request.** Every response is read from precomputed stores written by the ML
  pipeline (`ml/inference/precompute`). `data_label` is `"cached"` on all data payloads.
- **Dates** are `YYYY-MM-DD` in 2019-01-01..2023-12-31. A missing day within 7 days of a stored day is answered
  with the nearest stored day and a `notice`.
- **Domain:** 5–30°N, 45–105°E, 0.25° grid. **Depths:** 0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500,
  700, 1000 m.

## Service endpoints

| Method | Path | Purpose | Response |
|---|---|---|---|
| GET | `/` | Index of service links | `{service, docs, openapi, health, ready}` |
| GET | `/health` | Liveness + component detail. **Always 200.** | `{status: ok\|degraded, model_version, database: ok\|unavailable, reconstruction_store: ok\|missing}` |
| GET | `/ready` | Readiness. **200** when the reconstruction store is readable, **503** otherwise. A missing database does not fail readiness; it is reported in the body. | `{ready, status, model_version, database, reconstruction_store}` |
| GET | `/docs`, `/openapi.json` | Swagger UI and OpenAPI schema | HTML / JSON |

## Core

| Method | Path | Parameters | Purpose |
|---|---|---|---|
| GET | `/v1/meta` | – | Domain, depths, period, splits, models, data sources, per-layer availability |
| GET | `/v1/regions` | – | Named regions with bounding boxes |
| GET | `/v1/summary/headline` | – | Landing-page statistics taken from the computed validation |
| GET | `/v1/dates` | – | `{start, end, n_days, missing}` of the reconstruction |

## Reconstruction and derived products

| Method | Path | Parameters | Purpose |
|---|---|---|---|
| GET | `/v1/grid/{day}` | `depth=0`, `variable=temp\|uncertainty\|anomaly`, `model?` | Map of one depth |
| GET | `/v1/grid/{day}/product` | `product=tchp\|mld\|d20\|d26\|sss` | Derived-product map, or satellite SSS |
| GET | `/v1/profile/{day}` | `lat`, `lon` (required) | 15-depth profile, uncertainty, climatology, model comparisons, derived values, nearest Argo float |
| GET | `/v1/section/{day}` | `orientation=zonal\|meridional`, `lat`, `lon_min`, `lon_max`, `lon`, `lat_min`, `lat_max`, `variable=temp\|anomaly\|uncertainty` | Vertical section |
| GET | `/v1/timeline` | `lat`, `lon` (required), `start?`, `end?`, `stride_days?` (1–31) | Column through time with MLD/D20/D26 and climatology |
| POST | `/v1/region/stats` | body `{date, bbox:{min_lat,max_lat,min_lon,max_lon}}` | Region means of derived products |
| POST | `/v1/region/timeseries` | body `{bbox, start?, end?, stride_days=5, product=tchp\|mld\|d20\|d26}` | Region-mean product over time |
| GET | `/v1/volume/sample` | `date` (required), `min_lat`, `max_lat`, `min_lon`, `max_lon`, `min_depth`, `max_depth`, `variable`, `max_points` (≤ 20000), `stride?` | Downsampled sub-volume for the 3-D view |

## Analysis

| Method | Path | Parameters | Purpose |
|---|---|---|---|
| GET | `/v1/stratification` | `lat`, `lon`, `date` (required), `max_depth=500`, `radius_km=100`, `window_days=3` | Thermocline from the reconstruction; thermocline, halocline and density mixed layer from the nearest measured Argo profile |
| GET | `/v1/ts-profile` | `lat`, `lon`, `date` (required), `radius_km=100`, `window_days=3` | T-S pairs with TEOS-10 potential temperature and σ0 from the nearest measured Argo profile |
| GET | `/v1/forecast` | `lat`, `lon`, `date` (required), `method=trend\|persistence`, `window=7` | T+1/T+2 **statistical short-horizon estimate** (extrapolation of the reconstruction; not a trained forecast model) |

## Surface fields and optional datasets

| Method | Path | Parameters | Purpose |
|---|---|---|---|
| GET | `/v1/surface/{day}` | `variable=sla\|wind_speed\|sss` | Satellite surface inputs on the model grid |
| GET | `/v1/wind/{day}/vectors` | `stride=8` | Subsampled 10 m wind vectors |
| GET | `/v1/salinity/{day}` | `depth=0` | Satellite SSS at 0 m; below the surface only if the optional GLORYS store is deployed, otherwise 503 `optional_dataset_unavailable` |
| GET | `/v1/data-quality` | – | Dataset inventory and QC statistics from the pipeline's own records |
| GET | `/v1/provenance` | – | Lineage of every variable |

## Validation and observations

| Method | Path | Parameters | Purpose | Needs database |
|---|---|---|---|---|
| GET | `/v1/validation/summary` | `model?`, `split=test\|val` | Per-depth skill against held-out Argo | no (JSON) |
| GET | `/v1/validation/grid` | – | Model comparison against the gridded target | no |
| GET | `/v1/validation/en4` | – | Cross-check against EN4 | no |
| GET | `/v1/validation/profiles` | `model?`, `split?`, `sort=date\|rmse_desc\|rmse_asc`, `limit=50`, `offset=0` | Held-out profiles with per-profile RMSE | yes |
| GET | `/v1/validation/scatter` | `model?`, `split=val\|test`, `max_points=4000` | Predicted vs observed pairs | no (parquet) |
| GET | `/v1/argo/markers` | `date` (required), `window_days=3` | Argo floats near a date | yes |
| GET | `/v1/argo/{argo_id}` | – | One Argo profile | yes |

## Insights, events and reports

| Method | Path | Parameters | Purpose | Needs database |
|---|---|---|---|---|
| GET | `/v1/embedding/projection` | – | 2-D PCA of the U-Net bottleneck | no |
| GET | `/v1/explain/importance` | – | LightGBM gain importances per depth | no |
| POST | `/v1/assistant/query` | body `{lat, lon, date}` | Plain-language summary of the computed profile. Templated unless `LLM_API_KEY` is set. | no |
| GET | `/v1/cyclones` | – | IBTrACS tracks in the study period | yes |
| GET | `/v1/cyclones/{track_id}/fuel` | `lead_days=0` | Reconstructed ocean heat under an observed track (describes the ocean; not a storm forecast) | yes |
| GET | `/v1/report/{day}` | `lat`, `lon` (required), `format=pdf\|csv\|json`, `depth=100`, `sections=stratification,surface,quality` | Investigation report | optional (nearest Argo) |

## Errors

Every failure is `{"error": "<code>", "detail": "<human text>"}`; no stack traces are returned.

| Status | Codes |
|---|---|
| 404 | `date_out_of_range`, `not_found`, `split_unavailable` |
| 422 | `invalid_request` (malformed input), `out_of_domain`, `on_land`, `invalid_depth`, `invalid_range`, `range_too_large`, `range_too_long`, `region_too_large`, `no_ocean_cells`, `unknown_model`, `uncertainty_unavailable`, `insufficient_forecast_history` |
| 500 | `internal_error` |
| 503 | `data_unavailable`, `database_unavailable`, `validation_unavailable`, `embedding_unavailable`, `importance_unavailable`, `optional_dataset_unavailable` |

## Examples (real responses from the 2019–2023 store, shortened)

```bash
curl "$API/v1/profile/2023-05-11?lat=15&lon=88"
```

```json
{"date":"2023-05-11","requested_date":"2023-05-11","lat":15.0,"lon":88.0,"cell":{"lat":15.125,"lon":88.125},
 "depths_m":[0.0,5.0,10.0,20.0,30.0,50.0,75.0,100.0,125.0,150.0,200.0,300.0,500.0,700.0,1000.0],
 "temperature_c":[31.28,30.73,30.4,29.89,29.36,27.59,24.92,21.64,18.56,16.53,13.25,11.29,9.6,8.15,6.4],
 "uncertainty_c":[0.53,0.56,0.65,0.88,0.97,1.03,1.33,1.44,1.36,1.24,1.11,0.57,0.32,0.29,0.24],
 "derived":{"mld_m":20.0,"d20_m":113.3,"d26_m":64.9,"tchp_kj_cm2":76.6},
 "data_label":"cached","model_version":"cnn-unet-v1", "...": "..."}
```

```bash
curl -X POST "$API/v1/region/stats" -H "Content-Type: application/json" \
  -d '{"date":"2023-05-11","bbox":{"min_lat":5,"max_lat":22,"min_lon":80,"max_lon":100}}'
```

```json
{"date":"2023-05-11","n_ocean_cells":4015,"mean_tchp_kj_cm2":75.4,"max_tchp_kj_cm2":145.9,"mean_mld_m":26.5,
 "mean_d20_m":118.6,"mean_d26_m":70.7,"frac_cells_tchp_gt_50":0.911,"mean_sst_c":30.5,"...":"..."}
```

```bash
curl "$API/v1/profile/2023-05-11?lat=20&lon=78"      # 422
```

```json
{"error":"on_land","detail":"(20.0, 78.0) is on land or in water shallower than the reconstruction grid."}
```

```bash
curl "$API/v1/grid/2030-01-01?depth=100"             # 404
```

```json
{"error":"date_out_of_range","detail":"2030-01-01 is outside the reconstructed period 2019-01-01..2023-12-31."}
```
