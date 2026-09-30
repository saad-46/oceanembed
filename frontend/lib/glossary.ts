/** Two-level explanations for technical terms: plain language first, specialist detail second. */
export interface Term {
  title: string;
  simple: string;
  technical: string;
}

export const GLOSSARY = {
  tchp: {
    title: "Tropical Cyclone Heat Potential (TCHP)",
    simple: "How much heat is stored in the warm upper ocean — the 'fuel tank' a cyclone can draw from. More heat below the surface means the ocean can keep feeding a storm even when winds stir up deeper water.",
    technical: "Integrated heat content above the 26 °C isotherm: ρ·cp·∫(T − 26 °C)dz from the surface to D26, in kJ/cm², computed from the reconstructed profile (Leipper & Volgenau). ~50 kJ/cm² is a commonly cited reference level for intensification support.",
  },
  d26: {
    title: "D26 — depth of the 26 °C water",
    simple: "How deep the water stays warmer than 26 °C. A deeper warm layer means more heat is available below the surface.",
    technical: "Depth of the 26 °C isotherm, linearly interpolated on a fine vertical grid from the 15 reconstructed standard depths.",
  },
  d20: {
    title: "D20 — depth of the 20 °C water",
    simple: "Roughly where the warm upper ocean ends and the colder deep ocean begins. Its ups and downs trace ocean waves and eddies.",
    technical: "Depth of the 20 °C isotherm, a common proxy for thermocline depth in the tropical Indian Ocean; interpolated from the reconstructed profile.",
  },
  mld: {
    title: "Mixed-layer depth (MLD)",
    simple: "The top layer the wind keeps well stirred, so its temperature is nearly the same from top to bottom.",
    technical: "First depth below 10 m where temperature drops more than 0.5 °C below the 10 m value (temperature criterion), on the reconstructed profile.",
  },
  argo: {
    title: "Argo floats",
    simple: "Robotic floats that drift with the currents, dive to 2000 m and measure temperature on the way up. They are real measurements, but there are only a few per day across this whole region.",
    technical: "Argo GDAC profiles (QC flags 1/2) fetched with argopy. 2023 profiles are the fully held-out test set (2022 is used only for early stopping and σ calibration); the training target (HYCOM) assimilates Argo, which we disclose.",
  },
  uncertainty: {
    title: "Model uncertainty (±σ)",
    simple: "How sure the model is. A wider band means the true temperature could be further from the reconstructed value — trust those places less.",
    technical: "Per-depth heteroscedastic σ from the U-Net's variance head, calibrated post hoc on 2022 Argo (σ_cal = √(σ² + a_k²)) and checked on 2023 coverage (±1σ should hold ~68%).",
  },
  anomaly: {
    title: "Temperature anomaly",
    simple: "How much warmer or colder the water is than usual for that place and time of year.",
    technical: "Reconstructed temperature minus the harmonic (annual + semi-annual) climatology fitted on the 2019–2021 training years, per cell and depth.",
  },
  climatology: {
    title: "Climatology baseline",
    simple: "The 'normal' for each place and season. If a model can't beat simply guessing the normal, it isn't adding value.",
    technical: "Harmonic seasonal fit per cell and depth on the training years; used as a baseline and as the reference the U-Net predicts departures from.",
  },
  barrier: {
    title: "Barrier layer (proxy)",
    simple: "A layer of fresher water near the surface that can trap heat above it. We can only estimate it here from surface salinity.",
    technical: "Estimated: fraction of the box with satellite SSS below a threshold (Bay of Bengal freshening). Not a measured barrier-layer thickness.",
  },
  reconstruction: {
    title: "Reconstruction",
    simple: "OceanSight's best estimate of the ocean below the surface, built from what satellites see at the surface. It is not a measurement and not a forecast.",
    technical: "U-Net output: residual on climatology at 15 standard depths, 0.25° daily, 2019–2023, from 7 satellite surface channels (SST, SSS, SLA, geostrophic U/V, wind U/V).",
  },
  cross_section: {
    title: "Vertical cross-section",
    simple: "A slice through the ocean, like cutting a cake: distance along a line goes across, depth goes down, and colour shows the temperature in that slice.",
    technical: "Reconstructed field at the 15 standard depths along one row (fixed latitude) or column (fixed longitude) of the 0.25° grid, exactly the grid cells, no horizontal interpolation; land and below-seabed cells are blank.",
  },
  isotherm: {
    title: "Isotherm",
    simple: "A line joining places with the same temperature — for example, where the water is exactly 20 °C. Following it shows how warm water piles up or thins out.",
    technical: "Depth of a fixed temperature (20 or 26 °C) found by linear interpolation between the two reconstructed standard depths that bracket it; undefined where the column never crosses it.",
  },
  thermocline: {
    title: "Thermocline",
    simple: "The layer where the water gets colder quickly as you go down, separating the warm surface water from the cold deep ocean.",
    technical: "The zone of maximum vertical temperature gradient below the mixed layer; in the tropical Indian Ocean the 20 °C isotherm (D20) is a common proxy for its depth.",
  },
  temporal_evolution: {
    title: "Temporal evolution",
    simple: "How something changes over time. Here: how warm or cold each depth is, day after day, at one place.",
    technical: "Daily reconstructed temperature at one grid cell for the chosen period (subsampled to at most 400 days for long ranges), shown as a depth–time section with derived MLD/D20/D26.",
  },
  vertical_gradient: {
    title: "Vertical temperature gradient (dT/dz)",
    simple: "How quickly the water gets colder as you go down. The steepest cooling marks the thermocline.",
    technical: "Temperature difference between two consecutive valid levels divided by their separation (°C per m, depth positive downward), assigned to the layer mid-depth. Negative values mean cooling with depth.",
  },
  thermocline_depth: {
    title: "Thermocline depth (gradient maximum)",
    simple: "The depth where temperature drops fastest — the boundary between the warm upper ocean and the cold deep ocean.",
    technical: "Mid-depth of the layer with the most negative dT/dz below the mixed layer and within the analysis range. On the reconstruction the layer is bounded by standard depths, so its bounds are reported as the resolution. Quality: good / limited / insufficient (weak, coarse, edge-of-range or ambiguous maxima are flagged). Different from D20, which is an isotherm proxy.",
  },
  halocline: {
    title: "Halocline",
    simple: "The depth where salinity changes fastest. In the Bay of Bengal, fresh river and rain water floats on top of saltier water, making a sharp halocline near the surface.",
    technical: "Mid-depth of the layer with the largest |dS/dz| of a measured Argo (or reanalysis) salinity profile, after Argo range and spike tests and 5 m bin averaging. OceanSight does not reconstruct salinity.",
  },
  salinity: {
    title: "Salinity",
    simple: "How salty the sea water is, in practical salinity units (roughly grams of salt per kilogram of water).",
    technical: "Practical salinity (PSS-78). At the surface: satellite SMAP/SMOS sea-surface salinity (a model input). Below the surface: measured Argo profiles, or the optional GLORYS12V1 reanalysis when configured. Never reconstructed by OceanSight.",
  },
  ts_diagram: {
    title: "Temperature–salinity (T-S) diagram",
    simple: "A chart of temperature against salinity for every depth in a profile. Water masses with a common origin plot as recognisable curves.",
    technical: "Potential temperature θ (0 dbar) against practical salinity, points coloured by depth, with σ0 isopycnals computed with TEOS-10. It reveals water-mass structure through the joint T-S relationship; interpretation of specific water masses needs regional context.",
  },
  sigma0: {
    title: "Potential density anomaly (σ0)",
    simple: "How dense the water would be if brought to the surface, minus 1000 kg/m³. Denser water sits below lighter water in a stable ocean.",
    technical: "σ0 = ρ(SA, CT, p = 0) − 1000 kg/m³ from TEOS-10 (gsw): Absolute Salinity from practical salinity and position, Conservative Temperature from in-situ temperature and pressure.",
  },
  density_mld: {
    title: "Density mixed layer and barrier layer",
    simple: "The mixed layer defined by density instead of temperature. When fresh water caps the surface, it can be much shallower than the warm layer, leaving a 'barrier layer' in between.",
    technical: "de Boyer Montégut et al. (2004): MLD where σ0 exceeds its 10 m value by 0.03 kg/m³; isothermal layer depth where T departs from its 10 m value by 0.2 °C; barrier-layer thickness = ILD − MLD when positive. From measured Argo T and S.",
  },
  sla: {
    title: "Sea-level anomaly (SLA)",
    simple: "How much higher or lower the sea surface is than its long-term average. Warm eddies and thick warm layers tend to stand higher.",
    technical: "Satellite altimetry SLA (NOAA blended product, a model input), relative to the provider's reference mean sea surface; regridded to 0.25° and gap-filled. Shown in cm.",
  },
  wind: {
    title: "10 m wind",
    simple: "Wind speed 10 m above the sea surface, as seen by satellites. It is air moving over the ocean, not an ocean current.",
    technical: "NOAA NCEI Blended Seawinds daily u/v (a model input). Speed is the magnitude of the daily-mean vector, which can be lower than the daily mean of instantaneous speeds. Arrows point where the wind blows to.",
  },
  short_horizon: {
    title: "Short-horizon estimate (T+1, T+2)",
    simple: "A cautious guess of the next one or two days, made by extending the recent reconstructed values. It is not a weather-style forecast model.",
    technical: "Least-squares trend over the last 7 reconstructed days (or persistence) at one cell, using only days up to the issue date. Its error is estimated by re-running the method over the previous 60 days at the same cell, combined in quadrature with the calibrated reconstruction σ.",
  },
  classification: {
    title: "Data classification",
    simple: "Every value in OceanSight is labelled by how it was obtained — measured, satellite, reanalysis, reconstructed, derived, estimated, forecast or baseline — so they are never confused.",
    technical: "Measured: in-situ observation. Satellite: satellite-derived product. Reanalysis: data-assimilative model analysis or objective analysis. Reconstructed: OceanSight model output. Derived: deterministic calculation. Estimated: statistical estimate with assumptions. Forecast: extrapolation beyond the issue date. Baseline: reference climatology.",
  },
  investigation_point: {
    title: "Investigation point",
    simple: "The place and day you chose to study. It is a coordinate on the OceanSight grid, not a physical station.",
    technical: "The selected latitude/longitude is served from the 0.25° grid cell containing it. Nearby measured Argo profiles (within 100 km and ±3 days) are listed separately with their distance and date offset.",
  },
} satisfies Record<string, Term>;

export type TermKey = keyof typeof GLOSSARY;
