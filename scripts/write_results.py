"""Generate docs/RESULTS.md from the computed metrics (never hand-typed numbers, docs/21 section 4).

    python scripts/write_results.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ml.config import OUTPUT_DIR, PROCESSED_DIR  # noqa: E402

NAMES = {"cnn-unet-v1": "U-Net (GAHAN)", "cnn-unet-nosss-v1": "U-Net without SSS", "baseline-lightgbm-v1": "LightGBM",
         "climatology": "Climatology", "target-product": "HYCOM target product"}


def f(v, d=2):
    return "—" if v is None or (isinstance(v, float) and not np.isfinite(v)) else f"{v:.{d}f}"


def mean(rows, key="rmse_c"):
    v = [r[key] for r in rows if r.get(key) is not None]
    return float(np.mean(v)) if v else None


def main():
    argo = json.loads((OUTPUT_DIR / "metrics_argo.json").read_text())
    grid = json.loads((OUTPUT_DIR / "metrics_grid.json").read_text())
    summ = json.loads((PROCESSED_DIR / "assemble_summary.json").read_text())
    reg = {r["name"]: r for r in json.loads((OUTPUT_DIR / "model_registry.json").read_text())}
    L = [f"# Results (generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC by `scripts/write_results.py`)", "",
         "All numbers below are read from `ml/data/outputs/metrics_argo.json` and `metrics_grid.json`, produced by",
         "`python -m ml.models.train evaluate` and `python -m ml.evaluation.argo_validation`. Re-run the script after retraining.", "",
         f"- Target product: {summ.get('target_source')} · target days {summ['target_days']} ({summ['split_counts']})",
         f"- Ocean cells: {summ['ocean_cells_surface']} at the surface, {summ['ocean_cells_1000m']} at 1000 m", ""]
    for n in ("cnn-unet-v1", "cnn-unet-nosss-v1"):
        if n in reg:
            L.append(f"- `{n}`: {reg[n].get('params', '?'):,} parameters, best validation-year RMSE "
                     f"{f(reg[n].get('best_val_rmse_c'), 3)} °C (mean over depths) after {reg[n].get('epochs')} epochs")
    L += ["", "## 1. Independent Argo validation", "", f"> {argo['caveat']}", ""]
    for split in ("test", "val"):
        sp = argo["splits"].get(split)
        if not sp:
            continue
        models = [m for m in ("cnn-unet-v1", "baseline-lightgbm-v1", "climatology", "cnn-unet-nosss-v1", "target-product") if m in sp["models"]]
        L += [f"### {split.upper()} ({sp['period']}, {sp['n_profiles']} profiles)", "",
              "| Depth (m) | " + " | ".join(f"{NAMES[m]} RMSE" for m in models) + " | U-Net bias | U-Net r | U-Net skill vs clim. | n |",
              "|---|" + "---|" * (len(models) + 4)]
        rows = {m: {r["depth_m"]: r for r in sp["models"][m]["per_depth"]} for m in models}
        for z in sorted(rows["cnn-unet-v1"]):
            u = rows["cnn-unet-v1"][z]
            L.append(f"| {z:.0f} | " + " | ".join(f(rows[m].get(z, {}).get("rmse_c")) for m in models)
                     + f" | {f(u.get('bias_c'))} | {f(u.get('corr'))} | {f(u.get('skill_vs_climatology'))} | {u['n_obs']} |")
        L.append("| **mean** | " + " | ".join(f"**{f(mean(sp['models'][m]['per_depth']))}**" for m in models) + " | | | | |")
        u = sp["models"]["cnn-unet-v1"]
        if u.get("frac_within_1sigma") is not None:
            L.append(f"\nUncertainty calibration: {100 * u['frac_within_1sigma']:.0f}% of Argo values within ±1σ (Gaussian ideal 68%), "
                     f"{100 * u['frac_within_2sigma']:.0f}% within ±2σ (ideal 95%).")
        L.append("")
    L += ["## 2. Architecture comparison vs. the gridded target (all ocean cells, held-out target days)", "",
          "| Model | Val 2022 mean RMSE | Test 2023 mean RMSE | Test 2023 Bay of Bengal | Test 2023 RMSE @100 m |", "|---|---|---|---|---|"]
    for m, res in grid["splits"]["test"]["models"].items():
        at100 = next((r.get("rmse_c") for r in res["per_depth"] if r["depth_m"] == 100.0), None)
        L.append(f"| {NAMES.get(m, m)} | {f(mean(grid['splits']['val']['models'][m]['per_depth']), 3)} | "
                 f"{f(mean(res['per_depth']), 3)} | {f(mean(res['bay_of_bengal_per_depth']), 3)} | {f(at100, 3)} |")
    cal = grid.get("uncertainty_calibration", {}).get("test")
    if cal:
        L.append(f"\nGrid uncertainty calibration (test): {100 * cal['frac_within_1sigma']:.0f}% within ±1σ, {100 * cal['frac_within_2sigma']:.0f}% within ±2σ.")
    en4p = OUTPUT_DIR / "metrics_en4.json"
    if en4p.exists():
        en4 = json.loads(en4p.read_text())
        L += ["", "## 3. Cross-check vs. Met Office EN4 (monthly 1°, 5–1000 m)", "", f"> {en4['note']}", "",
              "| Model | Val 2022 mean RMSE | Test 2023 mean RMSE | Test 2023 mean bias |", "|---|---|---|---|"]
        for m, res in en4["splits"].get("test", {}).get("models", {}).items():
            L.append(f"| {NAMES.get(m, m)} | {f(mean(en4['splits'].get('val', {}).get('models', {}).get(m, {}).get('per_depth', [])), 3)} | "
                     f"{f(mean(res['per_depth']), 3)} | {f(mean(res['per_depth'], 'bias_c'), 3)} |")
    calp = OUTPUT_DIR / "uncertainty_calibration.json"
    if calp.exists():
        c = json.loads(calp.read_text())
        o = c["test_overall"]
        L += ["", "## 4. Uncertainty calibration against the real ocean", "", f"Method: {c['method']}; checked on the 2023 test floats.", "",
              "| | within ±1σ | within ±2σ |", "|---|---|---|",
              f"| Raw model σ (2023 Argo) | {100 * o['cov1_raw']:.0f}% | {100 * o['cov2_raw']:.0f}% |",
              f"| Calibrated σ (2023 Argo) | {100 * o['cov1_cal']:.0f}% | {100 * o['cov2_cal']:.0f}% |",
              "| Gaussian ideal | 68% | 95% |", "",
              "Per-depth a_k (°C): " + ", ".join(f"{r['depth_m']:.0f} m {r['a_c']:.2f}" for r in c["per_depth"]) + ".",
              "The API serves the calibrated σ."]
    L += ["", "## 5. Reading these numbers honestly", "",
          "- Grid metrics measure agreement with the training-target product (HYCOM), not with the real ocean; Argo metrics measure the real ocean.",
          "- The target product's own Argo RMSE (where shown) is the practical ceiling for any model trained on it.",
          "- The study period is 5 years with 360 training target days; results are a proof of concept, not a literature benchmark.", ""]
    (ROOT / "docs" / "RESULTS.md").write_text("\n".join(L), encoding="utf-8")
    print(f"wrote docs/RESULTS.md ({len(L)} lines)")


if __name__ == "__main__":
    main()
