"""Data lineage, layer availability and data-quality statistics.

Nothing here is hand-typed science: sources come from the provenance each pipeline adapter
records (``processed/inputs_qc.json``, ``target.zarr`` attrs), falling back to the adapter
declarations mirrored in ``DECLARED`` (tests/test_catalog keeps the two identical); statistics
are computed from the stores and QC reports the pipeline writes.
"""
from __future__ import annotations

import threading
from typing import Any

import numpy as np
import pandas as pd

from ml import qc_rules
from ml.config import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, STANDARD_DEPTHS, TEST_YEARS, TRAIN_YEARS, VAL_YEARS

from app.errors import ApiError
from app.services.store import GridStore

# Declared provenance of the open (no-login) sources the current model was built from. Mirrors the
# ``Provenance`` objects in ml/ingestion/* (see tests/test_catalog.py); recorded provenance wins.
DECLARED: dict[str, dict[str, str]] = {
    "sst": {"product": "NOAA OISST v2.1 (AVHRR-only)", "provider": "NOAA NCEI via CoastWatch ERDDAP",
            "dataset_id": "ncdcOisst21Agg_LonPM180", "url": "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.html",
            "native_resolution": "0.25 deg daily"},
    "sss": {"product": "SMAP daily + bias-corrected SMOS 3-day (merged, NOAA NRT)", "provider": "NOAA CoastWatch ERDDAP",
            "dataset_id": "merged_smap_smos", "url": "https://coastwatch.noaa.gov/erddap/griddap/noaacwSMAPsssDaily.html",
            "native_resolution": "0.25 deg daily"},
    "sla": {"product": "NOAA blended altimetry SLA (S-3A/B, CryoSat-2, Jason-2/3, SARAL)", "provider": "NOAA CoastWatch ERDDAP",
            "dataset_id": "noaacwBLENDEDsshDaily", "url": "https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDsshDaily.html",
            "native_resolution": "0.25 deg daily"},
    "currents": {"product": "NOAA blended-altimetry geostrophic surface currents", "provider": "NOAA CoastWatch ERDDAP",
                 "dataset_id": "noaacwBLENDEDNRTcurrentsDaily",
                 "url": "https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.html", "native_resolution": "0.25 deg daily"},
    "winds": {"product": "NOAA NCEI Blended Seawinds v2.0 (daily)", "provider": "NOAA NCEI via CoastWatch ERDDAP",
              "dataset_id": "noaacwBlendedWindsDaily", "url": "https://coastwatch.noaa.gov/erddap/griddap/noaacwBlendedWindsDaily.html",
              "native_resolution": "0.25 deg daily"},
    "target": {"product": "HYCOM GOFS 3.1 analysis (GLBy0.08/expt_93.0), 12Z snapshot", "provider": "HYCOM consortium / US Navy (NRL, FNMOC)",
               "dataset_id": "GLBy0.08_expt_93.0_ts3z", "url": "https://www.hycom.org/dataserver/gofs-3pt1/analysis",
               "native_resolution": "1/12 deg x 40 levels, 3-hourly"},
    "argo": {"product": "Argo GDAC profiles (QC 1/2)", "provider": "Argo programme via argopy / Ifremer ERDDAP",
             "dataset_id": "ArgoFloats", "url": "https://argopy.readthedocs.io/", "native_resolution": "point profiles"},
    "cyclones": {"product": "IBTrACS v04r01 North Indian best tracks", "provider": "NOAA NCEI", "dataset_id": "ibtracs.NI.v04r01",
                 "url": "https://www.ncei.noaa.gov/products/international-best-track-archive", "native_resolution": "3-hourly track points"},
    "salinity": {"product": "GLORYS12V1 reanalysis (practical salinity, potential temperature)", "provider": "Copernicus Marine Service",
                 "dataset_id": "cmems_mod_glo_phy_my_0.083deg_P1D-m",
                 "url": "https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description",
                 "native_resolution": "1/12 deg x 50 levels, daily mean"},
    "en4": {"product": "Met Office EN4.2.2 objective analysis", "provider": "Met Office Hadley Centre", "dataset_id": "EN.4.2.2.analyses.g10",
            "url": "https://www.metoffice.gov.uk/hadobs/en4/", "native_resolution": "1 deg monthly"},
}

