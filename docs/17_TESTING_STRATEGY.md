# 17 · Testing Strategy

Priority order given limited time: **ML correctness and data validation tests first** (a wrong number is worse than a missing button), then API tests, then GIS/UI, then everything else.

| Test type | What to test | Tooling | Priority |
|---|---|---|---|
| **Data validation tests** | Each ingestion adapter returns the expected dims/coords/no-NaN-explosion; physically implausible values are flagged; regridding preserves the domain bounding box | `pytest` + `xarray` assertions | 🔴 Critical |
| **ML tests** | Baseline model beats a trivial mean-predictor; CNN training loss decreases; held-out-year validation script runs end-to-end and produces the expected `skill_metric` rows; leakage check (no validation-year statistics used in training normalization) | `pytest`, small synthetic fixtures for fast CI | 🔴 Critical |
| **GIS tests** | Coordinate transforms round-trip correctly; PostGIS nearest-neighbour query returns the expected float for a known test point; bounding-box region stats match a hand-computed value on a toy grid | `pytest` + PostGIS test DB | 🟠 High |
| **API tests** | Every endpoint returns correct schema for valid input and a typed error for invalid input (bad date, out-of-domain lat/lon, invalid depth) | `pytest` + FastAPI `TestClient` | 🟠 High |
| **Unit tests** | Derived-product formulas (MLD, D20/D26, TCHP) match hand-computed reference values on a known synthetic profile | `pytest` | 🟠 High |
| **Integration tests** | Full flow: ingestion → pipeline → cached grid → API → expected JSON shape, on one small fixture day | `pytest` | 🟡 Medium |
| **End-to-end / UI tests** | The exact demo script (`15_DEMO_FLOW.md`) click-path works without console errors | Manual run-through (Playwright optional if time allows) | 🟡 Medium |
| **Performance tests** | API responds in <500ms for a cached grid/profile lookup under demo-like load (single user, occasional judge laptop) | Simple timing assertions, not a full load-test rig | 🟢 Nice-to-have |

## What must be verified before the demo, non-negotiably

1. `pytest` suite green on the ML validation pipeline (no silently broken leakage-check).
2. Every API endpoint used in the demo script returns 200 for the exact date/lat/lon combinations that will be clicked live.
3. A full offline dry-run (wifi disabled) of the demo script completes without any visible error state.
