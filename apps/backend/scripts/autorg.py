"""
Simple python jiffy to calculate the min and max Rg values
"""

import argparse
import json
import os
import sys

# import warnings

import bioxtasraw.RAWAPI as raw

os.environ["MPLCONFIGDIR"] = "/tmp/"


# Redirect all warnings to stderr
# warnings.filterwarnings("ignore", category=UserWarning, module="scipy")


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
        profiles = raw.load_profiles(file_path)
        gi_profile = profiles[0]
        guinier_results = raw.auto_guinier(gi_profile)
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
