"""Load pipeline outputs into PostGIS (idempotent).

    python -m app.db.seed            # from backend/, after `alembic upgrade head`

Seeds: regions, model registry, Argo profiles (with the used_in_training flag),
per-profile predictions, per-depth skill metrics (Argo-independent + grid-target),
IBTrACS cyclone tracks, and daily_product pointers.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sqlalchemy import delete, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from ml.config import REGIONS  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db.models import (ArgoProfile, CycloneTrack, DailyProduct, ModelRegistry, PredictionAtArgo, Region,  # noqa: E402
                           SkillMetric, TrackPoint)
from app.db.session import get_engine  # noqa: E402

log = logging.getLogger("oceanembed.seed")


def _clean(xs):
    return [None if x is None or (isinstance(x, float) and not np.isfinite(x)) else float(x) for x in xs]


def seed_regions(db: Session):
    db.execute(delete(Region))
    for r in REGIONS:
        db.add(Region(name=r.name, bbox=f"SRID=4326;POLYGON(({r.min_lon} {r.min_lat},{r.max_lon} {r.min_lat},"
                                          f"{r.max_lon} {r.max_lat},{r.min_lon} {r.max_lat},{r.min_lon} {r.min_lat}))"))


def seed_models(db: Session, outputs: Path) -> dict[str, int]:
    reg = json.loads((outputs / "model_registry.json").read_text()) if (outputs / "model_registry.json").exists() else []
    reg = reg + [{"name": "climatology", "architecture": "Harmonic climatology", "inputs": [],
                  "training_period_start": "2019-01-01", "training_period_end": "2021-12-31",
                  "checkpoint_path": "processed/climatology.zarr", "is_production": False}]
    ids = {}
    db.execute(text("UPDATE model_registry SET is_production = false"))
    for r in reg:
        m = db.query(ModelRegistry).filter_by(name=r["name"]).one_or_none() or ModelRegistry(name=r["name"])
        m.architecture = r["architecture"]; m.inputs = r.get("inputs", [])
        m.training_period_start = date.fromisoformat(r["training_period_start"])
        m.training_period_end = date.fromisoformat(r["training_period_end"])
        m.checkpoint_path = r.get("checkpoint_path"); m.is_production = bool(r.get("is_production"))
        m.details = {k: v for k, v in r.items() if k not in ("name", "architecture", "inputs", "is_production")}
        db.add(m); db.flush()
        ids[r["name"]] = m.id
    return ids


def seed_argo(db: Session, processed: Path) -> dict[tuple[str, int], int]:
    df = pd.read_parquet(processed / "argo_profiles.parquet")
    db.execute(delete(ArgoProfile))
    rows = [{
        "platform_number": r.platform_number, "cycle_number": int(r.cycle_number),
        "profile_date": pd.Timestamp(r.profile_date).to_pydatetime(),
        "location": f"SRID=4326;POINT({r.lon} {r.lat})",
        "depths_m": _clean(r.depths_m), "temperature_c": _clean(r.temperature_c), "salinity_psu": _clean(r.salinity_psu),
        "temp_std_c": _clean(r.temp_std), "data_mode": (r.data_mode or "")[:4], "split": r.split,
        "used_in_training": bool(r.used_in_training),
    } for r in df.itertuples()]
    for k in range(0, len(rows), 2000):
        db.execute(ArgoProfile.__table__.insert(), rows[k:k + 2000])
    ids = {(p, c): i for i, p, c in db.execute(text("SELECT id, platform_number, cycle_number FROM argo_profile"))}
    log.info("argo profiles: %d", len(ids))
    return ids


def seed_predictions(db: Session, outputs: Path, argo_ids: dict, model_ids: dict):
    p = outputs / "argo_predictions.parquet"
    if not p.exists():
        return
    df = pd.read_parquet(p)
    rows = []
    for r in df.itertuples():
        aid, mid = argo_ids.get((r.platform_number, int(r.cycle_number))), model_ids.get(r.model)
        if aid is None or mid is None:
            continue
        rows.append({"argo_profile_id": aid, "model_version_id": mid, "predicted_temperature_c": _clean(r.pred),
                     "predicted_uncertainty_c": None if r.sigma is None else _clean(r.sigma),
                     "distance_km": float(r.distance_km), "date_offset_days": int(r.date_offset_days),
                     "rmse_c": float(r.rmse_c) if np.isfinite(r.rmse_c) else None, "n_levels": int(r.n_levels)})
    db.execute(delete(PredictionAtArgo))
    for k in range(0, len(rows), 5000):
        db.execute(PredictionAtArgo.__table__.insert(), rows[k:k + 5000])
    log.info("predictions at argo: %d", len(rows))


def seed_skill(db: Session, outputs: Path, model_ids: dict):
    db.execute(delete(SkillMetric))
    for fname, ev in (("metrics_argo.json", "argo_independent"), ("metrics_grid.json", "grid_target")):
        p = outputs / fname
        if not p.exists():
            continue
        m = json.loads(p.read_text())
        for split, sp in m["splits"].items():
            if split == "train":
                continue  # in-sample numbers are never stored as skill
            start, end = [date.fromisoformat(x) for x in sp["period"].split("..")]
            for name, res in sp["models"].items():
                if name not in model_ids:
                    continue
                for r in res["per_depth"]:
                    db.add(SkillMetric(model_version_id=model_ids[name], evaluation=ev, split=split, depth_m=r["depth_m"],
                                       rmse_c=r.get("rmse_c"), bias_c=r.get("bias_c"), correlation=r.get("corr"),
                                       n_obs=r.get("n_obs", 0), clim_rmse_c=r.get("clim_rmse_c"),
                                       skill_vs_climatology=r.get("skill_vs_climatology"),
                                       held_out_period_start=start, held_out_period_end=end))


def seed_cyclones(db: Session, processed: Path):
    p = processed / "cyclones.json"
    if not p.exists():
        return
    db.execute(delete(CycloneTrack))
    for t in json.loads(p.read_text())["tracks"]:
        ct = CycloneTrack(sid=t["sid"], name=t["name"], season=t["season"], peak_category=t["peak_category"])
        for pt in t["points"]:
            ct.points.append(TrackPoint(location=f"SRID=4326;POINT({pt['lon']} {pt['lat']})",
                                        observed_at=pd.Timestamp(pt["time"]).to_pydatetime(),
                                        category=pt["category"], grade=pt["grade"], wind_kt=pt["wind_kt"]))
        db.add(ct)


def seed_daily_products(db: Session, outputs: Path, model_ids: dict):
    import xarray as xr
    db.execute(delete(DailyProduct))
    demo = (pd.Timestamp("2023-05-01"), pd.Timestamp("2023-06-30"))
    for path in sorted((outputs / "predictions").glob("*.zarr")):
        if path.stem not in model_ids:
            continue
        ts = pd.DatetimeIndex(xr.open_zarr(path).time.values)
        db.execute(DailyProduct.__table__.insert(), [
            {"date": t.date(), "grid_path": f"outputs/predictions/{path.name}", "model_version_id": model_ids[path.stem],
             "is_cached_demo": bool(demo[0] <= t <= demo[1])} for t in ts])


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    s = get_settings()
    outputs, processed = s.outputs_dir, s.processed_dir
    with Session(get_engine()) as db, db.begin():
        seed_regions(db)
        model_ids = seed_models(db, outputs)
        argo_ids = seed_argo(db, processed)
        seed_predictions(db, outputs, argo_ids, model_ids)
        seed_skill(db, outputs, model_ids)
        seed_cyclones(db, processed)
        seed_daily_products(db, outputs, model_ids)
    with get_engine().connect() as c:
        for t in ("region", "model_registry", "argo_profile", "prediction_at_argo", "skill_metric", "cyclone_track",
                  "track_point", "daily_product"):
            log.info("%-20s %d rows", t, c.execute(text(f"SELECT count(*) FROM {t}")).scalar_one())


if __name__ == "__main__":
    main()
