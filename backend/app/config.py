"""Runtime settings (12-factor: everything from env / .env)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env"), extra="ignore")

    database_url: str = "postgresql+psycopg://oceanembed:oceanembed@localhost:5433/oceanembed"
    oceanembed_data_dir: Path = REPO_ROOT / "ml" / "data"
    cors_origins: str = "http://localhost:3100,http://127.0.0.1:3100"
    # Optional, for per-deploy preview hosts (e.g. r"https://oceanembed-[a-z0-9-]+\.vercel\.app"); empty = exact origins only.
    cors_origin_regex: str = ""
    model_version: str = ""  # empty -> the registry's production model
    llm_api_key: str = ""
    llm_model: str = "claude-opus-5-5"
    log_level: str = "INFO"
    max_region_cells: int = 24000  # whole domain is allowed; guard exists for future larger grids
    grid_cache_days: int = 48
    max_3d_points: int = 20000  # hard cap on /v1/volume/sample (browser point-cloud budget)
    # Optional data-source credentials. The API never downloads with them (precompute only); it only
    # reports *whether* they are configured, never their values.
    copernicusmarine_service_username: str = ""
    copernicusmarine_service_password: str = ""
    copernicus_marine_username: str = ""
    copernicus_marine_password: str = ""
    cds_api_key: str = ""

    @property
    def copernicus_configured(self) -> bool:
        return bool((self.copernicusmarine_service_username or self.copernicus_marine_username)
                    and (self.copernicusmarine_service_password or self.copernicus_marine_password))

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def outputs_dir(self) -> Path:
        return Path(self.oceanembed_data_dir) / "outputs"

    @property
    def processed_dir(self) -> Path:
        return Path(self.oceanembed_data_dir) / "processed"


@lru_cache
def get_settings() -> Settings:
    return Settings()
