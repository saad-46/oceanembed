"""Surface-current adapter. Primary: CMEMS GlobCurrent total (Ekman+geostrophic) currents
(credentialed). Open fallback: NOAA blended-altimetry geostrophic currents.

Note: the open fallback is geostrophic only; the Ekman part is wind-driven and the
wind channels are separate model inputs, so the model still sees that forcing.
"""
from ml.ingestion.base import Provenance
from ml.ingestion.copernicus import CopernicusMarineAdapter, cmems_provenance, select_adapter
from ml.ingestion.erddap import ErddapGridAdapter


class GlobCurrent(CopernicusMarineAdapter):
    provenance = cmems_provenance("currents", "CMEMS GlobCurrent total surface currents",
                                  "cmems_obs-mob_glo_phy-cur_my_0.25deg_P1D-m",
                                  "MULTIOBS_GLO_PHY_MYNRT_015_003", "0.25 deg daily")
    variables = ("uo", "vo")
    rename = {"uo": "ucur", "vo": "vcur"}
    depth_range = (0.0, 1.0)


class NoaaGeostrophicCurrents(ErddapGridAdapter):
    provenance = Provenance(
        source_key="currents", product="NOAA blended-altimetry geostrophic surface currents",
        provider="NOAA CoastWatch ERDDAP", dataset_id="noaacwBLENDEDNRTcurrentsDaily",
        url="https://coastwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.html",
        license="Public domain (NOAA)", native_resolution="0.25 deg daily", requires_credentials=False,
    )
    server = "https://coastwatch.noaa.gov"
    variables = ("u_current", "v_current")
    rename = {"u_current": "ucur", "v_current": "vcur"}


def get_adapter():
    return select_adapter(GlobCurrent(), NoaaGeostrophicCurrents())
