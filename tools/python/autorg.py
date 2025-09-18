"""
Simple python jiffy to calculate the min and max Rg values
"""

import argparse
import json
import os
import sys
import numpy as np
from saxs_utils import load_profile


def _auto_guinier(
    q, intensity, sigma=None, min_points=10, max_qrg=1.3, min_qrg=0.3, r2_floor=0.90
):
    """
    Auto-Guinier with sliding start/end, optional sigma-weighting.

    Returns RAW-like tuple:
        (rg, izero, rg_err, izero_err, qmin, qmax, qrg_min, qrg_max, idx_min, idx_max, r_sqr)
    Error estimates are left as 0.0 placeholders for now.
    """
    q = np.asarray(q, dtype=float)
    intensity = np.asarray(intensity, dtype=float)
    w = None
    if sigma is not None:
        sigma = np.asarray(sigma, dtype=float)
        w = 1.0 / (sigma**2)

    n = q.size
    if n < min_points:
        raise ValueError(f"Not enough points for Guinier fit (need >= {min_points}).")

    x_all = q**2
    y_all = np.log(intensity)

    def _linfit(x, y, w=None):
        if w is None:
            m, b = np.polyfit(x, y, 1)
            yhat = m * x + b
        else:
            # Weighted linear regression via normal equations
            W = np.diag(w)
            A = np.vstack([x, np.ones_like(x)]).T
            # Solve (A^T W A) beta = A^T W y
            ATA = A.T @ W @ A
            ATy = A.T @ W @ y
            beta = np.linalg.lstsq(ATA, ATy, rcond=None)[0]
            m, b = beta[0], beta[1]
            yhat = m * x + b
        # Weighted/Unweighted R^2
        if w is None:
            ss_res = float(np.sum((y - yhat) ** 2))
            ss_tot = float(np.sum((y - np.mean(y)) ** 2))
        else:
            ss_res = float(np.sum(w * (y - yhat) ** 2))
            ybar = float(np.sum(w * y) / np.sum(w))
            ss_tot = float(np.sum(w * (y - ybar) ** 2))
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
        return float(m), float(b), float(r2)

    best = None  # (rg, I0, 0, 0, qmin, qmax, qrg_min, qrg_max, i0, i1, r2)

    # Explore windows [i:j] with >= min_points
    for i in range(0, n - min_points + 1):
        for j in range(i + min_points - 1, n):
            x = x_all[i : j + 1]
            y = y_all[i : j + 1]
            ww = None if w is None else w[i : j + 1]

            try:
                m, b, r2 = _linfit(x, y, ww)
            except Exception:
                continue

            if m >= 0:  # must be negative slope
                continue

            rg = float(np.sqrt(-3.0 * m))
            qrg_min = float(q[i] * rg)
            qrg_max = float(q[j] * rg)

            # Guinier window constraints
            if not (min_qrg <= qrg_min <= max_qrg):
                continue
            if not (min_qrg <= qrg_max <= max_qrg):
                continue
            if r2 < r2_floor:
                continue

            candidate = (
                rg,
                float(np.exp(b)),
                0.0,
                0.0,
                float(q[i]),
                float(q[j]),
                qrg_min,
                qrg_max,
                i,
                j,
                r2,
            )

            if best is None:
                best = candidate
            else:
                # Prefer higher R^2; break ties by larger window, then lower qmin
                if candidate[-1] > best[-1]:
                    best = candidate
                elif np.isclose(candidate[-1], best[-1]):
                    curr_len = best[9] - best[8]
                    cand_len = candidate[9] - candidate[8]
                    if cand_len > curr_len or (
                        cand_len == curr_len and candidate[4] < best[4]
                    ):
                        best = candidate

    if best is None:
        # Fall back to the first feasible window without lower-bound constraint
        i, j = 0, min_points - 1
        m, b, r2 = _linfit(
            x_all[i : j + 1], y_all[i : j + 1], None if w is None else w[i : j + 1]
        )
        rg = float(np.sqrt(max(0.0, -3.0 * m)))
        best = (
            rg,
            float(np.exp(b)),
            0.0,
            0.0,
            float(q[i]),
            float(q[j]),
            float(q[i] * rg),
            float(q[j] * rg),
            i,
            j,
            r2,
        )

    return best


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
