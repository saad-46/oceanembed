# 07 · Feature Prioritization

Every feature below answers "what problem does this solve?" — none are generic dashboard filler. Difficulty: S/M/L/XL. Dev time assumes one competent full-stack + one ML person working in parallel.

## MUST HAVE (MVP — without these, there is no PS-compliant prototype)

| # | Feature | Problem it solves | Difficulty | Dev time | Dependencies | Dataset needs | Demo value | SIH relevance |
|---|---|---|---|---|---|---|---|---|
| 1 | Data ingestion scripts (Copernicus/ERA5/argopy) | Nothing else works without real data flowing in | M | 4–6h | Free accounts (§`04`) | All 5 inputs + GLORYS + Argo | Low (invisible) | Directly required |
| 2 | Regridding/harmonization pipeline to 0.25°/daily | PS explicitly requires standardized 0.25°/daily grid | M | 3–5h | #1 | — | Low (invisible) | **Directly required (PS text)** |
| 3 | Baseline model: climatology + LightGBM per depth | Establishes "is deep learning even needed" honesty; fast to build | S | 2–4h | #1,#2 | — | Medium | Required for honest evaluation |
| 4 | DL reconstruction model (CNN/U-Net encoder-decoder) | The PS's actual technical ask: embedding + reconstruction | L | 8–14h | #1,#2 | — | High | **Directly required (PS text)** |
| 5 | Independent Argo validation (held-out years/floats, per-depth RMSE/bias/corr) | PS's explicit evaluation requirement | M | 4–6h | #1,#4, `argopy` | Argo profiles | High (credibility) | **Directly required (PS text)** |
| 6 | Interactive map: temperature at selectable depth/date | Makes the reconstruction visible/explorable, not just a number in a notebook | M | 6–8h | #4 outputs cached | — | High | Proposed value-add |
| 7 | Click-to-inspect profile chart | Turns a 2D map into the actual 15-depth answer the PS asks for | S | 2–3h | #6 | — | High | Proposed value-add |
| 8 | Backend API serving cached predictions | Decouples frontend from slow model inference; demo reliability | M | 4–6h | #4,#5 outputs | — | Low (invisible) | Proposed value-add |
| 9 | Offline/cached demo fallback (see `26`) | Hackathon wifi/API failures must not kill the demo | S | 2–3h | #8 | — | Low (invisible, until needed) | Proposed value-add |

**MVP subtotal: ~35–55 dev-hours** across ML + backend + minimal frontend — realistic for a 3–4 day team sprint working in parallel tracks.

## SHOULD HAVE (materially strengthens the entry)

