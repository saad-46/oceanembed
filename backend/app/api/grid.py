"""Map / profile / region endpoints."""
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
from app.errors import ApiError, data_unavailable
from app.services import argo as argo_q
from app.services.store import LRU, GridStore, get_store, grid_to_lists, round_or_none
from ml.pipeline.feature_engineering import climatology_for

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
        "classification": {"temp": "reconstructed", "uncertainty": "estimated", "anomaly": "derived"}[variable],
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
    meta = _meta(store, store.production_model, notice)
    if product == "sss":  # the SSS layer is the satellite model input, not a reconstruction
        meta["source"] = "satellite_input"
    return {"date": str(used), "requested_date": str(day), "product": product, "units": units,
            "classification": "satellite" if product == "sss" else "derived",
            "grid": {"lat": LATS.tolist(), "lon": LONS.tolist(), "values": grid_to_lists(values, 1 if product != "sss" else 2)},
            "stats": {"min": round(float(finite.min()), 1), "max": round(float(finite.max()), 1),
                      "mean": round(float(finite.mean()), 1)} if finite.size else None,
            **meta}


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
    """Region-aggregated derived products. Barrier-layer flag is an SSS-based proxy."""
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


@router.get("/section/{day}")
def section(day: date,
            orientation: Literal["zonal", "meridional"] = "zonal",
            lat: float = Query(15.0, ge=5, le=30), lon_min: float = Query(80.0, ge=45, le=105),
            lon_max: float = Query(97.0, ge=45, le=105),
            lon: float = Query(88.0, ge=45, le=105), lat_min: float = Query(5.0, ge=5, le=30),
            lat_max: float = Query(22.0, ge=5, le=30),
            variable: Literal["temp", "anomaly", "uncertainty"] = "temp",
            store: GridStore = Depends(get_store)):
    """Vertical section (15 depths x distance) of the reconstruction.

    zonal: along one latitude row from lon_min to lon_max; meridional: along one longitude
    column from lat_min to lat_max. Values are exactly the reconstructed grid cells (no
    horizontal interpolation); land/shallow cells are null.
    """
    if orientation == "zonal" and lon_min >= lon_max:
        raise ApiError(422, "invalid_request", "lon_min must be < lon_max")
    if orientation == "meridional" and lat_min >= lat_max:
        raise ApiError(422, "invalid_request", "lat_min must be < lat_max")
    used, notice = store.resolve_date(day)
    cube = store.cube(store.production_model, used)
    if variable == "uncertainty" and "sigma" not in cube:
        raise ApiError(422, "uncertainty_unavailable", "the production model has no uncertainty head")
    full = {"temp": cube["temp"], "uncertainty": cube.get("sigma"),
            "anomaly": cube["temp"] - store.climatology(used) if variable == "anomaly" else None}[variable]
    if orientation == "zonal":
        i = int(np.clip(np.floor((lat - LATS[0] + 0.125) / 0.25), 0, LATS.size - 1))
        jj = np.where((LONS >= lon_min) & (LONS <= lon_max))[0]
        vals, x, fixed = full[:, i, jj], LONS[jj], {"lat": float(LATS[i]), "lon": LONS[jj].tolist()}
    else:
        j = int(np.clip(np.floor((lon - LONS[0] + 0.125) / 0.25), 0, LONS.size - 1))
        ii = np.where((LATS >= lat_min) & (LATS <= lat_max))[0]
        vals, x, fixed = full[:, ii, j], LATS[ii], {"lon": float(LONS[j]), "lat": LATS[ii].tolist()}
    if x.size < 2:
        raise ApiError(422, "invalid_request", "transect must span at least two grid cells (0.25 deg apart)")
    out = {"date": str(used), "requested_date": str(day), "orientation": orientation, "variable": variable,
           "units": "°C", "x": x.tolist(), "x_name": "lon" if orientation == "zonal" else "lat",
           "depths_m": STANDARD_DEPTHS.tolist(), "values": grid_to_lists(vals), **fixed,
           **_meta(store, store.production_model, notice)}
    if variable == "temp":
        out["temperature_c"] = out["values"]  # backwards-compatible key used by the landing section
    return out


# ---------- Ocean State Timeline: the full column at one point through time
TIMELINE_MAX_SAMPLES = 400        # ~1.1 years daily, or the whole 2019-2023 record at a 5-day stride
_timeline_cache = LRU(64)


