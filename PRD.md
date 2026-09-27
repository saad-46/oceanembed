# PRD — GAHAN (SIH26066 · OceanEmbed)

*Condensed product requirements. Full detail: `docs/06_PRODUCT_REQUIREMENTS.md`, `docs/07_FEATURE_PRIORITIZATION.md`.*

## Problem
INCOIS needs basin-scale subsurface ocean temperature; direct measurement (Argo/buoys/ships) is too sparse in space and time. See `docs/02_DOMAIN_RESEARCH.md`.

## Solution
GAHAN reconstructs temperature at 15 standard depths (0–1000 m), 0.25°/daily, over the North Indian Ocean, from five satellite surface fields, using a CNN/U-Net (with a LightGBM baseline reported alongside), validated against independent Argo floats — and surfaces the result as INCOIS-relevant products (TCHP, MLD, D20/D26) in an interactive map application.

## Users
Primary: INCOIS-style ocean analyst/forecaster. Secondary: cyclone forecasters, fisheries advisory analysts, researchers.

## MVP scope
Features 1–9 in `docs/07_FEATURE_PRIORITIZATION.md`: real data ingestion → regridding → baseline + DL models → independent validation → interactive map + profile view → cached API → offline-safe demo.

## Explicit non-goals
Not a ROMS/HYCOM replacement. Not real-time/operational. Not claiming to beat global literature SOTA. See `docs/06_PRODUCT_REQUIREMENTS.md` §6 and `docs/21_RISKS_AND_LIMITATIONS.md`.

## Success criteria
PS requirements met (`docs/01`), an honest baseline-vs-DL comparison, a working demo a judge can drive themselves, zero invented performance numbers.
