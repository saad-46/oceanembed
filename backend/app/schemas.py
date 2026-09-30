"""Pydantic response models for the analysis, dataset and lineage endpoints.

Every scientific payload carries a ``provenance`` block whose ``classification`` is one of the
labels used consistently across OceanSight (API, web app, reports, exports):

* ``measured``      - direct in-situ observation (Argo floats; IBTrACS best-track positions)
* ``satellite``     - satellite-derived observation product (gap-filled L3/L4 fields)
* ``reanalysis``    - data-assimilative ocean model analysis / reanalysis (HYCOM, GLORYS, EN4 analysis)
* ``reconstructed`` - OceanSight model output
* ``derived``       - deterministic calculation from one of the above
* ``estimated``     - statistical estimate with extra assumptions (uncertainty, error estimates)
* ``forecast``      - an extrapolation beyond the issue date (never a trained forecast model here)
* ``baseline``      - reference used for comparison (seasonal climatology)
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Classification = Literal["measured", "satellite", "reanalysis", "reconstructed", "derived", "estimated", "forecast", "baseline"]
Quality = Literal["good", "limited", "insufficient"]


class ProvenanceInfo(BaseModel):
    classification: Classification
    source: str
    dataset: str | None = None
    model_version: str | None = None
    method: str | None = None
    note: str | None = None
    lineage_id: str | None = Field(None, description="Row id in GET /v1/provenance")


class GridValues(BaseModel):
    lat: list[float]
    lon: list[float]
    values: list[list[float | None]]


class GridStats(BaseModel):
    min: float
    max: float
    mean: float


class LayerGrid(BaseModel):
    date: str
    requested_date: str
    variable: str
    depth_m: float | None
    units: str
    grid: GridValues
    stats: GridStats | None
    source: str
    data_label: str
    model_version: str
    notice: str | None
    provenance: ProvenanceInfo


class WindVector(BaseModel):
    lat: float
    lon: float
    u_ms: float
    v_ms: float
    speed_ms: float
    direction_from_deg: float


class WindVectors(BaseModel):
    date: str
    requested_date: str
    stride: int
    vectors: list[WindVector]
    units: str = "m/s"
    direction_convention: str
    notice: str | None
    provenance: ProvenanceInfo


# ---------------------------------------------------------------- stratification
class GradientLayer(BaseModel):
    top_m: float
    bottom_m: float
    depth_m: float
    gradient: float


class GradientPeak(BaseModel):
    variable: str
    depth_m: float | None
    depth_range_m: list[float] | None
    gradient_per_m: float | None = Field(None, description="Signed dv/dz of the peak layer, z positive downward")
    strength_per_m: float | None
    quality: Quality
    quality_reasons: list[str]
    n_levels_used: int
    analysis_range_m: list[float]
    gradient_profile: list[GradientLayer]
    method: str
    sense: str | None = None


class ArgoRef(BaseModel):
    id: int | None
    platform_number: str
    cycle_number: int
    profile_date: str
    lat: float
    lon: float
    distance_km: float
    date_offset_days: int
    split: str
    independent: bool
    data_mode: str | None = None


class NativeQC(BaseModel):
    n_input: int
    n_failed_range: int
    n_failed_spike: int


class MixedLayers(BaseModel):
    mld_density_m: float | None
    isothermal_layer_depth_m: float | None
    barrier_layer_thickness_m: float | None
    method: str


class ObservedStructure(BaseModel):
    argo: ArgoRef
    bin_m: float
    depths_m: list[float]
    temperature_c: list[float | None]
    salinity_psu: list[float | None] | None
    thermocline: GradientPeak | None
    halocline: GradientPeak | None
    mixed_layers: MixedLayers | None
    qc: dict[str, NativeQC]
    provenance: ProvenanceInfo


class ReconstructedStructure(BaseModel):
    depths_m: list[float]
    temperature_c: list[float | None]
    uncertainty_c: list[float | None] | None
    thermocline: GradientPeak
    mld_m: float | None
    d20_m: float | None
    d26_m: float | None
    provenance: ProvenanceInfo


class ReanalysisSalinity(BaseModel):
    date: str
    depths_m: list[float]
    salinity_psu: list[float | None]
    potential_temperature_c: list[float | None]
    halocline: GradientPeak
    provenance: ProvenanceInfo


class SourceStatus(BaseModel):
    status: Literal["available", "none_nearby", "no_salinity", "lookup_unavailable", "not_configured", "not_precomputed", "no_data"]
    detail: str


class Stratification(BaseModel):
    date: str
    requested_date: str
    lat: float
    lon: float
    cell: dict[str, float]
    max_depth_m: float
    notice: str | None
    reconstructed: ReconstructedStructure
    observed: ObservedStructure | None
    observed_status: SourceStatus
    reanalysis_salinity: ReanalysisSalinity | None
    reanalysis_status: SourceStatus
    diagnostics: dict[str, str]


# ---------------------------------------------------------------- T-S
class TSPoint(BaseModel):
    depth_m: float
    temperature_c: float
    salinity_psu: float
    potential_temperature_c: float
    sigma0_kg_m3: float


class TSSeries(BaseModel):
    label: str
    date: str
    points: list[TSPoint]
    argo: ArgoRef | None = None
    mixed_layers: MixedLayers | None = None
    provenance: ProvenanceInfo


class Isopycnal(BaseModel):
    sigma0: float
    points: list[list[float]]


class TSProfile(BaseModel):
    date: str
    lat: float
    lon: float
    observed: TSSeries | None
    observed_status: SourceStatus
    reanalysis: TSSeries | None
    reanalysis_status: SourceStatus
    isopycnals: list[Isopycnal]
    axes: dict[str, str]
    reconstructed_note: str
    method: str


# ---------------------------------------------------------------- forecast
class ForecastHorizon(BaseModel):
    horizon_days: int
    target_date: str
    temperature_c: list[float | None]
    uncertainty_c: list[float | None]
    method_rmse_c: list[float | None]
    persistence_c: list[float | None]
    persistence_rmse_c: list[float | None]
    n_hindcast_pairs: int
    verification_c: list[float | None] | None = Field(None, description="Reconstruction for the target day, when inside the record")


class Forecast(BaseModel):
    issue_date: str
    requested_date: str
    lat: float
    lon: float
    cell: dict[str, float]
    depths_m: list[float]
    method: Literal["trend", "persistence"]
    method_label: str
    window_days: int
    input_period: dict[str, str | int]
    hindcast_days: int
    issue_temperature_c: list[float | None]
    reconstruction_uncertainty_c: list[float | None] | None
    horizons: list[ForecastHorizon]
    limitations: list[str]
    notice: str | None
    provenance: ProvenanceInfo


# ---------------------------------------------------------------- 3-D
class VolumeSample(BaseModel):
    date: str
    requested_date: str
    variable: str
    units: str
    bbox: dict[str, float]
    depths_m: list[float]
    stride: int
    max_points: int
    n_points: int
    lat: list[float]
    lon: list[float]
    depth: list[float]
    value: list[float]
    stats: GridStats | None
    notice: str | None
    provenance: ProvenanceInfo


# ---------------------------------------------------------------- data quality & lineage
class DatasetQuality(BaseModel):
    id: str
    name: str
    classification: Classification
    status: Quality | None
    status_reason: str
    metrics: dict


class InputQuality(BaseModel):
    variable: str
    source: str | None
    n_ocean_values: int | None
    missing_before_fill: int | None
    missing_before_fill_pct: float | None
    filled_temporal: int | None
    filled_spatial: int | None
    filled_pct: float | None
    invalid_flagged: int | None
    duplicate_times: int | None
    days_absent_in_source: int | None
    valid_range: list[float | None]
    status: Quality
    status_reason: str


class QCRule(BaseModel):
    step: str
    rule: str
    applies_to: str


class DataQuality(BaseModel):
    datasets: list[DatasetQuality]
    inputs: list[InputQuality]
    argo: dict | None
    thresholds: dict
    qc_rules: list[QCRule]
    files: list[str]


class LineageStep(BaseModel):
    stage: str
    detail: str


class Availability(BaseModel):
    status: str
    detail: str


class LineageRow(BaseModel):
    id: str
    variable: str
    classification: Classification
    provider: str
    dataset: str
    url: str
    native_resolution: str
    recorded: bool = Field(description="True when the source was recorded by the pipeline with the data actually used")
    resolution: str
    temporal_coverage: str
    depth_coverage: str
    processing: list[str] | str
    role: str
    availability: Availability
    lineage: list[LineageStep]
    shown_in: list[str]


class Lineage(BaseModel):
    classifications: dict[str, str]
    variables: list[LineageRow]
    optional_sources: dict[str, dict[str, str]]
    model_version: str | None
