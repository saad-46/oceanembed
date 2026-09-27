"""Typed API errors (docs/16 section 2): every failure is ``{"error": code, "detail": ...}``,
never a raw stack trace. The frontend maps codes to the calm error states in docs/12."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError, InterfaceError

log = logging.getLogger("oceanembed.api")


class ApiError(Exception):
    def __init__(self, status: int, error: str, detail: str, **extra):
        self.status, self.error, self.detail, self.extra = status, error, detail, extra


def date_out_of_range(detail: str) -> ApiError:
    return ApiError(404, "date_out_of_range", detail)


def out_of_domain(lat: float, lon: float) -> ApiError:
    return ApiError(422, "out_of_domain",
                    f"({lat}, {lon}) is outside the study domain 5-30N, 45-105E (North Indian Ocean).")


def on_land(lat: float, lon: float) -> ApiError:
    return ApiError(422, "on_land", f"({lat}, {lon}) is on land or in water shallower than the reconstruction grid.")


def invalid_depth(depth: float, allowed) -> ApiError:
    return ApiError(422, "invalid_depth", f"depth {depth} m is not a standard depth; use one of {list(map(int, allowed))}.")


def data_unavailable(detail: str) -> ApiError:
    return ApiError(503, "data_unavailable", detail)


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse({"error": e.error, "detail": e.detail, **e.extra}, status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        msgs = "; ".join(f"{'.'.join(str(p) for p in err['loc'][1:])}: {err['msg']}" for err in e.errors())
        return JSONResponse({"error": "invalid_request", "detail": msgs}, status_code=422)

    @app.exception_handler(OperationalError)
    @app.exception_handler(InterfaceError)
    async def _db(_: Request, e: Exception):
        log.error("database unavailable: %s", e.__class__.__name__)
        return JSONResponse({"error": "database_unavailable",
                             "detail": "The metadata database is temporarily unavailable."}, status_code=503)

    @app.exception_handler(Exception)
    async def _any(_: Request, e: Exception):
        log.exception("unhandled error")
        return JSONResponse({"error": "internal_error", "detail": "Unexpected server error."}, status_code=500)
