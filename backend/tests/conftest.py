"""API test fixtures.

The data directory built here is **SIMULATED** (docs/10 section 4): an idealised analytic
profile on the real 0.25 deg grid, written with the exact encodings `ml.inference.precompute`
uses, so the API is exercised end-to-end without the multi-GB real stores. It never ships.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import xarray as xr

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from ml.config import LATS, LONS, STANDARD_DEPTHS  # noqa: E402
from ml.evaluation.derived_products import all_products  # noqa: E402

DAYS = pd.DatetimeIndex(["2023-05-10", "2023-05-11", "2023-05-12"])
T_ENC = {"dtype": "int16", "scale_factor": 0.01, "_FillValue": -32768}
P_ENC = {"dtype": "int16", "scale_factor": 0.1, "_FillValue": -32768}


def analytic_profile() -> np.ndarray:
    z = STANDARD_DEPTHS
    return (6.0 + 23.0 * np.exp(-z / 120.0)).astype(np.float32)  # 29 degC at surface -> ~6 degC at 1000 m


def build_fixture(root: Path) -> Path:
    proc, out = root / "processed", root / "outputs"
    (out / "predictions").mkdir(parents=True)
    (out / "products").mkdir(parents=True)
    proc.mkdir(parents=True)
    lat2, lon2 = np.meshgrid(LATS, LONS, indexing="ij")
    land = (lon2 < 50) | ((lat2 > 20) & (lon2 > 72) & (lon2 < 88))  # synthetic "land"
    mask3d = np.broadcast_to(~land, (15,) + land.shape).copy()
    mask3d[-1, :, :60] = False  # "shallow" west at 1000 m
    xr.Dataset({"ocean_mask3d": (("depth", "lat", "lon"), mask3d)},
               coords={"depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS}).to_zarr(proc / "static.zarr")
    prof = analytic_profile()
    coef = np.zeros((5, 15, 100, 240), np.float32)
    coef[0] = prof[:, None, None]
    coef[:, ~mask3d] = np.nan
    xr.Dataset({"coef": (("harmonic", "depth", "lat", "lon"), coef)},
               coords={"depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS}).to_zarr(proc / "climatology.zarr")

    temp = np.broadcast_to(prof[None, :, None, None] + 0.5, (3, 15, 100, 240)).copy()
    temp[:, ~mask3d] = np.nan
    sigma = np.where(np.isfinite(temp), 0.3, np.nan).astype(np.float32)
    coords = {"time": DAYS, "depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS}
    xr.Dataset({"temp": (("time", "depth", "lat", "lon"), temp), "sigma": (("time", "depth", "lat", "lon"), sigma)},
               coords=coords).to_zarr(out / "predictions" / "cnn-unet-v1.zarr", encoding={"temp": T_ENC, "sigma": T_ENC})
    xr.Dataset({"temp": (("time", "depth", "lat", "lon"), temp - 0.2)},
               coords=coords).to_zarr(out / "predictions" / "baseline-lightgbm-v1.zarr", encoding={"temp": T_ENC})
    prods = all_products(np.moveaxis(temp, 1, 0))
    pds = xr.Dataset({k.split("_")[0]: (("time", "lat", "lon"), v.astype(np.float32)) for k, v in prods.items()},
                     coords={"time": DAYS, "lat": LATS, "lon": LONS})
    pds["sss"] = (("time", "lat", "lon"), np.where(~land, np.where(lon2 > 80, 32.0, 36.0), np.nan)[None].repeat(3, 0).astype(np.float32))
    pds.to_zarr(out / "products" / "cnn-unet-v1.zarr", encoding={**{v: P_ENC for v in ("tchp", "mld", "d20", "d26")}, "sss": T_ENC})

    (out / "model_registry.json").write_text(json.dumps([
        {"name": "cnn-unet-v1", "architecture": "CNN-UNet", "is_production": True, "training_period_start": "2019-01-01",
         "training_period_end": "2021-12-31"},
        {"name": "baseline-lightgbm-v1", "architecture": "LightGBM", "is_production": False,
         "training_period_start": "2019-01-01", "training_period_end": "2021-12-31"}]))
    rows = [{"depth_m": float(z), "n_obs": 10, "rmse_c": 0.5, "bias_c": 0.1, "corr": 0.9, "clim_rmse_c": 0.8,
             "skill_vs_climatology": 0.6} for z in STANDARD_DEPTHS]
    (out / "metrics_argo.json").write_text(json.dumps({"caveat": "test", "n_profiles_total": 10, "splits": {"test": {
        "n_profiles": 10, "independent": True, "period": "2023-01-01..2023-12-31",
        "models": {"cnn-unet-v1": {"per_depth": rows, "frac_within_1sigma": 0.6, "frac_within_2sigma": 0.9},
                   "climatology": {"per_depth": rows}}}}}))
    (out / "embeddings.json").write_text(json.dumps({"method": "test", "embedding_dim": 4, "explained_variance_ratio": [0.5, 0.2],
                                                      "n_points": 1, "points": [{"date": "2023-05-11", "region": "Bay of Bengal",
                                                                                 "month": 5, "season": "Pre-monsoon (MAM)", "x": 0, "y": 0}]}))
    return root


@pytest.fixture(scope="session")
def data_dir(tmp_path_factory):
    return build_fixture(tmp_path_factory.mktemp("simulated_store"))


@pytest.fixture(scope="session")
def client(data_dir):
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.db.session import get_db
    from app.main import app
    from app.services import store as store_mod

    store_mod.reset_store(Settings(oceanembed_data_dir=data_dir))
    app.dependency_overrides[get_db] = lambda: None  # DB-free: profile degrades gracefully
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
