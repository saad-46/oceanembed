"""SSS adapter. Primary: CMEMS Multi-Obs SSS (credentialed). Open fallback: NOAA SMAP SSS.

Hard physical constraint (docs/04 section 2): satellite SSS only exists from 2010
(SMOS) / 2015 (SMAP); the study period starts in 2019 for this reason (D-003).
"""
from ml.ingestion.base import Provenance
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


def get_adapter():
    return select_adapter(MultiObsSSS(), SmapSSS())
