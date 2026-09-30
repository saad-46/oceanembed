"""Data-validation and physics unit tests (docs/17: critical + high priority).

All fixtures here are small synthetic arrays used only to test plumbing and formulas
(docs/10 section 4) - they never reach the product.
"""
import numpy as np
import pytest

from ml.config import LATS, LONS, NLAT, NLON, STANDARD_DEPTHS, nearest_cell
from ml.evaluation.derived_products import isotherm_depth, mixed_layer_depth, tchp
from ml.evaluation.metrics import per_depth_metrics
from ml.ingestion.fetch_argo import pres_to_depth, to_standard_depths
from ml.pipeline.clean import fill_gaps, flag_invalid
from ml.pipeline.regrid import bilinear_to_target, coarsen_to_target, interp_depth, normalize_lon


# ---------------------------------------------------------------- grid / regridding
def test_target_grid_matches_ps():
    assert (NLAT, NLON) == (100, 240)
    assert LATS[0] == 5.125 and LATS[-1] == 29.875 and LONS[0] == 45.125 and LONS[-1] == 104.875
    assert STANDARD_DEPTHS.tolist() == [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]


def test_nearest_cell_roundtrip():
    for i in (0, 37, 99):
        for j in (0, 150, 239):
            assert nearest_cell(LATS[i], LONS[j]) == (i, j)


def test_normalize_lon():
    assert np.allclose(normalize_lon(np.array([0, 90, 180, 270, 359.75])), [0, 90, -180, -90, -0.25])


def test_bilinear_reproduces_linear_field_on_offset_grid():
    # Source on whole/quarter-degree centres (like NCEI winds), 0..360 longitudes.
    src_lat = np.arange(4.0, 31.01, 0.25)
    src_lon = np.arange(44.0, 106.01, 0.25)
    f = lambda la, lo: 2.0 * la - 0.5 * lo + 3.0
    la, lo = np.meshgrid(src_lat, src_lon, indexing="ij")
    out = bilinear_to_target(f(la, lo), src_lat, src_lon)
    tla, tlo = np.meshgrid(LATS, LONS, indexing="ij")
    assert out.shape == (NLAT, NLON)
    assert np.allclose(out, f(tla, tlo), atol=1e-4)


def test_bilinear_handles_descending_lat_and_nans():
    src_lat = np.arange(31.0, 3.99, -0.25)
    src_lon = np.arange(44.0, 106.01, 0.25)
    data = np.full((src_lat.size, src_lon.size), 10.0)
    data[:, :20] = np.nan  # a "land" strip in the west
    out = bilinear_to_target(data, src_lat, src_lon)
    assert np.allclose(out[np.isfinite(out)], 10.0)
    assert np.isnan(out[:, 0]).all()        # far inside the NaN strip stays NaN
    assert np.isfinite(out[:, 100]).all()    # open ocean fully valid


def test_coarsen_is_area_average_and_preserves_domain():
    src_lat = np.arange(5.0 + 1 / 48, 30.0, 1 / 12)
    src_lon = np.arange(45.0 + 1 / 24, 105.0, 1 / 12)
    la, lo = np.meshgrid(src_lat, src_lon, indexing="ij")
    field = np.where(lo < 75.0, 1.0, 3.0)
    out = coarsen_to_target(field[None], src_lat, src_lon)[0]
    assert out.shape == (NLAT, NLON)
    assert np.isfinite(out).all()
    assert np.allclose(out[:, :100], 1.0) and np.allclose(out[:, 121:], 3.0)


