# 05 · India-Specific Data Sources

This PS is sponsored by an Indian government body (INCOIS/MoES) and judged partly on Indian applicability, so this section is worth doing carefully even though (per `04_DATASETS_AND_APIS.md`) the actual training pipeline runs mostly on international open datasets.

## 1. What's publicly available from Indian sources

| Source | Relevance to SIH26066 | Status |
|---|---|---|
| **INCOIS** (Indian National Centre for Ocean Information Services) | The requesting department. Runs public operational services: [Tropical Cyclone Heat Potential](https://incois.gov.in/site/services/tchp.jsp), [Potential Fishing Zone advisories](https://incois.gov.in/geoportal/MFASPFZ/index.html), an [Argo information page](https://services.incois.gov.in/argo/argo_about.jsp), and the **LAS gridded-Argo** server named directly in the PS. | 🟠 Web services/advisories are public and citable as motivation; the LAS gridded-Argo NetCDF/OPeNDAP endpoint could not be confirmed as cleanly machine-downloadable from outside INCOIS's network in this research pass (see `04_DATASETS_AND_APIS.md` §6). |
| **Argo India** (part of the global Argo program, INCOIS-coordinated) | Indian-deployed Argo floats are already part of the global Argo GDAC, accessible via `argopy` (no separate Indian-only feed needed). | ✅ Fully usable via the standard international `argopy` pipeline. |
| **ISRO / Bhuvan** | ISRO's geoportal, mainly land remote sensing (LULC, DEM, disaster layers) and some coastal/ocean color products (via INSAT-3D/Oceansat). Not a source of subsurface temperature or the 5 required surface variables at the needed resolution/cadence. | 🔴 Not relevant to the *core* ML pipeline. Only marginally useful for an optional coastline/EEZ boundary basemap layer in the UI. |
| **National Hydrographic Office (NHO), Survey of India** | Navigational charts and bathymetry (seafloor depth) for shipping safety. This is a **bathymetry**, not subsurface-*temperature*, mandate — outside this PS's scope entirely (see `02_DOMAIN_RESEARCH.md` §0 on the OceanBed/OceanEmbed naming correction). | 🔴 Not applicable to this PS. Do not present NHO bathymetry data as if it satisfies this problem statement. |
| **NIOT (National Institute of Ocean Technology)** | Runs India's moored ocean buoy network (RAMA/OMNI buoys) and some deep-sea research infrastructure. Buoy point data could, in principle, supplement Argo as additional in-situ validation points. | 🟡 Potentially useful as a *bonus* validation source if buoy data can be located publicly (not confirmed in this pass — treat as a stretch idea, not a plan dependency). |
| **data.gov.in** (India's open government data portal) | General-purpose open data portal; searched for ocean/oceanographic datasets. | 🔴 No confirmed high-resolution daily oceanographic product suitable for this PS was found there in this research pass — treat as **unverified/not found**, don't claim it as a source without checking again. |

## 2. What's restricted

- INCOIS's internal, non-public data feeds (raw instrument telemetry, internal model runs) are not accessible to a hackathon team and were never assumed to be.
- The exact internal schema/access credentials for the INCOIS LAS gridded-Argo endpoint appear to require being inside INCOIS's own network or having a specific access arrangement — flagged 🟠 and not assumed available.

## 3. What can realistically be used in the prototype

**Everything the ML pipeline actually needs** (SST, SSS, SLA, currents, winds, GLORYS target, Argo validation) is available through **international, free, open, well-documented sources** (Copernicus Marine, ECMWF/CDS, NASA PO.DAAC, the global Argo program) as detailed in `04_DATASETS_AND_APIS.md`. This is good news, not a compromise: Indian-specific "high-resolution proprietary" data was never required by the PS text, and building on the standard global pipeline is exactly what every serious competing team (see `03_EXISTING_SOLUTIONS.md`) is doing too.

## 4. What can represent India-specific value if higher-res Indian data is unavailable

- Frame the product narrative and every derived output (TCHP, MLD, PFZ-style thermocline context) explicitly around **INCOIS's own stated operational uses** (see `02_DOMAIN_RESEARCH.md` §2) — this is what makes the project "Indian" in substance, not just in having an Indian dataset.
- Use the exact PS-mandated domain (5–30°N, 45–105°E — Arabian Sea + Bay of Bengal) as the sole study area, rather than a generic global demo.
- Cite INCOIS's own public service pages (TCHP, PFZ) as the operational context the project speaks to.

## 5. Designing the system to later accept official Indian data

The data-ingestion layer (`09_DATA_PIPELINE.md`) is deliberately built around a **provider-agnostic NetCDF/gridded-array interface**: each source is a small adapter function that returns a common `xarray.Dataset` shape (`time, lat, lon` → variable). Adding INCOIS LAS gridded-Argo later — if/when clean access is obtained — means writing one more adapter that conforms to the same interface; nothing else in the pipeline, model, or API needs to change. This is stated explicitly in `08_SYSTEM_ARCHITECTURE.md` and `23_MASTER_BUILD_SPEC.md` so a future contributor (or judge asking "how would you plug in official INCOIS data later?") has a concrete, truthful answer rather than a hand-wave.
