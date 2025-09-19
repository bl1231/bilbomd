# tools/python/guinier.py
from __future__ import annotations
from typing import Dict
import numpy as np


def guinier_scan(
    q,
    intensity,
    sigma=None,
    *,
    min_points=10,
    qrg_min=0.30,
    qrg_max=1.30,
    r2_floor=0.95,
) -> Dict[str, float]:
    """
    Fast Guinier scan using prefix sums (O(1) per window).
    Returns dict: Rg, I0, qmin, qmax, i, j, r2, qrg_min, qrg_max.
    """
    q = np.asarray(q, dtype=float)
    intensity = np.asarray(intensity, dtype=float)
    n = q.size
    if n < min_points:
        raise ValueError(f"Not enough points for Guinier fit (need >= {min_points}).")

    x = q * q
    y = np.log(intensity)
    if sigma is not None:
        w = 1.0 / (np.asarray(sigma, dtype=float) ** 2)
    else:
        w = np.ones_like(y)

    W = np.concatenate(([0.0], np.cumsum(w)))
    WX = np.concatenate(([0.0], np.cumsum(w * x)))
    WY = np.concatenate(([0.0], np.cumsum(w * y)))
    WXX = np.concatenate(([0.0], np.cumsum(w * x * x)))
    WXY = np.concatenate(([0.0], np.cumsum(w * x * y)))
    WYY = np.concatenate(([0.0], np.cumsum(w * y * y)))

    def sums(i, j):
        return (
            W[j + 1] - W[i],
            WX[j + 1] - WX[i],
            WY[j + 1] - WY[i],
            WXX[j + 1] - WXX[i],
            WXY[j + 1] - WXY[i],
            WYY[j + 1] - WYY[i],
        )

    best = None
    for i in range(0, n - min_points + 1):
        for j in range(i + min_points - 1, n):
            wsum, wx, wy, wxx, wxy, wyy = sums(i, j)
            denom = wsum * wxx - wx * wx
            if denom <= 0:
                continue
            m = (wsum * wxy - wx * wy) / denom
            if m >= 0:
                continue
            b = (wy - m * wx) / wsum

            sse = (
                wyy
                - 2.0 * m * wxy
                - 2.0 * b * wy
                + m * m * wxx
                + 2.0 * m * b * wx
                + b * b * wsum
            )
            ybar = wy / wsum
            sst = wyy - wsum * ybar * ybar
            if sst <= 0:
                continue
            r2 = 1.0 - (sse / sst)
            if r2 < r2_floor:
                continue

            rg = float(np.sqrt(-3.0 * m))
            qrg_lo = float(q[i] * rg)
            qrg_hi = float(q[j] * rg)
            if not (qrg_min <= qrg_lo <= qrg_max and qrg_min <= qrg_hi <= qrg_max):
                continue

            cand = (
                rg,
                float(np.exp(b)),
                float(q[i]),
                float(q[j]),
                i,
                j,
                float(r2),
                qrg_lo,
                qrg_hi,
            )
            if (
                best is None
                or cand[6] > best[6]
                or (
                    np.isclose(cand[6], best[6])
                    and ((cand[5] - cand[4]) > (best[5] - best[4]) or cand[2] < best[2])
                )
            ):
                best = cand

    if best is None:
        i, j = 0, min_points - 1
        wsum, wx, wy, wxx, wxy, wyy = sums(i, j)
        denom = wsum * wxx - wx * wx
        if denom <= 0:
            return {
                "Rg": 0.0,
                "I0": 0.0,
                "qmin": float(q[i]),
                "qmax": float(q[j]),
                "i": i,
                "j": j,
                "r2": 0.0,
                "qrg_min": 0.0,
                "qrg_max": 0.0,
            }
        m = (wsum * wxy - wx * wy) / denom
        b = (wy - m * wx) / wsum
        rg = float(np.sqrt(max(0.0, -3.0 * m)))
        return {
            "Rg": rg,
            "I0": float(np.exp(b)),
            "qmin": float(q[i]),
            "qmax": float(q[j]),
            "i": i,
            "j": j,
            "r2": 0.0,
            "qrg_min": float(q[i] * rg),
            "qrg_max": float(q[j] * rg),
        }

    return {
        "Rg": best[0],
        "I0": best[1],
        "qmin": best[2],
        "qmax": best[3],
        "i": best[4],
        "j": best[5],
        "r2": best[6],
        "qrg_min": best[7],
        "qrg_max": best[8],
    }
