# 12 · UI/UX Specification

## 1. Visual direction

**"Deep-ocean scientific instrument," not "college dashboard."** Reference points: oceanographic visualization platforms (Copernicus Marine's own MyOcean viewer, NOAA's ERDDAP/data viewers), scientific GIS tools, and mission-control-style dark dashboards used by agencies like ISRO/INCOIS for operational displays. The goal is that a government stakeholder or research judge feels this looks like something that could plausibly sit inside INCOIS's own toolset — calm, precise, data-dense without clutter.

### Design language
- **Dark-first** theme (a light theme is a should-have, not required): near-black navy background (`#0a0e14`–`#0d1420`) makes the color-ramped ocean data itself the brightest, most eye-catching thing on screen — exactly the opposite of a white dashboard where the map competes with white space.
- **Minimal chrome**: thin 1px borders, no heavy card shadows, generous negative space between panels — data density lives inside the map and charts, not in busy UI decoration.
- **Scientific precision cues**: monospace numerals for coordinates/depths/metrics (evokes instrument readouts), consistent 2-decimal formatting for all physical quantities.

### Color palette
- **Background**: `#0a0e14` (near-black navy), panel surface `#111826`, border `#1e2836`.
- **Text**: primary `#e8edf4`, secondary `#8a96a8`.
- **Accent (interactive/brand)**: cyan `#2ac3de` — used for active controls, links, the GAHAN wordmark.
- **Sequential data ramp (temperature)**: a colorblind-safe cool→warm sequential ramp (deep blue → teal → yellow → orange-red), reserved *only* for the temperature raster layer so it always reads unambiguously as "the data," never as chrome.
- **Categorical accents** (baseline vs. model vs. Argo-truth in comparison charts): 3–4 distinct hues (blue / orange / teal / amber), consistent across every chart in the app.
- **Status colors**: success/high-confidence `#1baf7a`, warning/medium-confidence `#eda100`, error/low-confidence or failure `#e5484d` — used sparingly, only for actual status meaning (uncertainty bands, data-availability warnings), never decoratively.

### Typography
- **Display/headings**: a geometric sans (e.g. Space Grotesk or similar) for the wordmark and section titles — gives a "space/satellite tech" feel appropriate to the PS's "Space Technology" theme tag.
- **Body/UI**: a clean humanist sans (e.g. Inter) for all body text and labels.
- **Numeric/coordinate/code**: a monospace face (e.g. IBM Plex Mono / JetBrains Mono) for lat/lon, depths, RMSE values, API responses shown in-app.

### Spacing & components
- 8px base spacing unit; panels use 16/24px internal padding.
- **Cards**: flat, 1px border, subtle 4px radius — used for stat tiles (current TCHP, current MLD, model confidence).
- **Maps**: full-bleed within their panel, controls overlaid top-right, legend bottom-left.
- **Charts**: consistent axis styling, gridlines at 20% opacity, tooltips follow the `dataviz` skill's tooltip conventions.
- **Tables**: zebra-free (relies on borders, not background stripes, to stay calm on dark background), right-aligned numeric columns.
- **Tooltips**: dark surface, cyan accent border, appear on hover with a short delay.
- **Alerts/banners**: used exactly three times in the whole app — "showing demo/cached data," "low confidence at this depth," "data unavailable for this date" — never decoratively.
- **Loading states**: skeleton shimmer for map/chart panels (data-shaped placeholders, not a generic spinner) — reinforces the "scientific instrument" feel.
- **Empty states**: "select a point on the map to see its profile" with a subtle animated cursor-and-point illustration, not just blank space.
- **Error states**: calm, specific ("GLORYS data unavailable for this date — showing nearest available day, 2 days prior") rather than a generic red banner.
- **Responsive behavior**: primary demo target is desktop/projector (1920×1080); a tablet-width breakpoint stacks the map above the profile panel instead of side-by-side; full mobile support is explicitly out of scope for the hackathon build (judges evaluate on a laptop/projector, not a phone).

## 2. Complete application flow

```
Landing / Overview
   ↓
Ocean Map (region + date + depth selection)
   ↓
Click a point → Profile & Uncertainty panel opens
   ↓
Analysis (derived products: TCHP / MLD / D20-D26 for the selected point or region)
   ↓
Validation (this reconstruction vs. nearest independent Argo float)
   ↓
Report (export PNG/CSV/PDF of the above)
```
Two secondary entry points reachable from anywhere via a persistent top nav: **AI Insights** (the embedding visualization + optional NL summary) and **Methodology/About** (the honest claims + architecture explanation, for a technically curious judge).

## 3. Screen-by-screen specification

### 1. Landing / Overview
- **Purpose**: orient a judge in 10 seconds — what this is, what PS it answers, headline validation number.
- **Layout**: full-bleed animated/static hero of the reconstructed temperature field over the Bay of Bengal; overlay: product name, one-line pitch, "Official PS: SIH26066 — OceanEmbed" badge, a single headline stat ("validated against N independent Argo profiles, RMSE X°C at thermocline depth").
- **Components**: hero map, stat tile row, "Enter the map" CTA.
- **Interactions**: CTA → Ocean Map screen.
- **Data displayed**: one precomputed hero frame + summary validation stats (from DB).
- **API calls**: `GET /v1/summary/headline`.
- **Loading**: skeleton hero.
- **Empty state**: n/a (always has data once deployed).
- **Error state**: falls back to a static hero image if the summary API fails.

