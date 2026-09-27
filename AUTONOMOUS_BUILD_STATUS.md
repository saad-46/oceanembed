# AUTONOMOUS BUILD STATUS — OceanEmbed / GAHAN (SIH26066)

> Persistent memory for the autonomous build. On resume: read this, `git log`, then
> continue from **NEXT TASK**. Spec: `docs/23_MASTER_BUILD_SPEC.md`. Deviations: `docs/DECISIONS.md`.

CURRENT PHASE: 5 → 8 — ML chain finishing; frontend + tests + CI done
CURRENT TASK: ML chain resume (`scripts/run_ml_resume.sh`, log `ml/data/logs/ml.log`): no-SSS ablation →
evaluate → precompute → Argo validation. Then seed DB, run API + web, demo walkthrough.

COMPLETED:
- Phase 0: artifact ingested; repo was empty (D-001); open data sources verified
- Phase 2: all ingestion adapters; inputs.zarr 1826 days; 637 HYCOM target days; 15,018 Argo profiles;
  26 IBTrACS tracks; SSS = SMAP + bias-corrected SMOS merge (D-010)
- Phase 3: PostGIS schema (Alembic) + seed loader
- Phase 4: FastAPI 22 endpoints, typed errors, PDF/CSV, LLM(opt)+template assistant
- Phase 5: LightGBM trained; U-Net trained (best val RMSE 0.468 °C mean over depths)
- Phase 7: Next.js frontend, all 8 screens, offline basemap, fallback client; lint/tsc/build clean
- Phase 9: 44 tests (pipeline/physics/ML/API/PostGIS) passing; GitHub Actions CI
- Perf: derived products 8x faster, precompute memory-safe
- Docs: README, DECISIONS D-001..D-010, deployment runbook, results generator (scripts/write_results.py)

NEXT TASK (in order):
1. After ML chain: `python scripts/write_results.py` → docs/RESULTS.md; sanity-check numbers
2. `cd backend && ../.venv/Scripts/python -m alembic upgrade head && ../.venv/Scripts/python -m app.db.seed`
3. API on 8100 + `cd frontend && npm run dev` (3100); browser walkthrough of docs/15 demo; fix issues
4. `python scripts/snapshot_fallback.py`; commit fallback snapshots
5. Judge-QA addendum with real numbers; docs sync; final audit

BLOCKERS (need a human):
- Optional: Copernicus Marine + CDS free accounts to switch to the spec's exact sources (D-002)
- Optional: install "Microsoft Visual C++ Redistributable (x64)" on the build PC (D-009); venv workaround in place
- Deployment (Vercel/Render/Supabase) needs account access — not done autonomously

KNOWN BUGS: none open
TEST STATUS: 44/44 pytest (`pytest -q` at repo root; PostGIS tests need the compose DB). Frontend lint/typecheck/build clean.
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