# Display thresholds for the Data Quality status (OceanSight-defined; documented in docs/DATA_QUALITY.md).
THRESHOLDS = {
    "input_filled_fraction": {"good_max": 0.05, "limited_max": 0.25,
                              "meaning": "share of ocean values in a satellite input that were gap-filled (temporal + spatial)"},
    "argo_depth_coverage": {"good_min": 0.5, "limited_min": 0.1,
                            "meaning": "share of Argo profiles that resolve a standard depth under the bracketing-gap rule"},
    "argo_independent_profiles": {"good_min": 500, "limited_min": 100,
                                  "meaning": "held-out (test-year) Argo profiles available for independent validation"},
    "reconstruction_missing_days": {"good_max": 0.01, "limited_max": 0.05,
                                    "meaning": "share of days in the study period without a precomputed reconstruction"},
}


def _band(v: float | None, t: dict) -> str | None:
    if v is None or not np.isfinite(v):
        return None
    if "good_max" in t:
        return "good" if v <= t["good_max"] else "limited" if v <= t["limited_max"] else "insufficient"
    return "good" if v >= t["good_min"] else "limited" if v >= t["limited_min"] else "insufficient"


def recorded_provenance(store: GridStore) -> dict[str, dict[str, str]]:
    """Provenance the pipeline recorded with the data actually used (inputs_qc.json, target attrs)."""
    out: dict[str, dict[str, str]] = {}
    qc = store.processed_json("inputs_qc.json") or {}
    for var, q in qc.items():
        prov = {k.removeprefix("prov_"): v for k, v in q.items() if k.startswith("prov_")}
        if prov:
            key = {"ucur": "currents", "vcur": "currents", "uwind": "winds", "vwind": "winds"}.get(var, var)
            out.setdefault(key, prov)
    if store.target is not None:
        tp = {k.removeprefix("prov_"): v for k, v in store.target.attrs.items() if k.startswith("prov_")}
        if tp:
            out["target"] = tp
    if store.salinity3d is not None:
        sp = {k.removeprefix("prov_"): v for k, v in store.salinity3d.attrs.items() if k.startswith("prov_")}
        if sp:
            out["salinity"] = sp
    return out


def source(store: GridStore, key: str) -> dict[str, Any]:
    rec = recorded_provenance(store).get(key)
    d = dict(DECLARED[key])
    if rec:
        d.update({k: rec[k] for k in ("product", "provider", "dataset_id", "url", "native_resolution") if k in rec})
    d["recorded"] = bool(rec)
    return d


# ---------------------------------------------------------------- availability
def layer_status(store: GridStore) -> dict[str, dict[str, str]]:
    s = store.s
    prod = store.products.get(store.production_model) if store.predictions else None
    inp = store.inputs

    def st(ok: bool, detail_ok: str, detail_no: str, status_no: str = "unavailable"):
        return {"status": "available" if ok else status_no, "detail": detail_ok if ok else detail_no}

    has_sigma = bool(store.predictions) and "sigma" in store.predictions[store.production_model]
    sal = store.salinity3d is not None
    return {
        "temp": st(bool(store.predictions), "Reconstructed temperature", "No reconstruction store is deployed."),
        "anomaly": st(store.clim_coef is not None, "Reconstruction minus seasonal climatology", "Climatology not deployed."),
        "uncertainty": st(has_sigma, "Calibrated model standard deviation", "The production model has no uncertainty head."),
        **{p: st(prod is not None and p in prod, "Derived from the reconstructed column", "Derived products not precomputed.")
           for p in ("tchp", "mld", "d20", "d26")},
        "sss": st(prod is not None and "sss" in prod, "Satellite sea-surface salinity (model input)",
                  "Satellite salinity is not deployed with this service."),
        "sla": st(inp is not None and "sla" in inp, "Satellite sea-level anomaly (model input)",
                  "Sea-level anomaly needs processed/inputs.zarr in the deployed data bundle."),
        "wind": st(inp is not None and "uwind" in inp and "vwind" in inp, "Satellite 10 m wind (model input)",
                   "Surface wind needs processed/inputs.zarr in the deployed data bundle."),
        "salinity_subsurface": (st(True, "GLORYS12V1 reanalysis salinity, precomputed", "") if sal else
                                {"status": "not_precomputed", "detail": "Copernicus Marine credentials are configured; run "
                                 "`python -m ml.pipeline.build_dataset salinity` to precompute GLORYS salinity."}
                                if s.copernicus_configured else
                                {"status": "not_configured", "detail": "Subsurface salinity is available through the optional "
                                 "Copernicus Marine GLORYS12V1 reanalysis, which is not configured for this deployment."}),
        "argo_salinity": ({"status": "available", "detail": "Measured Argo salinity (local archive)"} if store.argo_table is not None
                          else {"status": "database", "detail": "Measured Argo salinity from the metadata database"}),
    }


