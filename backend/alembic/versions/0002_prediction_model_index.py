"""index prediction_at_argo by model and rmse (Validation table sort)

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("idx_prediction_model_rmse", "prediction_at_argo", ["model_version_id", "rmse_c"])


def downgrade():
    op.drop_index("idx_prediction_model_rmse", table_name="prediction_at_argo")
