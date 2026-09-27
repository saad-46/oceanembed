# 18 · Deployment

## Recommended architecture (simplest reliable option, not the most impressive)

```
Frontend (Next.js)        → Vercel
Backend (FastAPI)          → Render (or Railway)
Database (PostgreSQL+PostGIS) → Supabase (managed Postgres with PostGIS enabled) or Render's managed Postgres
Object storage (Zarr/GeoTIFF/model checkpoints) → Supabase Storage, or a small S3-compatible bucket (Cloudflare R2 — no egress fees, generous free tier)
ML training                → run locally / on Google Colab or Kaggle free-tier GPU (see `10_ML_AI_STRATEGY.md` compute note — this problem fits free-tier compute), artifacts pushed to object storage after training
```

| Service considered | Verdict | Why |
|---|---|---|
| Vercel (frontend) | ✅ Chosen | Zero-config Next.js deploys, generous free tier, instant preview URLs for iterative demo tweaks |
| Render (backend) | ✅ Chosen | Simple Dockerfile-based deploy for FastAPI, free tier sufficient for a demo, no cold-start surprises as bad as pure serverless functions for a stateful-ish inference service |
| Railway | Alternative to Render | Equally reasonable — pick whichever the team already has more experience with |
| Supabase (DB + storage) | ✅ Chosen | One managed service gives Postgres+PostGIS+object storage+auth-if-ever-needed, reducing the number of accounts/dashboards a small team has to juggle |
| Google Cloud / AWS / Azure raw | ❌ Not chosen for the hackathon build | Full cloud-provider setup (IAM, VPCs, etc.) is unnecessary complexity for a demo that needs to be reliable for one 5–7 minute window, not scalable for production traffic |
| Cloudflare (CDN/object storage) | Optional | Useful if object storage egress becomes a concern; not required at this data volume |

## Why not over-engineer

No Kubernetes, no multi-region deployment, no message queue, no dedicated model-serving framework (TorchServe/Triton) — the entire served dataset is precomputed and small (a few GB), so a single FastAPI process reading from disk/object storage comfortably serves the demo and a realistic judge-exploration session. Production scale-out (see `16_SECURITY_AND_PRODUCTION.md`) would revisit this only if this became an actual operational INCOIS service.

## Environment variables (`.env.example`)

```
DATABASE_URL=postgresql://user:pass@host:5432/oceanembed
COPERNICUS_MARINE_USERNAME=
COPERNICUS_MARINE_PASSWORD=
CDS_API_KEY=
EARTHDATA_USERNAME=
EARTHDATA_PASSWORD=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=
LLM_API_KEY=              # optional, only for the AI-assistant nice-to-have; app works without it
MODEL_VERSION=cnn-v1.2
```

## CI/CD (lightweight)

A single GitHub Actions workflow running the `pytest` suite (`17_TESTING_STRATEGY.md`) on every push, plus Vercel/Render's own git-push auto-deploy — no custom CI/CD pipeline engineering needed beyond that for a hackathon timeline.
