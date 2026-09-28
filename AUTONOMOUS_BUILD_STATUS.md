# AUTONOMOUS BUILD STATUS — OceanSight (SIH26066 OceanEmbed) · team CodeCrafters (135494)

> Persistent memory for the autonomous build. On resume: read this, `git log`, then
> continue from **NEXT TASK**. Spec: `docs/23_MASTER_BUILD_SPEC.md`. Deviations: `docs/DECISIONS.md`.

CURRENT PHASE: 11 — demo preparation / final audit (all build phases complete locally)
CURRENT TASK: product transformation complete (see OCEANSIGHT_PRODUCT_EXPERIENCE.md, OCEANSIGHT_PRODUCTION_AUDIT.md §9); next: deployment/hardening (needs accounts)

COMPLETED:
- Data: 1826 days of 5 open satellite inputs; 637 HYCOM target days; 15,018 Argo profiles; 26 IBTrACS tracks; EN4 2022-23
- Models: climatology, LightGBM, U-Net (+ no-SSS ablation); evaluate, precompute (all 1826 days), Argo validation,
  EN4 cross-check, uncertainty calibration (D-013); docs/RESULTS.md generated
- DB seeded (15k Argo, 60k predictions, skill metrics, tracks, daily_product); API 23+1 endpoints live (+ /v1/section)
- Frontend: all 8 screens verified in a browser against real data; offline fallback verified with API stopped
- UI/UX transformation (2026-09-28): design tokens + glass/card/badge/button system; cinematic landing with a real
  reconstructed depth section and API-driven metrics; sidebar app shell (Overview, Ocean Map, Profiles, Analysis,
  Validation, Insights, Reports, Methodology) with live status; floating-panel map; profiles workspace; analysis
  workspace with measured/reconstructed/derived/estimated badges on the Cyclone Fuel Gauge; validation story;
  computed insight cards; export cards with states; interactive methodology pipeline; reduced-motion support;
  no horizontal scroll at 375 px on any page
- Guided experience (2026-09-28): /tour 9-stage interactive story on real data; /demo deterministic 8-step
  presenter scenario (Bay of Bengal / Cyclone Mocha) with presenter bar; Guide me context help; simple/technical
  glossary popovers; landing tour CTAs; vitest suite (12 tests) in CI
- Tests 46/46 + CI green; backend Docker image builds and serves against PostGIS
- Docs: README (results), DECISIONS D-001..D-013, RESULTS, 24 judge Q&A as built, 25 demo script as built
- Audit: no secrets tracked; typed errors (no stack traces); CORS restricted; warm API latencies <= 350 ms
  (cyclone fuel vectorised 4.5 s -> 0.4 s); DB index migration 0002; tablet breakpoint OK, no h-scroll

DEFINITION OF DONE (docs/23 §18):
- [x] PS requirement (0.25°/daily, 15 depths, NIO)      - [x] real data, nothing synthetic presented as real
- [x] pipeline end-to-end                                - [x] DB schema + PostGIS indexes + real Argo seed
- [x] API (valid + typed invalid responses tested)       - [x] GIS map with depth/date controls on real data
- [x] ML: baseline + CNN + independent Argo + caveat     - [x] frontend 8 screens against the real API
- [x] desktop layout; tablet stacks                      - [x] calm error states (typed errors → messages)
- [x] offline fallback (verified with API down)          - [ ] live deployment (needs Vercel/Render/Supabase accounts)
- [x] docs synced (as-built addenda)                     - [ ] human rehearsal of Q&A / demo (team task)

NEXT TASK (optional improvements, in priority order):
1. Deploy when accounts exist (docs/18 addendum): `scripts/make_deploy_bundle.py`, docker images
2. With Copernicus/CDS credentials: re-run pipeline on GLORYS/OSTIA/DUACS/ERA5 and ARMOR3D baseline
3. Model: denser target sampling (stride 1-2), longer training; revisit ensemble on a fresh split

BLOCKERS (need a human):
- Optional: Copernicus Marine + CDS free accounts to switch to the spec's exact sources (D-002)
- Optional: install "Microsoft Visual C++ Redistributable (x64)" on the build PC (D-009); venv workaround in place
- Deployment (Vercel/Render/Supabase) needs account access — not done autonomously

KNOWN BUGS / LIMITATIONS:
- Embedded browser panes without a PDF plugin show a blank inline PDF preview (download/new-tab links work)
- First request after API start is slow (~4 s: store + DB pool warm-up); subsequent requests fast
- Salinity ablation shows no measurable effect (reported honestly; docs/24 #8)
TEST STATUS: 57/57 pytest; 68/68 vitest; frontend lint/typecheck/build clean; CI (GitHub Actions) green.
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
