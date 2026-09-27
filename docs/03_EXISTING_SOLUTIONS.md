# 03 · Existing Solutions & Prior Art

## 1. Operational / research systems

| System | Organization | Purpose | Technology | Data | Strength | Limitation | What we can learn |
|---|---|---|---|---|---|---|---|
| **ARMOR3D** (`MULTIOBS_GLO_PHY_TSUV_3D_MYNRT_015_012`) | CLS/Mercator Ocean via Copernicus Marine (Guinehut, Mulet et al.) | Operational 3D temperature/salinity/current reconstruction from surface obs + Argo | Statistical multi/synthetic regression, EOF-based (not deep learning) | Satellite SST/SSH/SSS + Argo, 1993–present | Real operational product, global, already validated for years | Not deep learning; coarser method than what the PS asks for | **This is our ready-made baseline to beat.** If our DL model can't beat ARMOR3D on independent Argo, we don't have a case for DL over classical statistics. |
| **INCOIS Tropical Cyclone Heat Potential (TCHP) service** | INCOIS | Operational cyclone-relevant heat-content product | ROMS/HYCOM ocean models + GODAS analysis + SST/SSHA | Assimilative numerical ocean model | Physically complete, operational, trusted | Computationally expensive; not a satellite-only surrogate | Confirms exactly *why* a fast satellite-only surrogate has real value — INCOIS already computes and uses this quantity, we're proposing a cheaper complementary path to it, not a replacement. |
| **INCOIS Potential Fishing Zone (PFZ) advisory** | INCOIS | Advises fishermen where to fish, largely from SST fronts/chlorophyll | Operational satellite-based advisory | SST, ocean color | Nationally deployed, high real-world impact | Mostly surface-signal based today | Gives a second legitimate "so what" story: a subsurface-aware thermocline/MLD estimate could refine PFZ-style advisories. |
| **Buongiorno Nardelli & Santoleri (2005) and successors** | Academic (Italy) | Original EOF-based synthetic-profile method that ARMOR3D descends from | EOF/PCA regression | Satellite + Argo | Foundational method, well cited | A 2024 attempt to re-publish essentially the same idea was rejected by reviewers for lacking novelty over this | Any EOF/PCA-only approach we build should be framed as a *baseline*, never as the headline "novel" contribution — reviewers/judges will recognise it as 20-year-old technique. |

## 2. Academic prior art (subsurface-from-surface reconstruction)

| # | Work | Method | Data / region | Reported skill | Takeaway |
|---|---|---|---|---|---|
| 1 | Global subsurface T reconstruction 1993–2020, MDPI *Remote Sensing* 2022 | ConvLSTM vs. LightGBM baseline | SST/SSH/wind → Argo-gridded labels, 1°, 23 depths to 2000 m, global | Overall RMSE ≈ 0.34 °C; error rises 0–100 m, peaks 100–500 m | Confirms the "hardest zone is the thermocline" pattern we should expect and report. |
| 2 | AI-based subsurface thermohaline retrieval, Springer book chapter 2023 | XGBoost/Random Forest vs. Bi-LSTM/CNN | SSH/SST/SSS/wind → Argo gridded, 2010–2015, 16 depths to 1000 m, incl. Indian Ocean | XGBoost best: R² ≈ 0.98–0.99, RMSE ≈ 0.03 °C @600 m; CNN worst at shallow depths | **Tree ensembles beat deep nets at depth in this study** — the strongest evidence for including a gradient-boosting baseline, not just a fashionable architecture. |
| 3 | Spatiotemporal Graph Attention Network (STGAT), ScienceDirect 2026 | GAT + temporal convolution | SLA/SST/SSS/wind → GLORYS labels, Kuroshio Extension (NW Pacific) | RMSE 0.92 °C / R² 0.87 vs GLORYS; 0.90 °C / R² 0.98 vs EN4 | Directly matches the PS's GNN option; shows this is a serious multi-month research effort elsewhere, not a hackathon-weekend architecture — treat GNN as stretch-only. |
| 4 | Hybrid decomposition-based ML for subsurface T, Arabian Sea (ResearchGate 2024) | Hybrid signal decomposition + ML | Arabian Sea (directly overlaps our domain) | Not independently re-verified this pass | Most directly relevant *regional* paper found — read before finalizing architecture. |
| 5 | Dual-attention CNN for MLD, Bay of Bengal (Springer, *J. Oceanology & Limnology* 2024) | Attention-augmented CNN | Bay of Bengal | Not independently re-verified this pass | Same domain, adjacent target (MLD instead of full profile) — useful for our MLD evaluation. |
| 6 | Convformer, multi-source RS subsurface reconstruction, MDPI *Remote Sensing* 2024 | Conv + Transformer hybrid | Not confirmed region | Not independently re-verified this pass | Matches the PS's "attention-based hybrid" option directly. |

