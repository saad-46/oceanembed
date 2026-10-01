# Optional: the API image with the data bundle baked in, for hosts without a persistent disk.
# Build context: repository root, after `python scripts/make_deploy_bundle.py` has written deploy_data/.
#   docker build -f docker/backend.Dockerfile -t oceansight-api .
#   docker build -f docker/backend-data.Dockerfile -t oceansight-api-data .
ARG BASE=oceansight-api
FROM ${BASE}
COPY --chown=api deploy_data /data
