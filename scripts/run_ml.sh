#!/usr/bin/env bash
# Full ML chain after `build_dataset assemble`. Usage: bash scripts/run_ml.sh [unet_epochs] [nosss_epochs]
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-.venv/Scripts/python}
E1=${1:-35}; E2=${2:-25}
export PYTHONUNBUFFERED=1 PYTHONWARNINGS=ignore
$PY -m ml.models.train lightgbm
$PY -m ml.models.train unet --epochs "$E1"
$PY -m ml.models.train unet --epochs "$E2" --no-sss
$PY -m ml.models.train evaluate
$PY -m ml.inference.precompute
$PY -m ml.evaluation.argo_validation
$PY -m ml.evaluation.calibrate_uncertainty
$PY -m ml.evaluation.en4_crosscheck || echo "EN4 cross-check skipped (download EN4 zips into ml/data/raw/en4)"
echo "ML CHAIN DONE"
