# 02 · Understanding the Problem + Domain Research

## 1. The problem, in plain language

Imagine the ocean as a layered cake, but we can only ever taste the frosting on top. Satellites orbiting the Earth constantly photograph the ocean's *skin* — its surface temperature, saltiness, height, currents, and the wind blowing over it — everywhere, every day. That's cheap and continuous.

But what actually matters for cyclones, fish, and climate is what's happening **underneath**: is there a layer of warm water 100 metres down that could fuel a cyclone? Is a cold pocket of water rising toward the surface, which usually means good fishing? The only way to *directly* measure that today is to physically put an instrument in the water — a robotic float that drifts, sinks to 2000 m, measures temperature on the way up, and surfaces to radio the data home once every ~10 days. India's part of the Indian Ocean has only a few hundred of these floats scattered across an area bigger than Western Europe. On any given day, most of the ocean has no direct underwater measurement at all.

**The idea this problem statement is built on:** surface conditions leave fingerprints of what's happening underneath. A patch of unusually high sea surface height often sits above a pool of warm water pushed down by ocean eddies. A patch of low salinity after monsoon rain often sits above a shallow, decoupled warm layer. If you feed a model enough examples of "here's what the surface looked like, and here's what a nearby float found underwater at the same time," it can learn the fingerprint pattern and start predicting the underwater temperature **everywhere the satellites can see, every day** — not just where the sparse floats happen to be.

## 2. Why it matters

