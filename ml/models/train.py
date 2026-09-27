"""Training + held-out-year evaluation (docs/10 section 2).

    python -m ml.models.train lightgbm
    python -m ml.models.train unet [--epochs 40] [--no-sss]   # --no-sss = salinity ablation
    python -m ml.models.train evaluate                        # grid metrics vs target, val+test years

Temporal split by whole years (train 2019-21 / val 2022 / test 2023): random day-level
splits leak autocorrelation and overstate skill. Early stopping uses the val year only;
the test year is touched once, by ``evaluate``.
"""
from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import datetime, timezone

import numpy as np
import torch

from ml.config import INPUT_VARS, MODEL_DIR, OUTPUT_DIR, STANDARD_DEPTHS, TRAIN_YEARS
from ml.evaluation.metrics import grid_samples, per_depth_metrics
from ml.models.cnn_unet import UNet, masked_loss
from ml.pipeline.feature_engineering import NCHAN, Dataset

log = logging.getLogger("oceanembed.train")
SSS_CHANNEL = INPUT_VARS.index("sss")
UNET_NAME = {False: "cnn-unet-v1", True: "cnn-unet-nosss-v1"}


def _registry_update(entry: dict):
    path = OUTPUT_DIR / "model_registry.json"
    reg = json.loads(path.read_text()) if path.exists() else []
    reg = [r for r in reg if r["name"] != entry["name"]] + [entry]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(reg, indent=2))


# ---------------------------------------------------------------- U-Net
def _to_norm(a, ds):
    return (a - ds.tmean[None, :, None, None]) / ds.tstd[None, :, None, None]


def predict_unet(model: UNet, X: np.ndarray, clim: np.ndarray, ds_or_stats, mask3d: np.ndarray,
                 batch: int = 8, no_sss: bool = False):
    """-> (temp_c, sigma_c), each (t, 15, lat, lon), NaN outside the per-depth ocean mask."""
    tmean, tstd = ds_or_stats.tmean, ds_or_stats.tstd
    model.eval()
    mus, sig = [], []
    with torch.no_grad():
        for s in range(0, X.shape[0], batch):
            xb = torch.from_numpy(X[s:s + batch].copy())
            if no_sss:
                xb[:, SSS_CHANNEL] = 0.0
            cb = torch.from_numpy(np.nan_to_num((clim[s:s + batch] - tmean[None, :, None, None]) / tstd[None, :, None, None]).astype(np.float32))
            mu, logvar = model(xb, cb)
            mus.append(mu.numpy()); sig.append(np.exp(0.5 * logvar.numpy()))
    mu = np.concatenate(mus) * tstd[None, :, None, None] + tmean[None, :, None, None]
    sd = np.concatenate(sig) * tstd[None, :, None, None]
    mu[:, ~mask3d] = np.nan
    sd[:, ~mask3d] = np.nan
    return mu.astype(np.float32), sd.astype(np.float32)


def load_unet(name: str = "cnn-unet-v1"):
    ck = torch.load(MODEL_DIR / name / "model.pt", map_location="cpu", weights_only=False)
    model = UNet(**ck["config"])
    model.load_state_dict(ck["state_dict"])
    model.eval()
    return model, ck


