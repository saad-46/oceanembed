"""Feature engineering + dataset assembly (docs/09 Feature engineering / Storage).

Produces, under ``data/processed``:

* ``target.zarr``       temp(time, depth, lat, lon) on the standard grid, target days only
* ``static.zarr``       ocean_mask3d(depth, lat, lon): cells valid at that depth
* ``climatology.zarr``  harmonic seasonal climatology coefficients fitted on TRAIN years only
* ``norm_stats.json``   per-channel / per-depth mean & std from TRAIN years only

Model input tensor per day (11 channels, docs/09 "7+3"): the 7 surface fields
(SST, SSS, SLA, U/V current, U/V wind) + latitude, longitude + sin/cos day-of-year.
Normalisation uses training-year statistics exclusively - validation and test years
never influence it (leakage check in tests/test_ml.py).
"""
from __future__ import annotations

import json
import logging

import numpy as np
import pandas as pd
import xarray as xr

from ml.config import (INPUT_VARS, LATS, LONS, PROCESSED_DIR, STANDARD_DEPTHS, TEST_YEARS, TRAIN_YEARS,
                       VAL_YEARS)

log = logging.getLogger("oceanembed.features")

N_HARMONICS = 2  # annual + semi-annual
CHANNELS = INPUT_VARS + ["lat", "lon", "doy_sin", "doy_cos"]
NCHAN = len(CHANNELS)


def split_of_year(year: int) -> str:
    return "train" if year in TRAIN_YEARS else "val" if year in VAL_YEARS else "test" if year in TEST_YEARS else "other"


def harmonic_design(times) -> np.ndarray:
    doy = pd.DatetimeIndex(times).dayofyear.to_numpy(float)
    w = 2 * np.pi * doy / 365.25
    cols = [np.ones_like(w)]
    for k in range(1, N_HARMONICS + 1):
        cols += [np.cos(k * w), np.sin(k * w)]
    return np.stack(cols, axis=1)


def fit_climatology(temp: np.ndarray, times, mask3d: np.ndarray) -> np.ndarray:
    """Least-squares harmonic fit per (depth, lat, lon). temp: (t, 15, lat, lon)."""
    X = harmonic_design(times)
    Y = temp.reshape(temp.shape[0], -1).astype(np.float64)
    col_mean = np.nanmean(np.where(np.isfinite(Y), Y, np.nan), axis=0)
    Y = np.where(np.isfinite(Y), Y, col_mean)  # rare gaps inside valid cells
    Y = np.nan_to_num(Y)
    coef, *_ = np.linalg.lstsq(X, Y, rcond=None)
    coef = coef.reshape((X.shape[1],) + temp.shape[1:]).astype(np.float32)
    coef[:, ~mask3d] = np.nan
    return coef


def climatology_for(times, coef: np.ndarray) -> np.ndarray:
    """Evaluate the harmonic climatology: -> (t, 15, lat, lon)."""
    X = harmonic_design(times).astype(np.float32)
    return np.einsum("tk,kdij->tdij", X, coef)


def make_features(inp: dict[str, np.ndarray], times, stats: dict, ocean: np.ndarray) -> np.ndarray:
    """Build the normalised (t, 11, lat, lon) input tensor. Land cells are 0."""
    t = len(times)
    out = np.zeros((t, NCHAN, LATS.size, LONS.size), dtype=np.float32)
    for c, v in enumerate(INPUT_VARS):
        m, s = stats["inputs"][v]["mean"], stats["inputs"][v]["std"]
        out[:, c] = np.nan_to_num((inp[v] - m) / s)
    lat2, lon2 = np.meshgrid(LATS, LONS, indexing="ij")
    out[:, len(INPUT_VARS)] = ((lat2 - LATS.mean()) / LATS.std())[None]
    out[:, len(INPUT_VARS) + 1] = ((lon2 - LONS.mean()) / LONS.std())[None]
    doy = pd.DatetimeIndex(times).dayofyear.to_numpy(float)
    out[:, -2] = np.sin(2 * np.pi * doy / 365.25)[:, None, None]
    out[:, -1] = np.cos(2 * np.pi * doy / 365.25)[:, None, None]
    out[:, :, ~ocean] = 0.0
    return out


