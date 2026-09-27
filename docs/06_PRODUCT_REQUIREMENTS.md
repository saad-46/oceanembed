# 06 · Product Requirements (PRD)

## 1. Product name

**GAHAN** — working name for the OceanEmbed implementation. (Sanskrit/Hindi-rooted, evokes "depth"/"profound"; chosen purely as branding, does not alter or replace the official PS title "OceanEmbed.") Every judge-facing artifact should say: *"GAHAN — our implementation of SIH26066: OceanEmbed."*

## 2. Product vision

A satellite-only ocean subsurface temperature reconstruction service for the North Indian Ocean that turns five daily surface satellite fields into a full, uncertainty-aware 15-depth temperature profile — and turns that profile into the specific decision-support numbers (cyclone heat potential, mixed-layer depth, thermocline depth) that INCOIS's own operational services already use.

## 3. One-line description

*"See beneath the surface of the Indian Ocean, every day, using only satellites — GAHAN reconstructs the temperature at 15 depths down to 1000 m from what satellites already see on top, validated against real ocean floats."*

## 4. Target users

| | |
|---|---|
| **Primary user** | An INCOIS-style ocean analyst / forecaster (played by the judges in the demo) who wants a fast subsurface temperature estimate for a region and date, with a clear confidence level. |
| **Secondary users** | (a) A researcher exploring historical reconstructions and model skill by depth/season; (b) a cyclone forecaster checking heat-potential in a storm's path; (c) a fisheries advisory analyst wanting thermocline context. |

## 5. Core user journey

Adapted from the generic template to what GAHAN actually does:

```
Select region + date (Bay of Bengal / Arabian Sea, any day in the trained record)
        ↓
System pulls/serves the pre-processed satellite surface fields for that day
        ↓
Model reconstructs the 15-depth temperature profile + per-depth uncertainty
        ↓
Derived products computed: TCHP, MLD, D20/D26
        ↓
Interactive map + profile view: click anywhere, see profile, uncertainty, derived metrics
        ↓
Validate: compare against a held-out real Argo float profile at/near that point/date
        ↓
Export: PNG/CSV/PDF summary of the region-date reconstruction for a report
```

## 6. Explicit non-goals (say this to judges before they ask)

- **Not** a replacement for INCOIS's operational ROMS/HYCOM ocean models — a complementary, fast, satellite-only surrogate.
- **Not** a real-time operational system — a validated proof-of-concept over the historical record (2015–2023 or similar), with a clear description of what "going operational" would additionally require (`16_SECURITY_AND_PRODUCTION.md`).
- **Not** claiming to beat state-of-the-art global literature benchmarks — claiming to build a defensible, honestly-validated regional PoC (see `29`-equivalent claims discipline in `21_RISKS_AND_LIMITATIONS.md`).

## 7. Success criteria for the SIH prototype

1. Official PS requirement implemented: preprocessing pipeline, embedding-producing DL model, 15-depth reconstruction at 0.25°/daily over the named domain, and evaluation against independent Argo observations.
2. At least one baseline (non-deep-learning) model reported alongside the DL model, so "does deep learning actually help here" has an honest answer.
3. A working, clickable interface a judge can drive themselves in the demo.
4. Every accuracy number shown carries a Measured/Validation/Target label (see `21_RISKS_AND_LIMITATIONS.md` Appendix discipline) — no invented performance numbers.
