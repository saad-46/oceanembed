# Data quality — what the Data Quality workspace reports and how status is assigned

`GET /v1/data-quality` (`backend/app/services/catalog.py`) reads only records the pipeline writes; nothing is
estimated. The QC rules shown in the workspace are imported from `ml/qc_rules.py`, the same constants the pipeline
applies (`tests/test_catalog.py` asserts this), so documentation and processing cannot drift apart.

## Records read

| File | Written by | Used for |
|---|---|---|
| `processed/inputs_qc.json` | `ml.pipeline.clean.build_inputs` | per-input missing values, temporal / spatial fills, range-flagged values, duplicate times, days absent, recorded source provenance |
| `processed/inputs.zarr` (`ocean_mask`, time axis) | same | denominator (ocean values = ocean cells × days) for the percentages |
| `processed/assemble_summary.json` | `ml.pipeline.feature_engineering.assemble` | training-target days per split, ocean cells |
| `processed/argo_profiles.parquet` | `ml.ingestion.fetch_argo.build_argo` | profile counts, splits, data modes, depth coverage, salinity coverage, temporal and 1° spatial coverage |
| `processed/argo_qc.json` | `build_argo` (this version onward) | profiles received / dropped (no resolvable standard depth) / duplicates |
| `outputs/metrics_*.json` | evaluation scripts | presence of validation and EN4 cross-check |

## QC rules (from `ml/qc_rules.py`)

* Argo: QC flags 1 and 2 (good, probably good); standard depths interpolated only when the bracketing samples are
  closer than 10 m (0–50 m), 25 m (50–100 m), 50 m (100–300 m), 100 m (300–700 m), 200 m (700–1000 m), 250 m (1000 m);
  0 m uses the shallowest sample if within 6 m; ≥ 3 levels.
* Satellite inputs: physical ranges SST −2…40 °C, SSS 0…45 PSU, SLA −2…2 m, currents ±5 m s⁻¹, wind ±60 m s⁻¹;
  gaps ≤ 7 days filled by linear interpolation in time, the rest by the nearest valid ocean cell; all fills counted.
* Regridding: bilinear for ~0.25° sources, cos-lat area-weighted averaging for 1/12° sources.
* Grid: ocean where SST is valid on > 50 % of days; a (depth, cell) is reconstructed where the target is valid on ≥ 90 % of days.

## Status thresholds (OceanSight display thresholds)

These summarise the records; they are not a certification.

| Quantity | good | limited | insufficient |
|---|---|---|---|
| Gap-filled share of an input's ocean values | ≤ 5 % | ≤ 25 % | > 25 % |
| Share of Argo profiles resolving a standard depth | ≥ 50 % | ≥ 10 % | < 10 % |
| Held-out (test-year) Argo profiles | ≥ 500 | ≥ 100 | < 100 |
| Days without a reconstruction in the study period | ≤ 1 % | ≤ 5 % | > 5 % |
| Training target | days in every split | a split without days | — |

## Known gaps

* Argo levels failing QC flags are filtered by the data server and never downloaded, so a "rejected" count exists only
  as profiles received vs kept (recorded from this pipeline version on); for earlier builds the workspace says so.
* Stores built before this version lack `argo_qc.json`; re-running `build_dataset argo` creates it.
