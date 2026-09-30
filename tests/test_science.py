"""Scientific validation of ml.science on synthetic profiles with known answers (docs/17)."""
import numpy as np
import pytest

from ml.config import LATS, LONS, STANDARD_DEPTHS
from ml.science import forecast, seawater, stratification, volume

Z = STANDARD_DEPTHS


def piecewise(points):
    """Temperature on the standard depths, linear between (depth, value) knots."""
    zz, vv = zip(*points)
    return np.interp(Z, zz, vv)


# ---------------------------------------------------------------- thermocline
def test_thermocline_at_known_strongest_layer():
    # mixed 28 degC to 50 m, gentle to 75 m, 10 degC drop across 75-100 m (0.4 degC/m), then gentle
    t = piecewise([(0, 28), (50, 28), (75, 27), (100, 17), (300, 12), (1000, 6)])
    r = stratification.thermocline(t, mld=50.0)
    assert r["depth_m"] == pytest.approx(87.5)
    assert r["depth_range_m"] == [75.0, 100.0]
    assert r["strength_per_m"] == pytest.approx(0.4, abs=1e-6)
    assert r["gradient_per_m"] == pytest.approx(-0.4, abs=1e-6)
    assert r["quality"] == "good", r["quality_reasons"]
    assert len(r["gradient_profile"]) == np.searchsorted(Z, 500) and r["analysis_range_m"] == [0.0, 500.0]


def test_thermocline_excludes_layers_inside_mixed_layer():
    # a strong near-surface gradient (diurnal warm layer) above a 40 m mixed layer must not win
    t = piecewise([(0, 30), (5, 28.5), (40, 28.4), (75, 26), (100, 22), (1000, 6)])
    r = stratification.thermocline(t, mld=40.0)
    assert r["depth_range_m"][0] >= 30 and r["depth_m"] == pytest.approx(87.5)
    unrestricted = stratification.thermocline(t, mld=None)
    assert unrestricted["depth_m"] == pytest.approx(2.5)


def test_thermocline_weak_stratification_is_insufficient():
    t = piecewise([(0, 26.0), (1000, 25.0)])  # 0.001 degC/m everywhere
    r = stratification.thermocline(t)
    assert r["quality"] == "insufficient" and r["depth_m"] is None
    assert "no well-defined maximum" in r["quality_reasons"][0]


def test_thermocline_coarse_and_edge_are_limited():
    t = piecewise([(0, 20), (300, 19.5), (500, 9), (1000, 7)])  # peak in the 300-500 m layer
    r = stratification.thermocline(t, max_depth=500)
    assert r["depth_m"] == pytest.approx(400) and r["quality"] == "limited"
    assert any("coarse" in x for x in r["quality_reasons"])
    assert any("lower edge" in x for x in r["quality_reasons"])


def test_thermocline_unrealistic_gradient_excluded_and_missing_levels():
    t = piecewise([(0, 29), (5, 29), (10, 18), (20, 17.8), (75, 16), (100, 12), (1000, 5)]).astype(object)
    t[12:] = None  # below the seabed
    r = stratification.thermocline(list(t))
    assert r["depth_m"] == pytest.approx(87.5)  # 5-10 m (2.2 degC/m) rejected as an artefact
    assert r["quality"] == "limited" and any("unrealistic" in x for x in r["quality_reasons"])
    assert r["n_levels_used"] == 12


def test_thermocline_too_few_levels():
    t = [29, 28, 20] + [None] * 12
    assert stratification.thermocline(t)["quality"] == "insufficient"


# ---------------------------------------------------------------- halocline (native, noisy)
def native_bay_of_bengal(spike=False):
    z = np.arange(2.0, 400.0, 1.0)
    s = np.interp(z, [0, 20, 30, 400], [31.0, 31.0, 34.0, 35.0])
    t = np.interp(z, [0, 40, 120, 400], [29.5, 29.5, 18.0, 11.0])
    rng = np.random.default_rng(1)
    s = s + rng.normal(0, 0.005, z.size)
    if spike:
        s[60] += 5.0
    return z, t, s


def test_halocline_known_depth_after_binning():
    z, _, s = native_bay_of_bengal()
    zz, ss, _ = stratification.qc_native(z, s, "salinity")
    zb, sb = stratification.bin_average(zz, ss, max_depth=500)
    r = stratification.halocline(sb, zb, max_layer_m=stratification.MAX_NATIVE_GAP_M)
    assert 20 <= r["depth_m"] <= 30 and r["gradient_per_m"] > 0.25
    assert r["sense"] == "salinity increases with depth" and r["quality"] == "good"


def test_argo_spike_and_range_tests():
    z, _, s = native_bay_of_bengal(spike=True)
    s = s.copy()
    s[100] = 55.0  # outside the Argo global range 2-41
    zz, ss, counts = stratification.qc_native(z, s, "salinity")
    assert counts["n_failed_range"] == 1 and counts["n_failed_spike"] >= 1
    assert ss.max() < 36 and 62.0 not in zz  # the spiked level (z = 62 m) is removed


