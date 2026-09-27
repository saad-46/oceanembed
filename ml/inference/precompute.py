"""Batch inference -> cached daily products served by the API (docs/08 section 7, docs/16 section 3).

    python -m ml.inference.precompute [--start 2019-01-01 --end 2023-12-31]

Writes under ``data/outputs``:

* ``predictions/<model>.zarr``  temp (+ sigma for the U-Net) (time, depth, lat, lon), int16 x 0.01 degC
* ``products/<model>.zarr``     tchp, mld, d20, d26 (time, lat, lon) from the reconstruction, plus the
                                 SSS input (for the barrier-layer proxy)
* ``region_timeseries.json``    daily region means of the derived products for the named regions
* ``embeddings.json``           per-day, per-region pooled U-Net bottleneck embeddings + 2-D PCA projection

Nothing here runs during a demo: the API only reads these stores.
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
from datetime import date

import numpy as np
import pandas as pd
import xarray as xr

from ml.config import INPUT_VARS, LATS, LONS, MODEL_DIR, OUTPUT_DIR, REGIONS, STANDARD_DEPTHS, STUDY_END, STUDY_START
from ml.evaluation.derived_products import all_products
from ml.pipeline.feature_engineering import Dataset, climatology_for

log = logging.getLogger("oceanembed.precompute")
CHUNK_DAYS = 32
T_ENC = {"dtype": "int16", "scale_factor": 0.01, "_FillValue": -32768}
P_ENC = {"dtype": "int16", "scale_factor": 0.1, "_FillValue": -32768}


def _region_masks():
    lat2, lon2 = np.meshgrid(LATS, LONS, indexing="ij")
    return {r.name: (lat2 >= r.min_lat) & (lat2 <= r.max_lat) & (lon2 >= r.min_lon) & (lon2 <= r.max_lon)
            for r in REGIONS}


def _write(ds: xr.Dataset, path, first: bool, enc: dict):
    if first:
        if path.exists():
            shutil.rmtree(path)
        ds.to_zarr(path, mode="w", encoding=enc)
    else:
        ds.to_zarr(path, append_dim="time")


def precompute(start: date = STUDY_START, end: date = STUDY_END):
    import torch
    from ml.models.baseline_lightgbm import LightGBMBaseline, pixel_features
    from ml.models.train import UNET_NAME, load_unet, predict_unet

    torch.set_num_threads(8)
    ds = Dataset()
    days = pd.DatetimeIndex(ds.inputs.time.values)
    days = days[(days >= pd.Timestamp(start)) & (days <= pd.Timestamp(end))]
    unets = {n: load_unet(n) for n in UNET_NAME.values() if (MODEL_DIR / n / "model.pt").exists()}
    lgbm = LightGBMBaseline.load() if (MODEL_DIR / "baseline-lightgbm-v1").exists() else None
    pred_dir, prod_dir = OUTPUT_DIR / "predictions", OUTPUT_DIR / "products"
    pred_dir.mkdir(parents=True, exist_ok=True); prod_dir.mkdir(parents=True, exist_ok=True)
    rmasks = _region_masks()
    series = {r: {k: [] for k in ("date", "tchp_kj_cm2", "mld_m", "d20_m", "d26_m", "sst_c")} for r in rmasks}
    emb_rows = []
    coords = dict(depth=STANDARD_DEPTHS, lat=LATS, lon=LONS)

    for c0 in range(0, len(days), CHUNK_DAYS):
        times = days[c0:c0 + CHUNK_DAYS]
        first = c0 == 0
        X = ds.features(times)
        clim = climatology_for(times, ds.coef)
        sel = ds.inputs.sel(time=times.values)
        for name, (model, ck) in unets.items():
            mu, sd = predict_unet(model, X, clim, ds, ds.mask3d, no_sss=ck.get("no_sss", False))
            out = xr.Dataset({"temp": (("time", "depth", "lat", "lon"), mu), "sigma": (("time", "depth", "lat", "lon"), sd)},
                             coords={"time": times, **coords}, attrs={"model": name})
            _write(out, pred_dir / f"{name}.zarr", first,
                   {"temp": {**T_ENC, "chunks": (1, 15, 100, 240)}, "sigma": {**T_ENC, "chunks": (1, 15, 100, 240)}})
            if name == "cnn-unet-v1":
                prods = all_products(np.moveaxis(mu, 1, 0))  # (15, t, lat, lon) -> (t, lat, lon)
                pds = xr.Dataset({k.split("_")[0]: (("time", "lat", "lon"), v.astype(np.float32)) for k, v in prods.items()},
                                 coords={"time": times, "lat": LATS, "lon": LONS})
                pds["sss"] = (("time", "lat", "lon"), np.where(ds.ocean[None], sel["sss"].values, np.nan).astype(np.float32))
                _write(pds, prod_dir / f"{name}.zarr", first,
                       {v: {**P_ENC, "chunks": (1, 100, 240)} if v != "sss" else {**T_ENC, "chunks": (1, 100, 240)} for v in pds})
                for r, m in rmasks.items():
                    s = series[r]
                    s["date"] += [str(t.date()) for t in times]
                    for key, arr in (("tchp_kj_cm2", prods["tchp_kj_cm2"]), ("mld_m", prods["mld_m"]),
                                     ("d20_m", prods["d20_m"]), ("d26_m", prods["d26_m"]), ("sst_c", mu[:, 0])):
                        s[key] += [None if not np.isfinite(v) else round(float(v), 2) for v in np.nanmean(arr[:, m], axis=1)]
                # satellite embedding: bottleneck pooled over each region's ocean cells
                with torch.no_grad():
                    z = model.embed(torch.from_numpy(X)).numpy()  # (t, C, 13, 30)
                zr = _pool_regions(z)
                for ti, t in enumerate(times):
                    for r, vec in zr.items():
                        emb_rows.append({"date": str(t.date()), "region": r, "vec": vec[ti]})
        if lgbm is not None:
            P = lgbm.predict(pixel_features({v: sel[v].values for v in INPUT_VARS}, times), ds.mask3d)
            out = xr.Dataset({"temp": (("time", "depth", "lat", "lon"), P)}, coords={"time": times, **coords},
                             attrs={"model": "baseline-lightgbm-v1"})
            _write(out, pred_dir / "baseline-lightgbm-v1.zarr", first, {"temp": {**T_ENC, "chunks": (1, 15, 100, 240)}})
        log.info("precomputed %s..%s", times[0].date(), times[-1].date())

    (OUTPUT_DIR / "region_timeseries.json").write_text(json.dumps(series))
    if emb_rows:
        _write_embedding_projection(emb_rows)
    log.info("precompute done: %d days", len(days))


def _pool_regions(z: np.ndarray) -> dict[str, np.ndarray]:
    """Average the (t, C, 13, 30) bottleneck over the region footprint at bottleneck resolution."""
    t, c, h, w = z.shape
    # bottleneck cell (a, b) covers padded rows 8a..8a+7 (pad 2 on top) and columns 8b..8b+7
    lat_c = LATS[0] + (np.arange(h) * 8 + 3.5 - 2) * 0.25
    lon_c = LONS[0] + (np.arange(w) * 8 + 3.5) * 0.25
    la, lo = np.meshgrid(lat_c, lon_c, indexing="ij")
    out = {}
    for r in REGIONS:
        if r.name == "Full Domain":
            continue
        m = (la >= r.min_lat) & (la <= r.max_lat) & (lo >= r.min_lon) & (lo <= r.max_lon)
        out[r.name] = z[:, :, m].mean(axis=2)
    return out


def _write_embedding_projection(rows: list[dict]):
    from sklearn.decomposition import PCA

    V = np.stack([r["vec"] for r in rows])
    Vn = (V - V.mean(0)) / (V.std(0) + 1e-6)
    pca = PCA(n_components=2, random_state=0).fit(Vn)
    P = pca.transform(Vn)
    months = [int(r["date"][5:7]) for r in rows]
    season = {12: "NE monsoon (DJF)", 1: "NE monsoon (DJF)", 2: "NE monsoon (DJF)", 3: "Pre-monsoon (MAM)",
              4: "Pre-monsoon (MAM)", 5: "Pre-monsoon (MAM)", 6: "SW monsoon (JJAS)", 7: "SW monsoon (JJAS)",
              8: "SW monsoon (JJAS)", 9: "SW monsoon (JJAS)", 10: "Post-monsoon (ON)", 11: "Post-monsoon (ON)"}
    points = [{"date": r["date"], "region": r["region"], "month": m, "season": season[m],
               "x": round(float(p[0]), 4), "y": round(float(p[1]), 4)} for r, m, p in zip(rows, months, P)]
    (OUTPUT_DIR / "embeddings.json").write_text(json.dumps({
        "method": "PCA of the U-Net bottleneck (satellite embedding) pooled per region per day",
        "embedding_dim": int(V.shape[1]), "explained_variance_ratio": [round(float(x), 4) for x in pca.explained_variance_ratio_],
        "n_points": len(points), "points": points}))


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("--start", default=STUDY_START.isoformat())
    p.add_argument("--end", default=STUDY_END.isoformat())
    a = p.parse_args(argv)
    precompute(date.fromisoformat(a.start), date.fromisoformat(a.end))


if __name__ == "__main__":
    main()
