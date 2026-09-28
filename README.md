# OceanSight — OceanEmbed (SIH26066)

**Satellite-embedding deep learning reconstruction of North Indian Ocean subsurface temperature.**
Problem statement SIH26066 "OceanEmbed" (Ministry of Earth Sciences / INCOIS): reconstruct ocean
temperature at the 15 standard depths 0–1000 m, on a 0.25° daily grid over 5–30°N, 45–105°E, from
five surface satellite fields, and validate it against independent Argo observations.

OceanSight does that end to end — real data ingestion → harmonisation → LightGBM baseline + U-Net
("satellite embedding") → independent Argo validation → precomputed daily products (TCHP, MLD,
D20/D26) → FastAPI + PostGIS → an interactive map application.

> Honest scope: a validated **proof of concept** over 2019–2023, not an operational INCOIS system.
> The current model is trained on **open (no-login) substitutes** for the Copernicus/ERA5 products
> named in the spec; the credentialed adapters are implemented and switch on via `.env`.
> See [`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/21_RISKS_AND_LIMITATIONS.md`](docs/21_RISKS_AND_LIMITATIONS.md).

## Contents

| Path | What |
|---|---|
| `ml/ingestion/` | one adapter per source (open NOAA ERDDAP / HYCOM / Argo / IBTrACS + credentialed CMEMS / ERA5 / GLORYS) |
| `ml/pipeline/` | cleaning + QC, regridding (bilinear / area-weighted), feature engineering, orchestrator CLI |
| `ml/models/` | climatology, LightGBM baseline, U-Net (bottleneck = satellite embedding, uncertainty head), training |
| `ml/evaluation/` | per-depth metrics, independent Argo validation, derived products (TCHP/MLD/D20/D26) |
| `ml/inference/` | batch precompute of daily grids, products, region series, embeddings |
| `backend/` | FastAPI (22 endpoints), PostGIS schema (Alembic), seed loader, PDF/CSV reports |
| `frontend/` | Next.js + MapLibre + deck.gl + Recharts, 8 screens, offline basemap + fallback |
| `docs/` | the master specification (read `docs/23_MASTER_BUILD_SPEC.md` first) + decision log |
| `tests/`, `backend/tests/` | pipeline, physics, ML, API-contract and PostGIS tests |
| `AUTONOMOUS_BUILD_STATUS.md` | live build status / resume point |

## Data sources (current model)

| Variable | Used (open) | Spec primary (credentialed, supported) |
|---|---|---|
| SST | NOAA OISST v2.1 | CMEMS OSTIA |
| SSS | NOAA SMAP daily + bias-corrected SMOS 3-day merge | CMEMS Multi-Obs SSS |
| SLA | NOAA blended altimetry SLA | CMEMS DUACS |
| Currents | NOAA altimetry geostrophic currents | CMEMS GlobCurrent |
| Winds | NOAA NCEI Blended Seawinds v2 | ERA5 (CDS) |
| Target | HYCOM GOFS 3.1 analysis (1/12°) | GLORYS12V1 (1/12°) |
| Validation | Argo GDAC via `argopy` (QC 1/2) | INCOIS LAS gridded Argo (not reachable) |
| Tracks | NOAA IBTrACS v04r01 | — |

Study period 2019-01-01 → 2023-12-31 (limited by satellite SSS and the open HYCOM analysis).
Whole-year split: **train 2019–2021, validate 2022, test 2023** (held out; contains Cyclones Mocha and Biparjoy).

## Quick start (local)

Prerequisites: Python 3.12, Node 20+, Docker. Ports: API **8100**, web **3100**, PostGIS **5433**.

```bash
# 1. Python env
python -m venv .venv
.venv/Scripts/pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu   # Linux/mac: .venv/bin/pip
.venv/Scripts/pip install -r ml/requirements.txt -r backend/requirements.txt
.venv/Scripts/python scripts/fix_windows_msvc_runtime.py        # Windows only, see docs/DECISIONS.md D-009
cp .env.example .env                                            # optional credentials

# 2. Data pipeline (idempotent, cached, resumable; ~4-6 h, dominated by the 3-D target download)
.venv/Scripts/python -m ml.pipeline.build_dataset inputs
.venv/Scripts/python -m ml.pipeline.build_dataset target --stride 3 --workers 6
.venv/Scripts/python -m ml.pipeline.build_dataset argo
.venv/Scripts/python -m ml.pipeline.build_dataset cyclones
.venv/Scripts/python -m ml.pipeline.build_dataset assemble

# 3. Train + validate + precompute (~2 h on a laptop CPU)
bash scripts/run_ml.sh 35 25

# 4. Database
docker compose -f docker/docker-compose.yml up -d db
cd backend && ../.venv/Scripts/python -m alembic upgrade head && ../.venv/Scripts/python -m app.db.seed

# 5. API  (http://localhost:8100/docs)
../.venv/Scripts/python -m uvicorn app.main:app --port 8100

# 6. Web app (http://localhost:3100)
cd ../frontend && npm install && npm run dev
```

