"""Compare the OceanSight stride-1 target-density experiment with the production artifacts.

    python scripts/compare_stride1_experiment.py \
        --production-dir ml/data --experiment-dir ml/data/experiments/stride1

READ-ONLY with respect to both artifact sets: nothing under --production-dir or --experiment-dir's
data folders is modified. The only files written are the two reports, into --out-dir
(default: the experiment directory):

    stride1_vs_production.md        the full side-by-side comparison
    PROMOTION_RECOMMENDATION.md     evidence summary; it never promotes anything

Why the day sets matter
-----------------------
Production evaluates on target days sampled every 3rd day (+ daily May-June 2023); the stride-1
experiment evaluates on every day. Grid metrics from the two runs are therefore computed on
DIFFERENT day sets and are never subtracted from each other. Every grid table is labelled:

    A  production test/validation-day set   (from production metrics_grid.json)
    B  stride-1 test/validation-day set     (from experiment metrics_grid.json)
    C  common overlapping days              (recomputed here from the saved predictions, against the
                                             same HYCOM target, on the intersection of both day sets
                                             and of both ocean masks)

Argo and EN4 evaluations use the same observations in both runs (they do not depend on which target
days exist), so they are paired comparisons; the script verifies that and says so.

Decision discipline (docs/DECISIONS.md D-012): the validation year 2022 is the primary evidence. The
2023 held-out year is CONFIRMATORY ONLY - it may veto a promotion but is never the reason for one.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
KEY_DEPTHS = [0, 100, 200, 500, 1000]
GROUPS = {
    "surface (0 m)": [0],
    "upper ocean (5-50 m)": [5, 10, 20, 30, 50],
    "thermocline (75-200 m)": [75, 100, 125, 150, 200],
    "deep (300-1000 m)": [300, 500, 700, 1000],
}
PRIMARY = "cnn-unet-v1"
MODELS = ["cnn-unet-v1", "baseline-lightgbm-v1", "cnn-unet-nosss-v1"]
PRED_MODELS = MODELS  # models with a saved daily prediction store
TOL_C = 0.02          # a change smaller than this (deg C) is "similar" regardless of the confidence interval
IDEAL_1S, IDEAL_2S = 0.683, 0.954
TOL_COV = 0.02
N_BOOT = 1000
SPLIT_YEARS = {"val": 2022, "test": 2023}
SPLIT_LABEL = {"val": "2022 (validation, primary evidence)", "test": "2023 (held-out test, confirmatory only)"}


# ----------------------------------------------------------------------------- small helpers
def load_json(path: Path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None


def f3(x, nd=3):
    return "n/a" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:.{nd}f}"


def sd(x, nd=3):
    return "n/a" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"{x:+.{nd}f}"


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return out


def classify(delta, lo=None, hi=None, tol=TOL_C):
    """Lower-is-better metric, delta = experiment - production."""
    if delta is None or not np.isfinite(delta):
        return "unavailable"
    if lo is not None and hi is not None and np.isfinite(lo) and np.isfinite(hi):
        if hi < 0 and delta <= -tol:
            return "improved"
        if lo > 0 and delta >= tol:
            return "worsened"
        return "similar"
    if delta <= -tol:
        return "improved"
    if delta >= tol:
        return "worsened"
    return "similar"


def mean_key(rows, key):
    v = [r.get(key) for r in rows if r.get(key) is not None and np.isfinite(r.get(key))]
    return float(np.mean(v)) if v else None


def by_depth(rows):
    return {int(r["depth_m"]): r for r in rows}


# ----------------------------------------------------------------------------- common-day grid metrics (C)
def common_day_metrics(prod: Path, exp: Path):
    import xarray as xr

    def op(p):
        return xr.open_zarr(p, chunks=None)

    tp, te = op(prod / "processed" / "target.zarr")["temp"], op(exp / "processed" / "target.zarr")["temp"]
    mp = op(prod / "processed" / "static.zarr")["ocean_mask3d"].values
    me = op(exp / "processed" / "static.zarr")["ocean_mask3d"].values
    mask = mp & me
    common = pd.DatetimeIndex(tp.time.values).intersection(pd.DatetimeIndex(te.time.values))
    stores = {}
    for m in PRED_MODELS:
        pp, pe = prod / "outputs" / "predictions" / f"{m}.zarr", exp / "outputs" / "predictions" / f"{m}.zarr"
        if pp.exists() and pe.exists():
            stores[m] = (op(pp)["temp"], op(pe)["temp"])
    res = {"mask_cells_prod": int(mp[0].sum()), "mask_cells_exp": int(me[0].sum()), "mask_cells_common": int(mask[0].sum()),
           "common_days_total": int(len(common)), "target_max_abs_diff": 0.0, "splits": {}}
    for split, year in SPLIT_YEARS.items():
        days = common[common.year == year]
        acc = {m: {s: {"se": np.zeros(len(DEPTHS)), "ae": np.zeros(len(DEPTHS)), "bi": np.zeros(len(DEPTHS)), "n": np.zeros(len(DEPTHS))}
                   for s in ("prod", "exp")} for m in stores}
        for c0 in range(0, len(days), 8):
            chunk = days[c0:c0 + 8]
            yt = te.sel(time=chunk).values
            yp = tp.sel(time=chunk).values
            fin = np.isfinite(yt) & np.isfinite(yp)
            if fin.any():
                res["target_max_abs_diff"] = max(res["target_max_abs_diff"], float(np.abs(yt - yp)[fin].max()))
            for m, (sp_, se_) in stores.items():
                pp_, pe_ = sp_.sel(time=chunk).values, se_.sel(time=chunk).values
                ok = mask[None] & np.isfinite(yt) & np.isfinite(pp_) & np.isfinite(pe_)
                for side, p in (("prod", pp_), ("exp", pe_)):
                    e = np.where(ok, p - yt, 0.0)
                    a = acc[m][side]
                    a["se"] += (e ** 2).sum(axis=(0, 2, 3)); a["ae"] += np.abs(e).sum(axis=(0, 2, 3))
                    a["bi"] += e.sum(axis=(0, 2, 3)); a["n"] += ok.sum(axis=(0, 2, 3))
        out = {"n_days": int(len(days)), "models": {}}
        for m in stores:
            out["models"][m] = {}
            for side in ("prod", "exp"):
                a = acc[m][side]
                n = np.maximum(a["n"], 1)
                out["models"][m][side] = [{"depth_m": d, "n_obs": int(a["n"][i]), "rmse_c": float(np.sqrt(a["se"][i] / n[i])),
                                            "mae_c": float(a["ae"][i] / n[i]), "bias_c": float(a["bi"][i] / n[i])}
                                           for i, d in enumerate(DEPTHS) if a["n"][i] > 0]
        res["splits"][split] = out
    return res


# ----------------------------------------------------------------------------- paired Argo comparison with cluster bootstrap
def argo_paired(prod: Path, exp: Path):
    def preds(root, model):
        df = pd.read_parquet(root / "outputs" / "argo_predictions.parquet", columns=["platform_number", "cycle_number", "model", "pred"])
        df = df[df["model"] == model].drop_duplicates(["platform_number", "cycle_number"])
        return df[["platform_number", "cycle_number", "pred"]]

    prof = pd.read_parquet(prod / "processed" / "argo_profiles.parquet", columns=["platform_number", "cycle_number", "split", "temp_std"])
    prof_e = pd.read_parquet(exp / "processed" / "argo_profiles.parquet", columns=["platform_number", "cycle_number", "split"])
    k1 = set(zip(prof.platform_number, prof.cycle_number, prof.split))
    k2 = set(zip(prof_e.platform_number, prof_e.cycle_number, prof_e.split))
    meta = {"profiles_identical": k1 == k2, "n_profiles_prod": len(k1), "n_profiles_exp": len(k2)}
    rng = np.random.default_rng(0)
    out = {"meta": meta, "models": {}}
    for model in MODELS:
        try:
            a, b = preds(prod, model), preds(exp, model)
        except (OSError, KeyError, ValueError):
            continue
        m = a.merge(b, on=["platform_number", "cycle_number"], suffixes=("_p", "_e")).merge(prof, on=["platform_number", "cycle_number"])
        if m.empty:
            continue
        Pp = np.stack(m["pred_p"].to_numpy()).astype(float)
        Pe = np.stack(m["pred_e"].to_numpy()).astype(float)
        O = np.stack(m["temp_std"].to_numpy()).astype(float)
        ok = np.isfinite(Pp) & np.isfinite(Pe) & np.isfinite(O)
        pl_codes, pl_idx = np.unique(m["platform_number"].astype(str).to_numpy(), return_inverse=True)
        res = {}
        for split in SPLIT_YEARS:
            sel = (m["split"].to_numpy() == split)
            if not sel.any():
                continue
            npl = len(pl_codes)
            agg = {k: np.zeros((npl, len(DEPTHS))) for k in ("sep", "see", "aep", "aee", "n")}
            for name, P in (("p", Pp), ("e", Pe)):
                err = np.where(ok, P - O, 0.0)
                np.add.at(agg["se" + name], pl_idx[sel], (err ** 2)[sel])
                np.add.at(agg["ae" + name], pl_idx[sel], np.abs(err)[sel])
            np.add.at(agg["n"], pl_idx[sel], ok[sel].astype(float))
            keep = agg["n"].sum(1) > 0
            agg = {k: v[keep] for k, v in agg.items()}
            npl = int(keep.sum())

            def rmse(idx, which):
                return np.sqrt(agg["se" + which][idx].sum(0) / np.maximum(agg["n"][idx].sum(0), 1))

            full = np.arange(npl)
            rp, re_ = rmse(full, "p"), rmse(full, "e")
            boots = np.empty((N_BOOT, len(DEPTHS)))
            for i in range(N_BOOT):
                idx = rng.integers(0, npl, npl)
                boots[i] = rmse(idx, "e") - rmse(idx, "p")
            bm = boots.mean(1)
            gidx = {g: [DEPTHS.index(d) for d in ds] for g, ds in GROUPS.items()}
            groups = {g: {"d": float((re_ - rp)[ix].mean()), "lo": float(np.percentile(boots[:, ix].mean(1), 2.5)),
                          "hi": float(np.percentile(boots[:, ix].mean(1), 97.5))} for g, ix in gidx.items()}
            n = agg["n"].sum(0)
            maep = agg["aep"].sum(0) / np.maximum(n, 1)
            maee = agg["aee"].sum(0) / np.maximum(n, 1)
            res[split] = {"n_profiles": int(sel.sum()), "n_floats": npl, "groups": groups,
                          "depths": [{"depth_m": d, "n_obs": int(n[i]), "rmse_p": float(rp[i]), "rmse_e": float(re_[i]),
                                      "d": float(re_[i] - rp[i]), "lo": float(np.percentile(boots[:, i], 2.5)), "hi": float(np.percentile(boots[:, i], 97.5)),
                                      "mae_p": float(maep[i]), "mae_e": float(maee[i])} for i, d in enumerate(DEPTHS)],
                          "mean": {"rmse_p": float(rp.mean()), "rmse_e": float(re_.mean()), "d": float((re_ - rp).mean()),
                                   "lo": float(np.percentile(bm, 2.5)), "hi": float(np.percentile(bm, 97.5)),
                                   "mae_p": float(maep.mean()), "mae_e": float(maee.mean())}}
        out["models"][model] = res
    return out


# ----------------------------------------------------------------------------- report
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--production-dir", default="ml/data", help="production data directory (read-only)")
    ap.add_argument("--experiment-dir", default="ml/data/experiments/stride1", help="experiment data directory (read-only here)")
    ap.add_argument("--out-dir", default=None, help="where the two reports go (default: the experiment directory)")
    a = ap.parse_args(argv)
    prod, exp = Path(a.production_dir).resolve(), Path(a.experiment_dir).resolve()
    out_dir = Path(a.out_dir).resolve() if a.out_dir else exp
    if out_dir == prod or prod in out_dir.parents and exp not in (out_dir, *out_dir.parents):
        sys.exit("refusing to write reports into the production directory")
    for d, name in ((prod, "production"), (exp, "experiment")):
        if not (d / "outputs").exists() or not (d / "processed").exists():
            sys.exit(f"{name} directory lacks outputs/ or processed/: {d}")
    out_dir.mkdir(parents=True, exist_ok=True)

    L: list[str] = []
    ev: dict[str, dict] = {}  # evidence for the promotion report

    def J(root, rel):
        return load_json(root / rel)

    grid_p, grid_e = J(prod, "outputs/metrics_grid.json"), J(exp, "outputs/metrics_grid.json")
    argo_p, argo_e = J(prod, "outputs/metrics_argo.json"), J(exp, "outputs/metrics_argo.json")
    en4_p, en4_e = J(prod, "outputs/metrics_en4.json"), J(exp, "outputs/metrics_en4.json")
    cal_p, cal_e = J(prod, "outputs/uncertainty_calibration.json"), J(exp, "outputs/uncertainty_calibration.json")
    reg_p, reg_e = J(prod, "outputs/model_registry.json") or [], J(exp, "outputs/model_registry.json") or []
    sum_p, sum_e = J(prod, "processed/assemble_summary.json") or {}, J(exp, "processed/assemble_summary.json") or {}
    norm_p, norm_e = J(prod, "processed/norm_stats.json") or {}, J(exp, "processed/norm_stats.json") or {}

    L += ["# OceanSight stride-1 target-density experiment vs production", "",
          f"- production: `{prod}`", f"- experiment: `{exp}`",
          "- This report is generated read-only; no artifact in either set was modified.",
          f"- Change threshold: differences below {TOL_C} deg C are treated as *similar*; with a confidence interval, a change also has to exclude 0.",
          "",
          "## How to read the day sets", "",
          "| label | meaning |", "|---|---|",
          "| **A** | production validation/test-day set (production `metrics_grid.json`) |",
          "| **B** | stride-1 validation/test-day set (experiment `metrics_grid.json`) |",
          "| **C** | common overlapping days only, recomputed here from the saved predictions, on the intersection of both ocean masks |",
          "| **Argo / EN4** | identical observations in both runs (paired; verified below) |", "",
          "A and B are **never subtracted** from each other: they cover different days. Differences are only shown for C, Argo and EN4.", "",
          "The 2023 held-out year is confirmatory only; 2022 is the primary evidence.", ""]

    # ---- 1. metadata
    L += ["## 1. Runs", ""]
    rows = [["target days", sum_p.get("target_days"), sum_e.get("target_days")],
            ["split counts (target days)", json.dumps(sum_p.get("split_counts")), json.dumps(sum_e.get("split_counts"))],
            ["training days (normalisation / climatology fit)", norm_p.get("train_days"), norm_e.get("train_days")]]
    L += table(["item", "production", "stride-1 experiment"], rows) + [""]
    rows = []
    rp, re_ = {r["name"]: r for r in reg_p}, {r["name"]: r for r in reg_e}
    for n in sorted(set(rp) | set(re_)):
        g = lambda d, k: d.get(n, {}).get(k, "n/a")
        rows.append([n, g(rp, "epochs"), f3(g(rp, "best_val_rmse_c") if isinstance(g(rp, "best_val_rmse_c"), float) else None, 4),
                     g(rp, "created_at"), g(re_, "epochs"), f3(g(re_, "best_val_rmse_c") if isinstance(g(re_, "best_val_rmse_c"), float) else None, 4), g(re_, "created_at")])
    L += table(["model", "prod epochs", "prod best val RMSE*", "prod trained", "exp epochs", "exp best val RMSE*", "exp trained"], rows)
    L += ["", "\\* Best validation RMSE printed by training is on each run's *own* validation days (production ~117, stride-1 ~365) - **not comparable** across the two columns.", ""]

    # ---- 2. grid metrics A and B
    L += ["## 2. Grid metrics vs the HYCOM target - each run on its OWN day set (A and B; not comparable as differences)", ""]
    if grid_p and grid_e:
        for split in ("val", "test"):
            sp_, se_ = grid_p["splits"].get(split), grid_e["splits"].get(split)
            if not sp_ or not se_:
                continue
            L += [f"### {SPLIT_LABEL[split]}", "",
                  f"A: production, {sp_['n_days']} days ({sp_['period']}).  B: stride-1, {se_['n_days']} days ({se_['period']}).", ""]
            rows = []
            for n in ["climatology"] + MODELS:
                pa, pb = sp_["models"].get(n), se_["models"].get(n)
                rows.append([n, f3(mean_key(pa["per_depth"], "rmse_c")) if pa else "n/a", f3(mean_key(pa["per_depth"], "mae_c")) if pa else "n/a",
                             f3(mean_key(pb["per_depth"], "rmse_c")) if pb else "n/a", f3(mean_key(pb["per_depth"], "mae_c")) if pb else "n/a"])
            L += table(["model", "A mean RMSE", "A mean MAE", "B mean RMSE", "B mean MAE"], rows) + [""]
            pa_, pb_ = sp_["models"].get(PRIMARY), se_["models"].get(PRIMARY)
            if pa_ and pb_:
                da, db = by_depth(pa_["per_depth"]), by_depth(pb_["per_depth"])
                L += [f"Per-depth, {PRIMARY} (A and B shown side by side, no difference column):", ""]
                L += table(["depth (m)", "A RMSE", "A MAE", "B RMSE", "B MAE"],
                           [[d, f3(da.get(d, {}).get("rmse_c")), f3(da.get(d, {}).get("mae_c")), f3(db.get(d, {}).get("rmse_c")), f3(db.get(d, {}).get("mae_c"))] for d in DEPTHS]) + [""]
    else:
        L += ["metrics_grid.json is missing in one of the runs.", ""]

    # ---- 3. common days C
    L += ["## 3. Grid metrics on COMMON overlapping days (C) - the comparable grid evidence", ""]
    common = None
    try:
        common = common_day_metrics(prod, exp)
    except Exception as e:  # noqa: BLE001 - reported, never fatal
        L += [f"Could not compute the common-day comparison: `{type(e).__name__}: {e}`", ""]
    if common:
        L += [f"- common target days in total: {common['common_days_total']}; ocean cells at the surface: production {common['mask_cells_prod']}, experiment {common['mask_cells_exp']}, used (intersection) {common['mask_cells_common']}",
              f"- max |production target - experiment target| on common days: {common['target_max_abs_diff']:.6f} deg C "
              + ("(targets are identical, so the comparison is like-for-like)" if common["target_max_abs_diff"] < 1e-4 else "**(targets differ - treat the comparison with caution)**"),
              "- predictions are read from the saved daily stores (stored as int16 x 0.01 deg C, i.e. up to 0.005 deg C quantisation, identical for both runs).", ""]
        for split in ("val", "test"):
            cs = common["splits"][split]
            L += [f"### {SPLIT_LABEL[split]} - {cs['n_days']} common days (C)", ""]
            rows = []
            for n, sides in cs["models"].items():
                mp, me = mean_key(sides["prod"], "rmse_c"), mean_key(sides["exp"], "rmse_c")
                ap_, ae_ = mean_key(sides["prod"], "mae_c"), mean_key(sides["exp"], "mae_c")
                rows.append([n, f3(mp), f3(me), sd(me - mp) if mp is not None and me is not None else "n/a", f3(ap_), f3(ae_), sd(ae_ - ap_) if ap_ is not None and ae_ is not None else "n/a",
                             classify(me - mp) if mp is not None and me is not None else "n/a"])
                if n == PRIMARY and mp is not None and me is not None:
                    ev[f"common_{split}_rmse"] = {"basis": "primary" if split == "val" else "confirmatory", "delta": me - mp, "class": classify(me - mp),
                                                  "note": f"common-day grid RMSE vs HYCOM target, {split}, tolerance screen only"}
            L += table(["model", "prod mean RMSE", "exp mean RMSE", "delta", "prod mean MAE", "exp mean MAE", "delta", "RMSE verdict"], rows) + [""]
            sides = cs["models"].get(PRIMARY)
            if sides:
                dp, de = by_depth(sides["prod"]), by_depth(sides["exp"])
                L += [f"Per-depth, {PRIMARY}:", ""]
                L += table(["depth (m)", "prod RMSE", "exp RMSE", "delta", "prod MAE", "exp MAE", "delta"],
                           [[d, f3(dp[d]["rmse_c"]), f3(de[d]["rmse_c"]), sd(de[d]["rmse_c"] - dp[d]["rmse_c"]), f3(dp[d]["mae_c"]), f3(de[d]["mae_c"]), sd(de[d]["mae_c"] - dp[d]["mae_c"])]
                            for d in DEPTHS if d in dp and d in de]) + [""]
                ev[f"common_{split}_depths"] = {d: de[d]["rmse_c"] - dp[d]["rmse_c"] for d in DEPTHS if d in dp and d in de}

    # ---- 4. Argo
    L += ["## 4. Independent Argo agreement (identical profiles in both runs; paired)", ""]
    argo = None
    try:
        argo = argo_paired(prod, exp)
    except Exception as e:  # noqa: BLE001
        L += [f"Could not compute the paired Argo comparison: `{type(e).__name__}: {e}`", ""]
    if argo:
        m = argo["meta"]
        L += [f"- profile sets identical in both runs: **{m['profiles_identical']}** (production {m['n_profiles_prod']}, experiment {m['n_profiles_exp']})",
              "- confidence intervals: 95% percentile interval of the experiment-minus-production RMSE difference, bootstrapping whole floats (1000 resamples) to respect repeated profiles from the same float.",
              "- the training target (HYCOM) assimilates Argo, so held-out floats are independent of model training but not of the target product.", ""]
        for split in ("val", "test"):
            for model, res in argo["models"].items():
                r = res.get(split)
                if not r:
                    continue
                mean = r["mean"]
                L += [f"### {model} - {SPLIT_LABEL[split]} ({r['n_profiles']} profiles, {r['n_floats']} floats)", "",
                      f"mean over depths: RMSE prod {f3(mean['rmse_p'])} -> exp {f3(mean['rmse_e'])} (delta {sd(mean['d'])}, 95% CI [{sd(mean['lo'])}, {sd(mean['hi'])}]); MAE prod {f3(mean['mae_p'])} -> exp {f3(mean['mae_e'])} (delta {sd(mean['mae_e'] - mean['mae_p'])})  => **{classify(mean['d'], mean['lo'], mean['hi'])}**", ""]
                L += table(["depth (m)", "n", "prod RMSE", "exp RMSE", "delta", "95% CI", "verdict", "prod MAE", "exp MAE", "delta"],
                           [[x["depth_m"], x["n_obs"], f3(x["rmse_p"]), f3(x["rmse_e"]), sd(x["d"]), f"[{sd(x['lo'])}, {sd(x['hi'])}]", classify(x["d"], x["lo"], x["hi"]),
                             f3(x["mae_p"]), f3(x["mae_e"]), sd(x["mae_e"] - x["mae_p"])] for x in r["depths"]]) + [""]
                if model == PRIMARY:
                    ev[f"argo_{split}_mean"] = {"basis": "primary" if split == "val" else "confirmatory", "delta": mean["d"], "lo": mean["lo"], "hi": mean["hi"],
                                                "class": classify(mean["d"], mean["lo"], mean["hi"]), "note": f"Argo mean-over-depths RMSE, {split}"}
                    ev[f"argo_{split}_depths"] = {x["depth_m"]: (x["d"], x["lo"], x["hi"]) for x in r["depths"]}
                    ev[f"argo_{split}_groups"] = r["groups"]
        if argo_p and argo_e:
            L += ["Raw (uncalibrated) sigma coverage of Argo, " + PRIMARY + ", from each run's `metrics_argo.json`:", ""]
            rows = []
            for split in ("val", "test"):
                a_ = (argo_p["splits"].get(split, {}).get("models", {}).get(PRIMARY) or {})
                b_ = (argo_e["splits"].get(split, {}).get("models", {}).get(PRIMARY) or {})
                rows.append([SPLIT_LABEL[split], f3(a_.get("frac_within_1sigma")), f3(b_.get("frac_within_1sigma")), f3(a_.get("frac_within_2sigma")), f3(b_.get("frac_within_2sigma"))])
            L += table(["split", "prod within 1 sigma", "exp within 1 sigma", "prod within 2 sigma", "exp within 2 sigma"], rows) + [""]
            rows = []
            for split in ("val", "test"):
                for n in ("climatology",):
                    a_ = by_depth((argo_p["splits"].get(split, {}).get("models", {}).get(n) or {}).get("per_depth", []))
                    b_ = by_depth((argo_e["splits"].get(split, {}).get("models", {}).get(n) or {}).get("per_depth", []))
                    if a_ and b_:
                        ra = mean_key(list(a_.values()), "rmse_c"); rb = mean_key(list(b_.values()), "rmse_c")
                        rows.append([SPLIT_LABEL[split], n, f3(ra), f3(rb), sd(rb - ra)])
            if rows:
                L += ["The harmonic climatology is refit on each run's own training days, so the *baseline itself* shifts between runs. Any model gain should be read against this:", ""]
                L += table(["split", "baseline", "prod mean RMSE", "exp mean RMSE", "delta"], rows) + [""]

    # ---- 5. EN4
    L += ["## 5. EN4 cross-check (monthly 1 degree; same EN4 cells in both runs)", ""]
    if en4_p and en4_e:
        for split in ("val", "test"):
            sp_, se_ = en4_p["splits"].get(split), en4_e["splits"].get(split)
            if not sp_ or not se_:
                L += [f"{SPLIT_LABEL[split]}: not available in one of the runs.", ""]
                continue
            L += [f"### {SPLIT_LABEL[split]}", ""]
            rows = []
            for n in ["climatology"] + MODELS:
                a_, b_ = sp_["models"].get(n), se_["models"].get(n)
                if not a_ or not b_:
                    continue
                ra, rb = mean_key(a_["per_depth"], "rmse_c"), mean_key(b_["per_depth"], "rmse_c")
                ma, mb = mean_key(a_["per_depth"], "mae_c"), mean_key(b_["per_depth"], "mae_c")
                rows.append([n, f3(ra), f3(rb), sd(rb - ra), f3(ma), f3(mb), sd(mb - ma), classify(rb - ra)])
                if n == PRIMARY:
                    ev[f"en4_{split}_mean"] = {"basis": "primary" if split == "val" else "confirmatory", "delta": rb - ra, "class": classify(rb - ra), "note": f"EN4 mean RMSE, {split}, tolerance screen only"}
            L += table(["model", "prod mean RMSE", "exp mean RMSE", "delta", "prod mean MAE", "exp mean MAE", "delta", "RMSE verdict"], rows) + [""]
            a_, b_ = sp_["models"].get(PRIMARY), se_["models"].get(PRIMARY)
            if a_ and b_:
                da, db = by_depth(a_["per_depth"]), by_depth(b_["per_depth"])
                flag = "" if all(da[d]["n_obs"] == db[d]["n_obs"] for d in da if d in db) else "  (sample counts differ at some depths - see n columns)"
                L += [f"Per-depth, {PRIMARY}:{flag}", ""]
                L += table(["depth (m)", "n prod / exp", "prod RMSE", "exp RMSE", "delta", "prod MAE", "exp MAE"],
                           [[d, f"{da[d]['n_obs']} / {db[d]['n_obs']}", f3(da[d]["rmse_c"]), f3(db[d]["rmse_c"]), sd(db[d]["rmse_c"] - da[d]["rmse_c"]), f3(da[d]["mae_c"]), f3(db[d]["mae_c"])]
                            for d in DEPTHS if d in da and d in db and "rmse_c" in da[d] and "rmse_c" in db[d]]) + [""]
                ev[f"en4_{split}_depths"] = {d: db[d]["rmse_c"] - da[d]["rmse_c"] for d in DEPTHS if d in da and d in db and "rmse_c" in da[d] and "rmse_c" in db[d]}
    else:
        L += ["metrics_en4.json is missing in one of the runs.", ""]

    # ---- 6. calibration
    L += ["## 6. Uncertainty calibration", "",
          "Per-depth variance term fitted on 2022 Argo for 68.3% coverage, then checked on 2023. Coverage is scored by its distance from the Gaussian ideal (68.3% / 95.4%).", ""]
    if cal_p and cal_e:
        def wmean(c, key, nk):
            rows_ = c["per_depth"]
            w = [r[nk] for r in rows_]
            return float(np.average([r[key] for r in rows_], weights=w)) if sum(w) else None
        vp, ve = wmean(cal_p, "val_cov1_raw", "n_val"), wmean(cal_e, "val_cov1_raw", "n_val")
        tp_, te_ = cal_p["test_overall"], cal_e["test_overall"]
        rows = [["2022 raw coverage within 1 sigma (before calibration; primary)", f3(vp), f3(ve), sd(abs(ve - IDEAL_1S) - abs(vp - IDEAL_1S)) + " distance from ideal"],
                ["2023 raw coverage within 1 sigma", f3(tp_["cov1_raw"]), f3(te_["cov1_raw"]), sd(abs(te_["cov1_raw"] - IDEAL_1S) - abs(tp_["cov1_raw"] - IDEAL_1S))],
                ["2023 calibrated within 1 sigma (confirmatory)", f3(tp_["cov1_cal"]), f3(te_["cov1_cal"]), sd(abs(te_["cov1_cal"] - IDEAL_1S) - abs(tp_["cov1_cal"] - IDEAL_1S))],
                ["2023 raw within 2 sigma", f3(tp_["cov2_raw"]), f3(te_["cov2_raw"]), sd(abs(te_["cov2_raw"] - IDEAL_2S) - abs(tp_["cov2_raw"] - IDEAL_2S))],
                ["2023 calibrated within 2 sigma (confirmatory)", f3(tp_["cov2_cal"]), f3(te_["cov2_cal"]), sd(abs(te_["cov2_cal"] - IDEAL_2S) - abs(tp_["cov2_cal"] - IDEAL_2S))]]
        L += table(["metric", "production", "stride-1", "change in distance from ideal (negative = closer)"], rows) + [""]
        dp_, de_ = by_depth(cal_p["per_depth"]), by_depth(cal_e["per_depth"])
        L += ["Per-depth calibration term a_k (deg C added in quadrature; smaller = the model's own sigma needed less inflation):", ""]
        L += table(["depth (m)", "prod a_k", "exp a_k", "prod 2023 cal. cov1", "exp 2023 cal. cov1"],
                   [[d, f3(dp_[d]["a_c"], 2), f3(de_[d]["a_c"], 2), f3(dp_[d]["test_cov1_cal"]), f3(de_[d]["test_cov1_cal"])] for d in DEPTHS if d in dp_ and d in de_]) + [""]
        d1 = abs(ve - IDEAL_1S) - abs(vp - IDEAL_1S)
        ev["calib_val_raw"] = {"basis": "primary", "delta": d1, "class": "improved" if d1 <= -TOL_COV else "worsened" if d1 >= TOL_COV else "similar",
                               "note": "2022 raw 1-sigma coverage, distance from ideal"}
        d2 = abs(te_["cov1_cal"] - IDEAL_1S) - abs(tp_["cov1_cal"] - IDEAL_1S)
        ev["calib_test_cal"] = {"basis": "confirmatory", "delta": d2, "class": "improved" if d2 <= -TOL_COV else "worsened" if d2 >= TOL_COV else "similar",
                                "note": "2023 calibrated 1-sigma coverage, distance from ideal"}
    else:
        L += ["uncertainty_calibration.json is missing in one of the runs.", ""]

    # ---- 7. focus depths
    L += ["## 7. Focus depths (primary model, change in RMSE: experiment - production; negative = better)", ""]
    cols = [("Argo 2022", "argo_val_depths", True), ("EN4 2022", "en4_val_depths", False), ("common-day grid 2022", "common_val_depths", False),
            ("Argo 2023 (conf.)", "argo_test_depths", True), ("EN4 2023 (conf.)", "en4_test_depths", False), ("common-day grid 2023 (conf.)", "common_test_depths", False)]

    def depth_delta(key, d, ci):
        v = ev.get(key, {}).get(d)
        if v is None:
            return "n/a"
        return sd(v[0]) if ci else sd(v)
    L += table(["depth (m)"] + [c[0] for c in cols], [[d] + [depth_delta(k, d, ci) for _, k, ci in cols] for d in KEY_DEPTHS]) + [""]

    # ---- 8. depth groups
    L += ["## 8. Depth groups (mean change in RMSE across the depths of each group)", "",
          "Argo columns carry a 95% bootstrap interval and use it for the verdict. EN4 and common-day columns are tolerance-only screens (no interval) and are informational.", ""]
    grp_rows, grp_class = [], {}
    for g, ds in GROUPS.items():
        row = [g]
        for label, key, ci in cols:
            if ci:
                gv = ev.get(key.replace("_depths", "_groups"), {}).get(g)
                m = gv["d"] if gv else None
                row.append(sd(m) + (f" [{sd(gv['lo'])}, {sd(gv['hi'])}]" if gv else ""))
                grp_class[(g, label)] = classify(gv["d"], gv["lo"], gv["hi"]) if gv else "unavailable"
            else:
                vals = [ev.get(key, {}).get(d) for d in ds if ev.get(key, {}).get(d) is not None]
                m = float(np.mean(vals)) if vals else None
                row.append(sd(m))
                grp_class[(g, label)] = classify(m) if m is not None else "unavailable"
        grp_rows.append(row)
    L += table(["group"] + [c[0] for c in cols], grp_rows) + [""]

    (out_dir / "stride1_vs_production.md").write_text("\n".join(L) + "\n", encoding="utf-8")

    # ------------------------------------------------------------------------- promotion recommendation
    P = ["# Promotion recommendation - OceanSight stride-1 target-density experiment", "",
         "> **Production promotion requires explicit approval.** This document summarises evidence; it does not change, replace or promote any production artifact.", "",
         f"Evidence rules (declared before looking at 2023): a change is *improved*/*worsened* only if it is at least {TOL_C} deg C and, where a confidence interval exists, the interval excludes 0; otherwise *similar*. "
         "**2022 is the primary evidence; 2023 is confirmatory** and can only veto, never justify, a promotion (docs/DECISIONS.md D-012).", ""]
    order = ["argo_val_mean", "en4_val_mean", "common_val_rmse", "calib_val_raw", "argo_test_mean", "common_test_rmse", "en4_test_mean", "calib_test_cal"]
    P += ["## Evidence table", ""]
    P += table(["evidence", "basis", "change", "95% CI", "verdict"],
               [[ev[k]["note"], ev[k]["basis"], sd(ev[k]["delta"]), (f"[{sd(ev[k]['lo'])}, {sd(ev[k]['hi'])}]" if "lo" in ev[k] else "tolerance only"), ev[k]["class"]] for k in order if k in ev]) + [""]

    classes = {k: ev[k]["class"] for k in order if k in ev}
    improved = [ev[k]["note"] for k in classes if classes[k] == "improved"]
    worsened = [ev[k]["note"] for k in classes if classes[k] == "worsened"]
    similar = [ev[k]["note"] for k in classes if classes[k] == "similar"]
    P += ["## What improved", ""] + ([f"- {x}" for x in improved] or ["- nothing met the improvement criterion"]) + [""]
    P += ["## What worsened", ""] + ([f"- {x}" for x in worsened] or ["- nothing met the worsening criterion"]) + [""]
    P += ["## What stayed similar", ""] + ([f"- {x}" for x in similar] or ["- (none)"]) + [""]

    def yn(key):
        c = classes.get(key)
        return {"improved": "yes (improved)", "worsened": "no (worsened)", "similar": "no meaningful change", None: "not available"}[c]
    P += ["## Direct answers", "",
          f"- Did Argo agreement improve (2022, primary)? **{yn('argo_val_mean')}**; 2023 confirmatory: {yn('argo_test_mean')}",
          f"- Did EN4 agreement improve (2022)? **{yn('en4_val_mean')}**; 2023 confirmatory: {yn('en4_test_mean')}",
          f"- Did uncertainty calibration improve? 2022 raw coverage: **{yn('calib_val_raw')}**; 2023 calibrated coverage (confirmatory): {yn('calib_test_cal')}",
          f"- Did 2023 common-day performance improve (confirmatory)? **{yn('common_test_rmse')}**", ""]
    P += [f"- Did deeper layers improve or degrade? (mean change in RMSE by depth group; Argo columns use a 95% interval, EN4/common-day columns are tolerance-only and informational; 'improved' needs at least {TOL_C} deg C)", ""]
    P += table(["depth group"] + [c[0] for c in cols], [[g] + [f"{grp_class[(g, c[0])]}" for c in cols] for g in GROUPS]) + [""]
    worse_depths = []
    for d, (dlt, lo, hi) in (ev.get("argo_val_depths") or {}).items():
        if classify(dlt, lo, hi) == "worsened":
            worse_depths.append(d)
    P += [f"- Depths where Argo 2022 agreement is significantly worse: {worse_depths if worse_depths else 'none'}", ""]
    # only CI-backed evidence (Argo) can veto on depth; tolerance-only columns are shown but informational
    worse_groups = [(g, l) for (g, l), c in grp_class.items() if c == "worsened" and l.startswith("Argo")]

    primary_ok = {"argo_val_mean", "en4_val_mean", "common_val_rmse"}
    have = all(k in classes for k in primary_ok)
    if not have:
        verdict = "INSUFFICIENT EVIDENCE - one or more required comparisons could not be computed (see stride1_vs_production.md)."
    elif classes["argo_val_mean"] == "improved" and not worsened and not worse_depths and not worse_groups:
        verdict = "EVIDENCE SUPPORTS CONSIDERING PROMOTION - the 2022 Argo agreement improved meaningfully and nothing worsened, on any primary or confirmatory measure."
    elif worsened or worse_depths or worse_groups:
        verdict = "EVIDENCE DOES NOT SUPPORT PROMOTION - at least one measure got meaningfully worse (listed above)."
    else:
        verdict = "NO MEANINGFUL IMPROVEMENT - the primary (2022) evidence is similar to production; keeping production is the conservative choice."
    P += ["## Evidence summary", "", f"**{verdict}**", "",
          "Before any decision also read: the climatology baseline shifts between runs (it is refit on more training days), so part of any change may come from the baseline rather than the network; "
          "the stride-1 model still learns from the same HYCOM analysis, which assimilates Argo; and this is a single training run per configuration (one seed), so small differences are inside run-to-run noise.", "",
          "**Production promotion requires explicit approval.**", ""]
    (out_dir / "PROMOTION_RECOMMENDATION.md").write_text("\n".join(P) + "\n", encoding="utf-8")
    print(f"wrote {out_dir / 'stride1_vs_production.md'}")
    print(f"wrote {out_dir / 'PROMOTION_RECOMMENDATION.md'}")
    print(verdict)
    return 0


if __name__ == "__main__":
    sys.exit(main())
