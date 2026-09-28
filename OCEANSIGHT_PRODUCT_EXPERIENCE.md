# OceanSight — Product Experience

Source of truth for the product (not the build history). Written after a code audit on 2026-09-29.

## 1. Product vision

**OceanSight — Subsurface Ocean Intelligence.**
Explore how ocean temperature structure changes across **space → depth → time**, with the model reconstruction,
independent observations, uncertainty and validation always one step away.

OceanSight *reconstructs* past and present subsurface states from surface observations (2019–2023, North Indian
Ocean, 5–30°N 45–105°E, 0.25°, daily, 15 depths 0–1000 m). It does not forecast. Every screen must stay true to that.

The product is a scientific workspace with an optional guided onboarding layer — not a presentation with a workspace
attached.

## 2. Audit summary (what exists and is kept)

| Layer | Kept as is | Changed |
|---|---|---|
| Science & data | U-Net / LightGBM / climatology, calibrated σ, Zarr stores, PostGIS Argo, EN4, IBTrACS, derived TCHP/MLD/D20/D26, timeline + section endpoints | nothing in the science |
| API | all 27 endpoints, typed errors, cache | user-facing strings (API title, report text); report gains an optional `depth`, a map inset, investigation metadata and provenance |
| Web — tools | map, profile, timeline, section, cyclone/region analysis, validation, insights cards, exports, methodology pipeline, glossary, shared request cache, offline snapshots | layout, hierarchy, naming, provenance, entry points |
| Web — presentation layer | — | **removed:** 9-stage narrative tour (`/tour`), presenter demo (`/demo` + bar), overview dashboard, landing metrics/“why” sections, hackathon identity. **Replaced by** the Guided Exploration layer over the real app |

Identity audit: 20+ user-facing references to the competition, team, problem statement, presenter/demo and the
previous code name were found in the landing page, logo, metadata, methodology, overview, tour, demo, help, insights,
API title, report PDF/CSV and assistant prompt. All are removed from the product surface. Internal identifiers
(database name, logger names, environment variables) are not user-facing and stay unchanged to avoid breaking
deployments.

## 3. Target users

| User | Needs | Entry |
|---|---|---|
| Researcher / oceanographer | direct access to fields, profiles, sections, time series, validation numbers, methods | deep link or *Explore* → map |
| Analyst / maritime / climate professional | a place, a date, a clear answer with uncertainty; exportable reports | map → profile → report |
| Student / technically curious visitor | understand what they are looking at | landing → Guided Exploration, *What is this?* help |

## 4. Information architecture

Navigation describes what users come to do:

| Group | Page | Route | Purpose |
|---|---|---|---|
| **Explore** | Ocean map | `/map` | primary workspace: variable, depth, date, overlays, point selection, profile side panel |
| **Analyze** | Profile | `/profiles` | inspect one water column in depth |
| | Timeline | `/timeline` | one point through time |
| | Section | `/section` | one transect through depth |
| | Events & regions | `/analysis` | cyclone–ocean context, regional statistics |
| | Daily summary | `/insights` | computed summaries for a date; model internals |
| **Validate** | Evidence | `/validation` | held-out Argo, EN4, baselines, uncertainty coverage, limitations |
| **Report** | Reports | `/reports` | build and export an investigation |
| **Learn** | Methodology | `/methodology` | data → processing → reconstruction → derived → validation → limitations → version |

Retired routes redirect so old links keep working: `/overview` → `/map`; `/tour`, `/demo` → Guided Exploration.
Cross-links form the loop **map → profile → timeline / section → map**, and every analysis screen can produce a report.

## 5. Entry flows

- **First visit:** landing (what it is in ~10 s, real data visual) → *Explore ocean* or *Guided Exploration*. A small,
  dismissible “New to OceanSight?” prompt appears once (landing and app); *Explore on my own* opens the product
  immediately and is remembered.
