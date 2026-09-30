# Deploying OceanSight: frontend on Vercel, backend elsewhere

Only `frontend/` (Next.js) goes to Vercel. The FastAPI backend (`backend/`) and the ML code (`ml/`) are **not**
deployed to Vercel. The browser calls the backend directly, cross-origin, using `NEXT_PUBLIC_API_URL`.

```
browser ──▶ Vercel (frontend/, static Next.js pages)
   └──────▶ FastAPI backend (separate host) ──▶ PostgreSQL + PostGIS
                                            └─▶ precomputed data bundle (Zarr/JSON/Parquet)
```

## 1. Backend first (separate host)

The frontend needs a public HTTPS URL for the backend, so deploy the backend first. Any host that can run a Docker
image or a long-running Python 3.12 process with a few GB of disk works (for example, Render or Railway,
see `docs/18_DEPLOYMENT.md`). A serverless function is not a good fit: the API reads multi-GB Zarr stores from disk.

| Item | Value |
|---|---|
| Entry point | `backend/app/main.py` → `app.main:app` |
| Image | `docker/backend.Dockerfile` (build context: **repo root**) |
| Start command (in the image) | `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8100}` (working dir `backend/`) |
| Start command (no Docker) | from `backend/`: `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Python | 3.12 (`python:3.12-slim` in the Dockerfile; CI uses 3.12) |
| Dependencies | `backend/requirements.txt` (no torch/lightgbm; the API serves precomputed outputs) |
| Code from `ml/` it imports | `ml/config.py`, `ml/evaluation/derived_products.py`, `ml/pipeline/feature_engineering.py` (numpy-only; the Dockerfile copies them) |
| API base path | none: `/health`, `/docs`, and `/v1/...` at the root of the backend URL |
| Health check | `GET /health` (always 200; body says `ok` or `degraded`) |
| One-time seed | `python -m app.db.seed` from `backend/` once the data bundle is in place (idempotent; loads regions, model registry, Argo profiles, per-profile predictions, skill metrics, cyclone tracks) |

### Backend environment variables

| Variable | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql+psycopg://USER:PASSWORD@HOST:5432/DB` (PostGIS extension must be available; the migration runs `CREATE EXTENSION IF NOT EXISTS postgis`) |
| `OCEANEMBED_DATA_DIR` | yes | `/data` in the image: where the data bundle is mounted or copied |
| `CORS_ORIGINS` | yes | Comma-separated exact origins, e.g. `https://oceanembed.vercel.app` (add your custom domain if you use one). No trailing slash. |
| `CORS_ORIGIN_REGEX` | no | Only if Vercel **preview** deployments must reach the API, e.g. `https://oceanembed-[a-z0-9-]+\.vercel\.app`. Empty = exact origins only. |
| `PORT` | host-dependent | Most hosts inject it; the image defaults to 8100 |
| `MODEL_VERSION` | no | Empty = the registry's production model |
| `LLM_API_KEY`, `LLM_MODEL` | no | Optional plain-language summary; the API falls back to a templated summary without them. Secret: backend only, never `NEXT_PUBLIC_*`. |
| `LOG_LEVEL` | no | Default `INFO` |

CORS is exact-match by default (no wildcard). After Vercel gives you the production domain, put it in
`CORS_ORIGINS` and restart the backend.

### Data the backend needs at runtime

The API serves **precomputed** reconstructions; it never trains or runs the neural network. Build the bundle on a
machine that has run the ML pipeline (`ml/data/` is not in git because it is several GB):

```bash
python scripts/make_deploy_bundle.py --start 2022-01-01 --end 2023-12-31   # writes deploy_data/ (git-ignored)
```

It contains `processed/static.zarr`, `processed/climatology.zarr`, `processed/argo_profiles.parquet`,
`processed/cyclones.json`, `outputs/model_registry.json`, `outputs/predictions/`, `outputs/products/`, the
validation/embedding JSON files, and the LightGBM feature importances. Mount or `COPY` it to `OCEANEMBED_DATA_DIR`.
Without it, `/health` reports `reconstruction_store: missing` and data endpoints return typed `*_unavailable`
errors; without the database, Argo/cyclone endpoints return `database_unavailable`.

## 2. Frontend on Vercel

| Vercel setting | Value |
|---|---|
| Project name | `oceanembed` |
| Root Directory | `frontend` |
| Framework Preset | Next.js |
| Build Command | default (`next build`, i.e. `npm run build`) |
| Output Directory | default (Next.js) |
| Install Command | default (`npm install`; uses `frontend/package-lock.json`) |
| Node.js version | 20.x or newer (Next 16 requires ≥ 20.9; CI and the Dockerfile use 22) |

No `vercel.json` is needed: Vercel's Next.js detection handles the build, and every page is static.
`output: "standalone"` in `next.config.ts` is only for `docker/frontend.Dockerfile`.

### Frontend environment variable

| Variable | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | the backend's public HTTPS URL, no trailing slash, e.g. `https://<your-backend-host>` | Production (and Preview, if previews should use the same backend) |

- It is **inlined at build time**. After adding or changing it, **redeploy**.
- It is public (it ships to every browser). Never put secrets in `NEXT_PUBLIC_*` variables.
- If it is missing in a production build, the build log shows a warning. The site still works, but only with the
  bundled offline snapshots in `frontend/public/fallback/` (the sidebar shows "Offline — saved copies only"). It
  never calls `localhost`. Report generation and CSV downloads show "not connected" messages.
- If it points at `localhost` on Vercel, the build log warns too.
- `http://localhost:8100` is the default only for `npm run dev` (see `frontend/.env.example`).

## 3. Connect the two

1. Deploy the backend; confirm `https://<backend>/health` responds and `https://<backend>/docs` loads.
2. Create the Vercel project with the settings above and set `NEXT_PUBLIC_API_URL=https://<backend>`.
3. Deploy; note the production domain (e.g. `https://oceanembed.vercel.app`).
4. Set `CORS_ORIGINS=https://oceanembed.vercel.app` on the backend and restart it.
5. Open the site: the sidebar should read "Service online". If it reads "Offline — saved copies only", check the
   browser console for CORS errors (fix `CORS_ORIGINS`) or a wrong/missing `NEXT_PUBLIC_API_URL` (fix, then redeploy).

Optional: refresh the offline snapshots from the live API before deploying the frontend
(`python scripts/snapshot_fallback.py --api https://<backend>`) so the reference views also work while a free-tier
backend is cold-starting.

## Local development (unchanged)

```bash
cd backend && uvicorn app.main:app --port 8100          # API on http://localhost:8100
cd frontend && cp .env.example .env.local && npm run dev # web on http://localhost:3100
```


## Data bundle for the analysis layers

`scripts/make_deploy_bundle.py` now also copies `processed/inputs.zarr` (only `sla`, `uwind`, `vwind`, `ocean_mask`)
for the sea-level and wind layers, `processed/argo_qc.json` for the Data Quality workspace and, when it exists,
`processed/salinity.zarr` (optional GLORYS salinity). Layers whose data are absent are reported as unavailable in
`/v1/meta` and shown disabled with the reason; nothing else is affected. After deploying, refresh the offline copies:
`python scripts/snapshot_fallback.py --api https://<backend>` (it includes the stratification, T-S, forecast, 3-D,
data-quality and provenance reference requests).
