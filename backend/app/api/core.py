"""Health, metadata, regions and landing-page summary (docs/13)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import InterfaceError, OperationalError

from ml.config import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, REGIONS, RES, STANDARD_DEPTHS, TEST_YEARS, TRAIN_YEARS, VAL_YEARS

from app.db.session import get_engine
from app.errors import ApiError
from app.services.store import GridStore, get_store

router = APIRouter(tags=["core"])


@router.get("/health")
def health(store: GridStore = Depends(get_store)):
    """Liveness + readiness detail. Always 200 so a load balancer keeps the process up."""
    try:
        model = store.production_model
    except ApiError:
        model = None
    db_ok = True
    try:
        with get_engine().connect() as c:
            c.execute(text("SELECT 1"))
    except (OperationalError, InterfaceError):
        db_ok = False
    return {"status": "ok" if model and db_ok else "degraded", "model_version": model,
            "database": "ok" if db_ok else "unavailable", "reconstruction_store": "ok" if model else "missing"}


@router.get("/v1/meta")
def meta(store: GridStore = Depends(get_store)):
    """Everything the frontend needs to configure itself: domain, depths, period, models, data sources."""
    ts = store.times(store.production_model)
    qc_path = store.s.processed_dir / "inputs_qc.json"
    sources = {}
    if qc_path.exists():
        for var, q in json.loads(qc_path.read_text()).items():
            sources[var] = {k.removeprefix("prov_"): v for k, v in q.items() if k.startswith("prov_")}
    tgt = store.target.attrs if store.target is not None else {}
    return {
        "product": "OceanSight", "problem_statement": "SIH26066 — OceanEmbed (MoES / INCOIS)",
        "domain": {"min_lat": LAT_MIN, "max_lat": LAT_MAX, "min_lon": LON_MIN, "max_lon": LON_MAX, "resolution_deg": RES},
        "depths_m": STANDARD_DEPTHS.tolist(),
        "period": {"start": str(ts[0].date()), "end": str(ts[-1].date()), "n_days": len(ts)},
        "splits": {"train_years": list(TRAIN_YEARS), "val_years": list(VAL_YEARS), "test_years": list(TEST_YEARS)},
        "production_model": store.production_model,
        "models": store.registry,
        "available_models": store.model_names(),
        "input_sources": sources,
        "target_source": {k.removeprefix("prov_"): v for k, v in tgt.items() if k.startswith("prov_")},
        "validation_source": "Argo GDAC profiles via argopy (QC flags 1/2)",
        "data_label": "cached",
        "data_label_legend": {"cached": "Precomputed reconstruction from real historical satellite observations",
                              "live": "Freshly computed on request (not used in this build)",
                              "simulated": "Synthetic data for pipeline testing only — never shown as a reconstruction"},
    }


@router.get("/v1/regions")
def regions():
    return {"regions": [{"name": r.name, "bbox": {"min_lat": r.min_lat, "max_lat": r.max_lat,
                                                  "min_lon": r.min_lon, "max_lon": r.max_lon}} for r in REGIONS]}


@router.get("/v1/summary/headline")
def headline(store: GridStore = Depends(get_store)):
    """Landing-page headline stats, straight from the computed validation (no hand-typed numbers)."""
    ts = store.times(store.production_model)
    out = {"study_period": f"{ts[0].date()}..{ts[-1].date()}", "n_days_reconstructed": len(ts),
           "grid": "0.25° × 0.25°, 15 depths (0–1000 m)", "production_model": store.production_model,
           "validation": None}
    m = store.json_output("metrics_argo.json")
    if m and "test" in m["splits"]:
        sp = m["splits"]["test"]
        rows = {r["depth_m"]: r for r in sp["models"].get(store.production_model, {}).get("per_depth", [])}
        clim = {r["depth_m"]: r for r in sp["models"].get("climatology", {}).get("per_depth", [])}
        pick = lambda z: {"depth_m": z, "rmse_c": _r(rows.get(z, {}).get("rmse_c")),
                          "climatology_rmse_c": _r(clim.get(z, {}).get("rmse_c")), "n_obs": rows.get(z, {}).get("n_obs")}
        out["validation"] = {"held_out_period": sp["period"], "n_independent_profiles": sp["n_profiles"],
                             "at_depths": [pick(z) for z in (0.0, 50.0, 100.0, 200.0, 500.0)],
                             "caveat": m["caveat"]}
    return out


def _r(v):
    return None if v is None else round(float(v), 2)