- **Returning:** landing → *Explore ocean* → map; no prompt (status remembered: completed / skipped / dismissed).
- **Professional / direct URL:** any route works standalone with its own context (title, location/date state in the
  URL, provenance, metadata bar). No onboarding interrupts.

## 6. Guided Exploration

Answers “how do I use OceanSight?”, not “how impressive is it?”. It is a floating panel over the **real** screens:

1. Choose a location (map; detects a real click) · 2. Look below the surface (depth control) · 3. Inspect the water
column (profile panel) · 4. Follow it through time (timeline) · 5. Explore a section (section) · 6. Check the evidence
(validation) · 7. Investigate an event (cyclone analysis) · 8. Create a report (report builder) → *You're ready to explore.*

Rules: highlight (ring) the relevant control without dimming or blocking the app; the panel moves away from the
highlighted element; Back / Continue / Exit always available; state survives navigation and reloads (URL `guide=`
+ session); completion is remembered; replay from Help or the landing page; reduced motion removes the pulse;
keyboard: Alt+→ / Alt+← (and Page Down/Up) move steps.

## 7. Professional workflow & workspace

- **Map = canvas; controls = tools; side panel = context; bottom bar = metadata.** Controls are grouped
  **Variable · Depth · Date · Overlays · Location · Export**, the first three open, the rest disclosed on demand.
- **Status bar** (always visible): layer provenance (e.g. *Reconstructed · OceanSight U-Net*), variable, depth, date,
  resolution (0.25° · daily), data period, model version, cursor readout, loading state.
- **Profile, timeline, section:** the chart is the primary object; controls sit in a compact toolbar; context and
  actions follow (View through time · Section here · Explore on map · Generate report).

## 8. Design principles

Scientific, spatial, calm, precise. Hierarchy and typography carry the polish — not glow. Restrained
blue/cyan accents on the deep-ocean background, thin separators, subtle surfaces, real data visuals. Reduce:
giant metric tiles, glowing cards, gradient headings, feature counts, repeated statistics, marketing copy.
No fake enterprise features (accounts, chat, live monitoring, notifications, billing).

## 9. Scientific trust model

Four provenance classes, used identically everywhere:

| Class | Meaning | Examples |
|---|---|---|
| **Measured** | direct observation | Argo profiles, IBTrACS storm position & wind |
| **Reconstructed** | OceanSight model output | temperature at any depth, uncertainty field |
| **Derived** | computed from reconstructed/measured fields | anomaly, TCHP, MLD, D20, D26, isotherms |
| **Estimated** | inferred / proxy, extra uncertainty | calibrated σ, barrier-layer proxy |

Provenance appears as a compact line (e.g. *Derived · from reconstructed temperature*) on the map status bar,
charts and report. Causal language is avoided unless established; the validation caveat (the training target
assimilates Argo) is always stated where accuracy is shown.

## 10. Progressive disclosure

Beginner: plain sentence on screen (“Temperature at 100 m, reconstructed by OceanSight”). Professional: the
provenance line and numbers. Technical: *What is this?* (Simple / Technical) and Methodology. Model internals
(embedding, feature importance) live one level down, not on the main path.

## 11. Mobile strategy

Desktop is the primary workspace; phones remain usable: map-first with a collapsible tool sheet, the profile as a
bottom sheet, toolbars that wrap, charts full width with readable labels, guide panel as a compact bottom card.
Targets: no horizontal scroll and no clipped popovers at 375 / 390 px.

## 12. Accessibility

Keyboard reachable controls, visible focus, labelled inputs, dialogs with Esc, charts as labelled focusable images
with arrow-key selection and a live readout, reduced-motion support, sufficient contrast on text over data.

## 13. Product language

Use: explore, analyze, investigate, reconstruct, compare, validate, observe, generate report.
Never in the product: hackathon/competition terms, judges, submission, pitch, presenter, demo, prototype, team,
“our AI/innovation/solution”, “predicts the ocean”. A source-level test enforces the banned list.
