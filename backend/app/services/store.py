"""Read-only access to the precomputed Zarr stores written by ``ml.inference.precompute``.

Nothing here runs a model: the API serves cached reconstructions only (docs/13 design
notes). Day cubes are LRU-cached in memory so scrubbing depths/dates during a demo
never re-reads disk (docs/11 section 5).
"""
from __future__ import annotations

import json
import logging
import threading
from collections import OrderedDict
from datetime import date
from functools import cached_property
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from ml.config import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, STANDARD_DEPTHS, in_domain, nearest_cell
from ml.pipeline.feature_engineering import climatology_for

from app.config import Settings, get_settings
from app.errors import date_out_of_range, data_unavailable, invalid_depth, on_land, out_of_domain

log = logging.getLogger("oceanembed.store")
MAX_NEAREST_GAP_DAYS = 7


class LRU(OrderedDict):
    def __init__(self, size: int):
        super().__init__()
        self.size, self.lock = size, threading.Lock()

    def get_or(self, key, fn):
        with self.lock:
            if key in self:
                self.move_to_end(key)
                return self[key]
        val = fn()
        with self.lock:
            self[key] = val
            while len(self) > self.size:
                self.popitem(last=False)
        return val


class GridStore:
    def __init__(self, settings: Settings | None = None):
        self.s = settings or get_settings()
        self.cache = LRU(self.s.grid_cache_days)

    # ---------- discovery
    @cached_property
    def registry(self) -> list[dict]:
        p = self.s.outputs_dir / "model_registry.json"
        return json.loads(p.read_text()) if p.exists() else []

    @cached_property
    def predictions(self) -> dict[str, xr.Dataset]:
        d = self.s.outputs_dir / "predictions"
        return {p.stem: xr.open_zarr(p) for p in sorted(d.glob("*.zarr"))} if d.exists() else {}

    @cached_property
    def products(self) -> dict[str, xr.Dataset]:
        d = self.s.outputs_dir / "products"
        return {p.stem: xr.open_zarr(p) for p in sorted(d.glob("*.zarr"))} if d.exists() else {}

    @cached_property
    def production_model(self) -> str:
        if self.s.model_version and self.s.model_version in self.predictions:
            return self.s.model_version
        prod = [r["name"] for r in self.registry if r.get("is_production") and r["name"] in self.predictions]
        if prod:
            return prod[0]
        if self.predictions:
            return next(iter(self.predictions))
        raise data_unavailable("No precomputed reconstruction found. Run `python -m ml.inference.precompute`.")

    @cached_property
    def sigma_calibration(self) -> np.ndarray | None:
        """Per-depth additive term a_k (degC) fitted on validation-year Argo (ml/evaluation/calibrate_uncertainty.py)."""
        c = self.json_output("uncertainty_calibration.json")
        return None if c is None else np.array([r["a_c"] for r in c["per_depth"]], dtype=np.float32)

    @cached_property
    def mask3d(self) -> np.ndarray:
        return xr.open_zarr(self.s.processed_dir / "static.zarr")["ocean_mask3d"].values

    @cached_property
    def clim_coef(self) -> np.ndarray | None:
        p = self.s.processed_dir / "climatology.zarr"
        return xr.open_zarr(p)["coef"].values if p.exists() else None

    # ---------- surface inputs, observations and optional stores (read-only, precomputed)
    @cached_property
    def inputs(self) -> xr.Dataset | None:
        """Harmonised satellite surface fields on the model grid (ml.pipeline.clean), when deployed."""
        p = self.s.processed_dir / "inputs.zarr"
        return xr.open_zarr(p) if p.exists() else None

    @cached_property
    def salinity3d(self) -> xr.Dataset | None:
        """Optional GLORYS12V1 salinity/potential temperature on the standard grid (reanalysis)."""
        p = self.s.processed_dir / "salinity.zarr"
        return xr.open_zarr(p) if p.exists() else None

    @cached_property
    def argo_table(self) -> pd.DataFrame | None:
        """Argo profiles as built by the pipeline; used when the database is not reachable."""
        p = self.s.processed_dir / "argo_profiles.parquet"
        if not p.exists():
            return None
        df = pd.read_parquet(p)
        df["profile_date"] = pd.to_datetime(df["profile_date"])
        return df.reset_index(drop=True)

    def processed_json(self, name: str):
        p = self.s.processed_dir / name
        return json.loads(p.read_text()) if p.exists() else None

    def surface(self, d: date, var: str) -> np.ndarray:
        """One day of a harmonised surface input (lat, lon); land is NaN."""
        ds = self.inputs
        if ds is None or var not in ds:
            raise data_unavailable(f"surface field '{var}' is not deployed with this service")

        def load():
            t = pd.Timestamp(d)
            if t not in pd.DatetimeIndex(ds.time.values):
                raise date_out_of_range(f"no surface data for {d}")
            a = ds[var].sel(time=t).values.astype(np.float32)
            mask = ds["ocean_mask"].values if "ocean_mask" in ds else self.mask3d[0]
            return np.where(mask, a, np.nan).astype(np.float32)
        return self.cache.get_or(("surface", var, d), load)

    @cached_property
    def target(self) -> xr.Dataset | None:
        p = self.s.processed_dir / "target.zarr"
        return xr.open_zarr(p) if p.exists() else None

    def times(self, model: str) -> pd.DatetimeIndex:
        return pd.DatetimeIndex(self._ds(model).time.values)

    def model_names(self) -> list[str]:
        return ["climatology", *self.predictions.keys()] if self.clim_coef is not None else list(self.predictions)

    def json_output(self, name: str):
        p = self.s.outputs_dir / name
        return json.loads(p.read_text()) if p.exists() else None

    # ---------- validation helpers
    def _ds(self, model: str) -> xr.Dataset:
        if model not in self.predictions:
            from app.errors import ApiError
            raise ApiError(422, "unknown_model", f"model '{model}' not available; choose from {self.model_names()}")
        return self.predictions[model]

    @staticmethod
    def depth_index(depth: float) -> int:
        k = np.where(np.isclose(STANDARD_DEPTHS, depth))[0]
        if not k.size:
            raise invalid_depth(depth, STANDARD_DEPTHS)
        return int(k[0])

    def cell(self, lat: float, lon: float, require_ocean: bool = True) -> tuple[int, int]:
        if not in_domain(lat, lon):
            raise out_of_domain(lat, lon)
        i, j = nearest_cell(lat, lon)
        if require_ocean and not self.mask3d[0, i, j]:
            raise on_land(lat, lon)
        return i, j

    def resolve_date(self, d: date, model: str | None = None) -> tuple[date, str | None]:
        """Exact date if cached, else the nearest cached day (<= 7 days away) with a notice."""
        model = model or self.production_model
        ts = self.times(model if model != "climatology" else self.production_model)
        t = pd.Timestamp(d)
        if t < ts[0] - pd.Timedelta(days=MAX_NEAREST_GAP_DAYS) or t > ts[-1] + pd.Timedelta(days=MAX_NEAREST_GAP_DAYS):
            raise date_out_of_range(f"{d} is outside the reconstructed period {ts[0].date()}..{ts[-1].date()}.")
        k = int(np.argmin(np.abs((ts - t).days)))
        used = ts[k].date()
        if used == d:
            return used, None
        if abs((ts[k] - t).days) > MAX_NEAREST_GAP_DAYS:
            raise date_out_of_range(f"No reconstruction within {MAX_NEAREST_GAP_DAYS} days of {d}.")
        gap = (d - used).days
        return used, (f"Data unavailable for {d} — showing nearest available day, {used} "
                      f"({abs(gap)} day{'s' if abs(gap) != 1 else ''} {'prior' if gap > 0 else 'later'}).")

    # ---------- data access
    def cube(self, model: str, d: date) -> dict[str, np.ndarray]:
        """(15, lat, lon) arrays for a day: temp (+ sigma)."""
        if model == "climatology":
            return {"temp": self.climatology(d)}

        def load():
            ds = self._ds(model).sel(time=pd.Timestamp(d))
            out = {"temp": ds["temp"].values.astype(np.float32)}
            if "sigma" in ds:
                sig = ds["sigma"].values.astype(np.float32)
                a = self.sigma_calibration
                # serve uncertainty vs the real ocean: sqrt(sigma_model^2 + a_k^2)
                out["sigma"] = sig if a is None else np.sqrt(sig**2 + a[:, None, None] ** 2).astype(np.float32)
            return out
        return self.cache.get_or((model, d), load)

    def climatology(self, d: date) -> np.ndarray:
        if self.clim_coef is None:
            raise data_unavailable("Climatology baseline not available.")
        return self.cache.get_or(("climatology", d), lambda: np.where(
            self.mask3d, climatology_for(pd.DatetimeIndex([d]), self.clim_coef)[0], np.nan).astype(np.float32))

    def product_grid(self, d: date, product: str) -> np.ndarray:
        ds = self.products.get(self.production_model)
        if ds is None or product not in ds:
            raise data_unavailable(f"derived product '{product}' not precomputed")
        return self.cache.get_or(("prod", product, d), lambda: ds[product].sel(time=pd.Timestamp(d)).values.astype(np.float32))

    def target_profile(self, d: date, i: int, j: int) -> np.ndarray | None:
        if self.target is None:
            return None
        ts = pd.DatetimeIndex(self.target.time.values)
        if pd.Timestamp(d) not in ts:
            return None
        return self.target["temp"].sel(time=pd.Timestamp(d)).isel(lat=i, lon=j).values.astype(np.float32)

    @staticmethod
    def bbox_ok(min_lat, max_lat, min_lon, max_lon) -> bool:
        return LAT_MIN <= min_lat < max_lat <= LAT_MAX and LON_MIN <= min_lon < max_lon <= LON_MAX


_store: GridStore | None = None


def get_store() -> GridStore:
    global _store
    if _store is None:
        _store = GridStore()
    return _store


def reset_store(settings: Settings | None = None) -> GridStore:
    """Used by tests to point the store at a fixture data dir."""
    global _store
    _store = GridStore(settings)
    return _store


def round_or_none(a, nd=2):
    a = np.asarray(a, dtype=float)
    return [None if not np.isfinite(v) else round(float(v), nd) for v in a.ravel()]


def grid_to_lists(a: np.ndarray, nd=2) -> list[list[float | None]]:
    a = np.asarray(a, dtype=float)
    r = np.round(a, nd).astype(object)
    r[~np.isfinite(a)] = None
    return r.tolist()


def data_dir_ok(path: Path) -> bool:
    return (path / "outputs" / "predictions").exists()
