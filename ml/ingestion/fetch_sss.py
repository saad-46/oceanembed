"""SSS adapter. Primary: CMEMS Multi-Obs SSS (credentialed). Open fallback: NOAA SMAP SSS.

Hard physical constraint (docs/04 section 2): satellite SSS only exists from 2010
(SMOS) / 2015 (SMAP); the study period starts in 2019 for this reason (D-003).
"""
from ml.ingestion.base import Provenance, SourceAdapter
from ml.ingestion.copernicus import CopernicusMarineAdapter, cmems_provenance, select_adapter
from ml.ingestion.erddap import ErddapGridAdapter


class MultiObsSSS(CopernicusMarineAdapter):
    provenance = cmems_provenance("sss", "CMEMS Multi-Obs SSS", "cmems_obs-mob_glo_phy-sss_my_multi_P1D",
                                  "MULTIOBS_GLO_PHY_S_SURFACE_MYNRT_015_013", "0.125 deg daily")
    variables = ("sos",)
    rename = {"sos": "sss"}


class SmapSSS(ErddapGridAdapter):
    provenance = Provenance(
        source_key="sss", product="SMAP SSS (NOAA NRT, 0.25 deg)", provider="NOAA CoastWatch/OceanWatch ERDDAP",
        dataset_id="noaacwSMAPsssDaily",
        url="https://coastwatch.noaa.gov/erddap/griddap/noaacwSMAPsssDaily.html",
        license="Public domain (NOAA)", native_resolution="0.25 deg daily", requires_credentials=False,
    )
    server = "https://coastwatch.noaa.gov"
    variables = ("sss",)
    extra_dims = (("altitude", 0.0),)


class SmosSSS3day(ErddapGridAdapter):
    provenance = Provenance(
        source_key="sss", product="SMOS SSS 3-day composite (NOAA NRT, 0.25 deg)", provider="NOAA CoastWatch ERDDAP",
        dataset_id="noaacwSMOSsss3day",
        url="https://coastwatch.noaa.gov/erddap/griddap/noaacwSMOSsss3day.html",
        license="Public domain (NOAA)", native_resolution="0.25 deg, 3-day composite", requires_credentials=False,
    )
    server = "https://coastwatch.noaa.gov"
    variables = ("sss",)
    extra_dims = (("altitude", 0.0),)


class MergedOpenSSS(SourceAdapter):
    """Two-sensor open SSS: SMAP daily (primary) with swath/day gaps filled from the SMOS
    3-day composite after removing the per-cell SMOS-minus-SMAP median bias.

    Daily SMAP alone leaves ~60% of ocean cell-days empty in this domain; merging a second
    L-band sensor is physically far better than filling those gaps by interpolation alone.
    """
    provenance = Provenance(
        source_key="sss", product="SMAP daily + bias-corrected SMOS 3-day (merged, NOAA NRT)",
        provider="NOAA CoastWatch ERDDAP", dataset_id="merged_smap_smos",
        url="https://coastwatch.noaa.gov/erddap/griddap/noaacwSMAPsssDaily.html",
        license="Public domain (NOAA)", native_resolution="0.25 deg daily", requires_credentials=False,
    )

    def fetch(self, start, end, bbox=None):
        import numpy as np
        import pandas as pd
        from ml.ingestion.base import DEFAULT_BBOX
        bbox = bbox or DEFAULT_BBOX
        days = pd.date_range(start, end, freq="D")
        smap = SmapSSS().fetch(start, end, bbox)
        smap = smap.isel(time=np.unique(smap.time.values, return_index=True)[1]).reindex(time=days)
        smos = SmosSSS3day().fetch(start - pd.Timedelta(days=2), end + pd.Timedelta(days=2), bbox)
        smos = smos.isel(time=np.unique(smos.time.values, return_index=True)[1])
        smos = smos.reindex(time=days, method="nearest", tolerance=pd.Timedelta(days=1))
        smos = smos.reindex_like(smap, method="nearest", tolerance=0.01)
        a, b = smap["sss"].values, smos["sss"].values
        both = np.isfinite(a) & np.isfinite(b)
        diff = np.where(both, b - a, np.nan)
        bias = np.nanmedian(diff, axis=0)
        bias = np.where(np.isfinite(bias), bias, np.nanmedian(diff))
        fill = ~np.isfinite(a) & np.isfinite(b)
        merged = np.where(fill, b - bias[None], a)
        ds = smap.copy()
        ds["sss"] = (smap["sss"].dims, merged.astype("float32"))
        ds.attrs.update(self.provenance.as_attrs())
        ds.attrs["prov_merge_frac_from_smos"] = f"{fill.sum() / max(np.isfinite(merged).sum(), 1):.3f}"
        ds.attrs["prov_smos_minus_smap_median_bias_psu"] = f"{float(np.nanmedian(diff)):.3f}"
        return ds


def get_adapter():
    return select_adapter(MultiObsSSS(), MergedOpenSSS())