| # | Feature | Problem it solves | Difficulty | Dev time | Dependencies | Dataset needs | Demo value | SIH relevance |
|---|---|---|---|---|---|---|---|---|
| 10 | Calibrated uncertainty per depth (quantile regression or MC-dropout) | A silent wrong number is worse than an honest "we're not sure here" | M | 4–6h | #4 | — | High | Differentiator — competitors mostly skip this |
| 11 | Derived products: MLD, D20/D26, TCHP | Turns raw temperature into what INCOIS actually uses operationally | S | 3–4h | #5 profile output | — | Very high | Directly ties to INCOIS's stated operational use (`02`) |
| 12 | Baseline-vs-model toggle (climatology / ARMOR3D / GAHAN) | Lets a judge see *why* the ML model earns its keep, not just trust a claim | S | 2–3h | #3,#4, ARMOR3D data | ARMOR3D | High | Answers the #1 predictable judge question |
| 13 | Date/time slider animating reconstruction | Shows seasonal cycle, monsoon signal — visually compelling | M | 3–5h | #6 | — | High | Proposed value-add |
| 14 | Honest 3-way architecture comparison (baseline/CNN/attention variant) reported together | Directly answers "why this architecture" with evidence, not assertion | M | 4–8h (mostly reuses #3,#4 infra) | #3,#4 | — | Medium (table, not visual) | Directly matches PS's "compare architectures" framing |
| 15 | Report export (PDF/CSV) | A tangible artifact a judge can hold/take away | S | 2–3h | #6,#7,#11 | — | Medium | Proposed value-add |
| 16 | Embedding space visualization (PCA/UMAP, colored by season) | Directly demonstrates the PS's literal "satellite embedding" ask | S | 2–3h | #4 encoder output | — | High (novel visual) | **Directly matches PS wording** |

## WOW (only if MVP + Should-have are done early)

| # | Feature | Problem it solves | Difficulty | Dev time | Dependencies | Dataset needs | Demo value | SIH relevance |
|---|---|---|---|---|---|---|---|---|
| 17 | "Cyclone Fuel Gauge" replay over a real cyclone (Mocha/Biparjoy 2023) | Ties the whole pipeline to a concrete, memorable, high-stakes real event | M | 3–5h | #11, held-out 2023 data | 2023 subset of all inputs | Very high | Strong differentiator vs. other OceanEmbed teams |
| 18 | Live blind-test mode against a real held-out Argo float | Makes "independent validation" tangible and interactive, not a static table | M | 3–4h | #5 | Held-out Argo floats | Very high | Strongest possible answer to "is this really independent?" |
| 19 | Salinity ablation demo (turn off SSS input live, show Bay of Bengal error jump) | Proves the barrier-layer physics point (`02`) isn't just narration | S | 2–3h | #4 trained twice (with/without SSS) | — | High | Shows domain understanding, not just engineering |
| 20 | NL query assistant ("what's the heat potential near 15°N, 88°E today?") | Modern AI touch, but only after core numbers are real | M | 4–6h | #8 API, an LLM call | — | Medium–high (novelty) | See `AI features` in `10_ML_AI_STRATEGY.md` for the "can MVP work without it" answer — **yes** |

## FUTURE (do not spend MVP time here)

| # | Feature | Why deferred |
|---|---|---|
| 21 | Operational real-time daily auto-refresh ingestion | Requires production infra, scheduling, monitoring — out of scope for a PoC |
| 22 | INCOIS LAS gridded-Argo direct integration | Blocked on confirmed external access (`04`, `05`) |
| 23 | Downstream integration into an actual PFZ/cyclone advisory pipeline | Requires INCOIS partnership, far beyond hackathon scope |
| 24 | Global (not just North Indian Ocean) generalization | The PS scopes the domain deliberately; global is a distraction |
| 25 | Mobile/low-bandwidth SMS-style advisory delivery | A distribution-channel problem, not a reconstruction-model problem |

---

## Time-boxed builds

### 24-HOUR MVP
Features **1–9** only, with the DL model (#4) as a *small* CNN (not a large ViT), trained on a **single season/year subset** to guarantee convergence in time. Map (#6) can be a static pre-rendered image switcher rather than a fully interactive tile server if frontend time runs short. Skip #10–20 entirely.

### 48-HOUR MVP
Features **1–9 fully working end-to-end** + **11 (derived products)** + **12 (baseline toggle)** + **16 (embedding viz)** — these three are the highest demo-value-per-hour Should-haves and directly reinforce PS-alignment.

### 3-DAY VERSION
Everything in 48-hour, plus **10 (uncertainty)**, **13 (time slider)**, **14 (architecture comparison table)**, and **one** Wow feature — recommend **17 (Cyclone Fuel Gauge)** as the single highest-impact choice if only one Wow feature is affordable.

### FINAL PRODUCTION-STYLE VERSION (if time allows beyond 3 days)
All Should-haves (10–16) + all Wow features (17–20) + polish pass on `12_UI_UX_SPECIFICATION.md` + full test suite (`17_TESTING_STRATEGY.md`).

**Priority order if forced to cut, in order: 1→2→4→5→3→6→7→8→9 (MVP is non-negotiable in this order) → 11→12→16 (cheapest, highest PS-alignment Should-haves) → 10→14→13 → one Wow feature → everything else.**
