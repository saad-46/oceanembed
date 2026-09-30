# OceanSight — feature matrix

Every feature below is served from precomputed pipeline outputs or computed on request from them; nothing is
downloaded during a request and no value is invented. Classifications (used identically in the API, the web app,
reports and exports): **measured** (in-situ), **satellite** (satellite-derived product), **reanalysis**,
**reconstructed** (OceanSight model), **derived** (deterministic calculation), **estimated**, **forecast**,
**baseline**. Method details: [`docs/SCIENTIFIC_METHODS.md`](docs/SCIENTIFIC_METHODS.md); data-quality rules:
[`docs/DATA_QUALITY.md`](docs/DATA_QUALITY.md); endpoints: [`docs/13_API_SPECIFICATION.md`](docs/13_API_SPECIFICATION.md) (as-built addendum).

## Core (pre-existing, unchanged methodology)

| Feature | Data source | Method | Endpoint | Route | Availability | Limitations |
|---|---|---|---|---|---|---|
| Subsurface temperature map (15 depths) | OceanSight U-Net on 7 satellite inputs | reconstruction (residual on climatology) | `GET /v1/grid/{date}` | `/map` | always | 2019–2023, 0.25°, daily |
| Anomaly / uncertainty | U-Net, harmonic climatology, calibrated σ | derived / estimated | `GET /v1/grid/{date}?variable=` | `/map` | always | σ calibrated on 2022 Argo |
| TCHP, MLD, D20, D26 | reconstructed column | deterministic formulas | `GET /v1/grid/{date}/product` | `/map`, `/profiles` | always | temperature-criterion MLD |
| Profile, timeline, section | reconstruction + Argo | — | `/v1/profile`, `/v1/timeline`, `/v1/section` | `/profiles`, `/timeline`, `/section` | always | — |
| Validation / EN4 / baselines | held-out 2023 Argo, EN4 | per-depth metrics | `/v1/validation/*` | `/validation` | when metrics are deployed | target assimilates Argo |
| Cyclone fuel gauge, regions | IBTrACS + reconstruction | TCHP along track | `/v1/cyclones/*`, `/v1/region/*` | `/analysis` | needs the database | descriptive, not predictive |

## Added in this upgrade

