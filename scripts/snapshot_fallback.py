"""Snapshot the demo click-path (docs/15) from a running API into frontend/public/fallback/,
so the web app can still render those views if the backend is unreachable (docs/16 section 6,
docs/21 section 2). Keys mirror `fallbackKey()` in frontend/lib/api.ts exactly.

    python scripts/snapshot_fallback.py [--api http://localhost:8100]
"""
import argparse
import json
import re
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "fallback"
DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]
DEMO_DATE = "2023-05-11"
BOB = {"min_lat": 5, "max_lat": 22, "min_lon": 80, "max_lon": 100}


def js_str(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return "null" if v is None else str(v)


def flatten(obj, prefix=""):
    if not isinstance(obj, dict):
        return [f"{prefix}_{js_str(obj)}"]
    return [x for k in sorted(obj) for x in flatten(obj[k], f"{prefix}_{k}" if prefix else k)]


def fallback_key(path: str, body=None) -> str:
    key = path.lstrip("/")
    if body is not None:
        key += "__" + "_".join(flatten(body))
    return re.sub(r"[^A-Za-z0-9._-]", "_", key)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="http://localhost:8100")
    api = p.parse_args().api.rstrip("/")
    OUT.mkdir(parents=True, exist_ok=True)
    gets = ["/v1/meta", "/v1/summary/headline", "/v1/regions", "/v1/cyclones", "/v1/validation/grid", "/v1/validation/en4",
            "/v1/embedding/projection", "/v1/explain/importance",
            f"/v1/argo/markers?date={DEMO_DATE}&window_days=3",
            f"/v1/profile/{DEMO_DATE}?lat=15.000&lon=88.000", "/v1/profile/2023-06-06?lat=15.000&lon=66.000",
            f"/v1/section/{DEMO_DATE}?lat=15&lon_min=80&lon_max=97"]
    for split in ("test", "val"):
        gets += [f"/v1/validation/summary?split={split}", f"/v1/validation/scatter?split={split}&max_points=3000",
                 f"/v1/validation/profiles?split={split}&sort=rmse_desc&limit=15&offset=0"]
    for d in ("2023-05-10", DEMO_DATE, "2023-05-12"):
        gets += [f"/v1/grid/{d}?depth={z}&variable=temp" for z in DEPTHS]
        gets += [f"/v1/grid/{d}/product?product={v}" for v in ("tchp", "mld", "d20", "d26")]
    gets += [f"/v1/grid/{DEMO_DATE}?depth={z}&variable={v}" for z in (0, 100) for v in ("anomaly", "uncertainty")]
    posts = [("/v1/region/stats", {"date": DEMO_DATE, "bbox": BOB}),
             ("/v1/region/stats", {"date": DEMO_DATE, "bbox": {"min_lat": 5, "max_lat": 25, "min_lon": 50, "max_lon": 77}}),
             ("/v1/region/timeseries", {"bbox": BOB, "product": "tchp", "stride_days": 5}),
             ("/v1/assistant/query", {"lat": 15, "lon": 88, "date": DEMO_DATE})]
    tracks = requests.get(f"{api}/v1/cyclones", timeout=60).json()["tracks"]
    mocha = next((t for t in tracks if "Mocha" in t["name"]), None)
    if mocha:
        fuel_path = f"/v1/cyclones/{mocha['id']}/fuel?lead_days=2"
        gets.append(fuel_path)
        fuel = requests.get(api + fuel_path, timeout=120).json()
        dates = {pt["ocean_date"] for pt in fuel["points"] if pt["ocean_date"]}
        gets += [f"/v1/grid/{d}/product?product=tchp" for d in sorted(dates)]
        gets += [f"/v1/grid/{d}?depth=100&variable=uncertainty" for d in sorted(dates)]  # guided tour σ
    n = 0
    for path in dict.fromkeys(gets):
        r = requests.get(api + path, timeout=120)
        if r.ok:
            (OUT / f"{fallback_key(path)}.json").write_text(r.text, encoding="utf-8")
            n += 1
        else:
            print("skip", r.status_code, path)
    for path, body in posts:
        r = requests.post(api + path, json=body, timeout=120)
        if r.ok:
            (OUT / f"{fallback_key(path, body)}.json").write_text(r.text, encoding="utf-8")
            n += 1
    size = sum(f.stat().st_size for f in OUT.glob("*.json"))
    print(f"wrote {n} snapshots ({size / 1e6:.1f} MB) to {OUT}")


if __name__ == "__main__":
    main()
