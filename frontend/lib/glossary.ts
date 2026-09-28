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
} satisfies Record<string, Term>;

export type TermKey = keyof typeof GLOSSARY;