| Feature | Data source | Scientific method | Endpoint | Frontend route | Availability | Limitations |
|---|---|---|---|---|---|---|
| **Thermocline / stratification** | reconstructed profile (standard depths) | most negative dT/dz between consecutive valid levels, below the MLD, within 0–`max_depth`; layer bounds = resolution; quality flags (weak / coarse / edge / ambiguous / unrealistic) | `GET /v1/stratification` | `/stratification` | always | below 200 m the standard levels are 100–300 m apart, so depth is coarse there |
| Thermocline from a measured profile | nearest Argo (≤100 km, ±3 d) | same method on 5 m bin averages after Argo range + spike tests | `GET /v1/stratification` (`observed`) | `/stratification` | when a float is nearby | one profile, point measurement |
| **Salinity map** | satellite SMAP/SMOS SSS (0 m); optional GLORYS12V1 (depth > 0) | the model input, regridded / the reanalysis, precomputed | `GET /v1/salinity/{date}?depth=` | `/map` (Salinity) | surface: always; subsurface: **only with Copernicus Marine credentials + precompute** | salinity is **never reconstructed** |
| **Halocline** | measured Argo salinity; optional GLORYS | largest \|dS/dz\| (5 m bins for Argo), quality flags | `GET /v1/stratification` | `/stratification` | when salinity exists | hidden when there is no salinity |
| Density mixed layer, barrier layer | measured Argo T/S | TEOS-10 σ0; de Boyer Montégut (2004) 0.03 kg m⁻³ / 0.2 °C | `GET /v1/stratification`, `/v1/ts-profile` | `/stratification`, `/ts` | when salinity exists | single profile |
| **T-S diagram** | measured Argo (+ optional GLORYS) | TEOS-10 (gsw): SA, θ (0 dbar), σ0; isopycnals in the plotted coordinates | `GET /v1/ts-profile` | `/ts` | when a float with salinity is nearby | the reconstruction has no salinity and is not plotted |
| **Data quality workspace** | `inputs_qc.json`, `assemble_summary.json`, `argo_profiles.parquet`, `argo_qc.json`, metrics files | counts and shares from the pipeline's QC records; documented display thresholds | `GET /v1/data-quality` | `/data-quality` | always (sections degrade to what is deployed) | rejected Argo levels are filtered server-side and only counted from this pipeline version on |
| **Data sources & lineage** | recorded provenance (`prov_*` attrs) + adapter declarations | lineage table, per-variable source → processing → model → product → view | `GET /v1/provenance` | `/provenance` | always | — |
| **Sea-level anomaly layer** | NOAA blended altimetry SLA (model input) | regridded, gap-filled, shown in cm | `GET /v1/surface/{date}?variable=sla` | `/map` (Sea level) | when `processed/inputs.zarr` is deployed | reference mean surface as defined by the provider |
| **10 m wind layer + arrows** | NOAA NCEI Blended Seawinds (model input) | speed of the daily-mean vector; direction "from", meteorological | `GET /v1/surface/{date}?variable=wind_speed`, `GET /v1/wind/{date}/vectors` | `/map` (Wind 10 m, arrows overlay) | when `processed/inputs.zarr` is deployed | vector-mean speed ≤ mean speed; wind is not ocean current |
| **Short-horizon estimate (T+1, T+2)** | reconstructed daily series at one cell | least-squares trend over 7 days or persistence; error = 60-day hindcast RMSE ⊕ calibrated σ | `GET /v1/forecast` | `/timeline` (panel) | issue dates with ≥ 7-day window and ≥ 20 hindcast pairs; otherwise `insufficient_forecast_history` | **not a trained forecast model**; statistical extrapolation within the record |
| **3-D ocean** | reconstruction (temp / anomaly / uncertainty) | server-side stride sampling, ≤ 20 000 points (`MAX_3D_POINTS`) | `GET /v1/volume/sample` | `/3d` | ≥ 768 px wide with WebGL | 2-D alternatives on phones; depth exaggerated for display |
| **Investigation point** | the chosen grid cell + nearest Argo | — | (links, local storage) | profile panel, `/stratification`, `/ts` | always | a coordinate, not a physical station; saved points stay in this browser |
| **Uncertainty presentation** | calibrated σ + held-out coverage | ±1σ / ±2σ ranges with *measured* 2023 coverage | `GET /v1/validation/summary` | profile panel | always | not a formal confidence interval |
| Report sections + JSON export | all of the above | records with unit, depth, date, classification, source, model version | `GET /v1/report/{date}?format=json` (also `pdf`, `csv`; `sections=`) | `/reports` | always (optional sections only where data exist) | no forecast values in reports |
| Map layer availability | deployed stores | per-layer status: available / not_configured / not_precomputed / unavailable | `GET /v1/meta` (`layers`, `optional_sources`) | `/map` (disabled layers explain why) | always | — |
| Guided exploration — advanced track | the screens above | 4 optional steps after the core 8 (T-S step only when salinity can be served) | — | any (`guide=a1…a4`) | always | — |

## Optional features that need credentials

| Feature | Environment variables | How to enable |
|---|---|---|
| Subsurface salinity map, reanalysis halocline and reanalysis T-S | `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD` (free Copernicus Marine account) | `python -m ml.pipeline.build_dataset salinity --stride 3` → `processed/salinity.zarr`, then redeploy the bundle |
| ERA5 winds as the wind input (pipeline) | `CDS_API_KEY` | re-run `build_dataset inputs` |

Without them the application boots and works; the affected layers show *"not configured"* with the reason.

## Intentionally not implemented

- **Reconstructed (AI) salinity** — no trained salinity model exists; salinity comes only from satellites, Argo or the optional reanalysis.
- **A trained forecast model** — the short-horizon estimate is labelled as a statistical extrapolation.
- **Reconstructed-temperature T-S points** — pairing reconstructed temperature with salinity from another product would mix sources; not done.
