"""Historical cyclone tracks for the "Cyclone Fuel Gauge" replay (docs/07 #17).

Source: NOAA NCEI IBTrACS v04r01, North Indian basin file (public domain). The India
Meteorological Department (New Delhi RSMC) grade is used for the category label.
"""
from __future__ import annotations

import json
import logging

import pandas as pd

from ml.config import PROCESSED_DIR, RAW_DIR, STUDY_END, STUDY_START
from ml.ingestion.base import Provenance, http_get

log = logging.getLogger("oceanembed.ingestion.cyclones")

URL = ("https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/"
       "v04r01/access/csv/ibtracs.NI.list.v04r01.csv")
PROVENANCE = Provenance(
    source_key="cyclones", product="IBTrACS v04r01 North Indian best tracks", provider="NOAA NCEI",
    dataset_id="ibtracs.NI.v04r01", url="https://www.ncei.noaa.gov/products/international-best-track-archive",
    license="Public domain (NOAA)", native_resolution="3-hourly track points", requires_credentials=False,
)
GRADE_NAMES = {
    "D": "Depression", "DD": "Deep Depression", "CS": "Cyclonic Storm", "SCS": "Severe Cyclonic Storm",
    "VSCS": "Very Severe Cyclonic Storm", "ESCS": "Extremely Severe Cyclonic Storm", "SUCS": "Super Cyclonic Storm",
}


def build_cyclones(min_grade: str = "CS") -> list[dict]:
    raw = http_get(URL, RAW_DIR / "cyclones" / "ibtracs.NI.list.v04r01.csv", timeout=600)
    df = pd.read_csv(raw, skiprows=[1], low_memory=False, keep_default_na=False)
    df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"])
    df = df[(df["ISO_TIME"] >= pd.Timestamp(STUDY_START)) & (df["ISO_TIME"] <= pd.Timestamp(STUDY_END) + pd.Timedelta(days=1))]
    df = df[df["NAME"].ne("NOT_NAMED")]
    order = list(GRADE_NAMES)
    tracks = []
    for sid, g in df.groupby("SID"):
        grades = [x.strip().upper() for x in g["NEWDELHI_GRADE"].astype(str)]
        valid = [x for x in grades if x in GRADE_NAMES]
        if not valid or max(order.index(x) for x in valid) < order.index(min_grade):
            continue
        peak = max(valid, key=order.index)
        g = g.sort_values("ISO_TIME")
        pts = []
        for _, r in g.iterrows():
            try:
                lat, lon = float(r["LAT"]), float(r["LON"])
            except ValueError:
                continue
            gr = str(r["NEWDELHI_GRADE"]).strip().upper()
            wind = pd.to_numeric(r.get("NEWDELHI_WIND", ""), errors="coerce")
            pts.append({"time": r["ISO_TIME"].isoformat(), "lat": lat, "lon": lon,
                        "grade": gr if gr in GRADE_NAMES else None,
                        "category": GRADE_NAMES.get(gr), "wind_kt": None if pd.isna(wind) else float(wind)})
        name = str(g["NAME"].iloc[0]).split(":")[0].title()  # IBTrACS lists alternates as "A:B"
        season = int(g["SEASON"].iloc[0])
        tracks.append({"sid": sid, "name": f"Cyclone {name} {season}", "season": season,
                       "peak_grade": peak, "peak_category": GRADE_NAMES[peak], "points": pts})
    tracks.sort(key=lambda t: t["points"][0]["time"])
    out = PROCESSED_DIR / "cyclones.json"
    out.write_text(json.dumps({"provenance": PROVENANCE.as_attrs(), "tracks": tracks}, indent=1))
    log.info("wrote %s: %d tracks (%s)", out, len(tracks), ", ".join(t["name"] for t in tracks))
    return tracks