def optional_sources(store: GridStore) -> dict[str, dict[str, str]]:
    """Credentialed sources: configured / not_configured. Values of credentials are never exposed."""
    s = store.s
    return {
        "copernicus_marine": {"status": "configured" if s.copernicus_configured else "not_configured",
                              "enables": "GLORYS12V1 subsurface salinity (reanalysis); CMEMS alternatives for the satellite inputs",
                              "variables": "COPERNICUSMARINE_SERVICE_USERNAME, COPERNICUSMARINE_SERVICE_PASSWORD"},
        "copernicus_cds": {"status": "configured" if s.cds_api_key else "not_configured",
                           "enables": "ERA5 10 m wind as an alternative model input (pipeline only)", "variables": "CDS_API_KEY"},
    }


# ---------------------------------------------------------------- lineage
def lineage(store: GridStore) -> list[dict]:
    try:
        ts = store.times(store.production_model)
        period = f"{ts[0].date()} to {ts[-1].date()}"
    except ApiError:
        period = "not deployed"
    model = store.production_model if store.predictions else None
    layers = layer_status(store)
    depths = f"{int(STANDARD_DEPTHS[0])}-{int(STANDARD_DEPTHS[-1])} m (15 standard depths)"
    grid = "0.25 deg daily (100 x 240 cells)"
    train = f"{TRAIN_YEARS[0]}-{TRAIN_YEARS[-1]}"
    regrid_in = "bilinear onto the 0.25 deg model grid (sources already at ~0.25 deg)"
    clean = (f"unit harmonisation; physical-range flagging; de-duplication; gaps <= {qc_rules.MAX_GAP_DAYS} days "
             "filled by temporal interpolation, then nearest valid ocean neighbour (every fill counted)")

    def src(key):
        d = source(store, key)
        return {"provider": d["provider"], "dataset": f"{d['product']} [{d['dataset_id']}]", "url": d["url"],
                "native_resolution": d["native_resolution"], "recorded": d["recorded"]}

    def avail(k):
        return layers[k] if k in layers else {"status": "available", "detail": ""}

    def steps(*pairs):
        return [{"stage": a, "detail": b} for a, b in pairs]

    rows = []

    def add(id_, variable, classification, source_d, resolution, temporal, depth, processing, role, availability, lineage_steps, shown_in):
        rows.append({"id": id_, "variable": variable, "classification": classification, **source_d, "resolution": resolution,
                     "temporal_coverage": temporal, "depth_coverage": depth, "processing": processing, "role": role,
                     "availability": availability, "lineage": lineage_steps, "shown_in": shown_in})

    inputs = [("sst", "Sea-surface temperature", "sst", None), ("sss", "Sea-surface salinity", "sss", "sss"),
              ("sla", "Sea-level anomaly", "sla", "sla"), ("currents", "Geostrophic surface currents (u, v)", "currents", None),
              ("winds", "10 m wind (u, v)", "winds", "wind")]
    for key, name, skey, layer in inputs:
        add(f"input_{key}", name, "satellite", src(skey), grid, period, "surface", clean,
            "model input" + (" and map layer" if layer else ""),
            avail(layer) if layer else {"status": "available" if model else "unavailable", "detail": "used by the model"},
            steps(("Source", src(skey)["dataset"]), ("Preprocessing", clean), ("Regridding", regrid_in),
                  ("Model input", "one of 7 surface channels, normalised with training-year statistics"),
                  ("Visualization", "Ocean map layer" if layer else "not shown directly")),
            ["/map"] if layer else ["/methodology"])
    add("target", "Subsurface temperature (training target)", "reanalysis", src("target"), "1/12 deg -> 0.25 deg", f"target days {period}",
        depths, ["vertical interpolation to the standard depths", "cos-lat area-weighted coarsening to 0.25 deg",
                 f"cells kept where valid on >= {int(qc_rules.TARGET_MASK_MIN_VALID * 100)} % of days"],
        f"training target ({train}); comparison layer in the profile", {"status": "available" if store.target is not None else "unavailable",
                                                                      "detail": "data-assimilative analysis; it assimilates Argo"},
        steps(("Source", src("target")["dataset"]), ("Preprocessing", "vertical interpolation to 15 standard depths"),
              ("Regridding", "area-weighted coarsening 1/12 -> 0.25 deg"), ("Model input", f"supervised target, {train}"),
              ("Visualization", "Profile comparison (HYCOM analysis)")), ["/profiles"])
    add("reconstruction", "Subsurface temperature", "reconstructed",
        {"provider": "OceanSight", "dataset": f"U-Net reconstruction ({model})" if model else "not deployed", "url": "/methodology",
         "native_resolution": grid, "recorded": True}, grid, period, depths,
        ["U-Net predicts the departure from the seasonal climatology from 7 satellite surface fields",
         "precomputed daily, stored as int16 x 0.01 degC"], "primary product", avail("temp"),
        steps(("Source", "7 satellite surface inputs + position + season"), ("Preprocessing", "normalisation (training years only)"),
              ("Model", f"U-Net ({model}), trained {train}, early stopping on {VAL_YEARS[0]}"),
              ("Derived product", "anomaly, TCHP, MLD, D20, D26, thermocline"), ("Visualization", "map, profile, timeline, section, 3-D")),
        ["/map", "/profiles", "/timeline", "/section", "/stratification", "/3d"])
    add("uncertainty", "Temperature uncertainty (±1 sd)", "estimated",
        {"provider": "OceanSight", "dataset": "U-Net variance head, calibrated", "url": "/methodology", "native_resolution": grid, "recorded": True},
        grid, period, depths, [f"sd_cal = sqrt(sd_model^2 + a_k^2), a_k fitted on {VAL_YEARS[0]} Argo for 68 % coverage"],
        "confidence in the reconstruction", avail("uncertainty"),
        steps(("Source", "U-Net variance head"), ("Preprocessing", f"calibration against {VAL_YEARS[0]} Argo"),
              ("Model", "per-depth additive term"), ("Derived product", "±1 sd / ±2 sd intervals"),
              ("Visualization", "map layer, profile band")), ["/map", "/profiles"])
    add("climatology", "Seasonal climatology", "baseline",
        {"provider": "OceanSight", "dataset": f"harmonic fit (annual + semi-annual) to the target, {train}", "url": "/methodology",
         "native_resolution": grid, "recorded": True}, grid, "any day of year", depths, ["least-squares harmonic fit per cell and depth"],
        "baseline and anomaly reference", avail("anomaly"),
        steps(("Source", "training target"), ("Preprocessing", f"training years {train} only"), ("Model", "harmonic regression"),
              ("Derived product", "anomaly = reconstruction - climatology"), ("Visualization", "anomaly layer, profile comparison")),
        ["/map", "/profiles", "/timeline"])
    add("derived", "TCHP, MLD, D20, D26", "derived",
        {"provider": "OceanSight", "dataset": "deterministic formulas on the reconstructed column", "url": "/methodology",
         "native_resolution": grid, "recorded": True}, grid, period, "column (0-500 m)",
        ["profile interpolated to 1 m", "MLD: 0.5 degC below the 10 m value", "D20/D26: isotherm depth",
         "TCHP: rho cp integral of (T - 26 degC) to D26"], "cyclone-relevant ocean structure", avail("tchp"),
        steps(("Source", "reconstructed temperature"), ("Preprocessing", "1 m vertical interpolation"), ("Model", "none (formula)"),
              ("Derived product", "TCHP / MLD / D20 / D26 maps"), ("Visualization", "map layers, profile chips, reports")),
        ["/map", "/profiles", "/analysis"])
    add("thermocline", "Thermocline depth and gradient", "derived",
        {"provider": "OceanSight", "dataset": "vertical gradient of the reconstructed profile", "url": "/methodology#stratification",
         "native_resolution": "standard depths", "recorded": True}, "per point, on request", period, "0-1000 m",
        ["dT/dz between consecutive standard depths", "strongest cooling below the mixed layer", "quality flags"],
        "stratification analysis", avail("temp"),
        steps(("Source", "reconstructed temperature"), ("Preprocessing", "valid consecutive levels only"),
              ("Model", "none (gradient maximum)"), ("Derived product", "thermocline depth, max gradient, quality"),
              ("Visualization", "Stratification workspace, report")), ["/stratification", "/reports"])
    add("argo", "Temperature and salinity profiles", "measured", src("argo"), "native levels (~1-10 m)", period, "0-1000+ m",
        [f"QC flags {list(qc_rules.ARGO_ACCEPTED_QC_FLAGS)} only", "pressure -> depth (Saunders 1981)",
         "interpolated to standard depths only where bracketing samples are close"],
        "independent validation, map overlay, salinity / T-S analysis", avail("argo_salinity"),
        steps(("Source", src("argo")["dataset"]), ("Preprocessing", "QC flags 1/2; range and spike tests for salinity views"),
              ("Regridding", "none (point profiles)"), ("Model input", "never used for training"),
              ("Visualization", "map markers, profile, stratification, T-S diagram")),
        ["/map", "/profiles", "/stratification", "/ts", "/validation"])
    add("argo_derived", "Halocline, density, density MLD, barrier layer", "derived",
        {"provider": "OceanSight", "dataset": "TEOS-10 (gsw) on measured Argo T/S", "url": "/methodology#stratification",
         "native_resolution": "5 m bins", "recorded": True}, "per profile", period, "0-1000 m",
        ["Argo global-range and spike tests", "5 m bin averages", "TEOS-10 potential temperature and sigma0",
         "de Boyer Montegut (2004) mixed-layer thresholds"], "salinity stratification", avail("argo_salinity"),
        steps(("Source", "measured Argo temperature and salinity"), ("Preprocessing", "QC tests, 5 m bins"),
              ("Model", "none (TEOS-10 equations)"), ("Derived product", "halocline, sigma0, MLD, barrier layer"),
              ("Visualization", "Stratification and T-S workspaces")), ["/stratification", "/ts"])
    add("glorys_salinity", "Subsurface salinity (optional)", "reanalysis", src("salinity"), "1/12 deg -> 0.25 deg", "target days when precomputed",
        depths, ["vertical interpolation to standard depths", "area-weighted coarsening"], "salinity map, halocline, T-S comparison",
        layers["salinity_subsurface"],
        steps(("Source", src("salinity")["dataset"]), ("Preprocessing", "precompute with Copernicus Marine credentials"),
              ("Regridding", "area-weighted coarsening 1/12 -> 0.25 deg"), ("Model input", "not used by the model"),
              ("Visualization", "map (depth > 0), stratification, T-S")), ["/map", "/stratification", "/ts"])
    add("forecast", "Short-horizon temperature estimate (T+1, T+2 days)", "forecast",
        {"provider": "OceanSight", "dataset": "statistical extrapolation of the reconstruction (not a trained forecast model)",
         "url": "/methodology#forecast", "native_resolution": "per point", "recorded": True}, "per point, on request", period, depths,
        ["least-squares trend over the last 7 reconstructed days, or persistence", "error from a 60-day hindcast at the same cell"],
        "short-horizon context", avail("temp"),
        steps(("Source", "reconstructed daily series at one cell"), ("Preprocessing", "days up to the issue date only"),
              ("Model", "linear trend / persistence"), ("Derived product", "T+1/T+2 with hindcast error"),
              ("Visualization", "Timeline forecast panel")), ["/timeline"])
    add("cyclones", "Cyclone tracks", "measured", src("cyclones"), "track points", period, "surface",
        ["filtered to the North Indian basin and study period"], "event context", {"status": "available", "detail": "best-track archive"},
        steps(("Source", src("cyclones")["dataset"]), ("Preprocessing", "basin and period filter"), ("Regridding", "none"),
              ("Model input", "not used by the model"), ("Visualization", "map tracks, Events & regions")), ["/map", "/analysis"])
    add("en4", "Gridded subsurface temperature (cross-check)", "reanalysis", src("en4"), "1 deg monthly",
        f"{VAL_YEARS[0]}-{TEST_YEARS[-1]}", depths, ["reconstruction averaged to EN4 1 deg monthly cells"],
        "independent cross-check (objective analysis of in-situ profiles)",
        {"status": "available" if store.json_output("metrics_en4.json") else "unavailable", "detail": "validation metrics"},
        steps(("Source", src("en4")["dataset"]), ("Preprocessing", "monthly means"), ("Regridding", "0.25 -> 1 deg averaging"),
              ("Model input", "not used by the model"), ("Visualization", "Evidence screen")), ["/validation"])
    return rows


