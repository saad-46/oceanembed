# 22 · Research Sources

## Official government / sponsor sources
- SIH2026 PS mirror (GitHub): [NoBugNinja/Smart-India-Hackathon-SIH-2026-Problem-Statements](https://github.com/NoBugNinja/Smart-India-Hackathon-SIH-2026-Problem-Statements) — source of the verbatim PS text in `01_OFFICIAL_PROBLEM_STATEMENT.md`, scraped from `sih.gov.in/sih2026PS` on 2026-08-22.
- INCOIS Tropical Cyclone Heat Potential service: [incois.gov.in/site/services/tchp.jsp](https://incois.gov.in/site/services/tchp.jsp)
- INCOIS Potential Fishing Zone advisory: [incois.gov.in/geoportal/MFASPFZ/index.html](https://incois.gov.in/geoportal/MFASPFZ/index.html)
- INCOIS Argo information page: [services.incois.gov.in/argo/argo_about.jsp](https://services.incois.gov.in/argo/argo_about.jsp)
- INCOIS LAS server (named in PS, access unconfirmed): [las.incois.gov.in/las/ProductServer.do](https://las.incois.gov.in/las/ProductServer.do)
- **⚠️ Not independently verified this pass:** live sih.gov.in access (returned HTTP 403 to automated fetch) — re-confirm the deadline directly before relying on it.

## Dataset sources
- Copernicus Marine OSTIA SST: [data.marine.copernicus.eu/product/SST_GLO_SST_L4_REP_OBSERVATIONS_010_011](https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_REP_OBSERVATIONS_010_011/description)
- NOAA OISST v2.1: [ncei.noaa.gov/products/optimum-interpolation-sst](https://www.ncei.noaa.gov/products/optimum-interpolation-sst)
- NASA GHRSST MUR SST: [podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1](https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1)
- Copernicus Multi-Obs SSS: [data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_S_SURFACE_MYNRT_015_013](https://data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_S_SURFACE_MYNRT_015_013/description)
- SMAP RSS L3 SSS: [podaac.jpl.nasa.gov/dataset/SMAP_RSS_L3_SSS_SMI_8DAY-RUNNINGMEAN_V5](https://podaac.jpl.nasa.gov/dataset/SMAP_RSS_L3_SSS_SMI_8DAY-RUNNINGMEAN_V5)
- Copernicus DUACS sea level (SLA/ADT/geostrophic currents): [data.marine.copernicus.eu/product/SEALEVEL_GLO_PHY_L4_MY_008_047](https://data.marine.copernicus.eu/product/SEALEVEL_GLO_PHY_L4_MY_008_047/description)
- Copernicus GlobCurrent: [data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_MYNRT_015_003](https://data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_MYNRT_015_003/description)
- OSCAR surface currents: [esr.org/data-products/oscar](https://www.esr.org/data-products/oscar/)
- ECMWF ERA5 reanalysis: [cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels?tab=overview)
- RSS CCMP winds: [remss.com/measurements/ccmp](https://www.remss.com/measurements/ccmp/)
- Copernicus GLORYS12V1 (training target, PS-named): [data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030](https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description) (DOI: [10.48670/moi-00021](https://doi.org/10.48670/moi-00021))
- Copernicus ARMOR3D (baseline comparison product): [data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_TSUV_3D_MYNRT_015_012](https://data.marine.copernicus.eu/product/MULTIOBS_GLO_PHY_TSUV_3D_MYNRT_015_012/description)
- Argo float program via `argopy`: [github.com/euroargodev/argopy](https://github.com/euroargodev/argopy) / [argopy.readthedocs.io](https://argopy.readthedocs.io/)
- UK Met Office EN4: [metoffice.gov.uk/hadobs/en4](https://www.metoffice.gov.uk/hadobs/en4/index.html)

## Scientific / research papers
- Vinayachandran (2002), Bay of Bengal barrier layer mechanisms: [agupubs.onlinelibrary.wiley.com/doi/10.1029/2001JC000831](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2001JC000831)
- Global subsurface T reconstruction, ConvLSTM, MDPI *Remote Sensing* 2022: [doi.org/10.3390/rs14133198](https://doi.org/10.3390/rs14133198)
- AI-based subsurface thermohaline retrieval (XGBoost/RF vs. Bi-LSTM/CNN), Springer 2023: [link.springer.com/chapter/10.1007/978-981-19-6375-9_5](https://link.springer.com/chapter/10.1007/978-981-19-6375-9_5)
- Spatiotemporal Graph Attention Network (STGAT), ScienceDirect 2026: [sciencedirect.com/science/article/pii/S1569843226001536](https://www.sciencedirect.com/science/article/pii/S1569843226001536)
- Hybrid decomposition ML, Arabian Sea, ResearchGate 2024: [researchgate.net/publication/384845607](https://www.researchgate.net/publication/384845607_A_hybrid_decomposition-based_Machine_Learning_approach_for_predicting_subsurface_temperature_in_the_Arabian_Sea)
- Dual-attention CNN for MLD, Bay of Bengal, Springer 2024: [link.springer.com/article/10.1007/s00343-024-4122-9](https://link.springer.com/article/10.1007/s00343-024-4122-9)
- Google DeepMind AlphaEarth Foundations (satellite embedding concept): [deepmind.google/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail](https://deepmind.google/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/)

## Prior art / patents
- Targeted patent search ("subsurface ocean temperature reconstruction satellite machine learning") returned no confirmed patent filings — **unverified/not found**, no known patent blocks this approach.

## Open-source / hackathon prior art (competitive landscape)
- `Ocean-Embed-MoES/OceanEmbed-poc`: [github.com/Ocean-Embed-MoES/OceanEmbed-poc](https://github.com/Ocean-Embed-MoES/OceanEmbed-poc)
- `sayan21m/nio-satdepth`: [github.com/sayan21m/nio-satdepth](https://github.com/sayan21m/nio-satdepth)
- `FarhanAaqil/AquaSphere`: [github.com/FarhanAaqil/AquaSphere](https://github.com/FarhanAaqil/AquaSphere)
- Additional early-stage attempts: `jyoti-codessss/OceanEmbed-MVP`, `Murthy6440/OceanEmbed_SIH26066`, `aaronpinto449-source/OceanEmbed`, `vennavellisaisohan/Ocean_Embed_SIH`, `Abdulbasith0512/OceanEmbed-Y`, `mohammadmansurpolikimulla-eng/OceanEmbed-SIH26066`, `sakshipriya21-rgb/OceanEmbed`

## Technical documentation / industry
- Copernicus Marine Toolbox docs: [help.marine.copernicus.eu](https://help.marine.copernicus.eu/)
- `argopy` documentation: [argopy.readthedocs.io](https://argopy.readthedocs.io/)
- PO.DAAC `earthaccess` tutorials: [podaac.github.io/tutorials](https://podaac.github.io/tutorials/notebooks/opendap/MUR-OPeNDAP.html)
- NOAA AOML Tropical Cyclone Heat Potential background: [aoml.noaa.gov/phod/cyclone](https://www.aoml.noaa.gov/phod/cyclone/index.php)

All entries above were checked against a live provider page or fetched directly during the research pass behind this artifact; anything not independently confirmed is explicitly marked **unverified** rather than presented as fact.