### 2. Main Ocean Map
- **Purpose**: the core exploration surface.
- **Layout**: full map left/center (≈75% width), right sidebar (25%) with depth selector, date slider, layer toggles (temperature/uncertainty/Argo markers), legend.
- **Components**: MapLibre+Deck.gl map, depth dropdown, date slider, layer toggle checkboxes, color legend, coordinate readout.
- **Interactions**: click cell → open profile panel (screen 3, as an overlay/drawer, not full navigation); drag date slider → re-render raster; click Argo marker → highlight matching validation record.
- **Data displayed**: precomputed daily grid for selected date/depth.
- **API calls**: `GET /v1/grid/{date}?depth=...`, `GET /v1/argo/markers?date=...`.
- **Loading**: raster fades in as new date loads; previous frame stays visible until ready (no flash-to-blank).
- **Empty state**: n/a.
- **Error state**: banner "data unavailable for this date — showing nearest available day."

### 3. Region Explorer / Profile panel
- **Purpose**: answer the PS's literal question at one point — the full 15-depth profile.
- **Layout**: slide-in right drawer over the map: depth-vs-temperature line chart (with shaded uncertainty band), lat/lon header, quick derived-metric chips (MLD, D20, D26, TCHP).
- **Components**: Recharts line+area chart, metric chip row, "compare to Argo" button (if a nearby float exists), "compare to baseline" toggle.
- **Interactions**: toggle baseline/ARMOR3D overlay on the same chart; click "compare to Argo" → overlays the real measured profile as points.
- **Data displayed**: `GET /v1/profile/{date}/{lat}/{lon}`.
- **Loading**: chart skeleton.
- **Empty state**: "click a point on the map."
- **Error state**: "no reconstruction available at this exact point (land/out of domain)."

### 4. Analysis Dashboard
- **Purpose**: region-level (not just point-level) derived-product view — the INCOIS-relevant "so what" screen.
- **Layout**: bounding-box drawn on a mini-map + stat cards (mean TCHP, mean MLD, area with barrier-layer indication) + a small time-series of the region's mean TCHP over the study period.
- **Components**: mini-map with draw control, stat cards, time-series chart.
- **Interactions**: redraw box → recompute stats.
- **Data displayed**: `POST /v1/region/stats`.
- **Loading**: stat cards show shimmer while recomputing.
- **Empty state**: default box = full Bay of Bengal domain on first load.
- **Error state**: "region too large / recomputation timed out — try a smaller box" (server-side timeout guard).

### 5. AI Insights (embedding + optional NL summary)
- **Purpose**: directly visualize the PS's literal "satellite embedding" ask; secondary home for the optional NL assistant.
- **Layout**: 2D PCA/UMAP scatter of the model's embedding space, colored by month/season, with a text box below for the optional NL query.
- **Components**: scatter plot (Recharts/D3), query input, response card.
- **Interactions**: hover a point in the scatter → highlights that date on the main map (cross-screen link, optional polish).
- **Data displayed**: precomputed embedding projection; NL response is either a live LLM call or a templated fallback sentence.
- **API calls**: `GET /v1/embedding/projection`, `POST /v1/assistant/query`.
- **Loading**: scatter renders progressively.
- **Empty state**: query box shows example prompts.
- **Error state**: if the LLM call fails, silently falls back to the templated sentence — never shows a raw error to the judge.

### 6. Validation
- **Purpose**: the PS's explicit evaluation requirement, made visible and explorable rather than buried in a notebook.
- **Layout**: a table of held-out Argo floats (date, location, per-depth RMSE) + a scatter plot (predicted vs. observed, colored by depth) + the baseline-vs-model comparison bars.
- **Components**: sortable table, scatter plot, bar chart.
- **Interactions**: click a table row → jumps to that float's location/date on the main map.
- **Data displayed**: `GET /v1/validation/summary`.
- **Loading**: table skeleton rows.
- **Empty state**: n/a (always populated once trained).
- **Error state**: n/a (static precomputed data, no live dependency).

### 7. Reports / Export
- **Purpose**: tangible takeaway artifact.
- **Layout**: a preview of the exportable one-page PDF (region, date, profile chart, derived metrics, validation caveat footer) + download buttons (PNG/CSV/PDF).
- **Components**: preview pane, export buttons.
- **Interactions**: click export → generates file client-side (canvas/CSV) or via a lightweight backend render endpoint for PDF.
- **API calls**: `GET /v1/report/{date}/{lat}/{lon}` (for PDF generation) or fully client-side for PNG/CSV.
- **Loading**: spinner on the export button only.
- **Empty state**: n/a (always has the last-viewed profile as default content).
- **Error state**: "export failed — try PNG/CSV instead of PDF" fallback ladder.

### 8. Methodology / About
- **Purpose**: the honest, judge-facing "how this actually works and what its limits are" page — directly supports `20_JUDGE_QA.md` and `21_RISKS_AND_LIMITATIONS.md` in the live product itself.
- **Layout**: static long-form page: architecture diagram, data sources with links, the claims-we-can/cannot-make section, official PS text.
- **Components**: static content, no live API calls.
- **Interactions**: none beyond scroll/anchor links.

*(Two generic template screens — "Settings" and a separate stand-alone "Data Layers" screen — are intentionally omitted: there's no user account system requiring settings, and layer controls live inside the Main Ocean Map screen rather than as a separate page, per Research Rule #7 "don't over-engineer the MVP.")*
