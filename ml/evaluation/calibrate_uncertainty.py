"""Post-hoc calibration of the U-Net uncertainty against the real ocean (Argo).

    python -m ml.evaluation.calibrate_uncertainty

The U-Net's variance head learns its error *relative to the training target* (HYCOM). Against
real Argo floats the error also contains the target product's own error, so the raw sigma is
over-confident. Per standard depth k we add a variance term a_k so that the calibrated interval

    sigma_cal = sqrt(sigma_model^2 + a_k^2)

covers 68.3 % of *validation-year (2022)* Argo errors. The *test year (2023)* is then used only to
report whether the calibration generalises (before/after coverage). Nothing about the mean
prediction changes. The API serves sigma_cal when `uncertainty_calibration.json` exists.
"""
from __future__ import annotations

import json
import logging

import numpy as np
import pandas as pd

from ml.config import OUTPUT_DIR, PROCESSED_DIR, STANDARD_DEPTHS

log = logging.getLogger("oceanembed.calibration")
TARGET_COVERAGE = 0.683


def _coverage(e, s, a, k=1.0):
    return float(np.mean(np.abs(e) <= k * np.sqrt(s**2 + a**2)))


def _solve(e, s):
    if _coverage(e, s, 0.0) >= TARGET_COVERAGE:
        return 0.0
    lo, hi = 0.0, 10.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if _coverage(e, s, mid) < TARGET_COVERAGE else (lo, mid)
    return hi


def calibrate(model: str = "cnn-unet-v1") -> dict:
    preds = pd.read_parquet(OUTPUT_DIR / "argo_predictions.parquet")
    preds = preds[preds["model"] == model]
    prof = pd.read_parquet(PROCESSED_DIR / "argo_profiles.parquet", columns=["platform_number", "cycle_number", "split", "temp_std"])
    df = preds.merge(prof, on=["platform_number", "cycle_number"])
    P = np.stack(df["pred"].to_numpy()).astype(float)
    S = np.stack(df["sigma"].to_numpy()).astype(float)
    O = np.stack(df["temp_std"].to_numpy()).astype(float)
    split = df["split"].to_numpy()
    out = {"model": model, "method": "sigma_cal = sqrt(sigma_model^2 + a_k^2), a_k fitted for 68.3% coverage on 2022 Argo",
           "fit_split": "val", "check_split": "test", "per_depth": []}
    for k, z in enumerate(STANDARD_DEPTHS):
        row = {"depth_m": float(z)}
        ok = np.isfinite(P[:, k]) & np.isfinite(O[:, k]) & np.isfinite(S[:, k])
        v, t = ok & (split == "val"), ok & (split == "test")
        e_v, s_v, e_t, s_t = (P[v, k] - O[v, k]), S[v, k], (P[t, k] - O[t, k]), S[t, k]
        a = _solve(e_v, s_v) if v.sum() > 20 else 0.0
        row.update(a_c=round(a, 4), n_val=int(v.sum()), n_test=int(t.sum()),
                   val_cov1_raw=_coverage(e_v, s_v, 0), val_cov1_cal=_coverage(e_v, s_v, a),
                   test_cov1_raw=_coverage(e_t, s_t, 0), test_cov1_cal=_coverage(e_t, s_t, a),
                   test_cov2_raw=_coverage(e_t, s_t, 0, 2), test_cov2_cal=_coverage(e_t, s_t, a, 2))
        out["per_depth"].append(row)
    tot = lambda key: float(np.average([r[key] for r in out["per_depth"]], weights=[r["n_test"] for r in out["per_depth"]]))
    out["test_overall"] = {"cov1_raw": tot("test_cov1_raw"), "cov1_cal": tot("test_cov1_cal"),
                           "cov2_raw": tot("test_cov2_raw"), "cov2_cal": tot("test_cov2_cal"), "ideal": [0.683, 0.954]}
    (OUTPUT_DIR / "uncertainty_calibration.json").write_text(json.dumps(out, indent=2))
    return out


def main():
    logging.basicConfig(level=logging.INFO)
    r = calibrate()
    print(json.dumps(r["test_overall"], indent=1))
    print([round(x["a_c"], 2) for x in r["per_depth"]])


if __name__ == "__main__":
    main()
