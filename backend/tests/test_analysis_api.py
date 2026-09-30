"""Contract + known-answer tests for the stratification, T-S, surface-layer, forecast, 3-D,
data-quality and lineage endpoints (all against the SIMULATED fixture store)."""
import numpy as np
import pytest

D = "2023-05-11"


def test_meta_reports_layer_availability(client):
    m = client.get("/v1/meta").json()
    layers = m["layers"]
    for k in ("temp", "anomaly", "uncertainty", "tchp", "sss", "sla", "wind"):
        assert layers[k]["status"] == "available", k
    assert layers["salinity_subsurface"]["status"] == "not_configured"
    assert "Copernicus" in layers["salinity_subsurface"]["detail"]
    assert layers["argo_salinity"]["status"] == "available"
    assert m["optional_sources"]["copernicus_marine"]["status"] == "not_configured"
    assert "PASSWORD" not in str(m["optional_sources"]).replace("COPERNICUSMARINE_SERVICE_PASSWORD", "")


# ---------------------------------------------------------------- stratification
def test_stratification_reconstructed_and_observed(client):
    r = client.get("/v1/stratification", params={"lat": 15, "lon": 88, "date": D})
    assert r.status_code == 200, r.text
    s = r.json()
    rec = s["reconstructed"]
    # analytic profile 6 + 23 exp(-z/120) (+0.5): cooling is fastest at the top; the mixed layer (~13 m)
    # excludes 0-10 m, so the thermocline is the 10-20 m layer
    assert rec["mld_m"] == pytest.approx(13, abs=2)
    th = rec["thermocline"]
    assert th["depth_m"] == 15.0 and th["depth_range_m"] == [10.0, 20.0] and th["quality"] in ("good", "limited")
    expected = (23 * (np.exp(-20 / 120) - np.exp(-10 / 120))) / 10
    assert th["gradient_per_m"] == pytest.approx(expected, abs=0.003)
    assert rec["provenance"]["classification"] == "derived" and rec["provenance"]["lineage_id"] == "thermocline"
    assert rec["d20_m"] is not None and rec["d26_m"] is not None
    # nearest measured profile: the held-out float ~15 km away on the same day
    assert s["observed_status"]["status"] == "available"
    obs = s["observed"]
    assert obs["argo"]["platform_number"] == "2902001" and obs["argo"]["independent"] is True
    assert obs["argo"]["distance_km"] == pytest.approx(15.2, abs=0.5)
    assert obs["provenance"]["classification"] == "measured"
    assert 20 <= obs["halocline"]["depth_m"] <= 30 and obs["halocline"]["sense"] == "salinity increases with depth"
    assert 40 <= obs["thermocline"]["depth_m"] <= 120
    ml = obs["mixed_layers"]  # true crossing 20.1 m; 5 m bins resolve it to within one bin
    assert 17 < ml["mld_density_m"] < 23 and 40 < ml["isothermal_layer_depth_m"] < 46 and ml["barrier_layer_thickness_m"] > 15
    assert obs["qc"]["salinity"]["n_failed_range"] == 0
    assert s["reanalysis_salinity"] is None and s["reanalysis_status"]["status"] == "not_configured"
    assert {"mld", "thermocline", "d20", "d26", "halocline"} <= set(s["diagnostics"])


def test_stratification_observed_states(client):
    no_sal = client.get("/v1/stratification", params={"lat": 12, "lon": 70, "date": "2023-05-12"}).json()
    assert no_sal["observed_status"]["status"] == "no_salinity" and no_sal["observed"]["halocline"] is None
    none = client.get("/v1/stratification", params={"lat": 25, "lon": 60, "date": D}).json()
    assert none["observed_status"]["status"] == "none_nearby" and none["observed"] is None
    deeper = client.get("/v1/stratification", params={"lat": 15, "lon": 88, "date": D, "max_depth": 1000}).json()
    assert deeper["reconstructed"]["thermocline"]["analysis_range_m"] == [0.0, 1000.0]


@pytest.mark.parametrize("params,status,code", [
    ({"lat": 15, "lon": 46, "date": D}, 422, "on_land"),
    ({"lat": 40, "lon": 88, "date": D}, 422, "out_of_domain"),
    ({"lat": 15, "lon": 88, "date": D, "max_depth": 50}, 422, "invalid_request"),
    ({"lat": 15, "lon": 88, "date": "2020-01-01"}, 404, "date_out_of_range"),
    ({"lat": 15, "lon": 88}, 422, "invalid_request"),
])
def test_stratification_typed_errors(client, params, status, code):
    r = client.get("/v1/stratification", params=params)
    assert r.status_code == status and r.json()["error"] == code


