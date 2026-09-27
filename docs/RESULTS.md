# Results (generated 2026-09-27 11:08 UTC by `scripts/write_results.py`)

All numbers below are read from `ml/data/outputs/metrics_argo.json` and `metrics_grid.json`, produced by
`python -m ml.models.train evaluate` and `python -m ml.evaluation.argo_validation`. Re-run the script after retraining.

- Target product: HYCOM GOFS 3.1 analysis (GLBy0.08/expt_93.0), 12Z snapshot · target days 637 ({'train': 360, 'test': 160, 'val': 117})
- Ocean cells: 11805 at the surface, 9112 at 1000 m

- `cnn-unet-v1`: 1,088,190 parameters, best validation-year RMSE 0.468 °C (mean over depths) after 35 epochs
- `cnn-unet-nosss-v1`: 1,088,190 parameters, best validation-year RMSE 0.473 °C (mean over depths) after 25 epochs

## 1. Independent Argo validation

> Argo floats from the held-out years are independent of the model's training, but the training target (an ocean reanalysis/analysis) assimilates Argo, so they are not fully independent of the product the model learned from. See docs/10 section 3 and docs/21.

### TEST (2023-01-01..2023-12-31, 2639 profiles)

| Depth (m) | U-Net (GAHAN) RMSE | LightGBM RMSE | Climatology RMSE | U-Net without SSS RMSE | HYCOM target product RMSE | U-Net bias | U-Net r | U-Net skill vs clim. | n |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.61 | 0.75 | 0.81 | 0.59 | 0.54 | -0.14 | 0.96 | 0.45 | 2516 |
| 5 | 0.66 | 0.75 | 0.88 | 0.66 | 0.53 | -0.33 | 0.96 | 0.44 | 2543 |
| 10 | 0.77 | 0.86 | 0.99 | 0.79 | 0.67 | -0.36 | 0.94 | 0.38 | 2542 |
| 20 | 1.06 | 1.08 | 1.23 | 1.08 | 0.91 | -0.33 | 0.89 | 0.26 | 2372 |
| 30 | 1.26 | 1.27 | 1.42 | 1.30 | 1.08 | -0.23 | 0.85 | 0.21 | 2390 |
| 50 | 1.28 | 1.29 | 1.48 | 1.30 | 1.14 | -0.08 | 0.86 | 0.25 | 2612 |
| 75 | 1.29 | 1.26 | 1.68 | 1.31 | 1.19 | -0.05 | 0.87 | 0.41 | 2614 |
| 100 | 1.31 | 1.29 | 1.80 | 1.35 | 1.26 | -0.06 | 0.85 | 0.47 | 2615 |
| 125 | 1.19 | 1.20 | 1.66 | 1.26 | 1.14 | -0.22 | 0.86 | 0.49 | 2618 |
| 150 | 1.06 | 1.10 | 1.43 | 1.14 | 0.99 | -0.31 | 0.90 | 0.45 | 2619 |
| 200 | 0.91 | 0.94 | 1.08 | 0.96 | 0.74 | -0.39 | 0.94 | 0.29 | 2604 |
| 300 | 0.75 | 0.73 | 0.81 | 0.77 | 0.63 | -0.25 | 0.93 | 0.15 | 2596 |
| 500 | 0.47 | 0.48 | 0.51 | 0.49 | 0.37 | -0.18 | 0.96 | 0.16 | 2509 |
| 700 | 0.42 | 0.41 | 0.43 | 0.43 | 0.35 | -0.12 | 0.97 | 0.09 | 2475 |
| 1000 | 0.28 | 0.27 | 0.28 | 0.28 | 0.25 | 0.01 | 0.97 | 0.01 | 1586 |
| **mean** | **0.89** | **0.91** | **1.10** | **0.91** | **0.79** | | | | |

Uncertainty calibration: 41% of Argo values within ±1σ (Gaussian ideal 68%), 71% within ±2σ (ideal 95%).

### VAL (2022-01-01..2022-12-31, 2602 profiles)

