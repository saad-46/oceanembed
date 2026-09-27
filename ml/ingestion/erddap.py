"""Minimal ERDDAP griddap client used by the open (no-login) input adapters.

Requests are chunked by calendar month and cached as NetCDF under
``data/raw/<source>/<dataset_id>/YYYY-MM.nc`` so re-runs are free and an interrupted
ingestion resumes where it stopped.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date
from functools import lru_cache

import numpy as np
import requests
import xarray as xr

from ml.ingestion.base import DEFAULT_BBOX, SourceAdapter, http_get

log = logging.getLogger("oceanembed.ingestion.erddap")
PAD = 0.5  # degrees of margin so bilinear regridding has neighbours at the domain edge


@lru_cache(maxsize=32)
def axis_values(server: str, dataset_id: str, axis: str) -> np.ndarray:
    url = f"{server}/erddap/griddap/{dataset_id}.csv0?{axis}"
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    return np.array([float(x) for x in r.text.split()])


def month_chunks(start: date, end: date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        first = date(y, m, 1)
        last = date(y, m, calendar.monthrange(y, m)[1])
        yield max(first, start), min(last, end)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


class ErddapGridAdapter(SourceAdapter):
    server: str
    variables: tuple[str, ...]
    rename: dict[str, str] = {}
    #: extra singleton dimensions between time and lat, e.g. ("zlev", 0.0)
    extra_dims: tuple[tuple[str, float], ...] = ()
    lon_360: bool = False

    def _query(self, start: date, end: date, bbox) -> str:
        min_lon, max_lon, min_lat, max_lat = bbox
        lats = axis_values(self.server, self.provenance.dataset_id, "latitude")
        lat_lo, lat_hi = min_lat - PAD, max_lat + PAD
        lat_sel = f"({lat_lo}):1:({lat_hi})" if lats[0] < lats[-1] else f"({lat_hi}):1:({lat_lo})"
        lo_lon, hi_lon = min_lon - PAD, max_lon + PAD
        if self.lon_360:
            lo_lon, hi_lon = lo_lon % 360, hi_lon % 360
        extra = "".join(f"[({v}):1:({v})]" for _, v in self.extra_dims)
        dims = f"[({start.isoformat()}T00:00:00Z):1:({end.isoformat()}T23:59:59Z)]{extra}[{lat_sel}][({lo_lon}):1:({hi_lon})]"
        return ",".join(f"{v}{dims}" for v in self.variables)

    def fetch_month(self, start: date, end: date, bbox=DEFAULT_BBOX) -> xr.Dataset:
        dest = self.cache_dir / f"{start:%Y-%m-%d}_{end:%Y-%m-%d}.nc"
        url = f"{self.server}/erddap/griddap/{self.provenance.dataset_id}.nc?{self._query(start, end, bbox)}"
        try:
            http_get(url, dest)
        except FileNotFoundError:
            # ERDDAP answers 404 when the whole window has no data (product gap).
            log.warning("%s: no data %s..%s", self.provenance.dataset_id, start, end)
            return xr.Dataset()
        ds = xr.open_dataset(dest).load()
        ds.close()
        for dim, _ in self.extra_dims:
            if dim in ds.dims:
                ds = ds.isel({dim: 0}, drop=True)
        ds = ds.rename({"latitude": "lat", "longitude": "lon", **self.rename})
        ds["time"] = ds["time"].dt.floor("D")  # daily convention: label by UTC date
        # ERDDAP snaps range endpoints to the *nearest* timestamp, so a chunk can spill
        # one day either side; trim to the requested window.
        return ds.sel(time=slice(np.datetime64(start), np.datetime64(end)))

    def fetch(self, start: date, end: date, bbox=DEFAULT_BBOX) -> xr.Dataset:
        parts = [p for a, b in month_chunks(start, end) if (p := self.fetch_month(a, b, bbox)).sizes]
        if not parts:
            raise RuntimeError(f"{self.provenance.dataset_id}: no data in {start}..{end}")
        ds = xr.concat(parts, dim="time")
        ds.attrs.update(self.provenance.as_attrs())
        return ds
