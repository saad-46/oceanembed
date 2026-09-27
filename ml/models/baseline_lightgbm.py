"""Per-pixel LightGBM baseline, one regressor per standard depth (docs/10 section 1).

Features per (cell, day): the 7 surface fields in physical units + lat, lon + sin/cos
day-of-year. No spatial context by design - this is the "is deep learning even needed"
honesty baseline. Feature importances are saved for the explainability panel.
"""
from __future__ import annotations

import json
import logging

import lightgbm as lgb
import numpy as np
import pandas as pd

from ml.config import INPUT_VARS, LATS, LONS, MODEL_DIR, STANDARD_DEPTHS

log = logging.getLogger("oceanembed.lgbm")
FEATURES = INPUT_VARS + ["lat", "lon", "doy_sin", "doy_cos"]


def pixel_features(inp: dict[str, np.ndarray], times) -> np.ndarray:
    """-> (t, lat, lon, n_features) in physical units (trees don't need normalisation)."""
    t = len(times)
    lat2, lon2 = np.meshgrid(LATS, LONS, indexing="ij")
    doy = pd.DatetimeIndex(times).dayofyear.to_numpy(float)
    cols = [inp[v] for v in INPUT_VARS]
    cols += [np.broadcast_to(lat2, (t,) + lat2.shape), np.broadcast_to(lon2, (t,) + lon2.shape)]
    cols += [np.broadcast_to(np.sin(2 * np.pi * doy / 365.25)[:, None, None], (t,) + lat2.shape),
             np.broadcast_to(np.cos(2 * np.pi * doy / 365.25)[:, None, None], (t,) + lat2.shape)]
    return np.stack(cols, axis=-1).astype(np.float32)


class LightGBMBaseline:
    def __init__(self, boosters: list[lgb.Booster] | None = None):
        self.boosters = boosters or []

    def fit(self, Xtr, Ytr, mtr, Xva, Yva, mva, n_train=400_000, n_val=100_000, seed=0):
        """X*: (t, lat, lon, F); Y*: (t, 15, lat, lon); m*: (15, lat, lon) ocean masks."""
        rng = np.random.default_rng(seed)
        params = dict(objective="regression", learning_rate=0.05, num_leaves=63, min_data_in_leaf=50,
                      feature_fraction=0.9, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0,
                      verbose=-1, num_threads=8, seed=seed)
        self.boosters = []
        for k, z in enumerate(STANDARD_DEPTHS):
            def sample(X, Y, n):
                t_idx, i_idx, j_idx = np.where(np.isfinite(Y[:, k]) & mtr[k][None])
                pick = rng.choice(t_idx.size, size=min(n, t_idx.size), replace=False)
                t_idx, i_idx, j_idx = t_idx[pick], i_idx[pick], j_idx[pick]
                return X[t_idx, i_idx, j_idx], Y[t_idx, k, i_idx, j_idx]
            xa, ya = sample(Xtr, Ytr, n_train)
            xv, yv = sample(Xva, Yva, n_val)
            dtr = lgb.Dataset(xa, ya, feature_name=FEATURES)
            dva = lgb.Dataset(xv, yv, reference=dtr)
            b = lgb.train(params, dtr, num_boost_round=1500, valid_sets=[dva],
                          callbacks=[lgb.early_stopping(50, verbose=False)])
            log.info("lgbm depth %4dm: best_iter=%d val_rmse=%.3f", z, b.best_iteration,
                     float(np.sqrt(np.mean((b.predict(xv, num_iteration=b.best_iteration) - yv) ** 2))))
            self.boosters.append(b)
        return self

    def predict(self, X: np.ndarray, mask3d: np.ndarray) -> np.ndarray:
        """X: (t, lat, lon, F) -> (t, 15, lat, lon), NaN outside each depth's ocean mask."""
        t = X.shape[0]
        out = np.full((t, len(STANDARD_DEPTHS)) + X.shape[1:3], np.nan, dtype=np.float32)
        ocean = mask3d[0]
        flat = X[:, ocean].reshape(-1, X.shape[-1])
        for k, b in enumerate(self.boosters):
            pred = b.predict(flat, num_iteration=b.best_iteration).astype(np.float32).reshape(t, -1)
            layer = np.full((t,) + X.shape[1:3], np.nan, dtype=np.float32)
            layer[:, ocean] = pred
            layer[:, ~mask3d[k]] = np.nan
            out[:, k] = layer
        return out

    def feature_importance(self) -> dict:
        imp = {}
        for z, b in zip(STANDARD_DEPTHS, self.boosters):
            g = b.feature_importance("gain")
            imp[str(int(z))] = dict(zip(FEATURES, (g / g.sum()).round(4).tolist()))
        return imp

    def save(self, name="baseline-lightgbm-v1"):
        d = MODEL_DIR / name
        d.mkdir(parents=True, exist_ok=True)
        for z, b in zip(STANDARD_DEPTHS, self.boosters):
            b.save_model(str(d / f"depth_{int(z)}.txt"), num_iteration=b.best_iteration)
        (d / "feature_importance.json").write_text(json.dumps(self.feature_importance(), indent=2))
        return d

    @classmethod
    def load(cls, name="baseline-lightgbm-v1"):
        d = MODEL_DIR / name
        return cls([lgb.Booster(model_file=str(d / f"depth_{int(z)}.txt")) for z in STANDARD_DEPTHS])