Tests: `pytest -q` (repo root; PostGIS tests auto-skip without the DB) · `cd frontend && npm run lint && npm run typecheck && npm run build`.

## How it works

1. **Ingestion** — each source has an adapter with the contract `fetch(start, end, bbox) -> xarray.Dataset`
   and provenance metadata; downloads are chunked by month and cached.
2. **Cleaning** — unit harmonisation, physical-range flagging (logged), de-duplication, daily calendar,
   gap filling (≤7-day temporal interpolation, then nearest valid neighbour); every fill counted in
   `processed/inputs_qc.json`.
3. **Regridding** — all fields to the common 100×240 grid of 0.25° cells (bilinear for offset 0.25° grids,
   cos-lat area-weighted bin averaging for 1/12° → 0.25°); target interpolated onto the 15 standard depths.
4. **Features** — 7 surface channels + lat, lon + sin/cos day-of-year; normalisation from training years only.
5. **Models** — harmonic seasonal climatology; per-depth LightGBM; U-Net encoder–decoder whose bottleneck is
   the satellite embedding, predicting the departure from climatology plus a per-depth variance.
   A no-SSS U-Net is trained as the salinity ablation.
6. **Validation** — per-depth RMSE / bias / r / skill-vs-climatology against the gridded target on the
   held-out years *and* against every QC'd Argo profile in them (`ml/data/outputs/metrics_*.json`).
7. **Serving** — every day of 2019–2023 is precomputed (int16 Zarr) with TCHP/MLD/D20/D26; the API never runs a
   model live; PostGIS holds Argo profiles, validation records, model registry and cyclone tracks.

## API (summary — full OpenAPI at `/docs`)

`GET /health` · `GET /v1/meta` · `GET /v1/regions` · `GET /v1/summary/headline` · `GET /v1/dates` ·
`GET /v1/grid/{date}?depth=&variable=temp|uncertainty|anomaly&model=` · `GET /v1/grid/{date}/product?product=tchp|mld|d20|d26|sss` ·
`GET /v1/profile/{date}?lat=&lon=` · `POST /v1/region/stats` · `POST /v1/region/timeseries` ·
`GET /v1/validation/summary|grid|profiles|scatter` · `GET /v1/argo/markers?date=` · `GET /v1/argo/{id}` ·
`GET /v1/embedding/projection` · `GET /v1/explain/importance` · `POST /v1/assistant/query` ·
`GET /v1/cyclones` · `GET /v1/cyclones/{id}/fuel?lead_days=` · `GET /v1/report/{date}?lat=&lon=&format=pdf|csv`

Errors are typed JSON `{"error": code, "detail": ...}` (`invalid_depth`, `out_of_domain`, `on_land`,
`date_out_of_range`, `database_unavailable`, …). Every data response carries `data_label: "cached"`
(precomputed from real observations) and a `notice` when the nearest available day was substituted.

## Deployment

See [`docs/18_DEPLOYMENT.md`](docs/18_DEPLOYMENT.md). Container images: `docker/backend.Dockerfile`
(context: repo root; mount or bake the data bundle from `scripts/make_deploy_bundle.py`) and
`docker/frontend.Dockerfile` (context: `frontend/`, build arg `NEXT_PUBLIC_API_URL`).
`docker compose -f docker/docker-compose.yml --profile full up --build` runs db + api + web locally.
For the offline demo, `python scripts/snapshot_fallback.py` bundles the demo click-path into the frontend.

## Results (held-out 2023; full tables in [`docs/RESULTS.md`](docs/RESULTS.md))

| vs. 2,639 independent Argo profiles (2023) | mean RMSE over 15 depths | RMSE at 100 m |
|---|---|---|
| U-Net (production) | 0.89 °C | 1.31 °C |
| LightGBM baseline | 0.91 °C | 1.29 °C |
| Seasonal climatology | 1.10 °C | 1.80 °C |
| HYCOM training target itself (ceiling) | 0.79 °C | 1.26 °C |

- Uncertainty, calibrated on 2022 floats: 70 % of 2023 Argo values within ±1σ (ideal 68 %), 94 % within ±2σ.
- Cross-check vs the Met Office EN4 analysis (target-independent): every model beats climatology.
- Salinity ablation: removing SSS did **not** measurably change skill in this build (reported, not hidden).
- On the 2022 validation year LightGBM is marginally ahead of the U-Net; the two are close (`docs/DECISIONS.md` D-012).

Numbers come from `ml/data/outputs/metrics_*.json` via `scripts/write_results.py`; none are hand-typed.
Judge-facing answers for the as-built system: [`docs/24_JUDGE_QA_AS_BUILT.md`](docs/24_JUDGE_QA_AS_BUILT.md);
demo script: [`docs/25_DEMO_SCRIPT_AS_BUILT.md`](docs/25_DEMO_SCRIPT_AS_BUILT.md).
