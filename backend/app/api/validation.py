"""Validation + Argo endpoints (docs/13 "Validation", docs/12 screen 6)."""
from __future__ import annotations

from datetime import date
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.errors import ApiError
from app.services import argo as argo_q
from app.services.store import GridStore, get_store

router = APIRouter(prefix="/v1", tags=["validation"])
CAVEAT = ("GLORYS-class reanalyses (here: HYCOM, the open substitute — docs/DECISIONS.md D-002) assimilate some of "
          "the same Argo floats; held-out floats are independent of our model's training but not fully independent "
          "of the target product. See docs/21_RISKS_AND_LIMITATIONS.md.")


def _metrics_argo(store: GridStore) -> dict:
    m = store.json_output("metrics_argo.json")
    if m is None:
        raise ApiError(503, "validation_unavailable", "Independent validation has not been computed yet.")
    return m


@router.get("/validation/summary")
def validation_summary(model: str | None = None, split: Literal["test", "val"] = "test",
                       store: GridStore = Depends(get_store)):
    """Per-depth skill against held-out Argo floats, model vs baselines."""
    m = _metrics_argo(store)
    model = model or store.production_model
    sp = m["splits"].get(split)
    if sp is None:
        raise ApiError(404, "split_unavailable", f"no '{split}' validation available")
    if model not in sp["models"]:
        raise ApiError(422, "unknown_model", f"no validation for '{model}'")
    rows = sp["models"][model]["per_depth"]
    base = {n: {r["depth_m"]: r for r in v["per_depth"]} for n, v in sp["models"].items() if n != model}
    per_depth = []
    for r in rows:
        z = r["depth_m"]
        per_depth.append({**{k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()},
                          "baseline_rmse_c": _r(base.get("climatology", {}).get(z, {}).get("rmse_c")),
                          "lightgbm_rmse_c": _r(base.get("baseline-lightgbm-v1", {}).get(z, {}).get("rmse_c")),
                          "nosss_rmse_c": _r(base.get("cnn-unet-nosss-v1", {}).get(z, {}).get("rmse_c")),
                          "target_product_rmse_c": _r(base.get("target-product", {}).get(z, {}).get("rmse_c"))})
    start, end = sp["period"].split("..")
    return {
        "model": model, "split": split, "independent": sp["independent"],
        "held_out_period": f"{start}..{end}", "n_profiles": sp["n_profiles"],
        "per_depth": per_depth,
        "overall": {n: _overall(v["per_depth"]) for n, v in sp["models"].items()},
        "uncertainty_calibration": {**{k: sp["models"][model].get(k) for k in ("frac_within_1sigma", "frac_within_2sigma")},
                                    "calibrated": _calibrated(store, split)},
        "caveat": CAVEAT, "source": "Argo GDAC via argopy (QC 1/2); INCOIS LAS substitution per docs/05",
    }


def _calibrated(store: GridStore, split: str):
    c = store.json_output("uncertainty_calibration.json")
    if c is None:
        return None
    if split == "test":
        o = c["test_overall"]
        return {"frac_within_1sigma": o["cov1_cal"], "frac_within_2sigma": o["cov2_cal"], "fit_on": "val (2022)"}
    return {"note": "calibration was fitted on this split", "fit_on": "val (2022)"}


def _r(v, nd=3):
    return None if v is None else round(float(v), nd)


def _overall(rows):
    rm = [r["rmse_c"] for r in rows if r.get("rmse_c") is not None]
    bi = [r["bias_c"] for r in rows if r.get("bias_c") is not None]
    n = sum(r.get("n_obs", 0) for r in rows)
    return {"mean_rmse_c": _r(np.mean(rm)) if rm else None, "mean_bias_c": _r(np.mean(bi)) if bi else None, "n_obs": n}


@router.get("/validation/grid")
def validation_grid(store: GridStore = Depends(get_store)):
    """Architecture comparison vs the gridded target on the val/test years (incl. salinity ablation)."""
    m = store.json_output("metrics_grid.json")
    if m is None:
        raise ApiError(503, "validation_unavailable", "Grid evaluation has not been computed yet.")
    return m


@router.get("/validation/en4")
def validation_en4(store: GridStore = Depends(get_store)):
    """Large-scale cross-check vs the Met Office EN4 monthly 1° analysis (independent of the training target)."""
    m = store.json_output("metrics_en4.json")
    if m is None:
        raise ApiError(503, "validation_unavailable", "EN4 cross-check has not been computed yet.")
    return m


@router.get("/validation/profiles")
def validation_profiles(model: str | None = None, split: Literal["val", "test"] | None = None,
                        sort: Literal["date", "rmse_desc", "rmse_asc"] = "date",
                        limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                        db: Session = Depends(get_db), store: GridStore = Depends(get_store)):
    """Held-out Argo profiles with per-profile RMSE (Validation table)."""
    total, rows = argo_q.held_out_profiles(db, model or store.production_model, split, sort, limit, offset)
    return {"total": total, "limit": limit, "offset": offset, "profiles": rows}


@router.get("/validation/scatter")
def validation_scatter(model: str | None = None, split: Literal["val", "test"] = "test",
                       max_points: int = Query(4000, ge=100, le=20000), store: GridStore = Depends(get_store)):
    """Predicted vs observed pairs at standard depths for held-out profiles (sampled)."""
    import pandas as pd
    p = store.s.outputs_dir / "argo_predictions.parquet"
    prof_p = store.s.processed_dir / "argo_profiles.parquet"
    if not p.exists() or not prof_p.exists():
        raise ApiError(503, "validation_unavailable", "Validation records not computed yet.")
    model = model or store.production_model
    preds = pd.read_parquet(p)
    preds = preds[preds["model"] == model]
    prof = pd.read_parquet(prof_p, columns=["platform_number", "cycle_number", "split", "temp_std"])
    df = preds.merge(prof[prof["split"] == split], on=["platform_number", "cycle_number"])
    from ml.config import STANDARD_DEPTHS
    P = np.stack(df["pred"].to_numpy()) if len(df) else np.zeros((0, 15))
    O = np.stack(df["temp_std"].to_numpy()) if len(df) else np.zeros((0, 15))
    k = np.broadcast_to(np.arange(15), P.shape)
    ok = np.isfinite(P) & np.isfinite(O)
    pts = np.stack([P[ok], O[ok], STANDARD_DEPTHS[k[ok]]], 1)
    rng = np.random.default_rng(0)
    if len(pts) > max_points:
        pts = pts[rng.choice(len(pts), max_points, replace=False)]
    return {"model": model, "split": split, "n_total_pairs": int(ok.sum()),
            "points": [{"pred": round(float(a), 2), "obs": round(float(b), 2), "depth_m": float(c)} for a, b, c in pts]}


@router.get("/argo/markers")
def argo_markers(day: date = Query(..., alias="date"), window_days: int = Query(3, ge=0, le=15),
                 db: Session = Depends(get_db)):
    """Argo floats reporting within ±window_days of a date (map markers)."""
    return {"date": str(day), "window_days": window_days, "floats": argo_q.markers(db, day, window_days)}


@router.get("/argo/{argo_id}")
def argo_detail(argo_id: int, db: Session = Depends(get_db)):
    d = argo_q.profile_detail(db, argo_id)
    if d is None:
        raise ApiError(404, "not_found", f"Argo profile {argo_id} not found")
    return d
