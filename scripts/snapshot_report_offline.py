"""Build the offline report files for the reference scenario (Bay of Bengal, 15°N 88°E, 2023-05-11)
from the saved API snapshots in frontend/public/fallback/, using the backend's own report code
(backend/app/services/report.py). No server, database or model is needed, and no value is invented:
the profile, summary, validation line and map inset all come from saved API responses.

    pip install reportlab numpy
    python scripts/snapshot_report_offline.py

Output keys mirror `fallbackKey()` in frontend/lib/api.ts (the Reports screen falls back to them).
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FB = ROOT / "frontend" / "public" / "fallback"
sys.path.insert(0, str(ROOT / "backend"))
from app.services import report  # noqa: E402

DATE, LAT, LON, DEPTH = "2023-05-11", 15, 88, 100


def load(key: str) -> dict:
    return json.loads((FB / f"{key}.json").read_text())


def main():
    p = load(f"v1_profile_{DATE}_lat_{LAT:.3f}_lon_{LON:.3f}")
    summary = load(f"v1_assistant_query__date_{DATE}_lat_{LAT}_lon_{LON}")["summary"]
    val = load("v1_validation_summary_split_test")
    r100 = next(r for r in val["per_depth"] if r["depth_m"] == 100.0)
    vline = (f"Independent Argo validation ({val['held_out_period']}, {val['n_profiles']} held-out profiles): "
             f"RMSE {r100['rmse_c']:.2f} °C at 100 m.")
    period = load("v1_meta")["period"]
    g = load(f"v1_grid_{DATE}_depth_{DEPTH}_variable_temp")["grid"]
    field = np.array([[np.nan if v is None else v for v in row] for row in g["values"]], dtype=float)
    inset = report.map_inset(field, np.array(g["lat"]), np.array(g["lon"]), p["cell"]["lat"], p["cell"]["lon"], float(DEPTH))
    pdf = report.profile_pdf(p, summary, vline, inset=inset, depth=float(DEPTH), period=f"{period['start']}..{period['end']}")
    (FB / f"v1_report_{DATE}_lat_{LAT}_lon_{LON}_depth_{DEPTH}_format_pdf.pdf").write_bytes(pdf)
    (FB / f"v1_report_{DATE}_lat_{LAT}_lon_{LON}_format_csv.csv").write_bytes(report.profile_csv(p))
    print("wrote reference report PDF + CSV to", FB)


if __name__ == "__main__":
    main()
