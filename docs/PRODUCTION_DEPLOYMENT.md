# OceanSight production deployment

How to take OceanSight from the offline Vercel deployment to a live, connected one. This supersedes the generic
notes in `18_DEPLOYMENT.md`; Vercel-specific detail is in [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md), the
endpoint reference in [`API.md`](API.md), and the full inventory in
[`PRODUCTION_API_INVENTORY.md`](PRODUCTION_API_INVENTORY.md).

```
Browser ──HTTPS──> Vercel (Next.js static frontend)
   │
   └──HTTPS, NEXT_PUBLIC_API_URL──> FastAPI container (app.main:app)
                                        ├── data bundle on disk (Zarr / parquet / JSON, read-only, 2.55 GB)
                                        └── PostgreSQL + PostGIS (Argo profiles, cyclone tracks, validation rows)
```

What the backend is and is not:

- It serves **precomputed** reconstructions. It does not load PyTorch or run the U-Net; there is no GPU
  requirement and no per-request inference. The model runs offline in `ml/` and writes the stores the API reads.
- It calls **no external data service at runtime**. NOAA / HYCOM / Argo / Copernicus are used by the offline
  pipeline only. The single optional outbound call is the LLM summary when `LLM_API_KEY` is set.
- It needs **no object storage**. It reads a directory (`OCEANEMBED_DATA_DIR`). There is no object-storage client
  in the code, so the data must be on the container's filesystem: a mounted disk or baked into the image.

## Measured requirements (2026-10-01, Docker, linux/amd64)

| Resource | Measured | Plan for |
|---|---|---|
| Data bundle (2019–2023, all three models) | 2.55 GB | 5 GB disk |
| API image without data | 885 MB | – |
| API image with data baked in | 5.64 GB (uncompressed, as reported by Docker) | registry / host must accept it |
| Memory under the smoke test | 520–700 MiB | 2 GB (1 GB minimum; 512 MB instances are too small) |
| CPU | one worker, requests take 0.02–3 s | 1 vCPU |
| Startup to `/ready` 200 | 11 s | health-check grace ≥ 60 s |
| Database after seeding | 232 MB | 1 GB PostGIS |
| Slowest requests (data on local disk) | timeline 0.3–1.5 s, data-quality 3 s first call | frontend timeout is 20 s |

Storage must be a real local or block disk. Zarr access reads one small chunk per day; over a slow network or
bind-mounted filesystem a one-year timeline took 11–17 s instead of about 1 s.

The backend must be reachable over **HTTPS**: the Vercel site is HTTPS and browsers block calls from it to a
plain-HTTP API.

## Local development

```bash
docker compose -f docker/docker-compose.yml up -d db
cd backend
../.venv/Scripts/python -m alembic upgrade head          # Linux/macOS: ../.venv/bin/python
../.venv/Scripts/python -m app.db.seed
../.venv/Scripts/python -m uvicorn app.main:app --port 8100
cd ../frontend && npm install && npm run dev             # http://localhost:3100, uses http://localhost:8100
```

Whole stack in containers: `docker compose -f docker/docker-compose.yml --profile full up --build`.

## Production

### 1. Prepare the data bundle

On the machine that holds `ml/data/` (this copies; it does not retrain or regenerate anything):

```bash
python scripts/make_deploy_bundle.py                     # writes deploy_data/ (git-ignored), about 2.55 GB
```

Add `--start 2022-01-01 --end 2023-12-31` for a smaller bundle; the app then serves only those years.

### 2. Create the database

Any PostgreSQL that can `CREATE EXTENSION postgis` (the first migration does this). Then, from your machine, with
the managed database URL (it is a secret; do not commit it):

```bash
cd backend
DATABASE_URL='<managed database url>' ../.venv/Scripts/python -m alembic upgrade head
DATABASE_URL='<managed database url>' ../.venv/Scripts/python -m app.db.seed
```

`postgres://`, `postgresql://` and `postgresql+psycopg://` URLs all work. The seed reads `ml/data/` locally and is
idempotent. Expected row counts: `argo_profile` 15018, `prediction_at_argo` 60060, `skill_metric` 240,
`cyclone_track` 26, `track_point` 1518, `daily_product` 5478, `model_registry` 4, `region` 3.

### 3. Deploy the backend

Build the image from the repository root:

