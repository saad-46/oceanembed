"""Independent validation against Argo floats (the PS's required evaluation, docs/10 section 2).

    python -m ml.evaluation.argo_validation

For every QC'd Argo profile, the reconstruction for the profile's UTC date is sampled at
the 0.25 deg cell containing the float and compared on the standard depths the profile
resolves. Metrics are reported per depth, per model, per split. Only ``val``/``test``
profiles (years the model never trained on) are "independent"; ``train``-year numbers are
reported separately as an in-sample reference and never mixed in.

Caveat (always attached, docs/10 section 3): the training target (HYCOM here, GLORYS in
the spec) assimilates Argo, so these floats are independent of *our model's training*
but not of the reanalysis it learned from.
"""
from __future__ import annotations

import json
import logging

import numpy as np
import pandas as pd
import xarray as xr

from ml.config import LATS, LONS, OUTPUT_DIR, PROCESSED_DIR, STANDARD_DEPTHS, nearest_cell
from ml.evaluation.metrics import per_depth_metrics
from ml.pipeline.feature_engineering import climatology_for

log = logging.getLogger("oceanembed.argo_validation")
CAVEAT = ("Argo floats from the held-out years are independent of the model's training, but the training "
          "target (an ocean reanalysis/analysis) assimilates Argo, so they are not fully independent of the "
          "product the model learned from. See docs/10 section 3 and docs/21.")


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.deg2rad(lat1), np.deg2rad(lat2)
    dphi, dl = p2 - p1, np.deg2rad(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def sample_store(store: xr.Dataset, var: str, dates: pd.DatetimeIndex, ii: np.ndarray, jj: np.ndarray) -> np.ndarray:
    """Vectorised point sampling (n, 15) of a (time, depth, lat, lon) store; NaN where date absent."""
    out = np.full((len(dates), len(STANDARD_DEPTHS)), np.nan, dtype=np.float32)
    tindex = pd.DatetimeIndex(store.time.values)
    pos = tindex.get_indexer(dates)
    for p in np.unique(pos[pos >= 0]):
        rows = np.where(pos == p)[0]
        cube = store[var].isel(time=int(p)).values  # (15, lat, lon)
        out[rows] = cube[:, ii[rows], jj[rows]].T
    return out


def validate() -> dict:
    prof = pd.read_parquet(PROCESSED_DIR / "argo_profiles.parquet")
    prof["day"] = pd.to_datetime(prof["profile_date"]).dt.floor("D")
    cells = [nearest_cell(la, lo) for la, lo in zip(prof["lat"], prof["lon"])]
    ii = np.array([c[0] for c in cells]); jj = np.array([c[1] for c in cells])
    prof["distance_km"] = haversine_km(prof["lat"].to_numpy(), prof["lon"].to_numpy(), LATS[ii], LONS[jj])
    obs = np.stack(prof["temp_std"].to_numpy()).astype(np.float32)
    dates = pd.DatetimeIndex(prof["day"])

    mask3d = xr.open_zarr(PROCESSED_DIR / "static.zarr")["ocean_mask3d"].values
    coef = xr.open_zarr(PROCESSED_DIR / "climatology.zarr")["coef"].values
    # Climatology sampled per profile (evaluating the full grid for every profile would be ~GBs).
    clim = np.stack([climatology_for(dates[[k]], coef[:, :, ii[k]:ii[k] + 1, jj[k]:jj[k] + 1])[0, :, 0, 0]
                     for k in range(len(prof))]).astype(np.float32)
    clim[~mask3d[:, ii, jj].T] = np.nan

    preds, sigmas = {"climatology": clim}, {}
    for path in sorted((OUTPUT_DIR / "predictions").glob("*.zarr")):
        name = path.stem
        st = xr.open_zarr(path)
        preds[name] = sample_store(st, "temp", dates, ii, jj)
        if "sigma" in st:
            sigmas[name] = sample_store(st, "sigma", dates, ii, jj)
    tpath = PROCESSED_DIR / "target.zarr"
    if tpath.exists():  # reference ceiling: the training-target product itself vs Argo (sampled days only)
        preds["target-product"] = sample_store(xr.open_zarr(tpath), "temp", dates, ii, jj)

    results = {"caveat": CAVEAT, "n_profiles_total": int(len(prof)), "splits": {}}
    for split in ("val", "test", "train"):
        m = (prof["split"] == split).to_numpy()
        if not m.any():
            continue
        span = prof.loc[m, "day"]
        res = {"n_profiles": int(m.sum()), "independent": split != "train",
               "period": f"{span.min().date()}..{span.max().date()}", "models": {}}
        for name, P in preds.items():
            rows = per_depth_metrics(P[m], obs[m], clim[m])
            res["models"][name] = {"per_depth": rows}
            if name in sigmas:
                s = sigmas[name][m]; e = np.abs(P[m] - obs[m]); ok = np.isfinite(e) & np.isfinite(s)
                res["models"][name]["frac_within_1sigma"] = float((e[ok] <= s[ok]).mean()) if ok.any() else None
                res["models"][name]["frac_within_2sigma"] = float((e[ok] <= 2 * s[ok]).mean()) if ok.any() else None
        results["splits"][split] = res
        log.info("%s: %d profiles", split, m.sum())

    # Per-profile records for the database (prediction_at_argo)
    records = []
    for name, P in preds.items():
        if name == "target-product":
            continue
        err = P - obs
        n_lv = np.isfinite(err).sum(1)
        rmse = np.sqrt(np.nanmean(np.where(np.isfinite(err), err ** 2, np.nan), axis=1))
        S = sigmas.get(name)
        for k in range(len(prof)):
            if n_lv[k] == 0:
                continue
            records.append({"platform_number": prof["platform_number"].iat[k], "cycle_number": int(prof["cycle_number"].iat[k]),
                            "model": name, "pred": P[k].tolist(), "sigma": None if S is None else S[k].tolist(),
                            "distance_km": float(prof["distance_km"].iat[k]), "date_offset_days": 0,
                            "rmse_c": float(rmse[k]), "n_levels": int(n_lv[k])})
    pd.DataFrame(records).to_parquet(OUTPUT_DIR / "argo_predictions.parquet")
    (OUTPUT_DIR / "metrics_argo.json").write_text(json.dumps(results, indent=2))
    return results


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    r = validate()
    for split, res in r["splits"].items():
        print(split, res["n_profiles"], {n: round(float(np.nanmean([d.get("rmse_c", np.nan) for d in v["per_depth"]])), 3)
                                         for n, v in res["models"].items()})


if __name__ == "__main__":
    main()
