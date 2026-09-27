"""SST adapter. Primary: CMEMS OSTIA (credentialed). Open fallback: NOAA OISST v2.1."""
from ml.ingestion.base import Provenance
from ml.ingestion.copernicus import CopernicusMarineAdapter, cmems_provenance, select_adapter
from ml.ingestion.erddap import ErddapGridAdapter


class OstiaSST(CopernicusMarineAdapter):
    provenance = cmems_provenance("sst", "OSTIA SST L4 (reprocessed)", "METOFFICE-GLO-SST-L4-REP-OBS-SST",
                                  "SST_GLO_SST_L4_REP_OBSERVATIONS_010_011", "0.05 deg daily")
    variables = ("analysed_sst",)
    rename = {"analysed_sst": "sst"}  # Kelvin -> converted to degC in ml.pipeline.clean


class OisstSST(ErddapGridAdapter):
    provenance = Provenance(
        source_key="sst", product="NOAA OISST v2.1 (AVHRR-only)", provider="NOAA NCEI via CoastWatch ERDDAP",
        dataset_id="ncdcOisst21Agg_LonPM180",
        url="https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180.html",
        license="Public domain (NOAA)", native_resolution="0.25 deg daily", requires_credentials=False,
    )
    server = "https://coastwatch.pfeg.noaa.gov"
    variables = ("sst",)
    extra_dims = (("zlev", 0.0),)


def get_adapter():
    return select_adapter(OstiaSST(), OisstSST())
