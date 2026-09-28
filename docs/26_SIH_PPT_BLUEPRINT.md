# OCEANBED — SIH 2026 PPT CONTENT BLUEPRINT

**Sources.** Structure: `SIH2026-IDEA-Presentation-Format.pptx`. Facts: the OceanBed artifact (`docs/00–23`) plus the verified results of the built prototype (`docs/RESULTS.md`, generated from the metrics files). Style reference: ThermalTrace SIH26162 deck. Scoring lens: SIH Virtual Judge rubric.

**Three things to settle before filling the deck**

1. **Name.** The artifact itself warns (`docs/00`, `docs/01`) that "OceanBed" suggests seabed/bathymetry mapping, which this PS is *not*; its product name is **GAHAN**. This blueprint uses "OceanBed" with a subtitle that makes the subsurface-temperature focus unmistakable. Switching to GAHAN is a find-and-replace.
2. **Deadline.** The scraped official record lists the idea-submission deadline as **20 Sep 2026** — confirm the live date with your SPOC.
3. **Team ID and Team Name** are not in the artifact — fill them in.

---

## 1. PRESENTATION STRATEGY

| | |
|---|---|
| **Core story** | Satellites only see the ocean's surface; Argo floats are too sparse. OceanBed turns five satellite surface fields into a daily 0–1000 m temperature map — and proves it on real floats it never saw. |
| **One-line project** | A satellite-embedding deep-learning system that reconstructs North Indian Ocean temperature at 15 depths (0–1000 m), 0.25°, daily. |
| **One-line problem** | Cyclone, fisheries and climate decisions depend on subsurface ocean heat, but direct measurements are too sparse in space and time. |
| **One-line solution** | Learn the surface→subsurface mapping from satellite SST, SSS, SLA, currents and winds, and deliver daily INCOIS-style products (TCHP, MLD, D20/D26). |
| **One-line USP** | Validated beyond its own training data, with an uncertainty band calibrated to the real ocean. |
| **What the evaluator should remember** | "It works, it covers the whole basin every day, and they proved it on 2,639 Argo floats from a held-out year — with honest caveats." |

## 2. TEMPLATE STRUCTURE

The template allows a maximum of six slides including the title. Delete template slide 7 (Important Instructions) and submit as PDF.

| Slide | Exact Template Section | Purpose | OceanBed Content |
|---|---|---|---|
| 1 | TITLE PAGE | Identify PS and team | SIH26066 details, OceanBed + subtitle |
| 2 | IDEA TITLE — Proposed Solution / How it addresses the problem / Innovation and uniqueness | Problem → solution → USP | 3-part solution, problem→solution→outcome strip, 3 USPs, workflow strip |
| 3 | TECHNICAL APPROACH — Technologies / Methodology & process (flow charts / working prototype) | Prove it is real and credible | Tech table, architecture diagram, ML pipeline with train/validate/test split |
| 4 | FEASIBILITY AND VIABILITY — Feasibility / Challenges & risks / Strategies | Prove it is achievable, with evidence | Feasibility ratings, validated-results cards, risk → mitigation table |
| 5 | IMPACT AND BENEFITS — Impact on target audience / Benefits | Who gains what | Users, 4 benefit tiles, prototype screenshot (Cyclone Fuel Gauge) |
| 6 | RESEARCH AND REFERENCES | Credibility | Reference table + GitHub link |

The template has no Results slide. Results go on slide 4 (as proof of feasibility) and slide 5 (as the prototype screenshot), the same way the ThermalTrace deck handled it.

---

## 3. SLIDE-BY-SLIDE FINAL CONTENT

### SLIDE 1 — TITLE PAGE

**PURPOSE.** Identify the problem statement and team instantly.

**FINAL HEADLINE:** OceanBed
**SUBTITLE:** Seeing 1000 m beneath the ocean surface — from satellites alone

**FINAL CONTENT**

- Problem Statement ID – **SIH26066**
- Problem Statement Title – **OceanEmbed – Satellite Embedding-Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations**
- Theme – **Space Technology**
- PS Category – **Software**
- Team ID – **[fill in]**
- Team Name (Registered on portal) – **[fill in]**

