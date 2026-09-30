"""Short-horizon (T+1 / T+2 day) estimate of the reconstructed temperature column.

This is *not* a trained forecast model. Two transparent statistical extrapolations of the
reconstructed daily series at one grid cell are provided:

* ``persistence`` - the value on the issue day is carried forward.
* ``trend``       - an ordinary least-squares line fitted to the last ``window`` days
                    (issue day included) is extrapolated ``h`` days ahead.

Only days up to and including the issue day are used, so an estimate issued inside the
reconstructed record can be compared with the reconstruction of the target day.

Error estimate: the same method is re-run ("hindcast") for every issue day in the preceding
``hindcast_days`` at the same cell, and its RMSE against the reconstruction ``h`` days later is
reported per depth. That RMSE measures how well the method extrapolates the *reconstruction*;
the reconstruction's own error (calibrated sigma) is combined in quadrature, assuming the two are
independent, to give the reported +/-1 sd.
"""
from __future__ import annotations

import warnings

import numpy as np

DEFAULT_WINDOW = 7
MIN_WINDOW_POINTS = 5
DEFAULT_HINDCAST_DAYS = 60
MIN_HINDCAST_PAIRS = 20
HORIZONS = (1, 2)
METHODS = ("trend", "persistence")


class InsufficientHistory(ValueError):
    pass


def _estimate(t: np.ndarray, y: np.ndarray, t_issue: int, h: int, method: str, window: int) -> np.ndarray:
    """t: (n,) day numbers <= t_issue; y: (n, d). Returns (d,) estimate for t_issue + h (NaN if undefined)."""
    sel = t > t_issue - window
    t, y = t[sel], y[sel]
    d = y.shape[1]
    out = np.full(d, np.nan)
    if method == "persistence":
        if t.size and t[-1] == t_issue:
            out = y[-1].astype(float)
        return out
    for k in range(d):
        ok = np.isfinite(y[:, k])
        if ok.sum() < MIN_WINDOW_POINTS:
            continue
        tt, yy = t[ok].astype(float), y[ok, k].astype(float)
        slope, icpt = np.polyfit(tt - t_issue, yy, 1)
        out[k] = icpt + slope * h
    return out


def estimate(t, y, t_issue: int, *, method: str = "trend", window: int = DEFAULT_WINDOW,
             horizons=HORIZONS, hindcast_days: int = DEFAULT_HINDCAST_DAYS) -> dict:
    """Estimates for each horizon plus hindcast RMSE per depth for ``method`` and persistence.

    ``t`` are integer day numbers (ascending, gaps allowed) and ``y`` is (n, depth).
    Raises ``InsufficientHistory`` when the window or the hindcast sample is too short.
    """
    if method not in METHODS:
        raise ValueError(method)
    t = np.asarray(t, dtype=int)
    y = np.asarray(y, dtype=float)
    past = t <= t_issue
    t, y = t[past], y[past]
    in_win = t > t_issue - window
    if not t.size or t[-1] != t_issue or in_win.sum() < MIN_WINDOW_POINTS:
        raise InsufficientHistory(f"needs at least {MIN_WINDOW_POINTS} reconstructed days in the {window}-day window "
                                  f"ending on the issue day (found {int(in_win.sum())}).")
    lookup = {int(v): i for i, v in enumerate(t)}
    out = {"horizons": {}, "hindcast": {}}
    for h in horizons:
        out["horizons"][h] = {m: _estimate(t, y, t_issue, h, m, window) for m in {method, "persistence"}}
        errs: dict[str, list] = {m: [] for m in {method, "persistence"}}
        for s in t[(t < t_issue) & (t >= t_issue - hindcast_days)]:
            j = lookup.get(int(s) + h)
            if j is None or t[j] > t_issue:
                continue
            k = lookup[int(s)]
            for m in errs:
                errs[m].append(_estimate(t[: k + 1], y[: k + 1], int(s), h, m, window) - y[j])
        n = len(errs[method])
        if n < MIN_HINDCAST_PAIRS:
            raise InsufficientHistory(f"needs at least {MIN_HINDCAST_PAIRS} hindcast pairs to estimate the error "
                                      f"at +{h} d (found {n}); choose a later issue date.")
        out["hindcast"][h] = {m: {"rmse": _rmse(np.asarray(e)), "n_pairs": len(e)} for m, e in errs.items()}
    return out


def _rmse(e: np.ndarray) -> np.ndarray:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN columns (levels below the seabed)
        return np.sqrt(np.nanmean(np.square(e), axis=0))
