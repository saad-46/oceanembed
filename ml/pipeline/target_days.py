"""Which days get a training/evaluation target (docs/DECISIONS.md D-004).

Inputs are ingested for every day of the study period (they are cheap, 0.25 deg,
and needed for daily output). Targets come from a 1/12 deg 3-D model product and cost
~10 MB / ~30 s per day to fetch, so training/validation/test years are sampled every
``stride`` days, and the cyclone demo window (Mocha + Biparjoy, May-June 2023) is
sampled daily so the held-out-year comparison there is complete.
"""
from __future__ import annotations

from datetime import date, timedelta

from ml.config import STUDY_END, STUDY_START

DEMO_WINDOW = (date(2023, 5, 1), date(2023, 6, 30))


def target_days(stride: int = 3) -> list[date]:
    days = set()
    d = STUDY_START
    while d <= STUDY_END:
        days.add(d)
        d += timedelta(days=stride)
    d = DEMO_WINDOW[0]
    while d <= DEMO_WINDOW[1]:
        days.add(d)
        d += timedelta(days=1)
    return sorted(days)