**VISUAL.** Optional: a thin strip of the reconstructed 100 m temperature map (2023-05-11) behind the subtitle, from the app's landing hero — signals "real output" from the first slide.

**DIAGRAM / CHART.** None.

**KEY MESSAGE.** This is the OceanEmbed PS (MoES/INCOIS) — subsurface temperature, not the seabed.

**CONTENT PRIORITY.** MUST INCLUDE: all template fields. OPTIONAL: map strip.

**SPEAKER NOTE.** "We're OceanBed, for SIH26066 OceanEmbed from INCOIS — reconstructing the ocean's temperature down to 1000 metres, every day, using only satellite data."

---

### SLIDE 2 — IDEA TITLE / PROPOSED SOLUTION

**PURPOSE.** Problem → solution → why it is different, understood in about 20 seconds.

**FINAL HEADLINE:** OceanBed — daily 0–1000 m ocean temperature for the North Indian Ocean, from 5 satellite fields

**FINAL CONTENT — Proposed Solution**

- Ingests 5 daily satellite surface fields — **SST, SSS, sea-level anomaly, surface currents (U,V), winds (U,V)** — harmonised to one **0.25° grid, 5–30°N, 45–105°E**.
- A **U-Net encoder–decoder** compresses each day's basin-wide surface state into a compact **satellite embedding**, then decodes temperature at the **15 standard depths (0–1000 m)** with a per-depth uncertainty.
- Converts every reconstruction into INCOIS's operational quantities: **Tropical Cyclone Heat Potential (TCHP), Mixed-Layer Depth (MLD), 20 °C / 26 °C isotherm depths (D20/D26)**.
- **GIS dashboard:** map with depth/date controls, click-to-profile, Argo float overlay, Cyclone Fuel Gauge on real cyclone tracks.

**How it addresses the problem** (three-part strip)

| Problem | Solution | Outcome |
|---|---|---|
| Argo floats, buoys and ships measure subsurface temperature only at scattered points and times. | Satellites see the whole basin daily; OceanBed learns the physical surface→subsurface link (e.g. sea-level anomaly → thermocline depth). | A continuous daily 3-D temperature field plus derived products, each with an honest error bar. |

**Innovation & Uniqueness** (three tiles — see section 4)

- **Validated beyond its own training data** — held-out-year Argo test, the training product's own ceiling, and an independent EN4 cross-check.
- **Uncertainty calibrated to the real ocean** — ±1σ covers **70%** of held-out Argo values (ideal 68%).
- **From reconstruction to decision product** — daily TCHP / MLD / D20 / D26 at 0.25°, and a Cyclone Fuel Gauge on real IBTrACS tracks.

**VISUAL — workflow strip** (left to right, 6 boxes, same style as the ThermalTrace "System Workflow")

1. **Satellite inputs** — SST · SSS · SLA · currents · winds
2. **Harmonise** — clean, regrid to 0.25° daily
3. **Satellite embedding** — U-Net encoder
4. **Reconstruct** — 15 depths + uncertainty
5. **Derive** — TCHP · MLD · D20 · D26
6. **Deliver** — GIS dashboard · API · PDF/CSV reports

**DIAGRAM / CHART.** Workflow strip only; no chart.

**KEY MESSAGE.** "Satellite surface in → subsurface ocean out, every day, with a measured error bar."

**CONTENT PRIORITY.** MUST INCLUDE: solution bullets 1–3, problem→solution→outcome strip, 3 USP tiles. SHOULD INCLUDE: dashboard bullet, workflow strip.

**SPEAKER NOTE.** "Surface conditions leave fingerprints of what's below — a raised sea surface usually sits over a deep warm layer. Our model learns those fingerprints from five satellite fields and rebuilds the full column down to 1000 metres, every day, across the Bay of Bengal and Arabian Sea — then turns it into the numbers INCOIS actually uses, like cyclone heat potential."

---

### SLIDE 3 — TECHNICAL APPROACH

**PURPOSE.** Show that the ML and the system are real, well specified and methodologically sound.

**FINAL HEADLINE:** Technical approach — open data → harmonised grid → satellite embedding → validated reconstruction