PROV = {  # short provenance blocks for payloads; ``lineage_id`` links to the table above
    "reconstruction": ("reconstructed", "OceanSight U-Net"),
    "uncertainty": ("estimated", "calibrated model standard deviation"),
    "anomaly": ("derived", "reconstruction minus seasonal climatology"),
    "derived": ("derived", "computed from the reconstructed column"),
    "thermocline": ("derived", "vertical gradient of the reconstructed profile"),
    "argo": ("measured", "Argo float (QC flags 1/2)"),
    "argo_derived": ("derived", "TEOS-10 calculations on the measured Argo profile"),
    "input_sss": ("satellite", "satellite sea-surface salinity (SMAP/SMOS)"),
    "input_sla": ("satellite", "satellite altimetry sea-level anomaly"),
    "input_winds": ("satellite", "satellite-blended 10 m wind"),
    "glorys_salinity": ("reanalysis", "GLORYS12V1 reanalysis (Copernicus Marine)"),
    "forecast": ("forecast", "statistical extrapolation of the reconstruction"),
}


def prov(lineage_id: str, **extra) -> dict:
    c, s = PROV[lineage_id]
    return {"classification": c, "source": s, "lineage_id": lineage_id, **extra}


# ---------------------------------------------------------------- data quality
_dq_lock = threading.Lock()
_dq_cache: dict[int, dict] = {}


