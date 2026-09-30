"""Stratification, temperature-salinity, short-horizon estimate and 3-D sampling endpoints.

Route handlers only validate, fetch and assemble; the science lives in ``ml.science``.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ml.config import LATS, LONS, STANDARD_DEPTHS
from ml.evaluation.derived_products import all_products
from ml.science import forecast as fc
from ml.science import seawater, stratification as strat, volume

from app.db.session import get_db
from app.errors import ApiError
from app.schemas import Forecast, Stratification, TSProfile, VolumeSample
from app.services import observations
from app.services.catalog import layer_status, prov
from app.services.store import GridStore, get_store, round_or_none

router = APIRouter(prefix="/v1", tags=["analysis"])

DIAGNOSTICS = {
    "mld": "Mixed-layer depth: the top layer kept nearly uniform by wind and convection (temperature 0.5 °C below its 10 m value).",
    "thermocline": "Thermocline: the depth where temperature falls fastest with depth (largest cooling rate), below the mixed layer.",
    "d20": "D20: depth of the 20 °C isotherm, a conventional proxy for the tropical thermocline; not identical to the gradient maximum.",
    "d26": "D26: depth of the 26 °C isotherm, the base of the warm layer counted in cyclone heat potential.",
    "halocline": "Halocline: the depth where salinity changes fastest with depth (measured Argo or reanalysis salinity only).",
    "barrier_layer": "Barrier layer: fresh-water stratification between the density mixed layer and the isothermal layer, from measured T and S.",
}


def _f(v, nd=1):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


def _merge_bins(z_t, v_t, z_s, v_s):
    """Temperature and salinity bins on their union of bin centres (None where a variable has no samples)."""
    z = np.union1d(z_t, z_s)
    tmap, smap = dict(zip(z_t.tolist(), v_t.tolist())), dict(zip(z_s.tolist(), v_s.tolist()))
    t = [_f(tmap.get(x), 3) for x in z.tolist()]
    s = [_f(smap.get(x), 3) for x in z.tolist()] if z_s.size else None
    return z, t, s


def _observed(prof: dict, lat: float, lon: float, max_depth: float, bin_depth: float) -> dict:
    """QC, 5 m binning, thermocline/halocline and TEOS-10 mixed layers for one native Argo profile."""
    zt, tt, qt = strat.qc_native(prof["depths_m"], prof["temperature_c"], "temperature")
    zb_t, tb = strat.bin_average(zt, tt, max_depth=bin_depth)
    qc = {"temperature": qt}
    zb_s, sb = np.array([]), np.array([])
    sal = prof.get("salinity_psu")
    if sal is not None and any(x is not None for x in sal):
        zs, ss, qs = strat.qc_native(prof["depths_m"], sal, "salinity")
        zb_s, sb = strat.bin_average(zs, ss, max_depth=bin_depth)
        qc["salinity"] = qs
    t_mld = seawater._first_exceed(zb_t, tb, 10.0, 0.5)
    thermo = strat.gradient_peak(zb_t, tb, variable="temperature", sense="decreasing", max_depth=max_depth, exclude_above=t_mld,
                                 max_layer_m=strat.MAX_NATIVE_GAP_M, min_strength=strat.T_MIN_GRADIENT,
                                 weak_strength=strat.T_WEAK_GRADIENT, unrealistic=strat.T_UNREALISTIC)
    thermo["method"] = ("Most negative dT/dz between 5 m bins of the measured profile, below its temperature mixed layer "
                        f"(0.5 °C criterion) and above {max_depth:g} m.")
    halo, mixed = None, None
    if zb_s.size >= strat.MIN_LEVELS:
        halo = strat.halocline(sb, zb_s, max_depth=max_depth, max_layer_m=strat.MAX_NATIVE_GAP_M)
        common = np.intersect1d(zb_t, zb_s)
        if common.size >= 3:
            t_c, s_c = tb[np.isin(zb_t, common)], sb[np.isin(zb_s, common)]
            sig = seawater.properties(common, t_c, s_c, lat, lon)["sigma0"]
            mixed = seawater.mixed_layers(common, t_c, sig)
    z, t, s = _merge_bins(zb_t, tb, zb_s, sb)
    return {"argo": prof["ref"], "bin_m": strat.BIN_M, "depths_m": [float(x) for x in z], "temperature_c": t,
            "salinity_psu": s, "thermocline": thermo, "halocline": halo, "mixed_layers": mixed, "qc": qc,
            "provenance": prov("argo", dataset=f"Argo float {prof['ref']['platform_number']} cycle {prof['ref']['cycle_number']}",
                               method="Argo QC flags 1/2; global-range and spike tests; 5 m bin averages")}


def _reanalysis_status(store: GridStore) -> tuple[str, str]:
    st = layer_status(store)["salinity_subsurface"]
    return st["status"], st["detail"]


def _reanalysis_column(store: GridStore, d: date, i: int, j: int) -> tuple[date, np.ndarray, np.ndarray] | None:
    ds = store.salinity3d
    ts = pd.DatetimeIndex(ds.time.values)
    k = int(np.argmin(np.abs((ts - pd.Timestamp(d)).days)))
    if abs((ts[k] - pd.Timestamp(d)).days) > 7:
        return None
    col = ds.isel(time=k, lat=i, lon=j)
    return ts[k].date(), col["so"].values.astype(float), col["thetao"].values.astype(float)


@router.get("/stratification", response_model=Stratification)
def stratification(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=360),
                   day: date = Query(..., alias="date"), max_depth: float = Query(500.0, ge=100, le=1000),
                   radius_km: float = Query(100.0, ge=10, le=300), window_days: int = Query(3, ge=0, le=10),
                   store: GridStore = Depends(get_store), db: Session = Depends(get_db)):
    """Thermocline from the reconstructed profile; thermocline, halocline and density mixed layer from the
    nearest measured Argo profile; halocline from the optional reanalysis salinity."""
    i, j = store.cell(lat, lon)
    model = store.production_model
    used, notice = store.resolve_date(day, model)
    cube = store.cube(model, used)
    temp = cube["temp"][:, i, j].astype(float)
    p = all_products(temp[:, None])
    mld = float(p["mld_m"][0]) if np.isfinite(p["mld_m"][0]) else None
    rec = {"depths_m": STANDARD_DEPTHS.tolist(), "temperature_c": round_or_none(temp),
           "uncertainty_c": round_or_none(cube["sigma"][:, i, j]) if "sigma" in cube else None,
           "thermocline": strat.thermocline(temp, max_depth=max_depth, mld=mld),
           "mld_m": _f(mld), "d20_m": _f(p["d20_m"][0]), "d26_m": _f(p["d26_m"][0]),
           "provenance": prov("thermocline", model_version=model)}
    prof, status, detail = observations.nearest_native(db, store, lat, lon, used, radius_km, window_days)
    observed = _observed(prof, lat, lon, max_depth, max_depth) if prof else None
    if observed and observed["salinity_psu"] is None:
        status, detail = "no_salinity", "The nearest Argo profile has no valid salinity; temperature only."
    rs, rd = _reanalysis_status(store)
    reana = None
    if store.salinity3d is not None:
        col = _reanalysis_column(store, used, i, j)
        if col is None:
            rs, rd = "no_data", "No reanalysis salinity within 7 days of this date."
        else:
            rday, so, th = col
            reana = {"date": str(rday), "depths_m": STANDARD_DEPTHS.tolist(), "salinity_psu": round_or_none(so, 3),
                     "potential_temperature_c": round_or_none(th), "halocline": strat.halocline(so, STANDARD_DEPTHS, max_depth=max_depth),
                     "provenance": prov("glorys_salinity")}
            rd = "GLORYS12V1 reanalysis salinity" + ("" if rday == used else f" from {rday} (nearest available)")
    return {"date": str(used), "requested_date": str(day), "lat": lat, "lon": lon,
            "cell": {"lat": float(LATS[i]), "lon": float(LONS[j])}, "max_depth_m": max_depth, "notice": notice,
            "reconstructed": rec, "observed": observed, "observed_status": {"status": status, "detail": detail},
            "reanalysis_salinity": reana, "reanalysis_status": {"status": rs, "detail": rd}, "diagnostics": DIAGNOSTICS}


def _ts_points(z, t, s, lat, lon) -> list[dict]:
    z, t, s = (np.asarray(a, float) for a in (z, t, s))
    ok = np.isfinite(z) & np.isfinite(t) & np.isfinite(s)
    if not ok.any():
        return []
    pr = seawater.properties(z[ok], t[ok], s[ok], lat, lon)
    return [{"depth_m": round(float(a), 1), "temperature_c": round(float(b), 3), "salinity_psu": round(float(c), 3),
             "potential_temperature_c": round(float(d), 3), "sigma0_kg_m3": round(float(e), 3)}
            for a, b, c, d, e in zip(z[ok], t[ok], s[ok], pr["potential_temperature"], pr["sigma0"])]


@router.get("/ts-profile", response_model=TSProfile)
def ts_profile(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=360),
               day: date = Query(..., alias="date"), radius_km: float = Query(100.0, ge=10, le=300),
               window_days: int = Query(3, ge=0, le=10), store: GridStore = Depends(get_store), db: Session = Depends(get_db)):
    """Temperature-salinity pairs (with TEOS-10 potential temperature and sigma0) from the nearest measured
    Argo profile and, when precomputed, the GLORYS reanalysis column; isopycnals for the plotted window."""
    i, j = store.cell(lat, lon)
    used, _ = store.resolve_date(day)
    prof, status, detail = observations.nearest_native(db, store, lat, lon, used, radius_km, window_days)
    observed = None
    if prof:
        o = _observed(prof, lat, lon, 1000.0, 2000.0)
        pts = _ts_points(o["depths_m"], o["temperature_c"], [np.nan if x is None else x for x in (o["salinity_psu"] or [None] * len(o["depths_m"]))], lat, lon)
        if pts:
            observed = {"label": f"Argo {prof['ref']['platform_number']} (measured)", "date": prof["ref"]["profile_date"][:10],
                        "points": pts, "argo": prof["ref"], "mixed_layers": o["mixed_layers"], "provenance": o["provenance"]}
        else:
            status, detail = "no_salinity", "The nearest Argo profile has no valid salinity, so no T-S pairs can be formed."
    rs, rd = _reanalysis_status(store)
    reana = None
    if store.salinity3d is not None:
        col = _reanalysis_column(store, used, i, j)
        if col is None:
            rs, rd = "no_data", "No reanalysis salinity within 7 days of this date."
        else:
            rday, so, th = col
            # GLORYS thetao is potential temperature; at the standard depths in-situ T is recovered by TEOS-10 for the points
            gsw = seawater._gsw()
            pr = gsw.p_from_z(-STANDARD_DEPTHS, lat)
            sa = gsw.SA_from_SP(so, pr, lon, lat)
            t_insitu = gsw.t_from_CT(sa, gsw.CT_from_pt(sa, th), pr)
            reana = {"label": "GLORYS12V1 (reanalysis)", "date": str(rday), "points": _ts_points(STANDARD_DEPTHS, t_insitu, so, lat, lon),
                     "provenance": prov("glorys_salinity")}
    allp = (observed["points"] if observed else []) + (reana["points"] if reana else [])
    iso = []
    if allp:
        s = [q["salinity_psu"] for q in allp]
        th = [q["potential_temperature_c"] for q in allp]
        ds, dt = max(0.2, (max(s) - min(s)) * 0.08), max(1.0, (max(th) - min(th)) * 0.08)
        iso = seawater.isopycnals((min(s) - ds, max(s) + ds), (min(th) - dt, max(th) + dt), lat, lon)
    return {"date": str(used), "lat": lat, "lon": lon, "observed": observed, "observed_status": {"status": status, "detail": detail},
            "reanalysis": reana, "reanalysis_status": {"status": rs, "detail": rd}, "isopycnals": iso,
            "axes": {"x": "Practical salinity (PSS-78)", "y": "Potential temperature θ (°C, referenced to 0 dbar)",
                     "contours": "σ0 = potential density − 1000 kg/m³ (TEOS-10)"},
            "reconstructed_note": ("OceanSight reconstructs temperature only; it has no salinity, so the reconstruction cannot be "
                                   "placed on a T-S diagram."),
            "method": ("TEOS-10 (gsw): pressure from depth, Absolute Salinity from practical salinity, potential temperature and "
                       "σ0; Argo levels pass QC flags 1/2 and the global-range and spike tests and are averaged in 5 m bins.")}


# ---------------------------------------------------------------- short-horizon estimate
METHOD_LABELS = {
    "trend": "Short-horizon estimate from the recent temporal trend: least-squares line through the last {w} reconstructed days, extrapolated.",
    "persistence": "Short-horizon estimate by persistence: the reconstructed column on the issue day carried forward.",
}
LIMITATIONS = [
    "Not a trained forecast model: a statistical extrapolation of OceanSight's own reconstruction at one grid cell.",
    "Uses only reconstructed days up to the issue date; it knows nothing about future winds, eddies or storms.",
    "The error is estimated from a hindcast of the same method over the preceding days at this cell and combined with the "
    "reconstruction's calibrated uncertainty; it is not a validated forecast-skill statistic.",
    "Limited to +1 and +2 days; skill decays quickly beyond that.",
]


@router.get("/forecast", response_model=Forecast)
def short_horizon(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=360),
                  day: date = Query(..., alias="date"), method: Literal["trend", "persistence"] = "trend",
                  window: int = Query(fc.DEFAULT_WINDOW, ge=5, le=30), store: GridStore = Depends(get_store)):
    """T+1 / T+2 day estimate of the reconstructed column issued on ``date`` (see LIMITATIONS)."""
    i, j = store.cell(lat, lon)
    model = store.production_model
    used, notice = store.resolve_date(day, model)
    ts = store.times(model)
    t_issue = int((pd.Timestamp(used) - ts[0]).days)
    tnum = np.asarray((ts - ts[0]).days, dtype=int)
    lo = t_issue - fc.DEFAULT_HINDCAST_DAYS - window - 2
    sel = np.where((tnum >= lo) & (tnum <= t_issue + max(fc.HORIZONS)))[0]
    series = store.predictions[model]["temp"].isel(time=sel, lat=i, lon=j).values.astype(float)  # (n, 15)
    tsel = tnum[sel]
    try:
        r = fc.estimate(tsel, series, t_issue, method=method, window=window)
    except fc.InsufficientHistory as e:
        raise ApiError(422, "insufficient_forecast_history",
                       f"Not enough reconstructed history before {used} at this point: {e}")
    cube = store.cube(model, used)
    sigma = cube["sigma"][:, i, j].astype(float) if "sigma" in cube else None
    horizons = []
    for h in fc.HORIZONS:
        est = r["horizons"][h]
        hc = r["hindcast"][h]
        rmse = hc[method]["rmse"]
        unc = np.sqrt(rmse ** 2 + (sigma ** 2 if sigma is not None else 0.0))
        target = used + timedelta(days=h)
        k = np.where(tsel == t_issue + h)[0]
        horizons.append({"horizon_days": h, "target_date": str(target), "temperature_c": round_or_none(est[method]),
                         "uncertainty_c": round_or_none(unc), "method_rmse_c": round_or_none(rmse, 3),
                         "persistence_c": round_or_none(est["persistence"]), "persistence_rmse_c": round_or_none(hc["persistence"]["rmse"], 3),
                         "n_hindcast_pairs": hc[method]["n_pairs"],
                         "verification_c": round_or_none(series[k[0]]) if k.size else None})
    win = tsel[(tsel <= t_issue) & (tsel > t_issue - window)]
    return {"issue_date": str(used), "requested_date": str(day), "lat": lat, "lon": lon,
            "cell": {"lat": float(LATS[i]), "lon": float(LONS[j])}, "depths_m": STANDARD_DEPTHS.tolist(), "method": method,
            "method_label": METHOD_LABELS[method].format(w=window), "window_days": window,
            "input_period": {"start": str((ts[0] + pd.Timedelta(days=int(win.min()))).date()), "end": str(used), "n_days": int(win.size)},
            "hindcast_days": fc.DEFAULT_HINDCAST_DAYS, "issue_temperature_c": round_or_none(series[tsel == t_issue][0]),
            "reconstruction_uncertainty_c": round_or_none(sigma) if sigma is not None else None,
            "horizons": horizons, "limitations": LIMITATIONS, "notice": notice,
            "provenance": prov("forecast", model_version=model, method=METHOD_LABELS[method].format(w=window))}


# ---------------------------------------------------------------- 3-D sampling
@router.get("/volume/sample", response_model=VolumeSample)
def volume_sample(day: date = Query(..., alias="date"), min_lat: float = Query(5.0, ge=5, le=30), max_lat: float = Query(22.0, ge=5, le=30),
                  min_lon: float = Query(80.0, ge=45, le=105), max_lon: float = Query(100.0, ge=45, le=105),
                  min_depth: float = Query(0.0, ge=0, le=1000), max_depth: float = Query(500.0, ge=0, le=1000),
                  variable: Literal["temp", "anomaly", "uncertainty"] = "temp",
                  max_points: int = Query(20000, ge=1000, le=20000), stride: int | None = Query(None, ge=1, le=20),
                  store: GridStore = Depends(get_store)):
    """Server-side downsampled sub-volume (lat x lon x depth) for the 3-D view; never the full field."""
    if min_lat >= max_lat or min_lon >= max_lon or min_depth > max_depth:
        raise ApiError(422, "invalid_request", "bbox and depth range must have min < max")
    cap = min(max_points, store.s.max_3d_points)
    model = store.production_model
    used, notice = store.resolve_date(day, model)
    cube = store.cube(model, used)
    if variable == "uncertainty":
        if "sigma" not in cube:
            raise ApiError(422, "uncertainty_unavailable", "the production model has no uncertainty head")
        field, units, pv = cube["sigma"], "°C", prov("uncertainty", model_version=model)
    elif variable == "anomaly":
        field, units, pv = cube["temp"] - store.climatology(used), "°C", prov("anomaly", model_version=model)
    else:
        field, units, pv = cube["temp"], "°C", prov("reconstruction", model_version=model)
    kz = np.where((STANDARD_DEPTHS >= min_depth) & (STANDARD_DEPTHS <= max_depth))[0]
    if kz.size == 0:
        raise ApiError(422, "invalid_depth", "no standard depth inside the requested depth range")
    r = volume.sample(field, LATS, LONS, STANDARD_DEPTHS, lat_range=(min_lat, max_lat), lon_range=(min_lon, max_lon),
                      depth_index=kz, max_points=cap, stride=stride)
    v = r["value"]
    return {"date": str(used), "requested_date": str(day), "variable": variable, "units": units,
            "bbox": {"min_lat": min_lat, "max_lat": max_lat, "min_lon": min_lon, "max_lon": max_lon},
            "depths_m": STANDARD_DEPTHS[kz].tolist(), "stride": r["stride"], "max_points": cap, "n_points": int(v.size),
            "lat": np.round(r["lat"], 3).tolist(), "lon": np.round(r["lon"], 3).tolist(), "depth": r["depth"].tolist(),
            "value": np.round(v.astype(float), 2).tolist(),
            "stats": {"min": round(float(v.min()), 2), "max": round(float(v.max()), 2), "mean": round(float(v.mean()), 2)} if v.size else None,
            "notice": notice, "provenance": pv}
