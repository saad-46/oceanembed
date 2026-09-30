"""TEOS-10 seawater properties for measured (Argo) temperature-salinity profiles, via ``gsw``.

* Pressure is recovered from the stored depth with ``gsw.p_from_z`` (depths were derived from
  pressure with Saunders (1981) at ingestion; the two agree to well under 0.1 % in 0-1000 m).
* Absolute Salinity ``SA = gsw.SA_from_SP(SP, p, lon, lat)``; Conservative Temperature
  ``CT = gsw.CT_from_t(SA, t, p)``; potential temperature (0 dbar) ``gsw.pt0_from_t``;
  potential density anomaly ``sigma0 = gsw.sigma0(SA, CT)`` (kg m-3 minus 1000).
* Density mixed-layer depth: de Boyer Montegut et al. (2004) threshold, the first depth below
  10 m where sigma0 exceeds its 10 m value by 0.03 kg m-3. Isothermal layer depth uses the same
  paper's 0.2 degC temperature threshold; barrier-layer thickness = ILD - MLD when positive.
* Isopycnals for a T-S diagram are traced in (practical salinity, potential temperature) space at
  0 dbar, i.e. the same coordinates as the plotted points.
"""
from __future__ import annotations

import numpy as np

MLD_REF_DEPTH = 10.0
MLD_DSIGMA = 0.03   # kg m-3 (de Boyer Montegut et al. 2004)
ILD_DT = 0.2        # degC  (de Boyer Montegut et al. 2004)


def _gsw():
    import gsw  # imported lazily: only the salinity features need it

    return gsw


def properties(depth, temp, sal, lat: float, lon: float) -> dict[str, np.ndarray]:
    """TEOS-10 quantities at every level where depth, temperature and salinity are all finite."""
    gsw = _gsw()
    z = np.asarray(depth, float)
    t = np.asarray(temp, float)
    sp = np.asarray(sal, float)
    p = gsw.p_from_z(-z, lat)
    sa = gsw.SA_from_SP(sp, p, lon, lat)
    ct = gsw.CT_from_t(sa, t, p)
    return {"pressure_dbar": p, "absolute_salinity": sa, "conservative_temperature": ct,
            "potential_temperature": gsw.pt0_from_t(sa, t, p), "sigma0": gsw.sigma0(sa, ct)}


def _first_exceed(z: np.ndarray, v: np.ndarray, ref_depth: float, delta: float) -> float | None:
    """First depth below ref_depth where |v - v(ref)| > delta, linearly interpolated; None if never."""
    ok = np.isfinite(z) & np.isfinite(v)
    z, v = z[ok], v[ok]
    if z.size < 3 or z[0] > ref_depth + 5 or z[-1] <= ref_depth:
        return None
    ref = float(np.interp(ref_depth, z, v))
    below = z > ref_depth
    zz, dv = z[below], np.abs(v[below] - ref)
    hit = np.where(dv > delta)[0]
    if not hit.size:
        return None
    k = hit[0]
    z0, d0 = (ref_depth, 0.0) if k == 0 else (zz[k - 1], dv[k - 1])
    return float(z0 + (delta - d0) / (dv[k] - d0) * (zz[k] - z0))


def mixed_layers(depth, temp, sigma0) -> dict:
    """Density MLD, isothermal layer depth and barrier-layer thickness (m, None when undefined)."""
    z = np.asarray(depth, float)
    mld = _first_exceed(z, np.asarray(sigma0, float), MLD_REF_DEPTH, MLD_DSIGMA)
    ild = _first_exceed(z, np.asarray(temp, float), MLD_REF_DEPTH, ILD_DT)
    blt = None if mld is None or ild is None else max(0.0, ild - mld)
    r = lambda x: None if x is None else round(x, 1)
    return {"mld_density_m": r(mld), "isothermal_layer_depth_m": r(ild), "barrier_layer_thickness_m": r(blt),
            "method": (f"de Boyer Montegut et al. (2004): MLD where sigma0 exceeds its {MLD_REF_DEPTH:g} m value by "
                       f"{MLD_DSIGMA} kg/m3; ILD where temperature departs from its {MLD_REF_DEPTH:g} m value by "
                       f"{ILD_DT} degC; barrier layer = ILD - MLD (when positive).")}


def isopycnals(sp_range: tuple[float, float], pt_range: tuple[float, float], lat: float, lon: float,
               n_levels: int = 8, n_points: int = 40) -> list[dict]:
    """sigma0 contour lines across a (practical salinity, potential temperature) window.

    For each salinity, sigma0 decreases monotonically with potential temperature over the
    oceanic range plotted here, so each contour is found by 1-D interpolation along temperature.
    """
    gsw = _gsw()
    s = np.linspace(sp_range[0], sp_range[1], n_points)
    th = np.linspace(pt_range[0], pt_range[1], 200)
    S, TH = np.meshgrid(s, th, indexing="ij")
    sa = gsw.SA_from_SP(S, 0.0, lon, lat)
    sig = gsw.sigma0(sa, gsw.CT_from_pt(sa, TH))
    lo, hi = float(np.nanmin(sig)), float(np.nanmax(sig))
    step = _nice_step((hi - lo) / max(1, n_levels))
    levels = np.arange(np.ceil(lo / step) * step, hi, step)
    out = []
    for lev in levels:
        pts = []
        for i in range(s.size):
            col = sig[i]
            if not (col.min() <= lev <= col.max()) or not np.all(np.diff(col) < 0):
                continue
            pts.append([round(float(s[i]), 4), round(float(np.interp(lev, col[::-1], th[::-1])), 4)])
        if len(pts) >= 2:
            out.append({"sigma0": round(float(lev), 2), "points": pts})
    return out


def _nice_step(x: float) -> float:
    for s in (0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 5.0):
        if x <= s:
            return s
    return 10.0
