# 25 · Demo script — as built (5–7 min)

Adapts `15_DEMO_FLOW.md` to the implemented app. Every step is a URL, so any team member can drive it.
Start: API on :8100, web on :3100 (or the deployed URLs). The views below are also bundled as offline
snapshots (`frontend/public/fallback/`), so they render even if the API drops mid-demo — the badge then
reads "Offline fallback".

| Time | Screen / URL | Action | Say (numbers are from docs/RESULTS.md) |
|---|---|---|---|
| 0:00 | `/` | Point at the hero + stat tiles | "INCOIS needs the ocean's temperature below the surface. We reconstruct it every day at 15 depths from satellites alone — and score it against 2,639 Argo floats from a year it never trained on." |
| 0:30 | `/map?date=2023-05-11&depth=0` | Click depth 0 → 100 → 500 | "Surface, 100 m, 500 m. At 100 m you can see eddies and the thermocline tilt — the model gets these from sea-level anomaly." |
| 1:30 | Quick jump **Pre-Mocha · Bay of Bengal** (15°N 88°E) | Profile drawer opens | "11 May 2023, days before Cyclone Mocha. Full column with a calibrated uncertainty band. Toggle climatology; the green dots are a real Argo float 82 km away in the held-out year." |
| 2:30 | Same drawer | Read the chips; click **Summarise** | "Cyclone heat potential 77 kJ/cm², 26 °C isotherm at ~65 m. The summary is generated from these numbers; it never invents any." |
| 3:15 | `/analysis` → **Cyclone Fuel Gauge** (Mocha, 2 days before passage) | Drag the track slider | "INCOIS's own metric along Mocha's real track — TCHP from our satellite-only reconstruction, above the 50 kJ/cm² intensification threshold until landfall." |
| 4:15 | `/validation` (Test 2023) | Point at the caveat, RMSE-by-depth chart, scatter | "Every number here is against held-out floats. U-Net 0.89 °C mean, climatology 1.10. The dashed line is the reanalysis we trained on — our ceiling. And yes, it assimilates Argo; that's why we also check against EN4." |
| 5:00 | Scroll to calibration + ablation notes | — | "Raw uncertainty was over-confident; calibrated on 2022, it covers 70 % of 2023 floats within 1σ. We also tried removing salinity — it did not change skill in this build, and we say so." |
| 5:45 | `/insights` | Embedding facets + importance | "The embedding the PS asks for: each dot is one day's basin state; seasons separate. The baseline leans on sea-level anomaly at 100 m — physically what we'd expect." |
| 6:30 | `/methodology` → back to `/` | — | "Open data end to end; point us at GLORYS and Copernicus credentials and one adapter switches. Next: ARMOR3D baseline and INCOIS LAS." |

**Changed from docs/15:** the salinity-ablation moment is presented as an honest null result rather than a
"watch the error jump" reveal (measured: no change). **Before presenting:** rehearse once with the API stopped
to confirm the fallback path (verified during the build on the map + profile views).
