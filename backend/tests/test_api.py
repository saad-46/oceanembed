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
    assert b"provenance" in csv.content


def test_report_depth_and_validation(client):
    ok = client.get("/v1/report/2023-05-11", params={"lat": 15, "lon": 88, "depth": 200})
    assert ok.status_code == 200 and ok.content[:4] == b"%PDF"
    bad = client.get("/v1/report/2023-05-11", params={"lat": 15, "lon": 88, "depth": 37})
    assert bad.status_code == 422 and bad.json()["error"] == "invalid_depth"
    land = client.get("/v1/report/2023-05-11", params={"lat": 25, "lon": 80})
    assert land.status_code == 422 and land.json()["error"] == "on_land"


def test_report_pdf_content_is_product_neutral():
    """The generated document carries OceanSight branding, investigation metadata and provenance only."""
    import re
    import zlib

    import numpy as np

    from app.services import report
    from ml.config import LATS, LONS
    p = {"date": "2023-05-11", "requested_date": "2023-05-11", "lat": 15.0, "lon": 88.0, "cell": {"lat": 15.125, "lon": 88.125},
         "depths_m": [0, 100, 1000], "temperature_c": [29.0, 22.0, 6.0], "uncertainty_c": [0.3, 1.2, 0.2],
         "baseline_climatology_c": [28.5, 21.0, 6.1], "derived": {"tchp_kj_cm2": 80.0, "mld_m": 30.0, "d26_m": 60.0, "d20_m": 110.0},
         "nearest_argo_float": None, "model_version": "cnn-unet-v1", "data_label": "cached"}
    field = np.full((LATS.size, LONS.size), 25.0)
    pdf = report.profile_pdf(p, "Summary.", "Validation line.", inset=report.map_inset(field, LATS, LONS, 15.125, 88.125, 100.0),
                             depth=100.0, period="2019-01-01..2023-12-31")
    streams = re.findall(rb"stream\s*(.*?)\s*endstream", pdf, re.S)
    text = pdf + b"".join(_inflate(s) for s in streams)
    assert b"OceanSight" in text and b"Water-column report" in text and b"Measured" in text
    for banned in (b"SIH", b"OceanEmbed", b"INCOIS", b"hackathon", b"Proof-of-concept"):
        assert banned not in text and banned not in pdf


def test_meta_and_openapi_are_product_neutral(client):
    m = client.get("/v1/meta").json()
    assert "problem_statement" not in m and m["tagline"] == "Subsurface Ocean Intelligence"
    spec = client.get("/openapi.json").text
    for banned in ("SIH", "OceanEmbed", "hackathon", "docs/", "Fuel Gauge"):
        assert banned not in spec
    cav = client.get("/v1/validation/summary", params={"split": "test"}).json()["caveat"]
    assert "docs/" not in cav and "our model" not in cav and "OceanSight" in cav


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


# ---------- Ocean State Timeline
def test_timeline_valid(client):
    r = client.get("/v1/timeline", params={"lat": 15, "lon": 88, "start": "2023-05-10", "end": "2023-05-12"})
    assert r.status_code == 200
    t = r.json()
    assert t["dates"] == ["2023-05-10", "2023-05-11", "2023-05-12"] and t["stride_days"] == 1
    assert len(t["temperature_c"]) == 15 and len(t["temperature_c"][0]) == 3  # [depth][time]
    assert t["temperature_c"][0][1] == pytest.approx(29.5, abs=0.02)  # fixture: analytic profile + 0.5
    assert len(t["mld_m"]) == len(t["d20_m"]) == len(t["d26_m"]) == 3
    assert t["d20_m"][0] is not None and t["d26_m"][0] < t["d20_m"][0]  # warmer isotherm is shallower
    assert t["climatology_c"][0][0] == pytest.approx(29.0, abs=0.05)
    assert t["notice"] is None and t["model_version"] == "cnn-unet-v1"


def test_timeline_invalid_coordinates(client):
    assert client.get("/v1/timeline", params={"lat": 40, "lon": 88}).json()["error"] == "out_of_domain"
    assert client.get("/v1/timeline", params={"lat": 25, "lon": 80}).json()["error"] == "on_land"
    assert client.get("/v1/timeline", params={"lon": 88}).status_code == 422  # lat required


def test_timeline_invalid_and_unsupported_ranges(client):
    rev = client.get("/v1/timeline", params={"lat": 15, "lon": 88, "start": "2023-05-12", "end": "2023-05-10"})
    assert rev.status_code == 422 and rev.json()["error"] == "invalid_range"
    out = client.get("/v1/timeline", params={"lat": 15, "lon": 88, "start": "2030-01-01", "end": "2030-02-01"})
    assert out.status_code == 404 and out.json()["error"] == "date_out_of_range"
    bad = client.get("/v1/timeline", params={"lat": 15, "lon": 88, "start": "2023-02-30"})
    assert bad.status_code == 422
    big = client.get("/v1/timeline", params={"lat": 15, "lon": 88, "stride_days": 99})
    assert big.status_code == 422  # stride bound