```bash
docker build -f docker/backend.Dockerfile -t oceansight-api .
```

Give it the data in one of two ways:

- **Persistent disk (preferred where available):** attach a disk of at least 5 GB at `/data` and copy the contents
  of `deploy_data/` onto it.
- **Baked image (for hosts without disks):**
  `docker build -f docker/backend-data.Dockerfile -t oceansight-api-data .` produces an image that already
  contains `/data`. Push it to a container registry and deploy that image.

Host settings:

| Setting | Value |
|---|---|
| Start command | image default: `alembic upgrade head` (non-fatal), then `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Working directory (if not using the image) | `backend/` |
| Port | the host's `PORT` (default 8100) |
| Health check path | `/health` (always 200 while the process is alive) |
| Readiness path | `/ready` (503 until the data bundle is readable) |
| Instances / workers | 1 (each process keeps its own 48-day in-memory cache) |
| Instance size | ≥ 1 vCPU, ≥ 2 GB RAM, always-on if you want no cold start |

Any container host that meets the table works: a VM running Docker behind an HTTPS reverse proxy, or a managed
container service with a persistent disk or a large enough image limit. Provider limits and prices were not
checked for this document; confirm RAM, disk or image-size limits against the measured numbers above before
choosing a plan.

### 4. Backend environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | the managed database URL (secret) |
| `OCEANEMBED_DATA_DIR` | `/data` (already the image default) |
| `CORS_ORIGINS` | `https://<your Vercel production domain>` (comma-separate additional exact origins) |
| `CORS_ORIGIN_REGEX` | optional, e.g. `https://<project>-[a-z0-9-]+\.vercel\.app` for preview deployments |
| `LLM_API_KEY` | optional, secret; leave empty to use the templated summary |

### 5. Verify the backend

```bash
API=https://<backend-host>
curl -s $API/ready                                   # {"ready":true,"status":"ok",...}
curl -s "$API/v1/profile/2023-05-11?lat=15&lon=88"   # real profile, model_version cnn-unet-v1
curl -s $API/v1/cyclones | head -c 200               # needs the database
curl -s -D - -o /dev/null -H "Origin: https://<vercel-domain>" $API/v1/meta | grep -i access-control-allow-origin
```

`status: degraded` with `database: unavailable` means `DATABASE_URL` is wrong or the database is not seeded;
`reconstruction_store: missing` means `/data` is empty.

### 6. Connect Vercel

1. Vercel → Project → Settings → Environment Variables: `NEXT_PUBLIC_API_URL = https://<backend-host>` for
   Production (and Preview if previews should be live). No trailing slash.
2. Redeploy (the value is inlined at build time).
3. Open the site. The sidebar reads **Service online** and no view shows the "Offline copy" badge.

### 7. End-to-end checks in the browser

- Ocean map loads a date other than the bundled reference days (for example 2021-08-15).
- Profile at a non-reference point (for example 12°N 65°E on 2021-08-15) shows a reconstruction.
- Events & regions shows cyclone tracks (database).
- Reports downloads a PDF.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Sidebar "Offline — saved copies only" | build has no `NEXT_PUBLIC_API_URL` | set it in Vercel, redeploy |
| Sidebar "API unavailable — saved copies" | backend down, wrong URL, CORS rejected, or mixed content | open `$API/health`; check the browser console; fix `CORS_ORIGINS` or use HTTPS |
| Console: "blocked by CORS policy" | origin not in `CORS_ORIGINS` | add the exact origin (scheme + host, no trailing slash), restart the backend |
| "Service degraded" | `/health` reports `database: unavailable` | fix `DATABASE_URL`, run the migration and seed |
| `/ready` returns 503 | data bundle not at `OCEANEMBED_DATA_DIR` | mount or bake `deploy_data/` |
| Timeline or data-quality times out | data on a slow network filesystem | use a local/block disk or the baked image |
| First request after idle is slow | host put the instance to sleep | use an always-on instance |
| Cyclone / Argo views say "metadata database is temporarily unavailable" | database unreachable | as for "Service degraded" |

## Not included

- No authentication or rate limiting: the API is public and read-only. If `LLM_API_KEY` is set, put a rate limit
  in front of `POST /v1/assistant/query` (reverse proxy or host feature), since each call costs money.
- No automatic data refresh: the served period is fixed at 2019–2023.
