"""API contract tests (docs/17): correct schema for valid input, typed errors for invalid input."""
import time

import numpy as np
import pytest

from conftest import analytic_profile


def test_meta_and_regions(client):
    m = client.get("/v1/meta").json()
    assert m["production_model"] == "cnn-unet-v1"
    assert m["depths_m"] == [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
    assert m["period"] == {"start": "2023-05-10", "end": "2023-05-12", "n_days": 3}
    names = [r["name"] for r in client.get("/v1/regions").json()["regions"]]
    assert "Bay of Bengal" in names and "Arabian Sea" in names


def test_grid_valid(client):
    r = client.get("/v1/grid/2023-05-11", params={"depth": 100})
    assert r.status_code == 200
    g = r.json()
    assert g["depth_m"] == 100 and g["source"] == "cached_reconstruction" and g["data_label"] == "cached"
    vals = np.array([[np.nan if v is None else v for v in row] for row in g["grid"]["values"]], float)
    assert vals.shape == (100, 240)
    k = 7  # 100 m
    assert np.nanmax(np.abs(vals - (analytic_profile()[k] + 0.5))) < 0.02  # int16 x 0.01 round-trip
    assert np.isnan(vals[:, 0]).all()  # land column
    assert g["notice"] is None


def test_grid_uncertainty_and_anomaly(client):
    u = client.get("/v1/grid/2023-05-11", params={"depth": 0, "variable": "uncertainty"}).json()
    assert u["stats"]["mean"] == pytest.approx(0.3, abs=0.01)
    a = client.get("/v1/grid/2023-05-11", params={"depth": 0, "variable": "anomaly"}).json()
    assert a["stats"]["mean"] == pytest.approx(0.5, abs=0.02)  # fixture is climatology + 0.5


def test_grid_nearest_day_notice(client):
    g = client.get("/v1/grid/2023-05-14", params={"depth": 0}).json()
    assert g["date"] == "2023-05-12" and "nearest available day" in g["notice"]


@pytest.mark.parametrize("path,params,status,code", [
    ("/v1/grid/2023-05-11", {"depth": 42}, 422, "invalid_depth"),
    ("/v1/grid/2021-01-01", {"depth": 0}, 404, "date_out_of_range"),
    ("/v1/grid/not-a-date", {"depth": 0}, 422, "invalid_request"),
    ("/v1/grid/2023-05-11", {"depth": 0, "model": "nope"}, 422, "unknown_model"),
    ("/v1/profile/2023-05-11", {"lat": 40, "lon": 88}, 422, "out_of_domain"),
    ("/v1/profile/2023-05-11", {"lat": 15, "lon": 46}, 422, "on_land"),
    ("/v1/profile/2023-05-11", {"lat": 15}, 422, "invalid_request"),
])
def test_typed_errors(client, path, params, status, code):
    r = client.get(path, params=params)
    assert r.status_code == status, r.text
    body = r.json()
    assert body["error"] == code and "detail" in body and "Traceback" not in r.text


def test_profile_contract(client):
    p = client.get("/v1/profile/2023-05-11", params={"lat": 15.0, "lon": 88.0}).json()
    assert len(p["temperature_c"]) == 15 and len(p["uncertainty_c"]) == 15 and len(p["baseline_climatology_c"]) == 15
    assert p["temperature_c"][0] == pytest.approx(29.5, abs=0.02)
    assert p["comparisons"]["baseline-lightgbm-v1"][0] == pytest.approx(29.3, abs=0.02)
    assert set(p["derived"]) == {"mld_m", "d20_m", "d26_m", "tchp_kj_cm2"}
    assert p["derived"]["tchp_kj_cm2"] > 0
    assert p["nearest_argo_float"] is None  # DB overridden away
    # path-parameter variant from docs/12
    assert client.get("/v1/profile/2023-05-11/15.0/88.0").status_code == 200


def test_region_stats_and_bbox_validation(client):
    body = {"date": "2023-05-11", "bbox": {"min_lat": 10, "max_lat": 20, "min_lon": 82, "max_lon": 95}}
    s = client.post("/v1/region/stats", json=body).json()
    assert s["n_ocean_cells"] > 0 and s["mean_tchp_kj_cm2"] > 0
    assert s["barrier_layer_flag"] is True  # fixture SSS = 32 PSU east of 80E
    bad = client.post("/v1/region/stats", json={"date": "2023-05-11", "bbox": {"min_lat": 20, "max_lat": 10, "min_lon": 82, "max_lon": 95}})
    assert bad.status_code == 422 and bad.json()["error"] == "invalid_request"
    land = client.post("/v1/region/stats", json={"date": "2023-05-11", "bbox": {"min_lat": 10, "max_lat": 12, "min_lon": 45, "max_lon": 49}})
    assert land.json()["error"] == "no_ocean_cells"


def test_region_timeseries(client):
    r = client.post("/v1/region/timeseries", json={"bbox": {"min_lat": 10, "max_lat": 20, "min_lon": 82, "max_lon": 95},
                                                   "stride_days": 1, "product": "tchp"}).json()
    assert r["dates"] == ["2023-05-10", "2023-05-11", "2023-05-12"] and all(v > 0 for v in r["values"])


def test_product_grid(client):
    g = client.get("/v1/grid/2023-05-11/product", params={"product": "d20"}).json()
    assert g["units"] == "m" and g["stats"]["min"] > 0


def test_validation_headline_embedding(client):
    v = client.get("/v1/validation/summary").json()
    assert len(v["per_depth"]) == 15 and v["caveat"] and v["independent"] is True
    h = client.get("/v1/summary/headline").json()
    assert h["validation"]["n_independent_profiles"] == 10
    assert client.get("/v1/embedding/projection").json()["n_points"] == 1


def test_assistant_template_fallback(client):
    r = client.post("/v1/assistant/query", json={"lat": 15, "lon": 88, "date": "2023-05-11"}).json()
    assert r["source"] in ("template_fallback", "llm") and "°C" in r["summary"]


def test_reports(client):
    pdf = client.get("/v1/report/2023-05-11", params={"lat": 15, "lon": 88, "format": "pdf"})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    csv = client.get("/v1/report/2023-05-11", params={"lat": 15, "lon": 88, "format": "csv"})
    assert csv.status_code == 200 and b"depth_m,temperature_c" in csv.content


def test_cached_lookup_is_fast(client):
    client.get("/v1/grid/2023-05-11", params={"depth": 50})
    t = time.perf_counter()
    for _ in range(5):
        assert client.get("/v1/grid/2023-05-11", params={"depth": 50}).status_code == 200
        assert client.get("/v1/profile/2023-05-11", params={"lat": 15, "lon": 88}).status_code == 200
    assert (time.perf_counter() - t) / 10 < 0.5  # docs/17: < 500 ms per cached lookup


def test_section_endpoint(client):
    r = client.get("/v1/section/2023-05-11", params={"lat": 15, "lon_min": 80, "lon_max": 97}).json()
    assert len(r["depths_m"]) == 15 and len(r["temperature_c"]) == 15
    assert len(r["temperature_c"][0]) == len(r["lon"]) > 50
    assert r["temperature_c"][0][-1] == pytest.approx(29.5, abs=0.02)
    bad = client.get("/v1/section/2023-05-11", params={"lon_min": 97, "lon_max": 80})
    assert bad.status_code == 422


def test_headline_counts(client):
    h = client.get("/v1/summary/headline").json()
    assert h["n_argo_profiles_total"] == 10 and h["n_models_compared"] == 3
