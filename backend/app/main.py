"""OceanSight / OceanEmbed API. Run: ``uvicorn app.main:app --port 8100`` from ``backend/``."""
from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

# Make the shared, numpy-only ``ml`` package (domain config, derived products) importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.middleware.gzip import GZipMiddleware  # noqa: E402

from app import errors  # noqa: E402
from app.api import core, grid, insights, validation  # noqa: E402
from app.config import get_settings  # noqa: E402


class JsonFormatter(logging.Formatter):
    def format(self, r: logging.LogRecord) -> str:
        d = {"ts": self.formatTime(r), "level": r.levelname, "logger": r.name, "msg": r.getMessage()}
        for k in ("method", "path", "status", "ms"):
            if hasattr(r, k):
                d[k] = getattr(r, k)
        return json.dumps(d)


def _logging():
    h = logging.StreamHandler()
    h.setFormatter(JsonFormatter())
    root = logging.getLogger("oceanembed")
    root.handlers = [h]
    root.setLevel(get_settings().log_level)
    root.propagate = False


def create_app() -> FastAPI:
    _logging()
    s = get_settings()
    app = FastAPI(title="OceanSight — OceanEmbed API", version="1.0.0",
                  description="Satellite-embedding reconstruction of North Indian Ocean subsurface temperature "
                              "(SIH26066). All endpoints serve precomputed, cached reconstructions.")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_list, allow_methods=["GET", "POST"], allow_headers=["*"])
    errors.install(app)
    log = logging.getLogger("oceanembed.access")

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        t0 = time.perf_counter()
        resp = await call_next(request)
        log.info("request", extra={"method": request.method, "path": request.url.path, "status": resp.status_code,
                                   "ms": round((time.perf_counter() - t0) * 1000, 1)})
        return resp

    for r in (core.router, grid.router, validation.router, insights.router):
        app.include_router(r)
    return app


app = create_app()