def data_quality(store: GridStore) -> dict:
    """Computed once per store (the deployed data are immutable)."""
    with _dq_lock:
        if id(store) not in _dq_cache:
            _dq_cache.clear()
            _dq_cache[id(store)] = _compute_data_quality(store)
        return _dq_cache[id(store)]


def _pct(n, d):
    return None if not d else round(100.0 * n / d, 2)


def _inputs_quality(store: GridStore) -> list[dict]:
    qc = store.processed_json("inputs_qc.json")
    if not qc:
        return []
    n_total = None
    if store.inputs is not None:
        ocean = store.inputs["ocean_mask"].values if "ocean_mask" in store.inputs else store.mask3d[0]
        n_total = int(ocean.sum()) * int(store.inputs.sizes["time"])
    rows = []
    for var, q in qc.items():
        filled = q.get("filled_temporal", 0) + q.get("filled_spatial", 0)
        frac = None if not n_total else filled / n_total
        rows.append({"variable": var, "source": q.get("prov_product"), "n_ocean_values": n_total,
                     "missing_before_fill": q.get("missing_ocean_values"), "missing_before_fill_pct": _pct(q.get("missing_ocean_values", 0), n_total),
                     "filled_temporal": q.get("filled_temporal"), "filled_spatial": q.get("filled_spatial"),
                     "filled_pct": None if frac is None else round(100 * frac, 2),
                     "invalid_flagged": q.get("n_invalid_flagged"), "duplicate_times": q.get("n_duplicate_times"),
                     "days_absent_in_source": q.get("n_days_absent_in_source"),
                     "valid_range": list(qc_rules.VALID_RANGE.get(var, (None, None))),
                     "status": _band(frac, THRESHOLDS["input_filled_fraction"]) or "limited",
                     "status_reason": ("gap-filled share of ocean values" if frac is not None
                                       else "fill counts are recorded but the total number of ocean values is not deployed")})
    return rows


