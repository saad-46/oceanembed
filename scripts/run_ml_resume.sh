#!/usr/bin/env bash
# Resume the ML chain after the U-Net: ablation -> evaluate -> precompute -> Argo validation.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-.venv/Scripts/python}
export PYTHONUNBUFFERED=1 PYTHONWARNINGS=ignore
[ -f ml/data/models/cnn-unet-nosss-v1/model.pt ] || $PY -m ml.models.train unet --epochs "${1:-25}" --no-sss
$PY -m ml.models.train evaluate
$PY -m ml.inference.precompute
$PY -m ml.evaluation.argo_validation
echo "ML CHAIN DONE"
