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
    Faster Auto-Guinier using cumulative sums (O(1) per window).

    Scans all windows [i:j] with j>=i+min_points-1, computes weighted or
    unweighted linear regression of ln I vs q^2 via prefix sums. This avoids
    per-window lstsq/allocations and drastically reduces overhead.

    Returns RAW-like tuple:
        (rg, izero, rg_err, izero_err, qmin, qmax, qrg_min, qrg_max, idx_min, idx_max, r_sqr)
    Error estimates are left as 0.0 placeholders.
    """
    q = np.asarray(q, dtype=float)
    intensity = np.asarray(intensity, dtype=float)
    n = q.size
    if n < min_points:
        raise ValueError(f"Not enough points for Guinier fit (need >= {min_points}).")

    x = q * q                 # q^2
    y = np.log(intensity)             # ln I

    if sigma is not None:
        w = 1.0 / (np.asarray(sigma, dtype=float) ** 2)
    else:
        w = np.ones_like(y)

    # Prefix sums for O(1) window stats
    # We need: sum w, sum w*x, sum w*y, sum w*x^2, sum w*x*y, sum w*y^2
    W   = np.concatenate(([0.0], np.cumsum(w)))
    WX  = np.concatenate(([0.0], np.cumsum(w * x)))
    WY  = np.concatenate(([0.0], np.cumsum(w * y)))
    WXX = np.concatenate(([0.0], np.cumsum(w * x * x)))
    WXY = np.concatenate(([0.0], np.cumsum(w * x * y)))
    WYY = np.concatenate(([0.0], np.cumsum(w * y * y)))

    def window_sums(i, j):
        # inclusive indices i..j
        return (
            W[j+1]  - W[i],
            WX[j+1] - WX[i],
            WY[j+1] - WY[i],
            WXX[j+1]- WXX[i],
            WXY[j+1]- WXY[i],
            WYY[j+1]- WYY[i],
        )

    best = None  # (rg, I0, 0, 0, qmin, qmax, qrg_min, qrg_max, i, j, r2)

    for i in range(0, n - min_points + 1):
        for j in range(i + min_points - 1, n):
            wsum, wx, wy, wxx, wxy, wyy = window_sums(i, j)
            # Guard against degenerate windows
            denom = (wsum * wxx - wx * wx)
            if denom <= 0.0:
                continue

            # Weighted linear regression y = m x + b
            m = (wsum * wxy - wx * wy) / denom
            b = (wy - m * wx) / wsum
            if m >= 0.0:
                continue  # Guinier slope must be negative

            # Goodness-of-fit (weighted R^2)
            # SSE = sum w (y - (m x + b))^2 = sum w y^2 - 2m sum w xy - 2b sum w y + m^2 sum w x^2 + 2 m b sum w x + b^2 sum w
            sse = (
                wyy - 2.0 * m * wxy - 2.0 * b * wy + m * m * wxx + 2.0 * m * b * wx + b * b * wsum
            )
            ybar = wy / wsum
            sst = (wyy - wsum * ybar * ybar)
            if sst <= 0.0:
                continue
            r2 = 1.0 - (sse / sst)
            if r2 < r2_floor:
                continue

            rg = float(np.sqrt(-3.0 * m))
            qrg_min = float(q[i] * rg)
            qrg_max = float(q[j] * rg)
            if not (min_qrg <= qrg_min <= max_qrg and min_qrg <= qrg_max <= max_qrg):
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
                float(r2),
            )
            if best is None:
                best = candidate
            else:
                if candidate[-1] > best[-1]:
                    best = candidate
                elif np.isclose(candidate[-1], best[-1]):
                    curr_len = best[9] - best[8]
                    cand_len = candidate[9] - candidate[8]
                    if cand_len > curr_len or (cand_len == curr_len and candidate[4] < best[4]):
                        best = candidate

    if best is None:
        # Fallback: use the first feasible window of size min_points
        i, j = 0, min_points - 1
        wsum, wx, wy, wxx, wxy, wyy = window_sums(i, j)
        denom = (wsum * wxx - wx * wx)
        if denom <= 0.0:
            # degenerate; return a minimal default
            return (0.0, 0.0, 0.0, 0.0, float(q[0]), float(q[min_points-1]), 0.0, 0.0, 0, min_points-1, 0.0)
        m = (wsum * wxy - wx * wy) / denom
        b = (wy - m * wx) / wsum
        rg = float(np.sqrt(max(0.0, -3.0 * m)))
        r2 = 0.0
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
