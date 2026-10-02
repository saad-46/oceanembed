# Deploying OceanSight: frontend on Vercel, backend elsewhere

> Full production runbook with measured resource requirements: [`PRODUCTION_DEPLOYMENT.md`](PRODUCTION_DEPLOYMENT.md).

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
| Readiness | `GET /ready` (200 when the data bundle is readable, 503 otherwise) |
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
- If it is missing, the site uses **automatic online / offline mode** (next section): the browser looks for the
  API on the visitor's own computer and otherwise serves the bundled saved data in `frontend/public/fallback/`.
  Nothing on the server ever calls `localhost`.
- Do **not** set it to `http://localhost:8100` on Vercel. Leave it unset for local discovery, or set it to a
  deployed backend's HTTPS URL.

## Automatic online / offline mode (no `NEXT_PUBLIC_API_URL`)

The public site <https://ocean-sight.vercel.app/> needs no hosted backend. With `NEXT_PUBLIC_API_URL` unset, the
page decides in the browser where its data comes from:

| Situation | Mode | Data |
|---|---|---|
| The OceanSight API is running on the computer that is viewing the page (`http://localhost:8100`, `/ready` = 200) and the browser allows the page to reach it | **Online** | the full local API and dataset |
| Anything else (API stopped, another visitor's computer, permission not given) | **Offline** | the saved copies bundled with the site |

`localhost` is the computer of the person viewing the website. This gives the full application to the laptop that
runs the OceanSight backend; every other visitor gets the saved data. The API is never exposed to the internet:
it keeps listening on `127.0.0.1` only, and no tunnel or port forwarding is involved.

**Browser permission.** A public HTTPS page may reach `localhost` only with the browser's Local Network Access
permission (Chrome and Edge ask "allow this site to access devices/apps on your network"). OceanSight never
triggers that prompt by itself:

| Permission state | Behaviour |
|---|---|
| granted | probes `http://localhost:8100/ready` on load, re-checks every 20 s, switches Online ↔ Offline by itself, no reload |
| prompt (first visit) | stays Offline; **Connect to Local API** in the top bar (or in the Offline notice on a phone) is the only thing that asks |
| denied | stays Offline and does not probe; re-enable it in the browser's site settings |
| not exposed by the browser | no automatic probe until **Connect to Local API** has succeeded once in that browser |

A page served from the same computer (`http://localhost:3100`) needs no permission.

**Using it (the demo flow).**

1. Start the API as usual: `cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --port 8100`.
2. Open <https://ocean-sight.vercel.app/>. The first time, click **Connect to Local API** and allow the browser prompt.
3. The status reads **Online**. Stop the API: within two checks (about 20-40 s) it reads **Offline · saved data**
   and the saved views keep working. Start it again: it returns to **Online** by itself and reloads live data.

**Details.** One readiness check at a time, 2.5 s timeout, none while the tab is hidden. Going offline needs two
consecutive failed checks (one failed data request triggers an immediate check); going online needs one success.
A typed API error (404, 422, 500) is shown as that error and never switches the mode. The backend allows the
public origin by default (`CORS_ORIGINS` includes `https://ocean-sight.vercel.app`) and answers the browser's
private-network preflight for allowed origins only.

**What works offline** (saved copies exist for the default view of each): map layers for 10-12 May 2023 (temperature
at all 15 depths, anomaly and uncertainty at 0 and 100 m, TCHP/MLD/D20/D26, salinity, sea level, wind), profile,
timeline with its estimate, section, stratification, T-S, 3-D, events & regions (Bay of Bengal, Arabian Sea,
Cyclone Mocha), evidence, data quality, lineage, daily summary. Any other point or date, and all report/CSV/JSON
exports, need Online mode and say so.

## 3. Connect the two

1. Deploy the backend; confirm `https://<backend>/health` responds and `https://<backend>/docs` loads.
2. Create the Vercel project with the settings above and set `NEXT_PUBLIC_API_URL=https://<backend>`.
3. Deploy; note the production domain (e.g. `https://oceanembed.vercel.app`).
4. Set `CORS_ORIGINS=https://oceanembed.vercel.app` on the backend and restart it.
5. Open the site: the sidebar should read "Online · API connected". If it reads "Offline · using saved data", check the
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
