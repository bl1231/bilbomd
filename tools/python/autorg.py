"""
Simple python jiffy to calculate the min and max Rg values
"""

import argparse
import json
import os
import sys
import numpy as np
from saxs_utils import load_profile

from pathlib import Path

# Prefer shared fast Guinier fitter from guinier.py (sibling module)
try:
    from guinier import guinier_scan
except (ImportError, ModuleNotFoundError):
    # If run from another working directory, ensure this script's folder is on sys.path
    _SCRIPT_DIR = Path(__file__).resolve().parent
    if str(_SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(_SCRIPT_DIR))
    from guinier import guinier_scan


def _auto_guinier(
    q, intensity, sigma=None, min_points=10, max_qrg=1.3, min_qrg=0.3, r2_floor=0.90
):
    """
    Adapter over the shared fast Guinier scan (guinier_scan) to keep the
    original RAW-like return tuple expected by the rest of this script.
    """
    r = guinier_scan(
        q,
        intensity,
        sigma,
        min_points=min_points,
        qrg_min=min_qrg,
        qrg_max=max_qrg,
        r2_floor=r2_floor,
    )
    return (
        float(r["Rg"]),  # rg
        float(r["I0"]),  # izero
        0.0,  # rg_err placeholder
        0.0,  # izero_err placeholder
        float(r["qmin"]),  # qmin
        float(r["qmax"]),  # qmax
        float(r.get("qrg_min", r["qmin"] * r["Rg"])),  # qrg_min
        float(r.get("qrg_max", r["qmax"] * r["Rg"])),  # qrg_max
        int(r["i"]),  # idx_min
        int(r["j"]),  # idx_max
        float(r["r2"]),  # r_sqr
    )


if os.getenv("AUTORG_PROFILE", "0") == "1":
    import cProfile
    import pstats
    import io

    _pr = cProfile.Profile()
    _pr.enable()


os.environ["MPLCONFIGDIR"] = "/tmp/"


def parse_args():
    """
    Arg parser for authrog jiffy
    """
    parser = argparse.ArgumentParser(description="Calculate min and max Rg values")
    parser.add_argument("file_path", type=str, help="Path to the data file")
    parser.add_argument("output_file", type=str, help="Path to the output JSON file")
    return parser.parse_args()


def calculate_rg(file_path, output_file):
    """
    Calculate Radius of Gyration (Rg)
    """

    # Constants for scale factor transition
    SCALE_FACTOR_START = 0.95
    SCALE_FACTOR_END = 0.80
    SCALE_FACTOR_RANGE = SCALE_FACTOR_START - SCALE_FACTOR_END  # 0.15
    SCALE_TRANSITION_START = 25  # Angstrom
    SCALE_TRANSITION_WIDTH = 40  # Angstrom

    try:
        q, intensity, sigma = load_profile(file_path)
        guinier_results = _auto_guinier(q, intensity, sigma)
        (
            rg,
            izero,
            rg_err,
            izero_err,
            qmin,
            qmax,
            qrg_min,
            qrg_max,
            idx_min,
            idx_max,
            r_sqr,
        ) = guinier_results

        # Dynamically adjust scale factor for rg_min based on Rg value.
        # For Rg ≤ 25, use a conservative factor of 0.95 to prevent rg_min from being too small.
        # For Rg ≥ 65, taper down to a factor of 0.80 for broader exploration in larger structures.
        # The transition occurs smoothly between Rg 25–65 to balance flexibility and stability.
        #
        # Smooth transition of scale factor from 0.95 to 0.80 as rg goes from 25 to 65
        scale_factor = (
            SCALE_FACTOR_START
            - min(max((rg - SCALE_TRANSITION_START) / SCALE_TRANSITION_WIDTH, 0), 1)
            * SCALE_FACTOR_RANGE
        )
        rg_min = round(max(10, min(100, rg * scale_factor)))
        rg_max = round(rg * 1.5)

        # Clamp rg_min to be no less than 10 and no more than 100
        rg_min = max(10, min(100, rg_min))

        # Clamp rg_max to be no less than 10 and no more than 100
        rg_max = max(10, min(100, rg_max))

        # Create a dictionary with the results
        result_dict = {"rg": round(rg), "rg_min": rg_min, "rg_max": rg_max}

        # Write the results to the output file
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result_dict, f)

    except (IOError, ValueError) as e:
        # Send errors to stderr to avoid interfering with stdout JSON output
        sys.stderr.write(f"Error: {str(e)}\n")


if __name__ == "__main__":
    args = parse_args()
    calculate_rg(args.file_path, args.output_file)
    if os.getenv("AUTORG_PROFILE", "0") == "1":
        _pr.disable()
        s = io.StringIO()
        ps = pstats.Stats(_pr, stream=s).sort_stats("cumtime")
        ps.print_stats(30)
        sys.stderr.write("\n[autorg profile]\n" + s.getvalue() + "\n")
