# Build context: repository root. The API needs only the numpy-level `ml` helpers, not torch/lightgbm.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY ml/__init__.py ml/config.py ml/qc_rules.py ml/
COPY ml/science ml/science
COPY ml/evaluation/__init__.py ml/evaluation/derived_products.py ml/evaluation/
COPY ml/pipeline/__init__.py ml/pipeline/feature_engineering.py ml/pipeline/
COPY backend backend
# Precomputed data: mount at /data (docker compose) or bake a bundle from scripts/make_deploy_bundle.py:
#   COPY deploy_data /data
ENV OCEANEMBED_DATA_DIR=/data
WORKDIR /srv/backend
RUN useradd -m api && chown -R api /srv
USER api
EXPOSE 8100
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health')" || exit 1
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8100}"]
