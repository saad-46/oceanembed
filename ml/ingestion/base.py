"""Common adapter contract for every data source (docs/09 Ingestion).

Every adapter implements ``fetch(start, end, bbox) -> xarray.Dataset`` with dims
``(time, lat, lon)`` on the *source's native grid*; cleaning and regridding happen
downstream in ``ml.pipeline``. Swapping a source (e.g. OISST -> OSTIA once Copernicus
credentials exist, or Argo GDAC -> INCOIS LAS) is therefore a one-file change.

Each adapter also declares provenance so every processed array and API response can
say exactly where its numbers came from (docs/21 claims discipline).
"""
from __future__ import annotations

import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import date
from pathlib import Path

import requests
import xarray as xr

from ml.config import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, RAW_DIR

log = logging.getLogger("oceanembed.ingestion")

DEFAULT_BBOX = (LON_MIN, LON_MAX, LAT_MIN, LAT_MAX)  # (min_lon, max_lon, min_lat, max_lat)


class CredentialsMissing(RuntimeError):
    """Raised by adapters whose provider needs an account that is not configured."""


@dataclass(frozen=True)
class Provenance:
    source_key: str          # e.g. "sst"
    product: str             # human name
    provider: str
    dataset_id: str
    url: str
    license: str
    native_resolution: str
    requires_credentials: bool

    def as_attrs(self) -> dict:
        return {f"prov_{k}": str(v) for k, v in asdict(self).items()}


class SourceAdapter(ABC):
    provenance: Provenance
    #: Environment variables that must be non-empty for this adapter to run.
    required_env: tuple[str, ...] = ()

    def available(self) -> bool:
        return all(os.environ.get(k) for k in self.required_env)

    def ensure_available(self) -> None:
        if not self.available():
            raise CredentialsMissing(
                f"{self.provenance.product} needs {', '.join(self.required_env)} "
                "(see .env.example); falling back to the open alternative."
            )

    @property
    def cache_dir(self) -> Path:
        d = RAW_DIR / self.provenance.source_key / self.provenance.dataset_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    @abstractmethod
    def fetch(self, start: date, end: date, bbox=DEFAULT_BBOX) -> xr.Dataset:
        """Return native-grid data with dims (time, lat, lon) and provenance attrs."""


def http_get(url: str, dest: Path, timeout: int = 300, retries: int = 4) -> Path:
    """Download ``url`` to ``dest`` atomically with exponential-backoff retries.

    Idempotent: an existing ``dest`` is reused (downloads are the slow part).
    """
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with requests.get(url, stream=True, timeout=timeout) as r:
                if r.status_code == 404:
                    raise FileNotFoundError(f"404 for {url}")
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            tmp.replace(dest)
            return dest
        except FileNotFoundError:
            raise
        except Exception as e:  # network hiccups, 5xx, throttling
            last_err = e
            wait = 5 * 2**attempt
            log.warning("download failed (%s), retry %d/%d in %ds: %s", e.__class__.__name__,
                        attempt + 1, retries, wait, url[:160])
            time.sleep(wait)
    raise RuntimeError(f"giving up on {url[:160]}: {last_err}")
