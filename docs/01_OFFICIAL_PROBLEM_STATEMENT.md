# 01 · Official Problem Statement Verification

> **Read this file first if you only read one.** Everything downstream in this artifact is built against the text below, verbatim, not against a generic template.

## 0. Important naming correction

The working name used throughout this artifact request was **"OceanBed."** The actual, verified Smart India Hackathon 2026 problem statement Saad has committed to is:

> **SIH26066 — "OceanEmbed"** — *Satellite Embedding‑Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations.*

This is **not** a seabed/bathymetry mapping problem. It does not involve multibeam sonar, side-scan sonar, sub-bottom profiling, seafloor classification, or marine geology in the sonar/hydrographic-survey sense. It is a **satellite oceanography + deep learning** problem: use surface satellite measurements (temperature, salinity, height, currents, wind) to reconstruct the temperature of the water column beneath the surface, down to 1000 m, at 15 standard depths.

Per Research Rule #3 ("do not hallucinate datasets/requirements") this artifact does **not** manufacture a bathymetry/sonar narrative to match the "OceanBed" name. Domain research (`02_DOMAIN_RESEARCH.md`) is scoped to what the verified PS actually asks for: satellite remote sensing, ocean vertical structure physics, and reconstruction ML — dropped concepts (multibeam sonar, side-scan sonar, sub-bottom profiling, seafloor classification, marine spatial data infrastructure) are noted as **not applicable** rather than silently included or silently omitted.

---

## 1. Verified official fields

Source: live scrape of `sih.gov.in/sih2026PS`, cross-checked against the GitHub mirror `NoBugNinja/Smart-India-Hackathon-SIH-2026-Problem-Statements` (`data/sih2026_ps_20260822_211225.json`, scraped 2026‑08‑22) and the Blinknbuild PDF master catalogue. Full raw record preserved at the end of this file. <span class="tag">Official</span>

| Field | Value |
|---|---|
| PS Number | **SIH26066** |
| Title | OceanEmbed – Satellite Embedding-Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations |
| Organization | Ministry of Earth Sciences (MoES) |
| Department | Indian National Centre for Ocean Information Services (INCOIS), Ocean Valley |
| Category | Software |
| Theme | Space Technology |
| YouTube link | none provided |
| Dataset link (official field) | none provided (datasets are named only in prose, see §3) |
| Contact info | none provided in the scraped record |
| Idea-submission deadline (as scraped 22 Aug 2026) | **20 September 2026** |
| Submitted ideas count (as of scrape) | 0 / 500 |

**⚠️ Deadline flag:** the scraped official record says 20 September 2026, which — as of today (27 Sept 2026) — has already passed if that field is still accurate. A third-party secondary source seen in earlier research suggested 30 September 2026. This artifact **cannot resolve this conflict**; sih.gov.in returned HTTP 403 to automated fetches from this environment (a known proxy/anti-bot restriction, not evidence the site is down). **Action item, today, before anything else:** have your team's SPOC (single point of contact) or a browser session confirm the live deadline and the idea-to-prototype-stage timeline directly on sih.gov.in or via your college nodal center. Do not lose a week of build time to an unconfirmed date.

---

## 2. Exact requirements, decomposed

### 2.1 What the PS explicitly requires (do not deviate from these)

1. **Spatial domain:** North Indian Ocean, 5°N–30°N, 45°E–105°E (covers the Arabian Sea and Bay of Bengal).
2. **Spatial resolution:** 0.25° × 0.25° grid.
3. **Temporal resolution:** daily.
4. **Required input variables (5 named):**
   - Sea Surface Temperature (SST)
   - Sea Surface Salinity (SSS)
   - Sea Surface Height (SSH) / Sea Level Anomaly (SLA)
   - Surface ocean currents (U, V components)
   - Surface winds (U, V components)
