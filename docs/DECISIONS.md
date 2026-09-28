# Engineering Decision Log

Decisions taken during the build where the spec (`docs/23_MASTER_BUILD_SPEC.md` and the
supporting files) was ambiguous, contradictory, or blocked by the build environment.
Each entry records what the spec said, what was built, and why. Nothing below changes
what the product may *claim*; see `docs/21_RISKS_AND_LIMITATIONS.md`.

## D-001 · Repository started empty
The GitHub repository `saad-46/oceanembed` had no commits. The artifact's `docs/` package
is copied in verbatim as the spec; this file and `AUTONOMOUS_BUILD_STATUS.md` record
deviations.

## D-002 · Open (no-login) data sources used for the trained model; credentialed adapters kept
**Spec:** Copernicus Marine (OSTIA, Multi-Obs SSS, DUACS, GlobCurrent, GLORYS) and ERA5 (CDS).
All require a free account. **Environment:** no Copernicus/CDS credentials were available
to the autonomous build, and registration is a human action.
**Built:** every `ml/ingestion/fetch_*.py` has the spec's credentialed adapter *and* an open
equivalent behind the same `fetch(start, end, bbox)` contract. `select_adapter()` uses the
credentialed source automatically when `.env` has the keys. The current model was trained on:

| Variable | Spec primary (credentialed) | Used now (open, no login) |
|---|---|---|
| SST | CMEMS OSTIA L4 | NOAA OISST v2.1 (0.25 deg daily) - listed in docs/04 as the fallback |
| SSS | CMEMS Multi-Obs SSS | NOAA SMAP SSS NRT (0.25 deg daily) |
| SLA | CMEMS DUACS L4 | NOAA blended altimetry SLA (0.25 deg daily) |
| Currents | CMEMS GlobCurrent (total) | NOAA blended-altimetry geostrophic currents (0.25 deg daily) |
| Winds | ERA5 10 m | NOAA NCEI Blended Seawinds v2.0 (0.25 deg daily) |
| Target | GLORYS12V1 | HYCOM GOFS 3.1 analysis GLBy0.08/expt_93.0 (1/12 deg, 40 levels) |

HYCOM, like GLORYS, is a 1/12 deg data-assimilative ocean model that ingests Argo, so the
docs/10 section 3 leakage caveat applies unchanged. **To switch to the spec's exact sources:**
fill `COPERNICUSMARINE_SERVICE_USERNAME/PASSWORD` and `CDS_API_KEY` in `.env` and re-run the
pipeline - no code change.

## D-003 · Study period 2019-2023
**Spec:** ~2011-2023 (capped by satellite SSS). **Built:** 2019-01-01..2023-12-31, because the
open target (HYCOM expt_93.0) starts 2018-12-04 and SMAP SSS starts 2015-04. Split by whole
years: train 2019-2021, validate 2022, test 2023 (held out entirely; contains Cyclones Mocha
and Biparjoy used in the demo).

## D-004 · Target sampled every 3rd day (daily inside the demo window)
Fetching the 3-D target costs ~10 MB / ~30 s per day from the open server. Inputs are
ingested for every day; targets every 3rd day across 2019-2023 plus every day of May-June
2023. The model still produces **daily** output for every day (inference only needs inputs).
The HYCOM target is a 12Z instantaneous snapshot rather than a daily mean (GLORYS P1D is a
daily mean) - a small, documented representativeness difference.

## D-005 · Regridding implemented in numpy instead of xesmf
`xesmf` requires ESMF, which has no pip wheel for Windows. `ml/pipeline/regrid.py` implements
NaN-aware bilinear interpolation (for 0.25 deg sources with offset cell centres) and
area-weighted bin averaging (for 1/12 deg -> 0.25 deg coarsening), unit tested.

