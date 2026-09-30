# Scientific methods — stratification, salinity, T-S, short-horizon estimate, 3-D sampling

Implementation: `ml/science/` (numpy + `gsw`, no I/O), served by `backend/app/api/analysis.py`.
Known-answer tests: `tests/test_science.py`, `backend/tests/test_analysis_api.py`.

## 1. Thermocline (reconstructed profile)

Input: the reconstructed temperature at the 15 standard depths (0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300,
500, 700, 1000 m) of one 0.25° cell and day.

1. **Layer gradients.** For consecutive *valid* levels k, k+1: `dT/dz = (T[k+1] − T[k]) / (z[k+1] − z[k])`
   (°C m⁻¹, z positive downward), assigned to the layer mid-depth. A missing level (below the seabed) breaks the
   profile; no layer is formed across it.
2. **Candidates.** Layers inside `[0, max_depth]` (`max_depth` ∈ {200, 300, 500, 1000}, default 500 m) whose bottom
   lies below the mixed-layer depth (temperature criterion, 0.5 °C below the 10 m value). The thermocline is by
   definition the stratified layer beneath the mixed layer; this excludes near-surface diurnal gradients.
3. **Unrealistic gradients.** |dT/dz| > 0.5 °C m⁻¹ over a ≥ 5 m layer is treated as an artefact, excluded and reported.
4. **Thermocline** = mid-depth of the candidate with the most negative dT/dz. The layer's top and bottom are returned
   as `depth_range_m` — the honest vertical resolution. Nothing is interpolated below the data's own spacing.

Quality flags (constants in `ml/science/stratification.py`):

| Flag | Condition |
|---|---|
| insufficient | < 4 valid levels in range; no candidate layer; or max cooling rate < 0.02 °C m⁻¹ (no well-defined maximum) — depth is `null` |
| limited | max cooling rate < 0.05 °C m⁻¹ (weak); peak layer thicker than 50 m (coarse); peak on the lower edge of the analysis range (may lie deeper); unrealistic layers excluded; a separate maximum within 10 % of the peak (ambiguous) |
| good | none of the above |

MLD, thermocline, D20 and D26 are *different diagnostics* and are shown side by side; D20 is an isotherm proxy for the
tropical thermocline and need not coincide with the gradient maximum.

## 2. Measured profiles (Argo): QC, binning, thermocline, halocline

* Source profiles already pass Argo QC flags 1/2 (argopy "standard" mode, or the ERDDAP filter; from this version
  the ERDDAP fallback also screens salinity by its own flag).
* OceanSight re-applies the Argo real-time **global range test** (T −2.5…40 °C, S 2…41 PSU) and **spike test**
  `|V2 − (V3+V1)/2| − |(V3−V1)/2|` > 6.0 °C / 0.9 PSU above 500 dbar (2.0 °C / 0.3 PSU below) — Argo Quality
  Control Manual for CTD and Trajectory Data. Removed levels are counted in the response (`qc`).
* Samples are averaged in **5 m bins**; layers spanning a data gap > 20 m are not formed.
* Thermocline: same method as §1 (mixed layer from the binned profile). **Halocline**: layer with the largest
  |dS/dz| (thresholds 0.002 / 0.005 / 1.0 PSU m⁻¹ for insufficient / weak / unrealistic); the sign is reported
  (fresh-over-salty in the Bay of Bengal gives dS/dz > 0).

Validation: synthetic profiles with a known strongest layer (thermocline at 87.5 m in the 75–100 m layer), a 20–30 m
halocline with noise, uniform salinity (no halocline), a 5 PSU spike and an out-of-range value.

## 3. TEOS-10 seawater properties (T-S diagram, density mixed layer)

`gsw` (TEOS-10): pressure from depth (`p_from_z`; depths were derived from pressure with Saunders 1981 at ingestion,
agreeing to < 0.1 % in 0–1000 m), Absolute Salinity `SA_from_SP`, Conservative Temperature `CT_from_t`, potential
temperature `pt0_from_t`, potential density anomaly `sigma0`.

* **Density MLD**: first depth below 10 m where σ0 exceeds its 10 m value by 0.03 kg m⁻³; **isothermal layer depth**:
  |T − T(10 m)| > 0.2 °C; **barrier layer** = ILD − MLD when positive (de Boyer Montégut et al. 2004).
* **Isopycnals** are traced in (practical salinity, potential temperature) at 0 dbar — the plotted coordinates — by
  1-D interpolation along θ (σ0 decreases monotonically with θ over the plotted range).
* Validation: σ at p = 0 for (S, T) = (35, 25), (35, 0), (0, 5) matches the UNESCO EOS-80 check values 23.343, 28.106,
  −0.033 kg m⁻³ within 0.01 kg m⁻³; every isopycnal point re-evaluates to its level within 0.01 kg m⁻³.

The reconstruction has no salinity, so it is never placed on a T-S diagram, and reconstructed temperature is never
paired with salinity from another product.

## 4. Short-horizon estimate (T+1, T+2)

**Not a trained forecast model.** At one cell, using only reconstructed days up to and including the issue date:

* `trend` (default): ordinary least-squares line through the last `window` = 7 days (≥ 5 valid), extrapolated h days;
* `persistence`: the issue-day column.

Error: the same method is re-run for every issue day in the preceding 60 days at that cell; the RMSE against the
reconstruction h days later (≥ 20 pairs required) is combined in quadrature with the calibrated reconstruction σ,
assuming independence: `sd = sqrt(rmse_hindcast² + σ²)`. The persistence hindcast RMSE is always reported alongside
as a reference. If the window or hindcast is too short, the API returns `422 insufficient_forecast_history`.
When the target day is inside the record, the reconstruction for it is shown for comparison (it was not used).

Validation: a linear synthetic series is extrapolated exactly (hindcast RMSE 0, persistence RMSE 0.01·h); a jump after
the issue day does not leak into the estimate; short records raise `InsufficientHistory`.

## 5. 3-D sampling

`/v1/volume/sample` returns every `s`-th grid cell of the requested box and depth range, with the smallest stride `s`
such that `ceil(n_lat/s)·ceil(n_lon/s)·n_depths ≤ MAX_3D_POINTS` (20 000, a laptop point-cloud budget); land and
below-seabed cells are dropped. Values are grid-cell values, not interpolated. The browser never receives the full
volume. Validation: the Bay of Bengal box (68 × 80 cells) × 15 depths yields stride 3 and exactly 23·27·15 points.
