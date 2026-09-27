# 10 · Machine Learning & AI Strategy

## 1. Approach comparison

| Approach | Input | Output | Advantages | Disadvantages | Dataset requirement | MVP feasibility |
|---|---|---|---|---|---|---|
| Per-pixel gradient boosting (LightGBM/XGBoost), one model per depth or multi-output | 7 surface channels + lat/lon/day-of-year | 15 depth temperatures | Fast to train (minutes), interpretable (feature importance), prior art shows it can **beat** deep nets at depth | No spatial context (treats each pixel independently), can't exploit neighbouring-cell patterns (eddies) | Small — works even with a few thousand samples | ✅ **Chosen as mandatory baseline** |
| EOF/PCA regression (regress a few principal components of the vertical profile from surface features) | Surface channels | PCA coefficients → inverted to profile | Simple, physically motivated (this is what ARMOR3D does), fast, enforces smooth plausible profiles | Not novel (20-year-old method); reviewers have rejected "just EOF" as insufficiently new | Small | Optional sanity-check, not the headline model |
| CNN / U-Net encoder-decoder (spatial image-to-image) | 2D stack of 7 surface channels over the grid | 2D stack of 15 depth-temperature maps | Captures spatial structure (eddies, fronts); matches PS's named architecture list; moderate compute; what the most advanced known prior-art repo (`OceanEmbed-poc`) uses | More engineering than tree models; needs care with a modest ~10–15 year daily sample count | Moderate (thousands of daily grids) | ✅ **Chosen as primary DL model** |
| Vision Transformer / attention-hybrid | Same as CNN | Same as CNN | Directly matches the PS's literal wording; scores well on "did you attempt the ask" | Higher risk of not converging on this data volume in hackathon time; several prior-art teams are attempting this and reporting it as still in-progress | Larger ideally | Attempt only as a **stretch variant** once CNN baseline works |
| Autoencoder (unsupervised pretraining on surface fields, then fine-tune to depth) | Surface channels | Latent embedding → profile | Directly produces "the embedding" the PS names; can pretrain on more data (doesn't need paired subsurface truth for the encoder stage) | Two-stage training adds complexity | Moderate | Optional enhancement to the CNN, not a separate track |
| Graph Neural Network (grid-as-graph or Argo-float graph) | Graph-structured surface state | 15 depth temperatures | Matches PS's named list; theoretically elegant | Prior art (STGAT paper) needed a dedicated multi-month research effort to reach ~0.9°C RMSE in a *different* region — **highest engineering risk for the lowest expected marginal gain** in hackathon time | Large, plus graph construction overhead | ❌ Not attempted for MVP; mention as future work only |

**Chosen strategy: LightGBM baseline (mandatory) + CNN/U-Net encoder-decoder (primary) reported side-by-side, honestly.** This directly answers the PS's implicit "why this architecture" question with evidence (§`20_JUDGE_QA.md`) rather than picking the most fashionable option. A ViT variant is an optional stretch goal, attempted only after both of the above work end-to-end and validate cleanly.

## 2. Problem framing

- **Target variable:** temperature (°C) at 15 standard depths (0–1000 m), per 0.25° grid cell, per day, over 5–30°N, 45–105°E.
- **Features:** SST, SSS, SLA, U/V surface current, U/V surface wind (7 channels) + lat, lon (or sin/cos), day-of-year (sin/cos for seasonality).
- **Labels:** GLORYS12V1 temperature, coarsened from 1/12° to 0.25° (primary training target, per the PS).
- **Training data:** daily snapshots from the satellite-SSS era onward (~2011–2022, capped by the SSS record — see `04_DATASETS_AND_APIS.md`).
- **Validation strategy:** hold out **entire years** (e.g., train 2011–2021, validate on 2022) so the model is tested on years it never saw, not just random held-out days within the same years (random splits leak strong autocorrelation and overstate skill).
- **Test strategy:** hold out **2023 Argo float profiles never used in training or in generating the GLORYS target's assimilation**, and compute skill directly against those real, independent point measurements — this is the PS's own explicitly required evaluation method.
- **Evaluation metrics:** RMSE, bias, and correlation (r) **per depth level**, not one global number (every credible paper reviewed reports this broken out by depth); plus a **skill score relative to climatology** (a model that barely beats "just use the seasonal average at this location" hasn't demonstrated real value).
- **Baseline model:** climatology (seasonal mean at each grid cell/depth) **and** LightGBM — both must be beaten, and both numbers shown to judges.
- **Production model:** CNN/U-Net (or ViT variant if it converges and beats CNN).
- **Explainability:** LightGBM feature importances (cheap, already available) + CNN saliency/occlusion maps showing which input channel drives a given depth's prediction most — directly useful for answering "why did the model predict this" in the demo.

## 3. The critical leakage caveat — say this to judges before they ask

GLORYS is a reanalysis that itself **assimilates many real Argo floats**. If a "held-out" Argo profile was one of the floats GLORYS assimilated for that period, it isn't truly independent of the training target. **Mitigation used:** hold out an entire recent year (2022–2023) that is scored only against Argo profiles from that period, and explicitly state: *"these floats are independent of our model's training, but not fully independent of the reanalysis we learned from — we report comparisons against ARMOR3D and EN4 as additional cross-checks precisely because of this caveat."* This honesty is a strength in front of technically literate judges, not a weakness to hide.

## 4. Synthetic/demo data — used only for pipeline demonstration, never presented as measured

If a live network hiccup prevents pulling fresh data during the demo itself, the fallback is **cached real historical output**, not synthetic data (see `26`-equivalent in `16_SECURITY_AND_PRODUCTION.md`). Synthetic data is only used, if at all, for unit-testing the pipeline's plumbing (e.g., a fake 3×3 grid to test the regridding function runs without error) — and any such synthetic output shown anywhere in the UI must be labeled `SIMULATED DATA`, never presented as if it were a real reconstruction.

## 5. AI features beyond the core reconstruction model

| Feature | Why needed | Model/API | Input | Output | User benefit | If it fails | MVP without it? |
|---|---|---|---|---|---|---|---|
| Derived-product computation (TCHP/MLD/D20/D26) | Turns raw numbers into INCOIS's actual operational language | Deterministic formula, not ML | Reconstructed profile | Scalar decision-relevant metrics | Directly answers "so what" | Formula always succeeds if profile exists (no external dependency) | Yes, but it's core to the pitch — build it |
| Uncertainty estimate | Honest confidence, not a silent guess | Quantile regression head (part of the CNN) or ensemble spread | Same inputs as main model | Per-depth confidence interval | Judge trusts the system more; user knows when *not* to trust it | Falls back to a fixed heuristic band; UI shows "uncertainty unavailable" rather than fabricating a number | **Yes**, MVP works without it (Should-have, not Must-have) |
| NL region-summary assistant | Modern, accessible framing of already-computed numbers | One LLM call (e.g. a hosted API) templated over real computed values | Region/date + already-computed TCHP/MLD/profile stats | One or two plain-language sentences | Accessibility, demo polish | Falls back to a plain templated (non-LLM) sentence built from the same numbers — **never blocks core functionality** | **Yes**, fully — this is explicitly the lowest-priority AI feature |

No RAG, knowledge graph, or agentic AI is used anywhere in this system — none of them address a real gap in this specific PS, and adding them would violate Research Rule #6 ("do not add AI just because it sounds impressive").
