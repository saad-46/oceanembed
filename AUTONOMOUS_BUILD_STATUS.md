# AUTONOMOUS BUILD STATUS — OceanEmbed / GAHAN (SIH26066)

> Persistent memory for the autonomous build. On resume: read this, `git log`, then
> continue from **NEXT TASK**. Spec: `docs/23_MASTER_BUILD_SPEC.md`. Deviations: `docs/DECISIONS.md`.

CURRENT PHASE: 2 — Data pipeline (ingestion running)
CURRENT TASK: ingest inputs / HYCOM target / Argo; write feature engineering + models

COMPLETED:
- Phase 0: artifact ingested; repo was empty (D-001); open data sources verified reachable
- Ingestion adapters: SST, SSS, SLA, currents, winds (open NOAA ERDDAP + credentialed CMEMS/ERA5),
  target (HYCOM open + GLORYS credentialed), Argo (argopy + ERDDAP fallback), IBTrACS cyclones
- Regridding (bilinear + area-weighted coarsening, numpy), cleaning/QC/gap-fill module

IN PROGRESS:
- Background downloads: `ml/data/logs/{inputs,target,argo}.log`

NEXT TASK:
- feature_engineering.assemble -> processed Zarr; climatology + LightGBM + U-Net training

BLOCKERS (need a human):
- Optional: Copernicus Marine + CDS free accounts to switch to the spec's exact sources (D-002)

KNOWN BUGS: none yet
TEST STATUS: no tests yet
GIT STATUS / LAST COMMIT / LAST PUSH: see `git log -1`

ENVIRONMENT REQUIREMENTS:
- Python 3.12 venv at `.venv` (`pip install -r ml/requirements.txt -r backend/requirements.txt`)
- Node 20+ (frontend), Docker (PostGIS)
- No GPU needed (CPU training)

RESUME COMMANDS:
```bash
.venv/Scripts/python -m ml.pipeline.build_dataset inputs     # idempotent, cached
.venv/Scripts/python -m ml.pipeline.build_dataset target     # resumable
.venv/Scripts/python -m ml.pipeline.build_dataset argo
.venv/Scripts/python -m ml.pipeline.build_dataset cyclones
```
