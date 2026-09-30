"""Quality-control rules of the data pipeline, in one dependency-free place.

The pipeline (``ml.pipeline.clean``, ``ml.ingestion.fetch_argo``, ``ml.pipeline.feature_engineering``)
applies these rules, and the API's Data Quality workspace reports them, so the documentation
shown to users can never drift from what the pipeline actually does.
"""

# --- satellite surface inputs (ml.pipeline.clean) ------------------------------------------
MAX_GAP_DAYS = 7  # temporal linear interpolation fills gaps up to this many days
# Physically plausible ranges: values outside are flagged, counted and set to missing.
VALID_RANGE = {
    "sst": (-2.0, 40.0),     # degC
    "sss": (0.0, 45.0),      # PSU
    "sla": (-2.0, 2.0),      # m
    "ucur": (-5.0, 5.0),     # m/s
    "vcur": (-5.0, 5.0),
    "uwind": (-60.0, 60.0),  # m/s
    "vwind": (-60.0, 60.0),
}
OCEAN_MASK_MIN_VALID_SST = 0.5  # a cell is ocean if SST is valid on more than half of the days

# --- training target (ml.pipeline.feature_engineering) -------------------------------------
TARGET_MASK_MIN_VALID = 0.9  # a (depth, cell) is reconstructed if the target is valid on >= 90 % of days

# --- Argo profiles (ml.ingestion.fetch_argo) -----------------------------------------------
ARGO_ACCEPTED_QC_FLAGS = (1, 2)  # "good" and "probably good" (argopy 'standard' mode / ERDDAP filter)
# Largest allowed distance (m) between the two measurements bracketing a standard depth, by depth.
MAX_BRACKET_GAP = {0: 10, 50: 25, 100: 50, 300: 100, 700: 200, 1000: 250}
ARGO_SURFACE_MAX_OFFSET_M = 6.0  # the 0 m value uses the shallowest sample if it is within 6 m
ARGO_MIN_LEVELS = 3
