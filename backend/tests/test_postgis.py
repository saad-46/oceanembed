"""PostGIS integration tests (docs/17 GIS tests): migration applies, GiST indexes exist, and the
nearest-Argo-float query returns the expected float for a known point. Uses a throwaway
database `oceanembed_test` on the compose PostGIS; skipped if PostGIS is unreachable."""
import os
from datetime import date, datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

BASE = os.environ.get("TEST_DATABASE_ADMIN_URL", "postgresql+psycopg://oceanembed:oceanembed@localhost:5433/oceanembed")
TEST_URL = BASE.rsplit("/", 1)[0] + "/oceanembed_test"


@pytest.fixture(scope="module")
def engine():
    try:
        admin = create_engine(BASE, isolation_level="AUTOCOMMIT", connect_args={"connect_timeout": 3})
        with admin.connect() as c:
            c.execute(text("DROP DATABASE IF EXISTS oceanembed_test WITH (FORCE)"))
            c.execute(text("CREATE DATABASE oceanembed_test"))
    except Exception as e:  # pragma: no cover - environment dependent
        pytest.skip(f"PostGIS not reachable: {e.__class__.__name__}")
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    cfg.set_main_option("sqlalchemy.url", TEST_URL)
    command.upgrade(cfg, "head")
    eng = create_engine(TEST_URL)
    yield eng
    eng.dispose()
    with admin.connect() as c:
        c.execute(text("DROP DATABASE IF EXISTS oceanembed_test WITH (FORCE)"))


def _add(c, plat, cyc, day, lat, lon, used):
    c.execute(text("""INSERT INTO argo_profile (platform_number, cycle_number, profile_date, location, depths_m,
        temperature_c, salinity_psu, temp_std_c, split, used_in_training)
        VALUES (:p, :c, :d, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), ARRAY[0,10]::float[], ARRAY[29,28]::float[],
                ARRAY[34,34]::float[], ARRAY[29,28]::float[], :split, :used)"""),
              {"p": plat, "c": cyc, "d": day, "lat": lat, "lon": lon, "split": "train" if used else "test", "used": used})


def test_schema_and_gist_indexes(engine):
    with engine.connect() as c:
        tables = {r[0] for r in c.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))}
        assert {"region", "daily_product", "argo_profile", "prediction_at_argo", "skill_metric", "model_registry",
                "cyclone_track", "track_point"} <= tables
        gist = {r[0] for r in c.execute(text("SELECT indexname FROM pg_indexes WHERE indexdef ILIKE '%USING gist%'"))}
        assert {"idx_argo_profile_location", "idx_region_bbox", "idx_track_point_location"} <= gist


def test_nearest_float_prefers_independent_and_respects_radius(engine):
    from sqlalchemy.orm import Session

    from app.services.argo import nearest_float

    with engine.begin() as c:
        _add(c, "1111111", 1, datetime(2023, 5, 11, 6), 15.05, 88.05, used=False)   # ~7 km, independent
        _add(c, "2222222", 1, datetime(2023, 5, 11, 6), 15.01, 88.01, used=True)    # closer, but training-year flag
        _add(c, "3333333", 1, datetime(2023, 5, 11, 6), 17.0, 90.0, used=False)     # ~300 km away
    with Session(engine) as db:
        f = nearest_float(db, 15.0, 88.0, date(2023, 5, 11))
        assert f["platform_number"] == "1111111" and f["independent"] is True
        assert 5 < f["distance_km"] < 10
        assert nearest_float(db, 22.0, 60.0, date(2023, 5, 11)) is None           # nothing within 100 km
        assert nearest_float(db, 15.0, 88.0, date(2023, 6, 30)) is None           # outside +/-3 day window
