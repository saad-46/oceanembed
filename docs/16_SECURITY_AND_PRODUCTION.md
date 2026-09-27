# 16 · Production Readiness & Demo Reliability

Every item below is tagged **[Hackathon]** (build this now) or **[Production]** (design for it, don't build it yet) — conflating the two wastes MVP time (Research Rule #7).

## 1. Security & validation

| Item | Hackathon | Production |
|---|---|---|
| Authentication | **[Hackathon]** None — public judge-facing demo, no accounts, no sensitive data | **[Production]** API keys / OAuth for partner integrations (e.g. an INCOIS internal consumer) |
| API input validation | **[Hackathon]** Pydantic schemas on every endpoint (date ranges, lat/lon bounds within the PS domain, valid depth values) — cheap, prevents 90% of demo-breaking bad input | **[Production]** Same, plus stricter rate-based anomaly detection |
| Rate limiting | **[Hackathon]** Not needed (no public internet traffic during a judged demo) | **[Production]** Standard token-bucket limiting per API key |
| Secrets management | **[Hackathon]** `.env` file (gitignored), `.env.example` committed with placeholder values | **[Production]** A managed secrets store (cloud provider's secret manager) |

## 2. Error handling & logging

- **[Hackathon]** Every API endpoint wraps its data-lookup in a try/except returning a clear typed error (`{"error":"date_out_of_range","detail":"..."}`, not a raw stack trace) — the frontend maps these to the calm error states specified in `12_UI_UX_SPECIFICATION.md`.
- **[Hackathon]** Basic structured logging (`logging` module, JSON lines) to stdout — enough to debug during the demo, no dedicated log aggregation service needed.
- **[Production]** Centralized logging/monitoring (e.g. hosted log aggregation + alerting), request tracing across services.

## 3. Performance & large-dataset handling

- **[Hackathon]** Precompute everything for the demo date range in advance (`09_DATA_PIPELINE.md`); the API only reads cached Zarr/GeoTIFF, never re-runs inference live — this alone eliminates the largest class of hackathon-demo failure (a slow/flaky live inference call).
- **[Hackathon]** PostGIS spatial indexes (GiST) on every geometry column (`14_DATABASE_SCHEMA.md`) so nearest-Argo-float lookups stay sub-second even with the full historical Argo table loaded.
- **[Production]** Background job queue (e.g. a task queue) for daily re-ingestion/re-inference on a schedule; horizontal scaling of the inference service if request volume grows.

## 4. Model & data versioning, reproducibility

- **[Hackathon]** `model_registry` table (`14_DATABASE_SCHEMA.md`) records exactly which model version produced which cached grid — so "which model made this prediction" is always answerable, a common judge question.
- **[Hackathon]** Every ingestion script is idempotent and logs the exact dataset version/date range pulled (Copernicus/CDS products are versioned; record the version string).
- **[Production]** Full experiment tracking (e.g. MLflow/Weights & Biases), automated retraining pipeline, data lineage tooling.

## 5. Testing before the demo

See `17_TESTING_STRATEGY.md` for the full plan — at minimum, a full offline dry-run of the exact demo script (`15_DEMO_FLOW.md`) with wifi disabled, at least once the day before presenting.

## 6. Demo / fallback strategy — because hackathon wifi and APIs will fail

**Core principle: the live demo never makes a live external network call.** Everything the judge sees during the 5–7 minute window is served from precomputed, cached, locally-stored data.

| Layer | Fallback |
|---|---|
| Satellite data ingestion | Not called live during the demo at all — all ingestion happens ahead of time, offline, into cached Zarr/GeoTIFF |
| Model inference | Precomputed for the full demo date range; a genuinely "live, type any date" mode (if built) has its own separate, clearly-labeled "live inference" toggle, off by default during judging |
| Map tiles / basemap | Use a MapLibre style that can be bundled/self-hosted, or confirm the venue's wifi reaches the tile CDN in a pre-demo test; carry a static basemap image as a last-resort fallback |
| NL assistant (optional AI feature) | Falls back to a templated (non-LLM) sentence built from the same computed numbers — the demo never shows a raw API failure |
| **Labeling discipline** | Any screen that is ever showing non-live/precomputed/synthetic content is labeled in the UI: `LIVE DATA` for something that just re-ran, `DEMO DATA` for precomputed-but-real historical data (the normal demo mode), `SIMULATED DATA` only for the rare pipeline-testing synthetic grid — **never presented as if it were a real reconstruction** |

This directly satisfies Research Rule #17 ("the final system must be demonstrable without relying on fragile external services") without ever crossing into misrepresenting synthetic data as measured data (Research Rule #3 and the claims discipline in `21_RISKS_AND_LIMITATIONS.md`).
