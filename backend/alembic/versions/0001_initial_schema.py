"""initial schema (docs/14_DATABASE_SCHEMA.md)

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "region",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.Text, nullable=False, unique=True),
        sa.Column("bbox", Geometry("POLYGON", srid=4326, spatial_index=False), nullable=False),
    )
    op.create_index("idx_region_bbox", "region", ["bbox"], postgresql_using="gist")

    op.create_table(
        "model_registry",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.Text, nullable=False, unique=True),
        sa.Column("architecture", sa.Text, nullable=False),
        sa.Column("inputs", ARRAY(sa.Text), nullable=False, server_default="{}"),
        sa.Column("training_period_start", sa.Date),
        sa.Column("training_period_end", sa.Date),
        sa.Column("checkpoint_path", sa.Text),
        sa.Column("is_production", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("details", JSONB, nullable=False, server_default="{}"),
    )
    # At most one production model (API default).
    op.create_index("uq_model_registry_production", "model_registry", ["is_production"], unique=True,
                    postgresql_where=sa.text("is_production"))

    op.create_table(
        "daily_product",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("grid_path", sa.Text, nullable=False),
        sa.Column("model_version_id", sa.Integer, sa.ForeignKey("model_registry.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_cached_demo", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("date", "model_version_id"),
    )
    op.create_index("idx_daily_product_date", "daily_product", ["date"])

    op.create_table(
        "argo_profile",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("platform_number", sa.String(16), nullable=False),
        sa.Column("cycle_number", sa.Integer, nullable=False),
        sa.Column("profile_date", sa.DateTime, nullable=False),
        sa.Column("location", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("depths_m", ARRAY(sa.Float), nullable=False),
        sa.Column("temperature_c", ARRAY(sa.Float), nullable=False),
        sa.Column("salinity_psu", ARRAY(sa.Float), nullable=False),
        sa.Column("temp_std_c", ARRAY(sa.Float), nullable=False),
        sa.Column("data_mode", sa.String(4)),
        sa.Column("split", sa.String(8), nullable=False),
        sa.Column("used_in_training", sa.Boolean, nullable=False),
        sa.UniqueConstraint("platform_number", "cycle_number"),
        sa.CheckConstraint("split IN ('train','val','test','other')", name="ck_argo_split"),
        sa.CheckConstraint("cardinality(depths_m) = cardinality(temperature_c)", name="ck_argo_aligned"),
    )
    op.create_index("idx_argo_profile_location", "argo_profile", ["location"], postgresql_using="gist")
    op.create_index("idx_argo_profile_date", "argo_profile", ["profile_date"])
    op.create_index("idx_argo_profile_platform", "argo_profile", ["platform_number"])
    op.create_index("idx_argo_profile_split", "argo_profile", ["split"])
    op.create_index("idx_argo_profile_used", "argo_profile", ["used_in_training"])

    op.create_table(
        "prediction_at_argo",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("argo_profile_id", sa.Integer, sa.ForeignKey("argo_profile.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model_version_id", sa.Integer, sa.ForeignKey("model_registry.id", ondelete="CASCADE"), nullable=False),
        sa.Column("predicted_temperature_c", ARRAY(sa.Float), nullable=False),
        sa.Column("predicted_uncertainty_c", ARRAY(sa.Float)),
        sa.Column("distance_km", sa.Float, nullable=False),
        sa.Column("date_offset_days", sa.Integer, nullable=False),
        sa.Column("rmse_c", sa.Float),
        sa.Column("n_levels", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("argo_profile_id", "model_version_id"),
    )
    op.create_index("idx_prediction_argo_profile", "prediction_at_argo", ["argo_profile_id"])

    op.create_table(
        "skill_metric",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("model_version_id", sa.Integer, sa.ForeignKey("model_registry.id", ondelete="CASCADE"), nullable=False),
        sa.Column("evaluation", sa.Text, nullable=False),
        sa.Column("split", sa.Text, nullable=False),
        sa.Column("depth_m", sa.Float, nullable=False),
        sa.Column("rmse_c", sa.Float),
        sa.Column("bias_c", sa.Float),
        sa.Column("correlation", sa.Float),
        sa.Column("n_obs", sa.Integer, nullable=False),
        sa.Column("clim_rmse_c", sa.Float),
        sa.Column("skill_vs_climatology", sa.Float),
        sa.Column("held_out_period_start", sa.Date),
        sa.Column("held_out_period_end", sa.Date),
        sa.CheckConstraint("evaluation IN ('argo_independent','grid_target')", name="ck_skill_evaluation"),
    )
    op.create_index("idx_skill_metric_model_version_id", "skill_metric", ["model_version_id"])
    op.create_index("idx_skill_metric_lookup", "skill_metric", ["model_version_id", "evaluation", "split"])

    op.create_table(
        "cyclone_track",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("sid", sa.Text, nullable=False, unique=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("season", sa.Integer, nullable=False),
        sa.Column("peak_category", sa.Text),
    )
    op.create_table(
        "track_point",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("cyclone_track_id", sa.Integer, sa.ForeignKey("cyclone_track.id", ondelete="CASCADE"), nullable=False),
        sa.Column("location", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("observed_at", sa.DateTime, nullable=False),
        sa.Column("category", sa.Text),
        sa.Column("grade", sa.String(8)),
        sa.Column("wind_kt", sa.Float),
    )
    op.create_index("idx_track_point_track", "track_point", ["cyclone_track_id"])
    op.create_index("idx_track_point_location", "track_point", ["location"], postgresql_using="gist")


def downgrade():
    for t in ("track_point", "cyclone_track", "skill_metric", "prediction_at_argo", "argo_profile",
              "daily_product", "model_registry", "region"):
        op.drop_table(t)
