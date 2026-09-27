"""INCOIS-relevant derived products from a 15-depth temperature profile (docs/07 #11).

All deterministic formulas (no ML), vectorised over any trailing grid shape:

* **D20 / D26** - depth of the 20 degC / 26 degC isotherm (thermocline proxy / cyclone-fuel
  layer). Linear interpolation between levels; NaN when the isotherm does not exist in
  the column (e.g. SST < 26 degC).
* **MLD** - mixed-layer depth, temperature criterion: first depth where T is 0.5 degC below
  the 10 m reference temperature (Monterey & Levitus 1997 style threshold). A density
  criterion needs subsurface salinity, which the model does not reconstruct.
* **TCHP** - tropical cyclone heat potential (Leipper & Volgenau 1972):
  ``rho * cp * integral_0^D26 (T - 26) dz`` in kJ/cm^2, with rho = 1025 kg/m^3,
  cp = 4000 J/(kg K). Zero when SST < 26 degC.

Profiles are linearly interpolated onto a 1 m grid to 500 m before evaluating, so the
results do not depend on the coarse spacing of the standard levels.
"""
from __future__ import annotations

import numpy as np

from ml.config import STANDARD_DEPTHS

RHO = 1025.0     # kg m-3
CP = 4000.0      # J kg-1 K-1
MLD_DT = 0.5     # degC
MLD_REF_DEPTH = 10.0
FINE_Z = np.arange(0.0, 501.0, 1.0)


def _fine(temp: np.ndarray, depths: np.ndarray = STANDARD_DEPTHS) -> np.ndarray:
    """(n_depth, ...) -> (len(FINE_Z), ...) by linear interpolation; NaN below last valid level."""
    temp = np.asarray(temp, dtype=np.float32)
    shape = temp.shape[1:]
    flat = temp.reshape(temp.shape[0], -1)
    out = np.full((FINE_Z.size, flat.shape[1]), np.nan, dtype=np.float32)
    hi = np.searchsorted(depths, FINE_Z, side="right")
    hi = np.clip(hi, 1, depths.size - 1)
    lo = hi - 1
    w = ((FINE_Z - depths[lo]) / (depths[hi] - depths[lo])).astype(np.float32)[:, None]
    exact_last = np.isclose(FINE_Z, depths[-1])
    out[:] = (1 - w) * flat[lo] + w * flat[hi]
    out[exact_last] = flat[-1]
    return out.reshape((FINE_Z.size,) + shape)


def isotherm_depth(temp: np.ndarray, iso: float, depths: np.ndarray = STANDARD_DEPTHS) -> np.ndarray:
    return _isotherm_fine(_fine(temp, depths), iso)


def _isotherm_fine(f: np.ndarray, iso: float) -> np.ndarray:
    below = f < iso
    below_valid = below & np.isfinite(f)
    first = np.argmax(below_valid, axis=0)
    has = below_valid.any(axis=0) & (f[0] >= iso)
    k = np.clip(first, 1, FINE_Z.size - 1)
    t_hi = np.take_along_axis(f, (k - 1)[None], 0)[0]
    t_lo = np.take_along_axis(f, k[None], 0)[0]
    with np.errstate(invalid="ignore", divide="ignore"):
        z = FINE_Z[k - 1] + (t_hi - iso) / (t_hi - t_lo) * (FINE_Z[k] - FINE_Z[k - 1])
    return np.where(has, z, np.nan)


def mixed_layer_depth(temp: np.ndarray, depths: np.ndarray = STANDARD_DEPTHS) -> np.ndarray:
    return _mld_fine(_fine(temp, depths))


def _mld_fine(f: np.ndarray) -> np.ndarray:
    ref = f[int(MLD_REF_DEPTH)]
    cross = (f < ref - MLD_DT) & (FINE_Z[:, None] >= MLD_REF_DEPTH).reshape((-1,) + (1,) * (f.ndim - 1))
    has = cross.any(axis=0)
    first = np.argmax(cross, axis=0)
    last_valid = np.isfinite(f).sum(axis=0) - 1
    z = np.where(has, FINE_Z[first], FINE_Z[np.clip(last_valid, 0, FINE_Z.size - 1)])
    return np.where(np.isfinite(ref), z, np.nan)


def tchp(temp: np.ndarray, depths: np.ndarray = STANDARD_DEPTHS) -> np.ndarray:
    """kJ/cm^2. J/m^2 -> kJ/cm^2 is a factor of 1e-7."""
    return _tchp_fine(_fine(temp, depths))


def _tchp_fine(f: np.ndarray) -> np.ndarray:
    # Only integrate the warm layer connected to the surface (down to D26).
    warm = np.logical_and.accumulate(f >= 26.0, axis=0)  # NaN compares False -> stops the layer
    integrand = np.where(warm, f - 26.0, 0.0)
    # trapezoid on the uniform 1 m grid (== np.trapezoid(integrand, FINE_Z)), accumulated in float64
    dz = float(FINE_Z[1] - FINE_Z[0])
    integral = (integrand.sum(axis=0, dtype=np.float64) - 0.5 * (integrand[0] + integrand[-1])) * dz
    out = RHO * CP * integral * 1e-7
    return np.where(np.isfinite(f[0]), out, np.nan)


def all_products(temp: np.ndarray, depths: np.ndarray = STANDARD_DEPTHS) -> dict[str, np.ndarray]:
    """All four products; the 1 m profile is interpolated once, for valid (ocean) columns only."""
    temp = np.asarray(temp, dtype=np.float32)
    shape = temp.shape[1:]
    flat = temp.reshape(temp.shape[0], -1)
    ok = np.isfinite(flat[0])
    out = {k: np.full(flat.shape[1], np.nan) for k in ("mld_m", "d20_m", "d26_m", "tchp_kj_cm2")}
    if ok.any():
        f = _fine(flat[:, ok], depths)
        out["mld_m"][ok] = _mld_fine(f)
        out["d20_m"][ok] = _isotherm_fine(f, 20.0)
        out["d26_m"][ok] = _isotherm_fine(f, 26.0)
        out["tchp_kj_cm2"][ok] = _tchp_fine(f)
    return {k: v.reshape(shape) for k, v in out.items()}


# Surface freshening proxy for barrier-layer-prone water (Bay of Bengal). A true barrier
# layer thickness needs a salinity profile; this flag uses the SSS input only and is
# labelled as a proxy everywhere it is shown.
BARRIER_SSS_THRESHOLD = 33.0  # PSU


def barrier_prone_fraction(sss: np.ndarray) -> float:
    ok = np.isfinite(sss)
    return float((sss[ok] < BARRIER_SSS_THRESHOLD).mean()) if ok.any() else float("nan")
