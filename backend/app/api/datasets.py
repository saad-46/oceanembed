"""Surface layers (salinity, sea-level anomaly, wind), data quality and data lineage."""
from __future__ import annotations

from datetime import date
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query

from ml.config import LATS, LONS, STANDARD_DEPTHS

from app.errors import ApiError
from app.schemas import DataQuality, LayerGrid, Lineage, WindVectors
from app.services import catalog
from app.services.catalog import layer_status, prov
from app.services.store import GridStore, get_store, grid_to_lists

router = APIRouter(prefix="/v1", tags=["datasets"])

CLASSIFICATIONS = {
    "measured": "Direct in-situ observation (Argo floats; IBTrACS best-track positions and winds)",
    "satellite": "Satellite-derived observation product (gap-filled daily field)",
    "reanalysis": "Data-assimilative ocean model analysis or reanalysis, or an objective analysis of observations",
    "reconstructed": "OceanSight model output",
    "derived": "Deterministic calculation from reconstructed, measured or reanalysis values",
    "estimated": "Statistical estimate with additional assumptions (uncertainty, error estimates)",
    "forecast": "Extrapolation beyond the issue date (statistical; not a trained forecast model)",
    "baseline": "Reference used for comparison (seasonal climatology)",
}
WIND_NOTE = ("Speed of the daily-mean wind vector computed from the daily u/v components; it can be lower than the daily "
             "mean of the instantaneous wind speed. 10 m wind over the ocean, not an ocean current.")
SLA_NOTE = ("Sea-level anomaly relative to the provider's reference mean sea surface (reference period as defined by the "
            "source product; see its documentation).")


def _unavailable(key: str, store: GridStore) -> ApiError:
    st = layer_status(store)[key]
    return ApiError(503, "optional_dataset_unavailable", st["detail"], availability=st["status"])


def _grid(values: np.ndarray, nd: int, *, day: date, used: date, variable: str, depth, units: str, source: str,
          model: str, notice, provenance: dict) -> dict:
    finite = values[np.isfinite(values)]
    return {"date": str(used), "requested_date": str(day), "variable": variable, "depth_m": depth, "units": units,
            "grid": {"lat": LATS.tolist(), "lon": LONS.tolist(), "values": grid_to_lists(values, nd)},
            "stats": {"min": round(float(finite.min()), nd), "max": round(float(finite.max()), nd),
                      "mean": round(float(finite.mean()), nd)} if finite.size else None,
            "source": source, "data_label": "cached", "model_version": model, "notice": notice, "provenance": provenance}


def _sss(store: GridStore, used: date) -> np.ndarray:
    prod = store.products.get(store.production_model)
    if prod is not None and "sss" in prod:
        return store.product_grid(used, "sss")
    if store.inputs is not None and "sss" in store.inputs:
        return store.surface(used, "sss")
    raise _unavailable("sss", store)


@router.get("/surface/{day}", response_model=LayerGrid)
def surface(day: date, variable: Literal["sla", "wind_speed", "sss"] = "sla", store: GridStore = Depends(get_store)):
    """Satellite surface fields on the model grid (the model's own inputs): SLA (cm), 10 m wind speed (m/s), SSS (PSU)."""
    used, notice = store.resolve_date(day)
    model = store.production_model
    if variable == "sla":
        if layer_status(store)["sla"]["status"] != "available":
            raise _unavailable("sla", store)
        src = catalog.source(store, "sla")
        vals = store.surface(used, "sla") * 100.0
        return _grid(vals, 1, day=day, used=used, variable="sla", depth=0.0, units="cm", source="satellite_input", model=model,
                     notice=notice, provenance=prov("input_sla", dataset=src["product"], note=SLA_NOTE))
    if variable == "wind_speed":
        if layer_status(store)["wind"]["status"] != "available":
            raise _unavailable("wind", store)
        src = catalog.source(store, "winds")
        vals = np.hypot(store.surface(used, "uwind"), store.surface(used, "vwind"))
        return _grid(vals, 1, day=day, used=used, variable="wind_speed", depth=10.0, units="m/s", source="satellite_input",
                     model=model, notice=notice, provenance=prov("input_winds", dataset=src["product"], note=WIND_NOTE))
    src = catalog.source(store, "sss")
    return _grid(_sss(store, used), 2, day=day, used=used, variable="sss", depth=0.0, units="PSU", source="satellite_input",
                 model=model, notice=notice, provenance=prov("input_sss", dataset=src["product"],
                                                             note="Practical salinity from satellite radiometry; surface only."))