# ---------------------------------------------------------------- T-S
def test_ts_profile_measured_points_density_and_isopycnals(client):
    r = client.get("/v1/ts-profile", params={"lat": 15, "lon": 88, "date": D})
    assert r.status_code == 200, r.text
    ts = r.json()
    pts = ts["observed"]["points"]
    assert len(pts) > 100 and ts["observed"]["provenance"]["classification"] == "measured"
    sig = np.array([p["sigma0_kg_m3"] for p in pts])
    assert np.all(np.diff(sig) > -0.01)  # statically stable profile
    top = pts[0]
    assert top["salinity_psu"] == pytest.approx(31.0, abs=0.01) and 18.0 < top["sigma0_kg_m3"] < 19.0
    deep = pts[-1]
    assert deep["potential_temperature_c"] < deep["temperature_c"]  # adiabatic correction at depth
    assert len(ts["isopycnals"]) >= 3 and all(len(l["points"]) >= 2 for l in ts["isopycnals"])
    assert "temperature only" in ts["reconstructed_note"] and ts["reanalysis"] is None
    assert ts["reanalysis_status"]["status"] == "not_configured" and "TEOS-10" in ts["method"]


def test_ts_profile_without_salinity_or_floats(client):
    a = client.get("/v1/ts-profile", params={"lat": 12, "lon": 70, "date": "2023-05-12"}).json()
    assert a["observed"] is None and a["observed_status"]["status"] == "no_salinity" and a["isopycnals"] == []
    b = client.get("/v1/ts-profile", params={"lat": 25, "lon": 60, "date": D}).json()
    assert b["observed_status"]["status"] == "none_nearby"
    assert client.get("/v1/ts-profile", params={"lat": 15, "lon": 88, "date": D, "radius_km": 1000}).status_code == 422


# ---------------------------------------------------------------- surface layers
def test_surface_sla_wind_sss(client):
    sla = client.get(f"/v1/surface/{D}", params={"variable": "sla"}).json()
    assert sla["units"] == "cm" and sla["provenance"]["classification"] == "satellite"
    vals = np.array([[np.nan if v is None else v for v in row] for row in sla["grid"]["values"]])
    i = int(np.floor((20.125 - 5) / 0.25))
    assert np.nanmean(vals[i]) == pytest.approx(0.1 * (20.125 - 15), abs=0.02)  # 1 mm per degree -> cm
    wind = client.get(f"/v1/surface/{D}", params={"variable": "wind_speed"}).json()
    assert wind["stats"]["mean"] == pytest.approx(7.1, abs=0.05) and wind["units"] == "m/s"
    assert "not an ocean current" in wind["provenance"]["note"]
    sss = client.get(f"/v1/surface/{D}", params={"variable": "sss"}).json()
    assert sss["units"] == "PSU" and {sss["stats"]["min"], sss["stats"]["max"]} == {32.0, 36.0}
    assert client.get(f"/v1/surface/{D}", params={"variable": "currents"}).json()["error"] == "invalid_request"
    assert client.get("/v1/surface/2020-01-01", params={"variable": "sla"}).status_code == 404


def test_wind_vectors_direction_convention(client):
    w = client.get(f"/v1/wind/{D}/vectors", params={"stride": 10}).json()
    v = w["vectors"][0]
    assert v["speed_ms"] == pytest.approx(7.07, abs=0.01) and v["direction_from_deg"] == pytest.approx(225.0)
    assert 0 < len(w["vectors"]) <= 10 * 24 and "FROM" in w["direction_convention"]
    assert client.get(f"/v1/wind/{D}/vectors", params={"stride": 1}).status_code == 422


def test_salinity_map_surface_and_unavailable_depth(client):
    s0 = client.get(f"/v1/salinity/{D}", params={"depth": 0}).json()
    assert s0["variable"] == "sss" and s0["provenance"]["classification"] == "satellite"
    r = client.get(f"/v1/salinity/{D}", params={"depth": 100})
    assert r.status_code == 503
    body = r.json()
    assert body["error"] == "optional_dataset_unavailable" and body["availability"] == "not_configured"
    assert client.get(f"/v1/salinity/{D}", params={"depth": 42}).json()["error"] == "invalid_depth"


