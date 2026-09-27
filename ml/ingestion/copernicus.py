"""Credentialed Copernicus Marine adapter (the spec's primary sources, docs/04).

Activated automatically when ``COPERNICUSMARINE_SERVICE_USERNAME`` /
``COPERNICUSMARINE_SERVICE_PASSWORD`` (or the ``COPERNICUS_MARINE_*`` aliases from
docs/18) are set. Without them every ``fetch_*`` module falls back to its open,
no-login equivalent - see docs/DECISIONS.md D-002.
"""
from __future__ import annotations

import logging
import os
from datetime import date

import xarray as xr

from ml.ingestion.base import DEFAULT_BBOX, CredentialsMissing, Provenance, SourceAdapter

log = logging.getLogger("oceanembed.ingestion.copernicus")


def _creds() -> tuple[str | None, str | None]:
    user = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME") or os.environ.get("COPERNICUS_MARINE_USERNAME")
    pwd = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD") or os.environ.get("COPERNICUS_MARINE_PASSWORD")
    return user, pwd


class CopernicusMarineAdapter(SourceAdapter):
    variables: tuple[str, ...]
    rename: dict[str, str] = {}
    depth_range: tuple[float, float] | None = None

    def available(self) -> bool:
        return all(_creds())

    def ensure_available(self) -> None:
        if not self.available():
            raise CredentialsMissing(
                f"{self.provenance.product} needs COPERNICUSMARINE_SERVICE_USERNAME/PASSWORD (free account)."
            )

    def fetch(self, start: date, end: date, bbox=DEFAULT_BBOX) -> xr.Dataset:
        self.ensure_available()
        import copernicusmarine  # lazy: optional dependency

        user, pwd = _creds()
        min_lon, max_lon, min_lat, max_lat = bbox
        fname = f"{start:%Y%m%d}_{end:%Y%m%d}.nc"
        dest = self.cache_dir / fname
        if not dest.exists():
            kwargs = dict(
                dataset_id=self.provenance.dataset_id,
                variables=list(self.variables),
                minimum_longitude=min_lon - 0.5, maximum_longitude=max_lon + 0.5,
                minimum_latitude=min_lat - 0.5, maximum_latitude=max_lat + 0.5,
                start_datetime=f"{start.isoformat()}T00:00:00",
                end_datetime=f"{end.isoformat()}T23:59:59",
                output_directory=str(self.cache_dir), output_filename=fname,
                username=user, password=pwd,
            )
            if self.depth_range:
                kwargs.update(minimum_depth=self.depth_range[0], maximum_depth=self.depth_range[1])
            log.info("copernicusmarine subset %s %s..%s", self.provenance.dataset_id, start, end)
            copernicusmarine.subset(**kwargs)
        ds = xr.open_dataset(dest).load()
        ds = ds.rename({k: v for k, v in {"latitude": "lat", "longitude": "lon", **self.rename}.items() if k in ds})
        ds["time"] = ds["time"].dt.floor("D")
        ds.attrs.update(self.provenance.as_attrs())
        return ds


def cmems_provenance(source_key, product, dataset_id, product_id, resolution) -> Provenance:
    return Provenance(
        source_key=source_key, product=product, provider="Copernicus Marine Service",
        dataset_id=dataset_id,
        url=f"https://data.marine.copernicus.eu/product/{product_id}/description",
        license="Copernicus Marine Service licence (free, registration)",
        native_resolution=resolution, requires_credentials=True,
    )


def select_adapter(primary: SourceAdapter, fallback: SourceAdapter) -> SourceAdapter:
    """Prefer the spec's primary (credentialed) source, fall back to the open one."""
    if primary.available():
        return primary
    log.info("%s unavailable (no credentials) -> using open fallback %s",
             primary.provenance.product, fallback.provenance.product)
    return fallback