def assemble() -> dict:
    from ml.ingestion.fetch_glorys import get_adapter

    inputs = xr.open_zarr(PROCESSED_DIR / "inputs.zarr")
    adapter = get_adapter()
    days = [d for d in adapter.cached_days() if np.datetime64(d) in set(inputs.time.values.astype("datetime64[D]"))]
    log.info("assembling %d target days", len(days))
    target = adapter.load_cached(days)
    temp = target["temp"].values  # (t, 15, lat, lon)
    times = pd.DatetimeIndex(target.time.values)

    ocean2d = inputs["ocean_mask"].values
    valid_frac = np.isfinite(temp).mean(axis=0)
    mask3d = (valid_frac >= 0.9) & ocean2d[None]
    temp = np.where(mask3d[None], temp, np.nan).astype(np.float32)

    train = np.array([split_of_year(y) == "train" for y in times.year])
    if train.sum() < 20:
        raise RuntimeError(f"only {train.sum()} training days available - keep ingesting")

    # --- statistics from TRAIN years only (leakage guard) ---
    tr_days = times[train]
    inp_train = inputs.sel(time=tr_days.values)
    stats = {"inputs": {}, "target": {}, "train_days": int(train.sum()),
             "fit_years": list(TRAIN_YEARS), "channels": CHANNELS}
    for v in INPUT_VARS:
        a = inp_train[v].values[:, ocean2d]
        stats["inputs"][v] = {"mean": float(np.nanmean(a)), "std": float(np.nanstd(a) + 1e-6)}
    for k, z in enumerate(STANDARD_DEPTHS):
        a = temp[train, k][:, mask3d[k]]
        stats["target"][str(int(z))] = {"mean": float(np.nanmean(a)), "std": float(np.nanstd(a) + 1e-6)}

    coef = fit_climatology(temp[train], tr_days, mask3d)

    xr.Dataset({"temp": (("time", "depth", "lat", "lon"), temp)},
               coords={"time": times, "depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS},
               attrs=target.attrs).to_zarr(PROCESSED_DIR / "target.zarr", mode="w",
                                            encoding={"temp": {"chunks": (8, 15, 100, 240)}})
    xr.Dataset({"ocean_mask3d": (("depth", "lat", "lon"), mask3d)},
               coords={"depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS}).to_zarr(PROCESSED_DIR / "static.zarr", mode="w")
    xr.Dataset({"coef": (("harmonic", "depth", "lat", "lon"), coef)},
               coords={"depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS},
               attrs={"description": "T(doy) = c0 + sum_k a_k cos(k w) + b_k sin(k w), w = 2 pi doy/365.25; "
                                     f"fitted on train years {list(TRAIN_YEARS)} only"}).to_zarr(
        PROCESSED_DIR / "climatology.zarr", mode="w")
    (PROCESSED_DIR / "norm_stats.json").write_text(json.dumps(stats, indent=2))
    split_counts = pd.Series([split_of_year(y) for y in times.year]).value_counts().to_dict()
    summary = {"target_days": len(days), "split_counts": split_counts,
               "ocean_cells_surface": int(mask3d[0].sum()), "ocean_cells_1000m": int(mask3d[-1].sum()),
               "target_source": target.attrs.get("prov_product")}
    (PROCESSED_DIR / "assemble_summary.json").write_text(json.dumps(summary, indent=2))
    return summary


class Dataset:
    """In-memory arrays for model training/evaluation, built from the processed Zarr stores."""

    def __init__(self):
        self.inputs = xr.open_zarr(PROCESSED_DIR / "inputs.zarr")
        self.target = xr.open_zarr(PROCESSED_DIR / "target.zarr")
        self.mask3d = xr.open_zarr(PROCESSED_DIR / "static.zarr")["ocean_mask3d"].values
        self.ocean = self.inputs["ocean_mask"].values
        self.coef = xr.open_zarr(PROCESSED_DIR / "climatology.zarr")["coef"].values
        self.stats = json.loads((PROCESSED_DIR / "norm_stats.json").read_text())
        self.times = pd.DatetimeIndex(self.target.time.values)
        self.splits = np.array([split_of_year(y) for y in self.times.year])
        self.tmean = np.array([self.stats["target"][str(int(z))]["mean"] for z in STANDARD_DEPTHS], np.float32)
        self.tstd = np.array([self.stats["target"][str(int(z))]["std"] for z in STANDARD_DEPTHS], np.float32)

    def features(self, times) -> np.ndarray:
        sel = self.inputs.sel(time=pd.DatetimeIndex(times).values)
        return make_features({v: sel[v].values for v in INPUT_VARS}, times, self.stats, self.ocean)

    def split(self, name: str):
        idx = np.where(self.splits == name)[0]
        times = self.times[idx]
        y = self.target["temp"].isel(time=idx).values
        return times, self.features(times), y, climatology_for(times, self.coef)
