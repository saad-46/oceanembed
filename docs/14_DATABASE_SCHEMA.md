# 14 · Database Schema

PostgreSQL + PostGIS. Gridded arrays themselves live in object storage (`09_DATA_PIPELINE.md`); the database holds **metadata, validation records, and pointers**, not the raw multi-dimensional arrays.

## 1. Tables

### `region`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | "Bay of Bengal", "Arabian Sea", "Full Domain" |
| `bbox` | geometry(Polygon, 4326) | PostGIS spatial column |

### `daily_product`
Pointer table — one row per date, referencing where the precomputed grid lives.
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `date` | date | unique |
| `grid_path` | text | path in object storage (Zarr/GeoTIFF) |
| `model_version_id` | FK → `model_registry.id` | which model produced this |
| `is_cached_demo` | boolean | flags precomputed-for-demo rows |

### `argo_profile`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `platform_number` | text | Argo float ID |
| `profile_date` | timestamp | |
| `location` | geometry(Point, 4326) | PostGIS spatial column, **indexed with GiST** |
| `depths_m` | float[] | array of measured depths |
| `temperature_c` | float[] | array, aligned with `depths_m` |
| `salinity_psu` | float[] | array, aligned with `depths_m` |
| `used_in_training` | boolean | **critical** — marks whether this profile was in the training/target-generation set, so validation queries can filter to truly held-out floats |

### `prediction_at_argo`
One row per (Argo profile × model) — the actual validation join.
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `argo_profile_id` | FK → `argo_profile.id` | |
| `model_version_id` | FK → `model_registry.id` | |
| `predicted_temperature_c` | float[] | model output at the 15 standard depths, interpolated to compare against Argo's native depths |
| `predicted_uncertainty_c` | float[] | |
| `distance_km` | float | distance from nearest grid cell center to the float's actual location |
| `date_offset_days` | int | |

### `skill_metric`
Aggregated validation statistics, precomputed for fast API responses (backs `GET /v1/validation/summary`).
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `model_version_id` | FK → `model_registry.id` | |
| `depth_m` | float | |
| `rmse_c` | float | |
| `bias_c` | float | |
| `correlation` | float | |
| `n_obs` | int | |
| `held_out_period_start` | date | |
| `held_out_period_end` | date | |

### `model_registry`
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `name` | text | "baseline-lightgbm-v1", "cnn-unet-v1.2" |
| `architecture` | text | "LightGBM" \| "CNN-UNet" \| "ViT" |
| `training_period_start` / `training_period_end` | date | |
| `checkpoint_path` | text | object storage pointer |
| `is_production` | boolean | which model the API serves by default |
| `created_at` | timestamp | |

### `cyclone_track` / `track_point` (for the Wow-feature demo replay)
| Column | Type | Notes |
|---|---|---|
| `cyclone_track.id` | serial PK | |
| `cyclone_track.name` | text | "Cyclone Mocha 2023" |
| `track_point.id` | serial PK | |
| `track_point.cyclone_track_id` | FK | |
| `track_point.location` | geometry(Point, 4326) | |
| `track_point.observed_at` | timestamp | |
| `track_point.category` | text | e.g. "Severe Cyclonic Storm" |

## 2. Example records

```sql
INSERT INTO region (name, bbox) VALUES
 ('Bay of Bengal', ST_MakeEnvelope(80, 5, 100, 22, 4326));

INSERT INTO argo_profile (platform_number, profile_date, location, depths_m, temperature_c, salinity_psu, used_in_training)
VALUES ('2902731', '2023-06-14', ST_SetSRID(ST_MakePoint(87.2, 14.9), 4326),
        ARRAY[0,10,20,50,100,200,500,1000],
        ARRAY[29.9,29.7,28.1,24.0,20.2,15.8,10.1,6.4],
        ARRAY[33.1,33.3,33.9,34.6,35.0,35.1,34.9,34.7],
        false);
```

## 3. Indexes

```sql
CREATE INDEX idx_argo_profile_location ON argo_profile USING GIST (location);
CREATE INDEX idx_argo_profile_date ON argo_profile (profile_date);
CREATE INDEX idx_daily_product_date ON daily_product (date);
CREATE INDEX idx_prediction_argo_profile ON prediction_at_argo (argo_profile_id);
```

## 4. Key spatial queries

```sql
-- Nearest Argo float to a clicked map point, within 100 km
SELECT platform_number, profile_date,
       ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(88.0, 15.0), 4326)::geography) / 1000 AS distance_km
FROM argo_profile
WHERE used_in_training = false
  AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(88.0, 15.0), 4326)::geography, 100000)
ORDER BY distance_km
LIMIT 1;
```

This is exactly the query behind `GET /v1/profile/{date}`'s `nearest_argo_float` field and the Validation screen's map-jump interaction.
