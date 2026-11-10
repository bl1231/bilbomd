"""
Compare a model's mass with the mass the SAXS data suggest, before a job is
submitted. Uses the same comparison as the report on a finished job
(pipeline_decision_tree.py).

Usage:
    python mw_check.py <saxs.dat> --pdb model.pdb
    python mw_check.py <saxs.dat> --psf model.psf
    python mw_check.py <saxs.dat> --entities entities.json

Prints {"mw": {...}, "finding": {...}} as JSON. A model or data set that
cannot be assessed is reported in the JSON, not as a failure.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Optional, Sequence

import numpy as np

from pdb_utils import psf_composition, residue_composition, sequence_composition
from pipeline_decision_tree import compare_mw, mw_finding
from saxs_utils import load_profile


def model_composition(args: argparse.Namespace):
    if args.pdb:
        return residue_composition(args.pdb)
    if args.psf:
        return psf_composition(args.psf)
    with open(args.entities, encoding="utf-8") as handle:
        return sequence_composition(json.load(handle))


def check(args: argparse.Namespace) -> dict:
    try:
        composition = model_composition(args)
    except (OSError, ValueError, KeyError, TypeError) as error:
        mw = compare_mw(np.array([]), np.array([]), np.array([]), None)
        mw["reason"] = f"The model's mass could not be determined: {error}"
        return {"mw": mw, "finding": mw_finding(mw)}

    try:
        q, intensity, sigma = load_profile(args.saxs)
    except (OSError, ValueError) as error:
        q = intensity = sigma = np.array([])
        mw = compare_mw(q, intensity, sigma, composition)
        mw["reason"] = f"The SAXS data could not be read: {error}"
        return {"mw": mw, "finding": mw_finding(mw)}

    if sigma is None:
        # Two-column data: no errors to weight the Guinier fit with
        sigma = np.ones_like(intensity)
    mw = compare_mw(q, intensity, sigma, composition)
    return {"mw": mw, "finding": mw_finding(mw)}


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare a model's mass with the SAXS estimate."
    )
    parser.add_argument("saxs", help="experimental SAXS profile (q, I, sigma)")
    model = parser.add_mutually_exclusive_group(required=True)
    model.add_argument("--pdb", help="model PDB file")
    model.add_argument("--psf", help="model PSF file")
    model.add_argument(
        "--entities",
        help="JSON file: a list of {type, sequence, copies} for sequence-based jobs",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    result = check(parse_args(argv))
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