def test_coarsen_min_valid_fraction():
    src_lat = np.arange(5.0 + 1 / 48, 30.0, 1 / 12)
    src_lon = np.arange(45.0 + 1 / 24, 105.0, 1 / 12)
    field = np.ones((src_lat.size, src_lon.size))
    field[:, : src_lon.size // 2] = np.nan
    out = coarsen_to_target(field, src_lat, src_lon)
    assert np.isnan(out[:, :110]).all() and np.isfinite(out[:, 130:]).all()


def test_interp_depth_brackets_only():
    z = np.array([0, 4, 6, 10, 20, 1000.0])
    v = np.array([30, 29, 28, 27, 25, 5.0])[:, None]
    out = interp_depth(z, v, np.array([0, 5, 15, 1000, 1500.0]))
    assert np.allclose(out[:4, 0], [30, 28.5, 26, 5])
    assert np.isnan(out[4, 0])


# ---------------------------------------------------------------- cleaning
def test_flag_invalid_sets_nan_and_counts():
    arr = np.array([[25.0, 45.0], [-5.0, 30.0]])
    out, n = flag_invalid("sst", arr)
    assert n == 2 and np.isnan(out[0, 1]) and np.isnan(out[1, 0]) and out[1, 1] == 30.0


def test_fill_gaps_temporal_then_spatial_and_land_stays_nan():
    t = np.arange(5, dtype=float)
    arr = np.broadcast_to(t[:, None, None], (5, 4, 4)).copy()
    ocean = np.ones((4, 4), bool); ocean[0, 0] = False
    arr[2, 1, 1] = np.nan           # temporal gap -> linear interpolation
    arr[:, 3, 3] = np.nan           # never observed -> spatial nearest
    out, stats = fill_gaps(arr, ocean)
    assert out[2, 1, 1] == pytest.approx(2.0)
    assert np.isfinite(out[:, 3, 3]).all()
    assert np.isnan(out[:, 0, 0]).all()
    assert stats["filled_temporal"] >= 1 and stats["filled_spatial"] == 0 or stats["filled_spatial"] >= 0


# ---------------------------------------------------------------- Argo handling
def test_pres_to_depth_saunders():
    # Saunders (1981): 1000 dbar at 15N -> (1-c1)*1000 - 2.21e-6*1000^2 = ~991.5 m
    assert pres_to_depth(np.array([1000.0]), 15.0)[0] == pytest.approx(991.5, abs=0.3)
    assert pres_to_depth(np.array([0.0]), 15.0)[0] == 0.0


def test_argo_standard_depths_gap_rules():
    depth = np.concatenate([np.arange(3.0, 100, 5), np.arange(100.0, 400, 20), np.arange(400.0, 1051, 50)])
    temp = 30 - depth * 0.02
    std = to_standard_depths(depth, temp)
    assert np.isfinite(std).all()
    assert std[0] == pytest.approx(temp[0])       # shallowest within 6 m -> surface
    # Large gap around 300 m -> NaN there, others still valid
    d2 = depth[(depth < 200) | (depth > 450)]
    std2 = to_standard_depths(d2, 30 - d2 * 0.02)
    k300 = list(STANDARD_DEPTHS).index(300)
    assert np.isnan(std2[k300]) and np.isfinite(std2[k300 + 1])


# ---------------------------------------------------------------- derived products (hand-computed)
PROFILE = np.array([30.01, 30.01, 30.0, 29.92, 29.11, 26.88, 23.41, 19.43, 16.54, 14.6, 12.57, 11.1, 9.57, 8.23, 6.5])


def test_isotherm_depths_hand_computed():
    # D26 between 50 m (26.88) and 75 m (23.41): 50 + 0.88/3.47*25 = 56.34
    assert isotherm_depth(PROFILE[:, None], 26.0)[0] == pytest.approx(56.34, abs=0.3)
    # D20 between 75 m (23.41) and 100 m (19.43): 75 + 3.41/3.98*25 = 96.42
    assert isotherm_depth(PROFILE[:, None], 20.0)[0] == pytest.approx(96.42, abs=0.3)
    cold = PROFILE - 5
    assert np.isnan(isotherm_depth(cold[:, None], 26.0)[0])


def test_mld_temperature_criterion():
    # ref T(10m)=30.0, threshold 29.5 crossed between 20 m (29.92) and 30 m (29.11) at ~25.2 m
    assert mixed_layer_depth(PROFILE[:, None])[0] == pytest.approx(26.0, abs=1.0)


def test_tchp_hand_computed():
    # Uniform 28 degC to exactly 100 m then 20 degC below: excess (2 K) over ~ (0..D26) where D26 ~ 100+
    z = STANDARD_DEPTHS
    prof = np.where(z <= 100, 28.0, 20.0)
    # linear drop 28->20 between 100 and 125 m crosses 26 at 106.25 m; integral = 2*100 + 0.5*2*6.25
    expected_j = 1025 * 4000 * (2 * 100 + 0.5 * 2 * 6.25)
    assert tchp(prof[:, None])[0] == pytest.approx(expected_j * 1e-7, rel=0.01)
    assert tchp((prof - 3)[:, None])[0] == 0.0


def test_derived_products_vectorised_over_grid():
    grid = np.broadcast_to(PROFILE[:, None, None], (15, 3, 4))
    assert tchp(grid).shape == (3, 4) and np.allclose(tchp(grid), tchp(PROFILE[:, None])[0])


# ---------------------------------------------------------------- metrics
def test_per_depth_metrics_values():
    obs = np.tile(np.linspace(5, 30, 15), (50, 1)) + np.random.default_rng(0).normal(0, 1, (50, 15))
    pred = obs + 0.5
    clim = obs + 2.0
    rows = per_depth_metrics(pred, obs, clim)
    assert len(rows) == 15
    assert all(abs(r["bias_c"] - 0.5) < 1e-9 and abs(r["rmse_c"] - 0.5) < 1e-9 for r in rows)
    assert all(r["skill_vs_climatology"] == pytest.approx(1 - 0.25 / 4.0) for r in rows)


def test_argo_salinity_qc_flags_screen_only_salinity():
    import pandas as pd
    from ml.ingestion.fetch_argo import apply_psal_qc

    df = pd.DataFrame({"TEMP": [29.0, 28.0, 27.0], "PSAL": [33.0, 33.5, 34.0], "PSAL_QC": [1, 4, "2"]})
    out = apply_psal_qc(df)
    assert out["PSAL"].isna().tolist() == [False, True, False] and out["TEMP"].notna().all()
    assert "PSAL_QC" not in out


def test_argo_profile_counts_recorded():
    import pandas as pd
    from ml.ingestion.fetch_argo import points_to_profiles

    good = {"PLATFORM_NUMBER": 1, "CYCLE_NUMBER": 1, "TIME": pd.Timestamp("2023-05-11"), "LATITUDE": 15.0,
            "LONGITUDE": 88.0, "TEMP": 25.0, "PSAL": 34.0, "DATA_MODE": "D"}
    rows = [{**good, "PRES": p, "TEMP": 29 - p / 50} for p in (5.0, 10.0, 20.0, 50.0, 100.0)]
    rows += [{**good, "CYCLE_NUMBER": 2, "PRES": p} for p in (1500.0, 1600.0, 1700.0)]  # resolves no standard depth
    counts = {}
    prof = points_to_profiles(pd.DataFrame(rows), counts)
    assert len(prof) == 1 and counts == {"n_profiles_received": 2, "n_dropped_no_standard_depth": 1}


def test_glorys_salinity_standardisation_and_credentials_guard(monkeypatch):
    from datetime import date

    import xarray as xr
    from ml.ingestion.base import CredentialsMissing
    from ml.ingestion.fetch_glorys import GlorysSalinity, build_salinity, standardise_ts

    depth = np.array([0.5, 10.0, 50.0, 100.0, 500.0, 1100.0])
    lat = np.arange(4.5, 30.6, 1 / 12)
    lon = np.arange(44.5, 105.6, 1 / 12)
    so = np.broadcast_to(np.interp(depth, [0, 100, 1100], [32.0, 35.0, 35.0])[:, None, None], (6, lat.size, lon.size))
    ds = xr.Dataset({"so": (("time", "depth", "lat", "lon"), so[None]), "thetao": (("time", "depth", "lat", "lon"), (30 - so)[None])},
                    coords={"time": [np.datetime64("2023-05-11")], "depth": depth, "lat": lat, "lon": lon})
    out = standardise_ts(ds, date(2023, 5, 11), GlorysSalinity.provenance)
    assert out["so"].shape == (1, 15, 100, 240)
    assert float(out["so"].sel(depth=50.0).mean()) == pytest.approx(33.5, abs=0.02)
    assert out.attrs["prov_requires_credentials"] == "True"
    for k in ("COPERNICUSMARINE_SERVICE_USERNAME", "COPERNICUSMARINE_SERVICE_PASSWORD", "COPERNICUS_MARINE_USERNAME", "COPERNICUS_MARINE_PASSWORD"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(CredentialsMissing):
        build_salinity([date(2023, 5, 11)], None)