def test_halocline_absent_in_uniform_salinity():
    z = np.arange(0, 300, 5.0)
    r = stratification.halocline(np.full(z.size, 35.0), z)
    assert r["quality"] == "insufficient" and r["depth_m"] is None


# ---------------------------------------------------------------- TEOS-10
@pytest.mark.parametrize("sp,t,expected", [(35, 25, 23.343), (35, 0, 28.106), (0, 5, -0.033)])
def test_density_matches_eos80_check_values(sp, t, expected):
    # UNESCO (1981) check values for sigma at p = 0; TEOS-10 agrees within the documented 0.01 kg/m3
    p = seawater.properties([0.0], [t], [sp], lat=15.0, lon=88.0)
    assert p["sigma0"][0] == pytest.approx(expected, abs=0.01)
    assert p["potential_temperature"][0] == pytest.approx(t, abs=1e-6)  # at the surface theta == t


def test_potential_temperature_below_in_situ_at_depth():
    p = seawater.properties([1000.0], [5.0], [35.0], lat=15.0, lon=88.0)
    assert 0.05 < 5.0 - p["potential_temperature"][0] < 0.15 and p["pressure_dbar"][0] == pytest.approx(1008, abs=3)


def test_density_mixed_layer_and_barrier_layer():
    z, t, s = native_bay_of_bengal()
    props = seawater.properties(z, t, s, 15.0, 88.0)
    ml = seawater.mixed_layers(z, t, props["sigma0"])
    # fresh cap: density rises through the 20-30 m halocline while temperature stays mixed to ~40 m
    assert 19 < ml["mld_density_m"] < 22
    assert 40 < ml["isothermal_layer_depth_m"] < 45
    assert ml["barrier_layer_thickness_m"] == pytest.approx(ml["isothermal_layer_depth_m"] - ml["mld_density_m"], abs=0.11)


def test_isopycnals_are_consistent_with_density():
    lines = seawater.isopycnals((33.0, 36.0), (5.0, 30.0), 15.0, 88.0)
    assert len(lines) >= 4
    for ln in lines:
        s, th = np.array(ln["points"]).T
        sig = seawater.properties(np.zeros(s.size), th, s, 15.0, 88.0)["sigma0"]
        assert np.allclose(sig, ln["sigma0"], atol=0.01)


# ---------------------------------------------------------------- short-horizon estimate
def test_trend_extrapolates_a_linear_series_exactly():
    t = np.arange(120)
    y = 20 + 0.1 * t[:, None] + np.zeros((1, 3))
    r = forecast.estimate(t, y, 100)
    assert np.allclose(r["horizons"][1]["trend"], 20 + 0.1 * 101)
    assert np.allclose(r["horizons"][2]["trend"], 20 + 0.1 * 102)
    assert np.allclose(r["horizons"][2]["persistence"], 20 + 0.1 * 100)
    assert np.allclose(r["hindcast"][1]["trend"]["rmse"], 0, atol=1e-9)
    assert np.allclose(r["hindcast"][1]["persistence"]["rmse"], 0.1)
    assert np.allclose(r["hindcast"][2]["persistence"]["rmse"], 0.2)
    assert r["hindcast"][1]["trend"]["n_pairs"] == 60


def test_forecast_uses_only_past_days():
    t = np.arange(120)
    y = np.where(t[:, None] <= 100, 10.0, 99.0) + np.zeros((1, 2))  # a jump after the issue day
    r = forecast.estimate(t, y, 100)
    assert np.allclose(r["horizons"][1]["trend"], 10.0) and np.allclose(r["horizons"][1]["persistence"], 10.0)


def test_insufficient_history():
    t = np.arange(15)
    with pytest.raises(forecast.InsufficientHistory):
        forecast.estimate(t, np.ones((15, 2)), 14)
    with pytest.raises(forecast.InsufficientHistory):  # issue day itself missing
        forecast.estimate(np.r_[np.arange(90), 95], np.ones((91, 2)), 93)


# ---------------------------------------------------------------- 3-D sampling
def test_volume_sample_respects_budget_and_counts():
    field = np.ones((15, LATS.size, LONS.size), np.float32)
    r = volume.sample(field, LATS, LONS, STANDARD_DEPTHS, lat_range=(5, 22), lon_range=(80, 100),
                      depth_index=np.arange(15), max_points=20_000)
    ni = ((LATS >= 5) & (LATS <= 22)).sum()
    nj = ((LONS >= 80) & (LONS <= 100)).sum()
    assert (ni, nj) == (68, 80) and r["stride"] == 3
    assert r["value"].size == -(-68 // 3) * -(-80 // 3) * 15 <= 20_000


def test_volume_sample_drops_land_and_honours_stride_floor():
    field = np.ones((15, LATS.size, LONS.size), np.float32)
    field[:, :, :40] = np.nan  # land west of 55E
    r = volume.sample(field, LATS, LONS, STANDARD_DEPTHS, lat_range=(5, 30), lon_range=(45, 105),
                      depth_index=np.array([0, 7]), stride=4)
    assert r["stride"] >= 4 and np.all(r["lon"] > 55) and set(np.unique(r["depth"])) == {0.0, 100.0}
