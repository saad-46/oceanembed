"""Cross-check against the Met Office EN4.2.2 objective analysis (docs/10 section 3, docs/20 Q7).

    python -m ml.evaluation.en4_crosscheck

EN4 is a monthly 1 deg objective analysis of in-situ profiles (Argo, XBT, CTD, moorings). It is
independent of the HYCOM training target (a different system: no model dynamics, no satellite
altimetry assimilation), so agreement with EN4 is evidence the reconstruction is not merely
copying one reanalysis. It is *not* independent of Argo, and its 1 deg monthly smoothing makes
it a large-scale check only. Each model's daily output for a month is averaged and block-averaged
onto EN4's 1 deg cells before comparison on the standard depths.

Source: https://www.metoffice.gov.uk/hadobs/en4/ (Good et al. 2013), open, no registration.
"""
from __future__ import annotations

import json
import logging
import zipfile

import numpy as np
import pandas as pd
import xarray as xr

from ml.config import LATS, LONS, OUTPUT_DIR, PROCESSED_DIR, RAW_DIR, STANDARD_DEPTHS, TEST_YEARS, VAL_YEARS
from ml.evaluation.metrics import per_depth_metrics
from ml.pipeline.feature_engineering import climatology_for
from ml.pipeline.regrid import interp_depth

log = logging.getLogger("oceanembed.en4")
EN4_DIR = RAW_DIR / "en4"


def load_en4_month(year: int, month: int) -> xr.DataArray | None:
    z = EN4_DIR / f"EN.4.2.2.analyses.g10.{year}.zip"
    if not z.exists():
        return None
    name = f"EN.4.2.2.f.analysis.g10.{year}{month:02d}.nc"
    out = EN4_DIR / name
    if not out.exists():
        with zipfile.ZipFile(z) as zf:
            member = next((m for m in zf.namelist() if m.endswith(name)), None)
            if member is None:
                return None
            out.write_bytes(zf.read(member))
    ds = xr.open_dataset(out)
    t = ds["temperature"].isel(time=0).sel(lat=slice(4.5, 30.5), lon=slice(44.5, 105.5)).load()
    ds.close()
    return t - 273.15 if float(t.mean(skipna=True)) > 200 else t  # EN4 stores Kelvin


def block_to_en4(field: np.ndarray, en4_lat: np.ndarray, en4_lon: np.ndarray) -> np.ndarray:
    """(15, 100, 240) at 0.25 deg -> (15, nlat, nlon) means over the 1 deg EN4 cells (need >= 50% valid)."""
    out = np.full((field.shape[0], en4_lat.size, en4_lon.size), np.nan, np.float32)
    for a, la in enumerate(en4_lat):
        ii = np.where(np.abs(LATS - la) < 0.5)[0]
        if not ii.size:
            continue
        for b, lo in enumerate(en4_lon):
            jj = np.where(np.abs(LONS - lo) < 0.5)[0]
            if not jj.size:
                continue
            block = field[:, ii[0]:ii[-1] + 1, jj[0]:jj[-1] + 1].reshape(field.shape[0], -1)
            ok = np.isfinite(block)
            frac = ok.mean(axis=1)
            with np.errstate(invalid="ignore"):
                m = np.nanmean(np.where(ok, block, np.nan), axis=1)
            out[:, a, b] = np.where(frac >= 0.5, m, np.nan)
    return out


def crosscheck() -> dict:
    coef = xr.open_zarr(PROCESSED_DIR / "climatology.zarr")["coef"].values
    mask3d = xr.open_zarr(PROCESSED_DIR / "static.zarr")["ocean_mask3d"].values
    stores = {p.stem: xr.open_zarr(p) for p in sorted((OUTPUT_DIR / "predictions").glob("*.zarr"))}
    tgt = xr.open_zarr(PROCESSED_DIR / "target.zarr") if (PROCESSED_DIR / "target.zarr").exists() else None
    pairs: dict[str, dict[str, list]] = {}
    for year in sorted(set(VAL_YEARS) | set(TEST_YEARS)):
        split = "test" if year in TEST_YEARS else "val"
        for month in range(1, 13):
            en4 = load_en4_month(year, month)
            if en4 is None:
                continue
            ez = interp_depth(en4["depth"].values, en4.values, STANDARD_DEPTHS)  # (15, nlat, nlon)
            days = pd.date_range(f"{year}-{month:02d}-01", periods=pd.Period(f"{year}-{month:02d}").days_in_month)
            fields = {"climatology": np.where(mask3d, climatology_for(days, coef).mean(0), np.nan)}
            for name, st in stores.items():
                sel = st["temp"].sel(time=slice(days[0], days[-1]))
                if sel.sizes["time"]:
                    fields[name] = sel.mean("time").values
            if tgt is not None:
                sel = tgt["temp"].sel(time=slice(days[0], days[-1]))
                if sel.sizes["time"] >= 5:
                    fields["target-product"] = sel.mean("time").values
            for name, fld in fields.items():
                m = block_to_en4(fld.astype(np.float32), en4["lat"].values, en4["lon"].values)
                p = pairs.setdefault(split, {}).setdefault(name, [[], []])
                p[0].append(m.reshape(15, -1).T)
                p[1].append(ez.reshape(15, -1).T)
            log.info("EN4 %d-%02d done", year, month)
    res = {"source": "Met Office Hadley Centre EN4.2.2 objective analysis (g10), monthly 1 deg",
           "note": "Independent of the HYCOM training target; not independent of Argo; large-scale (1 deg, monthly) check.",
           "splits": {}}
    for split, models in pairs.items():
        clim_p = np.concatenate(models["climatology"][0])
        res["splits"][split] = {"models": {}}
        for name, (P, O) in models.items():
            P, O = np.concatenate(P), np.concatenate(O)
            res["splits"][split]["models"][name] = {"per_depth": per_depth_metrics(P, O, clim_p if len(clim_p) == len(P) else None)}
    (OUTPUT_DIR / "metrics_en4.json").write_text(json.dumps(res, indent=2))
    return res


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    r = crosscheck()
    for split, sp in r["splits"].items():
        print(split, {n: round(float(np.nanmean([d.get("rmse_c", np.nan) for d in v["per_depth"]])), 3) for n, v in sp["models"].items()})


if __name__ == "__main__":
    main()
