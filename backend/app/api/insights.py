"""AI Insights, cyclone replay and report endpoints."""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.orm import Session, selectinload

from ml.config import LATS, LONS, STANDARD_DEPTHS, nearest_cell

from app.api.grid import build_profile
from app.db.models import CycloneTrack
from app.db.session import get_db
from app.errors import ApiError
from app.services import assistant, report
from app.services.store import GridStore, get_store

router = APIRouter(prefix="/v1", tags=["insights"])


@router.get("/embedding/projection")
def embedding_projection(store: GridStore = Depends(get_store)):
    """2-D PCA of the U-Net bottleneck (the satellite embedding), one point per region per day."""
    e = store.json_output("embeddings.json")
    if e is None:
        raise ApiError(503, "embedding_unavailable", "Embedding projection not precomputed yet.")
    return e


@router.get("/explain/importance")
def feature_importance(store: GridStore = Depends(get_store)):
    """LightGBM gain importances per depth (baseline-model explainability)."""
    p = store.s.oceanembed_data_dir / "models" / "baseline-lightgbm-v1" / "feature_importance.json"
    if not p.exists():
        raise ApiError(503, "importance_unavailable", "Feature importances not available.")
    return {"model": "baseline-lightgbm-v1", "method": "LightGBM split gain, normalised per depth",
            "per_depth": json.loads(p.read_text())}


class AssistantQuery(BaseModel):
    lat: float
    lon: float
    date: date


@router.post("/assistant/query")
def assistant_query(q: AssistantQuery, store: GridStore = Depends(get_store), db: Session = Depends(get_db)):
    """Plain-language summary of the computed profile (LLM optional, templated fallback)."""
    p = build_profile(store, None, q.date, q.lat, q.lon)
    return {**assistant.summarise(p), "date": p["date"], "lat": q.lat, "lon": q.lon, "derived": p["derived"]}


def _tracks(db: Session):
    return db.execute(select(CycloneTrack).options(selectinload(CycloneTrack.points)).order_by(CycloneTrack.season)).scalars().all()


@router.get("/cyclones")
def cyclones(db: Session = Depends(get_db)):
    """Historical cyclone tracks (IBTrACS) in the study period."""
    from geoalchemy2.shape import to_shape
    out = []
    for t in _tracks(db):
        pts = []
        for p in t.points:
            g = to_shape(p.location)
            pts.append({"time": p.observed_at.isoformat(), "lat": round(g.y, 2), "lon": round(g.x, 2),
                        "category": p.category, "grade": p.grade, "wind_kt": p.wind_kt})
        out.append({"id": t.id, "sid": t.sid, "name": t.name, "season": t.season, "peak_category": t.peak_category,
                    "start": pts[0]["time"] if pts else None, "end": pts[-1]["time"] if pts else None, "points": pts})
    return {"source": "NOAA NCEI IBTrACS v04r01 (North Indian)", "tracks": out}