**FINAL CONTENT — Technologies to be used**

| Layer | Tools |
|---|---|
| Satellite data (used now, open) | NOAA OISST v2.1 (SST) · SMAP + SMOS (SSS) · NOAA blended altimetry (SLA, geostrophic currents) · NCEI Blended Seawinds (winds) |
| Training target | HYCOM GOFS 3.1 1/12° ocean analysis (open substitute for GLORYS; GLORYS adapter built) |
| Validation | Argo float profiles via `argopy` · Met Office EN4 |
| Data & ML | Python · xarray · Zarr · LightGBM · PyTorch (U-Net) |
| Geospatial / DB | PostgreSQL + PostGIS (spatial indexes, nearest-float queries) |
| Backend / Frontend | FastAPI · Next.js · MapLibre GL · deck.gl · Recharts |
| Engineering | Docker · GitHub Actions CI · 44 automated tests |

**FINAL CONTENT — Methodology & process**

- **Data:** 1,826 days (2019–2023) × 7 input channels on a 100 × 240 grid (0.25°). Target: 637 days of 3-D temperature, interpolated to the 15 standard depths and area-averaged to 0.25°.
- **Split by whole years:** train 2019–2021 · validate 2022 · **test 2023 (fully held out)** — no random-day splits, which leak autocorrelation.
- **Models, compared honestly:** seasonal climatology (floor) → LightGBM per depth (baseline) → U-Net (primary; bottleneck = satellite embedding; outputs per-depth mean + variance).
- **Evaluation:** RMSE, bias and correlation **per depth**, against held-out Argo floats.

**VISUAL — architecture diagram** (4 columns, same style as ThermalTrace)

| DATA | PROCESSING | INTELLIGENCE | STORAGE & APP |
|---|---|---|---|
| SST · SSS · SLA · Currents · Winds; training target: HYCOM; validation: Argo, EN4 | Ingest & QC → Regrid to 0.25° → Feature engineering | U-Net satellite embedding → 15-depth reconstruction + uncertainty → TCHP / MLD / D20 / D26 | Zarr grids (every day precomputed) · PostgreSQL + PostGIS · FastAPI → GIS dashboard |

**VISUAL — ML pipeline** (bottom strip)

Satellite fields → Harmonise (0.25°, daily) → Normalise (train years only) → U-Net encoder (**embedding**) → Decoder (15 depths + σ) → Calibrate σ on 2022 Argo → Validate on 2023 Argo

**DIAGRAM / CHART.** The two diagrams above. No numbers on this slide — they belong on slide 4.

**KEY MESSAGE.** Built properly: whole-year held-out test, a baseline before the deep model, validation against real floats.

**CONTENT PRIORITY.** MUST INCLUDE: year split, three models, architecture diagram. SHOULD INCLUDE: dataset sizes, tech table. OPTIONAL: "44 automated tests · CI".

**SPEAKER NOTE.** "All data is open. We never test on the years we train on — 2023 is fully held out. We build a simple baseline first so the deep model has to earn its place. The U-Net's bottleneck is the satellite embedding the problem statement asks for."

---

### SLIDE 4 — FEASIBILITY AND VIABILITY

**PURPOSE.** Prove it is achievable with evidence, not assertion. This is where the validated results go.

**FINAL HEADLINE:** Feasible — and already working: a validated end-to-end prototype

**FINAL CONTENT — Feasibility analysis** (rating tiles)

| Dimension | Rating | Basis |
|---|---|---|
| Data | High | Every input, target and validation source used is open; the spec's Copernicus/ERA5 sources need only free registration. |
| Technical | High | Full pipeline built and running end to end: ingestion → model → API → dashboard. |
| Compute | High | U-Net (1.09 M parameters) trained on a laptop CPU; no GPU used. |
| Deployment | Demonstrated locally | Docker images and an offline-capable demo; hosted deployment is the next step. |
| Cost | ₹0 data cost | No paid data or services used. |

**FINAL CONTENT — Validated on held-out year 2023** (metric cards)