def test_timeline_range_limit_and_clipping(client, monkeypatch):
    from app.api import grid
    monkeypatch.setattr(grid, "TIMELINE_MAX_SAMPLES", 2)
    too = client.get("/v1/timeline", params={"lat": 15, "lon": 88, "start": "2023-05-10", "end": "2023-05-12", "stride_days": 1})
    assert too.status_code == 422 and too.json()["error"] == "range_too_large"
    auto = client.get("/v1/timeline", params={"lat": 15.1, "lon": 88.1, "start": "2023-05-10", "end": "2023-05-12"}).json()
    assert auto["stride_days"] == 2 and len(auto["dates"]) <= 2
    monkeypatch.undo()
    clip = client.get("/v1/timeline", params={"lat": 15, "lon": 88, "start": "2023-05-01", "end": "2023-05-11"}).json()
    assert clip["start"] == "2023-05-10" and "clipped" in clip["notice"]


def test_timeline_missing_data_is_null_and_cached(client):
    # fixture: 1000 m is "shallow" (masked) west of column 60 -> nulls, never invented values
    r = client.get("/v1/timeline", params={"lat": 15, "lon": 55, "start": "2023-05-10", "end": "2023-05-12"}).json()
    assert r["temperature_c"][-1] == [None, None, None]
    assert r["temperature_c"][0][0] is not None
    again = client.get("/v1/timeline", params={"lat": 15, "lon": 55, "start": "2023-05-10", "end": "2023-05-12"}).json()
    assert again["temperature_c"] == r["temperature_c"]
    from app.api import grid
    assert len(grid._timeline_cache) >= 1


# ---------- interactive vertical section
def test_section_meridional_and_variables(client):
    m = client.get("/v1/section/2023-05-11", params={"orientation": "meridional", "lon": 88, "lat_min": 5, "lat_max": 20}).json()
    # grid cells are centred on x.125 / x.375 ...: the section uses the containing cells, never interpolates
    assert m["x_name"] == "lat" and m["lon"] == pytest.approx(88.0, abs=0.13) and m["x"][0] == pytest.approx(5.0, abs=0.13)
    assert len(m["values"]) == 15 and len(m["values"][0]) == len(m["x"]) and len(m["x"]) >= 59
    z = client.get("/v1/section/2023-05-11", params={"lat": 15, "lon_min": 80, "lon_max": 90}).json()
    assert z["x_name"] == "lon" and z["temperature_c"] == z["values"]  # legacy key kept
    a = client.get("/v1/section/2023-05-11", params={"lat": 15, "lon_min": 80, "lon_max": 90, "variable": "anomaly"}).json()
    assert a["values"][0][0] == pytest.approx(0.5, abs=0.05)  # fixture: +0.5 degC over climatology
    u = client.get("/v1/section/2023-05-11", params={"lat": 15, "lon_min": 80, "lon_max": 90, "variable": "uncertainty"}).json()
    assert u["values"][0][0] is not None and u["values"][0][0] >= 0.3


def test_section_invalid_inputs(client):
    base = "/v1/section/2023-05-11"
    assert client.get(base, params={"orientation": "meridional", "lat_min": 20, "lat_max": 10}).json()["error"] == "invalid_request"
    assert client.get(base, params={"lat": 15, "lon_min": 80, "lon_max": 80.1}).json()["error"] == "invalid_request"  # < 2 cells
    assert client.get(base, params={"orientation": "diagonal"}).status_code == 422
    assert client.get(base, params={"variable": "salinity"}).status_code == 422
    assert client.get(base, params={"lat": 99}).status_code == 422
    assert client.get("/v1/section/2023-13-01").status_code == 422
    assert client.get("/v1/section/2030-01-01").json()["error"] == "date_out_of_range"


def _inflate(b: bytes) -> bytes:
    """Decode a reportlab content stream (ASCII85 + Flate) to its raw drawing operators."""
    import base64
    import zlib
    b = b.strip()
    try:
        if b.endswith(b"~>"):
            b = base64.a85decode(bytes(c for c in b[:-2] if c not in (10, 13)))
        return zlib.decompress(b)
    except Exception:
        return b""


