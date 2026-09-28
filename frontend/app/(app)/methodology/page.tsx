import Link from "next/link";

export const metadata = { title: "Methodology — OceanSight" };

const STEPS = [
  ["Ingest", "One adapter per source; cached, resumable downloads"],
  ["Clean", "Unit harmonisation, physical-range flags, de-duplication"],
  ["Regrid", "All sources → common 0.25° daily grid (bilinear / area-weighted)"],
  ["Features", "7 surface channels + lat/lon + season; train-years-only normalisation"],
  ["Models", "Climatology · LightGBM per depth · U-Net (embedding + uncertainty)"],
  ["Validate", "Held-out years vs independent Argo floats, per depth"],
  ["Serve", "Precomputed daily grids + derived products via FastAPI"],
];

const SOURCES = [
  ["SST", "CMEMS OSTIA L4", "NOAA OISST v2.1 (0.25°, daily)"],
  ["SSS", "CMEMS Multi-Obs SSS", "NOAA SMAP daily merged with bias-corrected SMOS 3-day"],
  ["SLA", "CMEMS DUACS L4", "NOAA blended altimetry SLA (0.25°, daily)"],
  ["Currents", "CMEMS GlobCurrent (total)", "NOAA altimetry geostrophic currents (0.25°, daily)"],
  ["Winds", "ERA5 10 m (CDS)", "NOAA NCEI Blended Seawinds v2 (0.25°, daily)"],
  ["Training target", "GLORYS12V1 (1/12°)", "HYCOM GOFS 3.1 analysis (1/12°), coarsened to 0.25°"],
  ["Validation", "Gridded Argo via INCOIS LAS", "Argo GDAC profiles via argopy (QC 1/2)"],
  ["Cyclone tracks", "—", "NOAA IBTrACS v04r01 (North Indian)"],
];

const CAN = [
  "The reconstruction is validated against Argo float profiles from held-out years, with the reanalysis-assimilation caveat disclosed.",
  "All data used is free and openly accessible; the Copernicus/ERA5 adapters switch on with free credentials, no code change.",
  "The model is compared honestly against a seasonal climatology and a LightGBM baseline, per depth.",
  "This is a proof of concept over 2019–2023, not an operational real-time system.",
  "Reported skill numbers are exactly those computed by the pipeline in this repository (see Validation).",
];
const CANNOT = [
  "“Beats state of the art” — no like-for-like benchmark (same region, metric and protocol) has been run.",
  "“Production-ready” or “adopted by INCOIS” — no such review or relationship exists.",
  "“Fully independent validation” without the caveat — the training target assimilates Argo.",
  "That INCOIS LAS gridded Argo or GLORYS were used — the open substitutes above were used for the current model.",
];

