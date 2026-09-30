"""Copy just what the API serves into a self-contained data bundle (for Render/Docker deploys).

    python scripts/make_deploy_bundle.py [--out deploy_data] [--start 2023-01-01 --end 2023-12-31]

With --start/--end the prediction/product stores are subset in time to keep the bundle small
(the full 2019-2023 stores are ~1-2 GB). Raw downloads and model checkpoints are never needed by
the API. From the harmonised inputs only the fields served as map layers (SLA, 10 m wind) are
copied; the optional GLORYS salinity store is copied when it exists.
"""
import argparse
import shutil
import sys
from pathlib import Path

import xarray as xr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ml.config import DATA_DIR  # noqa: E402

p = argparse.ArgumentParser()
p.add_argument("--out", default=str(ROOT / "deploy_data"))
p.add_argument("--start")
p.add_argument("--end")
a = p.parse_args()
out = Path(a.out)
if out.exists():
    shutil.rmtree(out)
(out / "processed").mkdir(parents=True)
(out / "outputs").mkdir(parents=True)
for name in ("static.zarr", "climatology.zarr"):
    shutil.copytree(DATA_DIR / "processed" / name, out / "processed" / name)
for name in ("argo_profiles.parquet", "argo_qc.json", "inputs_qc.json", "cyclones.json", "assemble_summary.json"):
    if (DATA_DIR / "processed" / name).exists():
        shutil.copy2(DATA_DIR / "processed" / name, out / "processed" / name)
for f in (DATA_DIR / "outputs").glob("*.*"):
    if f.is_file():
        shutil.copy2(f, out / "outputs" / f.name)
imp = DATA_DIR / "models" / "baseline-lightgbm-v1" / "feature_importance.json"
if imp.exists():
    (out / "models" / "baseline-lightgbm-v1").mkdir(parents=True)
    shutil.copy2(imp, out / "models" / "baseline-lightgbm-v1" / imp.name)
for sub in ("predictions", "products"):
    for z in (DATA_DIR / "outputs" / sub).glob("*.zarr"):
        dst = out / "outputs" / sub / z.name
        if a.start or a.end:
            ds = xr.open_zarr(z).sel(time=slice(a.start, a.end))
            for v in ds.data_vars:
                ds[v].encoding.pop("chunks", None)
            ds.to_zarr(dst, mode="w")
        else:
            shutil.copytree(z, dst)
if (DATA_DIR / "processed" / "target.zarr").exists() and (a.start or a.end):
    ds = xr.open_zarr(DATA_DIR / "processed" / "target.zarr").sel(time=slice(a.start, a.end))
    for v in ds.data_vars:
        ds[v].encoding.pop("chunks", None)
    ds.to_zarr(out / "processed" / "target.zarr", mode="w")
SURFACE_LAYERS = ["sla", "uwind", "vwind", "ocean_mask"]  # served by /v1/surface and /v1/wind
for name, keep in (("inputs.zarr", SURFACE_LAYERS), ("salinity.zarr", None)):
    src = DATA_DIR / "processed" / name
    if not src.exists():
        continue
    ds = xr.open_zarr(src)
    if keep:
        ds = ds[[v for v in keep if v in ds]]
    if (a.start or a.end) and "time" in ds.dims:
        ds = ds.sel(time=slice(a.start, a.end))
    for v in ds.data_vars:
        ds[v].encoding.pop("chunks", None)
    ds.to_zarr(out / "processed" / name, mode="w")
size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
print(f"bundle at {out}: {size / 1e6:.0f} MB")
