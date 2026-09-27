"""Single source of truth for the OceanEmbed / GAHAN domain definition.

Everything here is fixed by the official problem statement (SIH26066, docs/01):
North Indian Ocean 5-30N, 45-105E, 0.25 deg, daily, 15 standard depths.
This module only depends on numpy so the backend can import it without
pulling in the ML stack.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

# --- Domain (official PS) ---------------------------------------------------
LAT_MIN, LAT_MAX = 5.0, 30.0
LON_MIN, LON_MAX = 45.0, 105.0
RES = 0.25

# Cell-centre coordinates of the common target grid: 100 x 240 cells.
# Centres sit at .125 offsets so every cell lies fully inside the PS box.
LATS = np.round(np.arange(LAT_MIN + RES / 2, LAT_MAX, RES), 4)
LONS = np.round(np.arange(LON_MIN + RES / 2, LON_MAX, RES), 4)
NLAT, NLON = LATS.size, LONS.size  # 100, 240

STANDARD_DEPTHS = np.array(
    [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000], dtype=float
)
NDEPTH = STANDARD_DEPTHS.size

# Input channels, in the fixed order the models expect (docs/09 feature engineering).
INPUT_VARS = ["sst", "sss", "sla", "ucur", "vcur", "uwind", "vwind"]

# --- Study period -------------------------------------------------------------
# Constrained by: SMAP SSS (2015-04+) and the open HYCOM GLBy0.08/expt_93.0
# analysis used as the training target (2018-12 .. 2024-09). See
# docs/DECISIONS.md D-002 / D-003.
STUDY_START = date(2019, 1, 1)
STUDY_END = date(2023, 12, 31)
TRAIN_YEARS = (2019, 2020, 2021)
VAL_YEARS = (2022,)
TEST_YEARS = (2023,)  # held out entirely; scored against independent Argo floats


@dataclass(frozen=True)
class Region:
    name: str
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float


REGIONS = [
    Region("Full Domain", LAT_MIN, LAT_MAX, LON_MIN, LON_MAX),
    Region("Bay of Bengal", 5.0, 22.0, 80.0, 100.0),
    Region("Arabian Sea", 5.0, 25.0, 50.0, 77.0),
]

# --- Paths ------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("OCEANEMBED_DATA_DIR", REPO_ROOT / "ml" / "data"))
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
OUTPUT_DIR = DATA_DIR / "outputs"
MODEL_DIR = DATA_DIR / "models"


def in_domain(lat: float, lon: float) -> bool:
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def nearest_cell(lat: float, lon: float) -> tuple[int, int]:
    """Index of the grid cell containing (lat, lon)."""
    i = int(np.clip(np.floor((lat - LAT_MIN) / RES), 0, NLAT - 1))
    j = int(np.clip(np.floor((lon - LON_MIN) / RES), 0, NLON - 1))
    return i, j
