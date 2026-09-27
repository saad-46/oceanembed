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