5. **Required pipeline stages (explicit):** (a) preprocessing/harmonization pipeline for multi-source satellite/ocean data; (b) standardize all datasets to the resolution above; (c) generate "compact satellite embeddings" via a deep learning architecture; (d) train a reconstruction model mapping surface state → temperature profile; (e) reconstruct temperature at **15 standard depths**: 0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000 m; (f) evaluate against independent observations using correlation, RMSE, bias, and similar skill metrics.
6. **Named allowable DL architecture families (explicit, not exhaustive per the PS's own wording "such as"):** CNN, Vision Transformer (ViT), Autoencoders, Graph Neural Networks (GNN), attention-based hybrid architectures.
7. **Named target/label dataset:** GLORYS Global Ocean Reanalysis (`doi.org/10.48670/moi-00021`), variable: Temperature.
8. **Named in-situ validation dataset:** Gridded ARGO via the **INCOIS Live Access Server (LAS)**.
9. **Explicit fallback permission (important, reduces risk):** *"If a dataset is not available at required resolution, the team may select the openly available product and perform appropriate spatial and temporal interpolation/regridding."* This is the PS's own license to substitute/regrid — use it deliberately and document every substitution (see `04_DATASETS_AND_APIS.md`).
10. **Named deliverables ("Expected Solution", verbatim structure):**
    - End-to-end preprocessing pipeline for satellite and ocean datasets.
    - Satellite embedding engine capable of learning latent ocean representations from surface observations.
    - Deep learning reconstruction model for estimating subsurface temperature.
    - Standardized output at daily temporal resolution and 0.25° spatial resolution.
    - Validation framework using independent ARGO observations.
    - Demonstration of a working Proof-of-Concept (PoC) over the Bay of Bengal / Arabian Sea.

### 2.2 What the PS does NOT specify (and we must not invent as if it did)

- No specific evaluation metric thresholds ("must achieve RMSE < X").
- No specific programming language, framework, or cloud provider.
- No UI/UX requirement of any kind — the PS is silent on frontend, dashboard, or visualization deliverables. Any UI we build is **our proposed value-add**, not a stated requirement.
- No mention of real-time/operational deployment, alerting, or production SLAs.
- No named dataset for surface currents or surface winds beyond the variable list (source selection is left to the team, consistent with the fallback permission in §2.1.9).
- No mention of cost constraints, hardware constraints, or team size.
- No explicit accuracy bar defining "success."

### 2.3 Official vs. proposed — the line we hold throughout this artifact

| | |
|---|---|
| <span class="tag t-off">Official</span> | Everything in §2.1, quoted or closely paraphrased from the scraped PS text. |
| <span class="tag t-inf">Inference</span> | Reasonable technical conclusions drawn from the official text plus external verification (e.g., "SSS requires satellite-era-only training data because SMOS/SMAP began in 2010/2015") — always shown with its source. |
| <span class="tag t-pro">Proposed</span> | Everything invented by this artifact to turn the bare requirement into a demonstrable product: the product name (GAHAN), the UI, the API design, the specific dataset choices, the specific model architectures chosen from the PS's allowed families, the demo script, etc. None of this is required by INCOIS; all of it is justified in later sections. |

---

## 3. Raw official record (verbatim, for reference)

```json
{
 "problem statement id": "26066",
 "problem statement title": "OceanEmbed - Satellite Embedding-Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature from Surface Satellite Observations.",
 "description": "• Background: Subsurface ocean temperature is a fundamental variable for understanding ocean circulation, upper-ocean heat content, stratification, climate variability, air-sea interaction and marine ecosystems. Accurate representation of the vertical ocean temperature is essential for applications such as marine heatwave monitoring, fisheries, and data assimilation, etc. However, direct measurements of subsurface temperature remain sparse because they rely primarily on in-situ observing systems such as ARGO profiling floats, moored buoys, gliders, and ship observations. While these observations provide valuable vertical information, their spatial and temporal coverage is insufficient for generating continuous, basin-scale subsurface fields. In contrast, satellite observations provide continuous, large-scale monitoring of surface ocean conditions at relatively high spatial and temporal resolution. Surface variables such as SST, SSS, SSH/SLA, surface currents, and surface winds contain indirect signatures of subsurface ocean processes through physical mechanisms including thermocline displacement, mesoscale eddies, vertical mixing, transport, and ocean-atmosphere coupling. Recent advances in AI, Deep Learning, and representation learning enable the generation of satellite embeddings, where multidimensional surface observations are transformed into compact latent representations that capture hidden ocean dynamics.
  • Detailed Description: Develop a Satellite Embedding-Based Deep Learning Framework to reconstruct depth-wise subsurface temperature from daily surface satellite observations at 0.25° spatial resolution for North Indian Ocean (5°N-30°N, 45°E-105°E). Standardize datasets to 0.25°x0.25°, daily. Inputs: SST, SSS, SSH/SLA, surface currents (U,V), surface winds (U,V). Generate compact satellite embeddings using CNN/ViT/Autoencoders/GNN/attention-hybrid architectures. Train reconstruction models. Reconstruct temperature at standard depths: 0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000 m. Evaluate using independent observations and skill metrics (correlation, RMSE, Bias). If a dataset is not available at required resolution, the team may select the openly available product and perform appropriate spatial and temporal interpolation/regridding.
  • Training Target Dataset: GLORYS Global Ocean Reanalysis (doi.org/10.48670/moi-00021), variable: Temperature. In-situ: Gridded ARGO via INCOIS LAS.
  • Expected Solution: end-to-end preprocessing pipeline; satellite embedding engine; DL reconstruction model; standardized daily 0.25° output; validation framework using independent ARGO; working PoC over Bay of Bengal / Arabian Sea.",
 "organization": "Ministry of Earth Sciences (MoES)",
 "department": "Indian National Centre for Ocean Information Services (INCOIS) Ocean Valley",
 "category": "Software",
 "theme": "Space Technology",
 "youtube link": "",
 "dataset link": "",
 "contact info": "",
 "s.no.": "66",
 "ps number": "SIH26066",
 "submitted idea(s) count": "0/500",
 "deadline for idea submission": "20 September 2026"
}
```

**Sources:** GitHub mirror `NoBugNinja/Smart-India-Hackathon-SIH-2026-Problem-Statements` (data/sih2026_ps_20260822_211225.json, scraped 2026-08-22, source field `https://sih.gov.in/sih2026PS`); cross-checked against Blinknbuild's "SIH 2026 All 226 Problem Statements Master Catalogue" PDF. Direct fetches to sih.gov.in returned HTTP 403 from this environment (proxy-level block, not confirmation the live site differs) — **re-verify directly on sih.gov.in before final submission.**
