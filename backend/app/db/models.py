"""PostgreSQL + PostGIS schema (docs/14_DATABASE_SCHEMA.md).

The database holds metadata, validation records and pointers; gridded arrays live in
Zarr stores on disk / object storage (docs/08 section 4).
"""
from __future__ import annotations

from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import (ARRAY, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Region(Base):
    __tablename__ = "region"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    bbox = mapped_column(Geometry("POLYGON", srid=4326, spatial_index=False), nullable=False)


class ModelRegistry(Base):
    __tablename__ = "model_registry"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    architecture: Mapped[str] = mapped_column(Text)
    inputs: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    training_period_start: Mapped[date | None] = mapped_column(Date)
    training_period_end: Mapped[date | None] = mapped_column(Date)
    checkpoint_path: Mapped[str | None] = mapped_column(Text)
    is_production: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    details: Mapped[dict] = mapped_column(JSONB, default=dict)


class DailyProduct(Base):
    __tablename__ = "daily_product"
    __table_args__ = (UniqueConstraint("date", "model_version_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    grid_path: Mapped[str] = mapped_column(Text)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_registry.id", ondelete="CASCADE"))
    is_cached_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class ArgoProfile(Base):
    __tablename__ = "argo_profile"
    __table_args__ = (UniqueConstraint("platform_number", "cycle_number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    platform_number: Mapped[str] = mapped_column(String(16), index=True)
    cycle_number: Mapped[int] = mapped_column(Integer)
    profile_date: Mapped[datetime] = mapped_column(DateTime, index=True)
    location = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    depths_m: Mapped[list[float]] = mapped_column(ARRAY(Float))
    temperature_c: Mapped[list[float]] = mapped_column(ARRAY(Float))
    salinity_psu: Mapped[list[float]] = mapped_column(ARRAY(Float))
    temp_std_c: Mapped[list[float | None]] = mapped_column(ARRAY(Float))  # on the 15 standard depths
    data_mode: Mapped[str | None] = mapped_column(String(4))
    split: Mapped[str] = mapped_column(String(8), index=True)  # train | val | test
    # critical (docs/14): profiles from training years are never scored as independent
    used_in_training: Mapped[bool] = mapped_column(Boolean, index=True)


class PredictionAtArgo(Base):
    __tablename__ = "prediction_at_argo"
    __table_args__ = (UniqueConstraint("argo_profile_id", "model_version_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    argo_profile_id: Mapped[int] = mapped_column(ForeignKey("argo_profile.id", ondelete="CASCADE"), index=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_registry.id", ondelete="CASCADE"))
    predicted_temperature_c: Mapped[list[float | None]] = mapped_column(ARRAY(Float))
    predicted_uncertainty_c: Mapped[list[float | None] | None] = mapped_column(ARRAY(Float))
    distance_km: Mapped[float] = mapped_column(Float)
    date_offset_days: Mapped[int] = mapped_column(Integer)
    rmse_c: Mapped[float | None] = mapped_column(Float)
    n_levels: Mapped[int] = mapped_column(Integer, default=0)
    profile = relationship("ArgoProfile")


class SkillMetric(Base):
    __tablename__ = "skill_metric"
    id: Mapped[int] = mapped_column(primary_key=True)
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_registry.id", ondelete="CASCADE"), index=True)
    evaluation: Mapped[str] = mapped_column(Text)  # argo_independent | grid_target
    split: Mapped[str] = mapped_column(Text)       # val | test
    depth_m: Mapped[float] = mapped_column(Float)
    rmse_c: Mapped[float | None] = mapped_column(Float)
    bias_c: Mapped[float | None] = mapped_column(Float)
    correlation: Mapped[float | None] = mapped_column(Float)
    n_obs: Mapped[int] = mapped_column(Integer)
    clim_rmse_c: Mapped[float | None] = mapped_column(Float)
    skill_vs_climatology: Mapped[float | None] = mapped_column(Float)
    held_out_period_start: Mapped[date | None] = mapped_column(Date)
    held_out_period_end: Mapped[date | None] = mapped_column(Date)


class CycloneTrack(Base):
    __tablename__ = "cyclone_track"
    id: Mapped[int] = mapped_column(primary_key=True)
    sid: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    season: Mapped[int] = mapped_column(Integer)
    peak_category: Mapped[str | None] = mapped_column(Text)
    points = relationship("TrackPoint", order_by="TrackPoint.observed_at", cascade="all, delete-orphan")


class TrackPoint(Base):
    __tablename__ = "track_point"
    id: Mapped[int] = mapped_column(primary_key=True)
    cyclone_track_id: Mapped[int] = mapped_column(ForeignKey("cyclone_track.id", ondelete="CASCADE"), index=True)
    location = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime)
    category: Mapped[str | None] = mapped_column(Text)
    grade: Mapped[str | None] = mapped_column(String(8))
    wind_kt: Mapped[float | None] = mapped_column(Float)


Index("idx_skill_metric_lookup", SkillMetric.model_version_id, SkillMetric.evaluation, SkillMetric.split)
# GiST spatial indexes (docs/14 section 3), declared explicitly so the Alembic migration
# and metadata.create_all produce the same schema.
Index("idx_region_bbox", Region.bbox, postgresql_using="gist")
Index("idx_argo_profile_location", ArgoProfile.location, postgresql_using="gist")
Index("idx_track_point_location", TrackPoint.location, postgresql_using="gist")
