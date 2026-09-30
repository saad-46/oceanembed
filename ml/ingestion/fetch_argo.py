"""Argo in-situ profiles - the PS's independent validation set (docs/04 section 6).

Source: global Argo GDAC data via ``argopy`` (Ifremer ERDDAP, ``standard`` mode =
real-time + delayed-mode data with QC flags 1/2 only, adjusted values where available).
The INCOIS LAS gridded-Argo product named in the PS could not be reached from outside
INCOIS; this is the documented substitution (docs/05, D-006). A direct ERDDAP tabledap
fallback is used if argopy is unavailable.

Each profile is stored with its native levels (for the database) and interpolated
onto the 15 standard depths (for validation). ``used_in_training`` marks profiles whose
date falls in the model training years: the model never trains on Argo directly, but
the target product assimilates Argo, so only profiles from the held-out years are ever
scored as "independent" (docs/10 section 3).
"""
from __future__ import annotations

import io
import json
import logging
from datetime import date

import numpy as np
import pandas as pd
import requests

from ml.config import (LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, PROCESSED_DIR, RAW_DIR, STANDARD_DEPTHS,
                       TEST_YEARS, TRAIN_YEARS, VAL_YEARS)
from ml.ingestion.base import Provenance
from ml.ingestion.erddap import month_chunks
from ml.qc_rules import ARGO_ACCEPTED_QC_FLAGS, ARGO_MIN_LEVELS, ARGO_SURFACE_MAX_OFFSET_M, MAX_BRACKET_GAP

log = logging.getLogger("oceanembed.ingestion.argo")

PROVENANCE = Provenance(
    source_key="argo", product="Argo GDAC profiles (QC 1/2)", provider="Argo programme via argopy / Ifremer ERDDAP",
    dataset_id="ArgoFloats", url="https://argopy.readthedocs.io/", license="Argo data policy: free and unrestricted",
    native_resolution="point profiles", requires_credentials=False,
)


def pres_to_depth(pres: np.ndarray, lat: float) -> np.ndarray:
    """Saunders (1981) pressure (dbar) -> depth (m); accurate to <0.1 % in the upper 1000 m."""
    s2 = np.sin(np.deg2rad(lat)) ** 2
    c1 = (5.92 + 5.25 * s2) * 1e-3
    return (1 - c1) * pres - 2.21e-6 * pres**2


def _max_gap(z: float) -> float:
    return next(v for k, v in sorted(MAX_BRACKET_GAP.items(), reverse=True) if z >= k)


def to_standard_depths(depth: np.ndarray, temp: np.ndarray) -> np.ndarray:
    """Interpolate one profile to the standard depths; NaN where poorly sampled.

    The surface value (0 m) uses the shallowest measurement if it is within 6 m -
    Argo floats stop pumping a few metres below the surface.
    """
    ok = np.isfinite(depth) & np.isfinite(temp)
    depth, temp = depth[ok], temp[ok]
    out = np.full(STANDARD_DEPTHS.size, np.nan, dtype=np.float32)
    if depth.size < ARGO_MIN_LEVELS:
        return out
    order = np.argsort(depth)
    depth, temp = depth[order], temp[order]
    for k, z in enumerate(STANDARD_DEPTHS):
        if z < depth[0]:
            if depth[0] - z <= ARGO_SURFACE_MAX_OFFSET_M:
                out[k] = temp[0]
            continue
        hi = np.searchsorted(depth, z)
        if hi >= depth.size:
            continue
        if np.isclose(depth[hi], z):
            out[k] = temp[hi]
            continue
        lo = hi - 1
        if depth[hi] - depth[lo] > _max_gap(z):
            continue
        w = (z - depth[lo]) / (depth[hi] - depth[lo])
        out[k] = (1 - w) * temp[lo] + w * temp[hi]
    return out


def split_for(ts: pd.Timestamp) -> str:
    y = ts.year
    return "train" if y in TRAIN_YEARS else "val" if y in VAL_YEARS else "test" if y in TEST_YEARS else "other"


def _fetch_month_argopy(a: date, b: date) -> pd.DataFrame:
    from argopy import DataFetcher

    f = DataFetcher(src="erddap", mode="standard", progress=False).region(
        [LON_MIN, LON_MAX, LAT_MIN, LAT_MAX, 0, 1100, a.isoformat(), (pd.Timestamp(b) + pd.Timedelta(days=1)).date().isoformat()])
    ds = f.to_xarray()
    return ds[["PLATFORM_NUMBER", "CYCLE_NUMBER", "TIME", "LATITUDE", "LONGITUDE", "PRES", "TEMP", "PSAL", "DATA_MODE"]].to_dataframe().reset_index(drop=True)


