"""Server-side downsampling of a (depth, lat, lon) field for the lightweight 3-D view.

The browser never receives the full volume: a horizontal stride is chosen so that the number of
returned ocean samples (cells x selected depths) does not exceed ``max_points``. Values are grid
cells of the field itself (every ``stride``-th cell), not averages or interpolations.
"""
from __future__ import annotations

import math

import numpy as np

MAX_3D_POINTS = 20_000  # ~ what a laptop GPU renders as a point cloud at interactive frame rates


def choose_stride(n_lat: int, n_lon: int, n_depths: int, max_points: int = MAX_3D_POINTS) -> int:
    """Smallest horizontal stride s with ceil(n_lat/s) * ceil(n_lon/s) * n_depths <= max_points."""
    s = 1
    while math.ceil(n_lat / s) * math.ceil(n_lon / s) * n_depths > max_points:
        s += 1
    return s


def sample(field: np.ndarray, lats: np.ndarray, lons: np.ndarray, depths: np.ndarray, *, lat_range, lon_range,
           depth_index: np.ndarray, max_points: int = MAX_3D_POINTS, stride: int | None = None) -> dict:
    """Return the strided sub-volume as flat arrays of finite samples.

    ``stride`` (when given) is a floor: it is increased if needed to respect ``max_points``.
    Land / below-seabed cells are dropped, so the returned count is at most ``max_points``.
    """
    ii = np.where((lats >= lat_range[0]) & (lats <= lat_range[1]))[0]
    jj = np.where((lons >= lon_range[0]) & (lons <= lon_range[1]))[0]
    s = max(choose_stride(ii.size, jj.size, max(1, depth_index.size), max_points), stride or 1)
    ii, jj = ii[::s], jj[::s]
    sub = field[np.ix_(depth_index, ii, jj)]
    k, a, b = np.nonzero(np.isfinite(sub))
    return {"stride": s, "lat": lats[ii][a], "lon": lons[jj][b], "depth": depths[depth_index][k],
            "value": sub[k, a, b], "n_candidates": int(sub.size)}
