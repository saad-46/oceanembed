"""Training-target adapters: subsurface temperature at the 15 standard depths.

Primary (the PS's named target): GLORYS12V1 via Copernicus Marine (credentialed).
Open fallback used for the current trained model: HYCOM GOFS 3.1 GLBy0.08/expt_93.0,
the US Navy's global 1/12 deg data-assimilative ocean analysis, served anonymously
via THREDDS NCSS. Both are 1/12 deg data-assimilative ocean model products that
ingest Argo, so the leakage caveat in docs/10 section 3 applies identically.
See docs/DECISIONS.md D-002.

Output of both adapters is identical: per-day ``temp(depth=15, lat=100, lon=240)`` on
the common 0.25 deg grid, produced by vertical interpolation to the standard depths
followed by area-weighted coarsening (never subsampling).
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

import numpy as np
import xarray as xr

from ml.config import LATS, LONS, STANDARD_DEPTHS
from ml.ingestion.base import DEFAULT_BBOX, Provenance, SourceAdapter, http_get
from ml.ingestion.copernicus import CopernicusMarineAdapter, cmems_provenance
from ml.pipeline.regrid import coarsen_to_target, interp_depth

log = logging.getLogger("oceanembed.ingestion.target")


def to_standard_grid(temp: np.ndarray, depth: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """(n_depth, lat, lon) native field -> (15, 100, 240) on the standard depths / 0.25 deg grid."""
    keep = depth <= 1000.0 + 1e-6
    zi = interp_depth(depth[keep], temp[keep], STANDARD_DEPTHS)
    return coarsen_to_target(zi, lat, lon)


def _day_dataset(day: date, temp: np.ndarray, prov: Provenance) -> xr.Dataset:
    ds = xr.Dataset(
        {"temp": (("time", "depth", "lat", "lon"), temp[None].astype(np.float32))},
        coords={"time": [np.datetime64(day, "ns")], "depth": STANDARD_DEPTHS, "lat": LATS, "lon": LONS},
    )
    ds.attrs.update(prov.as_attrs())
    return ds


class TargetAdapter(SourceAdapter):
    def fetch_day(self, day: date, bbox=DEFAULT_BBOX) -> xr.Dataset | None:
        raise NotImplementedError

    def fetch_days(self, days: list[date], bbox=DEFAULT_BBOX, workers: int = 4) -> list[date]:
        """Fetch many days concurrently; returns the days that succeeded (cached on disk)."""
        ok: list[date] = []
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(self.fetch_day, d, bbox): d for d in days}
            for i, f in enumerate(as_completed(futs), 1):
                d = futs[f]
                try:
                    if f.result() is not None:
                        ok.append(d)
                except Exception as e:  # keep going; a missing day is logged, not fatal
                    log.error("target %s failed: %s", d, e)
                if i % 10 == 0:
                    log.info("target progress %d/%d", i, len(days))
        return sorted(ok)

    def cached_days(self) -> list[date]:
        return sorted(date.fromisoformat(p.stem) for p in (self.cache_dir / "std").glob("*.nc"))

    def fetch(self, start: date, end: date, bbox=DEFAULT_BBOX) -> xr.Dataset:
        days = [start + timedelta(n) for n in range((end - start).days + 1)]
        self.fetch_days(days, bbox)
        return self.load_cached(days)

    def cached_path(self, day: date):
        return self.cache_dir / "std" / f"{day:%Y-%m-%d}.nc"

    def load_cached(self, days: list[date]) -> xr.Dataset:
        paths = [p for d in days if (p := self.cached_path(d)).exists()]
        return xr.concat([xr.open_dataset(p).load() for p in paths], "time")


class HycomTarget(TargetAdapter):
    provenance = Provenance(
        source_key="target", product="HYCOM GOFS 3.1 analysis (GLBy0.08/expt_93.0), 12Z snapshot",
        provider="HYCOM consortium / US Navy (NRL, FNMOC)", dataset_id="GLBy0.08_expt_93.0_ts3z",
        url="https://www.hycom.org/dataserver/gofs-3pt1/analysis",
        license="Approved for public release; distribution unlimited",
        native_resolution="1/12 deg x 40 levels, 3-hourly", requires_credentials=False,
    )
    NCSS = "https://ncss.hycom.org/thredds/ncss/GLBy0.08/expt_93.0/ts3z"
    FIRST_DAY, LAST_DAY = date(2018, 12, 4), date(2024, 9, 4)

    def fetch_day(self, day: date, bbox=DEFAULT_BBOX) -> xr.Dataset | None:
        out = self.cached_path(day)
        if out.exists():
            return xr.open_dataset(out)
        if not (self.FIRST_DAY <= day <= self.LAST_DAY):
            return None
        min_lon, max_lon, min_lat, max_lat = bbox
        url = (f"{self.NCSS}?var=water_temp&north={max_lat}&south={min_lat}&west={min_lon}&east={max_lon}"
               f"&horizStride=1&time={day.isoformat()}T12:00:00Z&accept=netcdf4")
        raw = self.cache_dir / "native" / f"{day:%Y-%m-%d}.nc"
        http_get(url, raw, timeout=600)
        with xr.open_dataset(raw) as ds:
            t = ds["time"].values[0]
            if abs((np.datetime64(t, "D") - np.datetime64(day, "D")).astype(int)) > 0:
                raw.unlink(missing_ok=True)
                raise RuntimeError(f"HYCOM returned {t} for {day} (gap in archive)")
            std = to_standard_grid(ds["water_temp"].values[0], ds["depth"].values, ds["lat"].values, ds["lon"].values)
        out.parent.mkdir(parents=True, exist_ok=True)
        day_ds = _day_dataset(day, std, self.provenance)
        day_ds.to_netcdf(out, encoding={"temp": {"zlib": True, "complevel": 4}})
        raw.unlink(missing_ok=True)  # native 1/12 deg file is ~10 MB/day; keep only the standardised grid
        return day_ds


class _GlorysNative(CopernicusMarineAdapter):
    provenance = cmems_provenance("target", "GLORYS12V1 reanalysis", "cmems_mod_glo_phy_my_0.083deg_P1D-m",
                                  "GLOBAL_MULTIYEAR_PHY_001_030", "1/12 deg x 50 levels, daily mean")
    variables = ("thetao",)
    depth_range = (0.0, 1100.0)


class GlorysTarget(TargetAdapter):
    provenance = _GlorysNative.provenance

    def __init__(self):
        self._native = _GlorysNative()

    def available(self) -> bool:
        return self._native.available()

    def fetch_day(self, day: date, bbox=DEFAULT_BBOX) -> xr.Dataset | None:
        out = self.cached_path(day)
        if out.exists():
            return xr.open_dataset(out)
        ds = self._native.fetch(day, day, bbox)
        std = to_standard_grid(ds["thetao"].values[0], ds["depth"].values, ds["lat"].values, ds["lon"].values)
        out.parent.mkdir(parents=True, exist_ok=True)
        day_ds = _day_dataset(day, std, self.provenance)
        day_ds.to_netcdf(out, encoding={"temp": {"zlib": True, "complevel": 4}})
        return day_ds


def get_adapter() -> TargetAdapter:
    g = GlorysTarget()
    return g if g.available() else HycomTarget()
