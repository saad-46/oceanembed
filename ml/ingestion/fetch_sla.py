"""SLA adapter. Primary: CMEMS DUACS L4 (credentialed). Open fallback: NOAA blended altimetry SLA."""
from ml.ingestion.base import Provenance
from ml.ingestion.copernicus import CopernicusMarineAdapter, cmems_provenance, select_adapter
from ml.ingestion.erddap import ErddapGridAdapter


class DuacsSLA(CopernicusMarineAdapter):
    provenance = cmems_provenance("sla", "DUACS L4 SLA (all-sat)", "cmems_obs-sl_glo_phy-ssh_my_allsat-l4-duacs-0.125deg_P1D",
                                  "SEALEVEL_GLO_PHY_L4_MY_008_047", "0.125 deg daily")
    variables = ("sla",)


class NoaaBlendedSLA(ErddapGridAdapter):
    provenance = Provenance(
        source_key="sla", product="NOAA blended altimetry SLA (S-3A/B, CryoSat-2, Jason-2/3, SARAL)",
        provider="NOAA CoastWatch ERDDAP", dataset_id="noaacwBLENDEDsshDaily",
        url="https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDsshDaily.html",
        license="Public domain (NOAA)", native_resolution="0.25 deg daily", requires_credentials=False,
    )
    server = "https://coastwatch.noaa.gov"
    variables = ("sla",)


def get_adapter():
    return select_adapter(DuacsSLA(), NoaaBlendedSLA())
