"""PostGIS queries for Argo floats and validation records (docs/14 section 4)."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

NEAREST_SQL = text("""
SELECT id, platform_number, cycle_number, profile_date, split, used_in_training, temp_std_c,
       ST_Y(location) AS lat, ST_X(location) AS lon,
       ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) / 1000 AS distance_km
FROM argo_profile
WHERE profile_date >= :t0 AND profile_date < :t1
  AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius_m)
ORDER BY used_in_training ASC, distance_km ASC
LIMIT 1
""")


def nearest_float(db: Session, lat: float, lon: float, d: date, radius_km: float = 100, window_days: int = 3):
    row = db.execute(NEAREST_SQL, {"lat": lat, "lon": lon, "radius_m": radius_km * 1000,
                                   "t0": d - timedelta(days=window_days), "t1": d + timedelta(days=window_days + 1)}).mappings().first()
    if row is None:
        return None
    return {
        "id": row["id"], "platform_number": row["platform_number"], "cycle_number": row["cycle_number"],
        "profile_date": row["profile_date"].isoformat(), "lat": round(row["lat"], 3), "lon": round(row["lon"], 3),
        "distance_km": round(float(row["distance_km"]), 1),
        "date_offset_days": (row["profile_date"].date() - d).days,
        "split": row["split"], "used_in_training": row["used_in_training"],
        "independent": not row["used_in_training"],
        "temperature_c_std_depths": [None if v is None or v != v else round(v, 2) for v in row["temp_std_c"]],
    }


def markers(db: Session, d: date, window_days: int = 3, limit: int = 500):
    rows = db.execute(text("""
        SELECT a.id, a.platform_number, a.cycle_number, a.profile_date, a.split, a.used_in_training,
               ST_Y(a.location) AS lat, ST_X(a.location) AS lon, p.rmse_c
        FROM argo_profile a
        LEFT JOIN prediction_at_argo p ON p.argo_profile_id = a.id
             AND p.model_version_id = (SELECT id FROM model_registry WHERE is_production LIMIT 1)
        WHERE a.profile_date >= :t0 AND a.profile_date < :t1
        ORDER BY a.profile_date LIMIT :limit"""),
        {"t0": d - timedelta(days=window_days), "t1": d + timedelta(days=window_days + 1), "limit": limit}).mappings().all()
    return [{"id": r["id"], "platform_number": r["platform_number"], "cycle_number": r["cycle_number"],
             "profile_date": r["profile_date"].isoformat(), "lat": round(r["lat"], 3), "lon": round(r["lon"], 3),
             "split": r["split"], "independent": not r["used_in_training"],
             "rmse_c": None if r["rmse_c"] is None else round(r["rmse_c"], 3)} for r in rows]


def profile_detail(db: Session, argo_id: int):
    r = db.execute(text("""
        SELECT id, platform_number, cycle_number, profile_date, split, used_in_training, data_mode,
               depths_m, temperature_c, salinity_psu, temp_std_c, ST_Y(location) AS lat, ST_X(location) AS lon
        FROM argo_profile WHERE id = :id"""), {"id": argo_id}).mappings().first()
    if r is None:
        return None
    preds = db.execute(text("""
        SELECT m.name, p.predicted_temperature_c, p.predicted_uncertainty_c, p.rmse_c, p.distance_km, p.n_levels
        FROM prediction_at_argo p JOIN model_registry m ON m.id = p.model_version_id
        WHERE p.argo_profile_id = :id ORDER BY m.name"""), {"id": argo_id}).mappings().all()
    clean = lambda xs: [None if x is None or x != x else round(x, 3) for x in xs] if xs is not None else None
    return {
        "id": r["id"], "platform_number": r["platform_number"], "cycle_number": r["cycle_number"],
        "profile_date": r["profile_date"].isoformat(), "lat": round(r["lat"], 3), "lon": round(r["lon"], 3),
        "split": r["split"], "independent": not r["used_in_training"], "data_mode": r["data_mode"],
        "native": {"depths_m": clean(r["depths_m"]), "temperature_c": clean(r["temperature_c"]),
                   "salinity_psu": clean(r["salinity_psu"])},
        "temperature_c_std_depths": clean(r["temp_std_c"]),
        "predictions": [{"model": p["name"], "temperature_c": clean(p["predicted_temperature_c"]),
                         "uncertainty_c": clean(p["predicted_uncertainty_c"]), "rmse_c": p["rmse_c"],
                         "distance_km": p["distance_km"], "n_levels": p["n_levels"]} for p in preds],
    }


def held_out_profiles(db: Session, model: str, split: str | None, sort: str, limit: int, offset: int):
    order = {"rmse_desc": "p.rmse_c DESC NULLS LAST", "rmse_asc": "p.rmse_c ASC NULLS LAST",
             "date": "a.profile_date ASC"}.get(sort, "a.profile_date ASC")
    splits = ("val", "test") if split is None else (split,)
    rows = db.execute(text(f"""
        SELECT a.id, a.platform_number, a.cycle_number, a.profile_date, a.split,
               ST_Y(a.location) AS lat, ST_X(a.location) AS lon, p.rmse_c, p.n_levels, p.distance_km
        FROM argo_profile a JOIN prediction_at_argo p ON p.argo_profile_id = a.id
        JOIN model_registry m ON m.id = p.model_version_id
        WHERE m.name = :model AND a.used_in_training = false AND a.split = ANY(:splits)
        ORDER BY {order} LIMIT :limit OFFSET :offset"""),
        {"model": model, "splits": list(splits), "limit": limit, "offset": offset}).mappings().all()
    total = db.execute(text("""SELECT count(*) FROM argo_profile a JOIN prediction_at_argo p ON p.argo_profile_id = a.id
        JOIN model_registry m ON m.id = p.model_version_id
        WHERE m.name = :model AND a.used_in_training = false AND a.split = ANY(:splits)"""),
        {"model": model, "splits": list(splits)}).scalar_one()
    return total, [{"id": r["id"], "platform_number": r["platform_number"], "cycle_number": r["cycle_number"],
                    "profile_date": r["profile_date"].isoformat(), "split": r["split"],
                    "lat": round(r["lat"], 3), "lon": round(r["lon"], 3),
                    "rmse_c": None if r["rmse_c"] is None else round(r["rmse_c"], 3),
                    "n_levels": r["n_levels"], "distance_km": round(r["distance_km"], 1)} for r in rows]


def skill_rows(db: Session, model: str, evaluation: str, split: str):
    return db.execute(text("""
        SELECT s.depth_m, s.rmse_c, s.bias_c, s.correlation, s.n_obs, s.clim_rmse_c, s.skill_vs_climatology,
               s.held_out_period_start, s.held_out_period_end
        FROM skill_metric s JOIN model_registry m ON m.id = s.model_version_id
        WHERE m.name = :model AND s.evaluation = :ev AND s.split = :split ORDER BY s.depth_m"""),
        {"model": model, "ev": evaluation, "split": split}).mappings().all()