@router.get("/timeline")
def timeline(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=360),
             start: date | None = None, end: date | None = None,
             stride_days: int | None = Query(None, ge=1, le=31),
             store: GridStore = Depends(get_store)):
    """Reconstructed temperature at the 15 standard depths through time at one grid cell, with the
    derived MLD / D20 / D26 and the seasonal climatology (for anomalies). Read-only, cached.

    The range is clipped to the reconstructed period (with a notice). Without `stride_days` the
    stride is chosen so at most TIMELINE_MAX_SAMPLES days are returned; an explicit stride that
    would exceed that limit is rejected with `range_too_large`.
    """
    i, j = store.cell(lat, lon)
    model = store.production_model
    ts = store.times(model)
    t0 = pd.Timestamp(start) if start else ts[-1] - pd.Timedelta(days=364)
    t1 = pd.Timestamp(end) if end else ts[-1]
    if t0 > t1:
        raise ApiError(422, "invalid_range", f"start ({t0.date()}) must not be after end ({t1.date()})")
    if t1 < ts[0] or t0 > ts[-1]:
        raise ApiError(404, "date_out_of_range",
                       f"{t0.date()}..{t1.date()} is outside the reconstructed period {ts[0].date()}..{ts[-1].date()}.")
    notice = None
    if t0 < ts[0] or t1 > ts[-1]:
        notice = f"Range clipped to the reconstructed period {ts[0].date()}..{ts[-1].date()}."
    sel = np.where((ts >= max(t0, ts[0])) & (ts <= min(t1, ts[-1])))[0]
    auto = int(np.ceil(sel.size / TIMELINE_MAX_SAMPLES))
    if stride_days is not None and sel.size / stride_days > TIMELINE_MAX_SAMPLES:
        raise ApiError(422, "range_too_large",
                       f"{sel.size} days at a {stride_days}-day stride exceeds {TIMELINE_MAX_SAMPLES} samples; "
                       f"use stride_days >= {auto} or a shorter range.")
    stride = stride_days or max(1, auto)
    idx = sel[::stride]
    if idx.size == 0:
        raise data_unavailable("No reconstructed days in the requested range.")

    def load():
        times = ts[idx]
        temp = store.predictions[model]["temp"].isel(time=idx, lat=i, lon=j).values.astype(np.float32)  # (n, 15)
        prods = store.products.get(model)
        derived = {}
        for v in ("mld", "d20", "d26"):
            derived[v] = (prods[v].sel(time=times).isel(lat=i, lon=j).values.astype(np.float32)
                          if prods is not None and v in prods else np.full(idx.size, np.nan, np.float32))
        clim = (np.where(store.mask3d[:, i, j][None], climatology_for(times, store.clim_coef[:, :, i:i + 1, j:j + 1])[:, :, 0, 0], np.nan)
                if store.clim_coef is not None else None)
        return times, temp, derived, clim

    times, temp, derived, clim = _timeline_cache.get_or((model, i, j, int(idx[0]), int(idx[-1]), stride), load)
    return {
        "lat": lat, "lon": lon, "cell": {"lat": float(LATS[i]), "lon": float(LONS[j])},
        "start": str(times[0].date()), "end": str(times[-1].date()),
        "requested_start": str(t0.date()), "requested_end": str(t1.date()), "stride_days": stride,
        "dates": [str(t.date()) for t in times], "depths_m": STANDARD_DEPTHS.tolist(),
        "temperature_c": grid_to_lists(temp.T), "climatology_c": grid_to_lists(clim.T) if clim is not None else None,
        "mld_m": round_or_none(derived["mld"], 1), "d20_m": round_or_none(derived["d20"], 1),
        "d26_m": round_or_none(derived["d26"], 1), "units": "°C", "max_samples": TIMELINE_MAX_SAMPLES,
        **_meta(store, model, notice),
    }


@router.get("/dates")
def available_dates(store: GridStore = Depends(get_store)):
    ts = store.times(store.production_model)
    return {"start": str(ts[0].date()), "end": str(ts[-1].date()), "n_days": len(ts),
            "missing": [str(d.date()) for d in pd.date_range(ts[0], ts[-1]).difference(ts)][:500]}