@router.get("/wind/{day}/vectors", response_model=WindVectors)
def wind_vectors(day: date, stride: int = Query(8, ge=4, le=20), store: GridStore = Depends(get_store)):
    """Subsampled 10 m wind vectors (every ``stride``-th cell) for arrows on the map."""
    if layer_status(store)["wind"]["status"] != "available":
        raise _unavailable("wind", store)
    used, notice = store.resolve_date(day)
    u, v = store.surface(used, "uwind"), store.surface(used, "vwind")
    ii, jj = np.arange(stride // 2, LATS.size, stride), np.arange(stride // 2, LONS.size, stride)
    out = []
    for i in ii:
        for j in jj:
            a, b = float(u[i, j]), float(v[i, j])
            if np.isfinite(a) and np.isfinite(b):
                out.append({"lat": float(LATS[i]), "lon": float(LONS[j]), "u_ms": round(a, 2), "v_ms": round(b, 2),
                            "speed_ms": round(float(np.hypot(a, b)), 2),
                            "direction_from_deg": round(float((270.0 - np.degrees(np.arctan2(b, a))) % 360.0), 1)})
    src = catalog.source(store, "winds")
    return {"date": str(used), "requested_date": str(day), "stride": stride, "vectors": out,
            "direction_convention": "meteorological: direction the wind blows FROM, degrees clockwise from north",
            "notice": notice, "provenance": prov("input_winds", dataset=src["product"], note=WIND_NOTE)}


@router.get("/salinity/{day}", response_model=LayerGrid)
def salinity(day: date, depth: float = 0, store: GridStore = Depends(get_store)):
    """Salinity map: satellite SSS at 0 m; the optional GLORYS reanalysis below the surface.

    OceanSight does not reconstruct salinity. Without the optional store, depth > 0 returns
    ``optional_dataset_unavailable`` (503) with ``availability`` not_configured / not_precomputed.
    """
    k = store.depth_index(depth)
    if k == 0:
        return surface(day, "sss", store)
    ds = store.salinity3d
    if ds is None:
        raise _unavailable("salinity_subsurface", store)
    ts = pd.DatetimeIndex(ds.time.values)
    n = int(np.argmin(np.abs((ts - pd.Timestamp(day)).days)))
    gap = (ts[n] - pd.Timestamp(day)).days
    if abs(gap) > 7:
        raise ApiError(404, "date_out_of_range", f"No reanalysis salinity within 7 days of {day}.")
    used = ts[n].date()
    notice = None if gap == 0 else f"Reanalysis salinity is precomputed on sampled days — showing {used} ({abs(gap)} d {'later' if gap > 0 else 'earlier'})."
    vals = np.where(store.mask3d[k], ds["so"].isel(time=n, depth=k).values.astype(np.float32), np.nan)
    src = catalog.source(store, "salinity")
    return _grid(vals, 2, day=day, used=used, variable="salinity", depth=float(STANDARD_DEPTHS[k]), units="PSU",
                 source="reanalysis", model=store.production_model, notice=notice,
                 provenance=prov("glorys_salinity", dataset=src["product"]))


@router.get("/data-quality", response_model=DataQuality)
def data_quality(store: GridStore = Depends(get_store)):
    """Dataset inventory, QC statistics and QC rules, computed from the pipeline's own QC records."""
    return catalog.data_quality(store)


@router.get("/provenance", response_model=Lineage)
def provenance(store: GridStore = Depends(get_store)):
    """Lineage table: every variable with its classification, source, resolution, coverage, processing and availability."""
    return {"classifications": CLASSIFICATIONS, "variables": catalog.lineage(store),
            "optional_sources": catalog.optional_sources(store),
            "model_version": store.production_model if store.predictions else None}
