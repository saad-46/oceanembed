"""Thermocline and halocline depth from vertical gradients.

Method (one core routine, used for temperature and salinity alike):

1. Layer gradients. For a profile v(z) (z positive downward) on sorted levels, the gradient of
   each layer between two consecutive valid levels is ``dv/dz = (v[k+1] - v[k]) / (z[k+1] - z[k])``,
   assigned to the layer mid-depth. Layers that span a missing level are not formed; layers thicker
   than ``max_layer_m`` (data gaps in a native profile) are skipped.
2. Candidate layers lie inside the analysis range ``[min_depth, max_depth]``. For the thermocline,
   layers entirely inside the mixed layer (bottom <= MLD) are excluded: the thermocline is by
   definition the stratified layer *below* the mixed layer.
3. Physically unrealistic gradients (``|dv/dz| > unrealistic``) are excluded and reported.
4. The thermocline is the layer with the most negative dT/dz (fastest cooling with depth);
   the halocline is the layer with the largest |dS/dz| (its sign is reported: in the Bay of
   Bengal fresh water overlies saltier water, dS/dz > 0).
5. The reported depth is the layer mid-point; ``depth_range_m`` (the layer's top and bottom)
   is the vertical-resolution bound on that depth. Nothing is interpolated below the data's
   own resolution.

Quality flags (thresholds are the constants below, documented in docs/METHODS_STRATIFICATION.md):

* ``insufficient`` - fewer than ``min_levels`` valid levels in range, no candidate layers, or the
  strongest gradient is below ``min_strength`` (no well-defined gradient maximum). Depth is null.
* ``limited`` - a depth is reported but: the gradient is weak (< ``weak_strength``), the peak
  layer is coarser than ``coarse_layer_m``, the peak sits on the lower edge of the range (the true
  maximum may be deeper), unrealistic layers were excluded, or a second, separate maximum is within
  10 % of the peak (ambiguous).
* ``good`` - none of the above.

Native (Argo) profiles are first cleaned with the Argo real-time QC global-range and spike tests
(Argo Quality Control Manual for CTD and Trajectory Data, tests 6 and 9) and bin-averaged to
``BIN_M`` so instrument noise at 1-2 m spacing is not mistaken for a gradient maximum.
"""
from __future__ import annotations

import numpy as np

from ml.config import STANDARD_DEPTHS

# --- thresholds (units per metre) -------------------------------------------------------------
T_MIN_GRADIENT = 0.02      # degC/m: weaker than this -> no well-defined thermocline (2 degC per 100 m)
T_WEAK_GRADIENT = 0.05     # degC/m: weaker than this -> "limited" (weak thermocline)
T_UNREALISTIC = 0.5        # degC/m: stronger than this over a >= 5 m layer is treated as an artefact
S_MIN_GRADIENT = 0.002     # PSU/m (0.2 PSU per 100 m)
S_WEAK_GRADIENT = 0.005    # PSU/m
S_UNREALISTIC = 1.0        # PSU/m
COARSE_LAYER_M = 50.0      # peak layer thicker than this -> depth only known to within a coarse layer
AMBIGUITY = 0.10           # a separate maximum within 10 % of the peak -> "limited"
MIN_LEVELS = 4

# --- native-profile cleaning (Argo QC manual) --------------------------------------------------
BIN_M = 5.0
MAX_NATIVE_GAP_M = 20.0
GLOBAL_RANGE = {"temperature": (-2.5, 40.0), "salinity": (2.0, 41.0)}
# spike test: |V2 - (V3+V1)/2| - |(V3-V1)/2| > threshold (shallower / deeper than 500 dbar ~ 500 m)
SPIKE = {"temperature": (6.0, 2.0), "salinity": (0.9, 0.3)}


