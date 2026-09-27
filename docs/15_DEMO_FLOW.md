# 15 · Demo Flow (5–7 minutes)

## Timeline

| Time | Segment | What's on screen | What to say |
|---|---|---|---|
| 0:00–0:30 | **Problem** | Landing screen hero: reconstructed field + headline validation stat | "INCOIS needs the ocean's temperature beneath the surface — for cyclones, fisheries, climate. Direct measurement is sparse: a few hundred floats across an area bigger than Western Europe. We reconstruct it every day, everywhere, from satellites alone." |
| 0:30–1:30 | **Live map** | Main Ocean Map: temperature raster at surface, then step through a few depths live | Click through depth selector 0 → 100 m → 500 m, showing the temperature structure change with depth in real time. |
| 1:30–2:30 | **Select region + point** | Click a point in the Bay of Bengal near a real cyclone track (Mocha's path, May 2023) | "Let's look at May 2023, right before Cyclone Mocha." Click the point — profile panel slides in. |
| 2:30–3:30 | **AI/ML insight** | Profile panel: 15-depth chart, uncertainty band, baseline-vs-model toggle, embedding scatter jump | "Here's the full column — not just a number, a shape, with our model's own uncertainty. Toggle: this is what climatology alone would guess; here's ours; here's what the actual Argo float measured that week." |
| 3:30–4:30 | **Decision/derived product — the signature moment** | Analysis screen: Cyclone Fuel Gauge (TCHP) dial lighting up along Mocha's track | "This is Tropical Cyclone Heat Potential — INCOIS's own operational metric — computed entirely from our satellite-only reconstruction, replayed along Mocha's actual path." |
| 4:30–5:30 | **Unique feature + validation** | Salinity ablation toggle (turn off SSS input) showing Bay of Bengal error jump; then Validation screen table | "Turn off salinity — watch the Bay of Bengal error grow. That's the barrier layer; it's why the problem statement requires SSS specifically. And here — every number we've shown you is scored against real Argo floats the model never trained on." |
| 5:30–6:30 | **Architecture + scalability** | Methodology/About screen: architecture diagram, honest claims | "Baseline gradient-boosting, CNN reconstruction, both reported honestly. Free, open data end to end. Point us at official INCOIS data tomorrow and one adapter changes — nothing else." |
| 6:30–7:00 | **Close** | Back to landing hero | One-sentence recap + the recommended next step (see `19_IMPLEMENTATION_ROADMAP.md` and the closing "what we'd build next" line). |

## What must be true before this demo can run

1. All precomputed grids for the demo date range (at minimum: May 2023, the Mocha window) are cached and loading from disk, not a live API (`16_SECURITY_AND_PRODUCTION.md`).
2. The salinity-ablation model variant (#19 in `07_FEATURE_PRIORITIZATION.md`) is pre-trained, not trained live.
3. Every number shown carries an honest Measured/Validation/Target label internally, even if not displayed as a literal tag on screen — so no presenter is ever caught improvising an unverified figure.
4. A full offline run-through has been rehearsed with wifi disabled, to confirm nothing silently depends on a live external call.
