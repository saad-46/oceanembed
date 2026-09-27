"""Harmonise every source onto the common 0.25 deg target grid (docs/09 Transformation).

Two operations, chosen by the relationship between source and target resolution:

* ``bilinear_to_target`` - for sources already at ~0.25 deg whose cell centres are
  offset from ours (e.g. NCEI Blended Seawinds centres sit on whole/quarter degrees,
  our centres on .125). NaN-aware: a target cell is interpolated only from valid
  neighbours, with weights renormalised.
* ``coarsen_to_target`` - for finer sources (HYCOM 1/12 deg, GLORYS 1/12 deg, OSTIA
  0.05 deg). Area-weighted bin averaging: every fine cell is assigned to the target
  cell containing its centre and averaged with cos(lat) weights. This is the
  anti-aliasing coarsening docs/09 asks for (not point subsampling).

``xesmf`` (named in docs/09) needs ESMF, which has no pip wheel on Windows; these
numpy implementations are dependency-free and unit tested (tests/test_regrid.py).
See docs/DECISIONS.md D-005.
"""
from __future__ import annotations

import numpy as np

from ml.config import LATS, LONS, LAT_MIN, LON_MIN, NLAT, NLON, RES


def normalize_lon(lon: np.ndarray) -> np.ndarray:
    """Map longitudes to [-180, 180)."""
    lon = np.asarray(lon, dtype=float)
    return ((lon + 180.0) % 360.0) - 180.0


def _interp_weights(src: np.ndarray, dst: np.ndarray):
    """Left index and fractional weight for linear interpolation src->dst.

    ``src`` must be strictly increasing. Destinations outside ``src`` get index -1.
    """
    idx = np.searchsorted(src, dst) - 1
    valid = (idx >= 0) & (idx < src.size - 1)
    idx_c = np.clip(idx, 0, src.size - 2)
    w = (dst - src[idx_c]) / (src[idx_c + 1] - src[idx_c])
    idx_c = np.where(valid | np.isclose(dst, src[-1]) | np.isclose(dst, src[0]), idx_c, -1)
    return idx_c, np.clip(w, 0.0, 1.0)


def bilinear_to_target(
    data: np.ndarray, src_lat: np.ndarray, src_lon: np.ndarray,
    dst_lat: np.ndarray = LATS, dst_lon: np.ndarray = LONS,
) -> np.ndarray:
    """NaN-aware bilinear interpolation of ``data[..., lat, lon]`` onto the target grid."""
    src_lat = np.asarray(src_lat, dtype=float)
    src_lon = normalize_lon(src_lon)
    data = np.asarray(data, dtype=np.float32)
    if src_lat[0] > src_lat[-1]:
        src_lat, data = src_lat[::-1], data[..., ::-1, :]
    order = np.argsort(src_lon)
    src_lon, data = src_lon[order], data[..., order]

    iy, wy = _interp_weights(src_lat, np.asarray(dst_lat, float))
    ix, wx = _interp_weights(src_lon, normalize_lon(dst_lon))

    out_shape = data.shape[:-2] + (len(dst_lat), len(dst_lon))
    acc = np.zeros(out_shape, dtype=np.float64)
    wsum = np.zeros(out_shape, dtype=np.float64)
    for dy, fy in ((0, 1 - wy), (1, wy)):
        for dx, fx in ((0, 1 - wx), (1, wx)):
            yy = np.clip(iy + dy, 0, src_lat.size - 1)
            xx = np.clip(ix + dx, 0, src_lon.size - 1)
            vals = data[..., yy[:, None], xx[None, :]]
            w = (fy[:, None] * fx[None, :]) * ((iy >= 0)[:, None] & (ix >= 0)[None, :])
            ok = np.isfinite(vals)
            acc += np.where(ok, vals, 0.0) * w
            wsum += ok * w
    with np.errstate(invalid="ignore", divide="ignore"):
        out = acc / wsum
    # Require at least half the interpolation weight to come from valid points.
    out[wsum < 0.5] = np.nan
    return out.astype(np.float32)


def coarsen_to_target(
    data: np.ndarray, src_lat: np.ndarray, src_lon: np.ndarray, min_valid_frac: float = 0.5,
) -> np.ndarray:
    """Area-weighted bin average of fine ``data[..., lat, lon]`` onto the 0.25 deg grid.

    A target cell is NaN when fewer than ``min_valid_frac`` of its (weighted) fine
    cells are valid - this keeps coastlines honest instead of smearing land in.
    """
    src_lat = np.asarray(src_lat, dtype=float)
    src_lon = normalize_lon(src_lon)
    data = np.asarray(data, dtype=np.float64)
    bi = np.floor((src_lat - LAT_MIN) / RES).astype(int)
    bj = np.floor((src_lon - LON_MIN) / RES).astype(int)
    keep_i = (bi >= 0) & (bi < NLAT)
    keep_j = (bj >= 0) & (bj < NLON)
    data = data[..., keep_i, :][..., keep_j]
    bi, bj = bi[keep_i], bj[keep_j]
    wlat = np.cos(np.deg2rad(src_lat[keep_i]))

    lead = data.shape[:-2]
    flat = data.reshape((-1,) + data.shape[-2:])
    out = np.full((flat.shape[0], NLAT, NLON), np.nan, dtype=np.float32)
    cell = (bi[:, None] * NLON + bj[None, :]).ravel()
    w_full = np.broadcast_to(wlat[:, None], data.shape[-2:]).ravel()
    total_w = np.bincount(cell, weights=w_full, minlength=NLAT * NLON)
    for k in range(flat.shape[0]):
        v = flat[k].ravel()
        ok = np.isfinite(v)
        s = np.bincount(cell[ok], weights=(v[ok] * w_full[ok]), minlength=NLAT * NLON)
        ws = np.bincount(cell[ok], weights=w_full[ok], minlength=NLAT * NLON)
        with np.errstate(invalid="ignore", divide="ignore"):
            mean = s / ws
        mean[(ws <= 0) | (ws < min_valid_frac * total_w)] = np.nan
        out[k] = mean.reshape(NLAT, NLON)
    return out.reshape(lead + (NLAT, NLON))


def interp_depth(profile_depths: np.ndarray, values: np.ndarray, target_depths: np.ndarray) -> np.ndarray:
    """Linear interpolation along the depth axis (axis 0), NaN where not bracketed by valid data.

    ``values`` has shape (n_src_depth, ...). Used to put HYCOM's 40 native levels and
    Argo's native pressure levels onto the 15 standard depths.
    """
    profile_depths = np.asarray(profile_depths, float)
    values = np.asarray(values, float)
    out = np.full((len(target_depths),) + values.shape[1:], np.nan, dtype=np.float32)
    for k, z in enumerate(target_depths):
        exact = np.isclose(profile_depths, z)
        if exact.any():
            out[k] = values[np.argmax(exact)]
            continue
        hi = np.searchsorted(profile_depths, z)
        if hi == 0 or hi >= profile_depths.size:
            continue
        lo = hi - 1
        w = (z - profile_depths[lo]) / (profile_depths[hi] - profile_depths[lo])
        out[k] = (1 - w) * values[lo] + w * values[hi]  # NaN propagates if either side invalid
    return out