**Foundation-model context:** the PS's own name and "satellite embeddings" language closely echoes Google DeepMind's **AlphaEarth Foundations** (a genuine satellite-embedding foundation model, 64-D per-pixel embeddings from multi-sensor Earth observation, released via Earth Engine/GCS) — almost certainly the conceptual inspiration, though AlphaEarth itself is land/optical remote sensing, not ocean-subsurface. Citing it as inspiration is fair; claiming to use it directly would be inaccurate (it's not an ocean-subsurface model).

**Patents:** a targeted search for "patent subsurface ocean temperature reconstruction satellite machine learning" returned academic papers only, no patent filings. **Unverified/not found** — no known patent blocks this approach as of this research pass.

## 3. Existing hackathon attempts — competitive saturation (important)

A GitHub search in late September 2026 found **at least ten independently named public repositories** already built specifically for SIH26066/OceanEmbed:

- `Ocean-Embed-MoES/OceanEmbed-poc` — most advanced found: CBAM U-Net (858K params, 0.5°, 8 channels, 3-day window), trained on real GLORYS12V1/OSTIA/DUACS/SMOS/OSCAR/CCMP, validated against ARMOR3D (r=0.95) and INCOIS gridded-Argo, self-reports 0.57 °C surface RMSE, roadmap to scale to 0.25°/12–15M params.
- `sayan21m/nio-satdepth` — Vision Transformer approach, CMEMS pipeline, 2015–2024 daily, in-progress RMSE leaderboard demo.
- `FarhanAaqil/AquaSphere` — encoder–decoder MLP baseline (SST → 16-D embedding → 15-depth profile), validated against real Argo, phased roadmap to add SSS/SLA/currents/winds.
- `jyoti-codessss/OceanEmbed-MVP`, `Murthy6440/OceanEmbed_SIH26066`, `aaronpinto449-source/OceanEmbed`, `vennavellisaisohan/Ocean_Embed_SIH`, `mohammadmansurpolikimulla-eng/OceanEmbed-SIH26066`, `sakshipriya21-rgb/OceanEmbed` — earlier-stage attempts of varying completeness.
- `Abdulbasith0512/OceanEmbed-Y` — explicitly frontend-only, "no backend, authentication, or trained model."

**Implication for us:** this is a well-attempted, well-specified PS (data is genuinely obtainable, unlike many SIH problem statements), so assume other finalists will have a working end-to-end PoC with quantified validation. We differentiate on:

1. Actually closing the loop to the PS's literal 0.25°/daily target, not staying at a coarser proxy resolution "for speed."
2. **Genuinely independent** Argo validation — GLORYS assimilates many of the same floats we'd otherwise validate against, so we hold out entire years/floats and state that caveat explicitly rather than quietly reusing assimilated data.
3. A clean, honest multi-architecture comparison (gradient-boosting baseline vs. CNN vs. attention/ViT variant) with per-depth RMSE reported for all of them — not just one model's cherry-picked number.
4. Turning the raw reconstruction into INCOIS's own operational products (TCHP, MLD, D20/D26) — most of the above repos stop at "here is a temperature grid," not "here is what an analyst does with it."
5. A calibrated uncertainty estimate accompanying every prediction — none of the repos found report this.

## 4. Gap this project addresses

**Underserved:** honest, independent-validation-driven comparison of a simple baseline vs. deep model, wrapped in a decision-support interface producing INCOIS-relevant derived quantities with uncertainty — rather than a bare "temperature grid + demo" that stops at the modeling step.
