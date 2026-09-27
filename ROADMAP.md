# ROADMAP — GAHAN (SIH26066 · OceanEmbed)

*Condensed roadmap. Full detail and hour-by-hour plans: `docs/19_IMPLEMENTATION_ROADMAP.md`, time-boxed builds in `docs/07_FEATURE_PRIORITIZATION.md`.*

| Phase | Focus | Blocking? |
|---|---|---|
| 0 | Research setup — free-account signups | 🔴 |
| 1 | Project skeleton — Next.js + FastAPI + Docker Compose | 🔴 |
| 2 | Data pipeline — 7 ingestion adapters, cleaning, regridding | 🔴 |
| 3 | Database — schema, PostGIS indexes, Argo metadata seed | 🔴 |
| 4 | Backend — all API endpoints against cached data | 🔴 |
| 5 | ML/AI — baseline + CNN training, independent Argo validation | 🔴 |
| 6 | GIS — wire real precomputed grids into map layers | 🟠 |
| 7 | Frontend — all 8 screens | 🟠 |
| 8 | Integration — uncertainty, TCHP/MLD, baseline toggle, embedding viz | 🟠 |
| 9 | Testing — full `docs/17_TESTING_STRATEGY.md` suite | 🟠 |
| 10 | Deployment — Vercel + Render + Supabase | 🟠 |
| 11 | Demo prep — precompute demo range, rehearse offline | 🔴 |

**Rule: functional correctness of the core PS requirement (reconstruction + independent validation) always outranks visual polish.** Do not start frontend polish before Phase 5 has a validated model.

Total realistic effort: ~60–95 person-hours across a 6-person team, ~3–4 intensive days. See `docs/00_EXECUTIVE_SUMMARY.md` for the exact ordered first 20 tasks to start tomorrow.
