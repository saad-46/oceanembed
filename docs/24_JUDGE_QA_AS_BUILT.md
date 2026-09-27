# 24 · Judge Q&A — answers for the system as actually built

Companion to `20_JUDGE_QA.md`. That file was written before the build; this one replaces its
placeholders with what was measured and corrects answers the build changed. Every number is copied
from `docs/RESULTS.md` (generated from `ml/data/outputs/metrics_*.json`). **If you retrain, regenerate
RESULTS.md and re-check these numbers before presenting.**

## The three flagged questions

**#7 — "Isn't your independent validation contaminated, since the reanalysis assimilates Argo?"**
Yes, partly, and we say so on every validation surface. Mitigations actually implemented:
1. Whole-year hold-out: the 2023 floats (2,639 profiles) were never seen in training, normalisation,
   climatology or early stopping (2022 was used for early stopping only).
2. We report the training-target product's *own* error against the same floats (HYCOM: 0.79 °C mean over
   depths in 2023) as the ceiling — our U-Net is at 0.89 °C, climatology at 1.10 °C.
3. A second, target-independent reference: the Met Office **EN4** objective analysis (no model dynamics, no
   altimetry). All models beat climatology against EN4 too (2023: LightGBM 0.72, U-Net 0.75,
   climatology 0.82 °C mean over 5–1000 m).
The spec suggested ARMOR3D as well; it needs a Copernicus account we did not have during the build (adapter
path exists; see `docs/DECISIONS.md` D-002).

**#17 — "How is this different from the other OceanEmbed repos?"**
- Independent Argo validation per depth with the caveat stated, *plus* the target's own ceiling and an
  EN4 cross-check — not a single "accuracy" number.
- **Calibrated uncertainty against the real ocean:** raw model σ covered only 41 % of 2023 Argo values
  within ±1σ; after a per-depth calibration fitted on 2022 floats it covers **70 %** (ideal 68 %) and 94 %
  within ±2σ (ideal 95 %). The API serves the calibrated σ.
- INCOIS decision products (TCHP, MLD, D20, D26) for every day, a Cyclone Fuel Gauge on real IBTrACS tracks,
  an offline-capable app, and an honest ablation (below) — reported even when it didn't flatter us.

**#18 — "What's actually novel?"**
Modest, and we say so: CNN/U-Net reconstruction is established. Our contribution is evaluation rigour
(held-out years, target ceiling, EN4, calibrated uncertainty) and product framing, not a new architecture.

## Answers the build changed

| # | Question | As-built answer |
|---|---|---|
| 2 | Why CNN/U-Net, not a transformer? | We ran the comparison that matters at this data size: climatology vs per-pixel LightGBM vs U-Net. Against 2023 Argo: U-Net 0.89, LightGBM 0.91, climatology 1.10 °C. **On 2022 LightGBM was slightly better (0.86 vs 0.89)** — the two are close; the U-Net's advantage is modest and year-dependent. A ViT was not attempted (docs/10: stretch goal). |
| 3 | Why GLORYS as target? | The PS names GLORYS; it needs a Copernicus account, which the build environment lacked. We used **HYCOM GOFS 3.1**, the same class of product (1/12°, data-assimilative, assimilates Argo). The GLORYS adapter is implemented; add credentials and re-run to switch. |
| 5 | Isn't ARMOR3D doing this already? | Yes — it's the right comparison, and it's credential-gated like GLORYS; not run in this build. Our baselines are climatology and LightGBM, and we show the HYCOM target's own skill as a reference. |
| 6 | Actual accuracy? | Per depth, 2023 independent Argo (U-Net, °C): surface 0.61, 50 m 1.28, 100 m 1.31, 200 m 0.91, 500 m 0.47, 1000 m 0.28; skill vs climatology at 100 m 0.47. Largest errors are in the thermocline (20–150 m), as in the literature. |
| 8 | Did it learn physics? | Two pieces of evidence: (a) LightGBM importances put **sea-level anomaly** first at 100 m (the thermocline-depth signal) and SST first at the surface; (b) the embedding separates the monsoon seasons. **The salinity ablation did *not* show a Bay-of-Bengal effect** (U-Net without SSS: 0.533 vs 0.534 °C RMSE vs the target grid in BoB, 2023). We report that honestly: the open daily SSS may be too noisy, or other channels carry the same information. We do not claim the barrier-layer demonstration. |
| 12 | Paid/restricted data? | None. Everything used is open without registration (NOAA ERDDAP, HYCOM, Argo, IBTrACS, EN4). The spec's Copernicus/ERA5 sources are free with registration. |
| 15 | Deployed? | Runs locally end-to-end (docker compose or dev servers). Hosting on Vercel/Render/Supabase needs the team's accounts — see `docs/18_DEPLOYMENT.md` addendum. State the live URL only once it exists. |
| 19 | Limitations? | 5-year study period (open target starts Dec 2018; satellite SSS era); targets sampled every 3rd day (360 training days); HYCOM 12Z snapshot vs daily means; uncertainty needed post-hoc calibration; thermocline errors ~1.3 °C; no ViT/GNN; not operational. |
| 20 | Next? | Credentials → GLORYS/Copernicus inputs and ARMOR3D baseline; denser target sampling and longer record; a U-Net+LightGBM ensemble (post-hoc on 2023 it gave 0.875 °C, but on 2022 it only tied LightGBM, so it was not adopted to avoid test-set selection); INCOIS LAS integration. |

## Numbers you may quote (all from docs/RESULTS.md)
- Held-out 2023: 2,639 independent Argo profiles; U-Net mean RMSE over 15 depths 0.89 °C (climatology 1.10).
- At 100 m: U-Net 1.31 °C vs climatology 1.80 °C.
- Calibrated uncertainty coverage: 70 % (±1σ), 94 % (±2σ).

## Numbers you must not quote
Anything not in RESULTS.md — no "state-of-the-art", no single global "accuracy %", no claim that the salinity
ablation proves barrier-layer physics.
