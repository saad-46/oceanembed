# 00 · Executive Summary

## What this is

The single source-of-truth research + product + engineering artifact for **GAHAN**, Saad's team's implementation of **SIH26066 — "OceanEmbed"** (Ministry of Earth Sciences / INCOIS). This replaces ad-hoc planning: every downstream build decision (dataset choice, model architecture, API design, screen layout, demo script) is justified here against verified facts, not assumption.

## The one correction that matters most

The working name in the original brief was "OceanBed," which implied a seabed/bathymetry/sonar mapping problem. The **actual, verified** PS (`01_OFFICIAL_PROBLEM_STATEMENT.md`) is about reconstructing **subsurface ocean temperature** from surface satellite data — an entirely different domain (satellite oceanography + deep learning, not hydrographic surveying). Every file in this package is built against the verified PS, not the generic template name.

## The core technical bet

Five daily, 0.25°, freely-downloadable satellite/reanalysis surface fields (SST, SSS, SLA, currents, winds) contain enough physical signal — via thermocline tilt and Bay-of-Bengal barrier-layer dynamics — to reconstruct the temperature at 15 depths down to 1000 m, learned by a CNN/U-Net (with a LightGBM baseline reported alongside for honesty), and validated against real, held-out Argo float measurements.

## What's genuinely at risk

1. **Deadline conflict** — the scraped official record says 20 September 2026 (already past as of this writing); confirm immediately with your SPOC (`01` §1).
2. **Competitive saturation** — at least 10 public GitHub repos already target this exact PS (`03_EXISTING_SOLUTIONS.md` §3); differentiation is on validation rigor and derived-product value, not on novelty of the base approach.
3. **The independent-validation leakage caveat** — GLORYS (our training target) assimilates some of the same Argo floats we'd otherwise validate against; we disclose this explicitly rather than overclaim independence (`10_ML_AI_STRATEGY.md` §3).

## Recommended MVP in one sentence

Ingest and regrid five real satellite datasets → train a LightGBM baseline and a CNN/U-Net → validate both against genuinely held-out Argo profiles → serve the results through a map + profile viewer that also surfaces INCOIS's own operational products (cyclone heat potential, mixed layer depth) — nothing more, nothing less, until that loop is airtight.

## How to use this package

Read `23_MASTER_BUILD_SPEC.md` next — it is the operational entry point and points to every other file for detail. If you're handing this to a coding agent, tell it: *"Read docs/23_MASTER_BUILD_SPEC.md and build the prototype according to it, consulting the other numbered docs files as needed."*

## What we should build first tomorrow

1. Sign up for free Copernicus Marine, CDS, and NASA Earthdata accounts (10 min).
2. Confirm the real SIH submission deadline with your SPOC (do this today, not tomorrow).
3. Scaffold the repo per `09_DATA_PIPELINE.md` §2's folder structure.
4. Write and test **one** ingestion adapter (OSTIA SST) end-to-end for a 1-month test window — prove the whole download→regrid→store chain works before building the other six.
5. Repeat for SSS (DUACS/Multi-Obs), SLA (DUACS), currents (GlobCurrent), winds (ERA5/CDS).
6. Write and test the GLORYS target adapter, coarsened from 1/12° to 0.25°.
7. Write and test the Argo adapter via `argopy`, including the `used_in_training` flag logic.
8. Assemble the feature-engineering step (channel stacking + normalization) on the 1-month test window.
9. Train the LightGBM baseline on the test window; compute per-depth RMSE against a trivial climatology.
10. Stand up the FastAPI skeleton with a `/health` endpoint and Postgres+PostGIS running locally (Docker Compose).
11. Apply the database schema (`14_DATABASE_SCHEMA.md`) and seed the `region` table.
12. Scale ingestion from the 1-month test window to the full ~2011–2023 study period.
13. Train the CNN/U-Net on the full dataset; run the temporal holdout evaluation.
14. Run the independent Argo validation (held-out years/floats) and populate `skill_metric`.
15. Implement the `/v1/grid`, `/v1/profile`, and `/v1/validation/summary` endpoints against real cached data.
16. Scaffold the Next.js app and wire the Main Ocean Map screen against the real API.
17. Build the Region Explorer/Profile panel with the baseline-vs-model toggle.
18. Compute and wire in derived products (MLD, D20/D26, TCHP).
19. Precompute the full demo date range and rehearse `15_DEMO_FLOW.md` offline.
20. Deploy per `18_DEPLOYMENT.md` and do a final end-to-end smoke test on the live URL.