def layer_gradients(depths, values, max_layer_m: float | None = None) -> list[dict]:
    """Gradient of every layer between consecutive valid levels (see module docstring, step 1)."""
    z = np.asarray(depths, dtype=float)
    v = np.asarray([np.nan if x is None else x for x in values], dtype=float)
    out = []
    for k in range(z.size - 1):
        if not (np.isfinite(v[k]) and np.isfinite(v[k + 1])):
            continue
        dz = z[k + 1] - z[k]
        if dz <= 0 or (max_layer_m is not None and dz > max_layer_m):
            continue
        out.append({"top_m": float(z[k]), "bottom_m": float(z[k + 1]), "depth_m": float((z[k] + z[k + 1]) / 2),
                    "gradient": float((v[k + 1] - v[k]) / dz)})
    return out


def gradient_peak(depths, values, *, variable: str, sense: str, max_depth: float, min_depth: float = 0.0,
                  exclude_above: float | None = None, max_layer_m: float | None = None,
                  min_strength: float, weak_strength: float, unrealistic: float,
                  coarse_layer_m: float = COARSE_LAYER_M, min_levels: int = MIN_LEVELS) -> dict:
    """Strongest meaningful gradient layer. ``sense``: "decreasing" (most negative) or "absolute"."""
    z = np.asarray(depths, dtype=float)
    v = np.asarray([np.nan if x is None else x for x in values], dtype=float)
    in_range = (z >= min_depth) & (z <= max_depth) & np.isfinite(v)
    layers = [g for g in layer_gradients(z, v, max_layer_m) if g["top_m"] >= min_depth and g["bottom_m"] <= max_depth]
    reasons: list[str] = []
    result = {"variable": variable, "depth_m": None, "depth_range_m": None, "gradient_per_m": None, "strength_per_m": None,
              "quality": "insufficient", "quality_reasons": reasons, "n_levels_used": int(in_range.sum()),
              "analysis_range_m": [float(min_depth), float(max_depth)], "gradient_profile": layers}
    if in_range.sum() < min_levels:
        reasons.append(f"only {int(in_range.sum())} valid levels between {min_depth:g} and {max_depth:g} m (need {min_levels})")
        return result
    unreal = [g for g in layers if abs(g["gradient"]) > unrealistic]
    cands = [g for g in layers if abs(g["gradient"]) <= unrealistic]
    if exclude_above is not None and np.isfinite(exclude_above):
        cands = [g for g in cands if g["bottom_m"] > exclude_above]
    if sense == "decreasing":
        cands = [g for g in cands if g["gradient"] < 0]
        strength = lambda g: -g["gradient"]
    else:
        strength = lambda g: abs(g["gradient"])
    if not cands:
        reasons.append("no candidate layer in the analysis range"
                       + (" below the mixed layer" if exclude_above is not None else ""))
        return result
    peak = max(cands, key=strength)
    s = strength(peak)
    result.update(strength_per_m=round(s, 5), gradient_per_m=round(peak["gradient"], 5))
    if s < min_strength:
        reasons.append(f"strongest gradient {s:.3f} per m is below {min_strength} per m: no well-defined maximum")
        return result
    result.update(depth_m=round(peak["depth_m"], 1), depth_range_m=[peak["top_m"], peak["bottom_m"]], quality="good")
    if s < weak_strength:
        reasons.append(f"weak gradient ({s:.3f} per m < {weak_strength})")
    thick = peak["bottom_m"] - peak["top_m"]
    if thick > coarse_layer_m:
        reasons.append(f"coarse vertical resolution: the peak layer spans {peak['top_m']:g}-{peak['bottom_m']:g} m")
    deepest = max(g["bottom_m"] for g in layers)
    if peak["bottom_m"] >= deepest and deepest < float(z[np.isfinite(v)].max()):
        reasons.append("strongest gradient is at the lower edge of the analysis range; the maximum may lie deeper")
    if unreal:
        reasons.append(f"{len(unreal)} layer(s) with |gradient| > {unrealistic} per m excluded as unrealistic")
    rivals = [g for g in cands if g is not peak and strength(g) >= (1 - AMBIGUITY) * s
              and (g["bottom_m"] < peak["top_m"] or g["top_m"] > peak["bottom_m"])]
    if rivals:
        reasons.append("a separate maximum of comparable strength exists at "
                       + ", ".join(f"{g['depth_m']:g} m" for g in rivals))
    if reasons:
        result["quality"] = "limited"
    return result


