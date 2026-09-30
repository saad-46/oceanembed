"""Pipeline orchestrator CLI.

    python -m ml.pipeline.build_dataset target   [--stride 3] [--workers 4]
    python -m ml.pipeline.build_dataset inputs   [--start 2019-01-01 --end 2023-12-31]
    python -m ml.pipeline.build_dataset argo
    python -m ml.pipeline.build_dataset cyclones
    python -m ml.pipeline.build_dataset assemble   # -> processed/*.zarr + stats
    python -m ml.pipeline.build_dataset salinity [--stride 3]   # optional, needs Copernicus Marine credentials

Every step is idempotent (cached downloads) and resumable.
"""
from __future__ import annotations

import argparse
import json
import logging
from datetime import date

from ml.config import PROCESSED_DIR, STUDY_END, STUDY_START

log = logging.getLogger("oceanembed.pipeline")


def cmd_target(args):
    from ml.ingestion.fetch_glorys import get_adapter
    from ml.pipeline.target_days import target_days

    adapter = get_adapter()
    days = target_days(args.stride)
    # Shuffle (fixed seed) so an interrupted/partial download still covers every year
    # evenly - training can start on a partial set while the rest streams in.
    import random
    random.Random(0).shuffle(days)
    log.info("target source: %s; %d days", adapter.provenance.product, len(days))
    ok = adapter.fetch_days(days, workers=args.workers)
    log.info("target done: %d/%d days cached", len(ok), len(days))


def cmd_inputs(args):
    from ml.pipeline.clean import build_inputs

    build_inputs(date.fromisoformat(args.start), date.fromisoformat(args.end))


def cmd_argo(args):
    from ml.ingestion.fetch_argo import build_argo

    build_argo(date.fromisoformat(args.start), date.fromisoformat(args.end))


def cmd_cyclones(args):
    from ml.ingestion.fetch_cyclones import build_cyclones

    build_cyclones()


def cmd_salinity(args):
    """Optional GLORYS12V1 subsurface salinity (reanalysis) for the salinity / halocline / T-S views."""
    from ml.ingestion.fetch_glorys import build_salinity
    from ml.pipeline.target_days import target_days

    n = build_salinity(target_days(args.stride), PROCESSED_DIR)
    log.info("salinity store: %d days", n)


def cmd_assemble(args):
    from ml.pipeline.feature_engineering import assemble

    stats = assemble()
    print(json.dumps(stats, indent=2, default=str))


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="build_dataset")
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("target"); t.add_argument("--stride", type=int, default=3); t.add_argument("--workers", type=int, default=4)
    t.set_defaults(fn=cmd_target)
    for name, fn in (("inputs", cmd_inputs), ("argo", cmd_argo)):
        s = sub.add_parser(name)
        s.add_argument("--start", default=STUDY_START.isoformat()); s.add_argument("--end", default=STUDY_END.isoformat())
        s.set_defaults(fn=fn)
    sub.add_parser("cyclones").set_defaults(fn=cmd_cyclones)
    sub.add_parser("assemble").set_defaults(fn=cmd_assemble)
    sal = sub.add_parser("salinity"); sal.add_argument("--stride", type=int, default=3); sal.set_defaults(fn=cmd_salinity)
    args = p.parse_args(argv)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    args.fn(args)


if __name__ == "__main__":
    main()