def test_summary_compares_with_climatology_instead_of_asserting_typicality():
    from app.services.assistant import template_summary
    p = {"date": "2023-05-11", "temperature_c": [30.5] + [None] * 14, "baseline_climatology_c": [29.0] + [None] * 14,
         "derived": {"mld_m": 20.0, "d26_m": 60.0, "d20_m": 110.0, "tchp_kj_cm2": 70.0}}
    s = template_summary(p)
    assert "1.5°C warmer than the pre-monsoon seasonal climatology" in s and "typical" not in s
    p["temperature_c"][0] = 29.1
    assert "close to the pre-monsoon seasonal climatology" in template_summary(p)


def test_cors_exact_origins_and_optional_preview_regex(monkeypatch):
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.main import create_app

    def allowed(origin: str) -> str | None:
        with TestClient(create_app()) as c:
            r = c.options("/health", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
        return r.headers.get("access-control-allow-origin")

    monkeypatch.setenv("CORS_ORIGINS", "https://oceanembed.vercel.app")
    monkeypatch.delenv("CORS_ORIGIN_REGEX", raising=False)
    get_settings.cache_clear()
    try:
        assert allowed("https://oceanembed.vercel.app") == "https://oceanembed.vercel.app"
        assert allowed("https://oceanembed-git-x-team.vercel.app") is None  # no wildcard by default
        assert allowed("https://evil.example") is None
        monkeypatch.setenv("CORS_ORIGIN_REGEX", r"https://oceanembed-[a-z0-9-]+\.vercel\.app")
        get_settings.cache_clear()
        assert allowed("https://oceanembed-git-x-team.vercel.app") == "https://oceanembed-git-x-team.vercel.app"
        assert allowed("https://oceanembed-x.vercel.app.evil.example") is None
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------- production readiness
def test_health_is_always_200_and_reports_components(client):
    r = client.get("/health")
    assert r.status_code == 200
    b = r.json()
    assert b["reconstruction_store"] == "ok" and b["model_version"] == "cnn-unet-v1"
    assert b["database"] in ("ok", "unavailable") and b["status"] in ("ok", "degraded")


def test_ready_200_with_store_and_root_index(client):
    r = client.get("/ready")
    assert r.status_code == 200 and r.json()["ready"] is True
    assert client.get("/").json()["ready"] == "/ready"
    assert client.get("/openapi.json").status_code == 200 and client.get("/docs").status_code == 200


def test_ready_503_when_the_reconstruction_store_is_missing(client, data_dir, tmp_path):
    from app.config import Settings
    from app.services import store as store_mod

    store_mod.reset_store(Settings(oceanembed_data_dir=tmp_path))  # empty data dir
    try:
        r = client.get("/ready")
        assert r.status_code == 503
        assert r.json()["ready"] is False and r.json()["reconstruction_store"] == "missing"
        assert client.get("/health").status_code == 200  # liveness stays up
        g = client.get("/v1/grid/2023-05-11?depth=100")
        assert g.status_code == 503 and g.json()["error"] == "data_unavailable"  # typed, not a stack trace
    finally:
        store_mod.reset_store(Settings(oceanembed_data_dir=data_dir))


def test_cors_headers_on_real_get_and_post_preflight_from_the_frontend_origin(monkeypatch, client):
    from fastapi.testclient import TestClient

    from app.config import get_settings
    from app.main import create_app

    origin = "https://oceanembed.vercel.app"
    monkeypatch.setenv("CORS_ORIGINS", origin)
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            g = c.get("/v1/regions", headers={"Origin": origin})
            assert g.status_code == 200 and g.headers["access-control-allow-origin"] == origin
            p = c.options("/v1/region/stats", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                                       "Access-Control-Request-Headers": "content-type"})
            assert p.status_code == 200 and p.headers["access-control-allow-origin"] == origin
            assert "POST" in p.headers["access-control-allow-methods"]
            bad = c.get("/v1/regions", headers={"Origin": "https://evil.example"})
            assert "access-control-allow-origin" not in bad.headers
            e = c.get("/v1/grid/not-a-date", headers={"Origin": origin})  # errors carry CORS headers too
            assert e.status_code == 422 and e.json()["error"] == "invalid_request"
            assert e.headers["access-control-allow-origin"] == origin
    finally:
        get_settings.cache_clear()


def test_database_url_from_a_managed_host_is_normalised_to_the_psycopg3_driver():
    from app.config import Settings

    for given in ("postgres://u:p@h:5432/d?sslmode=require", "postgresql://u:p@h:5432/d?sslmode=require"):
        assert Settings(database_url=given).database_url == "postgresql+psycopg://u:p@h:5432/d?sslmode=require"
    keep = "postgresql+psycopg://u:p@h:5432/d"
    assert Settings(database_url=keep).database_url == keep