def thermocline(temp, depths=STANDARD_DEPTHS, *, max_depth: float = 500.0, mld: float | None = None) -> dict:
    """Thermocline from a temperature profile on (coarse) standard levels."""
    r = gradient_peak(depths, temp, variable="temperature", sense="decreasing", max_depth=max_depth,
                      exclude_above=mld, min_strength=T_MIN_GRADIENT, weak_strength=T_WEAK_GRADIENT,
                      unrealistic=T_UNREALISTIC)
    r["method"] = ("Depth of the most negative dT/dz between consecutive valid levels, below the mixed layer "
                   f"and above {max_depth:g} m; reported at the layer mid-point with the layer bounds as resolution.")
    return r


def halocline(sal, depths, *, max_depth: float = 500.0, max_layer_m: float | None = None) -> dict:
    r = gradient_peak(depths, sal, variable="salinity", sense="absolute", max_depth=max_depth, max_layer_m=max_layer_m,
                      min_strength=S_MIN_GRADIENT, weak_strength=S_WEAK_GRADIENT, unrealistic=S_UNREALISTIC)
    if r["gradient_per_m"] is not None and r["depth_m"] is not None:
        r["sense"] = "salinity increases with depth" if r["gradient_per_m"] > 0 else "salinity decreases with depth"
    r["method"] = ("Depth of the largest |dS/dz| between consecutive valid levels above "
                   f"{max_depth:g} m; reported at the layer mid-point with the layer bounds as resolution.")
    return r


# ---------------------------------------------------------------------------- native profiles
def qc_native(depth, values, variable: str) -> tuple[np.ndarray, np.ndarray, dict]:
    """Argo global-range and spike tests on one native profile. Returns kept (depth, values) and counts."""
    z = np.asarray(depth, dtype=float)
    v = np.asarray([np.nan if x is None else x for x in values], dtype=float)
    ok = np.isfinite(z) & np.isfinite(v)
    z, v = z[ok], v[ok]
    order = np.argsort(z, kind="stable")
    z, v = z[order], v[order]
    lo, hi = GLOBAL_RANGE[variable]
    in_range = (v >= lo) & (v <= hi)
    n_range = int((~in_range).sum())
    z, v = z[in_range], v[in_range]
    spike = np.zeros(v.size, bool)
    if v.size >= 3:
        v1, v2, v3 = v[:-2], v[1:-1], v[2:]
        test = np.abs(v2 - (v3 + v1) / 2) - np.abs((v3 - v1) / 2)
        shallow, deep = SPIKE[variable]
        thr = np.where(z[1:-1] < 500.0, shallow, deep)
        spike[1:-1] = test > thr
    return z[~spike], v[~spike], {"n_input": int(ok.sum()), "n_failed_range": n_range, "n_failed_spike": int(spike.sum())}


def bin_average(depth, values, *, bin_m: float = BIN_M, max_depth: float = 1000.0) -> tuple[np.ndarray, np.ndarray]:
    """Mean of the samples in each ``bin_m`` depth bin (bins without samples are dropped)."""
    z = np.asarray(depth, dtype=float)
    v = np.asarray(values, dtype=float)
    keep = (z >= 0) & (z <= max_depth)
    z, v = z[keep], v[keep]
    if not z.size:
        return np.array([]), np.array([])
    idx = np.floor(z / bin_m).astype(int)
    bins = np.unique(idx)
    means = np.array([v[idx == b].mean() for b in bins])
    return (bins + 0.5) * bin_m, means
