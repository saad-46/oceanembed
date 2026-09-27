# 23 · MASTER BUILD SPEC

**Read this file first.** This is the single source of truth for building GAHAN (our implementation of SIH26066 — OceanEmbed). Every decision here is final for this build cycle; every other file in `docs/` is supporting detail this file points to. If a coding agent is told "build this," this file is what it should execute against, consulting the numbered files below only for the specifics of each stage.

## 1. What we are building

A satellite-only deep learning system that reconstructs subsurface ocean temperature (15 standard depths, 0–1000 m) at 0.25°/daily resolution over the North Indian Ocean (5–30°N, 45–105°E), from five surface satellite fields (SST, SSS, SLA, surface currents, surface winds), validated against independent Argo float observations — wrapped in an interactive web application that turns the raw reconstruction into INCOIS-relevant decision products (cyclone heat potential, mixed layer depth, thermocline depth).

## 2. Why we are building it

INCOIS (Ministry of Earth Sciences) explicitly asked for this in SIH26066 (`01_OFFICIAL_PROBLEM_STATEMENT.md`). Direct subsurface measurement is too sparse in space/time (a few hundred Argo floats over an ocean basin); satellites see the surface continuously and carry physical signatures of subsurface structure (thermocline tilt, barrier layers, eddies) that a deep learning model can learn to decode (`02_DOMAIN_RESEARCH.md`).

## 3. Who uses it

Primary: an INCOIS-style ocean analyst/forecaster (played by SIH judges). Secondary: cyclone forecasters, fisheries advisory analysts, ocean researchers (`06_PRODUCT_REQUIREMENTS.md`).

## 4. What data it uses, and where it comes from

Five Copernicus Marine products (OSTIA SST, Multi-Obs SSS, DUACS SLA, GlobCurrent) + ERA5 winds (CDS) as inputs; GLORYS12V1 (Copernicus Marine) as the training target; the global Argo program via `argopy` as independent validation; ARMOR3D and EN4 as baseline/cross-check products. All free, all with at most a one-time account registration, none paid or restricted. Full detail, URLs, and access instructions: `04_DATASETS_AND_APIS.md`. India-specific context and the INCOIS-LAS substitution decision: `05_INDIA_DATA_SOURCES.md`.

## 5. How data flows

Ingestion (per-source adapter) → cleaning (mask/flag invalid values) → regridding (harmonize every source to 0.25°/daily) → feature engineering (assemble the 7+3 channel input tensor, normalize) → storage (Zarr) → model training/inference → precomputed daily output grids (Zarr/GeoTIFF, cached) → served by the API. Full detail: `09_DATA_PIPELINE.md`.

## 6. What ML/AI does

A LightGBM baseline (mandatory, fast, interpretable) and a CNN/U-Net encoder-decoder (primary DL model, whose bottleneck **is** the "satellite embedding" the PS asks for) are both trained and both reported honestly, side by side. Evaluated per-depth (RMSE, bias, correlation) against a temporal holdout (train on N-1 years, test on a held-out year) **and** against genuinely independent Argo float profiles, with the GLORYS-assimilation leakage caveat stated explicitly. Full detail, including the "why this beats a ViT/GNN for this timeline" reasoning: `10_ML_AI_STRATEGY.md`.

## 7. What the backend does

FastAPI serves precomputed reconstruction grids, point profiles, region-aggregated derived products (TCHP/MLD/D20/D26), validation summaries, and an optional NL-assistant endpoint — all reading from cache, none triggering live model inference during a demo. Full endpoint list: `13_API_SPECIFICATION.md`.

## 8. What the frontend does

Next.js + MapLibre/Deck.gl app with 8 screens: Landing, Main Ocean Map, Region Explorer/Profile, Analysis Dashboard, AI Insights (embedding viz), Validation, Reports/Export, Methodology/About. Full spec, including exact layout per screen: `12_UI_UX_SPECIFICATION.md`.

## 9. What the GIS layer does

Renders the reconstructed temperature field as a color-ramped raster overlay on a base map, with depth/date controls, uncertainty overlay, Argo float markers, and a cyclone-track replay layer. Full detail: `11_GIS_STRATEGY.md`.

## 10. What the database stores

PostgreSQL + PostGIS: `region`, `daily_product` (pointer to cached grids), `argo_profile` (with a `used_in_training` flag critical to honest validation), `prediction_at_argo`, `skill_metric`, `model_registry`, `cyclone_track`/`track_point`. Raw gridded arrays live in object storage, not the relational DB. Full schema + SQL: `14_DATABASE_SCHEMA.md`.