## D-006 · Argo via argopy / Ifremer ERDDAP, not INCOIS LAS
As pre-decided in docs/04 section 6 and docs/05: INCOIS LAS gridded Argo is not reachable
from outside INCOIS. Standard Argo GDAC profiles (QC flags 1/2) via `argopy` are used; a
direct ERDDAP tabledap fallback exists. The product always names the actual source.

## D-007 · Ports
Local API runs on **8100** and the web app on **3100** (port 8000 was already in use on the
build machine by an unrelated service).

## D-008 · Data-label vocabulary: `cached` / `live` / `simulated`
docs/16 section 6 names the labels `LIVE DATA` / `DEMO DATA` / `SIMULATED DATA`, where "DEMO DATA"
means *precomputed-but-real*. To avoid judges reading "demo" as "fake", every API response carries
`data_label: "cached"` (precomputed reconstruction from real historical observations); `live` is
reserved for an on-request inference mode (not built, docs/13) and `simulated` for synthetic
test fixtures only (never served by the API). `/v1/meta` returns the legend.

## D-009 · torch pinned to 2.5.1 (CPU) + venv-local MSVC runtime fix on Windows
The build machine's system Visual C++ runtime is the 2015 RTM build, lacking `vcruntime140_1.dll`
/ `vcomp140.dll`; torch >= 2.6 additionally needs `vcruntime140_threads.dll`. Installing the
redistributable system-wide needs admin/user action, so `scripts/fix_windows_msvc_runtime.py`
copies newer runtime DLLs already present locally into the venv only, and torch is pinned to
2.5.1. **Recommended on any fresh Windows machine:** install the current "Microsoft Visual C++
Redistributable (x64)". Linux/macOS/Docker are unaffected.

## D-010 · Open SSS = SMAP daily merged with bias-corrected SMOS 3-day
Daily NOAA SMAP SSS left ~55% of ocean cell-days empty (swath gaps) plus 209 absent days.
The open SSS input is now SMAP daily with gaps filled from the SMOS 3-day composite after
subtracting the per-cell median SMOS-minus-SMAP difference (domain median -0.25 PSU); remaining
gaps use the standard temporal/spatial fill. Absent days dropped from 209 to 1. Merge fraction
and bias are recorded in `processed/inputs_qc.json`.

## D-011 · MapLibre 5 + deck.gl overlaid mode
MapLibre GL v6 (ESM with an external worker module) failed to load its worker under Next 16/Turbopack,
and deck.gl 9.4's *interleaved* MapLibre integration crashed (`getViewport` on an undefined viewport).
Pinned `maplibre-gl@5` and run `MapboxOverlay` in overlaid mode (own canvas, synced camera). The raster is
transparent over land, so the visual result is the same; PNG export composites both canvases.

## D-012 · Production model = U-Net (spec), not selected on test results
On the 2022 validation year LightGBM is marginally better against Argo (0.86 vs 0.89 °C); on the 2023 test year
the U-Net is (0.89 vs 0.91). A post-hoc U-Net+LightGBM average scored 0.875 on 2023 but only tied LightGBM on
2022, so it was **not** adopted — choosing on test results would be test-set selection. The U-Net remains
production as the spec's primary model; all three are reported side by side.

## D-013 · Uncertainty calibrated against Argo on the validation year
The U-Net's variance head learns error relative to the training target, so against real floats it was
over-confident (41 % within ±1σ on 2023). `ml/evaluation/calibrate_uncertainty.py` adds a per-depth variance
term fitted on 2022 Argo; checked on 2023 it gives 70 % / 94 % within ±1σ / ±2σ (ideal 68 / 95 %). The API
serves the calibrated σ; the raw figures are shown alongside.

## D-014 · Product name: OceanSight
The team named the project **OceanSight** (team CodeCrafters, team ID 135494). It replaces the artifact's
working names "GAHAN" and "OceanBed" in the app, API, reports, README and submission deck. The research
artifact files (`docs/00–23`) keep their original wording as a historical record.