def _fetch_month_erddap(a: date, b: date) -> pd.DataFrame:
    """Direct tabledap fallback (same underlying GDAC data argopy uses)."""
    url = ("https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv?platform_number,cycle_number,time,latitude,longitude,"
           f"pres,temp,psal,psal_qc,data_mode&time>={a.isoformat()}T00:00:00Z&time<={b.isoformat()}T23:59:59Z"
           f"&latitude>={LAT_MIN}&latitude<={LAT_MAX}&longitude>={LON_MIN}&longitude<={LON_MAX}&pres<=1100"
           '&temp_qc=~"[12]"&pres_qc=~"[12]"&position_qc=~"[12]"')
    r = requests.get(url, timeout=600)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text), skiprows=[1])
    return apply_psal_qc(df.rename(columns={c: c.upper() for c in df.columns}))


def apply_psal_qc(df: pd.DataFrame) -> pd.DataFrame:
    """Salinity levels whose own QC flag is not accepted are set to NaN (temperature is kept).

    The server-side filter above keeps a level when temperature, pressure and position are good;
    salinity carries a separate flag, so it is screened here rather than dropping whole levels.
    """
    if "PSAL_QC" not in df:
        return df
    ok = pd.to_numeric(df["PSAL_QC"], errors="coerce").isin(ARGO_ACCEPTED_QC_FLAGS)
    df = df.copy()
    df.loc[~ok, "PSAL"] = np.nan
    return df.drop(columns="PSAL_QC")


def fetch_month(a: date, b: date) -> pd.DataFrame:
    cache = RAW_DIR / "argo" / f"{a:%Y-%m}.parquet"
    if cache.exists():
        return pd.read_parquet(cache)
    try:
        df = _fetch_month_argopy(a, b)
    except Exception as e:
        log.warning("argopy failed for %s (%s); using direct ERDDAP", a, e)
        df = _fetch_month_erddap(a, b)
    df["TIME"] = pd.to_datetime(df["TIME"]).dt.tz_localize(None)
    df = df[(df["TIME"] >= pd.Timestamp(a)) & (df["TIME"] < pd.Timestamp(b) + pd.Timedelta(days=1))]
    cache.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache)
    return df


def points_to_profiles(df: pd.DataFrame, counts: dict | None = None) -> pd.DataFrame:
    """One row per profile; ``counts`` (optional) accumulates how many were kept or dropped and why."""
    rows = []
    counts = counts if counts is not None else {}
    for (plat, cyc), g in df.groupby(["PLATFORM_NUMBER", "CYCLE_NUMBER"], sort=False):
        g = g.sort_values("PRES")
        lat, lon = float(g["LATITUDE"].iloc[0]), float(g["LONGITUDE"].iloc[0])
        depth = pres_to_depth(g["PRES"].to_numpy(float), lat)
        temp = g["TEMP"].to_numpy(float)
        psal = g["PSAL"].to_numpy(float) if "PSAL" in g else np.full_like(temp, np.nan)
        ts = pd.Timestamp(g["TIME"].iloc[0])
        std = to_standard_depths(depth, temp)
        counts["n_profiles_received"] = counts.get("n_profiles_received", 0) + 1
        if not np.isfinite(std).any():
            counts["n_dropped_no_standard_depth"] = counts.get("n_dropped_no_standard_depth", 0) + 1
            continue
        rows.append({
            "platform_number": str(int(plat)) if str(plat).replace(".0", "").isdigit() else str(plat),
            "cycle_number": int(cyc), "profile_date": ts, "lat": lat, "lon": lon,
            "data_mode": str(g["DATA_MODE"].iloc[0]) if "DATA_MODE" in g else "",
            "depths_m": np.round(depth, 2).tolist(), "temperature_c": np.round(temp, 3).tolist(),
            "salinity_psu": np.round(psal, 3).tolist(), "temp_std": std.tolist(),
            "split": split_for(ts), "used_in_training": ts.year in TRAIN_YEARS,
        })
    return pd.DataFrame(rows)


def build_argo(start: date, end: date) -> pd.DataFrame:
    frames, counts, failed = [], {}, []
    for a, b in month_chunks(start, end):
        try:
            prof = points_to_profiles(fetch_month(a, b), counts)
            frames.append(prof)
            log.info("argo %s: %d profiles", f"{a:%Y-%m}", len(prof))
        except Exception as e:
            log.error("argo %s failed: %s", a, e)
            failed.append(f"{a:%Y-%m}")
    df = pd.concat(frames, ignore_index=True)
    n_before = len(df)
    df = df.drop_duplicates(["platform_number", "cycle_number"])
    out = PROCESSED_DIR / "argo_profiles.parquet"
    df.to_parquet(out)
    # recorded for the Data Quality workspace (levels failing QC flags never leave the data server)
    (PROCESSED_DIR / "argo_qc.json").write_text(json.dumps({
        **counts, "n_duplicates_removed": n_before - len(df), "n_profiles_kept": len(df), "months_failed": failed,
        "accepted_qc_flags": list(ARGO_ACCEPTED_QC_FLAGS), "period": [start.isoformat(), end.isoformat()]}, indent=2))
    log.info("wrote %s: %d profiles, split counts %s", out, len(df), df["split"].value_counts().to_dict())
    return df
