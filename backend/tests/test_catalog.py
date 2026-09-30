"""The lineage catalog must describe the sources the pipeline adapters actually declare (no invented names)."""
from dataclasses import asdict

import pytest

from app.services.catalog import DECLARED

FIELDS = ("product", "provider", "dataset_id", "url", "native_resolution")


def _adapters():
    from ml.ingestion import fetch_argo, fetch_currents, fetch_cyclones, fetch_glorys, fetch_sla, fetch_sss, fetch_sst, fetch_winds

    return {"sst": fetch_sst.get_adapter().provenance, "sss": fetch_sss.get_adapter().provenance,
            "sla": fetch_sla.NoaaBlendedSLA.provenance, "currents": fetch_currents.get_adapter().provenance,
            "winds": fetch_winds.NceiBlendedWinds.provenance, "target": fetch_glorys.HycomTarget.provenance,
            "argo": fetch_argo.PROVENANCE, "cyclones": fetch_cyclones.PROVENANCE, "salinity": fetch_glorys.GlorysSalinity.provenance}


@pytest.mark.parametrize("key", ["sst", "sss", "sla", "currents", "winds", "target", "argo", "cyclones", "salinity"])
def test_declared_matches_adapter(key, monkeypatch):
    for k in ("COPERNICUSMARINE_SERVICE_USERNAME", "COPERNICUSMARINE_SERVICE_PASSWORD", "COPERNICUS_MARINE_USERNAME",
              "COPERNICUS_MARINE_PASSWORD", "CDS_API_KEY"):
        monkeypatch.delenv(k, raising=False)  # the open fallbacks are what the current model uses
    p = asdict(_adapters()[key])
    assert {f: DECLARED[key][f] for f in FIELDS} == {f: p[f] for f in FIELDS}


def test_qc_rules_are_the_pipeline_rules():
    from ml import qc_rules
    from ml.ingestion import fetch_argo
    from ml.pipeline import clean

    assert clean.VALID_RANGE is qc_rules.VALID_RANGE and clean.MAX_GAP_DAYS == qc_rules.MAX_GAP_DAYS
    assert fetch_argo.MAX_BRACKET_GAP is qc_rules.MAX_BRACKET_GAP
