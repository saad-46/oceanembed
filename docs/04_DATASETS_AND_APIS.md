# 04 · Dataset & API Deep-Dive

Accessibility legend: 🟢 immediate (anonymous or trivial free registration) · 🟡 free registration/API key required, some friction · 🟠 difficult (restricted, undocumented, or flaky) · 🔴 unavailable / could not confirm. Every entry below was checked against a live provider page; nothing here is invented.

## 1. Inputs — Sea Surface Temperature (SST)

| Dataset | Provider | URL | Coverage | Resolution | Format | Variables | API? | License | Size (NIO subset, ~10 yr) | Useful for | MVP? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CMEMS OSTIA (`SST_GLO_SST_L4_REP_OBSERVATIONS_010_011`) | UK Met Office via Copernicus Marine | [product page](https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_REP_OBSERVATIONS_010_011/description) | 1982–present (REP), NRT ongoing | 0.05° | NetCDF | Foundation SST | ✅ `copernicusmarine` CLI/Python toolbox | Free, registration | ~2–5 GB | Primary SST input | ✅ **Recommended primary** |
| NOAA OISST v2.1 | NOAA/NCEI | [ERDDAP](https://comet.nefsc.noaa.gov/erddap/griddap/noaa_psl_4e02_3713_6583.html) · [product page](https://www.ncei.noaa.gov/products/optimum-interpolation-sst) | 1981/09–present | 0.25° (native match!) | NetCDF | SST | ✅ ERDDAP/OPeNDAP, no login | Public domain | ~1–2 GB | Backup/cross-check SST, no registration needed | ✅ Fallback if Copernicus account setup stalls |
| GHRSST MUR SST v4.1 | NASA JPL PO.DAAC | [dataset](https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1) · [AWS](https://registry.opendata.aws/mur/) | 2002–present | 0.01° (must regrid down) | NetCDF/Zarr | Foundation SST | ✅ `earthaccess`, AWS S3 | NASA open, free Earthdata login | Large at native res | Higher-res cross-check | Optional |

**How to obtain (OSTIA, recommended path):**
```bash
pip install copernicusmarine --break-system-packages
copernicusmarine login   # one-time, free account at data.marine.copernicus.eu
copernicusmarine subset \
  --dataset-id cmems_obs-sst_glo_phy_l4_my_0.05deg_P1D-m \
  --variable analysed_sst \
  --start-datetime 2015-01-01 --end-datetime 2023-12-31 \
  --minimum-longitude 45 --maximum-longitude 105 \
  --minimum-latitude 5 --maximum-latitude 30 \
  -o data/raw/sst/
```

## 2. Inputs — Sea Surface Salinity (SSS)

| Dataset | Provider | URL | Coverage | Resolution | Format | Variables | API? | License | Size | Useful for | MVP? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CMEMS Multi-Obs SSS (`MULTIOBS_GLO_PHY_S_SURFACE_MYNRT_015_013`) | Copernicus Marine (blends SMOS+SMAP+Aquarius+in-situ) | [product page](https://data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_S_SURFACE_MYNRT_015_013/description) | **2010–present only** | 0.25° | NetCDF | SSS, sea surface density | ✅ toolbox | Free, registration | ~1–2 GB | Primary SSS input | ✅ **Recommended primary** |
| SMAP RSS L3 SSS | Remote Sensing Systems via PO.DAAC | [dataset](https://podaac.jpl.nasa.gov/dataset/SMAP_RSS_L3_SSS_SMI_8DAY-RUNNINGMEAN_V5) | **2015–present only** | 0.25° | NetCDF | SSS | ✅ `earthaccess` | NASA/RSS open, Earthdata login | Small–moderate | Backup/cross-check | Optional |

**⚠️ Hard constraint:** satellite SSS does not exist before ~2010 (SMOS) / 2015 (SMAP). **Any model using SSS as an input cannot be trained on years before ~2011.** This caps usable training history to ~13–15 years, not 30–40. State this explicitly in the artifact and to judges — it is a real physical constraint, not a shortcut we took.

## 3. Inputs — Sea Surface Height / Sea Level Anomaly (SSH/SLA)

| Dataset | Provider | URL | Coverage | Resolution | Format | Variables | API? | License | Size | Useful for | MVP? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CMEMS DUACS (`SEALEVEL_GLO_PHY_L4_MY_008_047`) | CNES/CLS via Copernicus | [product page](https://data.marine.copernicus.eu/product/SEALEVEL_GLO_PHY_L4_MY_008_047/description) | 1993–present | 0.25° | NetCDF | SLA, ADT, geostrophic U/V | ✅ toolbox | Free, registration | ~1–2 GB | Primary SLA input **+ free geostrophic currents as a bonus variable** | ✅ **Recommended primary** — physically the single strongest input (thermocline-tilt proxy) |

## 4. Inputs — Surface Currents (total, not just geostrophic)

| Dataset | Provider | URL | Coverage | Resolution | Format | Variables | API? | License | Size | Useful for | MVP? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CMEMS GlobCurrent (`MULTIOBS_GLO_PHY_MYNRT_015_003`) | Copernicus Marine (CLS) | [product page](https://data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_MYNRT_015_003/description) | 1993–present | 0.25° | NetCDF | Total (Ekman+geostrophic) U/V at surface and 15 m | ✅ toolbox | Free, registration | ~1–2 GB | Primary current input | ✅ **Recommended primary** — one provider/toolbox for all four CMEMS products simplifies the pipeline |
| OSCAR v2.0 | Earth & Space Research / NASA PO.DAAC | [ESR](https://www.esr.org/data-products/oscar/) · [PO.DAAC](https://podaac.jpl.nasa.gov/dataset/OSCAR_L4_OC_FINAL_V2.0) | 1992/93–present | 0.25° | NetCDF | Total surface U/V | ✅ `earthaccess` | NASA open | Small–moderate | Backup/cross-check | Optional — note: legacy 1/3° version has a documented Julian-calendar quirk other teams had to patch |

## 5. Inputs — Surface Winds

| Dataset | Provider | URL | Coverage | Resolution | Format | Variables | API? | License | Size | Useful for | MVP? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ERA5 reanalysis | ECMWF / Copernicus Climate Data Store | [dataset page](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview) | 1940–present | 0.25° delivered | GRIB/NetCDF | 10 m U/V wind (+ many others) | ✅ `cdsapi` Python | Free, registration | ~1–3 GB (daily-aggregated NIO subset) | Primary wind input | ✅ **Recommended primary** |
| CCMP v3.1 | RSS / NASA PO.DAAC | [6-hourly](https://podaac.jpl.nasa.gov/dataset/CCMP_WINDS_10M6HR_L4_V3.1) | 1988–present | 0.25° | NetCDF | 10 m ocean surface wind | ✅ `earthaccess` | Open, Earthdata login | Small–moderate | Backup/cross-check | Optional |

## 6. Target — Subsurface Temperature (training label) + validation

| Dataset | Provider | URL | Coverage | Resolution | Format | Variables | API? | License | Size | Useful for | MVP? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **GLORYS12V1** (`GLOBAL_MULTIYEAR_PHY_001_030`) | Mercator Ocean / Copernicus Marine | [product page](https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description) | 1993–present | **1/12° (0.083°) — must coarsen to 0.25°** | NetCDF | 3D T, S, currents, SSH, MLD | ✅ toolbox | Free, registration | Several GB for NIO subset, all depths, 10 yr | **The PS's named training target** | ✅ **Mandatory** |
| ARMOR3D (`MULTIOBS_GLO_PHY_TSUV_3D_MYNRT_015_012`) | CLS/Mercator via Copernicus | [product page](https://data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_TSUV_3D_MYNRT_015_012/description) | 1993–present | 0.25° | NetCDF (weekly) | 3D T, S, geostrophic U/V, MLD | ✅ toolbox | Free, registration | ~1 GB | **Ready-made non-ML baseline to beat** | ✅ Use as baseline comparison, not training data |
| Argo GDAC profiles | Argo program | [argopy GitHub](https://github.com/euroargodev/argopy) · [docs](https://argopy.readthedocs.io/) | 2000–present (sparse pre-2004–07 in Indian Ocean) | Point profiles | NetCDF via `argopy` | In-situ T, S vs. depth | ✅ `argopy` Python | Open | Small (point data) | **The PS's mandatory independent validation set** | ✅ **Mandatory** |
| INCOIS LAS — Gridded ARGO | INCOIS | [LAS server](https://las.incois.gov.in/las/ProductServer.do) | Argo-era (~2004–present) | INCOIS product-specific | NetCDF (nominal, via OPeNDAP/LAS) | Gridded Argo T/S | 🟠 Nominal OPeNDAP, unconfirmed from outside INCOIS | INCOIS/public (domestic) | Unknown | Named PS validation source | 🟠 **Highest-risk dependency — see below** |
| EN4 | UK Met Office Hadley Centre | [EN4 page](https://www.metoffice.gov.uk/hadobs/en4/index.html) | 1900–present | 1° monthly (coarse) | NetCDF | Gridded T/S | ✅ direct bulk download | Open | Small | Long-record bias/sanity cross-check | Optional |

**⚠️ INCOIS LAS risk, and the fallback plan:** the LAS `ProductServer.do` URL named in the PS resolves but shows no visible dataset catalogue from a plain fetch; INCOIS has published papers describing this LAS instance (e.g. [ResearchGate](https://www.researchgate.net/publication/259367663_INCOIS_Live_Access_Server_A_Platform_for_Serving_the_Geospatial_Data_of_Indian_Ocean)), but the exact OPeNDAP dataset URL/variable names were not confirmable from outside INCOIS's network in this research pass. **Do not block the project on this.** Use `argopy` directly against the standard Argo GDAC (functionally the same underlying float data, a standard and fully documented Python API) plus CMEMS ARMOR3D and EN4 as the validation stack, and state in the final artifact: *"INCOIS LAS gridded-Argo was attempted; the standard Argo GDAC via `argopy` was used as the accessible equivalent."* This is honest, defensible, and does not weaken the PoC.

## 7. Sample data structure (what you'll actually see after download)

A typical CMEMS/Argo NetCDF file, opened with `xarray`:
```python
import xarray as xr
ds = xr.open_dataset("data/raw/sst/OSTIA_2015-2023_NIO.nc")
print(ds)
# <xarray.Dataset>
# Dimensions:  (time: 3287, latitude: 100, longitude: 240)
# Coordinates:
#   * time       (time) datetime64[ns]
#   * latitude   (latitude) float32  5.0 ... 30.0
#   * longitude  (longitude) float32  45.0 ... 105.0
# Data variables:
#     analysed_sst  (time, latitude, longitude) float32
```
Argo profiles via `argopy`:
```python
from argopy import DataFetcher
ds = DataFetcher().region([45, 105, 5, 30, 0, 2000, "2015-01", "2023-12"]).load()
argo_df = ds.data.to_dataframe()  # columns: PLATFORM_NUMBER, TIME, LATITUDE, LONGITUDE, PRES, TEMP, PSAL, ...
```

## 8. Missing-data and licensing notes

- All CMEMS products require a **free** Copernicus Marine account (one-time signup); no cost, no institutional affiliation needed, no paywall.
- ERA5 requires a **free** CDS account + accepting the Copernicus license (click-through, not paid).
- NASA PO.DAAC products require a **free** Earthdata Login.
- All licenses reviewed are open/attribution-only — **no dataset in this pipeline is paid or restricted to Indian institutions only**, which matters for a student team with no institutional CMEMS/INCOIS credentials.
- Missing-pixel handling: satellite SSS has materially more gaps (cloud/RFI-affected swaths) than SST; plan a simple gap-fill (nearest-neighbour in time, or the CMEMS product's own gap-filled L4 version) rather than leaving NaNs in training tensors.

## 9. Summary judgement

Every **required input variable** has a real, reachable, free (registration-gated at most) 0.25°-daily source: OSTIA for SST, CMEMS multi-obs for SSS, DUACS for SLA, GlobCurrent for currents, ERA5 for winds — and critically, **all four CMEMS products come through one toolbox and one login**, which is the single biggest pipeline-simplification decision in this artifact. The target (GLORYS) is fully accessible but needs coarsening from 1/12° to 0.25°, exactly as the PS's own fallback clause anticipates. The one unresolved item is the INCOIS LAS gridded-Argo product named as a *companion* validation source — `argopy` against the standard Argo GDAC is the accessible, fully-documented substitute and should be used without apology.