def _argo_quality(store: GridStore) -> dict | None:
    df = store.argo_table
    m = store.json_output("metrics_argo.json") or {}
    rec = store.processed_json("argo_qc.json")
    if df is None:
        if not m:
            return None
        return {"n_profiles": m.get("n_profiles_total"), "detail_available": False,
                "note": "Detailed profile statistics need processed/argo_profiles.parquet in the deployed bundle.",
                "qc_record": rec}
    n = len(df)
    std = np.stack(df["temp_std"].to_numpy()).astype(float) if n else np.zeros((0, STANDARD_DEPTHS.size))
    per_depth = []
    for k, z in enumerate(STANDARD_DEPTHS):
        nv = int(np.isfinite(std[:, k]).sum())
        frac = nv / n if n else None
        per_depth.append({"depth_m": float(z), "n_valid": nv, "coverage_pct": _pct(nv, n),
                          "status": _band(frac, THRESHOLDS["argo_depth_coverage"])})
    sal_any, sal_levels, t_levels, max_depth = 0, 0, 0, []
    for s_arr, t_arr, d_arr in zip(df["salinity_psu"], df["temperature_c"], df["depths_m"]):
        s_a = np.asarray([np.nan if x is None else x for x in (s_arr if s_arr is not None else [])], float)
        t_a = np.asarray([np.nan if x is None else x for x in t_arr], float)
        fs = np.isfinite(s_a)
        sal_any += bool(fs.any())
        sal_levels += int(fs.sum())
        t_levels += int(np.isfinite(t_a).sum())
        d_a = np.asarray([np.nan if x is None else x for x in d_arr], float)
        max_depth.append(np.nanmax(d_a) if np.isfinite(d_a).any() else np.nan)
    max_depth = np.asarray(max_depth)
    month = df["profile_date"].dt.to_period("M").astype(str)
    split_counts = df["split"].value_counts().to_dict()
    # spatial coverage: 1 deg boxes containing reconstructed ocean that hold >= 1 profile
    ocean = store.mask3d[0]
    box_ocean = ocean.reshape(25, 4, 60, 4).any(axis=(1, 3))
    bi = np.clip(np.floor(df["lat"].to_numpy(float) - LAT_MIN).astype(int), 0, 24)
    bj = np.clip(np.floor(df["lon"].to_numpy(float) - LON_MIN).astype(int), 0, 59)
    hit = np.zeros_like(box_ocean)
    hit[bi, bj] = True
    test = df["split"] == "test"
    hit_test = np.zeros_like(box_ocean)
    hit_test[bi[test.to_numpy()], bj[test.to_numpy()]] = True
    n_test = int(split_counts.get("test", 0))
    return {
        "n_profiles": n, "detail_available": True,
        "split_counts": {k: int(v) for k, v in split_counts.items()},
        "data_mode_counts": {({"R": "real-time", "A": "adjusted", "D": "delayed-mode"}.get(k, k or "unknown")): int(v)
                             for k, v in df["data_mode"].fillna("").value_counts().to_dict().items()},
        "temporal": {"first": str(df["profile_date"].min().date()) if n else None, "last": str(df["profile_date"].max().date()) if n else None,
                     "per_month": [{"month": k, "n": int(v)} for k, v in month.value_counts().sort_index().items()]},
        "spatial": {"ocean_boxes_1deg": int(box_ocean.sum()), "boxes_with_profiles": int((hit & box_ocean).sum()),
                    "coverage_pct": _pct(int((hit & box_ocean).sum()), int(box_ocean.sum())),
                    "test_year_coverage_pct": _pct(int((hit_test & box_ocean).sum()), int(box_ocean.sum()))},
        "depth": {"per_standard_depth": per_depth,
                  "profiles_reaching_500m_pct": _pct(int((max_depth >= 500).sum()), n),
                  "profiles_reaching_1000m_pct": _pct(int((max_depth >= 990).sum()), n)},
        "salinity": {"profiles_with_salinity": sal_any, "profiles_with_salinity_pct": _pct(sal_any, n),
                     "valid_salinity_levels_pct": _pct(sal_levels, t_levels),
                     "note": "Levels whose salinity QC flag is not 1/2 are stored as missing; salinity views additionally "
                             "apply the Argo global-range and spike tests."},
        "independent_profiles": n_test,
        "independent_status": _band(n_test, THRESHOLDS["argo_independent_profiles"]),
        "qc_record": rec,
        "rejected_note": None if rec else ("Rejected levels are not recorded in this build: QC filtering (flags 1/2) is applied by the "
                                           "data server (argopy 'standard' mode), so rejected data are never downloaded. "
                                           "Pipeline runs from this version record received/dropped counts in processed/argo_qc.json."),
    }