| Depth (m) | U-Net (GAHAN) RMSE | LightGBM RMSE | Climatology RMSE | U-Net without SSS RMSE | HYCOM target product RMSE | U-Net bias | U-Net r | U-Net skill vs clim. | n |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.56 | 0.47 | 0.75 | 0.53 | 0.53 | -0.12 | 0.96 | 0.44 | 2395 |
| 5 | 0.63 | 0.53 | 0.81 | 0.58 | 0.53 | -0.29 | 0.96 | 0.39 | 2480 |
| 10 | 0.83 | 0.72 | 0.97 | 0.79 | 0.72 | -0.35 | 0.92 | 0.26 | 2482 |
| 20 | 1.27 | 1.20 | 1.35 | 1.24 | 1.08 | -0.33 | 0.82 | 0.11 | 2412 |
| 30 | 1.26 | 1.20 | 1.37 | 1.25 | 0.99 | -0.14 | 0.84 | 0.16 | 2430 |
| 50 | 1.08 | 1.02 | 1.21 | 1.07 | 0.93 | 0.02 | 0.89 | 0.20 | 2576 |
| 75 | 1.18 | 1.16 | 1.43 | 1.18 | 1.07 | -0.17 | 0.87 | 0.32 | 2581 |
| 100 | 1.24 | 1.24 | 1.59 | 1.24 | 1.10 | -0.39 | 0.84 | 0.39 | 2580 |
| 125 | 1.21 | 1.22 | 1.58 | 1.22 | 0.99 | -0.55 | 0.85 | 0.42 | 2555 |
| 150 | 1.16 | 1.19 | 1.47 | 1.19 | 0.91 | -0.62 | 0.89 | 0.38 | 2553 |
| 200 | 1.12 | 1.14 | 1.27 | 1.14 | 0.83 | -0.66 | 0.94 | 0.23 | 2538 |
| 300 | 0.86 | 0.80 | 0.98 | 0.88 | 0.61 | -0.34 | 0.94 | 0.23 | 2508 |
| 500 | 0.42 | 0.41 | 0.49 | 0.44 | 0.33 | -0.22 | 0.97 | 0.26 | 2451 |
| 700 | 0.36 | 0.34 | 0.41 | 0.37 | 0.27 | -0.14 | 0.97 | 0.23 | 2411 |
| 1000 | 0.24 | 0.22 | 0.25 | 0.24 | 0.21 | -0.04 | 0.98 | 0.10 | 1597 |
| **mean** | **0.89** | **0.86** | **1.06** | **0.89** | **0.74** | | | | |

Uncertainty calibration: 39% of Argo values within ±1σ (Gaussian ideal 68%), 68% within ±2σ (ideal 95%).

## 2. Architecture comparison vs. the gridded target (all ocean cells, held-out target days)

| Model | Val 2022 mean RMSE | Test 2023 mean RMSE | Test 2023 Bay of Bengal | Test 2023 RMSE @100 m |
|---|---|---|---|---|
| Climatology | 0.681 | 0.745 | 0.737 | 1.466 |
| LightGBM | 0.450 | 0.599 | 0.567 | 1.108 |
| U-Net (GAHAN) | 0.468 | 0.572 | 0.534 | 1.137 |
| U-Net without SSS | 0.473 | 0.570 | 0.533 | 1.125 |

Grid uncertainty calibration (test): 58% within ±1σ, 87% within ±2σ.

## 3. Cross-check vs. Met Office EN4 (monthly 1°, 5–1000 m)

> Independent of the HYCOM training target; not independent of Argo; large-scale (1 deg, monthly) check.

| Model | Val 2022 mean RMSE | Test 2023 mean RMSE | Test 2023 mean bias |
|---|---|---|---|
| Climatology | 0.777 | 0.819 | -0.111 |
| LightGBM | 0.725 | 0.720 | -0.117 |
| U-Net without SSS | 0.743 | 0.748 | -0.097 |
| U-Net (GAHAN) | 0.736 | 0.752 | -0.102 |
| HYCOM target product | 0.754 | 0.859 | -0.193 |

## 4. Uncertainty calibration against the real ocean

Method: sigma_cal = sqrt(sigma_model^2 + a_k^2), a_k fitted for 68.3% coverage on 2022 Argo; checked on the 2023 test floats.

| | within ±1σ | within ±2σ |
|---|---|---|
| Raw model σ (2023 Argo) | 41% | 71% |
| Calibrated σ (2023 Argo) | 70% | 94% |
| Gaussian ideal | 68% | 95% |

Per-depth a_k (°C): 0 m 0.29, 5 m 0.41, 10 m 0.53, 20 m 0.72, 30 m 0.80, 50 m 0.70, 75 m 0.98, 100 m 1.08, 125 m 1.06, 150 m 1.02, 200 m 1.00, 300 m 0.52, 500 m 0.27, 700 m 0.23, 1000 m 0.15.
The API serves the calibrated σ.

## 5. Reading these numbers honestly

- Grid metrics measure agreement with the training-target product (HYCOM), not with the real ocean; Argo metrics measure the real ocean.
- The target product's own Argo RMSE (where shown) is the practical ceiling for any model trained on it.
- The study period is 5 years with 360 training target days; results are a proof of concept, not a literature benchmark.