def train_unet(epochs: int = 40, no_sss: bool = False, base: int = 24, batch: int = 4, lr: float = 1e-3, seed: int = 0):
    torch.manual_seed(seed); np.random.seed(seed)
    torch.set_num_threads(8)
    ds = Dataset()
    name = UNET_NAME[no_sss]
    t_tr, X_tr, Y_tr, C_tr = ds.split("train")
    t_va, X_va, Y_va, C_va = ds.split("val")
    if no_sss:
        X_tr[:, SSS_CHANNEL] = 0.0
        X_va[:, SSS_CHANNEL] = 0.0
    log.info("%s: train %d days, val %d days", name, len(t_tr), len(t_va))
    y_tr = np.nan_to_num(_to_norm(Y_tr, ds)).astype(np.float32)
    c_tr = np.nan_to_num(_to_norm(C_tr, ds)).astype(np.float32)
    m_tr = (np.isfinite(Y_tr) & ds.mask3d[None])
    del Y_tr, C_tr

    config = dict(in_ch=NCHAN, n_depth=len(STANDARD_DEPTHS), base=base)
    model = UNet(**config)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    steps = epochs * int(np.ceil(len(t_tr) / batch))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps, pct_start=0.1)
    best, best_state, history = np.inf, None, []
    for ep in range(epochs):
        model.train()
        perm = np.random.permutation(len(t_tr))
        t0, tot = time.time(), 0.0
        for s in range(0, len(perm), batch):
            idx = np.sort(perm[s:s + batch])
            mu, logvar = model(torch.from_numpy(X_tr[idx]), torch.from_numpy(c_tr[idx]))
            loss, mse = masked_loss(mu, logvar, torch.from_numpy(y_tr[idx]), torch.from_numpy(m_tr[idx]))
            opt.zero_grad(); loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step()
            tot += float(mse) * len(idx)
        pred, _ = predict_unet(model, X_va, C_va, ds, ds.mask3d)
        p, o = grid_samples(pred, Y_va, ds.mask3d)
        val_rmse = float(np.nanmean([r["rmse_c"] for r in per_depth_metrics(p, o) if "rmse_c" in r]))
        history.append({"epoch": ep + 1, "train_mse_norm": tot / len(perm), "val_rmse_c_mean_over_depths": val_rmse,
                        "secs": round(time.time() - t0, 1)})
        log.info("%s epoch %d/%d train_mse=%.4f val_rmse=%.3f degC (%.0fs)", name, ep + 1, epochs,
                 tot / len(perm), val_rmse, time.time() - t0)
        if val_rmse < best:
            best, best_state = val_rmse, {k: v.clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    out = MODEL_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    torch.save({"config": config, "state_dict": best_state, "no_sss": no_sss, "history": history,
                "tmean": ds.tmean, "tstd": ds.tstd}, out / "model.pt")
    (out / "history.json").write_text(json.dumps(history, indent=2))
    _registry_update({
        "name": name, "architecture": "CNN-UNet", "inputs": [c for c in INPUT_VARS if not (no_sss and c == "sss")],
        "training_period_start": f"{min(TRAIN_YEARS)}-01-01", "training_period_end": f"{max(TRAIN_YEARS)}-12-31",
        "checkpoint_path": str((out / "model.pt").relative_to(MODEL_DIR.parent)),
        "is_production": not no_sss, "created_at": datetime.now(timezone.utc).isoformat(),
        "best_val_rmse_c": best, "epochs": epochs, "params": int(sum(p.numel() for p in model.parameters())),
    })
    return model


# ---------------------------------------------------------------- LightGBM
def train_lightgbm():
    from ml.models.baseline_lightgbm import LightGBMBaseline, pixel_features

    ds = Dataset()

    def feats(split):
        idx = np.where(ds.splits == split)[0]
        times = ds.times[idx]
        sel = ds.inputs.sel(time=times.values)
        X = pixel_features({v: sel[v].values for v in INPUT_VARS}, times)
        return X, ds.target["temp"].isel(time=idx).values

    Xtr, Ytr = feats("train")
    Xva, Yva = feats("val")
    model = LightGBMBaseline().fit(Xtr, Ytr, ds.mask3d, Xva, Yva, ds.mask3d)
    path = model.save()
    _registry_update({
        "name": "baseline-lightgbm-v1", "architecture": "LightGBM", "inputs": INPUT_VARS,
        "training_period_start": f"{min(TRAIN_YEARS)}-01-01", "training_period_end": f"{max(TRAIN_YEARS)}-12-31",
        "checkpoint_path": str(path.relative_to(MODEL_DIR.parent)), "is_production": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return model


# ---------------------------------------------------------------- Evaluation vs target grids
def evaluate():
    """Per-depth metrics of every model vs the gridded target on the val and test years."""
    from ml.models.baseline_lightgbm import LightGBMBaseline, pixel_features

    ds = Dataset()
    lgbm = LightGBMBaseline.load()
    results = {"target_source": ds.target.attrs.get("prov_product"), "splits": {}}
    unets = {n: load_unet(n) for n in UNET_NAME.values() if (MODEL_DIR / n / "model.pt").exists()}
    bob = _region_mask("Bay of Bengal")
    for split in ("val", "test"):
        times, X, Y, C = ds.split(split)
        preds = {"climatology": np.where(ds.mask3d[None], C, np.nan)}
        sel = ds.inputs.sel(time=times.values)
        preds["baseline-lightgbm-v1"] = lgbm.predict(pixel_features({v: sel[v].values for v in INPUT_VARS}, times), ds.mask3d)
        for n, (m, ck) in unets.items():
            mu, sd = predict_unet(m, X, C, ds, ds.mask3d, no_sss=ck.get("no_sss", False))
            preds[n] = mu
            if n == "cnn-unet-v1":
                p, o = grid_samples(mu, Y, ds.mask3d)
                s, _ = grid_samples(sd, Y, ds.mask3d)
                ok = np.isfinite(p) & np.isfinite(o) & np.isfinite(s)
                results.setdefault("uncertainty_calibration", {})[split] = {
                    "frac_within_1sigma": float((np.abs(p - o)[ok] <= s[ok]).mean()),
                    "frac_within_2sigma": float((np.abs(p - o)[ok] <= 2 * s[ok]).mean()),
                    "ideal_gaussian": [0.683, 0.954]}
        pc, oc = grid_samples(preds["climatology"], Y, ds.mask3d)
        split_res = {"n_days": len(times), "period": f"{times.min().date()}..{times.max().date()}", "models": {}}
        for n, pred in preds.items():
            p, o = grid_samples(pred, Y, ds.mask3d)
            rows = per_depth_metrics(p, o, pc)
            # Bay of Bengal subset (salinity ablation story, docs/15)
            mb = ds.mask3d & bob[None]
            pb, ob = grid_samples(np.where(mb[None], pred, np.nan), Y, ds.mask3d)
            rows_bob = per_depth_metrics(pb, ob)
            split_res["models"][n] = {"per_depth": rows, "bay_of_bengal_per_depth": rows_bob}
        results["splits"][split] = split_res
        log.info("evaluated %s (%d days)", split, len(times))
    out = OUTPUT_DIR / "metrics_grid.json"
    out.write_text(json.dumps(results, indent=2))
    return results


def _region_mask(name: str) -> np.ndarray:
    from ml.config import LATS, LONS, REGIONS

    r = next(r for r in REGIONS if r.name == name)
    lat2, lon2 = np.meshgrid(LATS, LONS, indexing="ij")
    return (lat2 >= r.min_lat) & (lat2 <= r.max_lat) & (lon2 >= r.min_lon) & (lon2 <= r.max_lon)


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("what", choices=["lightgbm", "unet", "evaluate"])
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--base", type=int, default=24)
    p.add_argument("--no-sss", action="store_true")
    a = p.parse_args(argv)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if a.what == "lightgbm":
        train_lightgbm()
    elif a.what == "unet":
        train_unet(epochs=a.epochs, no_sss=a.no_sss, base=a.base)
    else:
        print(json.dumps({s: {m: round(float(np.nanmean([r.get("rmse_c", np.nan) for r in v["per_depth"]])), 3)
                              for m, v in r["models"].items()} for s, r in evaluate()["splits"].items()}, indent=2))


if __name__ == "__main__":
    main()
