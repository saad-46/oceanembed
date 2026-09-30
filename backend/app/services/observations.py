"""Nearest measured Argo profile with its *native* levels (temperature and salinity).

Primary source: PostGIS (``argo_profile``), using the same ranking as the profile view's nearest
float (held-out floats first, then distance). If the database is unreachable, the pipeline's
``processed/argo_profiles.parquet`` (the table the database is seeded from) is searched instead,
so salinity and T-S analysis degrade gracefully rather than failing.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.orm import Session

from app.services import argo as argo_q
from app.services.store import GridStore

EARTH_KM = 6371.0


def _haversine(lat, lon, lat2, lon2):
    p1, p2 = np.deg2rad(lat), np.deg2rad(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.deg2rad(lon2 - lon) / 2) ** 2
    return 2 * EARTH_KM * np.arcsin(np.sqrt(a))


def _clean(xs):
    if xs is None:
        return None
    return [None if x is None or (isinstance(x, float) and not np.isfinite(x)) else float(x) for x in xs]


def _from_db(db: Session, lat: float, lon: float, d: date, radius_km: float, window_days: int):
    ref = argo_q.nearest_float(db, lat, lon, d, radius_km=radius_km, window_days=window_days)
    if ref is None:
        return None
    det = argo_q.profile_detail(db, ref["id"])
    return {"ref": {k: ref[k] for k in ("id", "platform_number", "cycle_number", "profile_date", "lat", "lon", "distance_km",
                                        "date_offset_days", "split", "independent")} | {"data_mode": det.get("data_mode")},
            "depths_m": det["native"]["depths_m"], "temperature_c": det["native"]["temperature_c"],
            "salinity_psu": det["native"]["salinity_psu"]}


def _from_table(df: pd.DataFrame, lat: float, lon: float, d: date, radius_km: float, window_days: int):
    t0 = pd.Timestamp(d - timedelta(days=window_days))
    t1 = pd.Timestamp(d + timedelta(days=window_days + 1))
    sub = df[(df["profile_date"] >= t0) & (df["profile_date"] < t1)]
    if sub.empty:
        return None
    dist = _haversine(lat, lon, sub["lat"].to_numpy(float), sub["lon"].to_numpy(float))
    sub = sub.assign(distance_km=dist)
    sub = sub[sub["distance_km"] <= radius_km]
    if sub.empty:
        return None
    r = sub.sort_values(["used_in_training", "distance_km"], kind="stable").iloc[0]
    pdate = pd.Timestamp(r["profile_date"])
    return {"ref": {"id": None, "platform_number": str(r["platform_number"]), "cycle_number": int(r["cycle_number"]),
                    "profile_date": pdate.isoformat(), "lat": round(float(r["lat"]), 3), "lon": round(float(r["lon"]), 3),
                    "distance_km": round(float(r["distance_km"]), 1), "date_offset_days": (pdate.date() - d).days,
                    "split": str(r["split"]), "independent": not bool(r["used_in_training"]),
                    "data_mode": str(r.get("data_mode", "")) or None},
            "depths_m": _clean(list(r["depths_m"])), "temperature_c": _clean(list(r["temperature_c"])),
            "salinity_psu": _clean(list(r["salinity_psu"])) if r.get("salinity_psu") is not None else None}


def nearest_native(db: Session | None, store: GridStore, lat: float, lon: float, d: date,
                   radius_km: float = 100.0, window_days: int = 3) -> tuple[dict | None, str, str]:
    """Returns (profile or None, status, detail). Status: available | none_nearby | lookup_unavailable."""
    where = f"within {radius_km:g} km and ±{window_days} days"
    prof, used_db = None, False
    if db is not None:
        try:
            prof, used_db = _from_db(db, lat, lon, d, radius_km, window_days), True
        except (OperationalError, InterfaceError):
            pass  # database offline: fall back to the pipeline's copy below
    if not used_db:
        df = store.argo_table
        if df is None:
            return None, "lookup_unavailable", "The Argo archive is not reachable (database offline and no local copy)."
        prof = _from_table(df, lat, lon, d, radius_km, window_days)
    if prof is None:
        return None, "none_nearby", f"No Argo profile {where} of this point."
    return prof, "available", f"Nearest Argo profile {where} (held-out floats preferred)."