export default function Methodology() {
  return (
    <article className="px-4 md:px-8 py-8 max-w-5xl w-full mx-auto space-y-10 text-[15px] leading-relaxed">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">How OceanSight works — and where its limits are</h1>
        <p className="text-ink-2">
          OceanSight is our implementation of <strong>SIH26066 “OceanEmbed”</strong> (Ministry of Earth Sciences / INCOIS): reconstruct subsurface ocean temperature at 15
          standard depths (0–1000 m) over the North Indian Ocean (5–30°N, 45–105°E) at 0.25° and daily resolution, from surface satellite observations alone.
        </p>
        <nav className="flex flex-wrap gap-3 text-sm text-accent" aria-label="On this page">
          {["pipeline", "data", "models", "validation", "claims", "ps"].map((a) => (
            <a key={a} href={`#${a}`} className="hover:underline">
              #{a}
            </a>
          ))}
        </nav>
      </header>

      <section id="pipeline" className="space-y-3">
        <h2 className="font-display text-xl">1 · Pipeline</h2>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="border border-line rounded p-3 bg-surface">
              <div className="text-[11px] num text-ink-3">STEP {i + 1}</div>
              <div className="font-display text-accent">{t}</div>
              <div className="text-sm text-ink-2 mt-1">{d}</div>
            </li>
          ))}
        </ol>
        <p className="text-ink-2 text-sm">
          Nothing on screen triggers live model inference: every day of 2019–2023 is reconstructed ahead of time and served from cached Zarr stores, so the demo is
          independent of external services. Metadata, Argo profiles and validation records live in PostgreSQL + PostGIS (spatial indexes for nearest-float queries).
        </p>
      </section>

      <section id="data" className="space-y-3">
        <h2 className="font-display text-xl">2 · Data sources</h2>
        <p className="text-ink-2 text-sm">
          The problem statement allows substituting openly available products with regridding. Copernicus Marine and ERA5 need a (free) account that was not
          available to the automated build, so the current model uses open NOAA/HYCOM equivalents. Both sets are implemented behind the same adapter interface.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-3 border-b border-line">
                <th className="text-left font-normal py-2 pr-4">Variable</th>
                <th className="text-left font-normal pr-4">Spec primary (credentialed)</th>
                <th className="text-left font-normal">Used for the current model (open)</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map(([v, a, b]) => (
                <tr key={v} className="border-b border-line/60">
                  <td className="py-1.5 pr-4 text-ink">{v}</td>
                  <td className="pr-4 text-ink-2">{a}</td>
                  <td className="text-ink">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-2 text-sm">
          Satellite salinity only exists from 2010 (SMOS) / 2015 (SMAP) and the open HYCOM analysis starts in December 2018, so the study period is 2019–2023. Targets
          are fetched every 3rd day (daily in May–June 2023); the model still outputs every day, since inference only needs the surface inputs.
        </p>
      </section>

      <section id="models" className="space-y-3">
        <h2 className="font-display text-xl">3 · Models</h2>
        <ul className="space-y-2 text-ink-2 list-disc pl-5">
          <li>
            <strong className="text-ink">Seasonal climatology</strong> — harmonic (annual + semi-annual) fit per cell and depth on the training years. The
            &ldquo;do nothing clever&rdquo; baseline every model must beat.
          </li>
          <li>
            <strong className="text-ink">LightGBM</strong> — one gradient-boosted regressor per depth on per-pixel features (7 surface fields, lat/lon, season). Fast,
            interpretable (feature importances on AI Insights), no spatial context.
          </li>
          <li>
            <strong className="text-ink">U-Net encoder–decoder (primary)</strong> — a CNN over the whole 100×240 surface image. Its bottleneck is the{" "}
            <em>satellite embedding</em>: a compact latent representation of the basin&apos;s surface state. The decoder predicts each depth as a departure from the
            climatology plus a per-depth variance (heteroscedastic uncertainty head).
          </li>
          <li>
            <strong className="text-ink">Salinity ablation</strong> — the same U-Net trained without the SSS channel, to measure what satellite salinity (and the Bay of
            Bengal barrier layer) contributes.
          </li>
          <li>
            <strong className="text-ink">Derived products</strong> — deterministic formulas on the reconstructed profile: TCHP (heat above 26°C, Leipper &amp;
            Volgenau), mixed-layer depth (0.5°C criterion), D20 and D26 isotherm depths.
          </li>
        </ul>
      </section>

      <section id="validation" className="space-y-3">
        <h2 className="font-display text-xl">4 · Validation protocol</h2>
        <ul className="space-y-2 text-ink-2 list-disc pl-5">
          <li>Whole-year split: train 2019–2021, validate 2022 (early stopping only), test 2023 (touched once). Random day splits would leak autocorrelation.</li>
          <li>Normalisation statistics and climatology use training years only.</li>
          <li>Independent check: each held-out Argo profile is compared with the reconstruction for its day at its 0.25° cell, per standard depth (RMSE, bias, r, skill vs climatology).</li>
          <li>
            <strong className="text-warn">Caveat:</strong> the training target (HYCOM, like GLORYS) assimilates Argo. Held-out floats are independent of our model&apos;s training
            but not fully independent of the product it learned from. We also show that target product&apos;s own error against the same floats as a reference ceiling.
          </li>
        </ul>
        <Link href="/validation" className="text-accent text-sm hover:underline">
          → See the computed numbers on the Validation screen
        </Link>
      </section>

      <section id="claims" className="grid md:grid-cols-2 gap-4">
        <div className="border border-good/40 rounded p-4">
          <h2 className="font-display text-lg text-good mb-2">Claims we make</h2>
          <ul className="space-y-1.5 text-sm text-ink-2 list-disc pl-4">
            {CAN.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="border border-bad/40 rounded p-4">
          <h2 className="font-display text-lg text-bad mb-2">Claims we do not make</h2>
          <ul className="space-y-1.5 text-sm text-ink-2 list-disc pl-4">
            {CANNOT.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </section>

      <section id="ps" className="space-y-2">
        <h2 className="font-display text-xl">5 · Official problem statement (summary of the verified record)</h2>
        <div className="border border-line rounded p-4 bg-surface text-sm text-ink-2 space-y-2">
          <p>
            <strong className="text-ink">SIH26066 — OceanEmbed:</strong> Satellite Embedding-Based Deep Learning Framework for Reconstruction of Subsurface Ocean Temperature
            from Surface Satellite Observations. Ministry of Earth Sciences, INCOIS. Category: Software · Theme: Space Technology.
          </p>
          <p>
            Reconstruct depth-wise subsurface temperature from daily surface satellite observations at 0.25° for the North Indian Ocean (5°N–30°N, 45°E–105°E), using SST,
            SSS, SSH/SLA, surface currents (U,V) and surface winds (U,V); generate compact satellite embeddings with CNN/ViT/autoencoder/GNN/attention architectures;
            reconstruct the 15 standard depths 0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700 and 1000 m; evaluate against independent observations with
            correlation, RMSE and bias. Named target: GLORYS reanalysis; in-situ: gridded Argo via INCOIS LAS. Openly available substitutes with regridding are permitted.
          </p>
          <p className="text-ink-3 text-xs">Full verified text: docs/01_OFFICIAL_PROBLEM_STATEMENT.md in the repository.</p>
        </div>
      </section>
    </article>
  );
}