def _compute_data_quality(store: GridStore) -> dict:
    datasets = []
    try:
        ts = store.times(store.production_model)
        full = pd.date_range(ts[0], ts[-1])
        missing = len(full.difference(ts))
        frac = missing / len(full)
        datasets.append({"id": "reconstruction", "name": "OceanSight reconstruction", "classification": "reconstructed",
                         "status": _band(frac, THRESHOLDS["reconstruction_missing_days"]),
                         "status_reason": f"{missing} of {len(full)} days missing",
                         "metrics": {"days": len(ts), "missing_days": missing, "first": str(ts[0].date()), "last": str(ts[-1].date()),
                                     "ocean_cells_surface": int(store.mask3d[0].sum()), "ocean_cells_1000m": int(store.mask3d[-1].sum()),
                                     "model": store.production_model}})
    except ApiError:
        pass
    summ = store.processed_json("assemble_summary.json")
    if summ:
        sc = summ.get("split_counts", {})
        ok = all(sc.get(k, 0) > 0 for k in ("train", "val", "test"))
        datasets.append({"id": "target", "name": "Training target (ocean analysis)", "classification": "reanalysis",
                         "status": "good" if ok else "limited",
                         "status_reason": "target days in every split" if ok else "a split has no target days",
                         "metrics": {"target_days": summ.get("target_days"), "split_counts": sc, "source": summ.get("target_source"),
                                     "ocean_cells_surface": summ.get("ocean_cells_surface"), "ocean_cells_1000m": summ.get("ocean_cells_1000m")}})
    argo = _argo_quality(store)
    if argo:
        datasets.append({"id": "argo", "name": "Argo profiles", "classification": "measured",
                         "status": argo.get("independent_status") or "limited",
                         "status_reason": f"{argo.get('independent_profiles', 'n/a')} independent (test-year) profiles",
                         "metrics": {"profiles": argo["n_profiles"]}})
    en4 = store.json_output("metrics_en4.json")
    if en4 is not None:
        datasets.append({"id": "en4", "name": "EN4 objective analysis (cross-check)", "classification": "reanalysis", "status": "good",
                         "status_reason": "cross-check metrics computed", "metrics": {}})
    cyc = store.processed_json("cyclones.json")
    if cyc is not None:
        datasets.append({"id": "cyclones", "name": "IBTrACS cyclone tracks", "classification": "measured", "status": "good",
                         "status_reason": f"{len(cyc.get('tracks', []))} tracks", "metrics": {"tracks": len(cyc.get("tracks", []))}})
    return {
        "datasets": datasets,
        "inputs": _inputs_quality(store),
        "argo": argo,
        "thresholds": THRESHOLDS,
        "qc_rules": qc_rule_list(),
        "files": [n for n in ("processed/inputs_qc.json", "processed/assemble_summary.json", "processed/argo_profiles.parquet",
                              "processed/argo_qc.json", "outputs/metrics_argo.json", "outputs/metrics_en4.json")
                  if (store.s.oceanembed_data_dir / n).exists()],
    }