- **Cyclone intensity forecasting:** cyclones intensify by pulling heat out of the upper ocean. If that heat sits close to the surface, cyclones can rapidly intensify (2023's Cyclone Biparjoy and Mocha in the Bay of Bengal are recent Indian examples). Forecasters need the *heat content down to ~26°C-isotherm depth*, not just SST, to judge this.
- **Fisheries:** INCOIS already runs a Potential Fishing Zone (PFZ) advisory service used by hundreds of thousands of Indian fishermen, based substantially on surface signatures. Subsurface structure refines where fish actually congregate (thermocline depth affects where fish aggregate vertically).
- **Marine heatwave monitoring:** a warm SST anomaly can be a shallow "skin" event or a deep, ecosystem-threatening event — you cannot tell which from SST alone.
- **Data assimilation & science:** full physics-based ocean models (ROMS/HYCOM) are expensive to run continuously; a fast, satellite-only ML surrogate is a cheap cross-check or gap-filler when/where the full model isn't run.

## 3. Who faces this problem today

- **INCOIS itself** — the requesting body, which currently gets 3D ocean state from data-assimilative numerical models (ROMS, HYCOM, GODAS) that are computationally expensive and rely partly on the same sparse in-situ network.
- **Cyclone forecasters** at IMD/INCOIS who want heat-content context fast during a developing storm.
- **Fisheries advisory teams** producing PFZ bulletins.
- **Researchers** studying Bay of Bengal barrier-layer dynamics, monsoon-ocean coupling, and marine heatwaves, who need denser subsurface fields than Argo alone provides.

## 4. Existing workflow and why it's insufient

Today: run a physics-based ocean general circulation model (OGCM) that assimilates whatever in-situ and satellite data is available, and read off temperature at any depth from the model's own 3D state. This works but is (a) computationally expensive to run at high resolution/frequency, (b) dependent on model physics and assimilation scheme quality, (c) not something a hackathon team can reproduce in 36 hours, and (d) not something INCOIS necessarily wants replaced — a good ML surrogate is complementary, not a replacement, and the artifact should never claim otherwise (see `21_RISKS_AND_LIMITATIONS.md` and `20_JUDGE_QA.md` for the exact "why not just use ROMS/HYCOM?" answer).

## 5. What makes this technically difficult

1. **Ground truth for training is itself imperfect.** GLORYS is a reanalysis (a model output informed by observations), not a direct measurement — training against it teaches the model to mimic another model, with that model's own biases. True independent validation requires Argo floats *not* assimilated into the training-time reanalysis.
2. **Depth-dependent signal loss.** Surface signals imprint strongly on the mixed layer (0–100 m) and weakly, and with a lag, at depth (500–1000 m). A single architecture has to perform reasonably across a very different signal-to-noise regime at each of the 15 depths.
3. **Short usable satellite-salinity record.** Satellite SSS (SMOS/SMAP) only exists from ~2010/2015 onward, which caps usable training history to roughly 11–16 years — a small-data deep learning problem, not a "big data" one.
4. **Regional physics that generic global models miss.** The Bay of Bengal's barrier layer (see §7) is a locally important, easy-to-miss effect: SST alone is a poor predictor of what's underneath in the Bay of Bengal specifically, which is exactly why the PS mandates SSS as an input.
5. **Evaluating "is my profile physically plausible," not just "is my RMSE low."** A model can achieve a deceptively low RMSE by predicting climatology everywhere; skill has to be measured *relative to* trivial baselines (see `10_ML_AI_STRATEGY.md`).

## 6. What data is required

See `04_DATASETS_AND_APIS.md` for the full dataset deep-dive. In one line: five satellite surface fields as input (SST, SSS, SLA, surface currents, surface winds), one reanalysis product as the primary training target (GLORYS), and real Argo float profiles as the independent validation set.

## 7. What decisions/actions the system should ultimately support

- A forecaster or researcher picks a date + region and gets an estimated full-depth temperature profile in seconds, instead of waiting for/running a full ocean model.
- The system computes and surfaces INCOIS-relevant **derived products** on top of the raw reconstruction: Tropical Cyclone Heat Potential (TCHP), mixed-layer depth (MLD), 20°C/26°C isotherm depth (D20/D26) — turning "here's a temperature cube" into "here's how much fuel is available for a cyclone here."
- The system tells the user, honestly, **how confident** it is at each depth (uncertainty/calibration), because a silent wrong number is worse than no number for a decision-support tool.

## 8. What a successful solution looks like

A working pipeline that: ingests real satellite data for the Bay of Bengal / Arabian Sea → reconstructs a 15-depth temperature profile at 0.25°/daily → is scored, per depth, against Argo floats the model never trained on → beats a naive climatology baseline by a demonstrable, honestly-reported margin → is wrapped in an interface that lets a judge (playing the role of an INCOIS analyst) explore a map, click a point, see the profile and its uncertainty, and see a downstream product (TCHP) computed from it.

---

## Problem → Cause → Data → Intelligence → Action framework

| Stage | What it is here |
|---|---|
| **Problem** | INCOIS and forecasters need basin-scale subsurface ocean temperature, but direct measurement (Argo/buoys/ships) is too sparse in space and time. |
| **Cause** | Satellites can only see the ocean's surface skin; the physical link between surface state and subsurface structure exists (thermocline tilt, barrier layers, eddies) but is nonlinear and not exploitable by eye or simple formulas at basin scale. |
| **Data** | Five daily 0.25° satellite/reanalysis surface fields (SST, SSS, SLA, currents, winds) as input; GLORYS reanalysis + gridded/point Argo as target/validation. |
| **Intelligence** | A deep learning model (CNN / ViT / autoencoder / GNN / attention-hybrid, per the PS's allowed families) learns the nonlinear surface→depth mapping, producing an embedding that captures "hidden ocean dynamics," then decodes it to 15-depth temperature plus an uncertainty estimate. |
| **Action** | The reconstructed profile is turned into things a human decides with: a cyclone-relevant heat-potential number, a fishing-relevant thermocline depth, a flagged high-uncertainty region, and an exportable report — not just a number on a page. |

---

## Domain concepts — only what this PS actually needs

Bathymetry, multibeam/side-scan sonar, sub-bottom profiling, seafloor classification, and marine spatial data infrastructure (all listed in the original brief's generic "seabed" template) are **not applicable** to SIH26066 and are intentionally excluded below — including them would misrepresent what the official PS asks for.

| Concept | What it is | Why OceanEmbed needs it | Data representation | How to process it | How to visualize it | In MVP? |
|---|---|---|---|---|---|---|
| **Sea Surface Temperature (SST)** | Skin/foundation temperature of the top few metres of ocean, measured by infrared/microwave radiometers | Primary input; strongest and most complete satellite record | Daily 0.25°/0.05° gridded NetCDF | Regrid to 0.25°, mask land, normalize | Filled contour map, time series at a point | ✅ Yes |
| **Sea Surface Salinity (SSS)** | Salt concentration of surface water, from L-band microwave radiometry (SMOS/SMAP) | Mandatory input; the salinity–barrier-layer link is *the* physical reason SSS matters in the Bay of Bengal specifically | Daily/8-day 0.25° gridded NetCDF, satellite-era only (2010/2015+) | Regrid, gap-fill (satellite SSS has more missing pixels than SST), normalize | Filled contour map | ✅ Yes |
| **Sea Surface Height / Sea Level Anomaly (SSH/SLA)** | Height of sea surface relative to a reference geoid, from satellite altimetry | Mandatory input; SLA is *the* strongest physical proxy for subsurface thermocline displacement (reduced-gravity relationship, see §formula below) | Daily 0.25° gridded NetCDF (DUACS) | Regrid (already near-native at 0.25°), normalize | Filled contour + streamlines of derived geostrophic flow | ✅ Yes |
| **Surface currents (U, V)** | Horizontal water velocity at the surface, geostrophic + Ekman (wind-driven) components combined | Mandatory input; captures advection of warm/cold water masses | Daily 0.25° gridded NetCDF (u, v components) | Regrid, normalize, optionally derive speed/vorticity | Vector field / streamlines overlay on map | ✅ Yes |
| **Surface winds (U, V)** | 10 m wind vector over the ocean | Mandatory input; drives Ekman transport and vertical mixing that reshapes the mixed layer | Daily/hourly-aggregated 0.25° gridded NetCDF/GRIB (ERA5) | Regrid, aggregate to daily mean, normalize | Vector field overlay | ✅ Yes |
| **Thermocline & reduced-gravity relationship** | The depth range where temperature drops fastest with depth; in a simplified 2-layer ocean, SSH anomaly η′ ≈ (Δρ/ρ₀)·h′ where h′ is thermocline-depth anomaly | Explains *why* SLA is predictive of subsurface temperature — a physical justification, not just "the model found a correlation" | Derived diagnostic, not a raw dataset | Compute D20 (depth of 20 °C isotherm) from any temperature profile as a thermocline proxy | Depth-vs-time Hovmöller plot, or a single "thermocline depth" line on the profile view | Compute in MVP; don't build a separate screen for it |
| **Barrier layer (Bay of Bengal-specific)** | A salinity-stratified layer between the (shallow) mixed layer and the (deeper) top of the thermocline, from heavy monsoon/river freshwater input | Explains why SST alone fails in the Bay of Bengal, and is the direct justification for the PS mandating SSS as an input | No separate dataset — a derived interpretation of MLD vs. isothermal-layer-depth from the reconstructed profile | Compute isothermal layer depth (ILD) − MLD; large gaps indicate a barrier layer | A "barrier layer thickness" stat/badge in the region explorer | Nice-to-have (Should-have), not MVP |
| **Mixed layer depth (MLD)** | Depth over which surface waters are vertically well-mixed (near-uniform density/temperature) | Standard oceanographic diagnostic; INCOIS and the literature use it operationally; also a good "does the profile shape make physical sense" sanity check | Derived from the reconstructed profile (density-threshold or temperature-threshold method) | Simple thresholding on the 15-depth profile | A horizontal line on the profile chart | ✅ Should-have (cheap to compute) |
| **Tropical Cyclone Heat Potential (TCHP)** | Vertically integrated heat content between the surface and the 26 °C isotherm depth (D26); a cyclone-relevant "fuel gauge" | INCOIS runs an operational TCHP product; directly demonstrates the reconstruction's real-world value | Derived from the reconstructed profile | Integrate (T − 26°C) over depth down to D26, per standard TCHP formula | The signature "Cyclone Fuel Gauge" dial/map layer | ✅ Should-have / Wow feature (cheap once profile exists, high demo value) |
| **Marine heatwave** | A prolonged, anomalously warm SST/subsurface event | Gives a second downstream "so what" narrative beyond cyclones | Derived: compare reconstructed profile to a historical climatology at that location | Anomaly = current − climatological mean at each depth | Anomaly map / time series | Future feature, not MVP |
| **Satellite embeddings / representation learning** | Compressing multi-channel surface fields into a compact latent vector that captures "hidden ocean dynamics," per the PS's literal wording (echoing Google DeepMind's AlphaEarth Foundations concept) | This is the PS's actual technical ask — not just "regress temperature from inputs" but explicitly produce an intermediate embedding | The bottleneck layer of a CNN/ViT/autoencoder | Train encoder–decoder; expose the encoder's bottleneck as "the embedding" | A 2D projection (PCA/UMAP) of the embedding space, colored by season/region, is a strong "we understood the assignment" demo visual | ✅ Should-have (directly matches PS wording; scores well on rubric alignment) |
| **Argo floats & independent validation** | Autonomous profiling floats measuring T/S to ~2000 m every ~10 days | The PS's explicitly required validation method | Point NetCDF profiles via `argopy` | Match nearest grid cell/day to each float profile; **hold out entire years or entire floats never used in training/target generation** | Scatter plot: predicted vs. observed at each depth, with per-depth RMSE table | ✅ Mandatory — this is the PS's own evaluation requirement |
| **Reanalysis products (GLORYS, ARMOR3D, EN4)** | Model outputs that blend physics with assimilated observations to produce gap-free 3D/4D ocean state | GLORYS is the PS's named training target; ARMOR3D is a ready-made non-ML baseline to beat; EN4 is a coarse, long-record cross-check | Gridded NetCDF | Coarsen GLORYS from 1/12° to 0.25°; use ARMOR3D directly as a baseline comparison | Side-by-side map: our model vs. ARMOR3D vs. Argo truth | ✅ Yes (GLORYS = target; ARMOR3D = baseline) |
| **GIS / geospatial interpolation & regridding** | Converting between different native grids/resolutions of different satellite products | Every input dataset arrives at a different native resolution; the PS explicitly permits regridding | Nearest-neighbour / bilinear / conservative regridding (xESMF, cdo, or scipy) | One regridding step per dataset per day, cached | Not directly visualized; underlies every map layer | ✅ Yes (core pipeline step) |

**Concepts deliberately excluded (with reason):** multibeam/side-scan sonar, sub-bottom profiling, hydrographic surveying, seafloor/marine-geology classification, underwater terrain mapping — none of these appear in the verified PS; a bathymetry-flavoured system would not answer what INCOIS asked for and would waste build time.
