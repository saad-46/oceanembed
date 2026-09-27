"""Map / profile / region endpoints (docs/13 "Data / Map")."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.orm import Session

from ml.config import LATS, LONS, STANDARD_DEPTHS
from ml.evaluation.derived_products import BARRIER_SSS_THRESHOLD, all_products, barrier_prone_fraction

from app.db.session import get_db
from app.errors import ApiError
from app.services import argo as argo_q
from app.services.store import GridStore, get_store, grid_to_lists, round_or_none

router = APIRouter(prefix="/v1", tags=["data"])
PRODUCTS = {"tchp": ("tchp", "kJ/cm²"), "mld": ("mld", "m"), "d20": ("d20", "m"), "d26": ("d26", "m"),
            "sss": ("sss", "PSU")}


def _meta(store: GridStore, model: str, notice: str | None):
    return {"source": "cached_reconstruction", "data_label": "cached", "model_version": model, "notice": notice}


@router.get("/grid/{day}")
def grid(day: date, depth: float = 0, variable: Literal["temp", "uncertainty", "anomaly"] = "temp",
         model: str | None = None, store: GridStore = Depends(get_store)):
    """Reconstructed temperature / uncertainty / anomaly-vs-climatology grid for one depth."""
    model = model or store.production_model
    k = store.depth_index(depth)
    used, notice = store.resolve_date(day, model)
    cube = store.cube(model, used)
    if variable == "temp":
        values = cube["temp"][k]
    elif variable == "uncertainty":
        if "sigma" not in cube:
            raise ApiError(422, "uncertainty_unavailable", f"model '{model}' has no uncertainty head")
        values = cube["sigma"][k]
    else:
        values = cube["temp"][k] - store.climatology(used)[k]
    finite = values[np.isfinite(values)]
    return {
        "date": str(used), "requested_date": str(day), "depth_m": float(STANDARD_DEPTHS[k]), "variable": variable,
        "units": "°C", "grid": {"lat": LATS.tolist(), "lon": LONS.tolist(), "values": grid_to_lists(values)},
        "stats": {"min": round(float(finite.min()), 2), "max": round(float(finite.max()), 2),
                  "mean": round(float(finite.mean()), 2)} if finite.size else None,
        **_meta(store, model, notice),
    }


@router.get("/grid/{day}/product")
def product_grid(day: date, product: Literal["tchp", "mld", "d20", "d26", "sss"] = "tchp",
                 store: GridStore = Depends(get_store)):
    """Derived-product map (TCHP / MLD / D20 / D26) computed from the reconstruction, or the SSS input."""
    used, notice = store.resolve_date(day)
    var, units = PRODUCTS[product]
    values = store.product_grid(used, var)
    finite = values[np.isfinite(values)]
    return {"date": str(used), "requested_date": str(day), "product": product, "units": units,
            "grid": {"lat": LATS.tolist(), "lon": LONS.tolist(), "values": grid_to_lists(values, 1)},
            "stats": {"min": round(float(finite.min()), 1), "max": round(float(finite.max()), 1),
                      "mean": round(float(finite.mean()), 1)} if finite.size else None,
            **_meta(store, store.production_model, notice)}


def _products_dict(profile: np.ndarray) -> dict:
    p = all_products(np.asarray(profile, dtype=float)[:, None])
    return {k: (None if not np.isfinite(v[0]) else round(float(v[0]), 1)) for k, v in p.items()}


def build_profile(store: GridStore, db: Session | None, day: date, lat: float, lon: float) -> dict:
    i, j = store.cell(lat, lon)
    model = store.production_model
    used, notice = store.resolve_date(day, model)
    cube = store.cube(model, used)
    temp = cube["temp"][:, i, j]
    out = {
        "date": str(used), "requested_date": str(day), "lat": lat, "lon": lon,
        "cell": {"lat": float(LATS[i]), "lon": float(LONS[j])},
        "depths_m": STANDARD_DEPTHS.tolist(),
        "temperature_c": round_or_none(temp),
        "uncertainty_c": round_or_none(cube["sigma"][:, i, j]) if "sigma" in cube else None,
        "baseline_climatology_c": round_or_none(store.climatology(used)[:, i, j]),
        "derived": _products_dict(temp),
        "comparisons": {},
        **_meta(store, model, notice),
    }
    for other in store.predictions:
        if other != model:
            out["comparisons"][other] = round_or_none(store.cube(other, used)["temp"][:, i, j])
    tgt = store.target_profile(used, i, j)
    out["target_product_c"] = round_or_none(tgt) if tgt is not None else None
    out["nearest_argo_float"], out["argo_lookup"] = None, "ok"
    if db is not None:
        try:
            out["nearest_argo_float"] = argo_q.nearest_float(db, lat, lon, used)
        except (OperationalError, InterfaceError):
            out["argo_lookup"] = "database_unavailable"  # the reconstruction itself is still served
    return out


@router.get("/profile/{day}")
def profile(day: date, lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=360),
            store: GridStore = Depends(get_store), db: Session = Depends(get_db)):
    """Full 15-depth profile at a point, with uncertainty, baselines, derived products and nearest Argo float."""
    return build_profile(store, db, day, lat, lon)


@router.get("/profile/{day}/{lat}/{lon}", include_in_schema=False)
def profile_path(day: date, lat: float, lon: float, store: GridStore = Depends(get_store), db: Session = Depends(get_db)):
    return build_profile(store, db, day, lat, lon)


class BBox(BaseModel):
    min_lat: float = Field(ge=5, le=30)
    max_lat: float = Field(ge=5, le=30)
    min_lon: float = Field(ge=45, le=105)
    max_lon: float = Field(ge=45, le=105)

    @model_validator(mode="after")
    def _order(self):
        if self.min_lat >= self.max_lat or self.min_lon >= self.max_lon:
            raise ValueError("bbox min must be < max")
        return self

    def mask(self):
        lat2, lon2 = np.meshgrid(LATS, LONS, indexing="ij")
        return (lat2 >= self.min_lat) & (lat2 <= self.max_lat) & (lon2 >= self.min_lon) & (lon2 <= self.max_lon)


class RegionStatsRequest(BaseModel):
    date: date
    bbox: BBox


@router.post("/region/stats")
def region_stats(req: RegionStatsRequest, store: GridStore = Depends(get_store)):
    """Region-aggregated derived products (docs/13). Barrier-layer flag is an SSS-based proxy."""
    used, notice = store.resolve_date(req.date)
    m = req.bbox.mask() & store.mask3d[0]
    n = int(m.sum())
    if n == 0:
        raise ApiError(422, "no_ocean_cells", "The selected box contains no ocean cells.")
    if n > store.s.max_region_cells:
        raise ApiError(422, "region_too_large", "Region too large — try a smaller area.")
    vals = {p: store.product_grid(used, p)[m] for p in ("tchp", "mld", "d20", "d26")}
    sss = store.product_grid(used, "sss")[m]
    temp = store.cube(store.production_model, used)["temp"][:, m]
    mean = lambda a: None if not np.isfinite(a).any() else round(float(np.nanmean(a)), 1)
    frac = barrier_prone_fraction(sss)
    return {
        "date": str(used), "requested_date": str(req.date), "n_ocean_cells": n,
        "mean_tchp_kj_cm2": mean(vals["tchp"]), "max_tchp_kj_cm2": None if not np.isfinite(vals["tchp"]).any() else round(float(np.nanmax(vals["tchp"])), 1),
        "mean_mld_m": mean(vals["mld"]), "mean_d20_m": mean(vals["d20"]), "mean_d26_m": mean(vals["d26"]),
        "frac_cells_tchp_gt_50": None if not np.isfinite(vals["tchp"]).any() else round(float(np.nanmean(vals["tchp"] > 50)), 3),
        "mean_sst_c": mean(temp[0]),
        "mean_profile_c": [mean(temp[k]) for k in range(temp.shape[0])],
        "barrier_layer_flag": bool(frac > 0.25) if np.isfinite(frac) else None,
        "barrier_layer_proxy": {"frac_cells_sss_below_threshold": None if not np.isfinite(frac) else round(frac, 3),
                                "sss_threshold_psu": BARRIER_SSS_THRESHOLD,
                                "note": "Proxy from satellite SSS (fresh surface water favours barrier layers); "
                                        "a true barrier-layer thickness needs a salinity profile."},
        **_meta(store, store.production_model, notice),
    }


class TimeseriesRequest(BaseModel):
    bbox: BBox
    start: date | None = None
    end: date | None = None
    stride_days: int = Field(5, ge=1, le=31)
    product: Literal["tchp", "mld", "d20", "d26"] = "tchp"


@router.post("/region/timeseries")
def region_timeseries(req: TimeseriesRequest, store: GridStore = Depends(get_store)):
    """Region-mean derived product over time (Analysis screen)."""
    ds = store.products.get(store.production_model)
    if ds is None:
        raise ApiError(503, "data_unavailable", "derived products not precomputed")
    ts = pd.DatetimeIndex(ds.time.values)
    start = pd.Timestamp(req.start) if req.start else ts[0]
    end = pd.Timestamp(req.end) if req.end else ts[-1]
    sel_t = ts[(ts >= start) & (ts <= end)][:: req.stride_days]
    if len(sel_t) > 800:
        raise ApiError(422, "range_too_long", "Too many time steps — increase stride_days or shorten the range.")
    m = req.bbox.mask() & store.mask3d[0]
    if not m.any():
        raise ApiError(422, "no_ocean_cells", "The selected box contains no ocean cells.")
    ii, jj = np.where(m)
    i0, i1, j0, j1 = ii.min(), ii.max() + 1, jj.min(), jj.max() + 1
    sub = ds[req.product].sel(time=sel_t).isel(lat=slice(i0, i1), lon=slice(j0, j1)).values
    msub = m[i0:i1, j0:j1]
    means = np.nanmean(np.where(msub[None], sub, np.nan), axis=(1, 2))
    return {"product": req.product, "units": PRODUCTS[req.product][1], "stride_days": req.stride_days,
            "dates": [str(t.date()) for t in sel_t], "values": round_or_none(means, 1),
            **_meta(store, store.production_model, None)}


@router.get("/dates")
def available_dates(store: GridStore = Depends(get_store)):
    ts = store.times(store.production_model)
    return {"start": str(ts[0].date()), "end": str(ts[-1].date()), "n_days": len(ts),
            "missing": [str(d.date()) for d in pd.date_range(ts[0], ts[-1]).difference(ts)][:500]}