def qc_rule_list() -> list[dict]:
    r = qc_rules
    rng = "; ".join(f"{k} {lo:g} to {hi:g}" for k, (lo, hi) in r.VALID_RANGE.items())
    return [
        {"step": "Accepted Argo flags", "rule": f"QC flags {list(r.ARGO_ACCEPTED_QC_FLAGS)} (good, probably good) for temperature, "
                                                  "pressure, position and, per level, salinity", "applies_to": "Argo"},
        {"step": "Argo to standard depths", "rule": "linear interpolation only where the two bracketing samples are closer than "
                 + ", ".join(f"{v} m (from {k} m)" for k, v in r.MAX_BRACKET_GAP.items())
                 + f"; 0 m uses the shallowest sample if within {r.ARGO_SURFACE_MAX_OFFSET_M:g} m; profiles need >= {r.ARGO_MIN_LEVELS} levels",
         "applies_to": "Argo"},
        {"step": "Physical range", "rule": f"values outside the plausible range are flagged, counted and set to missing ({rng})",
         "applies_to": "satellite inputs"},
        {"step": "Missing values", "rule": f"gaps up to {r.MAX_GAP_DAYS} days filled by linear interpolation in time, the rest by the "
                                           "nearest valid ocean cell; every fill is counted", "applies_to": "satellite inputs"},
        {"step": "Regridding", "rule": "bilinear for ~0.25 deg sources; cos-lat area-weighted averaging for 1/12 deg sources "
                                       "(never point subsampling)", "applies_to": "satellite inputs, training target"},
        {"step": "Temporal alignment", "rule": "daily calendar; duplicates removed; the target is a 12Z snapshot, inputs are daily "
                                               "products", "applies_to": "all gridded data"},
        {"step": "Spatial alignment", "rule": f"ocean where SST is valid on > {int(r.OCEAN_MASK_MIN_VALID_SST * 100)} % of days; a depth "
                                              f"level is reconstructed where the target is valid on >= {int(r.TARGET_MASK_MIN_VALID * 100)} % of days",
         "applies_to": "model grid"},
    ]