def test_existing_grid_endpoints_state_classification(client):
    assert client.get(f"/v1/grid/{D}/product", params={"product": "sss"}).json()["classification"] == "satellite"
    assert client.get(f"/v1/grid/{D}/product", params={"product": "tchp"}).json()["classification"] == "derived"
    assert client.get(f"/v1/grid/{D}", params={"depth": 0, "variable": "uncertainty"}).json()["classification"] == "estimated"


# ---------------------------------------------------------------- short-horizon estimate
def test_forecast_insufficient_history_typed_error(client):
    r = client.get("/v1/forecast", params={"lat": 15, "lon": 88, "date": D})
    assert r.status_code == 422 and r.json()["error"] == "insufficient_forecast_history"


def test_forecast_trend_on_known_linear_series(long_client):
    r = long_client.get("/v1/forecast", params={"lat": 15, "lon": 88, "date": "2023-03-31"})
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["method"] == "trend" and "not" not in f["method_label"].lower().split("trend")[0]
    assert "Not a trained forecast model" in f["limitations"][0]
    assert f["provenance"]["classification"] == "forecast"
    assert f["input_period"] == {"start": "2023-03-25", "end": "2023-03-31", "n_days": 7}
    issue = np.array(f["issue_temperature_c"], float)
    h1, h2 = f["horizons"]
    assert h1["target_date"] == "2023-04-01" and h2["target_date"] == "2023-04-02"
    assert np.allclose(np.array(h1["temperature_c"], float) - issue, 0.01, atol=0.006)
    assert np.allclose(np.array(h2["temperature_c"], float) - issue, 0.02, atol=0.006)
    assert np.allclose(np.array(h1["verification_c"], float), np.array(h1["temperature_c"], float), atol=0.011)
    assert np.allclose(h1["persistence_rmse_c"], 0.01, atol=0.004) and np.allclose(h2["persistence_rmse_c"], 0.02, atol=0.004)
    assert np.allclose(h1["uncertainty_c"], 0.3, atol=0.01)  # dominated by the reconstruction's calibrated sd
    assert h1["n_hindcast_pairs"] >= 20


def test_forecast_persistence_and_end_of_record(long_client):
    p = long_client.get("/v1/forecast", params={"lat": 15, "lon": 88, "date": "2023-04-10", "method": "persistence"}).json()
    assert p["method"] == "persistence" and "persistence" in p["method_label"]
    assert p["horizons"][0]["verification_c"] is None  # target day is beyond the record
    assert p["horizons"][0]["temperature_c"] == p["issue_temperature_c"]
    early = long_client.get("/v1/forecast", params={"lat": 15, "lon": 88, "date": "2023-01-20"})
    assert early.status_code == 422 and early.json()["error"] == "insufficient_forecast_history"


# ---------------------------------------------------------------- 3-D sampling
def test_volume_sample_budget_and_values(client):
    v = client.get("/v1/volume/sample", params={"date": D}).json()
    assert v["n_points"] <= 20000 and v["stride"] == 2 and v["max_points"] == 20000  # 13 depths (0-500 m): 34 x 40 x 13 = 17 680 candidates
    assert len(v["lat"]) == len(v["lon"]) == len(v["depth"]) == len(v["value"]) == v["n_points"]
    assert max(v["depth"]) <= 500 and v["provenance"]["classification"] == "reconstructed"
    small = client.get("/v1/volume/sample", params={"date": D, "max_points": 1000, "variable": "uncertainty"}).json()
    assert small["n_points"] <= 1000 and small["stats"]["mean"] == pytest.approx(0.3, abs=0.01)
    assert client.get("/v1/volume/sample", params={"date": D, "variable": "anomaly"}).json()["provenance"]["classification"] == "derived"


@pytest.mark.parametrize("params,code", [
    ({"min_lat": 20, "max_lat": 10}, "invalid_request"),
    ({"min_depth": 600, "max_depth": 650}, "invalid_depth"),
    ({"max_points": 50000}, "invalid_request"),
])
def test_volume_sample_typed_errors(client, params, code):
    r = client.get("/v1/volume/sample", params={"date": D, **params})
    assert r.status_code == 422 and r.json()["error"] == code