@router.get("/cyclones/{track_id}/fuel")
def cyclone_fuel(track_id: int, lead_days: int = Query(0, ge=0, le=10),
                 db: Session = Depends(get_db), store: GridStore = Depends(get_store)):
    """Ocean heat along a cyclone track: reconstructed TCHP under each track point.

    ``lead_days`` samples the ocean N days *before* the storm passed (pre-storm fuel),
    avoiding the storm's own cold wake.
    """
    from datetime import timedelta
    from geoalchemy2.shape import to_shape
    t = db.get(CycloneTrack, track_id)
    if t is None:
        raise ApiError(404, "not_found", f"cyclone track {track_id} not found")
    from ml.config import in_domain
    import pandas as pd
    rows, idx = [], []  # idx: (row index, date used, i, j) for points over reconstructed ocean
    for p in t.points:
        g = to_shape(p.location)
        rec = {"time": p.observed_at.isoformat(), "lat": round(g.y, 2), "lon": round(g.x, 2),
               "category": p.category, "wind_kt": p.wind_kt, "tchp_kj_cm2": None, "d26_m": None, "sst_c": None,
               "ocean_date": None}
        if in_domain(g.y, g.x):
            i, j = nearest_cell(g.y, g.x)
            try:
                used, _ = store.resolve_date((p.observed_at - timedelta(days=lead_days)).date())
                if store.mask3d[0, i, j]:
                    idx.append((len(rows), used, i, j))
            except ApiError:
                pass
        rows.append(rec)
    if idx:
        # one vectorised read per variable instead of ~3 reads per track point
        import xarray as xr
        times = xr.DataArray(pd.DatetimeIndex([u for _, u, _, _ in idx]), dims="pt")
        ii = xr.DataArray([i for *_, i, _ in idx], dims="pt")
        jj = xr.DataArray([j for *_, j in idx], dims="pt")
        prod = store.products[store.production_model]
        tchp_v = prod["tchp"].sel(time=times).isel(lat=ii, lon=jj).values
        d26_v = prod["d26"].sel(time=times).isel(lat=ii, lon=jj).values
        sst_v = store.predictions[store.production_model]["temp"].isel(depth=0).sel(time=times).isel(lat=ii, lon=jj).values
        for n, (r, used, _, _) in enumerate(idx):
            rows[r].update(ocean_date=str(used), tchp_kj_cm2=_f(tchp_v[n]), d26_m=_f(d26_v[n]), sst_c=_f(sst_v[n]))
    vals = [r["tchp_kj_cm2"] for r in rows if r["tchp_kj_cm2"] is not None]
    return {"id": t.id, "name": t.name, "season": t.season, "peak_category": t.peak_category,
            "lead_days": lead_days, "points": rows,
            "max_tchp_kj_cm2": max(vals) if vals else None,
            "note": "TCHP from the satellite-only reconstruction; >50 kJ/cm² is commonly cited as supportive of intensification.",
            "model_version": store.production_model, "data_label": "cached"}


def _f(v, nd=1):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


@router.get("/report/{day}")
def report_file(day: date, lat: float, lon: float, format: Literal["pdf", "csv"] = "pdf", depth: float = 100,
                store: GridStore = Depends(get_store), db: Session = Depends(get_db)):
    """Water-column investigation report (PDF) or its numbers (CSV) for one point and day.

    `depth` (a standard depth) sets the reconstructed field shown in the PDF's map inset."""
    k = store.depth_index(depth)
    try:
        p = build_profile(store, db, day, lat, lon)
    except (OperationalError, InterfaceError):
        p = build_profile(store, None, day, lat, lon)
    summary = assistant.summarise(p)
    fname = f"oceansight_profile_{p['date']}_{lat:.2f}N_{lon:.2f}E"
    if format == "csv":
        return Response(report.profile_csv(p), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{fname}.csv"'})
    used = date.fromisoformat(p["date"])
    field = store.cube(store.production_model, used)["temp"][k]
    inset = report.map_inset(field, LATS, LONS, p["cell"]["lat"], p["cell"]["lon"], float(STANDARD_DEPTHS[k]))
    ts = store.times(store.production_model)
    pdf = report.profile_pdf(p, summary["summary"], _validation_line(store), inset=inset, depth=float(STANDARD_DEPTHS[k]),
                             period=f"{ts[0].date()}..{ts[-1].date()}")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'})


def _validation_line(store: GridStore) -> str:
    m = store.json_output("metrics_argo.json")
    try:
        sp = m["splits"]["test"]
        rows = sp["models"][store.production_model]["per_depth"]
        r100 = next(r for r in rows if r["depth_m"] == 100.0)
        return (f"Independent Argo validation ({sp['period']}, {sp['n_profiles']} held-out profiles): "
                f"RMSE {r100['rmse_c']:.2f} °C at 100 m.")
    except Exception:
        return "Independent Argo validation: see the Validation screen."