| Metric card | Value |
|---|---|
| Independent Argo profiles, from a year the model never trained on | **2,639** |
| Mean temperature error (RMSE, all 15 depths) | **0.89 °C** vs **1.10 °C** climatology |
| Error at 100 m (thermocline) | **1.31 °C** vs **1.80 °C** climatology |
| Uncertainty after calibration | **70% within ±1σ** (ideal 68%) |

**FINAL CONTENT — Challenges & risks → strategies**

| Challenge / risk | Strategy |
|---|---|
| Training target (a reanalysis) assimilates Argo, so validation is not fully independent | Held-out year only; show the target product's own error as the ceiling (0.79 °C); cross-check against EN4 |
| Raw model uncertainty was over-confident (41% within ±1σ) | Per-depth calibration fitted on 2022 floats, checked on 2023 → 70% / 94% within ±1σ / ±2σ |
| Satellite salinity is gappy (SMAP daily swaths) | Merge SMAP with bias-corrected SMOS (absent days 209 → 1). Removing SSS showed **no measurable change** in skill in this build — re-test on Copernicus SSS |
| GLORYS / Copernicus need an account | Credentialed adapters already built; switching sources is an `.env` change, no code change |
| Thermocline (20–150 m) is the hardest layer | Report error per depth, never one number; the error bar widens where skill drops |

**Bottom line:** feasibility is demonstrated, and the remaining risks are known and measured.

**VISUAL.** Left: 5 feasibility tiles. Centre: 4 metric cards (large numbers). Right: risk → strategy table.

**DIAGRAM / CHART (optional, if space permits)**