# ---------------------------------------------------------------- data quality & lineage
def test_data_quality_from_pipeline_records(client):
    q = client.get("/v1/data-quality").json()
    ids = {d["id"]: d for d in q["datasets"]}
    assert {"reconstruction", "target", "argo"} <= set(ids)
    assert ids["reconstruction"]["metrics"]["missing_days"] == 0 and ids["reconstruction"]["status"] == "good"
    sla = next(r for r in q["inputs"] if r["variable"] == "sla")
    sst = next(r for r in q["inputs"] if r["variable"] == "sst")
    assert sla["status"] == "insufficient" and sst["status"] == "good"  # 51 % vs 2 % gap-filled
    assert sst["filled_pct"] == pytest.approx(2.0, abs=0.05) and sst["valid_range"] == [-2.0, 40.0]
    a = q["argo"]
    assert a["n_profiles"] == 3 and a["salinity"]["profiles_with_salinity"] == 2
    assert a["split_counts"] == {"test": 2, "train": 1} and a["independent_status"] == "insufficient"
    assert a["depth"]["per_standard_depth"][0]["coverage_pct"] == 100.0 and a["data_mode_counts"] == {"delayed-mode": 3}
    assert a["rejected_note"] and a["qc_record"] is None
    assert any(r["step"] == "Accepted Argo flags" for r in q["qc_rules"])
    assert q["thresholds"]["input_filled_fraction"]["good_max"] == 0.05
    assert "processed/inputs_qc.json" in q["files"]


def test_provenance_lineage_table(client):
    p = client.get("/v1/provenance").json()
    rows = {r["id"]: r for r in p["variables"]}
    assert set(p["classifications"]) == {"measured", "satellite", "reanalysis", "reconstructed", "derived", "estimated", "forecast", "baseline"}
    assert rows["reconstruction"]["classification"] == "reconstructed"
    assert rows["input_sla"]["classification"] == "satellite" and rows["input_sla"]["recorded"] is True
    assert rows["input_sla"]["dataset"].startswith("simulated sla")  # recorded provenance wins over the declaration
    assert rows["target"]["classification"] == "reanalysis" and "HYCOM" in rows["target"]["dataset"]
    assert rows["argo"]["classification"] == "measured"
    assert rows["forecast"]["classification"] == "forecast" and "not a trained forecast model" in rows["forecast"]["dataset"]
    assert rows["glorys_salinity"]["availability"]["status"] == "not_configured"
    assert [s["stage"] for s in rows["reconstruction"]["lineage"]][0] == "Source"
    assert all(r["shown_in"] for r in p["variables"])


# ---------------------------------------------------------------- reports & exports
def test_report_json_export_is_provenance_rich(client):
    r = client.get(f"/v1/report/{D}", params={"lat": 15, "lon": 88, "format": "json"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["product"] == "OceanSight" and j["investigation_point"]["grid_cell"] == {"lat": 15.125, "lon": 88.125}
    recs = j["records"]
    t50 = next(x for x in recs if x["variable"] == "temperature" and x["depth_m"] == 50 and x["classification"] == "reconstructed")
    assert t50["unit"] == "degC" and t50["source"] == "OceanSight U-Net" and t50["uncertainty"] == pytest.approx(0.3)
    kinds = {x["classification"] for x in recs}
    assert {"reconstructed", "baseline", "derived", "satellite", "measured"} <= kinds and "forecast" not in kinds
    names = {x["variable"] for x in recs}
    assert {"thermocline_depth", "halocline_depth", "sea_surface_salinity", "sea_level_anomaly", "wind_speed_10m"} <= names
    assert j["data_quality"] and all("status" in d for d in j["data_quality"])
    assert "SECRET" not in r.text.upper() and "PASSWORD" not in r.text.upper()


def test_report_csv_and_pdf_include_optional_sections(client):
    csv = client.get(f"/v1/report/{D}", params={"lat": 15, "lon": 88, "format": "csv"}).content
    assert b"depth_m,temperature_c" in csv and b"# derived thermocline_depth" in csv and b"# satellite sea_level_anomaly" in csv
    plain = client.get(f"/v1/report/{D}", params={"lat": 15, "lon": 88, "format": "csv", "sections": ""}).content
    assert b"thermocline" not in plain
    pdf = client.get(f"/v1/report/{D}", params={"lat": 15, "lon": 88, "format": "pdf"})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF" and len(pdf.content) > len(
        client.get(f"/v1/report/{D}", params={"lat": 15, "lon": 88, "format": "pdf", "sections": ""}).content)