## 11. What every major screen does / what every major API does

See `12_UI_UX_SPECIFICATION.md` (screens) and `13_API_SPECIFICATION.md` (APIs) — not repeated here to avoid drift between two copies of the same spec.

## 12. What the MVP contains

Features 1–9 from `07_FEATURE_PRIORITIZATION.md`: ingestion, regridding, baseline + CNN models, independent Argo validation, interactive map, click-to-inspect profile, cached-serving API, offline-safe demo fallback. Nothing else is required for PS compliance.

## 13. What must NOT be built (for this cycle)

- Bathymetry/sonar/seafloor-classification features — not part of the verified PS (`01`).
- User authentication/accounts — no value for a judge-facing demo (`16`).
- Real-time operational ingestion scheduling — explicitly a Future feature (`07` #21).
- GNN architecture as a headline model — too high engineering risk for the timeline (`10` §1).
- Kubernetes/microservices/message queues — over-engineering relative to the actual data volume (`08` §8, `18`).
- INCOIS LAS direct integration — blocked on unconfirmed access; use `argopy`/Argo GDAC instead (`04` §6, `05`).

## 14. What can be added later

Calibrated ensemble uncertainty, ViT architecture variant, INCOIS LAS integration once access is confirmed, global generalization, operational real-time pipeline, mobile delivery — all listed as Future features (`07` #21–25) and revisited in `19_IMPLEMENTATION_ROADMAP.md`.

## 15. Exact recommended tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS + MapLibre GL JS + Deck.gl + Recharts |
| Backend | FastAPI (Python), REST only |
| Database | PostgreSQL + PostGIS |
| Object storage | Zarr/GeoTIFF on disk or S3-compatible bucket (Supabase Storage / Cloudflare R2) |
| ML/AI | LightGBM (baseline) + PyTorch CNN/U-Net (primary); `xarray`, `xesmf`/`cdo` (regridding), `argopy` (Argo access), `copernicusmarine` + `cdsapi` (data pulls) |
| Deployment | Vercel (frontend) + Render (backend) + Supabase (DB + storage) |
| Optional AI feature | One hosted LLM API call for the NL-assistant, with a non-LLM templated fallback |

Full reasoning for every choice: `08_SYSTEM_ARCHITECTURE.md`, `18_DEPLOYMENT.md`.

## 16. Exact repository structure

See `09_DATA_PIPELINE.md` §2 for the full tree (`frontend/`, `backend/`, `ml/`, `scripts/`, `docs/`, `tests/`, `docker/`).

## 17. Exact implementation order

Phases 0 → 11 exactly as sequenced in `19_IMPLEMENTATION_ROADMAP.md`: research setup → project skeleton → data pipeline → database → backend → ML/AI → GIS → frontend → integration → testing → deployment → demo preparation. **Do not start frontend polish before Phase 5 (ML/AI) has a validated model** — see the priority discipline in `07_FEATURE_PRIORITIZATION.md`.

## 18. Definition of Done

- [ ] Official PS requirement implemented (0.25°/daily, 15-depth reconstruction, North Indian Ocean domain)
- [ ] Real dataset integrated (no synthetic data presented as real anywhere)
- [ ] Data pipeline working end-to-end (ingestion → regrid → feature engineering → storage)
- [ ] Database working (schema applied, PostGIS indexes in place, seeded with real Argo metadata)
- [ ] API working (all endpoints in `13` return correct schema for valid and invalid input)
- [ ] GIS visualization working (map renders real reconstructed data, depth/date controls functional)
- [ ] ML/AI feature working (baseline + CNN trained, independent Argo validation computed, leakage caveat documented)
- [ ] Frontend working (all 8 screens per `12` functional against the real API)
- [ ] Responsive UI (desktop/projector target confirmed; tablet breakpoint doesn't break)
- [ ] Error handling (every failure mode in `21_RISKS_AND_LIMITATIONS.md` §2 produces the specified calm UX, not a crash)
- [ ] Demo fallback (full offline dry-run completed successfully, per `15_DEMO_FLOW.md` and `16` §6)
- [ ] Deployment (live URL reachable, smoke-tested)
- [ ] Documentation (this docs/ package kept in sync with what was actually built — update files, don't let them drift)
- [ ] Judge Q&A rehearsed (`20_JUDGE_QA.md`, especially the three flagged vulnerable questions)
- [ ] Presentation-ready demo (`15_DEMO_FLOW.md` timed and rehearsed at least once, wifi off)

## 19. First thing to build tomorrow

See `README.md` → "What we should build first tomorrow" for the exact ordered first 10–20 tasks.