- Title: Temperature error by depth — 2023 held-out Argo
- Y-axis: depth (m), 0 at the top; X-axis: RMSE (°C)
- Lines: U-Net, LightGBM, climatology, HYCOM target product (values in `docs/RESULTS.md`; screenshot the app's `/validation` chart)
- Takeaway: both ML models beat climatology at every depth down to 300 m; error peaks in the thermocline.

**KEY MESSAGE.** Not an idea on paper — it runs, and it is measured on real floats it never saw.

**CONTENT PRIORITY.** MUST INCLUDE: 4 metric cards, first 2 risk rows. SHOULD INCLUDE: feasibility tiles, salinity row. OPTIONAL: mini-chart.

**SPEAKER NOTE.** "We built it. On 2023, a year the model never saw, we checked it against 2,639 real Argo floats — under 0.9 °C average error across 15 depths, clearly better than climatology. We're upfront about the caveat: our training data assimilates Argo, so we also show that product's own error and cross-check against EN4."

---

### SLIDE 5 — IMPACT AND BENEFITS

**PURPOSE.** Who uses it, what changes for them — plus visual proof.

**FINAL HEADLINE:** From satellite pixels to ocean decisions

**FINAL CONTENT**

**Target users:** INCOIS-style ocean analysts and forecasters · cyclone forecasters · fisheries-advisory analysts · ocean researchers — **decision support, not a replacement** for operational ocean models.

| Benefit | Content |
|---|---|
| Social | Basin-wide cyclone heat potential (TCHP) and mixed-layer depth maps, for every day and every 0.25° cell of the domain. |
| Economic | Uses only free satellite data; model trained on a CPU; served products are precomputed, so viewing needs no heavy computation. |
| Environmental / climate | A continuous daily record of upper-ocean heat and stratification for the North Indian Ocean (2019–2023 in the prototype). |
| Operational | Every profile ships with a calibrated error bar and the nearest independent Argo float — analysts can see when *not* to trust a value. |

**Key outcome:** Full-basin subsurface view · daily · 0–1000 m · with measured confidence

**VISUAL — prototype screenshot (required): Cyclone Fuel Gauge**

- URL: `/analysis` → "Cyclone Fuel Gauge" → Cyclone Mocha 2023, ocean state 2 days before passage
- Caption: "OceanBed prototype — reconstructed TCHP under Cyclone Mocha's real IBTrACS track (May 2023, held-out year). Working prototype, not an operational forecast."
- Optional second screenshot: profile panel at 15°N 88°E, 2023-05-11 (`/map?date=2023-05-11&depth=100&lat=15&lon=88`) — reconstruction with uncertainty band against a real Argo float 82 km away.

**DIAGRAM / CHART.** None beyond the screenshot.

**KEY MESSAGE.** It produces the numbers INCOIS uses, on a real cyclone, in a year it never trained on.

**CONTENT PRIORITY.** MUST INCLUDE: target users, operational tile, screenshot. SHOULD INCLUDE: other 3 tiles. OPTIONAL: second screenshot.

**SPEAKER NOTE.** "Here's Cyclone Mocha, May 2023. Along its real track, our satellite-only reconstruction shows cyclone heat potential above the 50 kJ/cm² level commonly linked to intensification, all the way to landfall. We present this as decision support with error bars, not a forecast." (Verified: TCHP along over-ocean track points 52.7–102.2 kJ/cm², ocean state 2 days before passage.)

---

### SLIDE 6 — RESEARCH AND REFERENCES

**PURPOSE.** Show the work is grounded in the right sources.

**FINAL HEADLINE:** Research and references

| Reference | Organisation | What it supports | Link |
|---|---|---|---|
| SIH26066 OceanEmbed problem statement | SIH / MoES–INCOIS | Scope and requirements | sih.gov.in |
| INCOIS Tropical Cyclone Heat Potential service | INCOIS | Operational relevance of TCHP | incois.gov.in/site/services/tchp.jsp |
| GLORYS12V1 reanalysis (PS-named target) | Copernicus Marine | Target specification | doi.org/10.48670/moi-00021 |
| Argo profiles via argopy | Argo programme / Euro-Argo | Independent validation | argopy.readthedocs.io |
| NOAA OISST v2.1 · NCEI Blended Seawinds | NOAA | Satellite inputs used | ncei.noaa.gov |
| EN4 objective analysis | UK Met Office | Independent cross-check | metoffice.gov.uk/hadobs/en4 |
| Bay of Bengal barrier layer (Vinayachandran, 2002) | JGR / AGU | Why SSS is in the input set | doi.org/10.1029/2001JC000831 |
| Subsurface temperature reconstruction, ConvLSTM vs LightGBM (Remote Sensing, 2022) | MDPI | Architecture choice; thermocline is the hardest layer | doi.org/10.3390/rs14133198 |
| IBTrACS v04r01 | NOAA NCEI | Real cyclone tracks | ncei.noaa.gov/products/international-best-track-archive |

**Prototype repository:** github.com/saad-46/oceanembed

**VISUAL.** Table only, as in ThermalTrace.

**KEY MESSAGE.** Built on the problem statement's own named sources and on peer-reviewed methods.

**CONTENT PRIORITY.** MUST INCLUDE: PS, INCOIS TCHP, GLORYS, Argo, GitHub. SHOULD INCLUDE: NOAA, EN4, the two papers. OPTIONAL: IBTrACS.

**SPEAKER NOTE.** "Everything traces to the problem statement's own sources and open datasets; the full code is on GitHub."

---

## 4. OCEANBED USP / UNIQUENESS

**USP 1 — Validated beyond its own training data.** Scored on 2,639 Argo floats from a fully held-out year, shown next to the training product's own error ceiling and cross-checked against the independent EN4 analysis.

**USP 2 — Uncertainty calibrated to the real ocean.** Every profile carries an error bar calibrated on 2022 floats that holds on 2023: 70% within ±1σ (ideal 68%), up from 41% before calibration.

**USP 3 — From reconstruction to INCOIS decision products.** Daily TCHP, MLD, D20 and D26 at 0.25° for 2019–2023, plus a Cyclone Fuel Gauge replayed on real IBTrACS cyclone tracks.

**ONE-LINE DIFFERENTIATION**

> "OceanBed rebuilds the North Indian Ocean's top 1000 m every day from satellites alone — and proves it on real Argo floats from a year it never saw, with error bars calibrated to the real ocean."

**Rejected as USPs:** "uses AI / U-Net" (many teams do); "0.25° daily" (it is the PS requirement, not a differentiator); "satellite embedding" (named in the PS itself). Present these as features, not as uniqueness.

## 5. STRONGEST TECHNICAL EVIDENCE

| # | Fact / result | Evidence | Slide | Visual |
|---|---|---|---|---|
| 1 | Beats climatology on real floats in a held-out year | 2023, 2,639 Argo profiles: mean RMSE over 15 depths — U-Net 0.89 °C vs climatology 1.10 °C (LightGBM 0.91) | 4 | Metric card |
| 2 | Largest gain in the thermocline | 100 m: U-Net 1.31 °C vs climatology 1.80 °C; skill vs climatology 0.47 | 4 | Metric card / RMSE-by-depth chart |
| 3 | Calibrated uncertainty | ±1σ coverage 41% → 70% (ideal 68%); ±2σ 71% → 94% (ideal 95%) — fit on 2022, checked on 2023 | 2 (USP), 4 | Metric card |
| 4 | Honest ceiling plus independent cross-check | HYCOM target vs Argo: 0.79 °C. Vs EN4, all models beat climatology (2023: LightGBM 0.72, U-Net 0.75, climatology 0.82 °C) | 4 (risk table) | Table row |
| 5 | Physically sensible learning | LightGBM feature importance: SST ≈ 89% of gain at the surface; sea-level anomaly ≈ 56% at 100 m (the thermocline-depth signal) | Speaker note / Q&A | — |
| 6 | Working product on a real event | Cyclone Mocha (2023, held-out): TCHP 52.7–102 kJ/cm² along the over-ocean track | 5 | Screenshot |

## 6. CLAIMS TO AVOID

| Avoid | Why | Say instead |
|---|---|---|
| "Uses GLORYS / Copernicus data" | Not true for the current model | "Trained on HYCOM, an open 1/12° reanalysis of the same class; GLORYS adapter ready" |
| "Validated against INCOIS LAS gridded Argo" | Not reachable from outside INCOIS | "Validated against Argo profiles via argopy (the standard archive)" |
| "Fully independent validation" | The target assimilates Argo | "Independent of our training; the target's own error is shown as the ceiling" |
| "Salinity / barrier layer drives Bay of Bengal skill" | Ablation showed no measurable change | "Removing SSS did not change skill in this build; re-testing on Copernicus SSS" |
| "Deep learning beats gradient boosting" | Only on 2023; LightGBM is ahead on 2022 and on EN4 | "U-Net and LightGBM are close; both clearly beat climatology" |
| "Real-time / operational / forecasting" | Historical 2019–2023, precomputed | "Daily reconstruction for 2019–2023; operational ingestion is future work" |
| "Predicts cyclones" | TCHP is an ocean-state input, not a forecast | "Shows the ocean heat available to cyclones" |
| "State of the art" / "better than other OceanEmbed teams" | No like-for-like benchmark | Omit |
| "Deployed at a live URL" | Runs locally only; hosting not done | "Runs end to end locally (Docker); hosted deployment is next" |
| "XX% accuracy" | Wrong metric type for this problem | Per-depth RMSE in °C |
| "ViT / GNN / attention" | Not built | Omit, or list as future work |
| "INCOIS endorsed / uses it" | No such relationship | Omit |

## 7. FINAL PPT CONTENT CHECKLIST

- ☑ Exact template structure followed (6 slides; delete template slide 7; export as PDF)
- ☑ No unnecessary slides added
- ☑ No required section removed
- ☑ Artifact used as source of truth; numbers only from `docs/RESULTS.md`
- ☑ No invented metrics
- ☑ No invented datasets (HYCOM and open NOAA substitutions stated)
- ☑ No invented features
- ☑ No unsupported AI claims
- ☑ Implemented vs proposed separated (GLORYS, hosting, operational ingestion marked as next steps)
- ☑ Results have evidence (held-out year, n = 2,639, baseline, per depth)
- ☑ USP is explicit (slide 2 tiles)
- ☑ Problem immediately understandable (slide 2 strip)
- ☑ Solution immediately understandable (slide 2)
- ☑ Technical architecture understandable (slide 3)
- ☑ ML approach credible (year split, baseline, per-depth metrics)
- ☑ Impact clear (slide 5 users + screenshot)
- ☑ Content concise; no repetition across slides
- ☐ **Still to do:** fill Team ID / Team Name · decide the name (OceanBed vs GAHAN) · confirm the deadline · capture the two screenshots from the running app
