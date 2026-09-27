# AUTONOMOUS BUILD STATUS — OceanEmbed / GAHAN (SIH26066)

> Persistent memory for the autonomous build. On resume: read this, `git log`, then
> continue from **NEXT TASK**. Spec: `docs/23_MASTER_BUILD_SPEC.md`. Deviations: `docs/DECISIONS.md`.

CURRENT PHASE: 5–7 — ML training finishing; frontend being built
CURRENT TASK: (a) ML chain resume running (`scripts/run_ml_resume.sh`, log `ml/data/logs/ml.log`);
(b) Next.js frontend in `frontend/` (scaffolded; lib/api.ts, lib/colormap.ts, globals.css written; screens pending)

COMPLETED:
- Phase 0: artifact ingested; repo was empty (D-001); open data sources verified
- Phase 2: all ingestion adapters (open NOAA/HYCOM/Argo/IBTrACS + credentialed CMEMS/ERA5/GLORYS)
  - inputs.zarr: 1826 days 2019-2023, 7 channels, QC report `ml/data/processed/inputs_qc.json`
  - target: 637/649 HYCOM days (360 train / 117 val / 160 test); 15,018 Argo profiles; 26 cyclone tracks
  - SSS = SMAP + bias-corrected SMOS merge (D-010)
- Phase 3: PostGIS schema via Alembic (`backend/alembic`), seed loader `backend/app/db/seed.py`
- Phase 4: FastAPI, 22 endpoints (`backend/app/api/*`), typed errors, PDF/CSV report, LLM+template assistant
- Phase 5 (partial): LightGBM baseline trained; U-Net trained (35 ep, best val RMSE 0.468 degC mean over depths @ep23)
- Tests: 17 pipeline/physics tests pass (`pytest tests`)

IN PROGRESS / NEXT TASK (in order):
1. Wait for ML chain: no-SSS ablation -> `train evaluate` -> `inference.precompute` -> `evaluation.argo_validation`
2. `cd backend && ../.venv/Scripts/python -m alembic upgrade head && ../.venv/Scripts/python -m app.db.seed`
3. Start API: `cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --port 8100`; smoke-test endpoints
4. Frontend screens (docs/12): landing, map+profile drawer, analysis (+cyclone fuel gauge), insights, validation, reports, methodology
5. Backend API tests (fixture store) + CI workflow; README; Dockerfiles; fallback snapshot script
6. Demo run-through (docs/15), docs sync, deploy notes

BLOCKERS (need a human):
- Optional: Copernicus Marine + CDS free accounts to switch to the spec's exact sources (D-002)
- Optional: install "Microsoft Visual C++ Redistributable (x64)" on the build PC (D-009); venv workaround in place
- Deployment (Vercel/Render/Supabase) needs account access — not done autonomously

KNOWN BUGS: none open
TEST STATUS: 17/17 pytest (tests/test_pipeline.py). Backend tests not yet written.
GIT: branch main, pushed to origin (github.com/saad-46/oceanembed)

ENVIRONMENT REQUIREMENTS:
- Python 3.12 venv `.venv`: `pip install -r ml/requirements.txt -r backend/requirements.txt`
  (torch: `pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu`; on Windows run
  `python scripts/fix_windows_msvc_runtime.py`)
- Node 20+ (frontend), Docker (PostGIS on port 5433: `docker compose -f docker/docker-compose.yml up -d db`)
- Ports: API 8100, web 3100 (8000/5432 used by another project on the build PC)

RESUME COMMANDS:
```bash
.venv/Scripts/python -m ml.pipeline.build_dataset inputs|target|argo|cyclones|assemble   # idempotent
bash scripts/run_ml.sh 35 25          # full training chain
bash scripts/run_ml_resume.sh 25      # resume after U-Net
```
