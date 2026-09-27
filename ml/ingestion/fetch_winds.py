"""10 m wind adapter. Primary: ERA5 daily statistics via the Copernicus Climate Data Store
(credentialed, ``CDS_API_KEY``). Open fallback: NOAA NCEI Blended Seawinds v2.0 (0.25 deg daily),
a satellite-scatterometer/radiometer blend - closer to the PS's "satellite observations"
framing than a reanalysis anyway.
"""
from __future__ import annotations

import os
from datetime import date

import xarray as xr

from ml.ingestion.base import DEFAULT_BBOX, CredentialsMissing, Provenance, SourceAdapter
from ml.ingestion.copernicus import select_adapter
from ml.ingestion.erddap import ErddapGridAdapter, month_chunks


class Era5Winds(SourceAdapter):
    provenance = Provenance(
        source_key="winds", product="ERA5 10 m wind (daily mean)", provider="ECMWF / Copernicus Climate Data Store",
        dataset_id="derived-era5-single-levels-daily-statistics",
        url="https://cds.climate.copernicus.eu/datasets/derived-era5-single-levels-daily-statistics",
        license="Copernicus licence (free, registration)", native_resolution="0.25 deg daily",
        requires_credentials=True,
    )
    required_env = ("CDS_API_KEY",)

    def fetch(self, start: date, end: date, bbox=DEFAULT_BBOX) -> xr.Dataset:
        self.ensure_available()
        import cdsapi  # lazy optional dependency

        client = cdsapi.Client(url=os.environ.get("CDS_API_URL", "https://cds.climate.copernicus.eu/api"),
                               key=os.environ["CDS_API_KEY"], quiet=True)
        min_lon, max_lon, min_lat, max_lat = bbox
        parts = []
        for a, b in month_chunks(start, end):
            dest = self.cache_dir / f"{a:%Y-%m}.nc"
            if not dest.exists():
                client.retrieve(self.provenance.dataset_id, {
                    "product_type": "reanalysis",
                    "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
                    "year": f"{a.year}", "month": f"{a.month:02d}",
                    "day": [f"{d:02d}" for d in range(a.day, b.day + 1)],
                    "daily_statistic": "daily_mean", "time_zone": "utc+00:00", "frequency": "1_hourly",
                    "area": [max_lat + 0.5, min_lon - 0.5, min_lat - 0.5, max_lon + 0.5],
                }, str(dest))
            ds = xr.open_dataset(dest).load()
            ds = ds.rename({k: v for k, v in {"latitude": "lat", "longitude": "lon", "valid_time": "time",
                                              "u10": "uwind", "v10": "vwind"}.items() if k in ds.variables or k in ds.dims})
            parts.append(ds)
        ds = xr.concat(parts, "time")
        ds["time"] = ds["time"].dt.floor("D")
        ds.attrs.update(self.provenance.as_attrs())
        return ds


class NceiBlendedWinds(ErddapGridAdapter):
    provenance = Provenance(
        source_key="winds", product="NOAA NCEI Blended Seawinds v2.0 (daily)", provider="NOAA NCEI via CoastWatch ERDDAP",
        dataset_id="noaacwBlendedWindsDaily",
        url="https://coastwatch.noaa.gov/erddap/griddap/noaacwBlendedWindsDaily.html",
        license="Public domain (NOAA)", native_resolution="0.25 deg daily", requires_credentials=False,
    )
    server = "https://coastwatch.noaa.gov"
    variables = ("u_wind", "v_wind")
    rename = {"u_wind": "uwind", "v_wind": "vwind"}
    extra_dims = (("zlev", 10.0),)
    lon_360 = True


def get_adapter():
    if os.environ.get("CDS_API_KEY"):
        return Era5Winds()
    return select_adapter(Era5Winds(), NceiBlendedWinds())
