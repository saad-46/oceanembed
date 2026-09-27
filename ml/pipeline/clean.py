"""Cleaning + transformation of the five surface inputs (docs/09 Cleaning/Transformation).

For each source: unit harmonisation -> physical-range flagging (logged, set to NaN,
never silently kept) -> de-duplication of timestamps -> reindex onto the full daily
calendar -> regrid onto the common 0.25 deg grid -> gap filling (temporal linear
interpolation up to MAX_GAP_DAYS, then nearest-valid-neighbour in space). Every
fill is counted and written to the Zarr attrs and a JSON QC report so nothing is
filled invisibly.
"""
from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import numpy as np
import pandas as pd
import xarray as xr
from scipy import ndimage

from ml.config import LATS, LONS, PROCESSED_DIR
from ml.pipeline.regrid import bilinear_to_target, coarsen_to_target

log = logging.getLogger("oceanembed.clean")

MAX_GAP_DAYS = 7
# Physically plausible ranges (docs/09): values outside are flagged and dropped.
VALID_RANGE = {
    "sst": (-2.0, 40.0),     # degC
    "sss": (0.0, 45.0),      # PSU
    "sla": (-2.0, 2.0),      # m
    "ucur": (-5.0, 5.0),     # m/s
    "vcur": (-5.0, 5.0),
    "uwind": (-60.0, 60.0),  # m/s
    "vwind": (-60.0, 60.0),
}
SOURCE_VARS = {"sst": ["sst"], "sss": ["sss"], "sla": ["sla"], "currents": ["ucur", "vcur"], "winds": ["uwind", "vwind"]}


def _adapters():
    from ml.ingestion import fetch_currents, fetch_sla, fetch_sss, fetch_sst, fetch_winds

    return {"sst": fetch_sst.get_adapter(), "sss": fetch_sss.get_adapter(), "sla": fetch_sla.get_adapter(),
            "currents": fetch_currents.get_adapter(), "winds": fetch_winds.get_adapter()}


def harmonise_units(name: str, da: xr.DataArray) -> xr.DataArray:
    units = str(da.attrs.get("units", "")).lower()
    if name == "sst" and (units in ("k", "kelvin") or float(da.mean(skipna=True)) > 200):
        da = da - 273.15
    if name == "sla" and units in ("cm",):
        da = da / 100.0
    return da


def flag_invalid(name: str, arr: np.ndarray) -> tuple[np.ndarray, int]:
    lo, hi = VALID_RANGE[name]
    bad = np.isfinite(arr) & ((arr < lo) | (arr > hi))
    n = int(bad.sum())
    if n:
        log.warning("%s: %d physically implausible values flagged -> NaN", name, n)
        arr = np.where(bad, np.nan, arr)
    return arr, n


def fill_gaps(arr: np.ndarray, ocean: np.ndarray, max_gap: int = MAX_GAP_DAYS) -> tuple[np.ndarray, dict]:
    """Temporal linear interpolation (<= max_gap days) then nearest-neighbour in space, ocean cells only."""
    before = int((~np.isfinite(arr[:, ocean])).sum())
    s = pd.DataFrame(arr.reshape(arr.shape[0], -1))
    s = s.interpolate(axis=0, limit=max_gap, limit_direction="both")
    arr = s.to_numpy(dtype=np.float32).reshape(arr.shape)
    after_time = int((~np.isfinite(arr[:, ocean])).sum())
    for t in range(arr.shape[0]):
        f = arr[t]
        miss = ~np.isfinite(f)
        if miss[ocean].any() and (~miss).any():
            _, (ii, jj) = ndimage.distance_transform_edt(miss, return_indices=True)
            f = np.where(miss & ocean, f[ii, jj], f)
            arr[t] = f
    arr[:, ~ocean] = np.nan
    return arr, {"missing_ocean_values": before, "filled_temporal": before - after_time,
                 "filled_spatial": after_time}


def regrid_source(ds: xr.Dataset, var: str) -> np.ndarray:
    lat, lon = ds["lat"].values, ds["lon"].values
    spacing = float(np.abs(np.diff(lat)).mean())
    data = ds[var].values
    if spacing < 0.2:  # finer than target -> area-weighted coarsening
        return coarsen_to_target(data, lat, lon)
    return bilinear_to_target(data, lat, lon)


def process_source(key: str, adapter, days: pd.DatetimeIndex) -> dict:
    ds = adapter.fetch(days[0].date(), days[-1].date())
    ds = ds.sortby("time")
    _, uniq = np.unique(ds["time"].values, return_index=True)
    n_dupes = ds.sizes["time"] - uniq.size
    ds = ds.isel(time=uniq)
    ds = ds.reindex(time=days)  # absent days (product gaps) become NaN, filled below
    out = {}
    for var in SOURCE_VARS[key]:
        da = harmonise_units(var, ds[var])
        grid = regrid_source(da.to_dataset(name=var), var)
        grid, n_bad = flag_invalid(var, grid)
        out[var] = {"data": grid, "n_invalid": n_bad, "n_duplicate_times": int(n_dupes),
                    "n_missing_days": int(np.all(~np.isfinite(grid), axis=(1, 2)).sum()),
                    "provenance": {k: v for k, v in ds.attrs.items() if k.startswith("prov_")}}
    log.info("%s: ingested %d days from %s", key, len(days), adapter.provenance.product)
    return out


def build_inputs(start: date, end: date) -> xr.Dataset:
    days = pd.date_range(start, end, freq="D")
    adapters = _adapters()
    with ThreadPoolExecutor(max_workers=len(adapters)) as ex:
        results = dict(zip(adapters, ex.map(lambda k: process_source(k, adapters[k], days), adapters)))
    fields = {v: r for res in results.values() for v, r in res.items()}

    # Ocean mask: cells where SST is valid on most days (SST is the most complete field).
    sst = fields["sst"]["data"]
    ocean = np.isfinite(sst).mean(axis=0) > 0.5

    qc, data_vars = {}, {}
    for var, r in fields.items():
        filled, stats = fill_gaps(r["data"], ocean)
        qc[var] = {**stats, "n_invalid_flagged": r["n_invalid"], "n_duplicate_times": r["n_duplicate_times"],
                   "n_days_absent_in_source": r["n_missing_days"], **r["provenance"]}
        data_vars[var] = (("time", "lat", "lon"), filled.astype(np.float32), {"qc": json.dumps(qc[var])})
    ds = xr.Dataset(data_vars, coords={"time": days, "lat": LATS, "lon": LONS})
    ds["ocean_mask"] = (("lat", "lon"), ocean)
    ds.attrs["description"] = "OceanEmbed harmonised surface inputs, 0.25 deg daily, North Indian Ocean"
    out = PROCESSED_DIR / "inputs.zarr"
    ds.to_zarr(out, mode="w", encoding={v: {"chunks": (32, 100, 240)} for v in fields})
    (PROCESSED_DIR / "inputs_qc.json").write_text(json.dumps(qc, indent=2))
    log.info("wrote %s (%s)", out, dict(ds.sizes))
    return ds
