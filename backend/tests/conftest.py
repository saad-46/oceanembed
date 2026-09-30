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

    # --- surface inputs (SIMULATED): uniform 5 m/s eastward + 5 m/s northward wind (from 225 deg), analytic SLA
    ones = np.where(~land, 1.0, np.nan)[None].repeat(3, 0).astype(np.float32)
    inp = {"sst": 29.0 * ones, "sss": pds["sss"].values, "sla": (0.001 * (lat2 - 15.0))[None] * ones,
           "ucur": 0.1 * ones, "vcur": 0.0 * ones, "uwind": 5.0 * ones, "vwind": 5.0 * ones}
    xr.Dataset({k: (("time", "lat", "lon"), v.astype(np.float32)) for k, v in inp.items()} | {"ocean_mask": (("lat", "lon"), ~land)},
               coords={"time": DAYS, "lat": LATS, "lon": LONS}).to_zarr(proc / "inputs.zarr")
    n_ocean = int((~land).sum()) * len(DAYS)
    (proc / "inputs_qc.json").write_text(json.dumps({v: {
        "missing_ocean_values": n_ocean // 50, "filled_temporal": n_ocean // 100, "filled_spatial": n_ocean // 100 if v != "sla" else n_ocean // 2,
        "n_invalid_flagged": 3, "n_duplicate_times": 0, "n_days_absent_in_source": 0,
        "prov_product": f"simulated {v}", "prov_provider": "test fixture", "prov_dataset_id": f"sim_{v}",
        "prov_url": "https://example.invalid", "prov_native_resolution": "0.25 deg daily"} for v in inp}))
    (proc / "assemble_summary.json").write_text(json.dumps({"target_days": 3, "split_counts": {"train": 1, "val": 1, "test": 1},
                                                            "ocean_cells_surface": int((~land).sum()), "ocean_cells_1000m": 1,
                                                            "target_source": "simulated"}))
    argo_table().to_parquet(proc / "argo_profiles.parquet")

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


def native_ts(z):
    """SIMULATED Bay-of-Bengal-like native profile: fresh 31 PSU cap over a 20-30 m halocline; thermocline 40-120 m."""
    s = np.interp(z, [0, 20, 30, 1000], [31.0, 31.0, 34.0, 35.0])
    t = np.interp(z, [0, 40, 120, 1000], [29.5, 29.5, 18.0, 6.0])
    return t, s


def argo_table():
    import pandas as pd

    z = np.arange(2.0, 1000.0, 2.0)
    t, s = native_ts(z)
    std = np.interp(STANDARD_DEPTHS, z, t)
    std[0] = t[0]
    base = {"data_mode": "D", "depths_m": z.tolist(), "temperature_c": t.round(3).tolist(), "temp_std": std.tolist()}
    return pd.DataFrame([
        {**base, "platform_number": "2902001", "cycle_number": 10, "profile_date": pd.Timestamp("2023-05-11 06:00"),
         "lat": 15.1, "lon": 88.1, "salinity_psu": s.round(3).tolist(), "split": "test", "used_in_training": False},
        {**base, "platform_number": "2902002", "cycle_number": 4, "profile_date": pd.Timestamp("2021-05-11 06:00"),
         "lat": 15.0, "lon": 88.0, "salinity_psu": s.round(3).tolist(), "split": "train", "used_in_training": True},
        {**base, "platform_number": "2902003", "cycle_number": 7, "profile_date": pd.Timestamp("2023-05-12 03:00"),
         "lat": 12.05, "lon": 70.05, "salinity_psu": [None] * z.size, "split": "test", "used_in_training": False},
    ])


def build_long_fixture(root: Path, n_days: int = 100) -> Path:
    """SIMULATED store with a linear warming trend of 0.01 degC/day at every depth (forecast tests)."""
    proc, out = root / "processed", root / "outputs"
    (out / "predictions").mkdir(parents=True)
    proc.mkdir(parents=True)
    days = pd.date_range("2023-01-01", periods=n_days, freq="D")
    lat2, lon2 = np.meshgrid(LATS, LONS, indexing="ij")
    land = lon2 < 50
    mask3d = np.broadcast_to(~land, (15,) + land.shape).copy()
    xr.Dataset({"ocean_mask3d": (("depth", "lat", "lon"), mask3d)},
               coords={"depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS}).to_zarr(proc / "static.zarr")
    temp = (analytic_profile()[None, :, None, None] + 0.01 * np.arange(n_days)[:, None, None, None]
            + np.zeros((1, 1, 100, 240), np.float32)).astype(np.float32)
    temp[:, ~mask3d] = np.nan
    sigma = np.where(np.isfinite(temp), 0.3, np.nan).astype(np.float32)
    xr.Dataset({"temp": (("time", "depth", "lat", "lon"), temp), "sigma": (("time", "depth", "lat", "lon"), sigma)},
               coords={"time": days, "depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS}).to_zarr(
        out / "predictions" / "cnn-unet-v1.zarr", encoding={"temp": {**T_ENC, "chunks": (1, 15, 100, 240)}, "sigma": T_ENC})
    (out / "model_registry.json").write_text(json.dumps([{"name": "cnn-unet-v1", "architecture": "CNN-UNet", "is_production": True}]))
    return root


@pytest.fixture
def long_client(client, tmp_path_factory, data_dir):
    """Temporarily points the API at the 100-day trend store; restores the default store afterwards."""
    from app.config import Settings
    from app.services import store as store_mod

    root = tmp_path_factory.getbasetemp() / "long_store"
    if not root.exists():
        build_long_fixture(root)
    store_mod.reset_store(Settings(oceanembed_data_dir=root))
    yield client
    store_mod.reset_store(Settings(oceanembed_data_dir=data_dir))


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
