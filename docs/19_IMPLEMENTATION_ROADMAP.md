# 19 · Implementation Roadmap

## Phased roadmap

| Phase | Tasks | Files created | Dependencies | Expected output | Effort | Priority |
|---|---|---|---|---|---|---|
| **0 — Research setup** | Free-account signup (Copernicus Marine, CDS, Earthdata); clone/scaffold repo per `09_DATA_PIPELINE.md` folder structure | `.env.example`, empty folder tree | None | Accounts ready, repo scaffolded | 1–2h | 🔴 Blocking |
| **1 — Project skeleton** | Init Next.js app, init FastAPI app, docker-compose for local Postgres+PostGIS | `frontend/`, `backend/`, `docker/docker-compose.yml` | Phase 0 | Both apps boot locally, hit each other's health check | 2–3h | 🔴 Blocking |
| **2 — Data pipeline** | Write 7 ingestion adapters, cleaning, regridding | `ml/ingestion/*.py`, `ml/pipeline/*.py` | Phase 0 | Cached, regridded Zarr stores for a test date range | 6–10h | 🔴 Blocking |
| **3 — Database** | Create schema (`14_DATABASE_SCHEMA.md`), seed `region`, load Argo metadata | `backend/app/db/models.py`, migration scripts | Phase 1 | DB queryable, PostGIS indexes in place | 2–4h | 🔴 Blocking |
| **4 — Backend** | Implement all `13_API_SPECIFICATION.md` endpoints against cached data (stub model output initially) | `backend/app/api/*.py` | Phase 3 | All endpoints return correct-shape JSON | 6–8h | 🔴 Blocking |
| **5 — ML/AI** | Train baseline (LightGBM) + CNN/U-Net; run independent Argo validation; compute derived products | `ml/models/*.py`, `ml/evaluation/*.py` | Phase 2 | Trained checkpoints + `skill_metric` rows populated | 10–16h | 🔴 Blocking |
| **6 — GIS** | Wire real precomputed grids into the map layers | Deck.gl layer configs | Phase 4, 5 | Map shows real reconstructed data | 4–6h | 🟠 High |
| **7 — Frontend** | Build all 8 screens (`12_UI_UX_SPECIFICATION.md`) | `frontend/app/*`, `frontend/components/*` | Phase 6 | All screens functional against real API | 10–16h | 🟠 High |
| **8 — Integration** | Wire embedding viz, uncertainty, TCHP/MLD chips, baseline toggle end to end | Cross-cutting | Phase 5, 7 | Should-have features (`07`) working | 6–10h | 🟠 High |
| **9 — Testing** | Run `17_TESTING_STRATEGY.md` suite; fix leakage/validation bugs found | `tests/*`, `backend/tests/*` | Phase 8 | Green test suite | 4–6h | 🟠 High |
| **10 — Deployment** | Deploy per `18_DEPLOYMENT.md`; smoke-test the deployed URL | — | Phase 9 | Live judge-accessible URL | 2–4h | 🟠 High |
| **11 — Demo preparation** | Precompute the full demo date range; rehearse `15_DEMO_FLOW.md` offline; prep pitch deck (`25`-equivalent, see `23_MASTER_BUILD_SPEC.md`) | — | Phase 10 | Rehearsed, wifi-independent demo | 4–6h | 🔴 Blocking |

**Total realistic effort: ~60–95 person-hours**, parallelizable across a 6-person team (see role split in `23_MASTER_BUILD_SPEC.md`) into roughly 3–4 intensive days.

## Rapid build plans (finer-grained than the 24h/48h/3-day tiers in `07_FEATURE_PRIORITIZATION.md`)

### 6-HOUR PLAN
Build vs. skip, ruthlessly: **build** — one ingestion adapter working end-to-end (prove the whole chain: download → regrid → store) for a single month of data; **skip** — everything else. Output: proof that data access actually works, which is the single highest-risk unknown to de-risk first.

### 12-HOUR PLAN
Add: all 7 ingestion adapters for a 1-year subset; the LightGBM baseline trained and validated against a handful of Argo profiles. Output: a number — "our baseline beats climatology by X°C RMSE" — is the first real, defensible claim the team can make.

### 24-HOUR PLAN
Full `07_FEATURE_PRIORITIZATION.md` 24-hour MVP: features 1–9, CNN trained on a reduced subset, static map viewer if the interactive map isn't ready. Output: an ugly but complete, PS-compliant, honestly-validated pipeline.

### 48-HOUR PLAN
Full `07` 48-hour MVP: interactive map, derived products, baseline toggle, embedding visualization. Output: a genuinely demoable product.

**Priority discipline for all four plans: functional correctness of the core PS requirement (reconstruction + independent validation) always outranks visual polish; a correct ugly chart beats a beautiful chart of an unvalidated or leaky model.**
