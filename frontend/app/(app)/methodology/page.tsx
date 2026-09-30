import Link from "next/link";
import ModelVersion from "@/components/ModelVersion";
import PipelineFlow from "@/components/PipelineFlow";

export const metadata = { title: "Methodology", description: "Data, processing, reconstruction, derived products, validation and limitations of OceanSight." };

const TOC = [
  ["overview", "Overview"],
  ["data", "Data"],
  ["processing", "Processing"],
  ["reconstruction", "Reconstruction"],
  ["derived", "Derived products"],
  ["stratification", "Stratification & salinity"],
  ["forecast", "Short-horizon estimate"],
  ["data-lineage", "Data quality & lineage"],
  ["validation", "Validation"],
  ["limitations", "Limitations"],
  ["version", "Version"],
] as const;

const DATA = [
  ["Sea-surface temperature", "NOAA OISST v2.1 (AVHRR)", "NOAA NCEI", "0.25° daily", "model input"],
  ["Sea-surface salinity", "SMAP daily merged with bias-corrected SMOS", "NASA / ESA via NOAA CoastWatch", "0.25° daily", "model input"],
  ["Sea-level anomaly", "NOAA blended altimetry", "NOAA CoastWatch", "0.25° daily", "model input"],
  ["Surface currents", "Geostrophic currents from blended altimetry", "NOAA CoastWatch", "0.25° daily", "model input"],
  ["Surface winds", "NOAA NCEI Blended Seawinds v2", "NOAA NCEI", "0.25° daily", "model input"],
  ["Subsurface temperature", "HYCOM GOFS 3.1 analysis", "HYCOM consortium", "1/12° → 0.25°", "training target (2019–2021)"],
  ["Temperature profiles", "Argo GDAC (QC flags 1/2), via argopy", "Argo programme", "profiles", "validation, map overlay"],
  ["Gridded subsurface", "Met Office EN4", "Met Office Hadley Centre", "1° monthly", "independent cross-check"],
  ["Cyclone tracks", "IBTrACS v04r01 (North Indian)", "NOAA NCEI", "6-hourly", "event context"],
  ["Subsurface salinity (optional)", "GLORYS12V1 reanalysis", "Copernicus Marine Service", "1/12° → 0.25°", "salinity map below 0 m, halocline, T-S (only when configured)"],
];

function H({ id, n, children }: { id: string; n: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-6 font-display text-xl text-ink flex items-baseline gap-2">
      <span className="num text-[13px] text-ink-3">{n}</span> {children}
    </h2>
  );
}

