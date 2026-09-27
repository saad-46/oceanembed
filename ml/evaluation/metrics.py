"""Per-depth skill metrics (docs/10 section 2): RMSE, bias, Pearson r, skill vs climatology."""
from __future__ import annotations

import numpy as np

from ml.config import STANDARD_DEPTHS


def per_depth_metrics(pred: np.ndarray, obs: np.ndarray, clim: np.ndarray | None = None) -> list[dict]:
    """pred/obs/clim: (n_samples, 15). NaNs are dropped pairwise per depth.

    ``skill_vs_climatology`` = 1 - MSE_model / MSE_climatology (1 = perfect,
    0 = no better than the seasonal climatology, < 0 = worse).
    """
    rows = []
    for k, z in enumerate(STANDARD_DEPTHS):
        p, o = pred[:, k], obs[:, k]
        ok = np.isfinite(p) & np.isfinite(o)
        if clim is not None:
            ok &= np.isfinite(clim[:, k])
        n = int(ok.sum())
        row = {"depth_m": float(z), "n_obs": n}
        if n >= 3:
            e = p[ok] - o[ok]
            row.update(rmse_c=float(np.sqrt(np.mean(e**2))), bias_c=float(np.mean(e)),
                       mae_c=float(np.mean(np.abs(e))),
                       corr=float(np.corrcoef(p[ok], o[ok])[0, 1]) if np.std(p[ok]) > 0 and np.std(o[ok]) > 0 else None)
            if clim is not None:
                ec = clim[ok, k] - o[ok]
                row["clim_rmse_c"] = float(np.sqrt(np.mean(ec**2)))
                row["skill_vs_climatology"] = float(1 - np.mean(e**2) / max(np.mean(ec**2), 1e-12))
        rows.append(row)
    return rows


def grid_samples(pred: np.ndarray, obs: np.ndarray, mask3d: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(t, 15, lat, lon) grids -> (n_cells, 15) sample matrices over masked ocean cells."""
    p = np.moveaxis(pred, 1, -1)[:, mask3d[0]]  # (t, n_cells, 15)
    o = np.moveaxis(obs, 1, -1)[:, mask3d[0]]
    return p.reshape(-1, p.shape[-1]), o.reshape(-1, o.shape[-1])