export default function Methodology() {
  return (
    <div className="px-4 md:px-7 py-5 max-w-[1200px] w-full mx-auto grid lg:grid-cols-[180px_minmax(0,1fr)] gap-8">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-4 space-y-1">
          <div className="text-[11px] uppercase tracking-[0.12em] text-ink-3 mb-2">On this page</div>
          {TOC.map(([id, l]) => (
            <a key={id} href={`#${id}`} className="block text-[13px] text-ink-2 hover:text-ink py-0.5">
              {l}
            </a>
          ))}
        </div>
      </nav>

      <article className="space-y-10 text-[14.5px] leading-relaxed text-ink-2 min-w-0">
        <header id="overview" className="space-y-2">
          <div className="eyebrow">Learn</div>
          <h1 className="font-display text-2xl text-ink">Methodology</h1>
          <p>
            OceanSight reconstructs daily ocean temperature at 15 standard depths from the surface to 1000 m over the North Indian Ocean (5–30°N, 45–105°E) on a 0.25° grid,
            for 2019–2023, from satellite surface observations. It is a reconstruction of past states, not a forecast, and every value carries its provenance and uncertainty.
          </p>
          <PipelineFlow />
        </header>

        <section className="space-y-3">
          <H id="data" n={1}>
            Data
          </H>
          <div className="overflow-x-auto panel">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-ink-3 border-b border-line text-left">
                  <th className="font-normal px-3 py-2">Variable</th>
                  <th className="font-normal px-3">Dataset</th>
                  <th className="font-normal px-3">Provider</th>
                  <th className="font-normal px-3">Resolution</th>
                  <th className="font-normal px-3">Role in OceanSight</th>
                </tr>
              </thead>
              <tbody>
                {DATA.map(([v, d, p, r, role]) => (
                  <tr key={v + d} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-1.5 text-ink">{v}</td>
                    <td className="px-3">{d}</td>
                    <td className="px-3">{p}</td>
                    <td className="px-3 num">{r}</td>
                    <td className="px-3">{role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px]">
            Satellite salinity is available from 2010 (SMOS) and 2015 (SMAP) and the open HYCOM analysis from December 2018, which sets the 2019–2023 period. Training targets were
            sampled every third day (daily in May–June 2023); the model reconstructs every day because it needs only the surface inputs. Copernicus Marine / ERA5 equivalents are
            supported by the same ingestion interface.
          </p>
        </section>

        <section className="space-y-3">
          <H id="processing" n={2}>
            Processing
          </H>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>One adapter per source with cached, resumable downloads; unit harmonisation, physical-range checks and de-duplication.</li>
            <li>All fields regridded to a common 0.25° daily grid (100 × 240 cells): bilinear for coarser sources, area-weighted for finer ones.</li>
            <li>Seven surface channels (SST, SSS, SLA, geostrophic U/V, wind U/V) plus position and season; normalisation statistics from the training years only.</li>
            <li>Argo profiles interpolated to the 15 standard depths and matched to the reconstruction by day and grid cell.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <H id="reconstruction" n={3}>
            Reconstruction
          </H>
          <p>
            The production model is a <strong className="text-ink">U-Net encoder–decoder</strong> applied to the whole basin image each day. Its bottleneck, the <em>satellite
            embedding</em>, is a compact representation of the day&apos;s surface state. The decoder predicts each depth as a departure from a harmonic seasonal climatology,
            together with a per-depth uncertainty (heteroscedastic σ), calibrated after training against 2022 Argo profiles.
          </p>
          <p>
            Two baselines are trained on the same data for comparison: the <strong className="text-ink">seasonal climatology</strong> (annual + semi-annual harmonics per cell and
            depth) and <strong className="text-ink">LightGBM</strong> per depth on per-pixel features. A U-Net without the salinity channel measures what satellite salinity
            contributes.
          </p>
        </section>

        <section className="space-y-3">
          <H id="derived" n={4}>
            Derived products
          </H>
          <p>Calculated from the reconstructed column at every cell and day (provenance: derived):</p>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5 text-[13.5px]">
            {(
              [
                ["Mixed-layer depth (MLD)", "First depth below 10 m where temperature is 0.5 °C colder than at 10 m."],
                ["D20 / D26", "Depth of the 20 °C / 26 °C isotherm, interpolated between standard depths; undefined where not crossed."],
                ["Tropical Cyclone Heat Potential (TCHP)", "Heat content of water warmer than 26 °C, integrated from the surface to D26 (kJ/cm²)."],
                ["Anomaly", "Reconstructed temperature minus the seasonal climatology of the training years."],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-3">
          <H id="stratification" n={5}>
            Stratification &amp; salinity
          </H>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-ink">Thermocline</strong> (derived): the layer with the most negative vertical gradient dT/dz between consecutive valid levels of the reconstructed profile,
              below the mixed layer and above the chosen analysis depth. It is reported at the layer mid-point with the layer bounds as resolution — below 200 m the standard depths are
              100–300 m apart, so the depth is only coarsely known there. Weak, coarse, edge-of-range or ambiguous maxima are flagged <em>limited</em>; no maximum above 0.02 °C/m is
              reported as <em>insufficient</em>. D20 is an isotherm proxy and need not coincide with the gradient maximum.
            </li>
            <li>
              <strong className="text-ink">Salinity is not reconstructed.</strong> Surface salinity is the satellite SMAP/SMOS input; salinity profiles come from the nearest measured Argo
              profile (within 100 km and ±3 days), or from the optional GLORYS12V1 reanalysis when Copernicus Marine credentials are configured and the store is precomputed.
            </li>
            <li>
              Argo profiles pass QC flags 1/2 at the data server; the salinity views additionally apply the Argo real-time global-range and spike tests and average into 5 m bins, so
              instrument noise is not read as a gradient.
            </li>
            <li>
              <strong className="text-ink">Halocline</strong>: largest |dS/dz| of the measured (or reanalysis) salinity profile, with the same quality flags. <strong className="text-ink">T-S diagram</strong>:
              TEOS-10 via <code>gsw</code> — pressure from depth, Absolute Salinity, potential temperature and σ0; isopycnals are drawn in the same coordinates. Density mixed layer
              and barrier layer use the de Boyer Montégut et al. (2004) thresholds (0.03 kg/m³, 0.2 °C).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <H id="forecast" n={6}>
            Short-horizon estimate
          </H>
          <p>
            The T+1 / T+2 day estimate on the Timeline is <strong className="text-ink">not a trained forecast model</strong>. It extrapolates OceanSight&apos;s own reconstructed daily series at one
            cell, using only days up to the issue date: either a least-squares trend over the last 7 days, or persistence. Its error is estimated by re-running the same method over the
            preceding 60 days at that cell (hindcast RMSE against the reconstruction), combined in quadrature with the reconstruction&apos;s calibrated σ. With too little history the
            service returns <code>insufficient_forecast_history</code> instead of a number.
          </p>
        </section>

        <section className="space-y-3">
          <H id="data-lineage" n={7}>
            Data quality &amp; lineage
          </H>
          <p>
            Every value is classified as measured, satellite, reanalysis, reconstructed, derived, estimated, forecast or baseline. The{" "}
            <Link href="/data-quality" className="text-accent hover:underline">
              data-quality workspace
            </Link>{" "}
            reports the pipeline&apos;s own QC records (gap-filling, rejected values, coverage), and{" "}
            <Link href="/provenance" className="text-accent hover:underline">
              sources &amp; lineage
            </Link>{" "}
            traces each variable from source to screen.
          </p>
        </section>

        <section className="space-y-3">
          <H id="validation" n={8}>
            Validation
          </H>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Whole-year split: training 2019–2021, tuning 2022 (early stopping and σ calibration), independent test 2023 — no random day splits, which would leak autocorrelation.</li>
            <li>Every 2023 Argo profile is compared with the reconstruction for its day and 0.25° cell at each standard depth: RMSE, bias, correlation, and skill against the climatology.</li>
            <li>Uncertainty is checked by coverage: the share of observations inside ±1σ and ±2σ.</li>
            <li>A monthly comparison with Met Office EN4 provides a second, gridded reference.</li>
          </ul>
          <p>
            <Link href="/validation" className="text-accent hover:underline">
              See the evidence →
            </Link>
          </p>
        </section>

        <section className="space-y-3">
          <H id="limitations" n={9}>
            Limitations
          </H>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>The training target assimilates Argo. Held-out floats are independent of OceanSight&apos;s training but not fully independent of that product.</li>
            <li>OceanSight reconstructs 2019–2023; skill outside this period and region is not established. The optional T+1/T+2 estimate is a statistical extrapolation within the record, not a forecast model.</li>
            <li>Salinity is never reconstructed: subsurface salinity comes from measured profiles or, when configured, a reanalysis; the thermocline on standard depths is only as precise as their spacing.</li>
            <li>Values are 0.25° cell averages; comparisons with point measurements include representativeness error.</li>
            <li>Removing satellite salinity does not measurably change skill in this version; the barrier-layer indicator is therefore shown as an estimate only.</li>
            <li>Cyclone views describe the ocean along observed tracks; they do not predict storm intensity or establish cause and effect.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <H id="version" n={10}>
            Version
          </H>
          <ModelVersion />
        </section>
      </article>
    </div>
  );
}
